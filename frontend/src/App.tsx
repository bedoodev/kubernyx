import { useState, useEffect } from 'react'
import { GetBasePath, SetBasePath, SelectDirectory } from './shared/api'
import { useSidebarResize } from './shared/hooks/useSidebarResize'
import { useClusterTabs, getTabDisplayName, truncateWithEllipsis } from './shared/hooks/useClusterTabs'
import { useKeyboardShortcuts } from './shared/hooks/useKeyboardShortcuts'
import Setup from './features/setup/Setup'
import Sidebar from './features/sidebar/Sidebar'
import Overview from './features/overview/Overview'
import WorkloadsView from './features/workloads/WorkloadsView'
import Settings from './features/settings/Settings'
import './App.css'

type AppView = 'loading' | 'setup' | 'main'

const TAB_NAME_MAX_LENGTH = 20

export default function App() {
  const [view, setView] = useState<AppView>('loading')
  const [showSettings, setShowSettings] = useState(false)
  const sidebar = useSidebarResize({ default: 260, min: 220, max: 520 })
  const clusterTabs = useClusterTabs({ showSettings })

  useKeyboardShortcuts({
    enabled: view === 'main',
    showSettings,
    activeTabId: clusterTabs.activeTabId,
    onCloseSettings: () => setShowSettings(false),
    onCloseTab: clusterTabs.handleCloseTab,
    onToggleSidebar: sidebar.onToggle,
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

  const handleActivateTab: typeof clusterTabs.handleActivateTab = (tabId) => {
    setShowSettings(false)
    clusterTabs.handleActivateTab(tabId)
  }

  if (view === 'loading') {
    return <div className="app-loading"><div className="spinner" /></div>
  }

  if (view === 'setup') {
    return <Setup onSelect={handleSetup} />
  }

  const { activeTab } = clusterTabs

  return (
    <div className={`app-layout ${sidebar.sidebarResizing ? 'resizing' : ''} ${sidebar.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {sidebar.sidebarCollapsed ? (
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
            width={sidebar.sidebarWidth}
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
        {clusterTabs.tabs.length > 0 && (
          <div className="cluster-tabs">
            {clusterTabs.tabs.map(tab => {
              const fullTabName = getTabDisplayName(tab)
              const tabName = truncateWithEllipsis(fullTabName, TAB_NAME_MAX_LENGTH)
              return (
                <div
                  key={tab.id}
                  className={`cluster-tab ${clusterTabs.activeTabId === tab.id ? 'active' : ''}`}
                  onClick={() => handleActivateTab(tab.id)}
                  title={fullTabName}
                >
                  {tab.section === 'overview' && (
                    <span className={`cluster-tab-dot ${tab.cluster.healthStatus ?? 'red'}`} />
                  )}
                  <span className={`cluster-tab-name ${tab.hasActivity ? '' : 'inactive'}`}>{tabName}</span>
                  <button
                    type="button"
                    className="cluster-tab-close"
                    onClick={event => {
                      event.stopPropagation()
                      clusterTabs.handleCloseTab(tab.id)
                    }}
                    aria-label={`Close ${fullTabName} tab`}
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>
        )}

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
      </main>

      {showSettings && (
        <div className="app-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="app-modal-shell settings-modal-shell" onClick={event => event.stopPropagation()}>
            <div className="app-modal-header">
              <h3>Settings</h3>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="app-modal-body">
              <Settings onPathChanged={clusterTabs.loadClusters} embedded />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
