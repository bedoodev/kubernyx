package cluster

import (
	"context"
	"time"

	"kubernyx-app/internal/kube"
)

const (
	HealthGreen            = "green"
	HealthYellow           = "yellow"
	HealthRed              = "red"
	healthcheckTimeout     = 4 * time.Second
	maxHealthcheckParallel = 4
)

func checkClusterHealth(kubeconfigPath string) string {
	ctx, cancel := context.WithTimeout(context.Background(), healthcheckTimeout)
	defer cancel()

	client, err := kube.NewClientWithTimeout(kubeconfigPath, healthcheckTimeout)
	if err != nil {
		return HealthRed
	}

	summary, err := client.GetNodeSummary(ctx)
	if err != nil {
		return HealthRed
	}

	switch {
	case summary.Total == 0:
		return HealthYellow
	case summary.NotReady == 0:
		return HealthGreen
	case summary.Ready > 0:
		return HealthYellow
	default:
		return HealthRed
	}
}
