package kube

import (
	"context"
	"encoding/base64"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	cronexpr "github.com/robfig/cron/v3"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"sigs.k8s.io/yaml"
)

type workloadControllerKind string

const (
	workloadControllerDeployment workloadControllerKind = "deployment"
	workloadControllerDaemonSet  workloadControllerKind = "daemonset"
	workloadControllerStateful   workloadControllerKind = "statefulset"
	workloadControllerReplica    workloadControllerKind = "replicaset"
	workloadControllerJob        workloadControllerKind = "job"
	workloadControllerCronJob    workloadControllerKind = "cronjob"
	workloadControllerConfigMap  workloadControllerKind = "configmap"
	workloadControllerSecret     workloadControllerKind = "secret"
	workloadControllerService    workloadControllerKind = "service"
	workloadControllerIngress    workloadControllerKind = "ingress"
)

func parseWorkloadControllerKind(kind string) (workloadControllerKind, error) {
	normalized := strings.ToLower(strings.TrimSpace(kind))
	switch normalized {
	case string(workloadControllerDeployment):
		return workloadControllerDeployment, nil
	case "deployments":
		return workloadControllerDeployment, nil
	case string(workloadControllerDaemonSet):
		return workloadControllerDaemonSet, nil
	case "daemon-set", "daemon-sets", "daemonsets":
		return workloadControllerDaemonSet, nil
	case string(workloadControllerStateful):
		return workloadControllerStateful, nil
	case "stateful-set", "stateful-sets", "statefulsets":
		return workloadControllerStateful, nil
	case string(workloadControllerReplica):
		return workloadControllerReplica, nil
	case "replica-set", "replica-sets", "replicasets":
		return workloadControllerReplica, nil
	case string(workloadControllerJob):
		return workloadControllerJob, nil
	case "jobs":
		return workloadControllerJob, nil
	case string(workloadControllerCronJob):
		return workloadControllerCronJob, nil
	case "cron-job", "cron-jobs", "cronjobs":
		return workloadControllerCronJob, nil
	case string(workloadControllerConfigMap):
		return workloadControllerConfigMap, nil
	case "config-map", "config-maps", "configmaps":
		return workloadControllerConfigMap, nil
	case string(workloadControllerSecret):
		return workloadControllerSecret, nil
	case "secrets":
		return workloadControllerSecret, nil
	case string(workloadControllerService):
		return workloadControllerService, nil
	case "services":
		return workloadControllerService, nil
	case string(workloadControllerIngress):
		return workloadControllerIngress, nil
	case "ingresses":
		return workloadControllerIngress, nil
	default:
		return "", fmt.Errorf("unsupported workload kind %q", kind)
	}
}

func workloadStatusFromPhase(phase string) string {
	switch phase {
	case workloadPhaseRunning:
		return "Running"
	case workloadPhaseFailed:
		return "Failed"
	case workloadPhaseSucceeded:
		return "Succeeded"
	default:
		return "Pending"
	}
}

func copyLabelsAndAnnotations(labels map[string]string, annotations map[string]string) (map[string]string, map[string]string) {
	labelsCopy := make(map[string]string, len(labels))
	for key, value := range labels {
		labelsCopy[key] = value
	}

	annotationsCopy := make(map[string]string, len(annotations))
	for key, value := range annotations {
		annotationsCopy[key] = value
	}

	return labelsCopy, annotationsCopy
}

func replicasFromPointer(value *int32, defaultValue int32) int32 {
	if value == nil {
		return defaultValue
	}
	return *value
}

func selectorMap(selector *metav1.LabelSelector) map[string]string {
	result := make(map[string]string)
	if selector == nil {
		return result
	}
	for key, value := range selector.MatchLabels {
		result[key] = value
	}
	return result
}

func podTemplateNodeSelectorMap(template corev1.PodTemplateSpec) map[string]string {
	result := make(map[string]string)
	for key, value := range template.Spec.NodeSelector {
		result[key] = value
	}
	return result
}

func formatNodeSelectorMap(nodeSelector map[string]string) string {
	if len(nodeSelector) == 0 {
		return "-"
	}
	keys := make([]string, 0, len(nodeSelector))
	for key := range nodeSelector {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", key, nodeSelector[key]))
	}
	return strings.Join(parts, ", ")
}

