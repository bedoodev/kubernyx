package kube

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"sigs.k8s.io/yaml"
)

func (c *Client) GetDeploymentResources(ctx context.Context, namespaces []string) ([]DeploymentResource, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]DeploymentResource, 0)
	for _, ns := range selectedNamespaces {
		deployments, err := c.clientset.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list deployments: %w", err)
		}

		for _, deployment := range deployments.Items {
			replicas := int32(1)
			if deployment.Spec.Replicas != nil {
				replicas = *deployment.Spec.Replicas
			}

			labels := make(map[string]string, len(deployment.Labels))
			for key, value := range deployment.Labels {
				labels[key] = value
			}
			annotations := make(map[string]string, len(deployment.Annotations))
			for key, value := range deployment.Annotations {
				annotations[key] = value
			}

			items = append(items, DeploymentResource{
				Name:          deployment.Name,
				Namespace:     deployment.Namespace,
				Pods:          fmt.Sprintf("%d/%d", deployment.Status.ReadyReplicas, replicas),
				Replicas:      replicas,
				Desired:       replicas,
				Current:       deployment.Status.Replicas,
				Ready:         deployment.Status.ReadyReplicas,
				UpToDate:      deployment.Status.UpdatedReplicas,
				Available:     deployment.Status.AvailableReplicas,
				NodeSelector:  formatNodeSelectorMap(deployment.Spec.Template.Spec.NodeSelector),
				Status:        deploymentStatusLabel(&deployment),
				CreatedAtUnix: deployment.CreationTimestamp.Time.Unix(),
				Age:           formatAge(time.Since(deployment.CreationTimestamp.Time)),
				Labels:        labels,
				Annotations:   annotations,
			})
		}
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Namespace != items[j].Namespace {
			return items[i].Namespace < items[j].Namespace
		}
		return items[i].Name < items[j].Name
	})

	return items, nil
}

func (c *Client) GetDeploymentDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("deployment name is required")
	}

	deployment, err := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get deployment: %w", err)
	}

	selectorString := metav1.FormatLabelSelector(deployment.Spec.Selector)
	podList, err := c.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selectorString,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list deployment pods: %w", err)
	}

	type podUsage struct {
		cpuMilli int64
		memBytes int64
	}
	usageByPod := make(map[string]podUsage)
	if c.metrics != nil {
		metrics, metricsErr := c.metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{})
		if metricsErr == nil {
			for _, metric := range metrics.Items {
				total := podUsage{}
				for _, container := range metric.Containers {
					total.cpuMilli += container.Usage.Cpu().MilliValue()
					total.memBytes += container.Usage.Memory().Value()
				}
				usageByPod[metric.Name] = total
			}
		}
	}

	pods := make([]DeploymentDetailPod, 0, len(podList.Items))
	statusByContainer := make(map[string]corev1.ContainerStatus)
	for _, pod := range podList.Items {
		readyContainers := int32(0)
		totalContainers := int32(len(pod.Status.ContainerStatuses))
		for _, status := range pod.Status.ContainerStatuses {
			if status.Ready {
				readyContainers++
			}
			current, exists := statusByContainer[status.Name]
			if !exists || (current.Ready == false && status.Ready) {
				statusByContainer[status.Name] = status
			}
		}

		cpu := "-"
		memory := "-"
		if usage, ok := usageByPod[pod.Name]; ok {
			cpu = formatMilliCPU(usage.cpuMilli)
			memory = formatBytes(usage.memBytes)
		}

		pods = append(pods, DeploymentDetailPod{
			Name:      pod.Name,
			Node:      stringOrDefault(pod.Spec.NodeName, "-"),
			Namespace: pod.Namespace,
			Ready:     fmt.Sprintf("%d/%d", readyContainers, totalContainers),
			CPU:       cpu,
			Memory:    memory,
			Status:    podStatusLabel(&pod),
		})
	}
	sort.SliceStable(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })

	containers := make([]PodDetailContainer, 0, len(deployment.Spec.Template.Spec.Containers))
	for _, container := range deployment.Spec.Template.Spec.Containers {
		status, hasStatus := statusByContainer[container.Name]
		containers = append(containers, buildPodDetailContainer(container, status, hasStatus))
	}

	conditions := make([]PodDetailCondition, 0, len(deployment.Status.Conditions))
	for _, condition := range deployment.Status.Conditions {
		message := strings.TrimSpace(condition.Message)
		if message == "" {
			message = strings.TrimSpace(condition.Reason)
		}
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: stringOrDefault(message, "-"),
		})
	}

	labels := make(map[string]string, len(deployment.Labels))
	for key, value := range deployment.Labels {
		labels[key] = value
	}

	annotations := make(map[string]string, len(deployment.Annotations))
	for key, value := range deployment.Annotations {
		annotations[key] = value
	}

	selector := make(map[string]string)
	if deployment.Spec.Selector != nil {
		for key, value := range deployment.Spec.Selector.MatchLabels {
			selector[key] = value
		}
	}

	strategyType := "-"
	if strings.TrimSpace(string(deployment.Spec.Strategy.Type)) != "" {
		strategyType = string(deployment.Spec.Strategy.Type)
	}

	revisions, revisionErr := c.listDeploymentRevisions(ctx, deployment)
	if revisionErr != nil {
		revisions = nil
	}

	events := c.listDeploymentEvents(ctx, deployment)
	manifest := "-"
	manifestDeployment := deployment.DeepCopy()
	manifestDeployment.ManagedFields = nil
	if manifestBytes, err := yaml.Marshal(manifestDeployment); err == nil {
		manifest = strings.TrimRight(string(manifestBytes), "\n")
	}

	replicas := int32(1)
	if deployment.Spec.Replicas != nil {
		replicas = *deployment.Spec.Replicas
	}

	return &DeploymentDetail{
		Name:            deployment.Name,
		Namespace:       deployment.Namespace,
		Status:          deploymentStatusLabel(deployment),
		Replicas:        replicas,
		Current:         deployment.Status.Replicas,
		Ready:           deployment.Status.ReadyReplicas,
		Updated:         deployment.Status.UpdatedReplicas,
		Available:       deployment.Status.AvailableReplicas,
		Unavailable:     deployment.Status.UnavailableReplicas,
		Age:             formatAge(time.Since(deployment.CreationTimestamp.Time)),
		Created:         deployment.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(deployment.UID), "-"),
		ResourceVersion: stringOrDefault(deployment.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selector,
		NodeSelector:    podTemplateNodeSelectorMap(deployment.Spec.Template),
		StrategyType:    strategyType,
		Conditions:      conditions,
		Tolerations:     collectDeploymentTolerations(deployment),
		NodeAffinities:  collectDeploymentNodeAffinities(deployment),
		PodAntiAffinity: collectDeploymentPodAntiAffinities(deployment),
		Containers:      containers,
		Revisions:       revisions,
		Pods:            pods,
		Events:          events,
		Manifest:        manifest,
		ScaleSupported:  true,
	}, nil
}

