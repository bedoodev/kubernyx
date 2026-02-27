import { useEffect, useState } from 'react'
import { WORKLOAD_TAB_OPTIONS } from '../../shared/types'
import type { ClusterInfo, ClusterSection, WorkloadTabId } from '../../shared/types'
import AddClusterModal from './components/AddClusterModal'
import './Sidebar.css'

interface Props {
  clusters: ClusterInfo[]
  width: number
  activeCluster: ClusterInfo | null
  activeSection: ClusterSection | null
  activeWorkloadTab: WorkloadTabId | null
  showSettings: boolean
  onToggleCollapse: () => void
  onSelect: (c: ClusterInfo, section: ClusterSection, workloadTab?: WorkloadTabId) => void
  onAdd: (name: string, content: string) => Promise<void>
  onRename: (oldFilename: string, newName: string) => Promise<void>
  onDelete: (filename: string) => Promise<void>
  onSettingsClick: () => void
}

export default function Sidebar({ clusters, width, activeCluster, activeSection, activeWorkloadTab, showSettings, onToggleCollapse, onSelect, onAdd, onRename, onDelete, onSettingsClick }: Props) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCluster, setEditingCluster] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ filename: string; x: number; y: number } | null>(null)
  const [expandedClusters, setExpandedClusters] = useState<string[]>([])
  const [expandedWorkloads, setExpandedWorkloads] = useState<string[]>([])

  useEffect(() => {
    const valid = new Set(clusters.map(cluster => cluster.filename))
    setExpandedClusters(current => current.filter(filename => valid.has(filename)))
    setExpandedWorkloads(current => current.filter(filename => valid.has(filename)))
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
    }
  }, [activeCluster, activeSection])

  const handleContextMenu = (e: React.MouseEvent, c: ClusterInfo) => {
    e.preventDefault()
    setContextMenu({ filename: c.filename, x: e.clientX, y: e.clientY })
  }

  const handleStartRename = (c: ClusterInfo) => {
    setEditingCluster(c.filename)
    setEditName(c.name)
    setContextMenu(null)
  }

  const handleRename = async (oldFilename: string) => {
    if (editName.trim()) {
      await onRename(oldFilename, editName.trim())
    }
    setEditingCluster(null)
  }

  const handleDelete = (filename: string) => {
    setContextMenu(null)
    onDelete(filename)
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

  return (
    <>
      <aside className="sidebar" style={{ width, minWidth: width }} onClick={() => setContextMenu(null)}>
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

        <div className="cluster-list">
          {clusters.length === 0 ? (
            <div className="no-clusters">No clusters found</div>
          ) : (
            clusters.map(c => {
              const expanded = expandedClusters.includes(c.filename)
              const active = activeCluster?.filename === c.filename
              const overviewActive = active && activeSection === 'overview'
              const workloadsActive = active && activeSection === 'workloads'
              const workloadsExpanded = expandedWorkloads.includes(c.filename)

              return (
                <div
                  key={c.filename}
                  className={`cluster-item ${expanded ? 'expanded' : ''} ${active ? 'active' : ''}`}
                  onContextMenu={e => handleContextMenu(e, c)}
                >
                  {editingCluster === c.filename ? (
                    <input
                      className="rename-input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleRename(c.filename)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(c.filename)
                        if (e.key === 'Escape') setEditingCluster(null)
                      }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="cluster-main-row">
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
                          <button
                            type="button"
                            className={`cluster-sub-item ${overviewActive ? 'active' : ''}`}
                            onClick={e => {
                              e.stopPropagation()
                              onSelect(c, 'overview')
                            }}
                          >
                            <span>Overview</span>
                          </button>
                          <button
                            type="button"
                            className={`cluster-sub-item cluster-sub-toggle ${workloadsActive ? 'active' : ''}`}
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
                          {workloadsExpanded && (
                            <div className="cluster-workloads-list">
                              {WORKLOAD_TAB_OPTIONS.map(tab => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  className={`cluster-workload-item ${workloadsActive && activeWorkloadTab === tab.id ? 'active' : ''}`}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onSelect(c, 'workloads', tab.id)
                                  }}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })
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
            <button onClick={() => { const c = clusters.find(c => c.filename === contextMenu.filename); if (c) handleStartRename(c); else setContextMenu(null); }}>
              Rename
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
    </>
  )
}