func podTemplateTolerations(template corev1.PodTemplateSpec) []string {
	tolerations := template.Spec.Tolerations
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

func podTemplateNodeAffinities(template corev1.PodTemplateSpec) []string {
	affinity := template.Spec.Affinity
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

func podTemplatePodAntiAffinities(template corev1.PodTemplateSpec) []string {
	affinity := template.Spec.Affinity
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

func (c *Client) listPodsBySelector(ctx context.Context, namespace string, selector string) ([]corev1.Pod, error) {
	if strings.TrimSpace(selector) == "" {
		return []corev1.Pod{}, nil
	}
	list, err := c.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selector,
	})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func (c *Client) buildPodsAndContainerStatuses(ctx context.Context, namespace string, pods []corev1.Pod) ([]DeploymentDetailPod, map[string]corev1.ContainerStatus) {
	type podUsage struct {
		cpuMilli int64
		memBytes int64
	}

	usageByPod := make(map[string]podUsage)
	if c.metrics != nil {
		metrics, err := c.metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{})
		if err == nil {
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

	sort.SliceStable(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })

	statusByContainer := make(map[string]corev1.ContainerStatus)
	result := make([]DeploymentDetailPod, 0, len(pods))

	for _, pod := range pods {
		readyContainers := int32(0)
		totalContainers := int32(len(pod.Status.ContainerStatuses))
		for _, status := range pod.Status.ContainerStatuses {
			if status.Ready {
				readyContainers++
			}
			current, exists := statusByContainer[status.Name]
			if !exists || (!current.Ready && status.Ready) {
				statusByContainer[status.Name] = status
			}
		}

		cpu := "-"
		memory := "-"
		if usage, ok := usageByPod[pod.Name]; ok {
			cpu = formatMilliCPU(usage.cpuMilli)
			memory = formatBytes(usage.memBytes)
		}

		result = append(result, DeploymentDetailPod{
			Name:      pod.Name,
			Node:      stringOrDefault(pod.Spec.NodeName, "-"),
			Namespace: pod.Namespace,
			Ready:     fmt.Sprintf("%d/%d", readyContainers, totalContainers),
			CPU:       cpu,
			Memory:    memory,
			Status:    podStatusLabel(&pod),
		})
	}

	return result, statusByContainer
}

func containersFromTemplate(template corev1.PodTemplateSpec, statusByContainer map[string]corev1.ContainerStatus) []PodDetailContainer {
	containers := make([]PodDetailContainer, 0, len(template.Spec.Containers))
	for _, container := range template.Spec.Containers {
		status, hasStatus := statusByContainer[container.Name]
		containers = append(containers, buildPodDetailContainer(container, status, hasStatus))
	}
	return containers
}

func objectEvents(ctx context.Context, c *Client, namespace string, kind string, name string, uid string) []PodDetailEvent {
	fieldSelector := fields.Set{
		"involvedObject.kind": kind,
		"involvedObject.name": name,
		"involvedObject.uid":  uid,
	}.AsSelector().String()

	list, err := c.clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
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

func conditionMessage(message string, reason string) string {
	trimmed := strings.TrimSpace(message)
	if trimmed != "" {
		return trimmed
	}
	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason != "" {
		return trimmedReason
	}
	return "-"
}

func int32Max(value int32, minimum int32) int32 {
	if value < minimum {
		return minimum
	}
	return value
}

func configMapDataMap(item *corev1.ConfigMap) map[string]string {
	result := make(map[string]string, len(item.Data)+len(item.BinaryData))
	for key, value := range item.Data {
		result[key] = value
	}
	for key, value := range item.BinaryData {
		result[key] = base64.StdEncoding.EncodeToString(value)
	}
	return result
}

func secretDataMap(item *corev1.Secret) map[string]string {
	result := make(map[string]string, len(item.Data)+len(item.StringData))
	for key, value := range item.StringData {
		result[key] = value
	}
	for key, value := range item.Data {
		if utf8.Valid(value) {
			result[key] = string(value)
		} else {
			result[key] = base64.StdEncoding.EncodeToString(value)
		}
	}
	return result
}

func (c *Client) listCronJobsOwnedJobs(ctx context.Context, namespace string, cronJob *batchv1.CronJob) ([]batchv1.Job, error) {
	jobs, err := c.clientset.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	result := make([]batchv1.Job, 0)
	for _, job := range jobs.Items {
		owned := false
		for _, owner := range job.OwnerReferences {
			if owner.Kind == "CronJob" && owner.Name == cronJob.Name && owner.UID == cronJob.UID {
				owned = true
				break
			}
		}
		if owned {
			result = append(result, job)
		}
	}

	sort.SliceStable(result, func(i, j int) bool {
		return result[i].CreationTimestamp.Time.After(result[j].CreationTimestamp.Time)
	})

	return result, nil
}

func (c *Client) listPodsForJob(ctx context.Context, namespace string, job *batchv1.Job) ([]corev1.Pod, error) {
	selector := metav1.FormatLabelSelector(job.Spec.Selector)
	if strings.TrimSpace(selector) == "" {
		selector = "job-name=" + job.Name
	}
	return c.listPodsBySelector(ctx, namespace, selector)
}

func mergePods(podSets ...[]corev1.Pod) []corev1.Pod {
	result := make([]corev1.Pod, 0)
	seen := make(map[string]struct{})
	for _, pods := range podSets {
		for _, pod := range pods {
			key := pod.Namespace + "/" + pod.Name
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			result = append(result, pod)
		}
	}
	return result
}

func (c *Client) collectLogsFromPods(ctx context.Context, namespace string, pods []corev1.Pod, tailLines int64) []DeploymentLogLine {
	sort.SliceStable(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })

	type sortableLog struct {
		line  DeploymentLogLine
		order int
	}
	logs := make([]sortableLog, 0)
	order := 0

	for _, pod := range pods {
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
				logs = append(logs, sortableLog{
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
	for _, entry := range logs {
		result = append(result, entry.line)
	}
	return result
}

func (c *Client) GetWorkloadResources(ctx context.Context, kind string, namespaces []string) ([]DeploymentResource, error) {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return nil, err
	}

	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]DeploymentResource, 0)
	for _, ns := range selectedNamespaces {
		switch controllerKind {
		case workloadControllerDeployment:
			return c.GetDeploymentResources(ctx, selectedNamespaces)
		case workloadControllerDaemonSet:
			list, listErr := c.clientset.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list daemon sets: %w", listErr)
			}
			for _, item := range list.Items {
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d/%d", item.Status.NumberReady, item.Status.DesiredNumberScheduled),
					Replicas:      item.Status.DesiredNumberScheduled,
					Desired:       item.Status.DesiredNumberScheduled,
					Current:       item.Status.CurrentNumberScheduled,
					Ready:         item.Status.NumberReady,
					UpToDate:      item.Status.UpdatedNumberScheduled,
					Available:     item.Status.NumberAvailable,
					NodeSelector:  formatNodeSelectorMap(item.Spec.Template.Spec.NodeSelector),
					Status:        workloadStatusFromPhase(classifyDaemonSet(item)),
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerStateful:
			list, listErr := c.clientset.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list stateful sets: %w", listErr)
			}
			for _, item := range list.Items {
				replicas := replicasFromPointer(item.Spec.Replicas, 1)
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d/%d", item.Status.ReadyReplicas, replicas),
					Replicas:      replicas,
					Desired:       replicas,
					Current:       item.Status.CurrentReplicas,
					Ready:         item.Status.ReadyReplicas,
					UpToDate:      item.Status.UpdatedReplicas,
					Available:     item.Status.ReadyReplicas,
					NodeSelector:  formatNodeSelectorMap(item.Spec.Template.Spec.NodeSelector),
					Status:        workloadStatusFromPhase(classifyStatefulSet(item)),
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerReplica:
			list, listErr := c.clientset.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list replica sets: %w", listErr)
			}
			for _, item := range list.Items {
				replicas := replicasFromPointer(item.Spec.Replicas, 1)
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d/%d", item.Status.ReadyReplicas, replicas),
					Replicas:      replicas,
					Desired:       replicas,
					Current:       item.Status.Replicas,
					Ready:         item.Status.ReadyReplicas,
					UpToDate:      item.Status.Replicas,
					Available:     item.Status.ReadyReplicas,
					NodeSelector:  formatNodeSelectorMap(item.Spec.Template.Spec.NodeSelector),
					Status:        workloadStatusFromPhase(classifyReplicaSet(item)),
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerJob:
			list, listErr := c.clientset.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list jobs: %w", listErr)
			}
			for _, item := range list.Items {
				parallelism := replicasFromPointer(item.Spec.Parallelism, 1)
				completionsTarget := int32(1)
				if item.Spec.Completions != nil {
					completionsTarget = *item.Spec.Completions
				}
				completionsSummary := fmt.Sprintf("%d/%d", item.Status.Succeeded, completionsTarget)
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d/%d", item.Status.Succeeded, completionsTarget),
					Replicas:      parallelism,
					Desired:       parallelism,
					Current:       item.Status.Active,
					Ready:         int32(item.Status.Succeeded),
					UpToDate:      int32(item.Status.Succeeded),
					Available:     int32(item.Status.Succeeded),
					NodeSelector:  formatNodeSelectorMap(item.Spec.Template.Spec.NodeSelector),
					Completions:   completionsSummary,
					Conditions:    jobConditionsSummary(&item),
					Status:        jobStatusLabel(&item),
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerCronJob:
			list, listErr := c.clientset.BatchV1().CronJobs(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list cronjobs: %w", listErr)
			}
			for _, item := range list.Items {
				active := int32(len(item.Status.Active))
				suspended := item.Spec.Suspend != nil && *item.Spec.Suspend
				nextSchedule := cronJobNextSchedule(item.Spec.Schedule, item.Spec.TimeZone)
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d/-", active),
					Replicas:      active,
					Desired:       active,
					Current:       active,
					Ready:         active,
					UpToDate:      active,
					Available:     active,
					NodeSelector:  formatNodeSelectorMap(item.Spec.JobTemplate.Spec.Template.Spec.NodeSelector),
					Schedule:      stringOrDefault(item.Spec.Schedule, "-"),
					Suspend:       map[bool]string{true: "Yes", false: "No"}[suspended],
					Active:        active,
					Last:          formatMetaTime(item.Status.LastScheduleTime),
					Next:          nextSchedule,
					Status:        cronJobStatusLabel(&item),
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerConfigMap:
			list, listErr := c.clientset.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list config maps: %w", listErr)
			}
			for _, item := range list.Items {
				keysCount := len(item.Data) + len(item.BinaryData)
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d", keysCount),
					Replicas:      int32(keysCount),
					Status:        "ConfigMap",
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerSecret:
			list, listErr := c.clientset.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				return nil, fmt.Errorf("failed to list secrets: %w", listErr)
			}
			for _, item := range list.Items {
				keysCount := len(item.Data) + len(item.StringData)
				labels, annotations := copyLabelsAndAnnotations(item.Labels, item.Annotations)
				items = append(items, DeploymentResource{
					Name:          item.Name,
					Namespace:     item.Namespace,
					Pods:          fmt.Sprintf("%d", keysCount),
					Replicas:      int32(keysCount),
					Status:        stringOrDefault(string(item.Type), "Opaque"),
					CreatedAtUnix: item.CreationTimestamp.Time.Unix(),
					Age:           formatAge(time.Since(item.CreationTimestamp.Time)),
					Labels:        labels,
					Annotations:   annotations,
				})
			}
		case workloadControllerService:
			return c.GetServiceResources(ctx, selectedNamespaces)
		case workloadControllerIngress:
			return c.GetIngressResources(ctx, selectedNamespaces)
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

func (c *Client) GetWorkloadDetail(ctx context.Context, kind string, namespace string, name string) (*DeploymentDetail, error) {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("resource name is required")
	}

	switch controllerKind {
	case workloadControllerDeployment:
		return c.GetDeploymentDetail(ctx, namespace, name)
	case workloadControllerDaemonSet:
		return c.getDaemonSetDetail(ctx, namespace, name)
	case workloadControllerStateful:
		return c.getStatefulSetDetail(ctx, namespace, name)
	case workloadControllerReplica:
		return c.getReplicaSetDetail(ctx, namespace, name)
	case workloadControllerJob:
		return c.getJobDetail(ctx, namespace, name)
	case workloadControllerCronJob:
		return c.getCronJobDetail(ctx, namespace, name)
	case workloadControllerConfigMap:
		return c.getConfigMapDetail(ctx, namespace, name)
	case workloadControllerSecret:
		return c.getSecretDetail(ctx, namespace, name)
	case workloadControllerService:
		return c.GetServiceDetail(ctx, namespace, name)
	case workloadControllerIngress:
		return c.GetIngressDetail(ctx, namespace, name)
	default:
		return nil, fmt.Errorf("unsupported workload kind %q", kind)
	}
}

func (c *Client) GetWorkloadLogs(ctx context.Context, kind string, namespace string, name string, tailLines int64) ([]DeploymentLogLine, error) {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("resource name is required")
	}
	if tailLines <= 0 {
		tailLines = 1000
	}

	switch controllerKind {
	case workloadControllerDeployment:
		return c.GetDeploymentLogs(ctx, namespace, name, tailLines)
	case workloadControllerDaemonSet:
		ds, getErr := c.clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return nil, fmt.Errorf("failed to get daemon set: %w", getErr)
		}
		pods, listErr := c.listPodsBySelector(ctx, namespace, metav1.FormatLabelSelector(ds.Spec.Selector))
		if listErr != nil {
			return nil, fmt.Errorf("failed to list daemon set pods: %w", listErr)
		}
		return c.collectLogsFromPods(ctx, namespace, pods, tailLines), nil
	case workloadControllerStateful:
		ss, getErr := c.clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return nil, fmt.Errorf("failed to get stateful set: %w", getErr)
		}
		pods, listErr := c.listPodsBySelector(ctx, namespace, metav1.FormatLabelSelector(ss.Spec.Selector))
		if listErr != nil {
			return nil, fmt.Errorf("failed to list stateful set pods: %w", listErr)
		}
		return c.collectLogsFromPods(ctx, namespace, pods, tailLines), nil
	case workloadControllerReplica:
		rs, getErr := c.clientset.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return nil, fmt.Errorf("failed to get replica set: %w", getErr)
		}
		pods, listErr := c.listPodsBySelector(ctx, namespace, metav1.FormatLabelSelector(rs.Spec.Selector))
		if listErr != nil {
			return nil, fmt.Errorf("failed to list replica set pods: %w", listErr)
		}
		return c.collectLogsFromPods(ctx, namespace, pods, tailLines), nil
	case workloadControllerJob:
		job, getErr := c.clientset.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return nil, fmt.Errorf("failed to get job: %w", getErr)
		}
		pods, listErr := c.listPodsForJob(ctx, namespace, job)
		if listErr != nil {
			return nil, fmt.Errorf("failed to list job pods: %w", listErr)
		}
		return c.collectLogsFromPods(ctx, namespace, pods, tailLines), nil
	case workloadControllerCronJob:
		cronJob, getErr := c.clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return nil, fmt.Errorf("failed to get cronjob: %w", getErr)
		}
		ownedJobs, listErr := c.listCronJobsOwnedJobs(ctx, namespace, cronJob)
		if listErr != nil {
			return nil, fmt.Errorf("failed to list cronjob jobs: %w", listErr)
		}
		podGroups := make([][]corev1.Pod, 0)
		for index, job := range ownedJobs {
			if index >= 5 {
				break
			}
			pods, podErr := c.listPodsForJob(ctx, namespace, &job)
			if podErr != nil {
				continue
			}
			podGroups = append(podGroups, pods)
		}
		return c.collectLogsFromPods(ctx, namespace, mergePods(podGroups...), tailLines), nil
	default:
		return []DeploymentLogLine{}, nil
	}
}

