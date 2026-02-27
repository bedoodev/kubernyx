package kube

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
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

		items = append(items, PodResource{
			Name:          pod.Name,
			Namespace:     pod.Namespace,
			CPU:           cpuValue,
			Memory:        memValue,
			ControlledBy:  podControlledBy(&pod),
			Status:        podStatusLabel(&pod),
			CreatedAtUnix: pod.CreationTimestamp.Time.Unix(),
			Age:           formatAge(time.Since(pod.CreationTimestamp.Time)),
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

	statusByName := make(map[string]corev1.ContainerStatus, len(pod.Status.ContainerStatuses))
	for _, status := range pod.Status.ContainerStatuses {
		statusByName[status.Name] = status
	}

	containers := make([]PodDetailContainer, 0, len(pod.Spec.Containers))
	var restartCount int64
	for _, container := range pod.Spec.Containers {
		status, ok := statusByName[container.Name]

		restarts := int64(0)
		ready := false
		state := "unknown"
		if ok {
			restarts = int64(status.RestartCount)
			ready = status.Ready
			state = containerStateLabel(status)
		}
		restartCount += restarts

		containers = append(containers, PodDetailContainer{
			Name:     container.Name,
			Image:    container.Image,
			State:    state,
			Ready:    ready,
			Restarts: restarts,
		})
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

	return &PodDetail{
		Name:            pod.Name,
		Namespace:       pod.Namespace,
		Status:          podStatusLabel(pod),
		Phase:           stringOrDefault(string(pod.Status.Phase), "Unknown"),
		Age:             formatAge(time.Since(pod.CreationTimestamp.Time)),
		PodIP:           stringOrDefault(pod.Status.PodIP, "-"),
		Node:            stringOrDefault(pod.Spec.NodeName, "-"),
		QOSClass:        stringOrDefault(string(pod.Status.QOSClass), "-"),
		RestartCount:    restartCount,
		ControlledBy:    podControlledBy(pod),
		Created:         pod.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(pod.UID), "-"),
		ResourceVersion: stringOrDefault(pod.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		OwnerReferences: ownerReferences,
		Volumes:         volumes,
		Containers:      containers,
		Conditions:      conditions,
	}, nil
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
