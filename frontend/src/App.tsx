import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { GetBasePath, SetBasePath, SelectDirectory } from './shared/api'
import { useSidebarResize } from './shared/hooks/useSidebarResize'
import { useClusterTabs, truncateWithEllipsis } from './shared/hooks/useClusterTabs'
import { useKeyboardShortcuts } from './shared/hooks/useKeyboardShortcuts'
import { useShortcutSettings } from './shared/hooks/useShortcutSettings'
import { useDragResize } from './shared/hooks/useDragResize'
import type { ClusterInfo, DeploymentResource, PodResource } from './shared/types'
import Setup from './features/setup/Setup'
import Sidebar from './features/sidebar/Sidebar'
import Overview from './features/overview/Overview'
import WorkloadsView from './features/workloads/WorkloadsView'
import PodDetailPanel, { type PodDetailsTabId } from './features/workloads/pods/components/PodDetailPanel'
import DeploymentDetailPanel, { type DeploymentDetailsTabId } from './features/workloads/deployments/components/DeploymentDetailPanel'
import { workloadSingularLabel, type NonPodWorkloadTabId } from './features/workloads/workloadKinds'
import { usePodDetail } from './features/workloads/pods/hooks/usePodDetail'
import { usePodLogs } from './features/workloads/pods/hooks/usePodLogs'
import { useDeploymentDetail } from './features/workloads/deployments/hooks/useDeploymentDetail'
import { useDeploymentLogs } from './features/workloads/deployments/hooks/useDeploymentLogs'
import Settings from './features/settings/Settings'
import Modal from './shared/components/Modal'
import './App.css'

type AppView = 'loading' | 'setup' | 'main'

const TAB_NAME_MAX_LENGTH = 20
const APP_DETAIL_LEFT_MIN_WIDTH = 500
const APP_DETAIL_MIN_WIDTH = 420

interface PodDetailTabState {
  id: string
  clusterFilename: string
  clusterName: string
  kind: 'pod' | 'deployment'
  workloadTab?: NonPodWorkloadTabId
  pod?: PodResource
  deployment?: DeploymentResource
  pinned: boolean
}

type DetailPanelTabId = PodDetailsTabId | DeploymentDetailsTabId

function getPodDetailTabId(clusterFilename: string, pod: PodResource): string {
  return `pod:${clusterFilename}:${pod.namespace}:${pod.name}`
}

function getDeploymentDetailTabId(
  clusterFilename: string,
  workloadTab: NonPodWorkloadTabId,
  deployment: DeploymentResource,
): string {
  return `workload:${workloadTab}:${clusterFilename}:${deployment.namespace}:${deployment.name}`
}

function getPodRowKey(pod: PodResource): string {
  return `${pod.namespace}/${pod.name}`
}

function getPodDetailTabDisplayName(tab: PodDetailTabState): string {
  if (tab.kind === 'deployment') {
    const kindLabel = workloadSingularLabel(tab.workloadTab ?? 'deployments')
    return `${kindLabel}: ${tab.deployment?.name ?? '-'} < ${tab.clusterName} >`
  }
  return `${tab.pod?.name ?? '-'} < ${tab.clusterName} >`
}

