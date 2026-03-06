package kube

import (
	"context"
	"fmt"
	"sort"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ClusterEvent struct {
	Type          string `json:"type"`
	Reason        string `json:"reason"`
	ObjectKind    string `json:"objectKind"`
	ObjectName    string `json:"objectName"`
	Namespace     string `json:"namespace"`
	Message       string `json:"message"`
	Count         int32  `json:"count"`
	Age           string `json:"age"`
	CreatedAtUnix int64  `json:"createdAtUnix"`
}

func (c *Client) GetEvents(ctx context.Context, namespaces []string) ([]ClusterEvent, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]ClusterEvent, 0)
	for _, ns := range selectedNamespaces {
		events, err := c.clientset.CoreV1().Events(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list events: %w", err)
		}

		for _, event := range events.Items {
			eventTime := event.LastTimestamp.Time
			if eventTime.IsZero() {
				eventTime = event.FirstTimestamp.Time
			}
			if eventTime.IsZero() {
				eventTime = event.CreationTimestamp.Time
			}

			items = append(items, ClusterEvent{
				Type:          event.Type,
				Reason:        event.Reason,
				ObjectKind:    event.InvolvedObject.Kind,
				ObjectName:    event.InvolvedObject.Name,
				Namespace:     event.Namespace,
				Message:       event.Message,
				Count:         event.Count,
				Age:           formatAge(time.Since(eventTime)),
				CreatedAtUnix: eventTime.Unix(),
			})
		}
	}

	sort.SliceStable(items, func(i, j int) bool {
		return items[i].CreatedAtUnix > items[j].CreatedAtUnix
	})

	return items, nil
}
