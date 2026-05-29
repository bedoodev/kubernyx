import { useEffect, useMemo, useRef, useState } from 'react'
import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from 'xterm'
import {
  CloseTerminalSession,
  EventsOn,
  ResizeTerminalSession,
  StartTerminalSession,
  WriteTerminalInput,
} from '../../shared/api'
import type { TerminalTarget, TerminalStatusState } from '../../shared/types'
import {
  toTerminalDataEvent,
  toTerminalExitEvent,
  toTerminalStatusEvent,
} from '../../shared/utils/normalization'
import './TerminalSessionView.css'

interface Props {
  target: TerminalTarget
  active: boolean
  className?: string
}

function buildInitialState(target: TerminalTarget): { state: TerminalStatusState; message?: string } {
  if (target.kind === 'node') {
    return { state: 'creating-debug-pod', message: target.nodeName ? `Preparing node shell on ${target.nodeName}` : undefined }
  }
  return { state: 'connecting' }
}

function getStatusLabel(state: string): string {
  switch (state) {
    case 'creating-debug-pod':
      return 'Creating debug pod'
    case 'connecting':
      return 'Connecting'
    case 'connected':
      return 'Connected'
    case 'cleaning-up':
      return 'Cleaning up'
    case 'failed':
      return 'Failed'
    case 'closed':
      return 'Closed'
    default:
      return state
  }
}

export default function TerminalSessionView({ target, active, className = '' }: Props) {
  const targetKey = [
    target.kind,
    target.filename,
    target.namespace ?? '',
    target.podName ?? '',
    target.container ?? '',
    target.nodeName ?? '',
  ].join('::')
  const sessionId = useMemo(
    () => `term:${targetKey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    [targetKey],
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const activeRef = useRef(active)
  const statusStateRef = useRef<string>(buildInitialState(target).state)
  const pendingOutputRef = useRef<string[]>([])
  const [statusState, setStatusState] = useState<string>(buildInitialState(target).state)
  const [statusMessage, setStatusMessage] = useState<string | undefined>(buildInitialState(target).message)
  const [closedInfo, setClosedInfo] = useState<{ exitCode: number; error?: string } | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    statusStateRef.current = statusState
  }, [statusState])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let dataDisposable: { dispose: () => void } | null = null
    let terminalInstance: Terminal | null = null
    let detachFocusHandler: (() => void) | null = null

    const initializeTerminal = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('xterm'),
        import('@xterm/addon-fit'),
        import('xterm/css/xterm.css'),
      ])
      if (disposed) {
        return
      }

      const terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.3,
        scrollback: 3000,
        theme: {
          background: '#041119',
          foreground: '#d9f2ff',
          cursor: '#9bf6ff',
          selectionBackground: 'rgba(109, 212, 255, 0.22)',
        },
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(container)
      terminalRef.current = terminal
      fitAddonRef.current = fitAddon
      terminalInstance = terminal

      const focusTerminal = () => {
        if (activeRef.current) {
          terminal.focus()
        }
      }

      const flushPendingOutput = () => {
        if (pendingOutputRef.current.length === 0) {
          return
        }
        terminal.write(pendingOutputRef.current.join(''))
        pendingOutputRef.current = []
      }

      const fitTerminal = () => {
        if (!activeRef.current) {
          return
        }
        fitAddon.fit()
        if (terminal.cols <= 0 || terminal.rows <= 0) {
          return
        }
        void ResizeTerminalSession(sessionId, terminal.cols, terminal.rows)
      }

      flushPendingOutput()
      fitTerminal()
      if (statusStateRef.current === 'connected') {
        focusTerminal()
      }

      resizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(fitTerminal)
      })
      resizeObserver.observe(container)

      const handlePointerDown = () => focusTerminal()
      container.addEventListener('pointerdown', handlePointerDown)
      detachFocusHandler = () => {
        container.removeEventListener('pointerdown', handlePointerDown)
      }

      dataDisposable = terminal.onData(data => {
        if (statusStateRef.current !== 'connected') {
          return
        }
        void WriteTerminalInput(sessionId, data)
      })
    }

    void initializeTerminal().catch((errorValue: unknown) => {
      const message = errorValue instanceof Error ? errorValue.message : String(errorValue)
      setStatusState('failed')
      setStatusMessage(message)
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      detachFocusHandler?.()
      dataDisposable?.dispose()
      terminalInstance?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const appendOutput = (data: string) => {
      if (!data) {
        return
      }
      const terminal = terminalRef.current
      if (!terminal) {
        pendingOutputRef.current.push(data)
        return
      }
      terminal.write(data)
    }

    const unsubscribeData = EventsOn('terminal-data', (payload: unknown) => {
      const event = toTerminalDataEvent(payload)
      if (event.sessionId !== sessionId) {
        return
      }
      appendOutput(event.data)
    })

    const unsubscribeStatus = EventsOn('terminal-status', (payload: unknown) => {
      const event = toTerminalStatusEvent(payload)
      if (event.sessionId !== sessionId) {
        return
      }
      setStatusState(event.state)
      setStatusMessage(event.message)
      if (event.state === 'connected') {
        setClosedInfo(null)
        window.requestAnimationFrame(() => {
          fitAddonRef.current?.fit()
          const terminal = terminalRef.current
          if (active && terminal && terminal.cols > 0 && terminal.rows > 0) {
            void ResizeTerminalSession(sessionId, terminal.cols, terminal.rows)
            terminal.focus()
          }
        })
      }
    })

    const unsubscribeExit = EventsOn('terminal-exit', (payload: unknown) => {
      const event = toTerminalExitEvent(payload)
      if (event.sessionId !== sessionId) {
        return
      }
      setClosedInfo({
        exitCode: event.exitCode,
        error: event.error,
      })
    })

    void StartTerminalSession(sessionId, target).then(() => {
      if (!mounted) {
        void CloseTerminalSession(sessionId)
        return
      }
    }).catch((errorValue: unknown) => {
      const message = errorValue instanceof Error ? errorValue.message : String(errorValue)
      setStatusState('failed')
      setStatusMessage(message)
    })

    return () => {
      mounted = false
      unsubscribeData()
      unsubscribeStatus()
      unsubscribeExit()
      void CloseTerminalSession(sessionId)
    }
  }, [sessionId])

  useEffect(() => {
    if (!active) {
      return
    }
    window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      const terminal = terminalRef.current
      if (terminal && terminal.cols > 0 && terminal.rows > 0) {
        void ResizeTerminalSession(sessionId, terminal.cols, terminal.rows)
        terminal.focus()
      }
    })
  }, [active, statusState])

  return (
    <div className={`terminal-session-root ${className}`.trim()}>
      <div className={`terminal-session-status state-${statusState}`}>
        <span className="terminal-session-status-dot" />
        <span className="terminal-session-status-label">{getStatusLabel(statusState)}</span>
        {statusMessage && (
          <span className="terminal-session-status-message">{statusMessage}</span>
        )}
        {closedInfo && (
          <span className="terminal-session-status-message">
            {closedInfo.error ? closedInfo.error : `Exit code ${closedInfo.exitCode}`}
          </span>
        )}
      </div>
      <div className="terminal-session-surface" ref={containerRef} tabIndex={-1} />
    </div>
  )
}
