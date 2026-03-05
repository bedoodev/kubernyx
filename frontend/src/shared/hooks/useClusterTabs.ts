import { useState, useCallback, useEffect, useRef } from 'react'
import type { ClusterInfo, ClusterOverview, WorkloadCounts, NodeFilter, ClusterSection, WorkloadTabId, ConfigTabId } from '../types'
import { WORKLOAD_TAB_OPTIONS, CONFIG_TAB_OPTIONS } from '../types'
import { toClusterHealthStatus, normalizeWorkloads } from '../utils/normalization'
import {
  ListClusters,
  ConnectCluster,
  RefreshOverview,
  GetWorkloads,
  AddCluster as AddClusterApi,
  RenameCluster as RenameClusterApi,
  DeleteCluster as DeleteClusterApi,
  GetClusterConfig as GetClusterConfigApi,
  UpdateClusterConfig as UpdateClusterConfigApi,
} from '../api'

const DOUBLE_SELECT_WINDOW_MS = 400
const OVERVIEW_TAB_TITLE = 'Overview'
const DEFAULT_WORKLOAD_TAB: WorkloadTabId = 'pods'
const DEFAULT_CONFIG_TAB: ConfigTabId = 'config-maps'

export interface ClusterTabState {
  id: string
  title: string
  section: ClusterSection
  workloadTab: WorkloadTabId
  configTab: ConfigTabId
  hasActivity: boolean
  cluster: ClusterInfo
  overview: ClusterOverview | null
  workloads: WorkloadCounts | null
  nodeFilter: NodeFilter
  selectedNamespaces: string[]
  loading: boolean
  error: string | null
}

export function getClusterTabId(
  section: ClusterSection,
  clusterFilename: string,
  workloadTab: WorkloadTabId = DEFAULT_WORKLOAD_TAB,
  configTab: ConfigTabId = DEFAULT_CONFIG_TAB,
): string {
  if (section === 'overview') {
    return `overview:${clusterFilename}`
  }
  if (section === 'workloads') {
    return `workload:${workloadTab}:${clusterFilename}`
  }
  return `config:${configTab}:${clusterFilename}`
}

export function getWorkloadTabTitle(workloadTab: WorkloadTabId): string {
  return WORKLOAD_TAB_OPTIONS.find(option => option.id === workloadTab)?.label ?? 'Workload'
}

export function getConfigTabTitle(configTab: ConfigTabId): string {
  return CONFIG_TAB_OPTIONS.find(option => option.id === configTab)?.label ?? 'Config'
}

export function getTabDisplayName(tab: ClusterTabState): string {
  return `${tab.title} < ${tab.cluster.name} >`
}

export function truncateWithEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function createClusterTab(
  cluster: ClusterInfo,
  section: ClusterSection,
  workloadTab: WorkloadTabId = DEFAULT_WORKLOAD_TAB,
  configTab: ConfigTabId = DEFAULT_CONFIG_TAB,
  selectedNamespaces: string[] = [],
): ClusterTabState {
  const normalizedWorkloadTab = section === 'workloads' ? workloadTab : DEFAULT_WORKLOAD_TAB
  const normalizedConfigTab = section === 'config' ? configTab : DEFAULT_CONFIG_TAB
  const title = section === 'overview'
    ? OVERVIEW_TAB_TITLE
    : section === 'workloads'
      ? getWorkloadTabTitle(normalizedWorkloadTab)
      : getConfigTabTitle(normalizedConfigTab)

  return {
    id: getClusterTabId(section, cluster.filename, normalizedWorkloadTab, normalizedConfigTab),
    title,
    section,
    workloadTab: normalizedWorkloadTab,
    configTab: normalizedConfigTab,
    hasActivity: false,
    cluster,
    overview: null,
    workloads: null,
    nodeFilter: 'both',
    selectedNamespaces,
    loading: false,
    error: null,
  }
}

interface UseClusterTabsOptions {
  showSettings: boolean
}