func (c *Client) UpdateWorkloadManifest(ctx context.Context, kind string, namespace string, name string, manifest string) error {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return err
	}
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("resource name is required")
	}
	if strings.TrimSpace(manifest) == "" {
		return fmt.Errorf("manifest is required")
	}

	switch controllerKind {
	case workloadControllerDeployment:
		return c.UpdateDeploymentManifest(ctx, namespace, name, manifest)
	case workloadControllerDaemonSet:
		var daemonSet appsv1.DaemonSet
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &daemonSet); unmarshalErr != nil {
			return fmt.Errorf("failed to parse daemon set manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing daemon set: %w", getErr)
		}
		daemonSet.Name = name
		daemonSet.Namespace = namespace
		if strings.TrimSpace(daemonSet.ResourceVersion) == "" {
			daemonSet.ResourceVersion = current.ResourceVersion
		}
		daemonSet.ManagedFields = nil
		if daemonSet.Spec.Selector == nil {
			daemonSet.Spec.Selector = current.Spec.Selector
		}
		if len(daemonSet.Spec.Template.Spec.Containers) == 0 {
			return fmt.Errorf("daemon set manifest must define at least one container")
		}
		if _, updateErr := c.clientset.AppsV1().DaemonSets(namespace).Update(ctx, &daemonSet, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update daemon set: %w", updateErr)
		}
		return nil
	case workloadControllerStateful:
		var statefulSet appsv1.StatefulSet
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &statefulSet); unmarshalErr != nil {
			return fmt.Errorf("failed to parse stateful set manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing stateful set: %w", getErr)
		}
		statefulSet.Name = name
		statefulSet.Namespace = namespace
		if strings.TrimSpace(statefulSet.ResourceVersion) == "" {
			statefulSet.ResourceVersion = current.ResourceVersion
		}
		statefulSet.ManagedFields = nil
		if statefulSet.Spec.Selector == nil {
			statefulSet.Spec.Selector = current.Spec.Selector
		}
		if strings.TrimSpace(statefulSet.Spec.ServiceName) == "" {
			statefulSet.Spec.ServiceName = current.Spec.ServiceName
		}
		if len(statefulSet.Spec.Template.Spec.Containers) == 0 {
			return fmt.Errorf("stateful set manifest must define at least one container")
		}
		if _, updateErr := c.clientset.AppsV1().StatefulSets(namespace).Update(ctx, &statefulSet, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update stateful set: %w", updateErr)
		}
		return nil
	case workloadControllerReplica:
		var replicaSet appsv1.ReplicaSet
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &replicaSet); unmarshalErr != nil {
			return fmt.Errorf("failed to parse replica set manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing replica set: %w", getErr)
		}
		replicaSet.Name = name
		replicaSet.Namespace = namespace
		if strings.TrimSpace(replicaSet.ResourceVersion) == "" {
			replicaSet.ResourceVersion = current.ResourceVersion
		}
		replicaSet.ManagedFields = nil
		if replicaSet.Spec.Selector == nil {
			replicaSet.Spec.Selector = current.Spec.Selector
		}
		if len(replicaSet.Spec.Template.Spec.Containers) == 0 {
			return fmt.Errorf("replica set manifest must define at least one container")
		}
		if _, updateErr := c.clientset.AppsV1().ReplicaSets(namespace).Update(ctx, &replicaSet, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update replica set: %w", updateErr)
		}
		return nil
	case workloadControllerJob:
		var job batchv1.Job
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &job); unmarshalErr != nil {
			return fmt.Errorf("failed to parse job manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing job: %w", getErr)
		}
		job.Name = name
		job.Namespace = namespace
		if strings.TrimSpace(job.ResourceVersion) == "" {
			job.ResourceVersion = current.ResourceVersion
		}
		job.ManagedFields = nil
		if len(job.Spec.Template.Spec.Containers) == 0 {
			return fmt.Errorf("job manifest must define at least one container")
		}
		if _, updateErr := c.clientset.BatchV1().Jobs(namespace).Update(ctx, &job, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update job: %w", updateErr)
		}
		return nil
	case workloadControllerCronJob:
		var cronJob batchv1.CronJob
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &cronJob); unmarshalErr != nil {
			return fmt.Errorf("failed to parse cronjob manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing cronjob: %w", getErr)
		}
		cronJob.Name = name
		cronJob.Namespace = namespace
		if strings.TrimSpace(cronJob.ResourceVersion) == "" {
			cronJob.ResourceVersion = current.ResourceVersion
		}
		cronJob.ManagedFields = nil
		if strings.TrimSpace(cronJob.Spec.Schedule) == "" {
			cronJob.Spec.Schedule = current.Spec.Schedule
		}
		if len(cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers) == 0 {
			return fmt.Errorf("cronjob manifest must define at least one container")
		}
		if _, updateErr := c.clientset.BatchV1().CronJobs(namespace).Update(ctx, &cronJob, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update cronjob: %w", updateErr)
		}
		return nil
	case workloadControllerConfigMap:
		var configMap corev1.ConfigMap
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &configMap); unmarshalErr != nil {
			return fmt.Errorf("failed to parse config map manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing config map: %w", getErr)
		}
		configMap.Name = name
		configMap.Namespace = namespace
		if strings.TrimSpace(configMap.ResourceVersion) == "" {
			configMap.ResourceVersion = current.ResourceVersion
		}
		configMap.ManagedFields = nil
		if _, updateErr := c.clientset.CoreV1().ConfigMaps(namespace).Update(ctx, &configMap, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update config map: %w", updateErr)
		}
		return nil
	case workloadControllerSecret:
		var secret corev1.Secret
		if unmarshalErr := yaml.Unmarshal([]byte(manifest), &secret); unmarshalErr != nil {
			return fmt.Errorf("failed to parse secret manifest: %w", unmarshalErr)
		}
		current, getErr := c.clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get existing secret: %w", getErr)
		}
		secret.Name = name
		secret.Namespace = namespace
		if strings.TrimSpace(secret.ResourceVersion) == "" {
			secret.ResourceVersion = current.ResourceVersion
		}
		if strings.TrimSpace(string(secret.Type)) == "" {
			secret.Type = current.Type
		}
		secret.ManagedFields = nil
		if _, updateErr := c.clientset.CoreV1().Secrets(namespace).Update(ctx, &secret, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to update secret: %w", updateErr)
		}
		return nil
	case workloadControllerService:
		return c.UpdateServiceManifest(ctx, namespace, name, manifest)
	case workloadControllerIngress:
		return c.UpdateIngressManifest(ctx, namespace, name, manifest)
	default:
		return fmt.Errorf("unsupported workload kind %q", kind)
	}
}