function normalizeDetailPanelTab(kind: 'pod' | 'deployment', tab?: DetailPanelTabId): DetailPanelTabId {
  if (kind === 'deployment') {
    return (
      tab === 'overview'
      || tab === 'metadata'
      || tab === 'containers'
      || tab === 'yaml'
      || tab === 'scale'
      || tab === 'logs'
    ) ? tab : 'overview'
  }
  return (
    tab === 'overview'
    || tab === 'metadata'
    || tab === 'init-containers'
    || tab === 'containers'
    || tab === 'logs'
    || tab === 'shell'
    || tab === 'usages'
    || tab === 'manifest'
  ) ? tab : 'overview'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getSplitMaxWidth(totalWidth: number): number {
  return Math.max(APP_DETAIL_MIN_WIDTH, totalWidth - APP_DETAIL_LEFT_MIN_WIDTH)
}

export default function App() {
  const { shortcuts, updateShortcut, resetAll: resetShortcuts } = useShortcutSettings()
  const [view, setView] = useState<AppView>('loading')
  const [showSettings, setShowSettings] = useState(false)
  const sidebar = useSidebarResize({ default: 260, min: 220, max: 520 })
  const clusterTabs = useClusterTabs({ showSettings })
  const [podDetailTabs, setPodDetailTabs] = useState<PodDetailTabState[]>([])
  const [activePodDetailTabId, setActivePodDetailTabId] = useState<string | null>(null)
  const [detailPanelTabByPodTabId, setDetailPanelTabByPodTabId] = useState<Record<string, DetailPanelTabId>>({})
  const [detailPanelWidth, setDetailPanelWidth] = useState(560)
  const [detailPanelMaximized, setDetailPanelMaximized] = useState(false)
  const [detailPanelMinimized, setDetailPanelMinimized] = useState(false)
  const [detailPanelWidthBeforeMinimize, setDetailPanelWidthBeforeMinimize] = useState(560)
  const [mainBodyWidth, setMainBodyWidth] = useState(0)
  const mainBodyRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const handleCollapseSnap = useCallback(() => {
    if (!detailPanelMinimized) {
      setDetailPanelWidthBeforeMinimize(detailPanelWidth)
      setDetailPanelWidth(0)
      setDetailPanelMinimized(true)
    }
  }, [detailPanelMinimized, detailPanelWidth])
  const handleExpandSnap = useCallback(() => {
    setDetailPanelMinimized(false)
  }, [])
  const detailsResize = useDragResize({ onUpdate: setDetailPanelWidth, invertDelta: true, onCollapseSnap: handleCollapseSnap, onExpandSnap: handleExpandSnap })

  const activePodDetailTab = useMemo(
    () => (activePodDetailTabId ? (podDetailTabs.find(tab => tab.id === activePodDetailTabId) ?? null) : null),
    [activePodDetailTabId, podDetailTabs],
  )

  const activePodDetailPanelTab = activePodDetailTab
    ? (detailPanelTabByPodTabId[activePodDetailTab.id] ?? 'overview')
    : 'overview'

  const activePodForDetail = activePodDetailTab?.kind === 'pod' ? (activePodDetailTab.pod ?? null) : null
  const activeDeploymentForDetail = activePodDetailTab?.kind === 'deployment'
    ? (activePodDetailTab.deployment ?? null)
    : null
  const activeDeploymentWorkloadTab = activePodDetailTab?.kind === 'deployment'
    ? (activePodDetailTab.workloadTab ?? 'deployments')
    : 'deployments'

  const { podDetail, podDetailLoading, podDetailError } = usePodDetail(
    activePodDetailTab?.clusterFilename ?? '',
    activePodForDetail,
  )
  const { podLogs, podLogsLoading, podLogsError, podLogsLoadingOlder, loadOlderLogs } = usePodLogs(
    activePodDetailTab?.clusterFilename ?? '',
    activePodForDetail,
    Boolean(activePodForDetail && activePodDetailPanelTab === 'logs'),
  )

  const { deploymentDetail, deploymentDetailLoading, deploymentDetailError } = useDeploymentDetail(
    activePodDetailTab?.clusterFilename ?? '',
    activeDeploymentForDetail,
    activeDeploymentWorkloadTab,
  )
  const { deploymentLogs, deploymentLogsLoading, deploymentLogsError } = useDeploymentLogs(
    activePodDetailTab?.clusterFilename ?? '',
    activeDeploymentForDetail,
    Boolean(activeDeploymentForDetail && activePodDetailPanelTab === 'logs'),
    activeDeploymentWorkloadTab,
  )

  const handleClosePodDetailTab = useCallback((tabId: string) => {
    setPodDetailTabs(current => {
      const idx = current.findIndex(tab => tab.id === tabId)
      if (idx < 0) {
        return current
      }

      const next = current.filter(tab => tab.id !== tabId)
      setActivePodDetailTabId(currentActive => {
        if (currentActive !== tabId) {
          return currentActive
        }
        const fallback = next[idx] ?? next[idx - 1] ?? null
        return fallback ? fallback.id : null
      })

      return next
    })
    setDetailPanelTabByPodTabId(current => {
      if (!Object.prototype.hasOwnProperty.call(current, tabId)) {
        return current
      }
      const next = { ...current }
      delete next[tabId]
      return next
    })
    if (activePodDetailTabId === tabId) {
      setDetailPanelMaximized(false)
      if (detailPanelMinimized) {
        setDetailPanelWidth(detailPanelWidthBeforeMinimize)
        setDetailPanelMinimized(false)
      }
    }
  }, [activePodDetailTabId, detailPanelMinimized, detailPanelWidthBeforeMinimize])

  const handleActivatePodDetail = useCallback((cluster: ClusterInfo, pod: PodResource, options: { pin: boolean }) => {
    const tabId = getPodDetailTabId(cluster.filename, pod)
    const inheritedDetailTab = normalizeDetailPanelTab(
      'pod',
      activePodDetailTabId ? detailPanelTabByPodTabId[activePodDetailTabId] : undefined,
    ) as PodDetailsTabId
    setShowSettings(false)

    setPodDetailTabs(current => {
      const existingIndex = current.findIndex(tab => tab.id === tabId)
      if (existingIndex >= 0) {
        const next = [...current]
        next[existingIndex] = {
          ...next[existingIndex],
          clusterName: cluster.name,
          kind: 'pod',
          workloadTab: undefined,
          pod,
          deployment: undefined,
          pinned: next[existingIndex].pinned || options.pin,
        }
        return next
      }

      const base = options.pin ? current : current.filter(tab => tab.pinned)
      return [
        ...base,
        {
          id: tabId,
          clusterFilename: cluster.filename,
          clusterName: cluster.name,
          kind: 'pod',
          workloadTab: undefined,
          pod,
          deployment: undefined,
          pinned: options.pin,
        },
      ]
    })

    setActivePodDetailTabId(tabId)
    if (podDetailTabs.length === 0) {
      const mainBody = mainBodyRef.current
      if (mainBody) {
        const totalWidth = mainBody.clientWidth
        const maxWidth = getSplitMaxWidth(totalWidth)
        const halfWidth = Math.floor(totalWidth / 2)
        setDetailPanelWidth(clamp(halfWidth, APP_DETAIL_MIN_WIDTH, maxWidth))
      }
    }
    setDetailPanelTabByPodTabId(current => (
      Object.prototype.hasOwnProperty.call(current, tabId)
        ? current
        : { ...current, [tabId]: inheritedDetailTab }
    ))
  }, [activePodDetailTabId, detailPanelTabByPodTabId, podDetailTabs.length])

  const handleActivateDeploymentDetail = useCallback((
    cluster: ClusterInfo,
    workloadTab: NonPodWorkloadTabId,
    deployment: DeploymentResource,
    options: { pin: boolean },
  ) => {
    const tabId = getDeploymentDetailTabId(cluster.filename, workloadTab, deployment)
    const inheritedDetailTab = normalizeDetailPanelTab(
      'deployment',
      activePodDetailTabId ? detailPanelTabByPodTabId[activePodDetailTabId] : undefined,
    ) as DeploymentDetailsTabId
    setShowSettings(false)

    setPodDetailTabs(current => {
      const existingIndex = current.findIndex(tab => tab.id === tabId)
      if (existingIndex >= 0) {
        const next = [...current]
        next[existingIndex] = {
          ...next[existingIndex],
          clusterName: cluster.name,
          kind: 'deployment',
          workloadTab,
          deployment,
          pod: undefined,
          pinned: next[existingIndex].pinned || options.pin,
        }
        return next
      }

      const base = options.pin ? current : current.filter(tab => tab.pinned)
      return [
        ...base,
        {
          id: tabId,
          clusterFilename: cluster.filename,
          clusterName: cluster.name,
          kind: 'deployment',
          workloadTab,
          deployment,
          pod: undefined,
          pinned: options.pin,
        },
      ]
    })

    setActivePodDetailTabId(tabId)
    if (podDetailTabs.length === 0) {
      const mainBody = mainBodyRef.current
      if (mainBody) {
        const totalWidth = mainBody.clientWidth
        const maxWidth = getSplitMaxWidth(totalWidth)
        const halfWidth = Math.floor(totalWidth / 2)
        setDetailPanelWidth(clamp(halfWidth, APP_DETAIL_MIN_WIDTH, maxWidth))
      }
    }
    setDetailPanelTabByPodTabId(current => (
      Object.prototype.hasOwnProperty.call(current, tabId)
        ? current
        : { ...current, [tabId]: inheritedDetailTab }
    ))
  }, [activePodDetailTabId, detailPanelTabByPodTabId, podDetailTabs.length])

  const handlePodDetailPanelTabChange = useCallback((tab: DetailPanelTabId) => {
    if (!activePodDetailTabId) {
      return
    }
    setDetailPanelTabByPodTabId(current => ({ ...current, [activePodDetailTabId]: tab }))
  }, [activePodDetailTabId])

  const handleToggleDetailMinimize = useCallback(() => {
    if (detailPanelMinimized) {
      setDetailPanelWidth(detailPanelWidthBeforeMinimize)
      setDetailPanelMinimized(false)
    } else {
      setDetailPanelWidthBeforeMinimize(detailPanelWidth)
      setDetailPanelWidth(48)
      setDetailPanelMinimized(true)
    }
  }, [detailPanelMinimized, detailPanelWidth, detailPanelWidthBeforeMinimize])

  const handleEscapeNav = useCallback(() => {
    if (activePodDetailTabId) {
      handleClosePodDetailTab(activePodDetailTabId)
      const podsTableWrap = document.querySelector('.pods-table-wrap') as HTMLElement | null
      podsTableWrap?.focus()
      return
    }
    const clusterList = sidebarRef.current?.querySelector('.cluster-list') as HTMLElement | null
    clusterList?.focus()
  }, [activePodDetailTabId, handleClosePodDetailTab])

  useKeyboardShortcuts({
    enabled: view === 'main',
    shortcuts,
    showSettings,
    activeTabId: activePodDetailTabId,
    hasDetailPanel: Boolean(activePodDetailTab),
    onCloseSettings: () => setShowSettings(false),
    onCloseTab: handleClosePodDetailTab,
    onToggleSidebar: sidebar.onToggle,
    onToggleDetailMinimize: handleToggleDetailMinimize,
    onEscapeNav: handleEscapeNav,
  })

  useEffect(() => {
    GetBasePath().then(path => {
      if (path) {
        clusterTabs.loadClusters()
        setView('main')
      } else {
        setView('setup')
      }
    }).catch(() => setView('setup'))
  }, [])

  useEffect(() => {
    if (!activePodDetailTabId) {
      return
    }
    if (podDetailTabs.some(tab => tab.id === activePodDetailTabId)) {
      return
    }
    setActivePodDetailTabId(podDetailTabs[0]?.id ?? null)
  }, [activePodDetailTabId, podDetailTabs])

  useEffect(() => {
    const clusterNamesByFilename = new Map(clusterTabs.clusters.map(cluster => [cluster.filename, cluster.name]))
    setPodDetailTabs(current => current.flatMap(tab => {
      const nextClusterName = clusterNamesByFilename.get(tab.clusterFilename)
      if (!nextClusterName) {
        return []
      }
      if (nextClusterName === tab.clusterName) {
        return [tab]
      }
      return [{ ...tab, clusterName: nextClusterName }]
    }))
  }, [clusterTabs.clusters])

  useEffect(() => {
    const validTabIds = new Set(podDetailTabs.map(tab => tab.id))
    setDetailPanelTabByPodTabId(current => {
      let changed = false
      const next: Record<string, DetailPanelTabId> = {}
      for (const [tabId, value] of Object.entries(current)) {
        if (!validTabIds.has(tabId)) {
          changed = true
          continue
        }
        next[tabId] = value
      }
      return changed ? next : current
    })
  }, [podDetailTabs])

  useEffect(() => {
    if (!activePodDetailTab) {
      setDetailPanelMaximized(false)
      return
    }

    const syncDetailWidth = () => {
      const mainBody = mainBodyRef.current
      if (!mainBody) {
        return
      }
      const totalWidth = mainBody.clientWidth
      const maxWidth = getSplitMaxWidth(totalWidth)
      setDetailPanelWidth(current => clamp(current, APP_DETAIL_MIN_WIDTH, maxWidth))
    }

    syncDetailWidth()
    window.addEventListener('resize', syncDetailWidth)
    return () => window.removeEventListener('resize', syncDetailWidth)
  }, [activePodDetailTab])

  useEffect(() => {
    const mainBody = mainBodyRef.current
    if (!mainBody) {
      return
    }

    const syncWidth = () => setMainBodyWidth(mainBody.clientWidth)
    syncWidth()

    const observer = new ResizeObserver(() => syncWidth())
    observer.observe(mainBody)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (podDetailTabs.length !== 0) {
      return
    }

    const mainBody = mainBodyRef.current
    if (!mainBody) {
      return
    }

    const totalWidth = mainBody.clientWidth
    const maxWidth = getSplitMaxWidth(totalWidth)
    const defaultHalf = clamp(Math.floor(totalWidth / 2), APP_DETAIL_MIN_WIDTH, maxWidth)
    setDetailPanelWidth(defaultHalf)
  }, [podDetailTabs.length])

  const handleSetup = async () => {
    try {
      const dir = await SelectDirectory()
      if (!dir) return
      await SetBasePath(dir)
      await clusterTabs.loadClusters()
      setView('main')
    } catch {
      setView('setup')
    }
  }

  const handleSelectCluster: typeof clusterTabs.handleSelectCluster = (...args) => {
    setShowSettings(false)
    clusterTabs.handleSelectCluster(...args)
  }

  if (view === 'loading') {
    return <div className="app-loading"><div className="spinner" /></div>
  }

  if (view === 'setup') {
    return <Setup onSelect={handleSetup} />
  }

  const { activeTab } = clusterTabs
  const activePodKey = (activeTab?.section === 'workloads'
    && activeTab.workloadTab === 'pods'
    && activePodDetailTab
    && activePodDetailTab.kind === 'pod'
    && activePodDetailTab.clusterFilename === activeTab.cluster.filename)
    ? getPodRowKey(activePodDetailTab.pod as PodResource)
    : null

  const activeDeploymentKey = (activeTab?.section === 'workloads'
    && activeTab.workloadTab !== 'pods'
    && activePodDetailTab
    && activePodDetailTab.kind === 'deployment'
    && activePodDetailTab.clusterFilename === activeTab.cluster.filename
    && (activePodDetailTab.workloadTab ?? 'deployments') === activeTab.workloadTab)
    ? `${activePodDetailTab.deployment?.namespace ?? ''}/${activePodDetailTab.deployment?.name ?? ''}`
    : null

  const handleDetailsResizeStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const mainBody = mainBodyRef.current
    if (!mainBody) {
      return
    }

    const totalWidth = mainBody.clientWidth
    const maxWidth = getSplitMaxWidth(totalWidth)
    detailsResize.start(event, detailPanelWidth, APP_DETAIL_MIN_WIDTH, maxWidth)
  }



  return (
    <div className={`app-layout ${sidebar.sidebarResizing ? 'resizing' : ''} ${sidebar.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {sidebar.sidebarCollapsed && !sidebar.sidebarResizing ? (
        <button
          type="button"
          className="sidebar-collapsed-toggle"
          onClick={sidebar.onToggle}
          aria-label="Show sidebar"
          title="Show Sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <path d="M8 4v16"/>
            <path d="M11 12h5"/>
          </svg>
        </button>
      ) : (
        <>
          <Sidebar
            ref={sidebarRef}
            width={sidebar.sidebarCollapsed ? 0 : sidebar.sidebarWidth}
            clusters={clusterTabs.clusters}
            activeCluster={activeTab?.cluster ?? null}
            activeSection={activeTab?.section ?? null}
            activeWorkloadTab={activeTab?.section !== 'workloads' ? null : activeTab.workloadTab}
            showSettings={showSettings}
            onToggleCollapse={sidebar.onToggle}
            onSelect={handleSelectCluster}
            onAdd={clusterTabs.handleAddCluster}
            onRename={clusterTabs.handleRenameCluster}
            onDelete={clusterTabs.handleDeleteCluster}
            onReadConfig={clusterTabs.handleGetClusterConfig}
            onUpdateConfig={clusterTabs.handleUpdateClusterConfig}
            onSettingsClick={() => setShowSettings(true)}
          />
          <div
            className={`sidebar-resizer ${sidebar.sidebarResizing ? 'active' : ''}`}
            onMouseDown={sidebar.onResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        </>
      )}
      <main className="main-panel">
        {podDetailTabs.length > 0 && (
          <div className="cluster-tabs">
            {podDetailTabs.map(tab => {
              const fullTabName = getPodDetailTabDisplayName(tab)
              const tabName = truncateWithEllipsis(fullTabName, TAB_NAME_MAX_LENGTH)
              return (
                <div
                  key={tab.id}
                  className={`cluster-tab ${activePodDetailTabId === tab.id ? 'active' : ''}`}
                  onClick={() => setActivePodDetailTabId(tab.id)}
                  title={fullTabName}
                >
                  {tab.pinned && (
                    <span className="cluster-tab-pin" title="Pinned detail tab">•</span>
                  )}
                  <span className="cluster-tab-name">{tabName}</span>
                  <button
                    type="button"
                    className="cluster-tab-close"
                    onClick={event => {
                      event.stopPropagation()
                      handleClosePodDetailTab(tab.id)
                    }}
                    aria-label={`Close ${fullTabName} tab`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className={`main-body ${detailsResize.isResizing ? 'resizing' : ''}`} ref={mainBodyRef}>
          <div className="main-content">
            {!activeTab ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <h2>Select a cluster</h2>
                <p>Expand a cluster from the sidebar and select Overview or a Workload type</p>
              </div>
            ) : activeTab.section === 'workloads' ? (
              <WorkloadsView
                cluster={activeTab.cluster}
                activeTab={activeTab.workloadTab}
                namespaces={clusterTabs.activeWorkloadNamespaceOptions}
                selectedNamespaces={clusterTabs.activeWorkloadNamespaces}
                onNamespacesChange={clusterTabs.handleWorkloadNamespacesChange}
                activePodKey={activePodKey}
                activeDeploymentKey={activeDeploymentKey}
                onPodActivate={(pod, options) => handleActivatePodDetail(activeTab.cluster, pod, options)}
                onDeploymentActivate={(deployment, options) => handleActivateDeploymentDetail(
                  activeTab.cluster,
                  activeTab.workloadTab as NonPodWorkloadTabId,
                  deployment,
                  options,
                )}
              />
            ) : (
              <Overview
                cluster={activeTab.cluster}
                overview={activeTab.overview}
                workloads={activeTab.workloads}
                nodeFilter={activeTab.nodeFilter}
                selectedNamespaces={activeTab.selectedNamespaces}
                loading={activeTab.loading}
                error={activeTab.error}
                onNodeFilterChange={clusterTabs.handleNodeFilterChange}
                onNamespacesChange={clusterTabs.handleNamespacesChange}
              />
            )}
          </div>

          {activePodDetailTab && (
            <>
              {!detailPanelMaximized && (!detailPanelMinimized || detailsResize.isResizing) && (
                <button
                  type="button"
                  className="app-detail-split-resizer"
                  onMouseDown={handleDetailsResizeStart}
                  aria-label="Resize details panel"
                />
              )}
              {detailPanelMinimized && !detailPanelMaximized && !detailsResize.isResizing ? (
                <button
                  type="button"
                  className="app-detail-collapsed-tab"
                  onClick={handleToggleDetailMinimize}
                  title="Expand detail panel (Cmd+D)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              ) : (
                <aside
                  className={`app-pod-detail-pane ${detailPanelMaximized ? 'is-maximized' : ''}`}
                  style={detailPanelMaximized ? undefined : { width: `${detailPanelWidth}px`, minWidth: `${detailPanelWidth}px` }}
                >
                  {!detailPanelMaximized && (
                    <button
                      type="button"
                      className="app-detail-collapse-btn"
                      onClick={handleToggleDetailMinimize}
                      title="Collapse detail panel (Cmd+D)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  )}
                  {activePodDetailTab.kind === 'pod' ? (
                    <PodDetailPanel
                      clusterFilename={activePodDetailTab.clusterFilename}
                      mode={detailPanelMaximized ? 'modal' : 'split'}
                      activeDetailsTab={normalizeDetailPanelTab('pod', activePodDetailPanelTab) as PodDetailsTabId}
                      onDetailsTabChange={handlePodDetailPanelTabChange}
                      selectedPod={activePodDetailTab.pod as PodResource}
                      podDetail={podDetail}
                      podDetailLoading={podDetailLoading}
                      podDetailError={podDetailError}
                      podLogs={podLogs}
                      podLogsLoading={podLogsLoading}
                      podLogsError={podLogsError}
                      podLogsLoadingOlder={podLogsLoadingOlder}
                      onLoadOlderLogs={loadOlderLogs}
                      detailsMaximized={detailPanelMaximized}
                      showMaximizeButton
                      onToggleMaximize={() => setDetailPanelMaximized(current => !current)}
                      onClose={() => handleClosePodDetailTab(activePodDetailTab.id)}
                    />
                  ) : (
                    <DeploymentDetailPanel
                      clusterFilename={activePodDetailTab.clusterFilename}
                      workloadTab={activePodDetailTab.workloadTab ?? 'deployments'}
                      mode={detailPanelMaximized ? 'modal' : 'split'}
                      activeDetailsTab={normalizeDetailPanelTab('deployment', activePodDetailPanelTab) as DeploymentDetailsTabId}
                      onDetailsTabChange={handlePodDetailPanelTabChange}
                      selectedDeployment={activePodDetailTab.deployment as DeploymentResource}
                      deploymentDetail={deploymentDetail}
                      deploymentDetailLoading={deploymentDetailLoading}
                      deploymentDetailError={deploymentDetailError}
                      deploymentLogs={deploymentLogs}
                      deploymentLogsLoading={deploymentLogsLoading}
                      deploymentLogsError={deploymentLogsError}
                      detailsMaximized={detailPanelMaximized}
                      showMaximizeButton
                      onToggleMaximize={() => setDetailPanelMaximized(current => !current)}
                      onClose={() => handleClosePodDetailTab(activePodDetailTab.id)}
                    />
                  )}
                </aside>
              )}
            </>
          )}

          {activePodDetailTab && detailPanelMaximized && (
            <div className="app-pod-detail-inline-overlay" onClick={() => setDetailPanelMaximized(false)} />
          )}
        </div>
      </main>

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <Settings
            onPathChanged={clusterTabs.loadClusters}
            embedded
            shortcuts={shortcuts}
            onUpdateShortcut={updateShortcut}
            onResetShortcuts={resetShortcuts}
          />
        </Modal>
      )}
    </div>
  )
}
