package kube

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	debugPodNamespace = "default"
	debugPodImage     = "debian:bookworm-slim"
)

var invalidNodeDebugNamePattern = regexp.MustCompile(`[^a-z0-9-]+`)

func (c *Client) CleanupManagedNodeDebugPods(ctx context.Context, nodeName string, activePods map[string]struct{}) error {
	list, err := c.clientset.CoreV1().Pods(debugPodNamespace).List(ctx, metav1.ListOptions{
		LabelSelector: "kubernyx/debug=true,kubernyx/node-shell=true",
	})
	if err != nil {
		return fmt.Errorf("failed to list debug pods: %w", err)
	}

	for _, pod := range list.Items {
		if strings.TrimSpace(nodeName) != "" && pod.Spec.NodeName != nodeName {
			continue
		}
		if _, ok := activePods[pod.Name]; ok {
			continue
		}
		if deleteErr := c.DeleteDebugPod(ctx, pod.Name); deleteErr != nil {
			return deleteErr
		}
	}

	return nil
}

func (c *Client) CreateNodeDebugPod(ctx context.Context, nodeName string) (string, error) {
	if strings.TrimSpace(nodeName) == "" {
		return "", fmt.Errorf("node name is required")
	}

	podName := buildNodeDebugPodName(nodeName)
	privileged := true
	hostPID := true

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      podName,
			Namespace: debugPodNamespace,
			Labels: map[string]string{
				"kubernyx/debug":      "true",
				"kubernyx/node-shell": "true",
			},
		},
		Spec: corev1.PodSpec{
			NodeName:      nodeName,
			RestartPolicy: corev1.RestartPolicyNever,
			HostPID:       hostPID,
			Containers: []corev1.Container{
				{
					Name:    "debugger",
					Image:   debugPodImage,
					Command: []string{"sleep", "3600"},
					SecurityContext: &corev1.SecurityContext{
						Privileged: &privileged,
					},
					Stdin: true,
					TTY:   true,
				},
			},
			Tolerations: []corev1.Toleration{
				{Operator: corev1.TolerationOpExists},
			},
		},
	}

	if _, err := c.clientset.CoreV1().Pods(debugPodNamespace).Create(ctx, pod, metav1.CreateOptions{}); err != nil {
		return "", fmt.Errorf("failed to create debug pod: %w", err)
	}

	return podName, nil
}

func (c *Client) WaitForDebugPodReady(ctx context.Context, podName string, timeout time.Duration) error {
	if strings.TrimSpace(podName) == "" {
		return fmt.Errorf("debug pod name is required")
	}
	if timeout <= 0 {
		timeout = 90 * time.Second
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-waitCtx.Done():
			return fmt.Errorf("timed out waiting for debug pod to become ready")
		case <-ticker.C:
			pod, err := c.clientset.CoreV1().Pods(debugPodNamespace).Get(waitCtx, podName, metav1.GetOptions{})
			if err != nil {
				if apierrors.IsNotFound(err) {
					continue
				}
				return fmt.Errorf("failed to get debug pod status: %w", err)
			}
			if pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodSucceeded {
				return fmt.Errorf("debug pod terminated before becoming ready")
			}
			if pod.Status.Phase != corev1.PodRunning {
				continue
			}
			for _, condition := range pod.Status.Conditions {
				if condition.Type == corev1.PodReady && condition.Status == corev1.ConditionTrue {
					return nil
				}
			}
		}
	}
}

func (c *Client) DeleteDebugPod(ctx context.Context, podName string) error {
	if strings.TrimSpace(podName) == "" {
		return nil
	}

	err := c.clientset.CoreV1().Pods(debugPodNamespace).Delete(ctx, podName, metav1.DeleteOptions{})
	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("failed to delete debug pod: %w", err)
	}
	return nil
}

func buildNodeDebugPodName(nodeName string) string {
	safe := strings.ToLower(strings.TrimSpace(nodeName))
	safe = strings.ReplaceAll(safe, ".", "-")
	safe = invalidNodeDebugNamePattern.ReplaceAllString(safe, "-")
	safe = strings.Trim(safe, "-")
	if safe == "" {
		safe = "node"
	}
	if len(safe) > 40 {
		safe = safe[:40]
		safe = strings.TrimRight(safe, "-")
	}
	suffix := strings.ToLower(strconv.FormatInt(time.Now().UnixNano(), 36))
	if len(suffix) > 10 {
		suffix = suffix[len(suffix)-10:]
	}
	return fmt.Sprintf("kubernyx-node-shell-%s-%s", safe, suffix)
}
