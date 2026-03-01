package kube

import (
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
)

type Client struct {
	clientset *kubernetes.Clientset
	metrics   *metricsv1beta1.Clientset
	config    *rest.Config
	nodes     []corev1.Node
}

const defaultRequestTimeout = 10 * time.Second

func NewClient(kubeconfigPath string) (*Client, error) {
	return NewClientWithTimeout(kubeconfigPath, defaultRequestTimeout)
}

func NewClientWithTimeout(kubeconfigPath string, timeout time.Duration) (*Client, error) {
	if timeout <= 0 {
		timeout = defaultRequestTimeout
	}

	config, err := clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	if err != nil {
		return nil, fmt.Errorf("failed to build config: %w", err)
	}
	config.Timeout = timeout

	cs, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	mc, _ := metricsv1beta1.NewForConfig(config)

	return &Client{clientset: cs, metrics: mc, config: config}, nil
}
