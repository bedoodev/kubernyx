import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WORKLOAD_TAB_OPTIONS, CONFIG_TAB_OPTIONS, NETWORK_TAB_OPTIONS } from '../../shared/types'
import type { ClusterInfo, ClusterSection, WorkloadTabId, ConfigTabId, NetworkTabId } from '../../shared/types'
import AddClusterModal from './components/AddClusterModal'
import EditClusterModal from './components/EditClusterModal'
import './Sidebar.css'

interface Props {
  clusters: ClusterInfo[]
  width: number
  activeCluster: ClusterInfo | null
  activeSection: ClusterSection | null
  activeWorkloadTab: WorkloadTabId | null
  activeConfigTab: ConfigTabId | null
  activeNetworkTab: NetworkTabId | null
  showSettings: boolean
  onToggleCollapse: () => void
  onSelect: (c: ClusterInfo, section: ClusterSection, workloadTab?: WorkloadTabId, configTab?: ConfigTabId, networkTab?: NetworkTabId) => void
  onAdd: (name: string, content: string) => Promise<void>
  onRename: (oldFilename: string, newName: string) => Promise<void>
  onDelete: (filename: string) => Promise<void>
  onReadConfig: (filename: string) => Promise<string>
  onUpdateConfig: (filename: string, content: string) => Promise<void>
  onSettingsClick: () => void
  onOpenTerminal: (cluster: ClusterInfo) => void
}

type NavItem =
  | { type: 'cluster'; cluster: ClusterInfo }
  | { type: 'overview'; cluster: ClusterInfo }
  | { type: 'workloads-toggle'; cluster: ClusterInfo }
  | { type: 'workload-tab'; cluster: ClusterInfo; tabId: WorkloadTabId }
  | { type: 'config-toggle'; cluster: ClusterInfo }
  | { type: 'config-tab'; cluster: ClusterInfo; tabId: ConfigTabId }
  | { type: 'network-toggle'; cluster: ClusterInfo }
  | { type: 'network-tab'; cluster: ClusterInfo; tabId: NetworkTabId }
  | { type: 'nodes'; cluster: ClusterInfo }
  | { type: 'events'; cluster: ClusterInfo }