func (c *Client) DeleteDeployment(ctx context.Context, namespace string, name string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("deployment name is required")
	}

	if err := c.clientset.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("failed to delete deployment: %w", err)
	}
	return nil
}

func (c *Client) GetDeploymentLogs(ctx context.Context, namespace string, name string, tailLines int64) ([]DeploymentLogLine, error) {
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("deployment name is required")
	}

	if tailLines <= 0 {
		tailLines = 1000
	}

	deployment, err := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get deployment: %w", err)
	}

	selectorString := metav1.FormatLabelSelector(deployment.Spec.Selector)
	pods, err := c.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selectorString,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list deployment pods: %w", err)
	}

	sort.SliceStable(pods.Items, func(i, j int) bool { return pods.Items[i].Name < pods.Items[j].Name })

	type sortableDeploymentLogLine struct {
		line  DeploymentLogLine
		order int
	}
	logs := make([]sortableDeploymentLogLine, 0)
	order := 0

	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			options := &corev1.PodLogOptions{
				Container:  container.Name,
				Timestamps: true,
				TailLines:  &tailLines,
			}
			rawLogs, err := c.clientset.CoreV1().Pods(namespace).GetLogs(pod.Name, options).DoRaw(ctx)
			if err != nil {
				continue
			}

			normalized := strings.ReplaceAll(string(rawLogs), "\r\n", "\n")
			for _, row := range strings.Split(normalized, "\n") {
				message := strings.TrimRight(row, "\r")
				if strings.TrimSpace(message) == "" {
					continue
				}
				createdAt, createdAtUnix, content := parsePodLogLine(message)
				logs = append(logs, sortableDeploymentLogLine{
					line: DeploymentLogLine{
						PodName:       pod.Name,
						Container:     container.Name,
						CreatedAt:     createdAt,
						CreatedAtUnix: createdAtUnix,
						Message:       content,
					},
					order: order,
				})
				order++
			}
		}
	}

	sort.SliceStable(logs, func(i, j int) bool {
		left := logs[i]
		right := logs[j]

		switch {
		case left.line.CreatedAtUnix == 0 && right.line.CreatedAtUnix == 0:
			return left.order < right.order
		case left.line.CreatedAtUnix == 0:
			return false
		case right.line.CreatedAtUnix == 0:
			return true
		case left.line.CreatedAtUnix == right.line.CreatedAtUnix:
			return left.order < right.order
		default:
			return left.line.CreatedAtUnix < right.line.CreatedAtUnix
		}
	})

	result := make([]DeploymentLogLine, 0, len(logs))
	for _, item := range logs {
		result = append(result, item.line)
	}
	return result, nil
}

