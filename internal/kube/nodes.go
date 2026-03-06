package kube

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type NodeResource struct {
	Name          string            `json:"name"`
	Role          string            `json:"role"`
	Status        string            `json:"status"`
	Version       string            `json:"version"`
	CPU           string            `json:"cpu"`
	Memory        string            `json:"memory"`
	Pods          string            `json:"pods"`
	CreatedAtUnix int64             `json:"createdAtUnix"`
	Age           string            `json:"age"`
	Labels        map[string]string `json:"labels"`
}

type NodeConditionInfo struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
	Age     string `json:"age"`
}

type NodeTaint struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Effect string `json:"effect"`
}

type NodeAddress struct {
	Type    string `json:"type"`
	Address string `json:"address"`
}

type NodeDetail struct {
	Name            string              `json:"name"`
	Role            string              `json:"role"`
	Status          string              `json:"status"`
	Version         string              `json:"version"`
	KernelVersion   string              `json:"kernelVersion"`
	OS              string              `json:"os"`
	Architecture    string              `json:"architecture"`
	ContainerRuntime string            `json:"containerRuntime"`
	CPU             string              `json:"cpu"`
	Memory          string              `json:"memory"`
	Pods            string              `json:"pods"`
	CPUAllocatable  string              `json:"cpuAllocatable"`
	MemAllocatable  string              `json:"memAllocatable"`
	PodAllocatable  string              `json:"podAllocatable"`
	Age             string              `json:"age"`
	Created         string              `json:"created"`
	UID             string              `json:"uid"`
	Labels          map[string]string   `json:"labels"`
	Annotations     map[string]string   `json:"annotations"`
	Conditions      []NodeConditionInfo `json:"conditions"`
	Taints          []NodeTaint         `json:"taints"`
	Addresses       []NodeAddress       `json:"addresses"`
	Events          []PodDetailEvent    `json:"events"`
	Manifest        string              `json:"manifest"`
}

func (c *Client) GetNodeResources(ctx context.Context) ([]NodeResource, error) {
	nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	podList, err := c.clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	podsByNode := make(map[string]int)
	if err == nil {
		for _, pod := range podList.Items {
			if pod.Spec.NodeName != "" && (pod.Status.Phase == corev1.PodRunning || pod.Status.Phase == corev1.PodPending) {
				podsByNode[pod.Spec.NodeName]++
			}
		}
	}

	items := make([]NodeResource, 0, len(nodes.Items))
	for _, node := range nodes.Items {
		role := getNodeRole(&node)
		status := nodeReadyStatus(&node)
		version := node.Status.NodeInfo.KubeletVersion

		cpuCap := node.Status.Allocatable.Cpu().MilliValue()
		memCap := node.Status.Allocatable.Memory().Value()
		podCap := node.Status.Allocatable.Pods().Value()
		podCount := podsByNode[node.Name]

		labelsCopy := make(map[string]string, len(node.Labels))
		for k, v := range node.Labels {
			labelsCopy[k] = v
		}

		items = append(items, NodeResource{
			Name:          node.Name,
			Role:          role,
			Status:        status,
			Version:       version,
			CPU:           formatMilliCPU(cpuCap),
			Memory:        formatBytes(memCap),
			Pods:          fmt.Sprintf("%d/%d", podCount, podCap),
			CreatedAtUnix: node.CreationTimestamp.Time.Unix(),
			Age:           formatAge(time.Since(node.CreationTimestamp.Time)),
			Labels:        labelsCopy,
		})
	}

	sort.SliceStable(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})

	return items, nil
}

