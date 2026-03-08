# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kubernyx is a lightweight desktop Kubernetes IDE built with Wails v2 (Go backend + React/TypeScript frontend). It manages kubeconfig files in a user-selected directory and provides cluster dashboards with real-time pod streaming, workload management, and an integrated kubectl terminal.

## Tech Stack

- **Backend:** Go 1.23 with client-go and k8s.io/metrics for Kubernetes API interactions
- **Frontend:** React 18 + TypeScript (strict mode), bundled with Vite
- **Desktop:** Wails v2 (Go ↔ WebView bridge)
- **Dependencies:** Minimal — frontend has only React/ReactDOM as runtime deps, no UI library

## Build Commands

- **Full build:** `make build` or `~/go/bin/wails build` — produces macOS .app in `build/bin/`
- **Dev mode:** `make dev` or `~/go/bin/wails dev` — hot-reload frontend + Go backend
- **Go only:** `go build ./...`
- **Frontend only:** `cd frontend && npm run build` (runs `tsc && vite build`)
- **TypeScript check:** `cd frontend && npx tsc --noEmit`
- **Go tests:** `go test ./...`
- **Clean:** `make clean` (async, handles macOS file locking)

**Important:** Go backend changes (new/modified App methods) require a full `wails build` or `wails dev` restart — frontend hot-reload alone won't pick them up. Wails regenerates bindings in `wailsjs/` during build.

## Architecture

### Go Backend

```
main.go              — Wails entry point, embeds frontend/dist, window config (1280x820, min 960x600)
app.go               — App struct bound to Wails; all exported methods callable from JS
                       Cluster ops: ListClusters, AddCluster, RenameCluster, DeleteCluster,
                         ConnectCluster, Get/SetBasePath, GetClusterConfig, UpdateClusterConfig
                       Overview: RefreshOverview, GetWorkloads
                       Pods: GetPodDetails, GetPodLogs, ExecPodCommand, DeletePodResource,
                         SavePodLogsFile, StartPodsStream/StopPodsStream,
                         StartPodLogsStream/StopPodLogsStream
                       Unified workloads: GetWorkloadResources, GetWorkloadDetails,
                         GetWorkloadLogs, UpdateWorkloadManifest, ScaleWorkload,
                         DeleteWorkloadResource, RestartWorkload,
                         TriggerCronJobResource, SetCronJobSuspendResource
                       Network: uses unified workload methods with service/ingress kinds
                       Nodes: GetNodeResources, GetNodeDetail, DebugNode
                       Events: GetClusterEvents
                       Terminal: ExecClusterKubectl, CompleteClusterKubectl
                       Legacy deployment-specific: GetDeploymentResources, GetDeploymentDetails,
                         GetDeploymentLogs, UpdateDeploymentManifest, ScaleDeployment,
                         DeleteDeploymentResource
internal/
  config/config.go   — AppConfig struct, persists base directory to ~/.kubernyx/config.json
  cluster/           — manager.go (CRUD + listing + GetKubeconfigPath), health.go (parallel health checks)
  kube/              — client.go (K8s client wrapper), types.go (30+ response structs),
                       overview.go, workloads.go, pods.go, deployments.go,
                       workload_controllers.go (unified multi-kind handler),
                       services.go, ingress.go, nodes.go, events.go,
                       pod_exec.go, format.go, volume.go, helpers.go
```

### Frontend (Feature-Based Structure)

```
frontend/src/
  App.tsx                — Root: tab system, sidebar, detail panels, terminal panel, keyboard shortcuts
  shared/
    api/index.ts         — Barrel export of all Wails bindings
    types/               — cluster.ts, overview.ts, workloads.ts, pods.ts, deployments.ts,
                           config.ts, network.ts, nodes.ts, events.ts, index.ts (barrel)
    hooks/               — useClusterTabs, useDragResize, useKeyboardShortcuts,
                           useSidebarResize, useShortcutSettings
    utils/               — formatting.ts, normalization.ts, platform.ts
    components/          — Modal.tsx, YamlEditor.tsx
  features/
    setup/               — First-launch directory picker
    sidebar/             — Cluster tree + AddClusterModal, EditClusterModal, context menu
    overview/            — Dashboard: SummaryCards, ResourceCharts, WorkloadBars
    workloads/           — WorkloadsView, workloadKinds.ts (kind mapping helpers)
      pods/              — PodsTable, PodDetailPanel, usePodsStream, usePodDetail, usePodLogs
      deployments/       — DeploymentsTable, DeploymentDetailPanel, useDeployments,
                           useDeploymentDetail, useDeploymentLogs
      shared/            — usePollingFetch, detailHelpers
    config/              — ConfigView, ConfigTable, ConfigDetailPanel, configKinds.ts,
                           useConfigResources, useConfigDetail
    network/             — NetworkView, NetworkTable, NetworkDetailPanel, networkKinds.ts,
                           useNetworkResources, useNetworkDetail
    nodes/               — NodesView, NodeDetailPanel, useNodeResources, useNodeDetail
    events/              — EventsView, useClusterEvents
    terminal/            — ClusterTerminalPanel (multi-tab kubectl terminal with tab completion)
    namespace-filter/    — Searchable multi-select namespace dropdown
    settings/            — Settings modal, KeyboardShortcuts config
  wailsjs/               — Auto-generated Wails bindings (DO NOT manually edit)
```

