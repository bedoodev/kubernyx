package kube

import (
	"context"
	"fmt"
	"strings"
)

type ResourceRef struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

type BatchDeleteFailure struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Error     string `json:"error"`
}

type BatchDeleteResult struct {
	Deleted []ResourceRef        `json:"deleted"`
	Failed  []BatchDeleteFailure `json:"failed"`
}

func (c *Client) DeleteResourcesBatch(ctx context.Context, kind string, items []ResourceRef) (*BatchDeleteResult, error) {
	deleteFn, err := c.batchDeleteFunc(ctx, kind)
	if err != nil {
		return nil, err
	}

	result := aggregateBatchDelete(items, deleteFn)
	return &result, nil
}

func (c *Client) batchDeleteFunc(ctx context.Context, kind string) (func(ResourceRef) error, error) {
	normalizedKind := strings.ToLower(strings.TrimSpace(kind))
	switch normalizedKind {
	case "pod":
		return func(item ResourceRef) error {
			return c.DeletePod(ctx, item.Namespace, item.Name)
		}, nil
	case "deployment", "daemonset", "statefulset", "replicaset", "job", "cronjob", "configmap", "secret", "service", "ingress":
		return func(item ResourceRef) error {
			return c.DeleteWorkload(ctx, normalizedKind, item.Namespace, item.Name)
		}, nil
	default:
		return nil, fmt.Errorf("unsupported batch delete kind %q", kind)
	}
}

func aggregateBatchDelete(items []ResourceRef, deleteFn func(ResourceRef) error) BatchDeleteResult {
	result := BatchDeleteResult{
		Deleted: make([]ResourceRef, 0, len(items)),
		Failed:  make([]BatchDeleteFailure, 0),
	}

	for _, item := range items {
		if err := deleteFn(item); err != nil {
			result.Failed = append(result.Failed, BatchDeleteFailure{
				Namespace: item.Namespace,
				Name:      item.Name,
				Error:     err.Error(),
			})
			continue
		}
		result.Deleted = append(result.Deleted, item)
	}

	return result
}
