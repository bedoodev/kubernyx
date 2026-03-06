package kube

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

func (c *Client) GetServiceResources(ctx context.Context, namespaces []string) ([]DeploymentResource, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]DeploymentResource, 0)
	for _, ns := range selectedNamespaces {
		services, err := c.clientset.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list services: %w", err)
		}

		for _, svc := range services.Items {
			labels, annotations := copyLabelsAndAnnotations(svc.Labels, svc.Annotations)
			ports := formatServicePorts(svc.Spec.Ports)

			items = append(items, DeploymentResource{
				Name:          svc.Name,
				Namespace:     svc.Namespace,
				Pods:          ports,
				Status:        string(svc.Spec.Type),
				Replicas:      int32(len(svc.Spec.Ports)),
				NodeSelector:  formatServiceSelector(svc.Spec.Selector),
				CreatedAtUnix: svc.CreationTimestamp.Time.Unix(),
				Age:           formatAge(time.Since(svc.CreationTimestamp.Time)),
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

func (c *Client) GetServiceDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("service name is required")
	}

	svc, err := c.clientset.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get service: %w", err)
	}

	labels, annotations := copyLabelsAndAnnotations(svc.Labels, svc.Annotations)
	selector := make(map[string]string, len(svc.Spec.Selector))
	for k, v := range svc.Spec.Selector {
		selector[k] = v
	}

	containers := make([]PodDetailContainer, 0, len(svc.Spec.Ports))
	for _, port := range svc.Spec.Ports {
		containers = append(containers, PodDetailContainer{
			Name:  stringOrDefault(port.Name, fmt.Sprintf("port-%d", port.Port)),
			Image: fmt.Sprintf("%s/%d -> %s", port.Protocol, port.Port, port.TargetPort.String()),
			Ports: []PodDetailPort{{
				Name:          port.Name,
				ContainerPort: port.Port,
				Protocol:      string(port.Protocol),
			}},
		})
	}

	events := objectEvents(ctx, c, namespace, "Service", svc.Name, string(svc.UID))

	svcCopy := svc.DeepCopy()
	svcCopy.ManagedFields = nil
	manifest := marshalManifest(svcCopy)

	conditions := make([]PodDetailCondition, 0)
	for _, ingress := range svc.Status.LoadBalancer.Ingress {
		conditions = append(conditions, PodDetailCondition{
			Type:    "LoadBalancer",
			Status:  "True",
			Message: stringOrDefault(ingress.Hostname, ingress.IP),
		})
	}

	return &DeploymentDetail{
		Name:            svc.Name,
		Namespace:       svc.Namespace,
		Status:          string(svc.Spec.Type),
		Replicas:        int32(len(svc.Spec.Ports)),
		StrategyType:    string(svc.Spec.Type),
		Age:             formatAge(time.Since(svc.CreationTimestamp.Time)),
		Created:         svc.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(svc.UID), "-"),
		ResourceVersion: stringOrDefault(svc.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        selector,
		Conditions:      conditions,
		Containers:      containers,
		Events:          events,
		Manifest:        manifest,
	}, nil
}

func (c *Client) UpdateServiceManifest(ctx context.Context, namespace string, name string, manifest string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("service name is required")
	}
	if strings.TrimSpace(manifest) == "" {
		return fmt.Errorf("manifest is required")
	}

	var svc corev1.Service
	if err := yaml.Unmarshal([]byte(manifest), &svc); err != nil {
		return fmt.Errorf("failed to parse service manifest: %w", err)
	}

	svc.Name = name
	svc.Namespace = namespace

	current, err := c.clientset.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get existing service: %w", err)
	}

	if strings.TrimSpace(svc.ResourceVersion) == "" {
		svc.ResourceVersion = current.ResourceVersion
	}
	svc.ManagedFields = nil

	if _, err := c.clientset.CoreV1().Services(namespace).Update(ctx, &svc, metav1.UpdateOptions{}); err != nil {
		return fmt.Errorf("failed to update service: %w", err)
	}
	return nil
}

func (c *Client) DeleteService(ctx context.Context, namespace string, name string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("service name is required")
	}

	if err := c.clientset.CoreV1().Services(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("failed to delete service: %w", err)
	}
	return nil
}

func formatServicePorts(ports []corev1.ServicePort) string {
	if len(ports) == 0 {
		return "-"
	}
	parts := make([]string, 0, len(ports))
	for _, p := range ports {
		part := fmt.Sprintf("%d/%s", p.Port, p.Protocol)
		if p.Name != "" {
			part = fmt.Sprintf("%s:%s", p.Name, part)
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, ", ")
}

func formatServiceSelector(selector map[string]string) string {
	if len(selector) == 0 {
		return "-"
	}
	parts := make([]string, 0, len(selector))
	for k, v := range selector {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	sort.Strings(parts)
	return strings.Join(parts, ", ")
}
