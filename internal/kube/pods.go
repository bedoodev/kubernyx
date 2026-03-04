package kube

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/watch"
	"sigs.k8s.io/yaml"
)

func (c *Client) GetPodResources(ctx context.Context, namespaces []string) (*PodResourceSnapshot, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	podList := make([]corev1.Pod, 0)
	namespaceSet := make(map[string]struct{})
	for _, ns := range selectedNamespaces {
		pods, err := c.clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list pods: %w", err)
		}
		for _, pod := range pods.Items {
			podList = append(podList, pod)
			namespaceSet[pod.Namespace] = struct{}{}
		}
	}

	type podUsage struct {
		cpuMilli int64
		memBytes int64
	}
	usageByPod := make(map[string]podUsage)
	metricsAvailable := false
	if c.metrics != nil {
		metricNamespaces := make([]string, 0, len(namespaceSet))
		for ns := range namespaceSet {
			metricNamespaces = append(metricNamespaces, ns)
		}
		sort.Strings(metricNamespaces)

		for _, ns := range metricNamespaces {
			podMetrics, err := c.metrics.MetricsV1beta1().PodMetricses(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				continue
			}
			metricsAvailable = true
			for _, metric := range podMetrics.Items {
				total := podUsage{}
				for _, container := range metric.Containers {
					total.cpuMilli += container.Usage.Cpu().MilliValue()
					total.memBytes += container.Usage.Memory().Value()
				}
				usageByPod[metric.Namespace+"/"+metric.Name] = total
			}
		}
	}

	items := make([]PodResource, 0, len(podList))
	for _, pod := range podList {
		cpuValue := "-"
		memValue := "-"
		if usage, ok := usageByPod[pod.Namespace+"/"+pod.Name]; ok {
			cpuValue = formatMilliCPU(usage.cpuMilli)
			memValue = formatBytes(usage.memBytes)
		}

		labels := make(map[string]string, len(pod.Labels))
		for k, v := range pod.Labels {
			labels[k] = v
		}
		annotations := make(map[string]string, len(pod.Annotations))
		for k, v := range pod.Annotations {
			annotations[k] = v
		}

		items = append(items, PodResource{
			Name:          pod.Name,
			Namespace:     pod.Namespace,
			CPU:           cpuValue,
			Memory:        memValue,
			ControlledBy:  podControlledBy(&pod),
			Status:        podStatusLabel(&pod),
			CreatedAtUnix: pod.CreationTimestamp.Time.Unix(),
			Age:           formatAge(time.Since(pod.CreationTimestamp.Time)),
			Labels:        labels,
			Annotations:   annotations,
		})
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Namespace != items[j].Namespace {
			return items[i].Namespace < items[j].Namespace
		}
		return items[i].Name < items[j].Name
	})

	return &PodResourceSnapshot{
		Items:            items,
		MetricsAvailable: metricsAvailable,
	}, nil
}

