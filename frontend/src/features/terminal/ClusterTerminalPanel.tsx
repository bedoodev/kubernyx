import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { CompleteClusterKubectl, ExecClusterKubectl } from '../../shared/api'
import type { ClusterInfo } from '../../shared/types'
import { toPodExecResult } from '../../shared/utils/normalization'
import './ClusterTerminalPanel.css'

interface TerminalEntry {
  id: number
  command: string
  stdout: string
  stderr: string
  exitCode: number
}

interface TerminalSession {
  entries: TerminalEntry[]
  command: string
  running: boolean
  tabCompleting: boolean
  history: string[]
  historyIndex: number
  draft: string
}

export interface ClusterTerminalTab {
  id: string
  cluster: ClusterInfo
  title: string
}

interface Props {
  tabs: ClusterTerminalTab[]
  activeTabId: string | null
  collapsed: boolean
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onRenameTab: (tabId: string, title: string) => void
  onClosePanel: () => void
  onToggleCollapse: () => void
}

const EMPTY_SESSION: TerminalSession = {
  entries: [],
  command: '',
  running: false,
  tabCompleting: false,
  history: [],
  historyIndex: -1,
  draft: '',
}

const DEFAULT_HEIGHT = 280
const MIN_HEIGHT = 180
const MAX_HEIGHT = 560

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseKubectlCompletions(rawOutput: string): string[] {
  const lines = rawOutput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return []
  }

  return lines.filter(line => !line.startsWith(':'))
}

function getTokenBounds(command: string): { start: number; token: string } {
  if (command.length === 0) {
    return { start: 0, token: '' }
  }
  const trailingSpace = /\s$/.test(command)
  if (trailingSpace) {
    return { start: command.length, token: '' }
  }

  let index = command.length - 1
  for (; index >= 0; index -= 1) {
    if (/\s/.test(command[index])) {
      break
    }
  }
  const start = index + 1
  return { start, token: command.slice(start) }
}

function commonPrefix(values: string[]): string {
  if (values.length === 0) {
    return ''
  }
  let prefix = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i]
    let j = 0
    for (; j < prefix.length && j < value.length; j += 1) {
      if (prefix[j] !== value[j]) {
        break
      }
    }
    prefix = prefix.slice(0, j)
    if (!prefix) {
      return ''
    }
  }
  return prefix
}