export interface UseClusterTabsResult {
  clusters: ClusterInfo[]
  tabs: ClusterTabState[]
  activeTabId: string | null
  activeTab: ClusterTabState | null
  activeWorkloadClusterFilename: string | null
  activeConfigClusterFilename: string | null
  activeWorkloadNamespaces: string[]
  activeConfigNamespaces: string[]
  activeWorkloadNamespaceOptions: string[]
  activeConfigNamespaceOptions: string[]
  handleSelectCluster: (cluster: ClusterInfo, section: ClusterSection, workloadTab?: WorkloadTabId, configTab?: ConfigTabId) => void
  handleActivateTab: (tabId: string) => void
  handleCloseTab: (tabId: string) => void
  handleNodeFilterChange: (filter: NodeFilter) => Promise<void>
  handleNamespacesChange: (ns: string[]) => Promise<void>
  handleWorkloadNamespacesChange: (ns: string[]) => Promise<void>
  handleConfigNamespacesChange: (ns: string[]) => Promise<void>
  handleAddCluster: (name: string, content: string) => Promise<void>
  handleRenameCluster: (oldFilename: string, newName: string) => Promise<void>
  handleDeleteCluster: (filename: string) => Promise<void>
  handleGetClusterConfig: (filename: string) => Promise<string>
  handleUpdateClusterConfig: (filename: string, content: string) => Promise<void>
  loadClusters: () => Promise<void>
}