func (c *Client) GetPodDetail(ctx context.Context, namespace string, name string) (*PodDetail, error) {
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("pod name is required")
	}

	pod, err := c.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get pod: %w", err)
	}

	cpuUsageMilli := int64(0)
	memoryUsageBytes := int64(0)
	cpuUsage := "-"
	memoryUsage := "-"
	metricsAvailable := false
	if c.metrics != nil {
		podMetrics, metricsErr := c.metrics.MetricsV1beta1().PodMetricses(namespace).Get(ctx, name, metav1.GetOptions{})
		if metricsErr == nil {
			metricsAvailable = true
			for _, containerMetrics := range podMetrics.Containers {
				cpuUsageMilli += containerMetrics.Usage.Cpu().MilliValue()
				memoryUsageBytes += containerMetrics.Usage.Memory().Value()
			}
			cpuUsage = formatMilliCPU(cpuUsageMilli)
			memoryUsage = formatBytes(memoryUsageBytes)
		}
	}

	statusByName := make(map[string]corev1.ContainerStatus, len(pod.Status.ContainerStatuses))
	for _, status := range pod.Status.ContainerStatuses {
		statusByName[status.Name] = status
	}

	containers := make([]PodDetailContainer, 0, len(pod.Spec.Containers))
	var restartCount int64
	var cpuRequestsMilli int64
	var cpuLimitsMilli int64
	var memoryRequestsBytes int64
	var memoryLimitsBytes int64
	for _, container := range pod.Spec.Containers {
		status, ok := statusByName[container.Name]
		detail := buildPodDetailContainer(container, status, ok)
		restartCount += detail.Restarts
		if quantity, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
			cpuRequestsMilli += quantity.MilliValue()
		}
		if quantity, ok := container.Resources.Limits[corev1.ResourceCPU]; ok {
			cpuLimitsMilli += quantity.MilliValue()
		}
		if quantity, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
			memoryRequestsBytes += quantity.Value()
		}
		if quantity, ok := container.Resources.Limits[corev1.ResourceMemory]; ok {
			memoryLimitsBytes += quantity.Value()
		}
		containers = append(containers, detail)
	}

	initStatusByName := make(map[string]corev1.ContainerStatus, len(pod.Status.InitContainerStatuses))
	for _, status := range pod.Status.InitContainerStatuses {
		initStatusByName[status.Name] = status
	}

	initContainers := make([]PodDetailContainer, 0, len(pod.Spec.InitContainers))
	for _, container := range pod.Spec.InitContainers {
		status, ok := initStatusByName[container.Name]
		initContainers = append(initContainers, buildPodDetailContainer(container, status, ok))
	}

	conditions := make([]PodDetailCondition, 0, len(pod.Status.Conditions))
	for _, condition := range pod.Status.Conditions {
		conditions = append(conditions, PodDetailCondition{
			Type:    string(condition.Type),
			Status:  string(condition.Status),
			Message: stringOrDefault(condition.Message, "-"),
		})
	}

	labels := make(map[string]string, len(pod.Labels))
	for key, value := range pod.Labels {
		labels[key] = value
	}

	annotations := make(map[string]string, len(pod.Annotations))
	for key, value := range pod.Annotations {
		annotations[key] = value
	}

	ownerReferences := make([]PodDetailOwnerReference, 0, len(pod.OwnerReferences))
	for _, owner := range pod.OwnerReferences {
		ownerReferences = append(ownerReferences, PodDetailOwnerReference{
			Kind:       owner.Kind,
			Name:       owner.Name,
			UID:        string(owner.UID),
			Controller: owner.Controller != nil && *owner.Controller,
		})
	}

	volumes := make([]PodDetailVolume, 0, len(pod.Spec.Volumes))
	for _, volume := range pod.Spec.Volumes {
		volumeType, details := volumeTypeAndDetails(volume)
		volumes = append(volumes, PodDetailVolume{
			Name:    volume.Name,
			Type:    volumeType,
			Details: details,
		})
	}

	events := c.listPodEvents(ctx, pod)
	manifest := "-"
	manifestPod := pod.DeepCopy()
	manifestPod.ManagedFields = nil
	if manifestBytes, err := yaml.Marshal(manifestPod); err == nil {
		manifest = strings.TrimRight(string(manifestBytes), "\n")
	}

	return &PodDetail{
		Name:             pod.Name,
		Namespace:        pod.Namespace,
		Status:           podStatusLabel(pod),
		Phase:            stringOrDefault(string(pod.Status.Phase), "Unknown"),
		Age:              formatAge(time.Since(pod.CreationTimestamp.Time)),
		CPUUsage:         cpuUsage,
		MemoryUsage:      memoryUsage,
		CPUUsageMilli:    cpuUsageMilli,
		MemoryUsageBytes: memoryUsageBytes,
		CPURequests:      cpuRequestsMilli,
		CPULimits:        cpuLimitsMilli,
		MemoryRequests:   memoryRequestsBytes,
		MemoryLimits:     memoryLimitsBytes,
		MetricsAvail:     metricsAvailable,
		PodIP:            stringOrDefault(pod.Status.PodIP, "-"),
		Node:             stringOrDefault(pod.Spec.NodeName, "-"),
		QOSClass:         stringOrDefault(string(pod.Status.QOSClass), "-"),
		RestartCount:     restartCount,
		ControlledBy:     podControlledBy(pod),
		Created:          pod.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:              stringOrDefault(string(pod.UID), "-"),
		ResourceVersion:  stringOrDefault(pod.ResourceVersion, "-"),
		Labels:           labels,
		Annotations:      annotations,
		OwnerReferences:  ownerReferences,
		Volumes:          volumes,
		InitContainers:   initContainers,
		Containers:       containers,
		Conditions:       conditions,
		Events:           events,
		Manifest:         manifest,
	}, nil
}