func (c *Client) UpdateDeploymentManifest(ctx context.Context, namespace string, name string, manifest string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("deployment name is required")
	}
	if strings.TrimSpace(manifest) == "" {
		return fmt.Errorf("manifest is required")
	}

	var deployment appsv1.Deployment
	if err := yaml.Unmarshal([]byte(manifest), &deployment); err != nil {
		return fmt.Errorf("failed to parse deployment manifest: %w", err)
	}

	deployment.Name = name
	deployment.Namespace = namespace

	current, err := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get existing deployment: %w", err)
	}

	if strings.TrimSpace(deployment.ResourceVersion) == "" {
		deployment.ResourceVersion = current.ResourceVersion
	}
	deployment.ManagedFields = nil
	if deployment.Spec.Selector == nil {
		deployment.Spec.Selector = current.Spec.Selector
	}
	if len(deployment.Spec.Template.Spec.Containers) == 0 {
		return fmt.Errorf("deployment manifest must define at least one container")
	}

	if _, err := c.clientset.AppsV1().Deployments(namespace).Update(ctx, &deployment, metav1.UpdateOptions{}); err != nil {
		return fmt.Errorf("failed to update deployment: %w", err)
	}
	return nil
}

func (c *Client) ScaleDeployment(ctx context.Context, namespace string, name string, replicas int32) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("deployment name is required")
	}
	if replicas < 0 {
		return fmt.Errorf("replicas must be >= 0")
	}

	deployment, err := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get deployment: %w", err)
	}
	deployment.Spec.Replicas = &replicas
	if _, err := c.clientset.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{}); err != nil {
		return fmt.Errorf("failed to scale deployment: %w", err)
	}
	return nil
}

func deploymentStatusLabel(deployment *appsv1.Deployment) string {
	desired := int32(1)
	if deployment.Spec.Replicas != nil {
		desired = *deployment.Spec.Replicas
	}

	for _, condition := range deployment.Status.Conditions {
		if condition.Type == appsv1.DeploymentProgressing && condition.Status == corev1.ConditionFalse && condition.Reason == "ProgressDeadlineExceeded" {
			return "Failed"
		}
	}

	if desired == 0 {
		return "ScaledDown"
	}
	if deployment.Status.AvailableReplicas >= desired && deployment.Status.UpdatedReplicas >= desired {
		return "Running"
	}
	if deployment.Status.UpdatedReplicas > 0 || deployment.Status.ReadyReplicas > 0 {
		return "Updating"
	}
	return "Pending"
}

func (c *Client) listDeploymentRevisions(ctx context.Context, deployment *appsv1.Deployment) ([]DeploymentDetailRevision, error) {
	selectorString := metav1.FormatLabelSelector(deployment.Spec.Selector)
	replicaSets, err := c.clientset.AppsV1().ReplicaSets(deployment.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selectorString,
	})
	if err != nil {
		return nil, err
	}

	revisions := make([]DeploymentDetailRevision, 0, len(replicaSets.Items))
	for _, replicaSet := range replicaSets.Items {
		owned := false
		for _, owner := range replicaSet.OwnerReferences {
			if owner.Kind == "Deployment" && owner.Name == deployment.Name && owner.Controller != nil && *owner.Controller {
				owned = true
				break
			}
		}
		if !owned {
			continue
		}

		revision := strings.TrimSpace(replicaSet.Annotations["deployment.kubernetes.io/revision"])
		if revision == "" {
			revision = "-"
		}

		desired := int32(0)
		if replicaSet.Spec.Replicas != nil {
			desired = *replicaSet.Spec.Replicas
		}
		revisions = append(revisions, DeploymentDetailRevision{
			Revision:   revision,
			ReplicaSet: replicaSet.Name,
			Replicas:   desired,
			Ready:      replicaSet.Status.ReadyReplicas,
			Age:        formatAge(time.Since(replicaSet.CreationTimestamp.Time)),
		})
	}

	sort.SliceStable(revisions, func(i, j int) bool {
		left := revisions[i]
		right := revisions[j]
		leftRevision, leftErr := strconv.Atoi(left.Revision)
		rightRevision, rightErr := strconv.Atoi(right.Revision)
		switch {
		case leftErr == nil && rightErr == nil:
			return leftRevision > rightRevision
		case leftErr == nil:
			return true
		case rightErr == nil:
			return false
		default:
			return left.ReplicaSet < right.ReplicaSet
		}
	})

	return revisions, nil
}

