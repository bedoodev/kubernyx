import { useEffect, useMemo, useRef, useState } from 'react'
import type { PodResource, PodDetail, PodDetailContainer, PodLogLine } from '../../../../shared/types'
import { ExecPodCommand, GetPodLogs, SavePodLogsFile } from '../../../../shared/api'
import { getAgeLabel, parsePhase, toPercent } from '../../../../shared/utils/formatting'
import { toPodExecResult, toPodLogLines } from '../../../../shared/utils/normalization'
import YamlEditor from '../../../../shared/components/YamlEditor'

export type PodDetailsTabId = 'overview' | 'metadata' | 'init-containers' | 'containers' | 'logs' | 'shell' | 'usages' | 'manifest'
type MetadataSectionKey = 'labels' | 'annotations' | 'volumes'
type InitSectionKey = 'env' | 'mounts'
type ContainerSectionKey = 'env' | 'ports' | 'mounts' | 'args'
type LogToneKey = 'error' | 'success' | 'warning' | 'debug' | 'default'
type LogLevelFilter = 'all' | 'debug' | 'info' | 'warning' | 'error'

interface ShellEntry {
  id: number
  container: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
}

interface ShellSession {
  entries: ShellEntry[]
  cwd: string
  history: string[]
  historyIndex: number
  draft: string
  command: string
  running: boolean
  tabCompleting: boolean
  error: string | null
  unavailable: boolean
  user: string
}

const EMPTY_SHELL_SESSION: ShellSession = {
  entries: [],
  cwd: '/',
  history: [],
  historyIndex: -1,
  draft: '',
  command: '',
  running: false,
  tabCompleting: false,
  error: null,
  unavailable: false,
  user: '',
}

const POD_DETAIL_TABS: Array<{ id: PodDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'init-containers', label: 'Init Containers' },
  { id: 'containers', label: 'Containers' },
  { id: 'logs', label: 'Logs' },
  { id: 'shell', label: 'Shell' },
  { id: 'usages', label: 'Usages' },
  { id: 'manifest', label: 'Manifest' },
]

function valueToneClass(value: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  const normalized = value.trim().toLowerCase()
  if (normalized === '' || normalized === '-') {
    return 'neutral'
  }
  if (normalized.includes('true') || normalized.includes('yes') || normalized.includes('running') || normalized.includes('ready')) {
    return 'ok'
  }
  if (normalized.includes('false') || normalized.includes('failed') || normalized.includes('error')) {
    return 'bad'
  }
  if (normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('terminating') || normalized.includes('unknown')) {
    return 'warn'
  }
  return 'neutral'
}

function formatCommandDisplay(parts: string[]): string {
  const filtered = parts.map(item => item.trim()).filter(Boolean)
  if (filtered.length === 0) {
    return '-'
  }

  if (filtered.length > 1) {
    return filtered.join('\n')
  }

  const single = filtered[0]
  if (!single.includes(' --')) {
    return single
  }

  const normalized = single.replace(/\s+/g, ' ').trim()
  return normalized.replace(/\s+(--[^\s]+)/g, '\n$1')
}

function syncToggleState(current: Record<string, boolean>, keys: string[], defaultValue: boolean): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const key of keys) {
    next[key] = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : defaultValue
  }
  return next
}

function detectLogTone(message: string): LogToneKey {
  const value = message.toLowerCase()
  if (/\b(error|fatal|panic|exception|traceback)\b/.test(value)) {
    return 'error'
  }
  if (/\b(warn|warning)\b/.test(value)) {
    return 'warning'
  }
  if (/\b(debug)\b/.test(value)) {
    return 'debug'
  }
  if (/\b(info|success|succeeded|successful|ok)\b/.test(value)) {
    return 'success'
  }
  return 'default'
}

const LOGS_ALL_CONTAINERS = '__all__'
const LOGS_LEVEL_OPTIONS: Array<{ value: LogLevelFilter; label: string }> = [
  { value: 'all', label: 'All Logs' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]
const LOGS_CONTAINER_TAG_COLORS = [
  '#8a9fc4',
  '#a89b7e',
  '#7e9bb8',
  '#7fb89a',
  '#b88a90',
  '#9a8fb8',
  '#b89a7e',
  '#7eb894',
]

function getContainerTagColor(containerName: string): string {
  if (!containerName.trim()) {
    return '#7a8ea8'
  }

  let hash = 0
  for (let i = 0; i < containerName.length; i += 1) {
    hash = ((hash << 5) - hash) + containerName.charCodeAt(i)
    hash |= 0
  }

  return LOGS_CONTAINER_TAG_COLORS[Math.abs(hash) % LOGS_CONTAINER_TAG_COLORS.length]
}

function matchesLogLevel(message: string, filter: LogLevelFilter): boolean {
  if (filter === 'all') {
    return true
  }
  const tone = detectLogTone(message)
  if (filter === 'info') {
    return tone === 'success'
  }
  return tone === filter
}

function formatCPUValue(milli: number): string {
  if (!Number.isFinite(milli) || milli <= 0) {
    return '-'
  }
  if (milli < 1000) {
    return `${Math.round(milli)}m`
  }
  return `${(milli / 1000).toFixed(2)} cores`
}

function formatMemoryValue(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '-'
  }
  const kib = 1024
  const mib = kib * 1024
  const gib = mib * 1024
  if (bytes >= gib) {
    return `${(bytes / gib).toFixed(2)} GiB`
  }
  if (bytes >= mib) {
    return `${(bytes / mib).toFixed(1)} MiB`
  }
  if (bytes >= kib) {
    return `${(bytes / kib).toFixed(1)} KiB`
  }
  return `${Math.round(bytes)} B`
}

function isTerminalUnavailableError(message: string): boolean {
  const value = message.toLowerCase()
  return (
    value.includes('unable to start container process')
    || value.includes('executable file not found')
    || value.includes('connection refused')
    || value.includes('context deadline exceeded')
    || value.includes('i/o timeout')
    || value.includes('failed to execute command')
    || value.includes('no such host')
    || value.includes('stream error')
  )
}

interface Props {
  clusterFilename: string
  mode: 'split' | 'modal'
  activeDetailsTab: PodDetailsTabId
  onDetailsTabChange: (tab: PodDetailsTabId) => void
  selectedPod: PodResource
  podDetail: PodDetail | null
  podDetailLoading: boolean
  podDetailError: string | null
  podLogs: PodLogLine[]
  podLogsLoading: boolean
  podLogsError: string | null
  podLogsLoadingOlder: boolean
  onLoadOlderLogs: () => void
  detailsMaximized: boolean
  showMaximizeButton?: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

export default function PodDetailPanel({
  clusterFilename,
  mode,
  activeDetailsTab,
  onDetailsTabChange,
  selectedPod,
  podDetail,
  podDetailLoading,
  podDetailError,
  podLogs,
  podLogsLoading,
  podLogsError,
  podLogsLoadingOlder,
  onLoadOlderLogs,
  detailsMaximized,
  showMaximizeButton = true,
  onToggleMaximize,
  onClose,
}: Props) {
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const [metadataOpenSections, setMetadataOpenSections] = useState<Record<MetadataSectionKey, boolean>>({
    labels: false,
    annotations: false,
    volumes: false,
  })
  const [initExpandedByKey, setInitExpandedByKey] = useState<Record<string, boolean>>({})
  const [initEnvOpenByKey, setInitEnvOpenByKey] = useState<Record<string, boolean>>({})
  const [initMountsOpenByKey, setInitMountsOpenByKey] = useState<Record<string, boolean>>({})
  const [selectedContainerName, setSelectedContainerName] = useState('')
  const [containerSelectOpen, setContainerSelectOpen] = useState(false)
  const [containerSectionOpen, setContainerSectionOpen] = useState<Record<ContainerSectionKey, boolean>>({
    env: false,
    ports: false,
    mounts: false,
    args: false,
  })
  const [logsContainerFilter, setLogsContainerFilter] = useState(LOGS_ALL_CONTAINERS)
  const [logsFilterOpen, setLogsFilterOpen] = useState(false)
  const [logsLevelFilter, setLogsLevelFilter] = useState<LogLevelFilter>('all')
  const [logsLevelFilterOpen, setLogsLevelFilterOpen] = useState(false)
  const [logsShowTimestamp, setLogsShowTimestamp] = useState(false)
  const [logsPaused, setLogsPaused] = useState(false)
  const [logsPausedSnapshot, setLogsPausedSnapshot] = useState<PodLogLine[] | null>(null)
  const [logsClearedCount, setLogsClearedCount] = useState(0)
  const [logsNearBottom, setLogsNearBottom] = useState(true)
  const [logsActionError, setLogsActionError] = useState<string | null>(null)
  const [initLogsModal, setInitLogsModal] = useState<{ key: string; containerName: string } | null>(null)
  const [initLogsDataByKey, setInitLogsDataByKey] = useState<Record<string, PodLogLine[]>>({})
  const [initLogsLoadingByKey, setInitLogsLoadingByKey] = useState<Record<string, boolean>>({})
  const [initLogsErrorByKey, setInitLogsErrorByKey] = useState<Record<string, string | null>>({})
  const [shellContainerName, setShellContainerName] = useState('')
  const [shellContainerOpen, setShellContainerOpen] = useState(false)
  const [shellSessions, setShellSessions] = useState<Record<string, ShellSession>>({})
  const containerSelectRef = useRef<HTMLDivElement | null>(null)
  const logsFilterRef = useRef<HTMLDivElement | null>(null)
  const logsLevelFilterRef = useRef<HTMLDivElement | null>(null)
  const shell = shellSessions[shellContainerName] ?? EMPTY_SHELL_SESSION
  const terminalUnavailable = shell.unavailable || isTerminalUnavailableError(shell.error ?? '')
  const shellInputDisabled = shell.running || shell.tabCompleting || terminalUnavailable

  const updateShell = (updates: Partial<ShellSession>) => {
    setShellSessions(current => ({
      ...current,
      [shellContainerName]: { ...(current[shellContainerName] ?? EMPTY_SHELL_SESSION), ...updates },
    }))
  }

  const updateShellFn = (updater: (session: ShellSession) => Partial<ShellSession>) => {
    setShellSessions(current => {
      const session = current[shellContainerName] ?? EMPTY_SHELL_SESSION
      return { ...current, [shellContainerName]: { ...session, ...updater(session) } }
    })
  }

  const shellContainerRef = useRef<HTMLDivElement | null>(null)
  const shellViewRef = useRef<HTMLDivElement | null>(null)
  const shellInputRef = useRef<HTMLInputElement | null>(null)
  const logsViewRef = useRef<HTMLDivElement | null>(null)
  const logsTopLoadLockRef = useRef(false)
  const logsOlderLoadAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)