func (c *Client) GetPodLogs(ctx context.Context, namespace string, name string, container string, tailLines int64) ([]PodLogLine, error) {
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("pod name is required")
	}

	pod, err := c.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get pod: %w", err)
	}

	allContainerNames := make([]string, 0, len(pod.Spec.Containers)+len(pod.Spec.InitContainers))
	containerNames := make([]string, 0, len(pod.Spec.Containers))
	for _, item := range pod.Spec.Containers {
		allContainerNames = append(allContainerNames, item.Name)
		containerNames = append(containerNames, item.Name)
	}
	for _, item := range pod.Spec.InitContainers {
		allContainerNames = append(allContainerNames, item.Name)
	}

	if strings.TrimSpace(container) != "" {
		found := false
		for _, item := range allContainerNames {
			if item == container {
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("container %q not found in pod", container)
		}
		containerNames = []string{container}
	}

	type sortablePodLogLine struct {
		line  PodLogLine
		order int
	}

	logs := make([]sortablePodLogLine, 0)
	order := 0
	for _, containerName := range containerNames {
		options := &corev1.PodLogOptions{
			Container:  containerName,
			Timestamps: true,
		}
		if tailLines > 0 {
			options.TailLines = &tailLines
		}
		rawLogs, err := c.clientset.CoreV1().Pods(namespace).GetLogs(name, options).DoRaw(ctx)
		if err != nil {
			if strings.TrimSpace(container) != "" || len(containerNames) == 1 {
				return nil, fmt.Errorf("failed to get logs for %s: %w", containerName, err)
			}
			continue
		}

		normalized := strings.ReplaceAll(string(rawLogs), "\r\n", "\n")
		for _, row := range strings.Split(normalized, "\n") {
			message := strings.TrimRight(row, "\r")
			if strings.TrimSpace(message) == "" {
				continue
			}
			createdAt, createdAtUnix, content := parsePodLogLine(message)
			logs = append(logs, sortablePodLogLine{
				line: PodLogLine{
					Container:     containerName,
					CreatedAt:     createdAt,
					CreatedAtUnix: createdAtUnix,
					Message:       content,
				},
				order: order,
			})
			order++
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

	result := make([]PodLogLine, 0, len(logs))
	for _, item := range logs {
		result = append(result, item.line)
	}

	return result, nil
}

func (c *Client) DeletePod(ctx context.Context, namespace string, name string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("pod name is required")
	}

	if err := c.clientset.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("failed to delete pod: %w", err)
	}
	return nil
}

func parsePodLogLine(line string) (string, int64, string) {
	parts := strings.SplitN(line, " ", 2)
	if len(parts) != 2 {
		return "-", 0, line
	}

	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return "-", 0, line
	}

	message := parts[1]
	return ts.UTC().Format("2006-01-02 15:04:05.000 MST"), ts.Unix(), message
}

func buildPodDetailContainer(container corev1.Container, status corev1.ContainerStatus, hasStatus bool) PodDetailContainer {
	restarts := int64(0)
	ready := false
	state := "unknown"
	containerID := "-"
	if hasStatus {
		restarts = int64(status.RestartCount)
		ready = status.Ready
		state = containerStateLabel(status)
		if strings.TrimSpace(status.ContainerID) != "" {
			containerID = status.ContainerID
		}
	}

	imagePullPolicy := strings.TrimSpace(string(container.ImagePullPolicy))
	if imagePullPolicy == "" {
		imagePullPolicy = "-"
	}

	env := make([]PodDetailEnvVar, 0, len(container.Env))
	for _, item := range container.Env {
		env = append(env, PodDetailEnvVar{
			Name:  stringOrDefault(item.Name, "-"),
			Value: containerEnvValue(item),
		})
	}

	mounts := make([]PodDetailVolumeMount, 0, len(container.VolumeMounts))
	for _, mount := range container.VolumeMounts {
		mounts = append(mounts, PodDetailVolumeMount{
			Name:      stringOrDefault(mount.Name, "-"),
			MountPath: stringOrDefault(mount.MountPath, "-"),
			ReadOnly:  mount.ReadOnly,
			SubPath:   stringOrDefault(mount.SubPath, "-"),
		})
	}

	ports := make([]PodDetailPort, 0, len(container.Ports))
	for _, port := range container.Ports {
		protocol := strings.TrimSpace(string(port.Protocol))
		if protocol == "" {
			protocol = "TCP"
		}
		ports = append(ports, PodDetailPort{
			Name:          stringOrDefault(port.Name, "-"),
			ContainerPort: port.ContainerPort,
			Protocol:      protocol,
		})
	}

	requests := PodDetailResourceValues{
		CPU:    resourceQuantityOrDash(container.Resources.Requests, corev1.ResourceCPU),
		Memory: resourceQuantityOrDash(container.Resources.Requests, corev1.ResourceMemory),
	}
	limits := PodDetailResourceValues{
		CPU:    resourceQuantityOrDash(container.Resources.Limits, corev1.ResourceCPU),
		Memory: resourceQuantityOrDash(container.Resources.Limits, corev1.ResourceMemory),
	}

	return PodDetailContainer{
		Name:            stringOrDefault(container.Name, "-"),
		Image:           stringOrDefault(container.Image, "-"),
		ImagePullPolicy: imagePullPolicy,
		ContainerID:     containerID,
		State:           state,
		Ready:           ready,
		Restarts:        restarts,
		Command:         append([]string(nil), container.Command...),
		Args:            append([]string(nil), container.Args...),
		Env:             env,
		Mounts:          mounts,
		Ports:           ports,
		Requests:        requests,
		Limits:          limits,
	}
}