export function useClusterTabs({ showSettings }: UseClusterTabsOptions): UseClusterTabsResult {
  const [clusters, setClusters] = useState<ClusterInfo[]>([])
  const [tabs, setTabs] = useState<ClusterTabState[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [resourceNamespacesByCluster, setResourceNamespacesByCluster] = useState<Record<string, string[]>>({})
  const [resourceNamespaceOptionsByCluster, setResourceNamespaceOptionsByCluster] = useState<Record<string, string[]>>({})
  const previousActiveTabIdRef = useRef<string | null>(null)
  const previousSidebarSelectionRef = useRef<{ tabId: string; at: number } | null>(null)
  const tabRequestRef = useRef<Record<string, number>>({})

  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) ?? null : null
  const activeWorkloadClusterFilename = activeTab?.section === 'workloads' ? activeTab.cluster.filename : null
  const activeConfigClusterFilename = activeTab?.section === 'config' ? activeTab.cluster.filename : null
  const activeResourceClusterFilename = (activeTab?.section === 'workloads' || activeTab?.section === 'config')
    ? activeTab.cluster.filename
    : null

  const activeWorkloadNamespaces = activeWorkloadClusterFilename
    ? (resourceNamespacesByCluster[activeWorkloadClusterFilename] ?? [])
    : []
  const activeConfigNamespaces = activeConfigClusterFilename
    ? (resourceNamespacesByCluster[activeConfigClusterFilename] ?? [])
    : []
  const activeWorkloadNamespaceOptions = activeWorkloadClusterFilename
    ? (resourceNamespaceOptionsByCluster[activeWorkloadClusterFilename] ?? [])
    : []
  const activeConfigNamespaceOptions = activeConfigClusterFilename
    ? (resourceNamespaceOptionsByCluster[activeConfigClusterFilename] ?? [])
    : []

  const loadClusters = useCallback(async () => {
    try {
      const list = await ListClusters()
      const normalized = (list || []).map((item: { name: string; filename: string; healthStatus?: unknown }): ClusterInfo => ({
        name: item.name,
        filename: item.filename,
        healthStatus: toClusterHealthStatus(item.healthStatus),
      }))
      setClusters(normalized)
      const validClusters = new Set(normalized.map(item => item.filename))
      setResourceNamespacesByCluster(current => (
        Object.fromEntries(Object.entries(current).filter(([filename]) => validClusters.has(filename)))
      ))
      setResourceNamespaceOptionsByCluster(current => (
        Object.fromEntries(Object.entries(current).filter(([filename]) => validClusters.has(filename)))
      ))
      setTabs(current => {
        const byFilename = new Map(normalized.map(item => [item.filename, item]))
        const tabIdMap = new Map<string, string>()
        const nextTabs = current.flatMap(tab => {
          const updatedCluster = byFilename.get(tab.cluster.filename)
          if (!updatedCluster) {
            return []
          }

          const nextId = getClusterTabId(tab.section, updatedCluster.filename, tab.workloadTab, tab.configTab)
          tabIdMap.set(tab.id, nextId)
          return [{
            ...tab,
            id: nextId,
            title: tab.section === 'overview'
              ? OVERVIEW_TAB_TITLE
              : tab.section === 'workloads'
                ? getWorkloadTabTitle(tab.workloadTab)
                : getConfigTabTitle(tab.configTab),
            cluster: updatedCluster,
          }]
        })

        const validTabIds = new Set(nextTabs.map(tab => tab.id))
        const remappedRequests: Record<string, number> = {}
        for (const [oldTabId, requestId] of Object.entries(tabRequestRef.current)) {
          const remappedId = tabIdMap.get(oldTabId) ?? oldTabId
          if (validTabIds.has(remappedId)) {
            remappedRequests[remappedId] = requestId
          }
        }
        tabRequestRef.current = remappedRequests

        setActiveTabId(currentActive => {
          if (currentActive) {
            const remappedActive = tabIdMap.get(currentActive) ?? currentActive
            if (nextTabs.some(tab => tab.id === remappedActive)) {
              return remappedActive
            }
          }
          return nextTabs.length > 0 ? nextTabs[0].id : null
        })

        return nextTabs
      })
    } catch {
      setClusters([])
      setTabs([])
      setActiveTabId(null)
      setResourceNamespacesByCluster({})
      setResourceNamespaceOptionsByCluster({})
    }
  }, [])

  const loadTabData = useCallback(async (tab: ClusterTabState) => {
    if (tab.section !== 'overview') {
      return
    }

    const requestId = (tabRequestRef.current[tab.id] ?? 0) + 1
    tabRequestRef.current[tab.id] = requestId

    setTabs(current => current.map(item => (
      item.id === tab.id ? { ...item, loading: true, error: null } : item
    )))

    try {
      const ov = await ConnectCluster(tab.cluster.filename, tab.nodeFilter)
      const wl = await GetWorkloads(tab.selectedNamespaces)
      if (tabRequestRef.current[tab.id] !== requestId) {
        return
      }
      setResourceNamespaceOptionsByCluster(current => ({
        ...current,
        [tab.cluster.filename]: ov.namespaces ?? [],
      }))
      setTabs(current => current.map(item => (
        item.id === tab.id
          ? { ...item, overview: ov, workloads: normalizeWorkloads(wl), loading: false, error: null }
          : item
      )))
    } catch (e: any) {
      if (tabRequestRef.current[tab.id] !== requestId) {
        return
      }
      const message = e?.message || String(e)
      setTabs(current => current.map(item => (
        item.id === tab.id
          ? { ...item, overview: null, workloads: null, loading: false, error: message }
          : item
      )))
    }
  }, [])

  useEffect(() => {
    if (showSettings) {
      return
    }
    if (!activeTabId) {
      previousActiveTabIdRef.current = null
      return
    }

    const tab = tabs.find(item => item.id === activeTabId)
    if (!tab) {
      return
    }

    const previousTabId = previousActiveTabIdRef.current
    const switched = previousTabId !== activeTabId
    previousActiveTabIdRef.current = activeTabId

    if (switched && previousTabId) {
      const previousTab = tabs.find(item => item.id === previousTabId)
      if (previousTab && !previousTab.hasActivity) {
        delete tabRequestRef.current[previousTabId]
        setTabs(current => current.filter(item => item.id !== previousTabId))
      }
    }

    if (tab.section === 'overview' && (switched || (!tab.overview && !tab.loading && !tab.error))) {
      void loadTabData(tab)
    }
  }, [activeTabId, tabs, showSettings, loadTabData])

  useEffect(() => {
    if (!activeResourceClusterFilename) {
      return
    }

    if (Object.prototype.hasOwnProperty.call(resourceNamespaceOptionsByCluster, activeResourceClusterFilename)) {
      return
    }

    const namespaceSourceTab = tabs.find(tab => tab.cluster.filename === activeResourceClusterFilename && tab.overview)
    if (namespaceSourceTab?.overview) {
      setResourceNamespaceOptionsByCluster(current => ({
        ...current,
        [activeResourceClusterFilename]: namespaceSourceTab.overview?.namespaces ?? [],
      }))
      return
    }

    let cancelled = false
    ConnectCluster(activeResourceClusterFilename, 'both').then((ov: { namespaces?: string[] }) => {
      if (cancelled) {
        return
      }
      setResourceNamespaceOptionsByCluster(current => ({
        ...current,
        [activeResourceClusterFilename]: ov.namespaces ?? [],
      }))
    }).catch(() => {
      if (cancelled) {
        return
      }
      setResourceNamespaceOptionsByCluster(current => ({
        ...current,
        [activeResourceClusterFilename]: [],
      }))
    })

    return () => {
      cancelled = true
    }
  }, [activeResourceClusterFilename, tabs, resourceNamespaceOptionsByCluster])

  const handleSelectCluster = (
    cluster: ClusterInfo,
    section: ClusterSection,
    workloadTab?: WorkloadTabId,
    configTab?: ConfigTabId,
  ) => {
    if (section === 'workloads' && !workloadTab) {
      return
    }
    if (section === 'config' && !configTab) {
      return
    }

    const resolvedWorkloadTab = section === 'workloads' ? (workloadTab ?? DEFAULT_WORKLOAD_TAB) : DEFAULT_WORKLOAD_TAB
    const resolvedConfigTab = section === 'config' ? (configTab ?? DEFAULT_CONFIG_TAB) : DEFAULT_CONFIG_TAB
    const clusterResourceNamespaces = resourceNamespacesByCluster[cluster.filename] ?? []
    const tabId = getClusterTabId(section, cluster.filename, resolvedWorkloadTab, resolvedConfigTab)
    const now = Date.now()
    const previousSelection = previousSidebarSelectionRef.current
    const isDoubleSelect = !!previousSelection
      && previousSelection.tabId === tabId
      && (now - previousSelection.at) <= DOUBLE_SELECT_WINDOW_MS
    previousSidebarSelectionRef.current = { tabId, at: now }

    setTabs(current => {
      const idx = current.findIndex(tab => tab.id === tabId)
      if (idx >= 0) {
        const next = [...current]
        next[idx] = {
          ...next[idx],
          cluster,
          workloadTab: section === 'workloads' ? resolvedWorkloadTab : next[idx].workloadTab,
          configTab: section === 'config' ? resolvedConfigTab : next[idx].configTab,
          title: section === 'overview'
            ? OVERVIEW_TAB_TITLE
            : section === 'workloads'
              ? getWorkloadTabTitle(resolvedWorkloadTab)
              : getConfigTabTitle(resolvedConfigTab),
          selectedNamespaces: (section === 'workloads' || section === 'config')
            ? clusterResourceNamespaces
            : next[idx].selectedNamespaces,
          hasActivity: next[idx].hasActivity || isDoubleSelect,
        }
        return next
      }
      return [
        ...current,
        createClusterTab(
          cluster,
          section,
          resolvedWorkloadTab,
          resolvedConfigTab,
          (section === 'workloads' || section === 'config') ? clusterResourceNamespaces : [],
        ),
      ]
    })
    setActiveTabId(tabId)
  }

  const handleActivateTab = (tabId: string) => {
    setActiveTabId(tabId)
  }

  const handleCloseTab = useCallback((tabId: string) => {
    delete tabRequestRef.current[tabId]
    setTabs(current => {
      const idx = current.findIndex(tab => tab.id === tabId)
      if (idx < 0) {
        return current
      }

      const next = current.filter(tab => tab.id !== tabId)
      setActiveTabId(currentActive => {
        if (currentActive !== tabId) {
          return currentActive
        }
        const fallback = next[idx] ?? next[idx - 1] ?? null
        return fallback ? fallback.id : null
      })

      return next
    })
  }, [])

  const handleNodeFilterChange = async (filter: NodeFilter) => {
    if (!activeTab) return

    const nextTab = { ...activeTab, nodeFilter: filter }
    setTabs(current => current.map(tab => (
      tab.id === nextTab.id ? { ...tab, nodeFilter: filter, hasActivity: true } : tab
    )))

    try {
      const ov = await RefreshOverview(filter)
      setTabs(current => current.map(tab => (
        tab.id === nextTab.id ? { ...tab, overview: ov, error: null } : tab
      )))
    } catch {
      await loadTabData(nextTab)
    }
  }

  const handleNamespacesChange = async (ns: string[]) => {
    if (!activeTab) return

    const nextTab = { ...activeTab, selectedNamespaces: ns }
    setTabs(current => current.map(tab => (
      tab.id === nextTab.id ? { ...tab, selectedNamespaces: ns, hasActivity: true } : tab
    )))

    try {
      const wl = await GetWorkloads(ns)
      setTabs(current => current.map(tab => (
        tab.id === nextTab.id ? { ...tab, workloads: normalizeWorkloads(wl), error: null } : tab
      )))
    } catch {
      await loadTabData(nextTab)
    }
  }

  const handleWorkloadNamespacesChange = async (ns: string[]) => {
    if (!activeTab || activeTab.section !== 'workloads') {
      return
    }

    const clusterFilename = activeTab.cluster.filename
    setResourceNamespacesByCluster(current => ({
      ...current,
      [clusterFilename]: ns,
    }))

    setTabs(current => current.map(tab => (
      tab.section === 'workloads' && tab.cluster.filename === clusterFilename
        ? { ...tab, selectedNamespaces: ns, hasActivity: tab.id === activeTab.id ? true : tab.hasActivity }
        : tab
    )))

    try {
      const wl = await GetWorkloads(ns)
      setTabs(current => current.map(tab => (
        tab.section === 'workloads' && tab.cluster.filename === clusterFilename
          ? { ...tab, workloads: normalizeWorkloads(wl), error: null }
          : tab
      )))
    } catch {}
  }

  const handleConfigNamespacesChange = async (ns: string[]) => {
    if (!activeTab || activeTab.section !== 'config') {
      return
    }

    const clusterFilename = activeTab.cluster.filename
    setResourceNamespacesByCluster(current => ({
      ...current,
      [clusterFilename]: ns,
    }))

    setTabs(current => current.map(tab => (
      tab.section === 'config' && tab.cluster.filename === clusterFilename
        ? { ...tab, selectedNamespaces: ns, hasActivity: tab.id === activeTab.id ? true : tab.hasActivity }
        : tab
    )))
  }

  const handleAddCluster = async (name: string, content: string) => {
    await AddClusterApi(name, content)
    await loadClusters()
  }

  const handleRenameCluster = async (oldFilename: string, newName: string) => {
    try {
      const newFilename = await RenameClusterApi(oldFilename, newName)
      setTabs(current => {
        const renamedIdMap = new Map<string, string>()
        const nextTabs = current.map(tab => {
          if (tab.cluster.filename !== oldFilename) {
            return tab
          }
          const nextId = getClusterTabId(tab.section, newFilename, tab.workloadTab, tab.configTab)
          renamedIdMap.set(tab.id, nextId)
          return {
            ...tab,
            id: nextId,
            cluster: { ...tab.cluster, name: newName, filename: newFilename },
          }
        })

        const remappedRequests: Record<string, number> = {}
        for (const [oldTabId, requestId] of Object.entries(tabRequestRef.current)) {
          remappedRequests[renamedIdMap.get(oldTabId) ?? oldTabId] = requestId
        }
        tabRequestRef.current = remappedRequests

        setActiveTabId(currentActive => {
          if (!currentActive) {
            return currentActive
          }
          return renamedIdMap.get(currentActive) ?? currentActive
        })

        return nextTabs
      })

      setResourceNamespacesByCluster(current => {
        if (!Object.prototype.hasOwnProperty.call(current, oldFilename)) {
          return current
        }
        const next = { ...current }
        next[newFilename] = current[oldFilename]
        delete next[oldFilename]
        return next
      })
      setResourceNamespaceOptionsByCluster(current => {
        if (!Object.prototype.hasOwnProperty.call(current, oldFilename)) {
          return current
        }
        const next = { ...current }
        next[newFilename] = current[oldFilename]
        delete next[oldFilename]
        return next
      })

      await loadClusters()
    } catch {}
  }

  const handleDeleteCluster = async (filename: string) => {
    try {
      await DeleteClusterApi(filename)

      setTabs(current => {
        let firstRemovedIndex = -1
        const removedTabIds = new Set<string>()
        const next: ClusterTabState[] = []

        current.forEach((tab, index) => {
          if (tab.cluster.filename === filename) {
            if (firstRemovedIndex < 0) {
              firstRemovedIndex = index
            }
            removedTabIds.add(tab.id)
            return
          }
          next.push(tab)
        })

        if (removedTabIds.size === 0) {
          return current
        }

        for (const removedId of removedTabIds) {
          delete tabRequestRef.current[removedId]
        }

        setActiveTabId(currentActive => {
          if (!currentActive || !removedTabIds.has(currentActive)) {
            return currentActive
          }
          const fallback = next[firstRemovedIndex] ?? next[firstRemovedIndex - 1] ?? null
          return fallback ? fallback.id : null
        })

        return next
      })

      setResourceNamespacesByCluster(current => {
        if (!Object.prototype.hasOwnProperty.call(current, filename)) {
          return current
        }
        const next = { ...current }
        delete next[filename]
        return next
      })
      setResourceNamespaceOptionsByCluster(current => {
        if (!Object.prototype.hasOwnProperty.call(current, filename)) {
          return current
        }
        const next = { ...current }
        delete next[filename]
        return next
      })
      await loadClusters()
    } catch {}
  }

  const handleGetClusterConfig = async (filename: string) => {
    return GetClusterConfigApi(filename)
  }

  const handleUpdateClusterConfig = async (filename: string, content: string) => {
    await UpdateClusterConfigApi(filename, content)
    await loadClusters()
  }

  return {
    clusters,
    tabs,
    activeTabId,
    activeTab,
    activeWorkloadClusterFilename,
    activeConfigClusterFilename,
    activeWorkloadNamespaces,
    activeConfigNamespaces,
    activeWorkloadNamespaceOptions,
    activeConfigNamespaceOptions,
    handleSelectCluster,
    handleActivateTab,
    handleCloseTab,
    handleNodeFilterChange,
    handleNamespacesChange,
    handleWorkloadNamespacesChange,
    handleConfigNamespacesChange,
    handleAddCluster,
    handleRenameCluster,
    handleDeleteCluster,
    handleGetClusterConfig,
    handleUpdateClusterConfig,
    loadClusters,
  }
}