func (c *Client) ScaleWorkload(ctx context.Context, kind string, namespace string, name string, replicas int32) error {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return err
	}
	if replicas < 0 {
		return fmt.Errorf("replicas must be >= 0")
	}

	switch controllerKind {
	case workloadControllerDeployment:
		return c.ScaleDeployment(ctx, namespace, name, replicas)
	case workloadControllerStateful:
		statefulSet, getErr := c.clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get stateful set: %w", getErr)
		}
		statefulSet.Spec.Replicas = &replicas
		if _, updateErr := c.clientset.AppsV1().StatefulSets(namespace).Update(ctx, statefulSet, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to scale stateful set: %w", updateErr)
		}
		return nil
	case workloadControllerReplica:
		replicaSet, getErr := c.clientset.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get replica set: %w", getErr)
		}
		replicaSet.Spec.Replicas = &replicas
		if _, updateErr := c.clientset.AppsV1().ReplicaSets(namespace).Update(ctx, replicaSet, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to scale replica set: %w", updateErr)
		}
		return nil
	default:
		return fmt.Errorf("scale is not supported for %s", kind)
	}
}

func (c *Client) DeleteWorkload(ctx context.Context, kind string, namespace string, name string) error {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return err
	}
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("resource name is required")
	}

	switch controllerKind {
	case workloadControllerDeployment:
		return c.DeleteDeployment(ctx, namespace, name)
	case workloadControllerDaemonSet:
		if deleteErr := c.clientset.AppsV1().DaemonSets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete daemon set: %w", deleteErr)
		}
		return nil
	case workloadControllerStateful:
		if deleteErr := c.clientset.AppsV1().StatefulSets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete stateful set: %w", deleteErr)
		}
		return nil
	case workloadControllerReplica:
		if deleteErr := c.clientset.AppsV1().ReplicaSets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete replica set: %w", deleteErr)
		}
		return nil
	case workloadControllerJob:
		if deleteErr := c.clientset.BatchV1().Jobs(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete job: %w", deleteErr)
		}
		return nil
	case workloadControllerCronJob:
		if deleteErr := c.clientset.BatchV1().CronJobs(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete cronjob: %w", deleteErr)
		}
		return nil
	case workloadControllerConfigMap:
		if deleteErr := c.clientset.CoreV1().ConfigMaps(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete config map: %w", deleteErr)
		}
		return nil
	case workloadControllerSecret:
		if deleteErr := c.clientset.CoreV1().Secrets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); deleteErr != nil {
			return fmt.Errorf("failed to delete secret: %w", deleteErr)
		}
		return nil
	case workloadControllerService:
		return c.DeleteService(ctx, namespace, name)
	case workloadControllerIngress:
		return c.DeleteIngress(ctx, namespace, name)
	default:
		return fmt.Errorf("unsupported workload kind %q", kind)
	}
}

