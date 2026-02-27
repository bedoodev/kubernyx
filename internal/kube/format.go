package kube

import (
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
)

func formatMilliCPU(milli int64) string {
	if milli < 0 {
		milli = 0
	}
	if milli < 1000 {
		return fmt.Sprintf("%dm", milli)
	}
	return fmt.Sprintf("%.2f cores", float64(milli)/1000.0)
}

func formatBytes(bytes int64) string {
	if bytes <= 0 {
		return "0 B"
	}
	const (
		kib = 1024.0
		mib = kib * 1024
		gib = mib * 1024
	)
	value := float64(bytes)
	switch {
	case value >= gib:
		return fmt.Sprintf("%.2f GiB", value/gib)
	case value >= mib:
		return fmt.Sprintf("%.1f MiB", value/mib)
	case value >= kib:
		return fmt.Sprintf("%.1f KiB", value/kib)
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}

func formatAge(duration time.Duration) string {
	if duration < 0 {
		duration = 0
	}
	seconds := int64(duration.Seconds())
	switch {
	case seconds < 60:
		return fmt.Sprintf("%ds", seconds)
	case seconds < 3600:
		return fmt.Sprintf("%dm", seconds/60)
	case seconds < 86400:
		return fmt.Sprintf("%dh", seconds/3600)
	case seconds < 86400*30:
		return fmt.Sprintf("%dd", seconds/86400)
	default:
		return fmt.Sprintf("%dmo", seconds/(86400*30))
	}
}

func podStatusLabel(pod *corev1.Pod) string {
	phase := string(pod.Status.Phase)
	if phase == "" {
		phase = "Unknown"
	}

	total := len(pod.Spec.Containers)
	ready := 0
	for _, status := range pod.Status.ContainerStatuses {
		if status.Ready {
			ready++
		}
	}

	if total <= 0 {
		return phase
	}
	return fmt.Sprintf("%s (%d/%d)", phase, ready, total)
}

func containerStateLabel(status corev1.ContainerStatus) string {
	switch {
	case status.State.Running != nil:
		return "running"
	case status.State.Waiting != nil:
		reason := strings.TrimSpace(status.State.Waiting.Reason)
		if reason == "" {
			return "waiting"
		}
		return strings.ToLower(reason)
	case status.State.Terminated != nil:
		reason := strings.TrimSpace(status.State.Terminated.Reason)
		if reason == "" {
			return "terminated"
		}
		return strings.ToLower(reason)
	default:
		return "unknown"
	}
}

func podControlledBy(pod *corev1.Pod) string {
	for _, owner := range pod.OwnerReferences {
		if owner.Controller != nil && *owner.Controller {
			return fmt.Sprintf("%s/%s", owner.Kind, owner.Name)
		}
	}
	if len(pod.OwnerReferences) > 0 {
		owner := pod.OwnerReferences[0]
		return fmt.Sprintf("%s/%s", owner.Kind, owner.Name)
	}
	return "-"
}
