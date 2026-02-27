# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kubernyx is a lightweight desktop Kubernetes IDE built with Wails v2 (Go backend + React/TypeScript frontend). It manages kubeconfig files in a user-selected directory and provides cluster dashboards with real-time pod streaming.

## Tech Stack

- **Backend:** Go with client-go and k8s.io/metrics for Kubernetes API interactions
- **Frontend:** React 18 + TypeScript, bundled with Vite
- **Desktop:** Wails v2 (Go ↔ WebView bridge)
- **License:** Apache 2.0

## Build Commands

- **Full build:** `make build` or `~/go/bin/wails build` — produces macOS .app in `build/bin/`
- **Dev mode:** `make dev` or `~/go/bin/wails dev` — hot-reload frontend + Go backend
- **Go only:** `go build ./...`
- **Frontend only:** `cd frontend && npm run build`
- **TypeScript check:** `cd frontend && npx tsc --noEmit`
- **Go tests:** `go test ./...`
- **Clean:** `make clean`

## Architecture

```
main.go          — Wails app entry point, embeds frontend/dist, macOS fullscreen enabled
app.go           — App struct bound to frontend via Wails (all exported methods callable from JS)
                   Includes pod streaming goroutine, cluster health checks
internal/
  config/        — Persists base directory path to ~/.kubernyx/config.json
  cluster/       — CRUD on kubeconfig files + parallel health checking via kube client
  kube/          — Kubernetes client: nodes, resources, workloads, pods streaming, pod details
frontend/
  src/App.tsx    — Root component with tab system (ClusterTabState), sidebar resizing, keyboard shortcuts
  src/types.ts   — Frontend type definitions (ClusterSection, WorkloadTabId, etc.)
  src/components/
    Setup.tsx         — First-launch directory picker
    Sidebar.tsx       — Cluster tree (expandable with Overview/Workloads sub-items) + add/rename/delete modal
    Overview.tsx      — Dashboard layout: summary cards, resource charts, namespace filter, workload bars
    WorkloadsView.tsx — Workload tab view with workload type sub-tabs
    PodsTable.tsx     — Real-time pods table with streaming data
    SummaryCards.tsx   — Node count cards + segmented readiness bar
    ResourceCharts.tsx — Multi-ring SVG gauge charts for CPU/Memory/Pods
    NamespaceFilter.tsx — Searchable multi-select namespace dropdown
    WorkloadBars.tsx   — Multi-segment horizontal bars with phase breakdown tooltips
    Settings.tsx       — Base path configuration (shown as modal overlay)
  wailsjs/       — Auto-generated Wails bindings (DO NOT manually edit models.ts or App.js/App.d.ts)
```

## Key Patterns

- **Wails bindings:** All exported methods on `App` struct in `app.go` are auto-bound and callable from frontend via `wailsjs/go/main/App`. Wails regenerates bindings on build.
- **Tab system:** Each cluster view opens as a tab (`ClusterTabState`) with its own overview, workloads, namespace filter, and loading/error state. Tabs track `hasActivity` — inactive tabs auto-close when switching. Double-click pins a tab.
- **Sidebar tree:** Clusters expand to show Overview and Workloads sub-items. Workloads further expands to individual workload types (Pods, Deployments, etc.).
- **Pod streaming:** `StartPodsStream`/`StopPodsStream` manage a background goroutine that uses watch + periodic polling, emitting `pods-stream` Wails events. Sequence numbers prevent stale data from old streams.
- **Cluster health:** `ListClusters` runs parallel health checks with a goroutine semaphore, classifying clusters as green/yellow/red.
- **Workload phases:** Go functions classify each workload type into running/pending/failed/succeeded phase counts.
- **Path safety:** `cluster.safeJoin()` prevents path traversal on all file operations.
- **Concurrency:** `App.client`, `podStreamCancel`, `podStreamSeq` are protected by `sync.RWMutex` since Wails dispatches bound methods on separate goroutines.
- **Config persistence:** App config stored at `~/.kubernyx/config.json`.
- **Types:** Frontend types in `src/types.ts` mirror Go structs; Wails-generated models in `wailsjs/go/models.ts`.
- **Keyboard shortcuts:** Cmd+W closes active tab, Cmd+B toggles sidebar, Escape closes settings modal.
