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
			replicas := replicasFromPointer(deployment.Spec.Replicas, 1)
			labels, annotations := copyLabelsAndAnnotations(deployment.Labels, deployment.Annotations)

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

	podList, err := c.listPodsBySelector(ctx, namespace, metav1.FormatLabelSelector(deployment.Spec.Selector))
	if err != nil {
		return nil, fmt.Errorf("failed to list deployment pods: %w", err)
	}
	pods, statusByContainer := c.buildPodsAndContainerStatuses(ctx, namespace, podList)
	containers := containersFromTemplate(deployment.Spec.Template, statusByContainer)

	conditions := make([]PodDetailCondition, 0, len(deployment.Status.Conditions))
	for _, condition := range deployment.Status.Conditions {
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: conditionMessage(condition.Message, condition.Reason),
		})
	}

	labels, annotations := copyLabelsAndAnnotations(deployment.Labels, deployment.Annotations)
	selector := selectorMap(deployment.Spec.Selector)
	strategyType := stringOrDefault(string(deployment.Spec.Strategy.Type), "-")

	revisions, revisionErr := c.listDeploymentRevisions(ctx, deployment)
	if revisionErr != nil {
		revisions = nil
	}

	events := c.listDeploymentEvents(ctx, deployment)
	manifest := marshalManifest(deployment.DeepCopy())
	replicas := replicasFromPointer(deployment.Spec.Replicas, 1)

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

	pods, err := c.listPodsBySelector(ctx, namespace, metav1.FormatLabelSelector(deployment.Spec.Selector))
	if err != nil {
		return nil, fmt.Errorf("failed to list deployment pods: %w", err)
	}

	return c.collectLogsFromPods(ctx, namespace, pods, tailLines), nil
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

func (c *Client) RestartDeployment(ctx context.Context, namespace string, name string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("deployment name is required")
	}

	deployment, err := c.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get deployment: %w", err)
	}

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}
	deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().UTC().Format(time.RFC3339)

	if _, err := c.clientset.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{}); err != nil {
		return fmt.Errorf("failed to restart deployment: %w", err)
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
	return objectEvents(ctx, c, deployment.Namespace, "Deployment", deployment.Name, string(deployment.UID))
}

func collectDeploymentTolerations(deployment *appsv1.Deployment) []string {
	return podTemplateTolerations(deployment.Spec.Template)
}

func collectDeploymentNodeAffinities(deployment *appsv1.Deployment) []string {
	return podTemplateNodeAffinities(deployment.Spec.Template)
}

func collectDeploymentPodAntiAffinities(deployment *appsv1.Deployment) []string {
	return podTemplatePodAntiAffinities(deployment.Spec.Template)
}