  const detailTabLabel = POD_DETAIL_TABS.find(tab => tab.id === activeDetailsTab)?.label ?? 'Overview'
  const overviewStatus = podDetail?.status ?? selectedPod.status ?? '-'
  const overviewPhase = podDetail?.phase ?? parsePhase(selectedPod.status ?? '')
  const overviewAge = podDetail?.age ?? getAgeLabel(selectedPod, nowUnix)
  const overviewPodIP = podDetail?.podIP ?? '-'
  const overviewNode = podDetail?.node ?? '-'
  const overviewQOSClass = podDetail?.qosClass ?? '-'
  const overviewRestartCount = podDetail?.restartCount ?? 0
  const overviewControlledBy = podDetail?.controlledBy ?? selectedPod.controlledBy ?? '-'
  const overviewCreated = podDetail?.created ?? '-'
  const overviewUID = podDetail?.uid ?? '-'
  const overviewInitContainers = podDetail?.initContainers ?? []
  const overviewContainers = podDetail?.containers ?? []
  const overviewConditions = podDetail?.conditions ?? []
  const overviewEvents = podDetail?.events ?? []
  const overviewManifest = podDetail?.manifest ?? '-'
  const usageCPU = podDetail?.cpuUsageMilli ?? 0
  const usageMemory = podDetail?.memoryUsageBytes ?? 0
  const usageCPURequests = podDetail?.cpuRequestsMilli ?? 0
  const usageCPULimits = podDetail?.cpuLimitsMilli ?? 0
  const usageMemoryRequests = podDetail?.memoryRequestsBytes ?? 0
  const usageMemoryLimits = podDetail?.memoryLimitsBytes ?? 0
  const usageMetricsAvailable = Boolean(podDetail?.metricsAvailable)
  const metadataResourceVersion = podDetail?.resourceVersion ?? '-'
  const metadataLabels = Object.entries(podDetail?.labels ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataAnnotations = Object.entries(podDetail?.annotations ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataOwnerReferences = podDetail?.ownerReferences ?? []
  const metadataVolumes = podDetail?.volumes ?? []

  const initContainerKeys = useMemo(
    () => overviewInitContainers.map((container, index) => `init:${index}:${container.name}`),
    [overviewInitContainers],
  )

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    setInitExpandedByKey(current => syncToggleState(current, initContainerKeys, false))
    setInitEnvOpenByKey(current => syncToggleState(current, initContainerKeys, false))
    setInitMountsOpenByKey(current => syncToggleState(current, initContainerKeys, false))
  }, [initContainerKeys])

  useEffect(() => {
    if (overviewContainers.length === 0) {
      setSelectedContainerName('')
      return
    }
    const exists = overviewContainers.some(container => container.name === selectedContainerName)
    if (!exists) {
      setSelectedContainerName(overviewContainers[0].name)
    }
  }, [overviewContainers, selectedContainerName])

  useEffect(() => {
    if (overviewContainers.length === 0) {
      setShellContainerName('')
      return
    }
    const exists = overviewContainers.some(container => container.name === shellContainerName)
    if (!exists) {
      setShellContainerName(overviewContainers[0].name)
    }
  }, [overviewContainers, shellContainerName])

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (containerSelectRef.current && !containerSelectRef.current.contains(event.target as Node)) {
        setContainerSelectOpen(false)
      }
      if (logsFilterRef.current && !logsFilterRef.current.contains(event.target as Node)) {
        setLogsFilterOpen(false)
      }
      if (logsLevelFilterRef.current && !logsLevelFilterRef.current.contains(event.target as Node)) {
        setLogsLevelFilterOpen(false)
      }
      if (shellContainerRef.current && !shellContainerRef.current.contains(event.target as Node)) {
        setShellContainerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [])

  useEffect(() => {
    setInitExpandedByKey({})
    setInitEnvOpenByKey({})
    setInitMountsOpenByKey({})
    setLogsContainerFilter(LOGS_ALL_CONTAINERS)
    setLogsFilterOpen(false)
    setLogsLevelFilter('all')
    setLogsLevelFilterOpen(false)
    setLogsShowTimestamp(false)
    setLogsPaused(false)
    setLogsPausedSnapshot(null)
    setLogsClearedCount(0)
    setLogsNearBottom(true)
    setLogsActionError(null)
    setInitLogsModal(null)
    setInitLogsDataByKey({})
    setInitLogsLoadingByKey({})
    setInitLogsErrorByKey({})
    setShellContainerOpen(false)
    setShellSessions({})
  }, [selectedPod.namespace, selectedPod.name])

  const selectedContainer = useMemo(() => {
    if (overviewContainers.length === 0) {
      return null
    }
    return overviewContainers.find(container => container.name === selectedContainerName) ?? overviewContainers[0]
  }, [overviewContainers, selectedContainerName])

  const selectedContainerEvents = useMemo(() => {
    if (!selectedContainer) {
      return []
    }

    const needle = selectedContainer.name.toLowerCase()
    const scoped = overviewEvents.filter(event => (
      event.message.toLowerCase().includes(needle) || event.reason.toLowerCase().includes(needle)
    ))

    if (scoped.length > 0) {
      return scoped
    }
    return overviewEvents
  }, [selectedContainer, overviewEvents])

  const logsContainerOptions = useMemo(() => {
    const names = new Set<string>()
    for (const log of podLogs) {
      const name = log.container.trim()
      if (name) {
        names.add(name)
      }
    }
    if (names.size === 0) {
      for (const item of overviewContainers) {
        names.add(item.name)
      }
    }
    return [LOGS_ALL_CONTAINERS, ...Array.from(names).sort()]
  }, [podLogs, overviewContainers])

  const shellContainerOptions = useMemo(
    () => overviewContainers.map(container => container.name),
    [overviewContainers],
  )

  useEffect(() => {
    if (logsContainerFilter === LOGS_ALL_CONTAINERS) {
      return
    }
    if (!logsContainerOptions.includes(logsContainerFilter)) {
      setLogsContainerFilter(LOGS_ALL_CONTAINERS)
    }
  }, [logsContainerOptions, logsContainerFilter])

  const effectiveLogs = logsPaused ? (logsPausedSnapshot ?? podLogs) : podLogs

  const logsAfterClear = useMemo(() => {
    if (logsClearedCount <= 0) {
      return effectiveLogs
    }
    if (logsClearedCount >= effectiveLogs.length) {
      return []
    }
    return effectiveLogs.slice(logsClearedCount)
  }, [effectiveLogs, logsClearedCount])

