package kube

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (c *Client) GetNodeSummary(ctx context.Context) (NodeSummary, error) {
	nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return NodeSummary{}, fmt.Errorf("failed to list nodes: %w", err)
	}
	return computeNodeSummary(nodes.Items), nil
}

func (c *Client) GetClusterOverview(ctx context.Context, nodeFilter string) (*ClusterOverview, error) {
	nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}
	c.nodes = nodes.Items

	filteredNodes := filterNodes(nodes.Items, nodeFilter)

	summary := computeNodeSummary(nodes.Items)
	resources := c.computeResources(ctx, filteredNodes)

	nsList, err := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list namespaces: %w", err)
	}
	var namespaces []string
	for _, ns := range nsList.Items {
		namespaces = append(namespaces, ns.Name)
	}

	return &ClusterOverview{
		NodeSummary: summary,
		Resources:   resources,
		Namespaces:  namespaces,
	}, nil
}

func (c *Client) computeResources(ctx context.Context, nodes []corev1.Node) ResourceMetrics {
	rm := ResourceMetrics{}

	nodeSet := make(map[string]bool, len(nodes))
	for _, n := range nodes {
		alloc := n.Status.Allocatable
		rm.CPUAllocatable += alloc.Cpu().MilliValue()
		rm.MemAllocatable += alloc.Memory().Value()
		rm.PodCapacity += alloc.Pods().Value()
		nodeSet[n.Name] = true
	}

	pods, err := c.clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, pod := range pods.Items {
			if !nodeSet[pod.Spec.NodeName] {
				continue
			}
			if pod.Status.Phase == corev1.PodRunning || pod.Status.Phase == corev1.PodPending {
				rm.PodUsage++
			}
			for _, container := range pod.Spec.Containers {
				rm.CPURequests += container.Resources.Requests.Cpu().MilliValue()
				rm.CPULimits += container.Resources.Limits.Cpu().MilliValue()
				rm.MemRequests += container.Resources.Requests.Memory().Value()
				rm.MemLimits += container.Resources.Limits.Memory().Value()
			}
		}
	}

	if c.metrics != nil {
		nodeMetrics, err := c.metrics.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
		if err == nil {
			rm.MetricsAvail = true
			for _, nm := range nodeMetrics.Items {
				if !nodeSet[nm.Name] {
					continue
				}
				rm.CPUUsage += nm.Usage.Cpu().MilliValue()
				rm.MemUsage += nm.Usage.Memory().Value()
			}
		}
	}

	return rm
}
