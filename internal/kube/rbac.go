package kube

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type RbacResource struct {
	Kind          string `json:"kind"`
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	RoleRef       string `json:"roleRef"`
	Subjects      string `json:"subjects"`
	SubjectCount  int    `json:"subjectCount"`
	Rules         int    `json:"rules"`
	APIGroups     string `json:"apiGroups"`
	Resources     string `json:"resources"`
	Verbs         string `json:"verbs"`
	Age           string `json:"age"`
	CreatedAtUnix int64  `json:"createdAtUnix"`
}

const (
	rbacKindRoles               = "roles"
	rbacKindRoleBindings        = "role-bindings"
	rbacKindClusterRoles        = "cluster-roles"
	rbacKindClusterRoleBindings = "cluster-role-bindings"
)

func (c *Client) GetRbacResources(ctx context.Context, kind string, namespaces []string) ([]RbacResource, error) {
	switch kind {
	case rbacKindRoles:
		return c.getRoles(ctx, namespaces)
	case rbacKindRoleBindings:
		return c.getRoleBindings(ctx, namespaces)
	case rbacKindClusterRoles:
		return c.getClusterRoles(ctx)
	case rbacKindClusterRoleBindings:
		return c.getClusterRoleBindings(ctx)
	default:
		return nil, fmt.Errorf("unsupported rbac kind: %s", kind)
	}
}

func (c *Client) getRoles(ctx context.Context, namespaces []string) ([]RbacResource, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]RbacResource, 0)
	for _, ns := range selectedNamespaces {
		list, err := c.clientset.RbacV1().Roles(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list roles: %w", err)
		}
		for _, item := range list.Items {
			items = append(items, roleResource("Role", item.Name, item.Namespace, item.CreationTimestamp.Time, item.Rules))
		}
	}
	sortRbacResources(items)
	return items, nil
}

func (c *Client) getRoleBindings(ctx context.Context, namespaces []string) ([]RbacResource, error) {
	selectedNamespaces := namespaces
	if len(selectedNamespaces) == 0 {
		selectedNamespaces = []string{""}
	}

	items := make([]RbacResource, 0)
	for _, ns := range selectedNamespaces {
		list, err := c.clientset.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list role bindings: %w", err)
		}
		for _, item := range list.Items {
			items = append(items, bindingResource("RoleBinding", item.Name, item.Namespace, item.CreationTimestamp.Time, item.RoleRef, item.Subjects))
		}
	}
	sortRbacResources(items)
	return items, nil
}

func (c *Client) getClusterRoles(ctx context.Context) ([]RbacResource, error) {
	list, err := c.clientset.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list cluster roles: %w", err)
	}

	items := make([]RbacResource, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, roleResource("ClusterRole", item.Name, "", item.CreationTimestamp.Time, item.Rules))
	}
	sortRbacResources(items)
	return items, nil
}

func (c *Client) getClusterRoleBindings(ctx context.Context) ([]RbacResource, error) {
	list, err := c.clientset.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list cluster role bindings: %w", err)
	}

	items := make([]RbacResource, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, bindingResource("ClusterRoleBinding", item.Name, "", item.CreationTimestamp.Time, item.RoleRef, item.Subjects))
	}
	sortRbacResources(items)
	return items, nil
}

func roleResource(kind string, name string, namespace string, created time.Time, rules []rbacv1.PolicyRule) RbacResource {
	apiGroups, resources, verbs := summarizePolicyRules(rules)
	return RbacResource{
		Kind:          kind,
		Name:          name,
		Namespace:     namespace,
		Rules:         len(rules),
		APIGroups:     apiGroups,
		Resources:     resources,
		Verbs:         verbs,
		Age:           formatAge(time.Since(created)),
		CreatedAtUnix: created.Unix(),
	}
}

func bindingResource(kind string, name string, namespace string, created time.Time, roleRef rbacv1.RoleRef, subjects []rbacv1.Subject) RbacResource {
	return RbacResource{
		Kind:          kind,
		Name:          name,
		Namespace:     namespace,
		RoleRef:       fmt.Sprintf("%s/%s", roleRef.Kind, roleRef.Name),
		Subjects:      summarizeSubjects(subjects),
		SubjectCount:  len(subjects),
		Age:           formatAge(time.Since(created)),
		CreatedAtUnix: created.Unix(),
	}
}

func summarizePolicyRules(rules []rbacv1.PolicyRule) (string, string, string) {
	apiGroups := make([]string, 0)
	resources := make([]string, 0)
	verbs := make([]string, 0)
	seenAPI := make(map[string]struct{})
	seenResource := make(map[string]struct{})
	seenVerb := make(map[string]struct{})

	for _, rule := range rules {
		appendUnique(&apiGroups, seenAPI, rule.APIGroups)
		appendUnique(&resources, seenResource, rule.Resources)
		appendUnique(&verbs, seenVerb, rule.Verbs)
	}

	return joinOrDash(apiGroups), joinOrDash(resources), joinOrDash(verbs)
}

func summarizeSubjects(subjects []rbacv1.Subject) string {
	if len(subjects) == 0 {
		return "-"
	}

	result := make([]string, 0, len(subjects))
	for _, subject := range subjects {
		name := subject.Name
		if subject.Namespace != "" {
			name = subject.Namespace + "/" + name
		}
		result = append(result, subject.Kind+"/"+name)
	}
	sort.Strings(result)
	return strings.Join(result, ", ")
}

func appendUnique(target *[]string, seen map[string]struct{}, values []string) {
	for _, value := range values {
		if value == "" {
			value = "<core>"
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		*target = append(*target, value)
	}
}

func joinOrDash(values []string) string {
	if len(values) == 0 {
		return "-"
	}
	sort.Strings(values)
	return strings.Join(values, ", ")
}

func sortRbacResources(items []RbacResource) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Namespace != items[j].Namespace {
			return items[i].Namespace < items[j].Namespace
		}
		return items[i].Name < items[j].Name
	})
}