func (c *Client) RestartWorkload(ctx context.Context, kind string, namespace string, name string) error {
	controllerKind, err := parseWorkloadControllerKind(kind)
	if err != nil {
		return err
	}
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("resource name is required")
	}

	restartAnnotation := map[string]string{
		"kubectl.kubernetes.io/restartedAt": time.Now().UTC().Format(time.RFC3339),
	}

	switch controllerKind {
	case workloadControllerDeployment:
		return c.RestartDeployment(ctx, namespace, name)
	case workloadControllerStateful:
		ss, getErr := c.clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get stateful set: %w", getErr)
		}
		if ss.Spec.Template.Annotations == nil {
			ss.Spec.Template.Annotations = make(map[string]string)
		}
		for k, v := range restartAnnotation {
			ss.Spec.Template.Annotations[k] = v
		}
		if _, updateErr := c.clientset.AppsV1().StatefulSets(namespace).Update(ctx, ss, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to restart stateful set: %w", updateErr)
		}
		return nil
	case workloadControllerDaemonSet:
		ds, getErr := c.clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			return fmt.Errorf("failed to get daemon set: %w", getErr)
		}
		if ds.Spec.Template.Annotations == nil {
			ds.Spec.Template.Annotations = make(map[string]string)
		}
		for k, v := range restartAnnotation {
			ds.Spec.Template.Annotations[k] = v
		}
		if _, updateErr := c.clientset.AppsV1().DaemonSets(namespace).Update(ctx, ds, metav1.UpdateOptions{}); updateErr != nil {
			return fmt.Errorf("failed to restart daemon set: %w", updateErr)
		}
		return nil
	default:
		return fmt.Errorf("restart is not supported for %s", kind)
	}
}

func (c *Client) TriggerCronJob(ctx context.Context, namespace string, name string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("cronjob name is required")
	}

	cronJob, err := c.clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get cronjob: %w", err)
	}

	generatePrefix := fmt.Sprintf("%s-manual-", cronJob.Name)
	labels := map[string]string{}
	for key, value := range cronJob.Spec.JobTemplate.Labels {
		labels[key] = value
	}
	annotations := map[string]string{}
	for key, value := range cronJob.Spec.JobTemplate.Annotations {
		annotations[key] = value
	}
	annotations["cronjob.kubernetes.io/instantiate"] = "manual"

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName:    generatePrefix,
			Namespace:       namespace,
			Labels:          labels,
			Annotations:     annotations,
			OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(cronJob, batchv1.SchemeGroupVersion.WithKind("CronJob"))},
		},
		Spec: *cronJob.Spec.JobTemplate.Spec.DeepCopy(),
	}

	if _, createErr := c.clientset.BatchV1().Jobs(namespace).Create(ctx, job, metav1.CreateOptions{}); createErr != nil {
		return fmt.Errorf("failed to trigger cronjob: %w", createErr)
	}
	return nil
}

func (c *Client) SetCronJobSuspend(ctx context.Context, namespace string, name string, suspend bool) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("cronjob name is required")
	}

	cronJob, err := c.clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get cronjob: %w", err)
	}

	cronJob.Spec.Suspend = &suspend
	if _, updateErr := c.clientset.BatchV1().CronJobs(namespace).Update(ctx, cronJob, metav1.UpdateOptions{}); updateErr != nil {
		return fmt.Errorf("failed to update cronjob suspend state: %w", updateErr)
	}
	return nil
}