func (c *Client) GetNodeDetail(ctx context.Context, name string) (*NodeDetail, error) {
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("node name is required")
	}

	node, err := c.clientset.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get node: %w", err)
	}

	role := getNodeRole(node)
	status := nodeReadyStatus(node)

	podList, err := c.clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", name),
	})
	podCount := 0
	if err == nil {
		for _, pod := range podList.Items {
			if pod.Status.Phase == corev1.PodRunning || pod.Status.Phase == corev1.PodPending {
				podCount++
			}
		}
	}

	cpuCap := node.Status.Capacity.Cpu().MilliValue()
	memCap := node.Status.Capacity.Memory().Value()
	podCap := node.Status.Capacity.Pods().Value()
	cpuAlloc := node.Status.Allocatable.Cpu().MilliValue()
	memAlloc := node.Status.Allocatable.Memory().Value()
	podAlloc := node.Status.Allocatable.Pods().Value()

	conditions := make([]NodeConditionInfo, 0, len(node.Status.Conditions))
	for _, c := range node.Status.Conditions {
		conditions = append(conditions, NodeConditionInfo{
			Type:    string(c.Type),
			Status:  string(c.Status),
			Reason:  c.Reason,
			Message: c.Message,
			Age:     formatAge(time.Since(c.LastTransitionTime.Time)),
		})
	}

	taints := make([]NodeTaint, 0, len(node.Spec.Taints))
	for _, t := range node.Spec.Taints {
		taints = append(taints, NodeTaint{
			Key:    t.Key,
			Value:  t.Value,
			Effect: string(t.Effect),
		})
	}

	addresses := make([]NodeAddress, 0, len(node.Status.Addresses))
	for _, a := range node.Status.Addresses {
		addresses = append(addresses, NodeAddress{
			Type:    string(a.Type),
			Address: a.Address,
		})
	}

	labels, annotations := copyLabelsAndAnnotations(node.Labels, node.Annotations)

	events := objectEvents(ctx, c, "", "Node", node.Name, string(node.UID))

	nodeCopy := node.DeepCopy()
	nodeCopy.ManagedFields = nil
	manifest := marshalManifest(nodeCopy)

	return &NodeDetail{
		Name:             node.Name,
		Role:             role,
		Status:           status,
		Version:          node.Status.NodeInfo.KubeletVersion,
		KernelVersion:    node.Status.NodeInfo.KernelVersion,
		OS:               node.Status.NodeInfo.OperatingSystem,
		Architecture:     node.Status.NodeInfo.Architecture,
		ContainerRuntime: node.Status.NodeInfo.ContainerRuntimeVersion,
		CPU:              formatMilliCPU(cpuCap),
		Memory:           formatBytes(memCap),
		Pods:             fmt.Sprintf("%d/%d", podCount, podCap),
		CPUAllocatable:   formatMilliCPU(cpuAlloc),
		MemAllocatable:   formatBytes(memAlloc),
		PodAllocatable:   fmt.Sprintf("%d", podAlloc),
		Age:              formatAge(time.Since(node.CreationTimestamp.Time)),
		Created:          node.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:              stringOrDefault(string(node.UID), "-"),
		Labels:           labels,
		Annotations:      annotations,
		Conditions:       conditions,
		Taints:           taints,
		Addresses:        addresses,
		Events:           events,
		Manifest:         manifest,
	}, nil
}

func (c *Client) DebugNode(ctx context.Context, nodeName string) (*PodExecResult, error) {
	if strings.TrimSpace(nodeName) == "" {
		return nil, fmt.Errorf("node name is required")
	}

	debugPodName := fmt.Sprintf("debug-node-%s-%d", nodeName, time.Now().Unix())
	privileged := true
	hostPID := true

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      debugPodName,
			Namespace: "default",
			Labels: map[string]string{
				"kubernyx/debug": "true",
			},
		},
		Spec: corev1.PodSpec{
			NodeName:      nodeName,
			RestartPolicy: corev1.RestartPolicyNever,
			HostPID:       hostPID,
			Containers: []corev1.Container{
				{
					Name:    "debugger",
					Image:   "busybox:latest",
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

	created, err := c.clientset.CoreV1().Pods("default").Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create debug pod: %w", err)
	}

	return &PodExecResult{
		Container: "debugger",
		Command:   fmt.Sprintf("kubectl exec -it %s -n default -- nsenter -t 1 -m -u -i -n -p -- sh", created.Name),
		Stdout:    fmt.Sprintf("Debug pod '%s' created on node '%s'. Use the shell tab to exec into it.", created.Name, nodeName),
		Stderr:    "",
		ExitCode:  0,
	}, nil
}

func nodeReadyStatus(node *corev1.Node) string {
	for _, condition := range node.Status.Conditions {
		if condition.Type == corev1.NodeReady {
			if condition.Status == corev1.ConditionTrue {
				return "Ready"
			}
			return "NotReady"
		}
	}
	return "Unknown"
}