func resourceQuantityOrDash(resources corev1.ResourceList, name corev1.ResourceName) string {
	if len(resources) == 0 {
		return "-"
	}
	quantity, ok := resources[name]
	if !ok {
		return "-"
	}
	value := strings.TrimSpace(quantity.String())
	if value == "" {
		return "-"
	}
	return value
}

func containerEnvValue(env corev1.EnvVar) string {
	if strings.TrimSpace(env.Value) != "" {
		return env.Value
	}

	if env.ValueFrom == nil {
		return "-"
	}

	switch {
	case env.ValueFrom.FieldRef != nil:
		return "fieldRef:" + stringOrDefault(env.ValueFrom.FieldRef.FieldPath, "-")
	case env.ValueFrom.ResourceFieldRef != nil:
		resource := stringOrDefault(env.ValueFrom.ResourceFieldRef.Resource, "-")
		if strings.TrimSpace(env.ValueFrom.ResourceFieldRef.ContainerName) != "" {
			return fmt.Sprintf("resourceFieldRef:%s (container=%s)", resource, env.ValueFrom.ResourceFieldRef.ContainerName)
		}
		return "resourceFieldRef:" + resource
	case env.ValueFrom.ConfigMapKeyRef != nil:
		name := stringOrDefault(env.ValueFrom.ConfigMapKeyRef.Name, "-")
		key := stringOrDefault(env.ValueFrom.ConfigMapKeyRef.Key, "-")
		return fmt.Sprintf("configMap:%s/%s", name, key)
	case env.ValueFrom.SecretKeyRef != nil:
		name := stringOrDefault(env.ValueFrom.SecretKeyRef.Name, "-")
		key := stringOrDefault(env.ValueFrom.SecretKeyRef.Key, "-")
		return fmt.Sprintf("secret:%s/%s", name, key)
	default:
		return "-"
	}
}

func (c *Client) listPodEvents(ctx context.Context, pod *corev1.Pod) []PodDetailEvent {
	fieldSelector := fields.Set{
		"involvedObject.kind": "Pod",
		"involvedObject.name": pod.Name,
		"involvedObject.uid":  string(pod.UID),
	}.AsSelector().String()

	list, err := c.clientset.CoreV1().Events(pod.Namespace).List(ctx, metav1.ListOptions{
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

func podEventTimestamp(event corev1.Event) time.Time {
	switch {
	case !event.EventTime.Time.IsZero():
		return event.EventTime.Time
	case !event.LastTimestamp.IsZero():
		return event.LastTimestamp.Time
	case !event.FirstTimestamp.IsZero():
		return event.FirstTimestamp.Time
	default:
		return event.CreationTimestamp.Time
	}
}

func (c *Client) WatchPods(ctx context.Context, namespaces []string, notify chan<- struct{}) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	for _, ns := range selectedNamespaces {
		watcher, err := c.clientset.CoreV1().Pods(ns).Watch(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}
		go func(w watch.Interface) {
			defer w.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case _, ok := <-w.ResultChan():
					if !ok {
						return
					}
					select {
					case notify <- struct{}{}:
					default:
					}
				}
			}
		}(watcher)
	}
}
