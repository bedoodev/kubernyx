package kube

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

func (c *Client) GetIngressResources(ctx context.Context, namespaces []string) ([]DeploymentResource, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]DeploymentResource, 0)
	for _, ns := range selectedNamespaces {
		ingresses, err := c.clientset.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list ingresses: %w", err)
		}

		for _, ing := range ingresses.Items {
			labels, annotations := copyLabelsAndAnnotations(ing.Labels, ing.Annotations)
			hosts := formatIngressHosts(ing.Spec.Rules)
			className := "-"
			if ing.Spec.IngressClassName != nil {
				className = *ing.Spec.IngressClassName
			}

			items = append(items, DeploymentResource{
				Name:          ing.Name,
				Namespace:     ing.Namespace,
				Pods:          hosts,
				Status:        className,
				Replicas:      int32(len(ing.Spec.Rules)),
				NodeSelector:  formatIngressAddresses(ing.Status.LoadBalancer.Ingress),
				CreatedAtUnix: ing.CreationTimestamp.Time.Unix(),
				Age:           formatAge(time.Since(ing.CreationTimestamp.Time)),
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

func (c *Client) GetIngressDetail(ctx context.Context, namespace string, name string) (*DeploymentDetail, error) {
	if strings.TrimSpace(namespace) == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("ingress name is required")
	}

	ing, err := c.clientset.NetworkingV1().Ingresses(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get ingress: %w", err)
	}

	labels, annotations := copyLabelsAndAnnotations(ing.Labels, ing.Annotations)

	containers := make([]PodDetailContainer, 0)
	for _, rule := range ing.Spec.Rules {
		if rule.HTTP == nil {
			continue
		}
		for _, path := range rule.HTTP.Paths {
			backend := "-"
			if path.Backend.Service != nil {
				backend = fmt.Sprintf("%s:%d", path.Backend.Service.Name, path.Backend.Service.Port.Number)
				if path.Backend.Service.Port.Name != "" {
					backend = fmt.Sprintf("%s:%s", path.Backend.Service.Name, path.Backend.Service.Port.Name)
				}
			}
			pathType := "-"
			if path.PathType != nil {
				pathType = string(*path.PathType)
			}
			containers = append(containers, PodDetailContainer{
				Name:  stringOrDefault(rule.Host, "*") + stringOrDefault(path.Path, "/"),
				Image: fmt.Sprintf("%s -> %s", pathType, backend),
			})
		}
	}

	conditions := make([]PodDetailCondition, 0)
	for _, ingLB := range ing.Status.LoadBalancer.Ingress {
		conditions = append(conditions, PodDetailCondition{
			Type:    "LoadBalancer",
			Status:  "True",
			Message: stringOrDefault(ingLB.Hostname, ingLB.IP),
		})
	}

	for _, tls := range ing.Spec.TLS {
		conditions = append(conditions, PodDetailCondition{
			Type:    "TLS",
			Status:  stringOrDefault(tls.SecretName, "-"),
			Message: strings.Join(tls.Hosts, ", "),
		})
	}

	className := "-"
	if ing.Spec.IngressClassName != nil {
		className = *ing.Spec.IngressClassName
	}

	events := objectEvents(ctx, c, namespace, "Ingress", ing.Name, string(ing.UID))

	ingCopy := ing.DeepCopy()
	ingCopy.ManagedFields = nil
	manifest := marshalManifest(ingCopy)

	return &DeploymentDetail{
		Name:            ing.Name,
		Namespace:       ing.Namespace,
		Status:          className,
		Replicas:        int32(len(ing.Spec.Rules)),
		StrategyType:    className,
		Age:             formatAge(time.Since(ing.CreationTimestamp.Time)),
		Created:         ing.CreationTimestamp.Time.UTC().Format("2006-01-02 15:04:05.000 MST"),
		UID:             stringOrDefault(string(ing.UID), "-"),
		ResourceVersion: stringOrDefault(ing.ResourceVersion, "-"),
		Labels:          labels,
		Annotations:     annotations,
		Selector:        map[string]string{},
		Conditions:      conditions,
		Containers:      containers,
		Events:          events,
		Manifest:        manifest,
	}, nil
}

func (c *Client) UpdateIngressManifest(ctx context.Context, namespace string, name string, manifest string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("ingress name is required")
	}
	if strings.TrimSpace(manifest) == "" {
		return fmt.Errorf("manifest is required")
	}

	var ing networkingv1.Ingress
	if err := yaml.Unmarshal([]byte(manifest), &ing); err != nil {
		return fmt.Errorf("failed to parse ingress manifest: %w", err)
	}

	ing.Name = name
	ing.Namespace = namespace

	current, err := c.clientset.NetworkingV1().Ingresses(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get existing ingress: %w", err)
	}

	if strings.TrimSpace(ing.ResourceVersion) == "" {
		ing.ResourceVersion = current.ResourceVersion
	}
	ing.ManagedFields = nil

	if _, err := c.clientset.NetworkingV1().Ingresses(namespace).Update(ctx, &ing, metav1.UpdateOptions{}); err != nil {
		return fmt.Errorf("failed to update ingress: %w", err)
	}
	return nil
}

func (c *Client) DeleteIngress(ctx context.Context, namespace string, name string) error {
	if strings.TrimSpace(namespace) == "" {
		return fmt.Errorf("namespace is required")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("ingress name is required")
	}

	if err := c.clientset.NetworkingV1().Ingresses(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("failed to delete ingress: %w", err)
	}
	return nil
}

func formatIngressHosts(rules []networkingv1.IngressRule) string {
	if len(rules) == 0 {
		return "-"
	}
	hosts := make([]string, 0, len(rules))
	for _, r := range rules {
		host := stringOrDefault(r.Host, "*")
		hosts = append(hosts, host)
	}
	return strings.Join(hosts, ", ")
}

func formatIngressAddresses(ingresses []networkingv1.IngressLoadBalancerIngress) string {
	if len(ingresses) == 0 {
		return "-"
	}
	addrs := make([]string, 0, len(ingresses))
	for _, i := range ingresses {
		addr := stringOrDefault(i.Hostname, i.IP)
		if addr != "" {
			addrs = append(addrs, addr)
		}
	}
	if len(addrs) == 0 {
		return "-"
	}
	return strings.Join(addrs, ", ")
}