func (c *Client) getDaemonSetDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	daemonSet, err := c.clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get daemon set: %w", err)
	}

	selector := metav1.FormatLabelSelector(daemonSet.Spec.Selector)
	podList, err := c.listPodsBySelector(ctx, namespace, selector)
	if err != nil {
		return nil, fmt.Errorf("failed to list daemon set pods: %w", err)
	}
	pods, statusByContainer := c.buildPodsAndContainerStatuses(ctx, namespace, podList)

	conditions := make([]PodDetailCondition, 0, len(daemonSet.Status.Conditions))
	for _, condition := range daemonSet.Status.Conditions {
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: conditionMessage(condition.Message, condition.Reason),
		})
	}

	labels, annotations := copyLabelsAndAnnotations(daemonSet.Labels, daemonSet.Annotations)
	manifestObject := daemonSet.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)

	return &DeploymentDetail{
		Name:            daemonSet.Name,
		Namespace:       daemonSet.Namespace,
		Status:          workloadStatusFromPhase(classifyDaemonSet(*daemonSet)),
		Replicas:        daemonSet.Status.DesiredNumberScheduled,
		Current:         daemonSet.Status.CurrentNumberScheduled,
		Ready:           daemonSet.Status.NumberReady,
		Updated:         daemonSet.Status.UpdatedNumberScheduled,
		Available:       daemonSet.Status.NumberAvailable,
		Unavailable:     daemonSet.Status.NumberUnavailable,
		Age:             formatAge(time.Since(daemonSet.CreationTimestamp.Time)),
		Created:         daemonSet.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(daemonSet.UID), "-"),
		ResourceVersion: stringOrDefault(daemonSet.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selectorMap(daemonSet.Spec.Selector),
		NodeSelector:    podTemplateNodeSelectorMap(daemonSet.Spec.Template),
		StrategyType:    stringOrDefault(string(daemonSet.Spec.UpdateStrategy.Type), "-"),
		Conditions:      conditions,
		Tolerations:     podTemplateTolerations(daemonSet.Spec.Template),
		NodeAffinities:  podTemplateNodeAffinities(daemonSet.Spec.Template),
		PodAntiAffinity: podTemplatePodAntiAffinities(daemonSet.Spec.Template),
		Containers:      containersFromTemplate(daemonSet.Spec.Template, statusByContainer),
		Revisions:       nil,
		Pods:            pods,
		Events:          objectEvents(ctx, c, namespace, "DaemonSet", daemonSet.Name, string(daemonSet.UID)),
		Manifest:        manifest,
		ScaleSupported:  false,
	}, nil
}

func (c *Client) getStatefulSetDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	statefulSet, err := c.clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get stateful set: %w", err)
	}

	selector := metav1.FormatLabelSelector(statefulSet.Spec.Selector)
	podList, err := c.listPodsBySelector(ctx, namespace, selector)
	if err != nil {
		return nil, fmt.Errorf("failed to list stateful set pods: %w", err)
	}
	pods, statusByContainer := c.buildPodsAndContainerStatuses(ctx, namespace, podList)

	conditions := make([]PodDetailCondition, 0, len(statefulSet.Status.Conditions))
	for _, condition := range statefulSet.Status.Conditions {
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: conditionMessage(condition.Message, ""),
		})
	}

	labels, annotations := copyLabelsAndAnnotations(statefulSet.Labels, statefulSet.Annotations)
	manifestObject := statefulSet.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)

	replicas := replicasFromPointer(statefulSet.Spec.Replicas, 1)
	return &DeploymentDetail{
		Name:            statefulSet.Name,
		Namespace:       statefulSet.Namespace,
		Status:          workloadStatusFromPhase(classifyStatefulSet(*statefulSet)),
		Replicas:        replicas,
		Current:         statefulSet.Status.CurrentReplicas,
		Ready:           statefulSet.Status.ReadyReplicas,
		Updated:         statefulSet.Status.UpdatedReplicas,
		Available:       statefulSet.Status.ReadyReplicas,
		Unavailable:     int32Max(replicas-statefulSet.Status.ReadyReplicas, 0),
		Age:             formatAge(time.Since(statefulSet.CreationTimestamp.Time)),
		Created:         statefulSet.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(statefulSet.UID), "-"),
		ResourceVersion: stringOrDefault(statefulSet.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selectorMap(statefulSet.Spec.Selector),
		NodeSelector:    podTemplateNodeSelectorMap(statefulSet.Spec.Template),
		StrategyType:    stringOrDefault(string(statefulSet.Spec.UpdateStrategy.Type), "-"),
		Conditions:      conditions,
		Tolerations:     podTemplateTolerations(statefulSet.Spec.Template),
		NodeAffinities:  podTemplateNodeAffinities(statefulSet.Spec.Template),
		PodAntiAffinity: podTemplatePodAntiAffinities(statefulSet.Spec.Template),
		Containers:      containersFromTemplate(statefulSet.Spec.Template, statusByContainer),
		Revisions:       nil,
		Pods:            pods,
		Events:          objectEvents(ctx, c, namespace, "StatefulSet", statefulSet.Name, string(statefulSet.UID)),
		Manifest:        manifest,
		ScaleSupported:  true,
	}, nil
}

func (c *Client) getReplicaSetDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	replicaSet, err := c.clientset.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get replica set: %w", err)
	}

	selector := metav1.FormatLabelSelector(replicaSet.Spec.Selector)
	podList, err := c.listPodsBySelector(ctx, namespace, selector)
	if err != nil {
		return nil, fmt.Errorf("failed to list replica set pods: %w", err)
	}
	pods, statusByContainer := c.buildPodsAndContainerStatuses(ctx, namespace, podList)

	conditions := make([]PodDetailCondition, 0, len(replicaSet.Status.Conditions))
	for _, condition := range replicaSet.Status.Conditions {
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: conditionMessage(condition.Message, condition.Reason),
		})
	}

	labels, annotations := copyLabelsAndAnnotations(replicaSet.Labels, replicaSet.Annotations)
	manifestObject := replicaSet.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)

	replicas := replicasFromPointer(replicaSet.Spec.Replicas, 1)
	return &DeploymentDetail{
		Name:            replicaSet.Name,
		Namespace:       replicaSet.Namespace,
		Status:          workloadStatusFromPhase(classifyReplicaSet(*replicaSet)),
		Replicas:        replicas,
		Current:         replicaSet.Status.Replicas,
		Ready:           replicaSet.Status.ReadyReplicas,
		Updated:         replicaSet.Status.Replicas,
		Available:       replicaSet.Status.ReadyReplicas,
		Unavailable:     int32Max(replicas-replicaSet.Status.ReadyReplicas, 0),
		Age:             formatAge(time.Since(replicaSet.CreationTimestamp.Time)),
		Created:         replicaSet.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(replicaSet.UID), "-"),
		ResourceVersion: stringOrDefault(replicaSet.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selectorMap(replicaSet.Spec.Selector),
		NodeSelector:    podTemplateNodeSelectorMap(replicaSet.Spec.Template),
		StrategyType:    "-",
		Conditions:      conditions,
		Tolerations:     podTemplateTolerations(replicaSet.Spec.Template),
		NodeAffinities:  podTemplateNodeAffinities(replicaSet.Spec.Template),
		PodAntiAffinity: podTemplatePodAntiAffinities(replicaSet.Spec.Template),
		Containers:      containersFromTemplate(replicaSet.Spec.Template, statusByContainer),
		Revisions:       nil,
		Pods:            pods,
		Events:          objectEvents(ctx, c, namespace, "ReplicaSet", replicaSet.Name, string(replicaSet.UID)),
		Manifest:        manifest,
		ScaleSupported:  true,
	}, nil
}

