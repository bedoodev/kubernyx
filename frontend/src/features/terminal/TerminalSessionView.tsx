import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
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

const SHELL_PROMPT_PATTERN = /((?:~|\/)[^\r\n]* # )/g

const TERMINAL_THEME = {
  background: '#071018',
  foreground: '#d8e7ef',
  cursor: '#ffd166',
  cursorAccent: '#071018',
  selectionBackground: 'rgba(125, 211, 252, 0.28)',
  black: '#0b1220',
  brightBlack: '#5f6f89',
  red: '#ff7b86',
  brightRed: '#ff9aa2',
  green: '#6ee7a8',
  brightGreen: '#8ff0bc',
  yellow: '#f6d365',
  brightYellow: '#ffe08a',
  blue: '#7da9ff',
  brightBlue: '#9abfff',
  magenta: '#c4a7ff',
  brightMagenta: '#d7c2ff',
  cyan: '#62d8ef',
  brightCyan: '#8feeff',
  white: '#d8e7ef',
  brightWhite: '#ffffff',
}

function insertLineBreaksBeforePrompt(data: string, prompt: string | null, previousLineHasContent: boolean): string {
  if (!prompt) {
    return data
  }

  let normalized = ''
  let cursor = 0
  let promptIndex = data.indexOf(prompt)
  while (promptIndex !== -1) {
    normalized += data.slice(cursor, promptIndex)
    const previousCharacter = data[promptIndex - 1]
    const promptContinuesPreviousLine = promptIndex === 0
      ? previousLineHasContent
      : previousCharacter !== '\n' && previousCharacter !== '\r'
    if (promptContinuesPreviousLine) {
      normalized += '\r\n'
    }
    normalized += prompt
    cursor = promptIndex + prompt.length
    promptIndex = data.indexOf(prompt, cursor)
  }

  return `${normalized}${data.slice(cursor)}`
}

function extractShellPrompt(data: string): string | null {
  SHELL_PROMPT_PATTERN.lastIndex = 0
  let prompt: string | null = null
  let match = SHELL_PROMPT_PATTERN.exec(data)
  while (match) {
    prompt = match[1]
    match = SHELL_PROMPT_PATTERN.exec(data)
  }
  return prompt
}

function normalizeShellOutput(
  data: string,
  previousPrompt: string | null,
  previousLineHasContent: boolean,
): { data: string; prompt: string | null; lineHasContent: boolean } {
  const withKnownPromptBreaks = insertLineBreaksBeforePrompt(data, previousPrompt, previousLineHasContent)
  const detectedPrompt = extractShellPrompt(withKnownPromptBreaks)
  const normalizedData = insertLineBreaksBeforePrompt(withKnownPromptBreaks, detectedPrompt, previousLineHasContent)
  const promptlessData = detectedPrompt ? normalizedData.split(detectedPrompt).join('') : normalizedData
  const lastCharacter = promptlessData[promptlessData.length - 1]
  return {
    data: promptlessData,
    prompt: detectedPrompt,
    lineHasContent: promptlessData.length > 0
      ? lastCharacter !== '\n' && lastCharacter !== '\r'
      : previousLineHasContent,
  }
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

function getTargetTitle(target: TerminalTarget): string {
  switch (target.kind) {
    case 'pod':
      return 'Pod shell'
    case 'node':
      return 'Node shell'
    case 'cluster':
      return 'Cluster shell'
    default:
      return 'Shell'
  }
}

function getTargetChips(target: TerminalTarget): string[] {
  const chips: string[] = []
  if (target.namespace) {
    chips.push(target.namespace)
  }
  if (target.podName) {
    chips.push(target.podName)
  }
  if (target.nodeName) {
    chips.push(target.nodeName)
  }
  if (target.container) {
    chips.push(target.container)
  }
  return chips
}

function getTargetSubtitle(target: TerminalTarget): string {
  if (target.kind === 'pod') {
    return [target.namespace, target.podName, target.container].filter(Boolean).join(' / ')
  }
  if (target.kind === 'node') {
    return target.nodeName ? `node / ${target.nodeName}` : 'node'
  }
  return target.filename
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
  const inputRef = useRef<HTMLInputElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fitFrameRef = useRef<number | null>(null)
  const lastTerminalSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const activeRef = useRef(active)
  const statusStateRef = useRef<string>(buildInitialState(target).state)
  const pendingOutputRef = useRef<string[]>([])
  const pendingShellEchoRef = useRef<string | null>(null)
  const shellPromptRef = useRef<string | null>(null)
  const lineHasContentRef = useRef(false)
  const [statusState, setStatusState] = useState<string>(buildInitialState(target).state)
  const [statusMessage, setStatusMessage] = useState<string | undefined>(buildInitialState(target).message)
  const [closedInfo, setClosedInfo] = useState<{ exitCode: number; error?: string } | null>(null)
  const [commandInput, setCommandInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyCursor, setHistoryCursor] = useState<number | null>(null)
  const [inputPrompt, setInputPrompt] = useState('#')
  const targetTitle = getTargetTitle(target)
  const targetChips = getTargetChips(target)
  const targetSubtitle = getTargetSubtitle(target)
  const inputDisabled = statusState !== 'connected'

  const writeTerminalOutput = (data: string) => {
    if (!data) {
      return
    }

    const terminal = terminalRef.current
    if (!terminal) {
      pendingOutputRef.current.push(data)
      return
    }
    terminal.write(data, () => {
      terminal.scrollToBottom()
    })
  }

  const fitAndResizeTerminal = (options: { force?: boolean; focus?: boolean } = {}) => {
    if (fitFrameRef.current !== null) {
      window.cancelAnimationFrame(fitFrameRef.current)
    }

    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = null
      const terminal = terminalRef.current
      const fitAddon = fitAddonRef.current
      if (!terminal || !fitAddon || !activeRef.current) {
        return
      }

      fitAddon.fit()
      if (terminal.cols <= 0 || terminal.rows <= 0) {
        return
      }

      const nextSize = { cols: terminal.cols, rows: terminal.rows }
      const previousSize = lastTerminalSizeRef.current
      const sizeChanged = !previousSize || previousSize.cols !== nextSize.cols || previousSize.rows !== nextSize.rows
      if (sizeChanged || options.force) {
        lastTerminalSizeRef.current = nextSize
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
        if (statusStateRef.current === 'connected') {
          void ResizeTerminalSession(sessionId, nextSize.cols, nextSize.rows)
        }
      }

      if (options.focus) {
        inputRef.current?.focus()
      }
    })
  }

  const sendRawInput = (data: string) => {
    if (statusStateRef.current !== 'connected') {
      return
    }
    terminalRef.current?.scrollToBottom()
    void WriteTerminalInput(sessionId, data)
  }

  const submitCommand = () => {
    if (inputDisabled) {
      return
    }

    const command = commandInput
    const commandLine = `${inputPrompt} ${command}`.trimEnd()
    writeTerminalOutput(`${commandLine}\r\n`)
    lineHasContentRef.current = false
    pendingShellEchoRef.current = command === '' ? null : command
    sendRawInput(`${command}\r`)
    if (command.trim() !== '') {
      setCommandHistory(current => {
        const next = current[current.length - 1] === command ? current : [...current, command]
        return next.slice(-100)
      })
    }
    setHistoryCursor(null)
    setCommandInput('')
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitCommand()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (commandHistory.length === 0) {
        return
      }
      const nextCursor = historyCursor === null ? commandHistory.length - 1 : Math.max(0, historyCursor - 1)
      setHistoryCursor(nextCursor)
      setCommandInput(commandHistory[nextCursor])
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (commandHistory.length === 0 || historyCursor === null) {
        return
      }
      const nextCursor = historyCursor + 1
      if (nextCursor >= commandHistory.length) {
        setHistoryCursor(null)
        setCommandInput('')
        return
      }
      setHistoryCursor(nextCursor)
      setCommandInput(commandHistory[nextCursor])
      return
    }

    if (event.key.toLowerCase() === 'c' && event.ctrlKey) {
      event.preventDefault()
      sendRawInput('\x03')
      setHistoryCursor(null)
      setCommandInput('')
    }
  }

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
        cursorStyle: 'bar',
        cursorWidth: 2,
        disableStdin: true,
        fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        lineHeight: 1.42,
        minimumContrastRatio: 4.5,
        rightClickSelectsWord: true,
        scrollback: 5000,
        scrollOnUserInput: true,
        theme: TERMINAL_THEME,
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(container)
      terminalRef.current = terminal
      fitAddonRef.current = fitAddon
      terminalInstance = terminal

      const flushPendingOutput = () => {
        if (pendingOutputRef.current.length === 0) {
          return
        }
        terminal.write(pendingOutputRef.current.join(''), () => {
          terminal.scrollToBottom()
        })
        pendingOutputRef.current = []
      }

      flushPendingOutput()
      fitAndResizeTerminal({ force: true, focus: statusStateRef.current === 'connected' })

      resizeObserver = new ResizeObserver(() => {
        fitAndResizeTerminal()
      })
      resizeObserver.observe(container)

      const handlePointerDown = () => {
        if (activeRef.current) {
          inputRef.current?.focus()
        }
      }
      container.addEventListener('pointerdown', handlePointerDown)
      detachFocusHandler = () => {
        container.removeEventListener('pointerdown', handlePointerDown)
      }
    }

    void initializeTerminal().catch((errorValue: unknown) => {
      const message = errorValue instanceof Error ? errorValue.message : String(errorValue)
      setStatusState('failed')
      setStatusMessage(message)
    })

    return () => {
      disposed = true
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }
      resizeObserver?.disconnect()
      detachFocusHandler?.()
      terminalInstance?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      lastTerminalSizeRef.current = null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const appendOutput = (data: string) => {
      if (!data) {
        return
      }
      const pendingEcho = pendingShellEchoRef.current
      if (pendingEcho !== null) {
        const echoPattern = new RegExp(`^${pendingEcho.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n?`)
        data = data.replace(echoPattern, '')
        pendingShellEchoRef.current = null
        if (!data) {
          return
        }
      }

      const normalized = normalizeShellOutput(data, shellPromptRef.current, lineHasContentRef.current)
      const prompt = normalized.prompt
      if (prompt) {
        shellPromptRef.current = prompt
        setInputPrompt(prompt.trim())
      }
      lineHasContentRef.current = normalized.lineHasContent
      writeTerminalOutput(normalized.data)
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
        fitAndResizeTerminal({ force: true, focus: true })
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
    fitAndResizeTerminal({ force: true, focus: statusStateRef.current === 'connected' })
  }, [active, statusState])

  useEffect(() => {
    if (active && statusState === 'connected') {
      inputRef.current?.focus()
    }
  }, [active, statusState])

  return (
    <div className={`terminal-session-root ${className}`.trim()}>
      <div className="terminal-session-chrome">
        <div className="terminal-session-identity">
          <strong className="terminal-session-title">{targetTitle}</strong>
          <span className="terminal-session-subtitle">{targetSubtitle}</span>
        </div>
        <span className={`terminal-session-status-pill state-${statusState}`}>
          <span className="terminal-session-status-dot" />
          <span className="terminal-session-status-label">{getStatusLabel(statusState)}</span>
        </span>
        {targetChips.length > 0 && (
          <div className="terminal-session-targets" aria-label="Shell target">
            {targetChips.map(chip => (
              <span key={chip} className="terminal-session-target-chip">{chip}</span>
            ))}
          </div>
        )}
        {(statusMessage || closedInfo) && (
          <div className="terminal-session-message">
            {statusMessage}
            {closedInfo && (
              <span>{closedInfo.error ? closedInfo.error : `Exit code ${closedInfo.exitCode}`}</span>
            )}
          </div>
        )}
      </div>
      <div className="terminal-session-workspace">
        <div className="terminal-session-output-frame">
          <div className="terminal-session-surface" ref={containerRef} tabIndex={-1} />
        </div>
      </div>
      <form
        className={`terminal-session-composer ${inputDisabled ? 'is-disabled' : ''}`}
        onSubmit={event => {
          event.preventDefault()
          submitCommand()
        }}
      >
        <div className="terminal-session-composer-main">
          <span className="terminal-session-input-prompt" title={inputPrompt}>{inputPrompt}</span>
          <input
            ref={inputRef}
            className="terminal-session-command-input"
            value={commandInput}
            onChange={event => {
              setCommandInput(event.target.value)
              setHistoryCursor(null)
            }}
            onKeyDown={handleInputKeyDown}
            disabled={inputDisabled}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Terminal command input"
            placeholder={inputDisabled ? getStatusLabel(statusState) : ''}
          />
        </div>
      </form>
    </div>
  )
}