export default function ClusterTerminalPanel({
  tabs,
  activeTabId,
  collapsed,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onClosePanel,
  onToggleCollapse,
}: Props) {
  const [sessions, setSessions] = useState<Record<string, TerminalSession>>({})
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [isResizing, setIsResizing] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renamingTabLabel, setRenamingTabLabel] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null)

  const activeTab = (activeTabId ? (tabs.find(tab => tab.id === activeTabId) ?? null) : null) ?? tabs[0] ?? null
  const session = activeTab ? (sessions[activeTab.id] ?? EMPTY_SESSION) : EMPTY_SESSION

  const updateSession = useCallback((tabId: string, updater: (current: TerminalSession) => TerminalSession) => {
    setSessions(current => {
      const currentSession = current[tabId] ?? EMPTY_SESSION
      const nextSession = updater(currentSession)
      if (nextSession === currentSession) {
        return current
      }
      return {
        ...current,
        [tabId]: nextSession,
      }
    })
  }, [])

  const handleTabMouseDown = (event: ReactMouseEvent<HTMLButtonElement>, tabId: string) => {
    if (event.button !== 1) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onCloseTab(tabId)
  }

  const startRenamingTab = (tabId: string, currentTitle: string) => {
    setRenamingTabId(tabId)
    setRenamingTabLabel(currentTitle)
  }

  const commitRenamingTab = useCallback((tabId: string) => {
    const nextTitle = renamingTabLabel.trim()
    if (nextTitle) {
      onRenameTab(tabId, nextTitle)
    }
    setRenamingTabId(null)
    setRenamingTabLabel('')
  }, [onRenameTab, renamingTabLabel])

  const cancelRenamingTab = () => {
    setRenamingTabId(null)
    setRenamingTabLabel('')
  }

  const runCommand = useCallback(async (rawCommand: string) => {
    if (!activeTab) {
      return
    }
    if (session.running || session.tabCompleting) {
      return
    }

    const tabId = activeTab.id
    const clusterFilename = activeTab.cluster.filename
    const trimmedInput = rawCommand.trim()
    if (!trimmedInput) {
      return
    }

    if (trimmedInput === 'clear') {
      updateSession(tabId, current => ({
        ...current,
        command: '',
        entries: [],
        history: [...current.history, trimmedInput],
        historyIndex: -1,
        draft: '',
        running: false,
        tabCompleting: false,
      }))
      return
    }

    updateSession(tabId, current => ({
      ...current,
      command: '',
      running: true,
      tabCompleting: false,
      history: [...current.history, trimmedInput],
      historyIndex: -1,
      draft: '',
    }))

    try {
      const response = await ExecClusterKubectl(clusterFilename, trimmedInput)
      const result = toPodExecResult(response)
      const entry: TerminalEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        command: trimmedInput,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }

      updateSession(tabId, current => ({
        ...current,
        running: false,
        tabCompleting: false,
        entries: [...current.entries, entry],
      }))
    } catch (error) {
      const entry: TerminalEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        command: trimmedInput,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      }
      updateSession(tabId, current => ({
        ...current,
        running: false,
        tabCompleting: false,
        entries: [...current.entries, entry],
      }))
    }
  }, [activeTab, session.running, session.tabCompleting, updateSession])

  const handleTabCompletion = useCallback(async () => {
    if (!activeTab) {
      return
    }
    if (session.running || session.tabCompleting) {
      return
    }

    const tabId = activeTab.id
    const clusterFilename = activeTab.cluster.filename
    const currentCommand = session.command
    const trimmed = currentCommand.trimStart()
    if (trimmed.length > 0 && !trimmed.startsWith('kubectl')) {
      return
    }
    const trailingSpace = /\s$/.test(currentCommand)
    const inputForCompletion = currentCommand.trim()

    updateSession(tabId, current => ({
      ...current,
      tabCompleting: true,
    }))

    try {
      const response = await CompleteClusterKubectl(clusterFilename, inputForCompletion, trailingSpace)
      const result = toPodExecResult(response)
      const suggestions = parseKubectlCompletions(result.stdout)

      if (suggestions.length === 0) {
        updateSession(tabId, current => ({
          ...current,
          tabCompleting: false,
        }))
        return
      }

      const { start, token } = getTokenBounds(currentCommand)
      const prefix = commonPrefix(suggestions)

      if (suggestions.length === 1) {
        const next = `${currentCommand.slice(0, start)}${suggestions[0]} `
        updateSession(tabId, current => ({
          ...current,
          tabCompleting: false,
          command: next,
        }))
        return
      }

      if (prefix.length > token.length) {
        const next = `${currentCommand.slice(0, start)}${prefix}`
        updateSession(tabId, current => ({
          ...current,
          tabCompleting: false,
          command: next,
        }))
        return
      }

      const preview = suggestions.slice(0, 200).join('\n')
      const entry: TerminalEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        command: currentCommand || 'kubectl',
        stdout: preview,
        stderr: '',
        exitCode: 0,
      }
      updateSession(tabId, current => ({
        ...current,
        tabCompleting: false,
        entries: [...current.entries, entry],
      }))
    } catch (error) {
      const entry: TerminalEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        command: currentCommand || 'kubectl',
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      }
      updateSession(tabId, current => ({
        ...current,
        tabCompleting: false,
        entries: [...current.entries, entry],
      }))
    }
  }, [activeTab, session.command, session.running, session.tabCompleting, updateSession])

  useEffect(() => {
    const validTabIds = new Set(tabs.map(tab => tab.id))
    setSessions(current => {
      let changed = false
      const next: Record<string, TerminalSession> = {}
      for (const [tabId, tabSession] of Object.entries(current)) {
        if (!validTabIds.has(tabId)) {
          changed = true
          continue
        }
        next[tabId] = tabSession
      }
      return changed ? next : current
    })
  }, [tabs])

  useEffect(() => {
    if (!renamingTabId) {
      return
    }
    if (tabs.some(tab => tab.id === renamingTabId)) {
      return
    }
    setRenamingTabId(null)
    setRenamingTabLabel('')
  }, [renamingTabId, tabs])

  useEffect(() => {
    if (!activeTab || collapsed) {
      return
    }
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [activeTab, collapsed])

  useEffect(() => {
    if (!renamingTabId) {
      return
    }
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [renamingTabId])

  useEffect(() => {
    if (collapsed) {
      return
    }
    const body = bodyRef.current
    if (!body) {
      return
    }
    body.scrollTop = body.scrollHeight
  }, [activeTab, collapsed, session.entries.length, session.running, session.tabCompleting])

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const onMouseMove = (event: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) {
        return
      }
      const delta = start.y - event.clientY
      setHeight(clamp(start.height + delta, MIN_HEIGHT, MAX_HEIGHT))
    }

    const onMouseUp = () => {
      resizeStartRef.current = null
      setIsResizing(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing])

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!activeTab) {
      return
    }
    const tabId = activeTab.id

    if (event.key === 'Enter') {
      event.preventDefault()
      void runCommand(session.command)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      updateSession(tabId, current => {
        if (current.history.length === 0) {
          return current
        }
        if (current.historyIndex === -1) {
          return {
            ...current,
            draft: current.command,
            historyIndex: current.history.length - 1,
            command: current.history[current.history.length - 1],
          }
        }
        if (current.historyIndex > 0) {
          const nextIndex = current.historyIndex - 1
          return {
            ...current,
            historyIndex: nextIndex,
            command: current.history[nextIndex],
          }
        }
        return current
      })
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      updateSession(tabId, current => {
        if (current.historyIndex === -1) {
          return current
        }
        if (current.historyIndex < current.history.length - 1) {
          const nextIndex = current.historyIndex + 1
          return {
            ...current,
            historyIndex: nextIndex,
            command: current.history[nextIndex],
          }
        }
        return {
          ...current,
          historyIndex: -1,
          command: current.draft,
        }
      })
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      void handleTabCompletion()
    }
  }

  if (!activeTab) {
    return null
  }

  return (
    <section className={`cluster-terminal-panel ${isResizing ? 'resizing' : ''} ${collapsed ? 'collapsed' : ''}`} style={collapsed ? undefined : { height }}>
      {!collapsed && (
        <button
          type="button"
          className="cluster-terminal-resizer"
          aria-label="Resize terminal panel"
          onMouseDown={event => {
            resizeStartRef.current = { y: event.clientY, height }
            setIsResizing(true)
          }}
        />
      )}
      <header className="cluster-terminal-header">
        <div className="cluster-terminal-header-left">
          <div className="cluster-terminal-tabs" role="tablist" aria-label="Terminal tabs">
            {tabs.map(tab => {
              const isActive = tab.id === activeTab.id
              const isRenaming = renamingTabId === tab.id
              return (
                <div key={tab.id} className={`cluster-terminal-tab-wrap ${isActive ? 'active' : ''}`}>
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      className="cluster-terminal-tab-input"
                      value={renamingTabLabel}
                      onChange={event => setRenamingTabLabel(event.target.value)}
                      onBlur={() => commitRenamingTab(tab.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitRenamingTab(tab.id)
                          return
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelRenamingTab()
                        }
                      }}
                      title={tab.title}
                      aria-label="Rename terminal tab"
                    />
                  ) : (
                    <button
                      type="button"
                      className={`cluster-terminal-tab ${isActive ? 'active' : ''}`}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelectTab(tab.id)}
                      onDoubleClick={() => startRenamingTab(tab.id, tab.title)}
                      onMouseDown={event => handleTabMouseDown(event, tab.id)}
                      title={tab.title}
                    >
                      <span className="cluster-terminal-tab-label">{tab.title}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="cluster-terminal-tab-close"
                    onClick={event => {
                      event.stopPropagation()
                      onCloseTab(tab.id)
                    }}
                    aria-label={`Close ${tab.title} terminal tab`}
                    title={`Close ${tab.title}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
          <span className="cluster-terminal-cluster" title={activeTab.cluster.filename}>{activeTab.cluster.filename}</span>
        </div>
        <div className="cluster-terminal-header-actions">
          <button
            type="button"
            className="cluster-terminal-icon-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
          >
            {collapsed ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 15l6-6 6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="cluster-terminal-icon-btn"
            onClick={() => updateSession(activeTab.id, current => ({ ...current, entries: [] }))}
            title="Clear output"
            aria-label="Clear output"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
          <button
            type="button"
            className="cluster-terminal-icon-btn danger"
            onClick={onClosePanel}
            title="Close terminal"
            aria-label="Close terminal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <div
            className="cluster-terminal-body"
            ref={bodyRef}
            onClick={() => inputRef.current?.focus()}
          >
            {session.entries.length === 0 && (
              <div className="cluster-terminal-welcome">
                Run kubectl commands for this cluster.
              </div>
            )}
            {session.entries.map(entry => (
              <div key={entry.id} className="cluster-terminal-block">
                <div className="cluster-terminal-prompt-line">
                  <span className="cluster-terminal-prompt">{activeTab.cluster.name}</span>
                  <span className="cluster-terminal-cmd">$ {entry.command}</span>
                </div>
                {entry.stdout && (
                  <pre className="cluster-terminal-stdout">{entry.stdout}</pre>
                )}
                {entry.stderr && (
                  <pre className="cluster-terminal-stderr">{entry.stderr}</pre>
                )}
              </div>
            ))}
            {session.running && (
              <div className="cluster-terminal-running">Running...</div>
            )}
            {session.tabCompleting && (
              <div className="cluster-terminal-running">Completing...</div>
            )}
          </div>

          <div className="cluster-terminal-input-line">
            <span className="cluster-terminal-prompt">{activeTab.cluster.name}</span>
            <span className="cluster-terminal-cmd">$</span>
            <input
              ref={inputRef}
              type="text"
              className="cluster-terminal-input"
              value={session.command}
              onChange={event => {
                const value = event.target.value
                updateSession(activeTab.id, current => ({ ...current, command: value }))
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="kubectl get pods -A"
              disabled={session.running || session.tabCompleting}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </>
      )}
    </section>
  )
}