const Sidebar = forwardRef<HTMLDivElement, Props>(function Sidebar({
  clusters,
  width,
  activeCluster,
  activeSection,
  activeWorkloadTab,
  activeConfigTab,
  activeNetworkTab,
  showSettings,
  onToggleCollapse,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onReadConfig,
  onUpdateConfig,
  onSettingsClick,
  onOpenTerminal,
}, ref) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingConfigCluster, setEditingConfigCluster] = useState<ClusterInfo | null>(null)
  const [clusterSearch, setClusterSearch] = useState('')
  const [contextMenu, setContextMenu] = useState<{ filename: string; x: number; y: number } | null>(null)
  const [expandedClusters, setExpandedClusters] = useState<string[]>([])
  const [expandedWorkloads, setExpandedWorkloads] = useState<string[]>([])
  const [expandedConfigs, setExpandedConfigs] = useState<string[]>([])
  const [expandedNetwork, setExpandedNetwork] = useState<string[]>([])

  useEffect(() => {
    const valid = new Set(clusters.map(cluster => cluster.filename))
    setExpandedClusters(current => current.filter(filename => valid.has(filename)))
    setExpandedWorkloads(current => current.filter(filename => valid.has(filename)))
    setExpandedConfigs(current => current.filter(filename => valid.has(filename)))
    setExpandedNetwork(current => current.filter(filename => valid.has(filename)))
  }, [clusters])

  useEffect(() => {
    if (!activeCluster) {
      return
    }
    setExpandedClusters(current => (
      current.includes(activeCluster.filename)
        ? current
        : [...current, activeCluster.filename]
    ))
    if (activeSection === 'workloads') {
      setExpandedWorkloads(current => (
        current.includes(activeCluster.filename)
          ? current
          : [...current, activeCluster.filename]
      ))
    } else if (activeSection === 'config') {
      setExpandedConfigs(current => (
        current.includes(activeCluster.filename)
          ? current
          : [...current, activeCluster.filename]
      ))
    } else if (activeSection === 'network') {
      setExpandedNetwork(current => (
        current.includes(activeCluster.filename)
          ? current
          : [...current, activeCluster.filename]
      ))
    }
  }, [activeCluster, activeSection])

  const handleContextMenu = (e: React.MouseEvent, c: ClusterInfo) => {
    e.preventDefault()
    setContextMenu({ filename: c.filename, x: e.clientX, y: e.clientY })
  }

  const filteredClusters = useMemo(() => {
    const query = clusterSearch.trim().toLowerCase()
    if (!query) {
      return clusters
    }
    return clusters.filter(cluster => cluster.name.toLowerCase().includes(query))
  }, [clusterSearch, clusters])

  const handleDelete = (filename: string) => {
    setContextMenu(null)
    onDelete(filename)
  }

  const handleOpenTerminal = (filename: string) => {
    const cluster = clusters.find(item => item.filename === filename)
    setContextMenu(null)
    if (cluster) {
      onOpenTerminal(cluster)
    }
  }

  const toggleCluster = (filename: string) => {
    setExpandedClusters(current => (
      current.includes(filename)
        ? current.filter(name => name !== filename)
        : [...current, filename]
    ))
  }

  const toggleWorkloads = (filename: string) => {
    setExpandedWorkloads(current => (
      current.includes(filename)
        ? current.filter(name => name !== filename)
        : [...current, filename]
    ))
  }

  const toggleConfigs = (filename: string) => {
    setExpandedConfigs(current => (
      current.includes(filename)
        ? current.filter(name => name !== filename)
        : [...current, filename]
    ))
  }

  const toggleNetwork = (filename: string) => {
    setExpandedNetwork(current => (
      current.includes(filename)
        ? current.filter(name => name !== filename)
        : [...current, filename]
    ))
  }

  const [focusedNavIndex, setFocusedNavIndex] = useState(-1)
  const clusterListRef = useRef<HTMLDivElement | null>(null)

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = []
    for (const c of filteredClusters) {
      items.push({ type: 'cluster', cluster: c })
      if (expandedClusters.includes(c.filename)) {
        items.push({ type: 'overview', cluster: c })
        items.push({ type: 'workloads-toggle', cluster: c })
        if (expandedWorkloads.includes(c.filename)) {
          for (const tab of WORKLOAD_TAB_OPTIONS) {
            items.push({ type: 'workload-tab', cluster: c, tabId: tab.id })
          }
        }
        items.push({ type: 'config-toggle', cluster: c })
        if (expandedConfigs.includes(c.filename)) {
          for (const tab of CONFIG_TAB_OPTIONS) {
            items.push({ type: 'config-tab', cluster: c, tabId: tab.id })
          }
        }
        items.push({ type: 'network-toggle', cluster: c })
        if (expandedNetwork.includes(c.filename)) {
          for (const tab of NETWORK_TAB_OPTIONS) {
            items.push({ type: 'network-tab', cluster: c, tabId: tab.id })
          }
        }
        items.push({ type: 'nodes', cluster: c })
        items.push({ type: 'events', cluster: c })
      }
    }
    return items
  }, [filteredClusters, expandedClusters, expandedWorkloads, expandedConfigs, expandedNetwork])

  const handleClusterListKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT') return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusedNavIndex(current => Math.min(current + 1, navItems.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedNavIndex(current => Math.max(current - 1, 0))
      return
    }

    if (focusedNavIndex < 0 || focusedNavIndex >= navItems.length) return
    const item = navItems[focusedNavIndex]

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (item.type === 'cluster') {
        toggleCluster(item.cluster.filename)
      } else if (item.type === 'overview') {
        onSelect(item.cluster, 'overview')
      } else if (item.type === 'workloads-toggle') {
        toggleWorkloads(item.cluster.filename)
      } else if (item.type === 'workload-tab') {
        onSelect(item.cluster, 'workloads', item.tabId)
      } else if (item.type === 'config-toggle') {
        toggleConfigs(item.cluster.filename)
      } else if (item.type === 'config-tab') {
        onSelect(item.cluster, 'config', undefined, item.tabId)
      } else if (item.type === 'network-toggle') {
        toggleNetwork(item.cluster.filename)
      } else if (item.type === 'network-tab') {
        onSelect(item.cluster, 'network', undefined, undefined, item.tabId)
      } else if (item.type === 'nodes') {
        onSelect(item.cluster, 'nodes')
      } else if (item.type === 'events') {
        onSelect(item.cluster, 'events')
      }
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (item.type === 'cluster' && !expandedClusters.includes(item.cluster.filename)) {
        toggleCluster(item.cluster.filename)
      } else if (item.type === 'workloads-toggle' && !expandedWorkloads.includes(item.cluster.filename)) {
        toggleWorkloads(item.cluster.filename)
      } else if (item.type === 'config-toggle' && !expandedConfigs.includes(item.cluster.filename)) {
        toggleConfigs(item.cluster.filename)
      } else if (item.type === 'network-toggle' && !expandedNetwork.includes(item.cluster.filename)) {
        toggleNetwork(item.cluster.filename)
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (item.type === 'cluster' && expandedClusters.includes(item.cluster.filename)) {
        toggleCluster(item.cluster.filename)
      } else if (item.type === 'workloads-toggle' && expandedWorkloads.includes(item.cluster.filename)) {
        toggleWorkloads(item.cluster.filename)
      } else if (item.type === 'config-toggle' && expandedConfigs.includes(item.cluster.filename)) {
        toggleConfigs(item.cluster.filename)
      } else if (item.type === 'network-toggle' && expandedNetwork.includes(item.cluster.filename)) {
        toggleNetwork(item.cluster.filename)
      } else if (item.type === 'overview' || item.type === 'workloads-toggle') {
        const parentIdx = navItems.findIndex(n => n.type === 'cluster' && n.cluster.filename === item.cluster.filename)
        if (parentIdx >= 0) setFocusedNavIndex(parentIdx)
      } else if (item.type === 'workload-tab') {
        const parentIdx = navItems.findIndex(n => n.type === 'workloads-toggle' && n.cluster.filename === item.cluster.filename)
        if (parentIdx >= 0) setFocusedNavIndex(parentIdx)
      } else if (item.type === 'config-tab') {
        const parentIdx = navItems.findIndex(n => n.type === 'config-toggle' && n.cluster.filename === item.cluster.filename)
        if (parentIdx >= 0) setFocusedNavIndex(parentIdx)
      } else if (item.type === 'network-tab') {
        const parentIdx = navItems.findIndex(n => n.type === 'network-toggle' && n.cluster.filename === item.cluster.filename)
        if (parentIdx >= 0) setFocusedNavIndex(parentIdx)
      } else if (item.type === 'nodes' || item.type === 'events') {
        const parentIdx = navItems.findIndex(n => n.type === 'cluster' && n.cluster.filename === item.cluster.filename)
        if (parentIdx >= 0) setFocusedNavIndex(parentIdx)
      }
      return
    }
  }, [navItems, focusedNavIndex, expandedClusters, expandedWorkloads, expandedConfigs, expandedNetwork, toggleCluster, toggleWorkloads, toggleConfigs, toggleNetwork, onSelect])

  useEffect(() => {
    if (focusedNavIndex < 0) return
    const el = clusterListRef.current?.querySelector('[data-nav-focused="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedNavIndex])

  return (
    <>
      <aside className="sidebar" ref={ref} style={{ width, minWidth: width }} onClick={() => setContextMenu(null)}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            <span>Clusters</span>
          </div>
          <div className="sidebar-actions">
            <button
              className="sidebar-toggle-btn"
              onClick={onToggleCollapse}
              title="Hide Sidebar"
              aria-label="Hide sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2"/>
                <path d="M8 4v16"/>
                <path d="M13 12h5"/>
              </svg>
            </button>
            <button className="add-btn" onClick={() => setShowAddModal(true)} title="Add Cluster">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="sidebar-search-wrap">
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Search clusters..."
            value={clusterSearch}
            onChange={event => setClusterSearch(event.target.value)}
          />
        </div>

        <div className="cluster-list" ref={clusterListRef} tabIndex={0} onKeyDown={handleClusterListKeyDown}>
          {filteredClusters.length === 0 ? (
            <div className="no-clusters">
              {clusters.length === 0 ? 'No clusters found' : 'No matching clusters'}
            </div>
          ) : (
            (() => {
              let navIdx = 0
              return filteredClusters.map(c => {
                const expanded = expandedClusters.includes(c.filename)
                const active = activeCluster?.filename === c.filename
                const overviewActive = active && activeSection === 'overview'
                const workloadsActive = active && activeSection === 'workloads'
                const workloadsExpanded = expandedWorkloads.includes(c.filename)
                const configActive = active && activeSection === 'config'
                const configExpanded = expandedConfigs.includes(c.filename)
                const networkActive = active && activeSection === 'network'
                const networkExpanded = expandedNetwork.includes(c.filename)
                const nodesActive = active && activeSection === 'nodes'
                const eventsActive = active && activeSection === 'events'
                const clusterNavIdx = navIdx++

                return (
                  <div
                    key={c.filename}
                    className={`cluster-item ${expanded ? 'expanded' : ''} ${active ? 'active' : ''}`}
                    onContextMenu={e => handleContextMenu(e, c)}
                  >
                    <>
                      <div
                        className={`cluster-main-row ${focusedNavIndex === clusterNavIdx ? 'keyboard-focused' : ''}`}
                        data-nav-focused={focusedNavIndex === clusterNavIdx || undefined}
                      >
                        <button
                          type="button"
                          className="cluster-toggle-btn"
                          onClick={e => {
                            e.stopPropagation()
                            toggleCluster(c.filename)
                          }}
                          aria-expanded={expanded}
                        >
                          <svg className={`cluster-chevron ${expanded ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M7 5l6 5-6 5V5z" />
                          </svg>
                          <div className={`cluster-dot ${c.healthStatus ?? 'red'}`} />
                          <span className="cluster-name">{c.name}</span>
                        </button>
                        <button
                          className="cluster-menu-btn"
                          onClick={e => { e.stopPropagation(); handleContextMenu(e, c) }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/>
                          </svg>
                        </button>
                      </div>
                      {expanded && (
                        <>
                          {(() => { const idx = navIdx++; return (
                            <button
                              type="button"
                              className={`cluster-sub-item ${overviewActive ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                              data-nav-focused={focusedNavIndex === idx || undefined}
                              onClick={e => {
                                e.stopPropagation()
                                onSelect(c, 'overview')
                              }}
                            >
                              <span>Overview</span>
                            </button>
                          )})()}
                          {(() => { const idx = navIdx++; return (
                            <button
                              type="button"
                              className={`cluster-sub-item cluster-sub-toggle ${workloadsActive ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                              data-nav-focused={focusedNavIndex === idx || undefined}
                              onClick={e => {
                                e.stopPropagation()
                                toggleWorkloads(c.filename)
                              }}
                            >
                              <span>Workloads</span>
                              <svg className={`cluster-sub-chevron ${workloadsExpanded ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path d="M7 5l6 5-6 5V5z" />
                              </svg>
                            </button>
                          )})()}
                          {workloadsExpanded && (
                          <div className="cluster-workloads-list">
                            {WORKLOAD_TAB_OPTIONS.map(tab => {
                              const idx = navIdx++
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  className={`cluster-workload-item ${workloadsActive && activeWorkloadTab === tab.id ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                                  data-nav-focused={focusedNavIndex === idx || undefined}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onSelect(c, 'workloads', tab.id)
                                  }}
                                >
                                  {tab.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                          {(() => { const idx = navIdx++; return (
                            <button
                              type="button"
                              className={`cluster-sub-item cluster-sub-toggle ${configActive ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                              data-nav-focused={focusedNavIndex === idx || undefined}
                              onClick={e => {
                                e.stopPropagation()
                                toggleConfigs(c.filename)
                              }}
                            >
                              <span>Config</span>
                              <svg className={`cluster-sub-chevron ${configExpanded ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path d="M7 5l6 5-6 5V5z" />
                              </svg>
                            </button>
                          )})()}
                          {configExpanded && (
                          <div className="cluster-config-list">
                            {CONFIG_TAB_OPTIONS.map(tab => {
                              const idx = navIdx++
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  className={`cluster-config-item ${configActive && activeConfigTab === tab.id ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                                  data-nav-focused={focusedNavIndex === idx || undefined}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onSelect(c, 'config', undefined, tab.id)
                                  }}
                                >
                                  {tab.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                          {(() => { const idx = navIdx++; return (
                            <button
                              type="button"
                              className={`cluster-sub-item cluster-sub-toggle ${networkActive ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                              data-nav-focused={focusedNavIndex === idx || undefined}
                              onClick={e => {
                                e.stopPropagation()
                                toggleNetwork(c.filename)
                              }}
                            >
                              <span>Network</span>
                              <svg className={`cluster-sub-chevron ${networkExpanded ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path d="M7 5l6 5-6 5V5z" />
                              </svg>
                            </button>
                          )})()}
                          {networkExpanded && (
                          <div className="cluster-config-list">
                            {NETWORK_TAB_OPTIONS.map(tab => {
                              const idx = navIdx++
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  className={`cluster-config-item ${networkActive && activeNetworkTab === tab.id ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                                  data-nav-focused={focusedNavIndex === idx || undefined}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onSelect(c, 'network', undefined, undefined, tab.id)
                                  }}
                                >
                                  {tab.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                          {(() => { const idx = navIdx++; return (
                            <button
                              type="button"
                              className={`cluster-sub-item ${nodesActive ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                              data-nav-focused={focusedNavIndex === idx || undefined}
                              onClick={e => {
                                e.stopPropagation()
                                onSelect(c, 'nodes')
                              }}
                            >
                              <span>Nodes</span>
                            </button>
                          )})()}
                          {(() => { const idx = navIdx++; return (
                            <button
                              type="button"
                              className={`cluster-sub-item ${eventsActive ? 'active' : ''} ${focusedNavIndex === idx ? 'keyboard-focused' : ''}`}
                              data-nav-focused={focusedNavIndex === idx || undefined}
                              onClick={e => {
                                e.stopPropagation()
                                onSelect(c, 'events')
                              }}
                            >
                              <span>Events</span>
                            </button>
                          )})()}
                      </>
                    )}
                  </>
                </div>
              )
            })})()
          )}
        </div>

        <div className="sidebar-footer">
          <button className={`settings-btn ${showSettings ? 'active' : ''}`} onClick={onSettingsClick} title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {contextMenu && (
        <div className="context-overlay" onClick={() => setContextMenu(null)}>
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
            <button onClick={() => handleOpenTerminal(contextMenu.filename)}>
              Open Terminal
            </button>
            <button onClick={() => {
              const cluster = clusters.find(item => item.filename === contextMenu.filename)
              setContextMenu(null)
              if (cluster) {
                setEditingConfigCluster(cluster)
              }
            }}>
              Edit kubeconfig
            </button>
            <button className="danger" onClick={() => handleDelete(contextMenu.filename)}>
              Delete
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddClusterModal onAdd={onAdd} onClose={() => setShowAddModal(false)} />
      )}

      {editingConfigCluster && (
        <EditClusterModal
          cluster={editingConfigCluster}
          onLoad={onReadConfig}
          onSave={onUpdateConfig}
          onRename={onRename}
          onClose={() => setEditingConfigCluster(null)}
        />
      )}
    </>
  )
})

export default Sidebar
