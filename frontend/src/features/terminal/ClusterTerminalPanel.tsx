import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { ClusterInfo } from '../../shared/types'
import TerminalSessionView from './TerminalSessionView'
import './ClusterTerminalPanel.css'

export interface ClusterTerminalTab {
  id: string
  cluster: ClusterInfo
  title: string
}

interface Props {
  tabs: ClusterTerminalTab[]
  activeTabId: string | null
  collapsed: boolean
  onCreateTab: (cluster: ClusterInfo) => void
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onClosePanel: () => void
  onToggleCollapse: () => void
}

const DEFAULT_HEIGHT = 340
const MIN_HEIGHT = 190
const WINDOW_BOTTOM_GAP = 96

function getMaxHeight(): number {
  return Math.max(MIN_HEIGHT, window.innerHeight - WINDOW_BOTTOM_GAP)
}

export default function ClusterTerminalPanel({
  tabs,
  activeTabId,
  collapsed,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onClosePanel,
  onToggleCollapse,
}: Props) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [resizing, setResizing] = useState(false)
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0] ?? null

  useEffect(() => {
    const clampHeight = () => setHeight(current => Math.min(getMaxHeight(), Math.max(MIN_HEIGHT, current)))
    clampHeight()
    window.addEventListener('resize', clampHeight)
    return () => window.removeEventListener('resize', clampHeight)
  }, [])

  useEffect(() => {
    if (!resizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current
      if (!state) {
        return
      }
      const delta = state.startY - event.clientY
      setHeight(Math.min(getMaxHeight(), Math.max(MIN_HEIGHT, state.startHeight + delta)))
    }

    const stopResize = () => {
      resizeStateRef.current = null
      setResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [resizing])

  const handleResizeStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    resizeStateRef.current = { startY: event.clientY, startHeight: height }
    setResizing(true)
  }

  if (!activeTab) {
    return null
  }

  return (
    <section
      className={`cluster-terminal-panel ${collapsed ? 'is-collapsed' : ''} ${resizing ? 'is-resizing' : ''}`}
      style={collapsed ? undefined : { height }}
      aria-label="Cluster terminal"
    >
      {!collapsed && (
        <button
          type="button"
          className="cluster-terminal-resizer"
          onMouseDown={handleResizeStart}
          aria-label="Resize terminal panel"
        />
      )}
      <div className="cluster-terminal-header">
        <div className="cluster-terminal-tabs" role="tablist" aria-label="Terminal tabs">
          {tabs.map(tab => {
            const active = tab.id === activeTab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={`cluster-terminal-tab ${active ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
                title={tab.title}
                role="tab"
                aria-selected={active}
              >
                <span className={`cluster-terminal-tab-dot ${tab.cluster.healthStatus ?? 'red'}`} />
                <span className="cluster-terminal-tab-title">{tab.title}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className="cluster-terminal-tab-close"
                  aria-label={`Close ${tab.title} terminal`}
                  onClick={event => {
                    event.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </span>
              </button>
            )
          })}
          <button
            type="button"
            className="cluster-terminal-add"
            onClick={() => onCreateTab(activeTab.cluster)}
            title={`New terminal for ${activeTab.title}`}
            aria-label={`New terminal for ${activeTab.title}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="cluster-terminal-actions">
          <button
            type="button"
            className="cluster-terminal-action"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          >
            {collapsed ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 14l5-5 5 5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10l5 5 5-5" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="cluster-terminal-action"
            onClick={onClosePanel}
            title="Close terminal panel"
            aria-label="Close terminal panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="cluster-terminal-body">
          {tabs.map(tab => {
            const active = tab.id === activeTab.id
            return (
              <div
                key={tab.id}
                className={`cluster-terminal-view ${active ? 'is-active' : ''}`}
                aria-hidden={!active}
              >
                <TerminalSessionView
                  target={{ kind: 'cluster', filename: tab.cluster.filename }}
                  active={active}
                  className="cluster-terminal-session"
                />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