func (c *Client) getJobDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	job, err := c.clientset.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get job: %w", err)
	}

	podList, err := c.listPodsForJob(ctx, namespace, job)
	if err != nil {
		return nil, fmt.Errorf("failed to list job pods: %w", err)
	}
	pods, statusByContainer := c.buildPodsAndContainerStatuses(ctx, namespace, podList)

	conditions := make([]PodDetailCondition, 0, len(job.Status.Conditions))
	for _, condition := range job.Status.Conditions {
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: conditionMessage(condition.Message, condition.Reason),
		})
	}

	selector := selectorMap(job.Spec.Selector)
	if len(selector) == 0 {
		selector["job-name"] = job.Name
	}

	labels, annotations := copyLabelsAndAnnotations(job.Labels, job.Annotations)
	manifestObject := job.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)

	strategyType := "-"
	if job.Spec.CompletionMode != nil {
		strategyType = string(*job.Spec.CompletionMode)
	}

	parallelism := replicasFromPointer(job.Spec.Parallelism, 1)
	completionsTarget := int32(1)
	if job.Spec.Completions != nil {
		completionsTarget = *job.Spec.Completions
	}
	completionsSummary := fmt.Sprintf("%d/%d", job.Status.Succeeded, completionsTarget)
	return &DeploymentDetail{
		Name:            job.Name,
		Namespace:       job.Namespace,
		Status:          jobStatusLabel(job),
		Replicas:        parallelism,
		Current:         job.Status.Active,
		Ready:           job.Status.Active,
		Updated:         int32(job.Status.Succeeded),
		Available:       int32(job.Status.Succeeded),
		Unavailable:     int32(job.Status.Failed),
		Completions:     completionsSummary,
		Active:          job.Status.Active,
		Age:             formatAge(time.Since(job.CreationTimestamp.Time)),
		Created:         job.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(job.UID), "-"),
		ResourceVersion: stringOrDefault(job.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selector,
		NodeSelector:    podTemplateNodeSelectorMap(job.Spec.Template),
		StrategyType:    strategyType,
		Conditions:      conditions,
		Tolerations:     podTemplateTolerations(job.Spec.Template),
		NodeAffinities:  podTemplateNodeAffinities(job.Spec.Template),
		PodAntiAffinity: podTemplatePodAntiAffinities(job.Spec.Template),
		Containers:      containersFromTemplate(job.Spec.Template, statusByContainer),
		Revisions:       nil,
		Pods:            pods,
		Events:          objectEvents(ctx, c, namespace, "Job", job.Name, string(job.UID)),
		Manifest:        manifest,
		ScaleSupported:  false,
	}, nil
}

func (c *Client) getCronJobDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	cronJob, err := c.clientset.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get cronjob: %w", err)
	}

	ownedJobs, err := c.listCronJobsOwnedJobs(ctx, namespace, cronJob)
	if err != nil {
		return nil, fmt.Errorf("failed to list cronjob jobs: %w", err)
	}

	activeNames := make(map[string]struct{}, len(cronJob.Status.Active))
	for _, activeRef := range cronJob.Status.Active {
		if strings.TrimSpace(activeRef.Name) != "" {
			activeNames[activeRef.Name] = struct{}{}
		}
	}

	activeJobs := make([]batchv1.Job, 0)
	for _, job := range ownedJobs {
		if _, ok := activeNames[job.Name]; ok {
			activeJobs = append(activeJobs, job)
		}
	}
	jobsForPods := activeJobs
	if len(jobsForPods) == 0 {
		limit := 3
		if len(ownedJobs) < limit {
			limit = len(ownedJobs)
		}
		jobsForPods = append(jobsForPods, ownedJobs[:limit]...)
	}

	podGroups := make([][]corev1.Pod, 0, len(jobsForPods))
	for _, job := range jobsForPods {
		pods, podErr := c.listPodsForJob(ctx, namespace, &job)
		if podErr != nil {
			continue
		}
		podGroups = append(podGroups, pods)
	}
	pods, statusByContainer := c.buildPodsAndContainerStatuses(ctx, namespace, mergePods(podGroups...))

	conditions := make([]PodDetailCondition, 0, 2)
	suspended := cronJob.Spec.Suspend != nil && *cronJob.Spec.Suspend
	conditions = append(conditions, PodDetailCondition{
		Type:    "Suspended",
		Status:  map[bool]string{true: "True", false: "False"}[suspended],
		Message: "-",
	})
	conditions = append(conditions, PodDetailCondition{
		Type:    "Schedule",
		Status:  "True",
		Message: stringOrDefault(cronJob.Spec.Schedule, "-"),
	})

	revisions := make([]DeploymentDetailRevision, 0, len(ownedJobs))
	for index, job := range ownedJobs {
		revisions = append(revisions, DeploymentDetailRevision{
			Revision:   fmt.Sprintf("%d", index+1),
			ReplicaSet: job.Name,
			Replicas:   int32(job.Status.Active),
			Ready:      int32(job.Status.Succeeded),
			Age:        formatAge(time.Since(job.CreationTimestamp.Time)),
		})
	}

	selector := selectorMap(cronJob.Spec.JobTemplate.Spec.Selector)
	if len(selector) == 0 {
		for key, value := range cronJob.Spec.JobTemplate.Labels {
			selector[key] = value
		}
	}

	labels, annotations := copyLabelsAndAnnotations(cronJob.Labels, cronJob.Annotations)
	manifestObject := cronJob.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)

	activeCount := int32(len(cronJob.Status.Active))
	suspend := cronJob.Spec.Suspend != nil && *cronJob.Spec.Suspend
	return &DeploymentDetail{
		Name:            cronJob.Name,
		Namespace:       cronJob.Namespace,
		Status:          cronJobStatusLabel(cronJob),
		Replicas:        activeCount,
		Current:         activeCount,
		Ready:           activeCount,
		Updated:         int32(len(ownedJobs)),
		Available:       activeCount,
		Unavailable:     0,
		Schedule:        stringOrDefault(cronJob.Spec.Schedule, "-"),
		Suspend:         suspend,
		Active:          activeCount,
		LastSchedule:    formatMetaTime(cronJob.Status.LastScheduleTime),
		NextSchedule:    cronJobNextSchedule(cronJob.Spec.Schedule, cronJob.Spec.TimeZone),
		Age:             formatAge(time.Since(cronJob.CreationTimestamp.Time)),
		Created:         cronJob.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(cronJob.UID), "-"),
		ResourceVersion: stringOrDefault(cronJob.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selector,
		NodeSelector:    podTemplateNodeSelectorMap(cronJob.Spec.JobTemplate.Spec.Template),
		StrategyType:    stringOrDefault(string(cronJob.Spec.ConcurrencyPolicy), "-"),
		Conditions:      conditions,
		Tolerations:     podTemplateTolerations(cronJob.Spec.JobTemplate.Spec.Template),
		NodeAffinities:  podTemplateNodeAffinities(cronJob.Spec.JobTemplate.Spec.Template),
		PodAntiAffinity: podTemplatePodAntiAffinities(cronJob.Spec.JobTemplate.Spec.Template),
		Containers:      containersFromTemplate(cronJob.Spec.JobTemplate.Spec.Template, statusByContainer),
		Revisions:       revisions,
		Pods:            pods,
		Events:          objectEvents(ctx, c, namespace, "CronJob", cronJob.Name, string(cronJob.UID)),
		Manifest:        manifest,
		ScaleSupported:  false,
	}, nil
}