func (c *Client) listDeploymentEvents(ctx context.Context, deployment *appsv1.Deployment) []PodDetailEvent {
	fieldSelector := fields.Set{
		"involvedObject.kind": "Deployment",
		"involvedObject.name": deployment.Name,
		"involvedObject.uid":  string(deployment.UID),
	}.AsSelector().String()

	list, err := c.clientset.CoreV1().Events(deployment.Namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil
	}

	sort.SliceStable(list.Items, func(i, j int) bool {
		return podEventTimestamp(list.Items[i]).After(podEventTimestamp(list.Items[j]))
	})

	events := make([]PodDetailEvent, 0, len(list.Items))
	for _, event := range list.Items {
		age := "-"
		if eventTime := podEventTimestamp(event); !eventTime.IsZero() {
			age = formatAge(time.Since(eventTime))
		}

		events = append(events, PodDetailEvent{
			Type:    stringOrDefault(event.Type, "-"),
			Reason:  stringOrDefault(event.Reason, "-"),
			Message: stringOrDefault(event.Message, "-"),
			Count:   event.Count,
			Age:     age,
		})
	}

	return events
}

func collectDeploymentTolerations(deployment *appsv1.Deployment) []string {
	tolerations := deployment.Spec.Template.Spec.Tolerations
	items := make([]string, 0, len(tolerations))
	for _, item := range tolerations {
		parts := make([]string, 0, 5)
		if item.Key != "" {
			parts = append(parts, fmt.Sprintf("key=%s", item.Key))
		}
		if item.Operator != "" {
			parts = append(parts, fmt.Sprintf("operator=%s", item.Operator))
		}
		if item.Value != "" {
			parts = append(parts, fmt.Sprintf("value=%s", item.Value))
		}
		if item.Effect != "" {
			parts = append(parts, fmt.Sprintf("effect=%s", item.Effect))
		}
		if item.TolerationSeconds != nil {
			parts = append(parts, fmt.Sprintf("seconds=%d", *item.TolerationSeconds))
		}
		if len(parts) == 0 {
			parts = append(parts, "-")
		}
		items = append(items, strings.Join(parts, ", "))
	}
	return items
}

func collectDeploymentNodeAffinities(deployment *appsv1.Deployment) []string {
	affinity := deployment.Spec.Template.Spec.Affinity
	if affinity == nil || affinity.NodeAffinity == nil {
		return nil
	}

	result := make([]string, 0)
	nodeAffinity := affinity.NodeAffinity
	if nodeAffinity.RequiredDuringSchedulingIgnoredDuringExecution != nil {
		for _, term := range nodeAffinity.RequiredDuringSchedulingIgnoredDuringExecution.NodeSelectorTerms {
			for _, expr := range term.MatchExpressions {
				values := "-"
				if len(expr.Values) > 0 {
					values = strings.Join(expr.Values, ",")
				}
				result = append(result, fmt.Sprintf("required: %s %s [%s]", expr.Key, expr.Operator, values))
			}
		}
	}

	for _, pref := range nodeAffinity.PreferredDuringSchedulingIgnoredDuringExecution {
		for _, expr := range pref.Preference.MatchExpressions {
			values := "-"
			if len(expr.Values) > 0 {
				values = strings.Join(expr.Values, ",")
			}
			result = append(result, fmt.Sprintf("preferred(%d): %s %s [%s]", pref.Weight, expr.Key, expr.Operator, values))
		}
	}

	return result
}

func collectDeploymentPodAntiAffinities(deployment *appsv1.Deployment) []string {
	affinity := deployment.Spec.Template.Spec.Affinity
	if affinity == nil || affinity.PodAntiAffinity == nil {
		return nil
	}

	result := make([]string, 0)
	podAnti := affinity.PodAntiAffinity
	for _, term := range podAnti.RequiredDuringSchedulingIgnoredDuringExecution {
		selector := metav1.FormatLabelSelector(term.LabelSelector)
		if strings.TrimSpace(selector) == "" {
			selector = "-"
		}
		result = append(result, fmt.Sprintf("required: selector=%s topology=%s", selector, stringOrDefault(term.TopologyKey, "-")))
	}

	for _, term := range podAnti.PreferredDuringSchedulingIgnoredDuringExecution {
		selector := metav1.FormatLabelSelector(term.PodAffinityTerm.LabelSelector)
		if strings.TrimSpace(selector) == "" {
			selector = "-"
		}
		result = append(result, fmt.Sprintf("preferred(%d): selector=%s topology=%s", term.Weight, selector, stringOrDefault(term.PodAffinityTerm.TopologyKey, "-")))
	}

	return result
}
