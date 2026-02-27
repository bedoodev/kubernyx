package kube

import (
	"strings"

	corev1 "k8s.io/api/core/v1"
)

func stringOrDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func filterNodes(nodes []corev1.Node, filter string) []corev1.Node {
	if filter == "" || filter == "both" {
		return nodes
	}
	var filtered []corev1.Node
	for _, n := range nodes {
		role := getNodeRole(&n)
		if strings.EqualFold(role, filter) {
			filtered = append(filtered, n)
		}
	}
	return filtered
}

func getNodeRole(node *corev1.Node) string {
	for label := range node.Labels {
		if label == "node-role.kubernetes.io/master" || label == "node-role.kubernetes.io/control-plane" {
			return "master"
		}
	}
	return "worker"
}

func computeNodeSummary(nodes []corev1.Node) NodeSummary {
	s := NodeSummary{Total: len(nodes)}
	for _, n := range nodes {
		role := getNodeRole(&n)
		if role == "master" {
			s.Masters++
		} else {
			s.Workers++
		}
		readyFound := false
		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady {
				readyFound = true
				if cond.Status == corev1.ConditionTrue {
					s.Ready++
				} else {
					s.NotReady++
				}
				break
			}
		}
		if !readyFound {
			s.NotReady++
		}
	}
	return s
}