func (c *Client) getConfigMapDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	configMap, err := c.clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get config map: %w", err)
	}

	labels, annotations := copyLabelsAndAnnotations(configMap.Labels, configMap.Annotations)
	manifestObject := configMap.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)
	data := configMapDataMap(configMap)
	keysCount := int32(len(data))

	return &DeploymentDetail{
		Name:            configMap.Name,
		Namespace:       configMap.Namespace,
		Status:          "ConfigMap",
		Replicas:        keysCount,
		Current:         keysCount,
		Ready:           keysCount,
		Updated:         keysCount,
		Available:       keysCount,
		Unavailable:     0,
		Age:             formatAge(time.Since(configMap.CreationTimestamp.Time)),
		Created:         configMap.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(configMap.UID), "-"),
		ResourceVersion: stringOrDefault(configMap.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        data,
		Events:          objectEvents(ctx, c, namespace, "ConfigMap", configMap.Name, string(configMap.UID)),
		Manifest:        manifest,
		ScaleSupported:  false,
	}, nil
}

func (c *Client) getSecretDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	secret, err := c.clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get secret: %w", err)
	}

	labels, annotations := copyLabelsAndAnnotations(secret.Labels, secret.Annotations)
	manifestObject := secret.DeepCopy()
	manifestObject.ManagedFields = nil
	manifest := marshalManifest(manifestObject)
	data := secretDataMap(secret)
	keysCount := int32(len(data))

	return &DeploymentDetail{
		Name:            secret.Name,
		Namespace:       secret.Namespace,
		Status:          stringOrDefault(string(secret.Type), "Opaque"),
		Replicas:        keysCount,
		Current:         keysCount,
		Ready:           keysCount,
		Updated:         keysCount,
		Available:       keysCount,
		Unavailable:     0,
		Age:             formatAge(time.Since(secret.CreationTimestamp.Time)),
		Created:         secret.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(secret.UID), "-"),
		ResourceVersion: stringOrDefault(secret.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        data,
		Events:          objectEvents(ctx, c, namespace, "Secret", secret.Name, string(secret.UID)),
		Manifest:        manifest,
		ScaleSupported:  false,
	}, nil
}

func formatMetaTime(value *metav1.Time) string {
	if value == nil || value.Time.IsZero() {
		return "-"
	}
	return value.Time.UTC().Format("2006-01-02 15:04:05.000 MST")
}

func jobConditionsSummary(job *batchv1.Job) string {
	if len(job.Status.Conditions) == 0 {
		return "-"
	}

	priority := map[string]int{
		"FailureTarget":      1,
		"Failed":             2,
		"Complete":           3,
		"SuccessCriteriaMet": 4,
		"Suspended":          5,
	}

	sort.SliceStable(job.Status.Conditions, func(i, j int) bool {
		left := job.Status.Conditions[i]
		right := job.Status.Conditions[j]
		leftPriority, leftOK := priority[string(left.Type)]
		rightPriority, rightOK := priority[string(right.Type)]
		if !leftOK {
			leftPriority = 100
		}
		if !rightOK {
			rightPriority = 100
		}
		if leftPriority != rightPriority {
			return leftPriority < rightPriority
		}
		if left.LastTransitionTime.Time.Equal(right.LastTransitionTime.Time) {
			return left.Type < right.Type
		}
		return left.LastTransitionTime.Time.After(right.LastTransitionTime.Time)
	})

	items := make([]string, 0, len(job.Status.Conditions))
	for _, condition := range job.Status.Conditions {
		if condition.Status == corev1.ConditionTrue {
			items = append(items, string(condition.Type))
		}
	}
	if len(items) == 0 {
		return "-"
	}
	return strings.Join(items, ", ")
}

func cronJobNextSchedule(schedule string, timezone *string) string {
	trimmed := strings.TrimSpace(schedule)
	if trimmed == "" {
		return "-"
	}

	parser := cronexpr.NewParser(
		cronexpr.Minute | cronexpr.Hour | cronexpr.Dom | cronexpr.Month | cronexpr.Dow | cronexpr.Descriptor,
	)
	parsed, err := parser.Parse(trimmed)
	if err != nil {
		return "-"
	}

	location := time.UTC
	if timezone != nil && strings.TrimSpace(*timezone) != "" {
		if loaded, loadErr := time.LoadLocation(strings.TrimSpace(*timezone)); loadErr == nil {
			location = loaded
		}
	}

	next := parsed.Next(time.Now().In(location))
	if next.IsZero() {
		return "-"
	}
	return next.UTC().Format("2006-01-02 15:04:05.000 MST")
}

func jobStatusLabel(job *batchv1.Job) string {
	if job.Spec.Suspend != nil && *job.Spec.Suspend {
		return "Suspended"
	}
	for _, condition := range job.Status.Conditions {
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			return "Failed"
		}
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			return "Succeeded"
		}
	}
	if job.Status.Active > 0 {
		return "Running"
	}
	if job.Status.Failed > 0 {
		return "Failed"
	}
	if job.Status.Succeeded > 0 {
		return "Succeeded"
	}
	return "Pending"
}

func cronJobStatusLabel(cronJob *batchv1.CronJob) string {
	if cronJob.Spec.Suspend != nil && *cronJob.Spec.Suspend {
		return "Suspended"
	}
	return workloadStatusFromPhase(classifyCronJob(*cronJob))
}
