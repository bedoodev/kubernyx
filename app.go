package main

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"kubernyx-app/internal/cluster"
	"kubernyx-app/internal/config"
	"kubernyx-app/internal/kube"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx             context.Context
	cfg             *config.AppConfig
	mu              sync.RWMutex
	client          *kube.Client
	podStreamCancel context.CancelFunc
	podStreamSeq    uint64
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	cfg, err := config.Load()
	if err != nil {
		cfg = &config.AppConfig{}
	}
	a.cfg = cfg
}

func (a *App) shutdown(_ context.Context) {
	a.StopPodsStream()
}

// GetBasePath returns the configured base directory path.
func (a *App) GetBasePath() string {
	if a.cfg == nil {
		return ""
	}
	return a.cfg.BasePath
}

// SetBasePath sets and persists the base directory path.
func (a *App) SetBasePath(path string) error {
	if a.cfg == nil {
		a.cfg = &config.AppConfig{}
	}
	a.cfg.BasePath = path
	return config.Save(a.cfg)
}

// SelectDirectory opens a native directory picker dialog.
func (a *App) SelectDirectory() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Kubeconfig Directory",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

// ListClusters returns all clusters found in the base directory.
func (a *App) ListClusters() ([]cluster.ClusterInfo, error) {
	if a.cfg == nil {
		return nil, fmt.Errorf("not configured")
	}
	return cluster.ListClusters(a.cfg.BasePath)
}

// AddCluster saves a new kubeconfig file.
func (a *App) AddCluster(name string, content string) error {
	return cluster.SaveCluster(a.cfg.BasePath, name, content)
}

// RenameCluster renames a kubeconfig file.
func (a *App) RenameCluster(oldFilename string, newName string) (string, error) {
	return cluster.RenameCluster(a.cfg.BasePath, oldFilename, newName)
}

// DeleteCluster removes a kubeconfig file.
func (a *App) DeleteCluster(filename string) error {
	return cluster.DeleteCluster(a.cfg.BasePath, filename)
}

// ConnectCluster connects to a cluster and returns the overview.
func (a *App) ConnectCluster(filename string, nodeFilter string) (*kube.ClusterOverview, error) {
	path, err := cluster.GetKubeconfigPath(a.cfg.BasePath, filename)
	if err != nil {
		return nil, err
	}
	client, err := kube.NewClient(path)
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}
	a.mu.Lock()
	a.client = client
	a.mu.Unlock()
	return client.GetClusterOverview(a.ctx, nodeFilter)
}

// RefreshOverview refreshes the cluster overview with the given node filter.
func (a *App) RefreshOverview(nodeFilter string) (*kube.ClusterOverview, error) {
	a.mu.RLock()
	c := a.client
	a.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("no cluster connected")
	}
	return c.GetClusterOverview(a.ctx, nodeFilter)
}

// GetWorkloads returns workload counts for the given namespaces.
func (a *App) GetWorkloads(namespaces []string) (*kube.WorkloadCounts, error) {
	a.mu.RLock()
	c := a.client
	a.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("no cluster connected")
	}
	return c.GetWorkloads(a.ctx, namespaces)
}

// GetPodDetails returns detailed pod information for the given cluster and pod.
func (a *App) GetPodDetails(filename string, namespace string, podName string) (*kube.PodDetail, error) {
	path, err := cluster.GetKubeconfigPath(a.cfg.BasePath, filename)
	if err != nil {
		return nil, err
	}

	client, err := kube.NewClient(path)
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	return client.GetPodDetail(a.ctx, namespace, podName)
}

type PodsStreamEvent struct {
	StreamID         string             `json:"streamId"`
	ClusterFilename  string             `json:"clusterFilename"`
	Items            []kube.PodResource `json:"items"`
	MetricsAvailable bool               `json:"metricsAvailable"`
	UpdatedAtUnix    int64              `json:"updatedAtUnix"`
	Error            string             `json:"error,omitempty"`
}

// StartPodsStream starts a real-time stream for pod resources.
func (a *App) StartPodsStream(filename string, namespaces []string) (string, error) {
	path, err := cluster.GetKubeconfigPath(a.cfg.BasePath, filename)
	if err != nil {
		return "", err
	}

	client, err := kube.NewClient(path)
	if err != nil {
		return "", fmt.Errorf("failed to connect: %w", err)
	}

	a.mu.Lock()
	if a.podStreamCancel != nil {
		a.podStreamCancel()
		a.podStreamCancel = nil
	}
	streamCtx, cancel := context.WithCancel(context.Background())
	a.podStreamCancel = cancel
	a.podStreamSeq++
	streamSeq := a.podStreamSeq
	a.client = client
	a.mu.Unlock()

	streamID := strconv.FormatUint(streamSeq, 10)
	go a.runPodsStream(streamCtx, streamSeq, streamID, filename, client, namespaces)

	return streamID, nil
}

// StopPodsStream stops the active pods stream if it exists.
func (a *App) StopPodsStream() {
	a.mu.Lock()
	cancel := a.podStreamCancel
	a.podStreamCancel = nil
	a.podStreamSeq++
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (a *App) runPodsStream(
	streamCtx context.Context,
	streamSeq uint64,
	streamID string,
	clusterFilename string,
	client *kube.Client,
	namespaces []string,
) {
	changeNotify := make(chan struct{}, 1)
	client.WatchPods(streamCtx, namespaces, changeNotify)

	emitSnapshot := func() error {
		snapshot, err := client.GetPodResources(streamCtx, namespaces)
		event := PodsStreamEvent{
			StreamID:        streamID,
			ClusterFilename: clusterFilename,
			UpdatedAtUnix:   time.Now().Unix(),
		}
		if err != nil {
			event.Error = err.Error()
		} else {
			event.Items = snapshot.Items
			event.MetricsAvailable = snapshot.MetricsAvailable
		}
		runtime.EventsEmit(a.ctx, "pods-stream", event)
		return err
	}

	_ = emitSnapshot()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-streamCtx.Done():
			return
		case <-changeNotify:
			if !a.isCurrentPodsStream(streamSeq) {
				return
			}
			_ = emitSnapshot()
		case <-ticker.C:
			if !a.isCurrentPodsStream(streamSeq) {
				return
			}
			_ = emitSnapshot()
		}
	}
}

func (a *App) isCurrentPodsStream(streamSeq uint64) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.podStreamSeq == streamSeq
}
