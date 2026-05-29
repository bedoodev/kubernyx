package kube

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestCleanupManagedNodeDebugPodsSkipsActivePods(t *testing.T) {
	t.Parallel()

	clientset := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "stale",
				Namespace: debugPodNamespace,
				Labels: map[string]string{
					"kubernyx/debug":      "true",
					"kubernyx/node-shell": "true",
				},
			},
			Spec: corev1.PodSpec{NodeName: "node-a"},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "active",
				Namespace: debugPodNamespace,
				Labels: map[string]string{
					"kubernyx/debug":      "true",
					"kubernyx/node-shell": "true",
				},
			},
			Spec: corev1.PodSpec{NodeName: "node-a"},
		},
	)

	client := &Client{clientset: clientset}
	active := map[string]struct{}{"active": {}}

	if err := client.CleanupManagedNodeDebugPods(context.Background(), "node-a", active); err != nil {
		t.Fatalf("cleanup managed debug pods: %v", err)
	}

	pods, err := clientset.CoreV1().Pods(debugPodNamespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatalf("list debug pods: %v", err)
	}

	if len(pods.Items) != 1 || pods.Items[0].Name != "active" {
		t.Fatalf("expected only active pod to remain, got %+v", pods.Items)
	}
}