  const visibleLogs = useMemo(() => {
    const byContainer = logsContainerFilter === LOGS_ALL_CONTAINERS
      ? logsAfterClear
      : logsAfterClear.filter(item => item.container === logsContainerFilter)

    return byContainer.filter(item => matchesLogLevel(item.message, logsLevelFilter))
  }, [logsAfterClear, logsContainerFilter, logsLevelFilter])

  const scrollLogsToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = logsViewRef.current
    if (!el) {
      return
    }
    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    })
  }

  const handleLogsScroll = () => {
    const el = logsViewRef.current
    if (!el) {
      return
    }

    if (
      el.scrollTop <= 20
      && !logsTopLoadLockRef.current
      && !podLogsLoading
      && !podLogsLoadingOlder
    ) {
      logsOlderLoadAnchorRef.current = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
      }
      logsTopLoadLockRef.current = true
      onLoadOlderLogs()
    }

    if (el.scrollTop > 48) {
      logsTopLoadLockRef.current = false
    }

    const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= 28
    setLogsNearBottom(nearBottom)
  }

  useEffect(() => {
    if (activeDetailsTab !== 'logs') {
      return
    }
    setLogsNearBottom(true)
    logsTopLoadLockRef.current = false
    logsOlderLoadAnchorRef.current = null
    window.requestAnimationFrame(() => scrollLogsToBottom())
  }, [activeDetailsTab, selectedPod.namespace, selectedPod.name])

  useEffect(() => {
    if (activeDetailsTab !== 'logs' || podLogsLoadingOlder) {
      return
    }
    const anchor = logsOlderLoadAnchorRef.current
    if (!anchor) {
      return
    }
    const el = logsViewRef.current
    if (!el) {
      logsOlderLoadAnchorRef.current = null
      return
    }

    window.requestAnimationFrame(() => {
      const heightDiff = el.scrollHeight - anchor.scrollHeight
      el.scrollTop = Math.max(0, anchor.scrollTop + heightDiff)
      logsOlderLoadAnchorRef.current = null
      if (el.scrollTop > 48) {
        logsTopLoadLockRef.current = false
      }
    })
  }, [activeDetailsTab, podLogsLoadingOlder, visibleLogs.length])

  useEffect(() => {
    if (activeDetailsTab !== 'logs' || !logsNearBottom) {
      return
    }
    window.requestAnimationFrame(() => scrollLogsToBottom())
  }, [activeDetailsTab, logsNearBottom, visibleLogs.length])

  useEffect(() => {
    if (activeDetailsTab !== 'shell') {
      return
    }
    window.requestAnimationFrame(() => {
      const el = shellViewRef.current
      if (!el) {
        return
      }
      el.scrollTop = el.scrollHeight
    })
  }, [activeDetailsTab, shell.entries.length, shell.running])

  useEffect(() => {
    if (activeDetailsTab === 'shell') {
      window.requestAnimationFrame(() => shellInputRef.current?.focus())
      if (!shell.user && shellContainerName) {
        const containerForWhoami = shellContainerName
        void ExecPodCommand(
          clusterFilename,
          selectedPod.namespace,
          selectedPod.name,
          containerForWhoami,
          'whoami',
        ).then((response: unknown) => {
          const result = toPodExecResult(response)
          const user = result.stdout.trim()
          const combinedMessage = `${result.stderr}\n${result.stdout}`.trim()
          const unavailableFromResult = isTerminalUnavailableError(combinedMessage)
            || ((result.exitCode === 126 || result.exitCode === 127) && combinedMessage.length > 0)

          setShellSessions(current => {
            const session = current[containerForWhoami] ?? EMPTY_SHELL_SESSION
            return {
              ...current,
              [containerForWhoami]: {
                ...session,
                user: user || session.user,
                error: unavailableFromResult
                  ? (combinedMessage || 'Terminal is unavailable for this container.')
                  : session.error,
                unavailable: session.unavailable || unavailableFromResult,
              },
            }
          })
        }).catch((errorValue: unknown) => {
          const message = errorValue instanceof Error ? errorValue.message : String(errorValue)
          setShellSessions(current => ({
            ...current,
            [containerForWhoami]: {
              ...(current[containerForWhoami] ?? EMPTY_SHELL_SESSION),
              error: message,
              unavailable: isTerminalUnavailableError(message),
            },
          }))
        })
      }
    }
  }, [activeDetailsTab, shell.user, shellContainerName, clusterFilename, selectedPod.namespace, selectedPod.name])

  const fetchInitContainerLogs = (key: string, containerName: string) => {
    setInitLogsLoadingByKey(current => ({ ...current, [key]: true }))
    setInitLogsErrorByKey(current => ({ ...current, [key]: null }))

    void GetPodLogs(clusterFilename, selectedPod.namespace, selectedPod.name, containerName).then(response => {
      setInitLogsDataByKey(current => ({ ...current, [key]: toPodLogLines(response) }))
    }).catch((errorValue: unknown) => {
      setInitLogsErrorByKey(current => ({
        ...current,
        [key]: errorValue instanceof Error ? errorValue.message : String(errorValue),
      }))
    }).finally(() => {
      setInitLogsLoadingByKey(current => ({ ...current, [key]: false }))
    })
  }

  const openInitLogsModal = (key: string, containerName: string) => {
    setInitLogsModal({ key, containerName })
    if (!initLogsDataByKey[key] && !initLogsLoadingByKey[key]) {
      fetchInitContainerLogs(key, containerName)
    }
  }

  const toggleMetadataSection = (section: MetadataSectionKey) => {
    setMetadataOpenSections(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const toggleInitSection = (key: string, section: InitSectionKey) => {
    if (section === 'env') {
      setInitEnvOpenByKey(current => ({ ...current, [key]: !current[key] }))
      return
    }
    setInitMountsOpenByKey(current => ({ ...current, [key]: !current[key] }))
  }

  const toggleContainerSection = (section: ContainerSectionKey) => {
    setContainerSectionOpen(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const renderSummaryContainersTable = (
    containers: PodDetailContainer[],
    emptyText: string,
  ) => {
    return (
      <div className="pods-detail-table-wrap">
        <table className="pods-detail-table pods-container-summary-table">
          <colgroup>
            <col style={{ width: '240px' }} />
            <col style={{ width: '360px' }} />
            <col style={{ width: '210px' }} />
            <col style={{ width: '170px' }} />
            <col style={{ width: '120px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Image</th>
              <th>State</th>
              <th>Ready</th>
              <th>Restarts</th>
            </tr>
          </thead>
          <tbody>
            {containers.length === 0 ? (
              <tr>
                <td colSpan={5} className="pods-detail-empty">{emptyText}</td>
              </tr>
            ) : (
              containers.map(container => (
                <tr key={container.name}>
                  <td className="pods-detail-value-cell">{container.name}</td>
                  <td className="pods-detail-value-cell">{container.image}</td>
                  <td>
                    <span className={`pods-tone-pill tone-${valueToneClass(container.state)}`}>
                      {container.state}
                    </span>
                  </td>
                  <td>
                    <span className={`pods-tone-pill tone-${valueToneClass(container.ready ? 'true' : 'false')}`}>
                      {container.ready ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="pods-detail-value-cell">{container.restarts}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const renderInitContainerAccordion = () => {
    if (overviewInitContainers.length === 0) {
      return <div className="pods-container-empty">No init containers</div>
    }

    return (
      <div className="pods-container-accordion">
        {overviewInitContainers.map((container, index) => {
          const key = initContainerKeys[index]
          const isExpanded = initExpandedByKey[key] ?? false
          const envOpen = initEnvOpenByKey[key] ?? false
          const mountsOpen = initMountsOpenByKey[key] ?? false

          return (
            <article key={key} className="pods-container-item">
              <div className="pods-container-item-header">
                <button
                  type="button"
                  className={`pods-container-item-toggle ${isExpanded ? 'is-open' : ''}`}
                  onClick={() => setInitExpandedByKey(current => ({ ...current, [key]: !isExpanded }))}
                >
                  <span className="pods-container-item-left">
                    <span className="pods-container-chevron">▾</span>
                    <span className="pods-container-item-name">{container.name}</span>
                  </span>
                </button>
                <div className="pods-container-item-header-actions">
                  <span className={`pods-tone-pill tone-${valueToneClass(container.state)}`}>{container.state}</span>
                  <button
                    type="button"
                    className="pods-init-logs-open-btn"
                    onClick={() => openInitLogsModal(key, container.name)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M8 6h13" />
                      <path d="M8 12h13" />
                      <path d="M8 18h13" />
                      <path d="M3 6h.01" />
                      <path d="M3 12h.01" />
                      <path d="M3 18h.01" />
                    </svg>
                    <span>Logs</span>
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="pods-container-item-body">
                  <div className="pods-container-kv-grid">
                    <div className="pods-container-kv-card">
                      <span>Status</span>
                      <strong>
                        <span className={`pods-tone-pill tone-${valueToneClass(container.state)}`}>{container.state}</span>
                      </strong>
                    </div>
                    <div className="pods-container-kv-card">
                      <span>Image</span>
                      <strong>{container.image || '-'}</strong>
                    </div>
                    <div className="pods-container-kv-card is-compact">
                      <span>Image Pull Policy</span>
                      <strong>{container.imagePullPolicy || '-'}</strong>
                    </div>
                    <div className="pods-container-kv-card is-compact">
                      <span>Ready</span>
                      <strong>
                        <span className={`pods-tone-pill tone-${valueToneClass(container.ready ? 'true' : 'false')}`}>
                          {container.ready ? 'Yes' : 'No'}
                        </span>
                      </strong>
                    </div>
                    <div className="pods-container-kv-card is-full-row">
                      <span>Container ID</span>
                      <code>{container.containerId || '-'}</code>
                    </div>
                  </div>

                  <div className="pods-container-command-section">
                    <span>Command</span>
                    <code className="pods-command-code is-large">{formatCommandDisplay(container.command)}</code>
                  </div>

                  <div className="pods-container-subsection">
                    <button
                      type="button"
                      className={`pods-container-subtoggle ${envOpen ? 'is-open' : ''}`}
                      onClick={() => toggleInitSection(key, 'env')}
                    >
                      <span>
                        <span className="pods-container-chevron">▾</span>
                        Environment Variables
                      </span>
                      <span>{container.env.length}</span>
                    </button>
                    {envOpen && (
                      <div className="pods-container-subcontent">
                        {container.env.length === 0 ? (
                          <p className="pods-detail-empty">No environment variables</p>
                        ) : (
                          <div className="pods-container-list-grid">
                            {container.env.map(item => (
                              <div key={`${item.name}-${item.value}`} className="pods-container-list-item">
                                <span className="pods-container-list-key">{item.name}</span>
                                <span>{item.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pods-container-subsection">
                    <button
                      type="button"
                      className={`pods-container-subtoggle ${mountsOpen ? 'is-open' : ''}`}
                      onClick={() => toggleInitSection(key, 'mounts')}
                    >
                      <span>
                        <span className="pods-container-chevron">▾</span>
                        Mounts
                      </span>
                      <span>{container.mounts.length}</span>
                    </button>
                    {mountsOpen && (
                      <div className="pods-container-subcontent">
                        {container.mounts.length === 0 ? (
                          <p className="pods-detail-empty">No mounts</p>
                        ) : (
                          <div className="pods-container-list-grid">
                            {container.mounts.map(mount => (
                              <div key={`${mount.name}-${mount.mountPath}`} className="pods-container-list-item">
                                <span className="pods-container-list-key">{mount.name}</span>
                                <span>{mount.mountPath}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pods-container-resource-grid">
                    <div className="pods-container-resource-card">
                      <span>Requests</span>
                      <p>CPU: {container.requests.cpu || '-'}</p>
                      <p>Memory: {container.requests.memory || '-'}</p>
                    </div>
                    <div className="pods-container-resource-card">
                      <span>Limits</span>
                      <p>CPU: {container.limits.cpu || '-'}</p>
                      <p>Memory: {container.limits.memory || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    )
  }

  const renderContainersTab = () => {
    if (!selectedContainer) {
      return <div className="pods-container-empty">No containers</div>
    }

    return (
      <div className="pods-container-tab-shell">
        <div className="pods-container-toolbar">
          <label>Container</label>
          <div className={`pods-container-select-wrap ${containerSelectOpen ? 'open' : ''}`} ref={containerSelectRef}>
            <button
              type="button"
              className={`pods-container-select-trigger ${containerSelectOpen ? 'open' : ''}`}
              onClick={() => setContainerSelectOpen(current => !current)}
              aria-haspopup="listbox"
              aria-expanded={containerSelectOpen}
            >
              <span className="pods-container-select-value">{selectedContainer.name}</span>
              <svg
                className="pods-container-select-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {containerSelectOpen && (
              <div className="pods-container-select-dropdown" role="listbox" aria-label="Containers">
                {overviewContainers.map(container => (
                  <button
                    key={container.name}
                    type="button"
                    role="option"
                    className={`pods-container-select-option ${selectedContainer.name === container.name ? 'selected' : ''}`}
                    aria-selected={selectedContainer.name === container.name}
                    onClick={() => {
                      setSelectedContainerName(container.name)
                      setContainerSelectOpen(false)
                    }}
                  >
                    {container.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pods-container-kv-grid">
          <div className="pods-container-kv-card">
            <span>Status</span>
            <strong>
              <span className={`pods-tone-pill tone-${valueToneClass(selectedContainer.state)}`}>{selectedContainer.state}</span>
            </strong>
          </div>
          <div className="pods-container-kv-card">
            <span>Image</span>
            <strong>{selectedContainer.image || '-'}</strong>
          </div>
          <div className="pods-container-kv-card is-compact">
            <span>Image Pull Policy</span>
            <strong>{selectedContainer.imagePullPolicy || '-'}</strong>
          </div>
          <div className="pods-container-kv-card is-compact">
            <span>Ready</span>
            <strong>
              <span className={`pods-tone-pill tone-${valueToneClass(selectedContainer.ready ? 'true' : 'false')}`}>
                {selectedContainer.ready ? 'Yes' : 'No'}
              </span>
            </strong>
          </div>
          <div className="pods-container-kv-card is-full-row">
            <span>Container ID</span>
            <code>{selectedContainer.containerId || '-'}</code>
          </div>
        </div>

        <div className="pods-container-command-section">
          <span>Command</span>
          <code className="pods-command-code is-large">{formatCommandDisplay(selectedContainer.command)}</code>
        </div>

        <div className="pods-container-subsection">
          <button
            type="button"
            className={`pods-container-subtoggle ${containerSectionOpen.env ? 'is-open' : ''}`}
            onClick={() => toggleContainerSection('env')}
          >
            <span>
              <span className="pods-container-chevron">▾</span>
              ENV VAR
            </span>
            <span>{selectedContainer.env.length}</span>
          </button>
          {containerSectionOpen.env && (
            <div className="pods-container-subcontent">
              {selectedContainer.env.length === 0 ? (
                <p className="pods-detail-empty">No environment variables</p>
              ) : (
                <div className="pods-container-list-grid">
                  {selectedContainer.env.map(item => (
                    <div key={`${item.name}-${item.value}`} className="pods-container-list-item">
                      <span className="pods-container-list-key">{item.name}</span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pods-container-subsection">
          <button
            type="button"
            className={`pods-container-subtoggle ${containerSectionOpen.ports ? 'is-open' : ''}`}
            onClick={() => toggleContainerSection('ports')}
          >
            <span>
              <span className="pods-container-chevron">▾</span>
              PORTS
            </span>
            <span>{selectedContainer.ports.length}</span>
          </button>
          {containerSectionOpen.ports && (
            <div className="pods-container-subcontent">
              {selectedContainer.ports.length === 0 ? (
                <p className="pods-detail-empty">No ports</p>
              ) : (
                <div className="pods-container-list-grid">
                  {selectedContainer.ports.map(port => (
                    <div key={`${port.name}-${port.containerPort}-${port.protocol}`} className="pods-container-list-item">
                      <span className="pods-container-list-key">{port.name}</span>
                      <span>{port.containerPort}/{port.protocol}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pods-container-subsection">
          <button
            type="button"
            className={`pods-container-subtoggle ${containerSectionOpen.mounts ? 'is-open' : ''}`}
            onClick={() => toggleContainerSection('mounts')}
          >
            <span>
              <span className="pods-container-chevron">▾</span>
              MOUNTS
            </span>
            <span>{selectedContainer.mounts.length}</span>
          </button>
          {containerSectionOpen.mounts && (
            <div className="pods-container-subcontent">
              {selectedContainer.mounts.length === 0 ? (
                <p className="pods-detail-empty">No mounts</p>
              ) : (
                <div className="pods-container-list-grid">
                  {selectedContainer.mounts.map(mount => (
                    <div key={`${mount.name}-${mount.mountPath}-${mount.subPath}`} className="pods-container-list-item">
                      <span className="pods-container-list-key">{mount.name}</span>
                      <span>{mount.mountPath} {mount.readOnly ? '(ro)' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pods-container-subsection">
          <button
            type="button"
            className={`pods-container-subtoggle ${containerSectionOpen.args ? 'is-open' : ''}`}
            onClick={() => toggleContainerSection('args')}
          >
            <span>
              <span className="pods-container-chevron">▾</span>
              ARGS
            </span>
            <span>{selectedContainer.args.length}</span>
          </button>
          {containerSectionOpen.args && (
            <div className="pods-container-subcontent">
              {selectedContainer.args.length === 0 ? (
                <p className="pods-detail-empty">No args</p>
              ) : (
                <div className="pods-container-list-grid">
                  {selectedContainer.args.map((arg, index) => (
                    <div key={`${arg}-${index}`} className="pods-container-list-item">
                      <span className="pods-container-list-key">[{index}]</span>
                      <span>{arg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pods-container-resource-grid">
          <div className="pods-container-resource-card">
            <span>Requests</span>
            <p>CPU: {selectedContainer.requests.cpu || '-'}</p>
            <p>Memory: {selectedContainer.requests.memory || '-'}</p>
          </div>
          <div className="pods-container-resource-card">
            <span>Limits</span>
            <p>CPU: {selectedContainer.limits.cpu || '-'}</p>
            <p>Memory: {selectedContainer.limits.memory || '-'}</p>
          </div>
        </div>

        <section className="pods-detail-section">
          <h5>Events</h5>
          <div className="pods-detail-table-wrap">
            <table className="pods-detail-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Message</th>
                  <th>Count</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {selectedContainerEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="pods-detail-empty">No events</td>
                  </tr>
                ) : (
                  selectedContainerEvents.map((event, index) => (
                    <tr key={`${event.reason}-${event.message}-${index}`}>
                      <td>
                        <span className={`pods-tone-pill tone-${valueToneClass(event.type)}`}>{event.type}</span>
                      </td>
                      <td className="pods-detail-value-cell">{event.reason}</td>
                      <td className="pods-detail-value-cell">{event.message}</td>
                      <td className="pods-detail-value-cell">{event.count}</td>
                      <td className="pods-detail-value-cell">{event.age}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  const renderLogsTab = () => {
    const showContainerTag = logsContainerFilter === LOGS_ALL_CONTAINERS
    const plainLogs = logsLevelFilter !== 'all'
    const containerLabel = logsContainerFilter === LOGS_ALL_CONTAINERS ? 'All Containers' : logsContainerFilter
    const logLevelLabel = LOGS_LEVEL_OPTIONS.find(option => option.value === logsLevelFilter)?.label ?? 'All Logs'
    const visibleLogCount = visibleLogs.length

    const toggleLogsPause = () => {
      if (logsPaused) {
        setLogsPaused(false)
        setLogsPausedSnapshot(null)
        return
      }
      setLogsPausedSnapshot(podLogs)
      setLogsPaused(true)
    }

    const clearLogs = () => {
      setLogsClearedCount(podLogs.length)
    }

    const downloadLogs = () => {
      if (visibleLogs.length === 0) {
        return
      }

      const output = visibleLogs.map(line => {
        const parts: string[] = []
        if (logsShowTimestamp && line.createdAt !== '-') {
          parts.push(`[${line.createdAt}]`)
        }
        if (showContainerTag) {
          parts.push(`[${line.container}]`)
        }
        const prefix = parts.length > 0 ? `${parts.join(' ')} ` : ''
        return `${prefix}${line.message}`
      }).join('\n')

      const now = new Date().toISOString().replace(/[:.]/g, '-')
      const suggestedName = `${selectedPod.name}-logs-${now}.log`

      setLogsActionError(null)
      void SavePodLogsFile(suggestedName, output).then(() => {
        setLogsActionError(null)
      }).catch((errorValue: unknown) => {
        setLogsActionError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      })
    }

    return (
      <div className="pods-logs-shell">
        <div className="pods-logs-toolbar">
          <div className="pods-container-toolbar">
            <label>Container</label>
            <div className={`pods-container-select-wrap ${logsFilterOpen ? 'open' : ''}`} ref={logsFilterRef}>
              <button
                type="button"
                className={`pods-container-select-trigger ${logsFilterOpen ? 'open' : ''}`}
                onClick={() => {
                  setLogsFilterOpen(current => !current)
                  setLogsLevelFilterOpen(false)
                }}
                aria-haspopup="listbox"
                aria-expanded={logsFilterOpen}
              >
                <span className="pods-container-select-value">{containerLabel}</span>
                <svg
                  className="pods-container-select-chevron"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {logsFilterOpen && (
                <div className="pods-container-select-dropdown" role="listbox" aria-label="Log containers">
                  {logsContainerOptions.map(option => (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      className={`pods-container-select-option ${logsContainerFilter === option ? 'selected' : ''}`}
                      aria-selected={logsContainerFilter === option}
                      onClick={() => {
                        setLogsContainerFilter(option)
                        setLogsFilterOpen(false)
                      }}
                    >
                      {option === LOGS_ALL_CONTAINERS ? 'All Containers' : option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pods-container-toolbar">
            <label>Level</label>
            <div className={`pods-container-select-wrap ${logsLevelFilterOpen ? 'open' : ''}`} ref={logsLevelFilterRef}>
              <button
                type="button"
                className={`pods-container-select-trigger ${logsLevelFilterOpen ? 'open' : ''}`}
                onClick={() => {
                  setLogsLevelFilterOpen(current => !current)
                  setLogsFilterOpen(false)
                }}
                aria-haspopup="listbox"
                aria-expanded={logsLevelFilterOpen}
              >
                <span className="pods-container-select-value">{logLevelLabel}</span>
                <svg
                  className="pods-container-select-chevron"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {logsLevelFilterOpen && (
                <div className="pods-container-select-dropdown" role="listbox" aria-label="Log levels">
                  {LOGS_LEVEL_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      className={`pods-container-select-option ${logsLevelFilter === option.value ? 'selected' : ''}`}
                      aria-selected={logsLevelFilter === option.value}
                      onClick={() => {
                        setLogsLevelFilter(option.value)
                        setLogsLevelFilterOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="pods-logs-toggle">
            <input
              type="checkbox"
              checked={logsShowTimestamp}
              onChange={event => setLogsShowTimestamp(event.target.checked)}
            />
            <span>Show Created At</span>
          </label>

          <div className="pods-logs-actions">
            <span className="pods-logs-count" title="Visible log line count">
              {visibleLogCount} lines
            </span>
            <button type="button" className="pods-logs-btn" onClick={downloadLogs} disabled={visibleLogs.length === 0}>
              Download
            </button>
            <button type="button" className="pods-logs-btn" onClick={clearLogs}>
              Clear
            </button>
            <button type="button" className="pods-logs-btn" onClick={toggleLogsPause}>
              {logsPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>

        {(podLogsError || logsActionError) && (
          <div className="pods-detail-alert error">{podLogsError ?? logsActionError}</div>
        )}

        <div className="pods-logs-view-wrap">
          <div
            className="pods-logs-view"
            role="log"
            aria-live="polite"
            ref={logsViewRef}
            onScroll={handleLogsScroll}
          >
            {podLogsLoadingOlder && (
              <div className="pods-logs-top-loader">Loading older logs...</div>
            )}
            {podLogsLoading && podLogs.length === 0 ? (
              <div className="pods-detail-empty">Loading logs...</div>
            ) : visibleLogs.length === 0 ? (
              <div className="pods-detail-empty">No logs found</div>
            ) : (
              visibleLogs.map((line, index) => (
                <p
                  key={`${line.container}-${line.createdAtUnix}-${index}`}
                  className={`pods-log-line ${plainLogs ? 'tone-plain' : `tone-${detectLogTone(line.message)}`}`}
                >
                  {logsShowTimestamp && line.createdAt !== '-' && (
                    <span className={`pods-log-meta ${plainLogs ? 'plain' : ''}`}>[{line.createdAt}] </span>
                  )}
                  {showContainerTag && (
                    <span
                      className={`pods-log-meta pods-log-container-tag ${plainLogs ? 'plain' : ''}`}
                      style={plainLogs ? undefined : { color: getContainerTagColor(line.container) }}
                    >
                      [{line.container}]{' '}
                    </span>
                  )}
                  <span>{line.message}</span>
                </p>
              ))
            )}
          </div>

          {!logsNearBottom && visibleLogs.length > 0 && (
            <button
              type="button"
              className="pods-logs-jump-btn"
              onClick={() => {
                scrollLogsToBottom('smooth')
                setLogsNearBottom(true)
              }}
            >
              Go to latest
            </button>
          )}
        </div>
      </div>
    )
  }

  const runShellCommand = (commandOverride?: string) => {
    if (shellInputDisabled || !shellContainerName.trim()) {
      return
    }
    const command = (commandOverride ?? shell.command).trim()
    if (!command) {
      return
    }

    if (command.toLowerCase() === 'clear') {
      updateShell({ entries: [], command: '', error: terminalUnavailable ? shell.error : null })
      return
    }

    const containerForExec = shellContainerName
    const currentCwd = shell.cwd

    updateShellFn(s => ({
      history: [...s.history, command],
      historyIndex: -1,
      draft: '',
      running: true,
      error: null,
      command: '',
    }))

    const wrappedCommand = `export COLUMNS=200; ls() { command ls -C "$@"; }; cd ${currentCwd} && ${command}; __EXIT=$?; pwd; exit $__EXIT`

    void ExecPodCommand(
      clusterFilename,
      selectedPod.namespace,
      selectedPod.name,
      containerForExec,
      wrappedCommand,
    ).then((response: unknown) => {
      const result = toPodExecResult(response)
      let displayStdout = result.stdout
      let newCwd = currentCwd
      const combinedMessage = `${result.stderr}\n${result.stdout}`.trim()
      const unavailableFromResult = isTerminalUnavailableError(combinedMessage)
        || ((result.exitCode === 126 || result.exitCode === 127) && combinedMessage.length > 0)

      if (result.stdout) {
        const lines = result.stdout.split('\n')
        while (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop()
        }
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1]
          if (lastLine.startsWith('/') && !lastLine.includes(' ')) {
            newCwd = lastLine
            lines.pop()
            displayStdout = lines.join('\n')
          }
        }
      }

      setShellSessions(current => {
        const session = current[containerForExec] ?? EMPTY_SHELL_SESSION
        return {
          ...current,
          [containerForExec]: {
            ...session,
            cwd: newCwd,
            error: unavailableFromResult
              ? (combinedMessage || 'Terminal is unavailable for this container.')
              : null,
            unavailable: session.unavailable || unavailableFromResult,
            entries: [
              ...session.entries,
              {
                id: Date.now() + session.entries.length,
                container: result.container || containerForExec,
                command,
                stdout: displayStdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
              },
            ],
          },
        }
      })
    }).catch((errorValue: unknown) => {
      const message = errorValue instanceof Error ? errorValue.message : String(errorValue)
      setShellSessions(current => {
        const session = current[containerForExec] ?? EMPTY_SHELL_SESSION
        return {
          ...current,
          [containerForExec]: {
            ...session,
            error: message,
            unavailable: isTerminalUnavailableError(message),
          },
        }
      })
    }).finally(() => {
      setShellSessions(current => {
        const session = current[containerForExec] ?? EMPTY_SHELL_SESSION
        return { ...current, [containerForExec]: { ...session, running: false } }
      })
      window.requestAnimationFrame(() => shellInputRef.current?.focus())
    })
  }

  const handleShellTabComplete = () => {
    if (shell.tabCompleting || shell.running || terminalUnavailable || !shellContainerName.trim()) return
    const input = shell.command
    if (!input.trim()) return

    const tokens = input.split(/\s+/)
    const partial = tokens[tokens.length - 1]
    if (!partial) return

    const isAbsolute = partial.startsWith('/')
    const currentCwd = shell.cwd
    const completionTarget = isAbsolute ? partial : (currentCwd === '/' ? `/${partial}` : `${currentCwd}/${partial}`)
    const containerForComplete = shellContainerName

    updateShell({ tabCompleting: true })

    void ExecPodCommand(
      clusterFilename,
      selectedPod.namespace,
      selectedPod.name,
      containerForComplete,
      `ls -1dp ${completionTarget}* 2>/dev/null`,
    ).then((response: unknown) => {
      const result = toPodExecResult(response)
      const raw = result.stdout.trim()
      if (!raw) return

      const matches = raw.split('\n').filter(Boolean)
      if (matches.length === 0) return

      const toToken = (fullPath: string) => {
        if (isAbsolute) return fullPath
        const prefix = currentCwd === '/' ? '/' : `${currentCwd}/`
        return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
      }

      if (matches.length === 1) {
        const completed = toToken(matches[0])
        const cmdPrefix = tokens.slice(0, -1).join(' ')
        const newCommand = cmdPrefix ? `${cmdPrefix} ${completed}` : completed
        setShellSessions(current => {
          const session = current[containerForComplete] ?? EMPTY_SHELL_SESSION
          return { ...current, [containerForComplete]: { ...session, command: newCommand } }
        })
      } else {
        const completedTokens = matches.map(toToken)
        const commonPrefix = completedTokens.reduce((acc, val) => {
          let i = 0
          while (i < acc.length && i < val.length && acc[i] === val[i]) i++
          return acc.slice(0, i)
        })

        if (commonPrefix.length > partial.length) {
          const cmdPrefix = tokens.slice(0, -1).join(' ')
          const newCommand = cmdPrefix ? `${cmdPrefix} ${commonPrefix}` : commonPrefix
          setShellSessions(current => {
            const session = current[containerForComplete] ?? EMPTY_SHELL_SESSION
            return { ...current, [containerForComplete]: { ...session, command: newCommand } }
          })
        } else {
          setShellSessions(current => {
            const session = current[containerForComplete] ?? EMPTY_SHELL_SESSION
            return {
              ...current,
              [containerForComplete]: {
                ...session,
                entries: [
                  ...session.entries,
                  {
                    id: Date.now() + session.entries.length,
                    container: containerForComplete,
                    command: input,
                    stdout: completedTokens.join('  '),
                    stderr: '',
                    exitCode: 0,
                  },
                ],
              },
            }
          })
        }
      }
    }).catch(() => {
      // silently ignore tab completion errors
    }).finally(() => {
      setShellSessions(current => {
        const session = current[containerForComplete] ?? EMPTY_SHELL_SESSION
        return { ...current, [containerForComplete]: { ...session, tabCompleting: false } }
      })
      window.requestAnimationFrame(() => shellInputRef.current?.focus())
    })
  }

  const handleShellKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      handleShellTabComplete()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runShellCommand()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (shell.history.length === 0) return
      if (shell.historyIndex === -1) {
        updateShell({ draft: shell.command, historyIndex: shell.history.length - 1, command: shell.history[shell.history.length - 1] })
      } else if (shell.historyIndex > 0) {
        const newIndex = shell.historyIndex - 1
        updateShell({ historyIndex: newIndex, command: shell.history[newIndex] })
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (shell.historyIndex === -1) return
      if (shell.historyIndex < shell.history.length - 1) {
        const newIndex = shell.historyIndex + 1
        updateShell({ historyIndex: newIndex, command: shell.history[newIndex] })
      } else {
        updateShell({ historyIndex: -1, command: shell.draft })
      }
      return
    }
    if ((event.key === 'l' && event.ctrlKey) || (event.key === 'k' && event.metaKey)) {
      event.preventDefault()
      updateShell({ entries: [], error: null })
      return
    }
  }

  const renderShellTab = () => {
    if (shellContainerOptions.length === 0) {
      return <div className="pods-container-empty">No running containers available for shell</div>
    }

    return (
      <div className="pods-shell-tab">
        <div className="pods-shell-terminal">
          <div className="pods-shell-header">
            <div className="pods-shell-header-left">
              <div className={`pods-container-select-wrap ${shellContainerOpen ? 'open' : ''}`} ref={shellContainerRef}>
                <button
                  type="button"
                  className={`pods-container-select-trigger ${shellContainerOpen ? 'open' : ''}`}
                  onClick={() => setShellContainerOpen(current => !current)}
                  aria-haspopup="listbox"
                  aria-expanded={shellContainerOpen}
                >
                  <span className="pods-container-select-value">{shellContainerName}</span>
                  <svg
                    className="pods-container-select-chevron"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {shellContainerOpen && (
                  <div className="pods-container-select-dropdown" role="listbox" aria-label="Shell containers">
                    {shellContainerOptions.map(option => (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        className={`pods-container-select-option ${shellContainerName === option ? 'selected' : ''}`}
                        aria-selected={shellContainerName === option}
                        onClick={() => {
                          setShellContainerName(option)
                          setShellContainerOpen(false)
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="pods-shell-header-right">
              {terminalUnavailable && (
                <span className="pods-shell-unavailable-info">
                  {shell.error || 'Terminal unavailable'}
                </span>
              )}
            </div>
          </div>

          <div
            className="pods-shell-body"
            ref={shellViewRef}
            onClick={() => {
              if (shellInputDisabled) return
              const selection = window.getSelection()
              if (selection && selection.toString().length > 0) return
              shellInputRef.current?.focus()
            }}
          >
            {shell.error && !terminalUnavailable && (
              <div className="pods-shell-error-line">{shell.error}</div>
            )}
            {shell.entries.map(entry => {
              const combinedOutput = `${entry.stderr}\n${entry.stdout}`.trim()
              const hasError = entry.exitCode !== 0 || isTerminalUnavailableError(combinedOutput)
              return (
                <div key={entry.id} className="pods-shell-block">
                  {!hasError && (
                    <div className="pods-shell-prompt-line">
                      <span className="pods-shell-prompt-container">{shell.user || 'user'}@{selectedPod.name}</span>
                      <span className="pods-shell-prompt-sep">:</span>
                      <span className="pods-shell-prompt-cwd">{shell.cwd}</span>
                      <span className="pods-shell-prompt-dollar"> $</span>
                      <span className="pods-shell-prompt-cmd"> {entry.command}</span>
                    </div>
                  )}
                  {hasError ? (
                    <pre className="pods-shell-stderr">
                      {combinedOutput || `Command failed with exit code ${entry.exitCode}`}
                    </pre>
                  ) : (
                    <>
                      {entry.stdout && (
                        <pre className="pods-shell-stdout">{entry.stdout}</pre>
                      )}
                      {entry.stderr && (
                        <pre className="pods-shell-stderr">{entry.stderr}</pre>
                      )}
                    </>
                  )}
                  {entry.exitCode !== 0 && (
                    <span className="pods-shell-exit-code">exit {entry.exitCode}</span>
                  )}
                </div>
              )
            })}
            {shell.running && (
              <div className="pods-shell-running-line">
                <span className="pods-shell-cursor-blink" />
              </div>
            )}
            {!terminalUnavailable && (
              <div className={`pods-shell-input-line ${shellInputDisabled ? 'disabled' : ''}`}>
                <span className="pods-shell-prompt-container">{shell.user || 'user'}@{selectedPod.name}</span>
                <span className="pods-shell-prompt-sep">:</span>
                <span className="pods-shell-prompt-cwd">{shell.cwd}</span>
                <span className="pods-shell-prompt-dollar"> $</span>
                <input
                  ref={shellInputRef}
                  type="text"
                  className="pods-shell-inline-input"
                  value={shell.command}
                  onChange={event => {
                    if (shellInputDisabled) {
                      return
                    }
                    updateShell({ command: event.target.value, historyIndex: -1 })
                  }}
                  onKeyDown={handleShellKeyDown}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={shellInputDisabled}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderUsagesTab = () => {
    const cpuUsagePercentOfRequest = usageCPURequests > 0 ? toPercent(usageCPU, usageCPURequests) : 0
    const cpuUsagePercentOfLimit = usageCPULimits > 0 ? toPercent(usageCPU, usageCPULimits) : 0
    const memoryUsagePercentOfRequest = usageMemoryRequests > 0 ? toPercent(usageMemory, usageMemoryRequests) : 0
    const memoryUsagePercentOfLimit = usageMemoryLimits > 0 ? toPercent(usageMemory, usageMemoryLimits) : 0

    return (
      <div className="pods-usages-tab">
        {!usageMetricsAvailable && (
          <div className="pods-detail-alert">
            Metrics server data is unavailable for this pod. Requests and limits are still shown.
          </div>
        )}

        <div className="pods-usages-grid">
          <article className="pods-usage-card">
            <header>
              <h5>CPU</h5>
              <strong>{podDetail?.cpuUsage && podDetail.cpuUsage !== '-' ? podDetail.cpuUsage : formatCPUValue(usageCPU)}</strong>
            </header>
            <div className="pods-usage-kv">
              <span>Requests</span>
              <strong>{formatCPUValue(usageCPURequests)}</strong>
            </div>
            <div className="pods-usage-meter">
              <span>Usage / Requests</span>
              <div className="pods-usage-bar">
                <div className="pods-usage-bar-fill" style={{ width: `${cpuUsagePercentOfRequest}%` }} />
              </div>
              <small>{usageCPURequests > 0 ? `${cpuUsagePercentOfRequest.toFixed(1)}%` : 'N/A'}</small>
            </div>
            <div className="pods-usage-kv">
              <span>Limits</span>
              <strong>{formatCPUValue(usageCPULimits)}</strong>
            </div>
            <div className="pods-usage-meter">
              <span>Usage / Limits</span>
              <div className="pods-usage-bar">
                <div className="pods-usage-bar-fill warn" style={{ width: `${cpuUsagePercentOfLimit}%` }} />
              </div>
              <small>{usageCPULimits > 0 ? `${cpuUsagePercentOfLimit.toFixed(1)}%` : 'N/A'}</small>
            </div>
          </article>

          <article className="pods-usage-card">
            <header>
              <h5>Memory</h5>
              <strong>{podDetail?.memoryUsage && podDetail.memoryUsage !== '-' ? podDetail.memoryUsage : formatMemoryValue(usageMemory)}</strong>
            </header>
            <div className="pods-usage-kv">
              <span>Requests</span>
              <strong>{formatMemoryValue(usageMemoryRequests)}</strong>
            </div>
            <div className="pods-usage-meter">
              <span>Usage / Requests</span>
              <div className="pods-usage-bar">
                <div className="pods-usage-bar-fill" style={{ width: `${memoryUsagePercentOfRequest}%` }} />
              </div>
              <small>{usageMemoryRequests > 0 ? `${memoryUsagePercentOfRequest.toFixed(1)}%` : 'N/A'}</small>
            </div>
            <div className="pods-usage-kv">
              <span>Limits</span>
              <strong>{formatMemoryValue(usageMemoryLimits)}</strong>
            </div>
            <div className="pods-usage-meter">
              <span>Usage / Limits</span>
              <div className="pods-usage-bar">
                <div className="pods-usage-bar-fill warn" style={{ width: `${memoryUsagePercentOfLimit}%` }} />
              </div>
              <small>{usageMemoryLimits > 0 ? `${memoryUsagePercentOfLimit.toFixed(1)}%` : 'N/A'}</small>
            </div>
          </article>
        </div>
      </div>
    )
  }

  return (
    <section className={`pods-detail-card ${mode === 'modal' ? 'is-modal' : 'is-split'}`}>
      <header className="pods-detail-header">
        <div className="pods-detail-heading">
          <h4>{selectedPod.name}</h4>
          <p>{selectedPod.namespace}</p>
        </div>
        <div className="pods-detail-actions">
          {showMaximizeButton && (
            <button
              type="button"
              className="pods-detail-icon-btn"
              onClick={onToggleMaximize}
              title={detailsMaximized ? 'Restore panel' : 'Open in large view'}
              aria-label={detailsMaximized ? 'Restore panel' : 'Open in large view'}
            >
              {detailsMaximized ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="5" y2="5"></line><polyline points="5 3 5 5 3 5"></polyline><line x1="14" y1="2" x2="11" y2="5"></line><polyline points="11 3 11 5 13 5"></polyline><line x1="2" y1="14" x2="5" y2="11"></line><polyline points="3 11 5 11 5 13"></polyline><line x1="14" y1="14" x2="11" y2="11"></line><polyline points="11 13 11 11 13 11"></polyline></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="5" x2="2" y2="2"></line><polyline points="2 4 2 2 4 2"></polyline><line x1="11" y1="5" x2="14" y2="2"></line><polyline points="12 2 14 2 14 4"></polyline><line x1="5" y1="11" x2="2" y2="14"></line><polyline points="2 12 2 14 4 14"></polyline><line x1="11" y1="11" x2="14" y2="14"></line><polyline points="12 14 14 14 14 12"></polyline></svg>
              )}
            </button>
          )}
          <button
            type="button"
            className="pods-detail-icon-btn danger"
            onClick={onClose}
            title="Close panel"
            aria-label="Close panel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <nav className="pods-detail-tabs" aria-label="Pod details tabs">
        {POD_DETAIL_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`pods-detail-tab ${activeDetailsTab === tab.id ? 'active' : ''}`}
            onClick={() => onDetailsTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={`pods-detail-body ${activeDetailsTab === 'manifest' ? 'manifest-mode' : activeDetailsTab === 'logs' ? 'logs-mode' : ''}`}>
        {(!['overview', 'metadata', 'init-containers', 'containers', 'logs', 'shell', 'usages', 'manifest'].includes(activeDetailsTab)) ? (
          <>
            <h5>{detailTabLabel}</h5>
            <p>Coming soon...</p>
          </>
        ) : (podDetailError && activeDetailsTab !== 'logs') ? (
          <div className="pods-detail-alert error">{podDetailError}</div>
        ) : activeDetailsTab === 'metadata' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading pod metadata...</div>
            )}

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.labels ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('labels')}
                  aria-label={metadataOpenSections.labels ? 'Collapse labels' : 'Expand labels'}
                  aria-expanded={metadataOpenSections.labels}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <span>Labels</span>
                  </div>
                  <span className="pods-meta-count">{metadataLabels.length}</span>
                </button>
              </header>
              {!metadataOpenSections.labels ? null : metadataLabels.length === 0 ? (
                <p className="pods-meta-empty">No labels</p>
              ) : (
                <div className="pods-meta-list">
                  {metadataLabels.map(([key, value]) => (
                    <div key={key} className="pods-meta-item">
                      <span className="pods-meta-key">{key}:</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.annotations ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('annotations')}
                  aria-label={metadataOpenSections.annotations ? 'Collapse annotations' : 'Expand annotations'}
                  aria-expanded={metadataOpenSections.annotations}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <span>Annotations</span>
                  </div>
                  <span className="pods-meta-count">{metadataAnnotations.length}</span>
                </button>
              </header>
              {!metadataOpenSections.annotations ? null : metadataAnnotations.length === 0 ? (
                <p className="pods-meta-empty">No annotations</p>
              ) : (
                <div className="pods-meta-list">
                  {metadataAnnotations.map(([key, value]) => (
                    <div key={key} className="pods-meta-item">
                      <span className="pods-meta-key">{key}:</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <div className="pods-meta-header-static">
                  <div className="pods-meta-title">
                    <span>Owner References</span>
                  </div>
                  <span className="pods-meta-count">{metadataOwnerReferences.length}</span>
                </div>
              </header>
              {metadataOwnerReferences.length === 0 ? (
                <p className="pods-meta-empty">No owner references</p>
              ) : (
                <div className="pods-meta-list">
                  {metadataOwnerReferences.map((owner, index) => (
                    <div key={`${owner.kind}-${owner.name}-${index}`} className="pods-meta-item pods-meta-owner-item">
                      <span className="pods-meta-key pods-meta-owner-key">
                        {owner.kind}/{owner.name}
                      </span>
                      <span className="pods-meta-owner-uid">{owner.uid || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="pods-meta-grid-two">
              <section className="pods-meta-card">
                <header className="pods-meta-card-header">
                  <div className="pods-meta-header-static">
                    <div className="pods-meta-title">
                      <span>Resource Version</span>
                    </div>
                  </div>
                </header>
                <div className="pods-meta-value">{metadataResourceVersion}</div>
              </section>

              <section className="pods-meta-card">
                <header className="pods-meta-card-header">
                  <div className="pods-meta-header-static">
                    <div className="pods-meta-title">
                      <span>UID</span>
                    </div>
                  </div>
                </header>
                <div className="pods-meta-value">{overviewUID}</div>
              </section>
            </div>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.volumes ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('volumes')}
                  aria-label={metadataOpenSections.volumes ? 'Collapse pod volumes' : 'Expand pod volumes'}
                  aria-expanded={metadataOpenSections.volumes}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <span>Pod Volumes</span>
                  </div>
                  <span className="pods-meta-count">{metadataVolumes.length}</span>
                </button>
              </header>
              {metadataOpenSections.volumes ? (
                <div className="pods-detail-table-wrap">
                  <table className="pods-detail-table pods-volume-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metadataVolumes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="pods-detail-empty">No volumes</td>
                        </tr>
                      ) : (
                        metadataVolumes.map((volume, index) => (
                          <tr key={`${volume.name}-${index}`}>
                            <td className="pods-detail-value-cell">{volume.name || '-'}</td>
                            <td className="pods-detail-value-cell">{volume.type || '-'}</td>
                            <td className="pods-volume-details pods-detail-value-cell">{volume.details || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </>
        ) : activeDetailsTab === 'init-containers' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading init containers...</div>
            )}
            <section className="pods-detail-section">
              {renderInitContainerAccordion()}
            </section>
          </>
        ) : activeDetailsTab === 'containers' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading containers...</div>
            )}
            <section className="pods-detail-section">
              {renderContainersTab()}
            </section>
          </>
        ) : activeDetailsTab === 'logs' ? (
          <>
            <section className="pods-detail-section pods-detail-logs-section">
              {renderLogsTab()}
            </section>
          </>
        ) : activeDetailsTab === 'shell' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading shell context...</div>
            )}
            <section className="pods-detail-section pods-detail-shell-section">
              {renderShellTab()}
            </section>
          </>
        ) : activeDetailsTab === 'usages' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading usage metrics...</div>
            )}
            <section className="pods-detail-section pods-detail-usage-section">
              {renderUsagesTab()}
            </section>
          </>
        ) : activeDetailsTab === 'manifest' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading manifest...</div>
            )}
            <section className="pods-detail-section pods-detail-manifest-section">
              <YamlEditor
                title={`${selectedPod.name}.yaml`}
                value={overviewManifest}
                readOnly
                minHeight={0}
                className="pods-detail-manifest-editor"
              />
            </section>
          </>
        ) : (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading pod details...</div>
            )}

            {overviewControlledBy && overviewControlledBy !== '-' && (
              <div className="pods-detail-alert info">
                This Pod is managed by {overviewControlledBy}. Configuration edits are available on the controller detail.
              </div>
            )}

            <div className="pods-overview-grid">
              <div className="pods-overview-card">
                <span>Name</span>
                <strong>{selectedPod.name ?? '-'}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Namespace</span>
                <strong>{selectedPod.namespace ?? '-'}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Status</span>
                <strong>
                  <span className={`pods-status-pill ${parsePhase(overviewStatus).toLowerCase()}`}>{overviewStatus}</span>
                </strong>
              </div>
              <div className="pods-overview-card">
                <span>Phase</span>
                <strong>{overviewPhase}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Age</span>
                <strong>{overviewAge}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Pod IP</span>
                <strong>{overviewPodIP}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Node</span>
                <strong>{overviewNode}</strong>
              </div>
              <div className="pods-overview-card">
                <span>QOS Class</span>
                <strong>{overviewQOSClass}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Restart Count</span>
                <strong>{overviewRestartCount}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Controlled By</span>
                <strong>{overviewControlledBy}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Created</span>
                <strong>{overviewCreated}</strong>
              </div>
              <div className="pods-overview-card">
                <span>UID</span>
                <strong>{overviewUID}</strong>
              </div>
            </div>

            <section className="pods-detail-section">
              <h5>Init Containers</h5>
              {renderSummaryContainersTable(overviewInitContainers, 'No init containers')}
            </section>

            <section className="pods-detail-section">
              <h5>Containers</h5>
              {renderSummaryContainersTable(overviewContainers, 'No containers')}
            </section>

            <section className="pods-detail-section">
              <h5>Conditions</h5>
              <div className="pods-detail-table-wrap">
                <table className="pods-detail-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewConditions.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="pods-detail-empty">No conditions</td>
                      </tr>
                    ) : (
                      overviewConditions.map((condition, index) => (
                        <tr key={`${condition.type}-${condition.status}-${index}`}>
                          <td className="pods-detail-value-cell">{condition.type}</td>
                          <td>
                            <span className={`pods-tone-pill tone-${valueToneClass(condition.status)}`}>
                              {condition.status}
                            </span>
                          </td>
                          <td className="pods-detail-value-cell">{condition.message}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      {initLogsModal && (
        <div className="pods-init-logs-modal-overlay" onClick={() => setInitLogsModal(null)}>
          <div className="pods-init-logs-modal" onClick={event => event.stopPropagation()}>
            <div className="pods-init-logs-modal-header">
              <h5>{initLogsModal.containerName} Logs</h5>
              <button
                type="button"
                className="pods-detail-icon-btn"
                onClick={() => setInitLogsModal(null)}
                aria-label="Close init container logs"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="pods-init-logs-modal-body">
              {initLogsLoadingByKey[initLogsModal.key] ? (
                <div className="pods-detail-empty">Loading logs...</div>
              ) : initLogsErrorByKey[initLogsModal.key] ? (
                <div className="pods-detail-alert error">{initLogsErrorByKey[initLogsModal.key]}</div>
              ) : (initLogsDataByKey[initLogsModal.key]?.length ?? 0) === 0 ? (
                <div className="pods-detail-empty">No logs found</div>
              ) : (
                initLogsDataByKey[initLogsModal.key]!.map((line, lineIndex) => (
                  <p key={`${line.container}-${line.createdAtUnix}-${lineIndex}`} className={`pods-log-line tone-${detectLogTone(line.message)}`}>
                    {line.createdAt !== '-' && <span className="pods-log-meta">[{line.createdAt}] </span>}
                    <span>{line.message}</span>
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