## Key Patterns

- **Wails bindings:** All exported methods on `App` struct in `app.go` auto-bind to `wailsjs/go/main/App`. Frontend wraps these in `shared/api/index.ts`. Wails regenerates bindings on build — never manually edit `wailsjs/` files.
- **Tab system:** `useClusterTabs` hook manages `ClusterTabState` per cluster — each tab owns its overview, workloads, namespace filter, and loading/error state. Inactive tabs auto-close; double-click pins a tab.
- **Sidebar tree:** Clusters expand to show sections: Overview, Workloads (Pods, Deployments, DaemonSets, etc.), Config (ConfigMaps, Secrets), Network (Services, Ingresses), Nodes, Events. Right-click context menu on clusters offers "Open Terminal", "Edit kubeconfig", and "Delete".
- **Unified workload controllers:** `workload_controllers.go` handles Deployments, DaemonSets, StatefulSets, ReplicaSets, Jobs, and CronJobs through a single `kind` string parameter. Frontend maps tab IDs to API kinds via `workloadKinds.ts`. The `deployments.go` file has older deployment-specific methods that predate this pattern.
- **Detail panels:** `PodDetailTabState` in `App.tsx` manages split-panel detail views with kind-based rendering (`'pod' | 'deployment' | 'config' | 'network' | 'node'`). `normalizeDetailPanelTab` maps tab IDs to valid tabs per kind. Detail panels support minimize, maximize, and drag-resize.
- **Terminal panel:** `ClusterTerminalPanel` renders an IDE-style terminal at the bottom of the screen. Supports multiple tabs (one per cluster), resizable height, tab completion via `CompleteClusterKubectl`, and command execution via `ExecClusterKubectl`. Opened via sidebar right-click or Cmd+T shortcut.
- **Streaming:** Two independent streams — `StartPodsStream`/`StopPodsStream` (emits `pods-stream` events) and `StartPodLogsStream`/`StopPodLogsStream` (emits `pod-logs-stream` events). Both use background goroutines with watch + polling and sequence numbers to prevent stale data.
- **Cluster health:** `ListClusters` runs parallel health checks with a goroutine semaphore, classifying clusters as green/yellow/red.
- **Concurrency:** `App.client`, stream cancels, and stream sequence numbers are protected by `sync.RWMutex` since Wails dispatches bound methods on separate goroutines.
- **Path safety:** `cluster.safeJoin()` prevents path traversal on all file operations.
- **Type architecture:** Frontend types live in `shared/types/` (not auto-generated). Wails-generated models in `wailsjs/go/models.ts` exist but the frontend uses its own type definitions.
- **Drag resize:** Generic `useDragResize` hook powers sidebar resizing, column resizing in PodsTable, and detail panel resizing.
- **Keyboard shortcuts:** Configurable via `useShortcutSettings` hook (persisted to localStorage). Defaults: Cmd+W closes active tab, Cmd+B toggles sidebar, Cmd+D toggles detail panel, Cmd+T opens cluster terminal. Escape navigates back. Settings UI allows rebinding.
- **Cluster filename pattern:** Most App methods that operate on a connected cluster take a `filename` parameter (the kubeconfig filename), create a temporary `kube.Client` via `newTempClient`, and run the operation. Only `ConnectCluster`/`RefreshOverview`/`GetWorkloads` use the persistent `a.client`.
- **CSS:** No CSS framework — all hand-written CSS using CSS custom properties for theming (`--bg-primary`, `--accent`, `--border`, etc.). Each feature has co-located `.css` files.
- **No tests currently:** The project has no Go or frontend test files. `go test ./...` and `npx tsc --noEmit` are the main validation commands.
