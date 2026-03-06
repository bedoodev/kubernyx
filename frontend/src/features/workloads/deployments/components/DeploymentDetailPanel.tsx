import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeploymentDetail, DeploymentLogLine, DeploymentResource } from '../../../../shared/types'
import {
  DeleteDeploymentResource,
  DeleteWorkloadResource,
  RestartWorkload,
  ScaleDeployment,
  ScaleWorkload,
  SetCronJobSuspendResource,
  TriggerCronJobResource,
  UpdateDeploymentManifest,
  UpdateWorkloadManifest,
} from '../../../../shared/api'
import { parsePhase } from '../../../../shared/utils/formatting'
import YamlEditor from '../../../../shared/components/YamlEditor'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind, workloadSingularLabel, supportsRestart } from '../../workloadKinds'
import {
  valueToneClass,
  formatCommandDisplay,
  tryFormatLongJSONValue,
  isLongMetadataValue,
  renderMetadataValue,
  detectLogTone,
  matchesLogLevel,
  formatMapAsInline,
} from '../../shared/detailHelpers'
import '../../pods/PodsTable.css'

export type DeploymentDetailsTabId = 'overview' | 'metadata' | 'containers' | 'scale' | 'logs' | 'yaml'

type MetadataSectionKey =
  | 'labels'
  | 'annotations'
  | 'selector'
  | 'nodeSelector'
  | 'strategy'
  | 'conditions'
  | 'tolerations'
  | 'nodeAffinities'
  | 'podAntiAffinities'

type ContainerSectionKey = 'env' | 'ports' | 'mounts' | 'args'
type LogsStatusFilter = 'all' | 'debug' | 'info' | 'warning' | 'error'

const DETAIL_TABS_BASE: Array<{ id: DeploymentDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'containers', label: 'Containers' },
  { id: 'logs', label: 'Logs' },
  { id: 'scale', label: 'Scale' },
  { id: 'yaml', label: 'YAML' },

]

const DAEMON_SET_DETAIL_TABS: Array<{ id: DeploymentDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'logs', label: 'Logs' },
  { id: 'yaml', label: 'YAML' },
]

const STATEFUL_SET_DETAIL_TABS: Array<{ id: DeploymentDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'logs', label: 'Logs' },
  { id: 'yaml', label: 'YAML' },
]

const JOB_DETAIL_TABS: Array<{ id: DeploymentDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'logs', label: 'Logs' },
  { id: 'yaml', label: 'Manifest' },
]

const CRONJOB_DETAIL_TABS: Array<{ id: DeploymentDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'yaml', label: 'Edit' },
]

const LOGS_ALL_PODS = '__all_pods__'
const LOGS_ALL_CONTAINERS = '__all_containers__'
const LOGS_STATUS_OPTIONS: Array<{ value: LogsStatusFilter; label: string }> = [
  { value: 'all', label: 'All Status' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

interface Props {
  clusterFilename: string
  workloadTab?: NonPodWorkloadTabId
  mode: 'split' | 'modal'
  activeDetailsTab: DeploymentDetailsTabId
  onDetailsTabChange: (tab: DeploymentDetailsTabId) => void
  selectedDeployment: DeploymentResource
  deploymentDetail: DeploymentDetail | null
  deploymentDetailLoading: boolean
  deploymentDetailError: string | null
  deploymentLogs: DeploymentLogLine[]
  deploymentLogsLoading: boolean
  deploymentLogsError: string | null
  detailsMaximized: boolean
  showMaximizeButton?: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

function matchesLogsStatus(message: string, filter: LogsStatusFilter): boolean {
  return matchesLogLevel(message, filter)
}

function formatStatusOption(option: LogsStatusFilter): string {
  return LOGS_STATUS_OPTIONS.find(item => item.value === option)?.label ?? 'All Status'
}

export default function DeploymentDetailPanel({
  clusterFilename,
  workloadTab = 'deployments',
  mode,
  activeDetailsTab,
  onDetailsTabChange,
  selectedDeployment,
  deploymentDetail,
  deploymentDetailLoading,
  deploymentDetailError,
  deploymentLogs,
  deploymentLogsLoading,
  deploymentLogsError,
  detailsMaximized,
  showMaximizeButton = true,
  onToggleMaximize,
  onClose,
}: Props) {
  const [metadataOpenSections, setMetadataOpenSections] = useState<Record<MetadataSectionKey, boolean>>({
    labels: false,
    annotations: false,
    selector: false,
    nodeSelector: false,
    strategy: false,
    conditions: false,
    tolerations: false,
    nodeAffinities: false,
    podAntiAffinities: false,
  })
  const [expandedMetadataValues, setExpandedMetadataValues] = useState<Record<string, boolean>>({})
  const [containerSelectOpen, setContainerSelectOpen] = useState(false)
  const [selectedContainerName, setSelectedContainerName] = useState('')
  const [containerSectionOpen, setContainerSectionOpen] = useState<Record<ContainerSectionKey, boolean>>({
    env: false,
    ports: false,
    mounts: false,
    args: false,
  })

  const [yamlValue, setYamlValue] = useState('-')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSuccess, setYamlSuccess] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [restartPending, setRestartPending] = useState(false)
  const [restartError, setRestartError] = useState<string | null>(null)
  const [restartSuccess, setRestartSuccess] = useState<string | null>(null)
  const [cronActionPending, setCronActionPending] = useState(false)
  const [cronActionError, setCronActionError] = useState<string | null>(null)
  const [cronActionInfo, setCronActionInfo] = useState<string | null>(null)

  const [scaleValue, setScaleValue] = useState(String(selectedDeployment.replicas ?? 0))
  const [scaleSaving, setScaleSaving] = useState(false)
  const [scaleError, setScaleError] = useState<string | null>(null)

  const [logsPodFilter, setLogsPodFilter] = useState(LOGS_ALL_PODS)
  const [logsContainerFilter, setLogsContainerFilter] = useState(LOGS_ALL_CONTAINERS)
  const [logsStatusFilter, setLogsStatusFilter] = useState<LogsStatusFilter>('all')
  const [logsPodFilterOpen, setLogsPodFilterOpen] = useState(false)
  const [logsContainerFilterOpen, setLogsContainerFilterOpen] = useState(false)
  const [logsStatusFilterOpen, setLogsStatusFilterOpen] = useState(false)
  const [logsSearchQuery, setLogsSearchQuery] = useState('')
  const [logsShowTimestamp, setLogsShowTimestamp] = useState(false)

  const containerSelectRef = useRef<HTMLDivElement | null>(null)
  const logsPodFilterRef = useRef<HTMLDivElement | null>(null)
  const logsContainerFilterRef = useRef<HTMLDivElement | null>(null)
  const logsStatusFilterRef = useRef<HTMLDivElement | null>(null)
  const logsSearchInputRef = useRef<HTMLInputElement | null>(null)

  const deploymentKey = `${workloadTab}:${selectedDeployment.namespace}/${selectedDeployment.name}`
  const workloadLabel = workloadSingularLabel(workloadTab)
  const isDaemonSet = workloadTab === 'daemon-sets'
  const isJob = workloadTab === 'jobs'
  const isCronJob = workloadTab === 'cronjobs'
  const isCronSuspended = deploymentDetail?.suspend ?? ((selectedDeployment.suspend ?? '').toLowerCase() === 'yes')
  const scaleSupported = Boolean(deploymentDetail?.scaleSupported ?? (workloadTab === 'deployments' || workloadTab === 'stateful-sets'))
  const detailTabs = useMemo(
    () => {
      let base = DETAIL_TABS_BASE
      if (workloadTab === 'daemon-sets') {
        base = DAEMON_SET_DETAIL_TABS
      } else if (workloadTab === 'stateful-sets') {
        base = STATEFUL_SET_DETAIL_TABS
      } else if (workloadTab === 'jobs') {
        base = JOB_DETAIL_TABS
      } else if (workloadTab === 'cronjobs') {
        base = CRONJOB_DETAIL_TABS
      }
      return base.filter(tab => scaleSupported || tab.id !== 'scale')
    },
    [workloadTab, scaleSupported],
  )

  useEffect(() => {
    const supportedTabIds = new Set(detailTabs.map(tab => tab.id))
    if (!supportedTabIds.has(activeDetailsTab)) {
      onDetailsTabChange('overview')
    }
  }, [activeDetailsTab, detailTabs, onDetailsTabChange])

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (containerSelectRef.current && !containerSelectRef.current.contains(event.target as Node)) {
        setContainerSelectOpen(false)
      }
      if (logsPodFilterRef.current && !logsPodFilterRef.current.contains(event.target as Node)) {
        setLogsPodFilterOpen(false)
      }
      if (logsContainerFilterRef.current && !logsContainerFilterRef.current.contains(event.target as Node)) {
        setLogsContainerFilterOpen(false)
      }
      if (logsStatusFilterRef.current && !logsStatusFilterRef.current.contains(event.target as Node)) {
        setLogsStatusFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [])

  useEffect(() => {
    setYamlDirty(false)
    setYamlError(null)
    setYamlSuccess(null)
    setYamlSaving(false)
    setDeletePending(false)
    setDeleteError(null)
    setCronActionPending(false)
    setCronActionError(null)
    setCronActionInfo(null)
    setScaleError(null)
    setScaleSaving(false)
    setLogsPodFilter(LOGS_ALL_PODS)
    setLogsContainerFilter(LOGS_ALL_CONTAINERS)
    setLogsStatusFilter('all')
    setLogsSearchQuery('')
    setLogsPodFilterOpen(false)
    setLogsContainerFilterOpen(false)
    setLogsStatusFilterOpen(false)
    setExpandedMetadataValues({})
  }, [deploymentKey])

  useEffect(() => {
    if (!yamlDirty) {
      setYamlValue(deploymentDetail?.manifest ?? '-')
    }
  }, [deploymentDetail?.manifest, yamlDirty])

  useEffect(() => {
    setScaleValue(String(deploymentDetail?.replicas ?? selectedDeployment.replicas ?? 0))
  }, [deploymentDetail?.replicas, selectedDeployment.replicas, deploymentKey])

  const containers = deploymentDetail?.containers ?? []
  useEffect(() => {
    if (containers.length === 0) {
      setSelectedContainerName('')
      return
    }
    const exists = containers.some(item => item.name === selectedContainerName)
    if (!exists) {
      setSelectedContainerName(containers[0].name)
    }
  }, [containers, selectedContainerName])

  const selectedContainer = useMemo(() => {
    if (containers.length === 0) {
      return null
    }
    return containers.find(item => item.name === selectedContainerName) ?? containers[0]
  }, [containers, selectedContainerName])

  const logPodOptions = useMemo(() => {
    const names = new Set<string>()
    for (const line of deploymentLogs) {
      if (line.podName.trim()) {
        names.add(line.podName)
      }
    }
    return [LOGS_ALL_PODS, ...Array.from(names).sort()]
  }, [deploymentLogs])

  useEffect(() => {
    if (logsPodFilter === LOGS_ALL_PODS) {
      return
    }
    if (!logPodOptions.includes(logsPodFilter)) {
      setLogsPodFilter(LOGS_ALL_PODS)
    }
  }, [logPodOptions, logsPodFilter])

  const filteredByPodLogs = useMemo(() => (
    logsPodFilter === LOGS_ALL_PODS
      ? deploymentLogs
      : deploymentLogs.filter(line => line.podName === logsPodFilter)
  ), [deploymentLogs, logsPodFilter])

  const logContainerOptions = useMemo(() => {
    const names = new Set<string>()
    for (const line of filteredByPodLogs) {
      if (line.container.trim()) {
        names.add(line.container)
      }
    }
    return [LOGS_ALL_CONTAINERS, ...Array.from(names).sort()]
  }, [filteredByPodLogs])

  useEffect(() => {
    if (logsContainerFilter === LOGS_ALL_CONTAINERS) {
      return
    }
    if (!logContainerOptions.includes(logsContainerFilter)) {
      setLogsContainerFilter(LOGS_ALL_CONTAINERS)
    }
  }, [logContainerOptions, logsContainerFilter])

  const visibleLogs = useMemo(() => {
    const byContainer = logsContainerFilter === LOGS_ALL_CONTAINERS
      ? filteredByPodLogs
      : filteredByPodLogs.filter(line => line.container === logsContainerFilter)
    const byStatus = byContainer.filter(line => matchesLogsStatus(line.message, logsStatusFilter))
    const needle = logsSearchQuery.trim().toLowerCase()
    if (!needle) {
      return byStatus
    }
    return byStatus.filter(line => (
      line.message.toLowerCase().includes(needle)
      || line.podName.toLowerCase().includes(needle)
      || line.container.toLowerCase().includes(needle)
      || line.createdAt.toLowerCase().includes(needle)
    ))
  }, [filteredByPodLogs, logsContainerFilter, logsStatusFilter, logsSearchQuery])

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && activeDetailsTab === 'logs') {
        event.preventDefault()
        logsSearchInputRef.current?.focus()
        logsSearchInputRef.current?.select()
      }
    }

    window.addEventListener('keydown', handleFindShortcut)
    return () => window.removeEventListener('keydown', handleFindShortcut)
  }, [activeDetailsTab])

  const metadataLabels = Object.entries(deploymentDetail?.labels ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataAnnotations = Object.entries(deploymentDetail?.annotations ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataSelector = Object.entries(deploymentDetail?.selector ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataNodeSelector = Object.entries(deploymentDetail?.nodeSelector ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataConditions = deploymentDetail?.conditions ?? []
  const metadataTolerations = deploymentDetail?.tolerations ?? []
  const metadataNodeAffinities = deploymentDetail?.nodeAffinities ?? []
  const metadataPodAntiAffinities = deploymentDetail?.podAntiAffinities ?? []

  const overviewStatus = deploymentDetail?.status ?? selectedDeployment.status ?? '-'
  const overviewAge = deploymentDetail?.age ?? selectedDeployment.age ?? '-'
  const overviewReplicas = deploymentDetail?.replicas ?? selectedDeployment.desired ?? selectedDeployment.replicas ?? 0
  const overviewCurrent = deploymentDetail?.current ?? selectedDeployment.current ?? 0
  const overviewReady = deploymentDetail?.ready ?? selectedDeployment.ready ?? 0
  const overviewUpdated = deploymentDetail?.updated ?? selectedDeployment.upToDate ?? 0
  const overviewAvailable = deploymentDetail?.available ?? selectedDeployment.available ?? 0
  const overviewUnavailable = deploymentDetail?.unavailable ?? 0
  const overviewCompletions = deploymentDetail?.completions ?? selectedDeployment.completions ?? '-'
  const overviewConditionsSummary = metadataConditions.map(condition => condition.type).join(', ') || selectedDeployment.conditions || '-'
  const overviewSchedule = deploymentDetail?.schedule ?? selectedDeployment.schedule ?? '-'
  const overviewSuspend = deploymentDetail?.suspend ?? ((selectedDeployment.suspend ?? '').toLowerCase() === 'yes')
  const overviewActive = deploymentDetail?.active ?? selectedDeployment.active ?? 0
  const overviewLastSchedule = deploymentDetail?.lastSchedule ?? selectedDeployment.last ?? '-'
  const overviewNextSchedule = deploymentDetail?.nextSchedule ?? selectedDeployment.next ?? '-'
  const overviewNodeSelector = deploymentDetail?.nodeSelector
  const overviewNodeSelectorText = (selectedDeployment.nodeSelector && selectedDeployment.nodeSelector !== '-')
    ? selectedDeployment.nodeSelector
    : formatMapAsInline(overviewNodeSelector, '-')
  const overviewCreated = deploymentDetail?.created ?? '-'
  const overviewUID = deploymentDetail?.uid ?? '-'
  const overviewRevisions = deploymentDetail?.revisions ?? []
  const overviewPods = deploymentDetail?.pods ?? []
  const overviewEvents = deploymentDetail?.events ?? []

  const toggleMetadataSection = (section: MetadataSectionKey) => {
    setMetadataOpenSections(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const toggleMetadataValueExpand = (key: string) => {
    setExpandedMetadataValues(current => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const toggleContainerSection = (section: ContainerSectionKey) => {
    setContainerSectionOpen(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const saveManifest = () => {
    if (!yamlDirty || yamlSaving) {
      return
    }
    setYamlSaving(true)
    setYamlError(null)
    setYamlSuccess(null)
    const operation = workloadTab === 'deployments'
      ? UpdateDeploymentManifest(
        clusterFilename,
        selectedDeployment.namespace,
        selectedDeployment.name,
        yamlValue,
      )
      : UpdateWorkloadManifest(
        clusterFilename,
        toWorkloadAPIKind(workloadTab),
        selectedDeployment.namespace,
        selectedDeployment.name,
        yamlValue,
      )
    void operation.then(() => {
      setYamlDirty(false)
      setYamlSuccess(`${workloadLabel} manifest saved.`)
    }).catch((errorValue: unknown) => {
      setYamlError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setYamlSaving(false)
    })
  }

  const applyScale = () => {
    if (!scaleSupported) {
      return
    }
    if (scaleSaving) {
      return
    }
    const replicas = Number(scaleValue)
    if (!Number.isInteger(replicas) || replicas < 0) {
      setScaleError('Replica count must be an integer >= 0')
      return
    }
    setScaleSaving(true)
    setScaleError(null)
    const operation = workloadTab === 'deployments'
      ? ScaleDeployment(
        clusterFilename,
        selectedDeployment.namespace,
        selectedDeployment.name,
        replicas,
      )
      : ScaleWorkload(
        clusterFilename,
        toWorkloadAPIKind(workloadTab),
        selectedDeployment.namespace,
        selectedDeployment.name,
        replicas,
      )
    void operation.catch((errorValue: unknown) => {
      setScaleError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setScaleSaving(false)
    })
  }

  const deleteWorkload = () => {
    if (deletePending) {
      return
    }
    const confirmed = window.confirm(`Delete ${workloadLabel} "${selectedDeployment.name}" in namespace "${selectedDeployment.namespace}"?`)
    if (!confirmed) {
      return
    }

    setDeletePending(true)
    setDeleteError(null)
    const operation = workloadTab === 'deployments'
      ? DeleteDeploymentResource(
        clusterFilename,
        selectedDeployment.namespace,
        selectedDeployment.name,
      )
      : DeleteWorkloadResource(
        clusterFilename,
        toWorkloadAPIKind(workloadTab),
        selectedDeployment.namespace,
        selectedDeployment.name,
      )

    void operation.then(() => {
      onClose()
    }).catch((errorValue: unknown) => {
      setDeleteError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setDeletePending(false)
    })
  }

  const restartWorkload = () => {
    if (restartPending) {
      return
    }
    setRestartPending(true)
    setRestartError(null)
    setRestartSuccess(null)
    void RestartWorkload(
      clusterFilename,
      toWorkloadAPIKind(workloadTab),
      selectedDeployment.namespace,
      selectedDeployment.name,
    ).then(() => {
      setRestartSuccess('Rollout restart initiated')
      setTimeout(() => setRestartSuccess(null), 3000)
    }).catch((errorValue: unknown) => {
      setRestartError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setRestartPending(false)
    })
  }

  const triggerCronJob = () => {
    if (!isCronJob || cronActionPending) {
      return
    }
    setCronActionPending(true)
    setCronActionError(null)
    setCronActionInfo(null)
    void TriggerCronJobResource(
      clusterFilename,
      selectedDeployment.namespace,
      selectedDeployment.name,
    ).then(() => {
      setCronActionInfo(`CronJob "${selectedDeployment.name}" triggered successfully.`)
    }).catch((errorValue: unknown) => {
      setCronActionError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setCronActionPending(false)
    })
  }

  const toggleCronJobSuspend = () => {
    if (!isCronJob || cronActionPending) {
      return
    }
    const nextSuspend = !isCronSuspended
    setCronActionPending(true)
    setCronActionError(null)
    setCronActionInfo(null)
    void SetCronJobSuspendResource(
      clusterFilename,
      selectedDeployment.namespace,
      selectedDeployment.name,
      nextSuspend,
    ).then(() => {
      setCronActionInfo(nextSuspend ? 'CronJob suspended.' : 'CronJob resumed.')
    }).catch((errorValue: unknown) => {
      setCronActionError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setCronActionPending(false)
    })
  }

  const renderMetadataKeyValueSection = (
    section: MetadataSectionKey,
    title: string,
    items: Array<[string, string]>,
  ) => (
    <section className="pods-meta-card">
      <header className="pods-meta-card-header">
        <button
          type="button"
          className={`pods-meta-header-btn ${metadataOpenSections[section] ? 'is-open' : ''}`}
          onClick={() => toggleMetadataSection(section)}
          aria-expanded={metadataOpenSections[section]}
        >
          <div className="pods-meta-title">
            <span className="pods-meta-chevron">▾</span>
            <span>{title}</span>
          </div>
          <span className="pods-meta-count">{items.length}</span>
        </button>
      </header>
      {!metadataOpenSections[section] ? null : items.length === 0 ? (
        <p className="pods-meta-empty">No {title.toLowerCase()}</p>
      ) : (
        <div className="pods-meta-list">
          {items.map(([key, value]) => {
            const prettyJson = tryFormatLongJSONValue(value)
            const safeValue = value.trim() ? value : '-'
            const displayValue = prettyJson ?? safeValue
            const isLong = isLongMetadataValue(displayValue)
            const expandKey = `${section}:${key}`
            const expanded = expandedMetadataValues[expandKey] ?? false
            const collapsed = isLong && !expanded
            return (
              <div key={`${key}-${value}`} className={`pods-meta-item ${prettyJson ? 'is-json' : ''}`}>
                <span className="pods-meta-key">{key}:</span>
                <div className={`pods-meta-value-block ${collapsed ? 'is-collapsed' : ''}`}>
                  {renderMetadataValue(value, { prettyJson, collapsed })}
                  {isLong && (
                    <button
                      type="button"
                      className="pods-meta-expand-btn"
                      onClick={() => toggleMetadataValueExpand(expandKey)}
                    >
                      {expanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  const renderMetadataListSection = (
    section: MetadataSectionKey,
    title: string,
    items: string[],
  ) => (
    <section className="pods-meta-card">
      <header className="pods-meta-card-header">
        <button
          type="button"
          className={`pods-meta-header-btn ${metadataOpenSections[section] ? 'is-open' : ''}`}
          onClick={() => toggleMetadataSection(section)}
          aria-expanded={metadataOpenSections[section]}
        >
          <div className="pods-meta-title">
            <span className="pods-meta-chevron">▾</span>
            <span>{title}</span>
          </div>
          <span className="pods-meta-count">{items.length}</span>
        </button>
      </header>
      {!metadataOpenSections[section] ? null : items.length === 0 ? (
        <p className="pods-meta-empty">No {title.toLowerCase()}</p>
      ) : (
        <div className="pods-meta-list">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="pods-meta-item">
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )

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
              <div className="pods-container-select-dropdown" role="listbox" aria-label={`${workloadLabel} containers`}>
                {containers.map(container => (
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
      </div>
    )
  }

  return (
    <section className={`pods-detail-card ${mode === 'modal' ? 'is-modal' : 'is-split'}`}>
      <header className="pods-detail-header">
        <div className="pods-detail-heading">
          <h4>{selectedDeployment.name}</h4>
          <p>{selectedDeployment.namespace}</p>
        </div>
        <div className="pods-detail-actions">
          {isCronJob && (
            <>
              <button
                type="button"
                className="pods-detail-header-action-btn"
                onClick={triggerCronJob}
                disabled={cronActionPending}
                title="Trigger CronJob now"
              >
                Trigger
              </button>
              <button
                type="button"
                className="pods-detail-header-action-btn"
                onClick={toggleCronJobSuspend}
                disabled={cronActionPending}
                title={isCronSuspended ? 'Resume CronJob' : 'Suspend CronJob'}
              >
                {isCronSuspended ? 'Resume' : 'Suspend'}
              </button>
            </>
          )}
          {supportsRestart(workloadTab) && (
            <button
              type="button"
              className="pods-detail-header-action-btn"
              onClick={restartWorkload}
              disabled={restartPending}
              title={`Restart ${workloadLabel}`}
            >
              {restartPending ? 'Restarting...' : 'Restart'}
            </button>
          )}
          <button
            type="button"
            className="pods-detail-icon-btn danger"
            onClick={deleteWorkload}
            title={`Delete ${workloadLabel}`}
            aria-label={`Delete ${workloadLabel}`}
            disabled={deletePending}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M6 6l1 14a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 6" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
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
            className="pods-detail-icon-btn"
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

      <nav className="pods-detail-tabs" aria-label={`${workloadLabel} details tabs`}>
        {detailTabs.map(tab => (
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

      <div className={`pods-detail-body ${activeDetailsTab === 'yaml' ? 'manifest-mode' : activeDetailsTab === 'logs' ? 'logs-mode' : ''}`}>
        {deleteError && (
          <div className="pods-detail-alert error">{deleteError}</div>
        )}
        {restartError && (
          <div className="pods-detail-alert error">{restartError}</div>
        )}
        {restartSuccess && (
          <div className="pods-detail-alert">{restartSuccess}</div>
        )}
        {cronActionError && (
          <div className="pods-detail-alert error">{cronActionError}</div>
        )}
        {cronActionInfo && (
          <div className="pods-detail-alert info">{cronActionInfo}</div>
        )}
        {(deploymentDetailError && activeDetailsTab !== 'logs') ? (
          <div className="pods-detail-alert error">{deploymentDetailError}</div>
        ) : activeDetailsTab === 'metadata' ? (
          <>
            {deploymentDetailLoading && !deploymentDetail && (
              <div className="pods-detail-alert">Loading {workloadLabel.toLowerCase()} metadata...</div>
            )}
            {renderMetadataKeyValueSection('labels', 'Labels', metadataLabels)}
            {renderMetadataKeyValueSection('annotations', 'Annotations', metadataAnnotations)}
            {renderMetadataKeyValueSection('selector', 'Selector', metadataSelector)}
            {renderMetadataKeyValueSection('nodeSelector', 'Node Selector', metadataNodeSelector)}
            {renderMetadataListSection('strategy', 'Strategy Type', [deploymentDetail?.strategyType ?? '-'])}
            {renderMetadataListSection(
              'conditions',
              'Conditions',
              metadataConditions.map(condition => `${condition.type}: ${condition.status} (${condition.message})`),
            )}
            {renderMetadataListSection('tolerations', 'Tolerations', metadataTolerations)}
            {renderMetadataListSection('nodeAffinities', 'Node Affinities', metadataNodeAffinities)}
            {renderMetadataListSection('podAntiAffinities', 'Pod Anti Affinities', metadataPodAntiAffinities)}
          </>
        ) : activeDetailsTab === 'containers' ? (
          <>
            {deploymentDetailLoading && !deploymentDetail && (
              <div className="pods-detail-alert">Loading containers...</div>
            )}
            {renderContainersTab()}
          </>
        ) : activeDetailsTab === 'yaml' ? (
          <>
            {deploymentDetailLoading && !deploymentDetail && (
              <div className="pods-detail-alert">Loading {workloadLabel.toLowerCase()} manifest...</div>
            )}
            {(yamlError || yamlSuccess) && (
              <div className={`pods-detail-alert ${yamlError ? 'error' : 'info'}`}>
                {yamlError ?? yamlSuccess}
              </div>
            )}
            <section className="pods-detail-section pods-detail-manifest-section">
              <YamlEditor
                title={`${selectedDeployment.name}.yaml`}
                value={yamlValue}
                minHeight={0}
                className="pods-detail-manifest-editor"
                onChange={next => {
                  setYamlValue(next)
                  setYamlDirty(true)
                  setYamlError(null)
                  setYamlSuccess(null)
                }}
              />
              <div className="deployment-yaml-actions">
                <button
                  type="button"
                  className="pods-page-btn"
                  onClick={saveManifest}
                  disabled={!yamlDirty || yamlSaving}
                >
                  {yamlSaving ? 'Saving...' : 'Save YAML'}
                </button>
              </div>
            </section>
          </>
        ) : activeDetailsTab === 'scale' ? (
          <>
            {deploymentDetailLoading && !deploymentDetail && (
              <div className="pods-detail-alert">Loading scale data...</div>
            )}
            {scaleError && <div className="pods-detail-alert error">{scaleError}</div>}
            <div className="pods-overview-grid">
              <div className="pods-overview-card">
                <span>Replicas</span>
                <strong>{overviewReplicas}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Ready</span>
                <strong>{overviewReady}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Available</span>
                <strong>{overviewAvailable}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Unavailable</span>
                <strong>{overviewUnavailable}</strong>
              </div>
            </div>
            <section className="pods-detail-section deployment-scale-section">
              <h5>Scale {workloadLabel}</h5>
              <div className="deployment-scale-form">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={scaleValue}
                  onChange={event => setScaleValue(event.target.value)}
                />
                <button type="button" className="pods-page-btn" onClick={applyScale} disabled={scaleSaving}>
                  {scaleSaving ? 'Applying...' : 'Apply Scale'}
                </button>
              </div>
            </section>
          </>
        ) : activeDetailsTab === 'logs' ? (
          <div className="pods-logs-shell">
            <div className="pods-logs-toolbar">
              <div className="pods-container-toolbar">
                <label>Pod</label>
                <div className={`pods-container-select-wrap ${logsPodFilterOpen ? 'open' : ''}`} ref={logsPodFilterRef}>
                  <button
                    type="button"
                    className={`pods-container-select-trigger ${logsPodFilterOpen ? 'open' : ''}`}
                    onClick={() => {
                      setLogsPodFilterOpen(current => !current)
                      setLogsContainerFilterOpen(false)
                      setLogsStatusFilterOpen(false)
                    }}
                  >
                    <span className="pods-container-select-value">
                      {logsPodFilter === LOGS_ALL_PODS ? 'All Pods' : logsPodFilter}
                    </span>
                    <svg className="pods-container-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {logsPodFilterOpen && (
                    <div className="pods-container-select-dropdown" role="listbox" aria-label={`${workloadLabel} log pods`}>
                      {logPodOptions.map(option => (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          className={`pods-container-select-option ${logsPodFilter === option ? 'selected' : ''}`}
                          onClick={() => {
                            setLogsPodFilter(option)
                            setLogsPodFilterOpen(false)
                          }}
                        >
                          {option === LOGS_ALL_PODS ? 'All Pods' : option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pods-container-toolbar">
                <label>Container</label>
                <div className={`pods-container-select-wrap ${logsContainerFilterOpen ? 'open' : ''}`} ref={logsContainerFilterRef}>
                  <button
                    type="button"
                    className={`pods-container-select-trigger ${logsContainerFilterOpen ? 'open' : ''}`}
                    onClick={() => {
                      setLogsContainerFilterOpen(current => !current)
                      setLogsPodFilterOpen(false)
                      setLogsStatusFilterOpen(false)
                    }}
                  >
                    <span className="pods-container-select-value">
                      {logsContainerFilter === LOGS_ALL_CONTAINERS ? 'All Containers' : logsContainerFilter}
                    </span>
                    <svg className="pods-container-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {logsContainerFilterOpen && (
                    <div className="pods-container-select-dropdown" role="listbox" aria-label={`${workloadLabel} log containers`}>
                      {logContainerOptions.map(option => (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          className={`pods-container-select-option ${logsContainerFilter === option ? 'selected' : ''}`}
                          onClick={() => {
                            setLogsContainerFilter(option)
                            setLogsContainerFilterOpen(false)
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
                <label>Status</label>
                <div className={`pods-container-select-wrap ${logsStatusFilterOpen ? 'open' : ''}`} ref={logsStatusFilterRef}>
                  <button
                    type="button"
                    className={`pods-container-select-trigger ${logsStatusFilterOpen ? 'open' : ''}`}
                    onClick={() => {
                      setLogsStatusFilterOpen(current => !current)
                      setLogsPodFilterOpen(false)
                      setLogsContainerFilterOpen(false)
                    }}
                  >
                    <span className="pods-container-select-value">{formatStatusOption(logsStatusFilter)}</span>
                    <svg className="pods-container-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {logsStatusFilterOpen && (
                    <div className="pods-container-select-dropdown" role="listbox" aria-label={`${workloadLabel} log status`}>
                      {LOGS_STATUS_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          className={`pods-container-select-option ${logsStatusFilter === option.value ? 'selected' : ''}`}
                          onClick={() => {
                            setLogsStatusFilter(option.value)
                            setLogsStatusFilterOpen(false)
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
                <input type="checkbox" checked={logsShowTimestamp} onChange={event => setLogsShowTimestamp(event.target.checked)} />
                <span>Show Created At</span>
              </label>

              <div className="pods-logs-search">
                <input
                  ref={logsSearchInputRef}
                  type="search"
                  className="pods-logs-search-input"
                  value={logsSearchQuery}
                  onChange={event => setLogsSearchQuery(event.target.value)}
                  placeholder="Search logs..."
                  aria-label={`Search ${workloadLabel.toLowerCase()} logs`}
                />
              </div>

              <div className="pods-logs-actions">
                <span className="pods-logs-count">{visibleLogs.length} lines</span>
              </div>
            </div>

            {(deploymentLogsError || deploymentDetailError) && (
              <div className="pods-detail-alert error">{deploymentLogsError ?? deploymentDetailError}</div>
            )}

            <div className="pods-logs-view-wrap">
              <div className="pods-logs-view" role="log" aria-live="polite">
                {deploymentLogsLoading && deploymentLogs.length === 0 ? (
                  <div className="pods-detail-empty">Loading {workloadLabel.toLowerCase()} logs...</div>
                ) : visibleLogs.length === 0 ? (
                  <div className="pods-detail-empty">No logs found</div>
                ) : (
                  visibleLogs.map((line, index) => (
                    <p key={`${line.podName}-${line.container}-${line.createdAtUnix}-${index}`} className={`pods-log-line tone-${detectLogTone(line.message)}`}>
                      {logsShowTimestamp && line.createdAt !== '-' && (
                        <span className="pods-log-meta">[{line.createdAt}] </span>
                      )}
                      <span className="pods-log-meta">[{line.podName}] </span>
                      <span className="pods-log-meta">[{line.container}] </span>
                      <span>{line.message}</span>
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {deploymentDetailLoading && !deploymentDetail && (
              <div className="pods-detail-alert">Loading {workloadLabel.toLowerCase()} details...</div>
            )}
            <div className="pods-overview-grid">
              <div className="pods-overview-card">
                <span>Name</span>
                <strong>{selectedDeployment.name}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Namespace</span>
                <strong>{selectedDeployment.namespace}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Status</span>
                <strong>
                  <span className={`pods-status-pill ${parsePhase(overviewStatus).toLowerCase()}`}>{overviewStatus}</span>
                </strong>
              </div>
              {isCronJob ? (
                <>
                  <div className="pods-overview-card">
                    <span>Schedule</span>
                    <strong>{overviewSchedule}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Suspend</span>
                    <strong>{overviewSuspend ? 'Yes' : 'No'}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Active</span>
                    <strong>{overviewActive}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Last</span>
                    <strong>{overviewLastSchedule}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Next</span>
                    <strong>{overviewNextSchedule}</strong>
                  </div>
                </>
              ) : isJob ? (
                <>
                  <div className="pods-overview-card">
                    <span>Completions</span>
                    <strong>{overviewCompletions}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Conditions</span>
                    <strong>{overviewConditionsSummary || '-'}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Active</span>
                    <strong>{overviewActive}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Succeeded</span>
                    <strong>{overviewAvailable}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Failed</span>
                    <strong>{overviewUnavailable}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="pods-overview-card">
                    <span>{isDaemonSet ? 'Desired' : 'Replicas'}</span>
                    <strong>{overviewReplicas}</strong>
                  </div>
                  {isDaemonSet && (
                    <div className="pods-overview-card">
                      <span>Current</span>
                      <strong>{overviewCurrent}</strong>
                    </div>
                  )}
                  <div className="pods-overview-card">
                    <span>Ready</span>
                    <strong>{overviewReady}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>{isDaemonSet ? 'Up-to-date' : 'Updated'}</span>
                    <strong>{overviewUpdated}</strong>
                  </div>
                  <div className="pods-overview-card">
                    <span>Available</span>
                    <strong>{overviewAvailable}</strong>
                  </div>
                  {!isDaemonSet && (
                    <div className="pods-overview-card">
                      <span>Unavailable</span>
                      <strong>{overviewUnavailable}</strong>
                    </div>
                  )}
                  {isDaemonSet && (
                    <div className="pods-overview-card is-full">
                      <span>Node Selector</span>
                      <strong>{overviewNodeSelectorText}</strong>
                    </div>
                  )}
                </>
              )}
              <div className="pods-overview-card">
                <span>Age</span>
                <strong>{overviewAge}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Created</span>
                <strong>{overviewCreated}</strong>
              </div>
              <div className="pods-overview-card is-full">
                <span>UID</span>
                <strong>{overviewUID}</strong>
              </div>
            </div>

            {!isDaemonSet && !isJob && (
              <section className="pods-detail-section">
                <h5>
                  {isCronJob
                    ? 'Job History'
                    : workloadTab === 'deployments'
                      ? 'Deploy Revisions'
                      : 'Revisions'}
                </h5>
                <div className="pods-detail-table-wrap">
                  <table className="pods-detail-table">
                    <thead>
                      <tr>
                        <th>{isCronJob ? 'Run' : 'Revision'}</th>
                        <th>{isCronJob ? 'Job' : 'ReplicaSet'}</th>
                        <th>{isCronJob ? 'Active' : 'Replicas'}</th>
                        <th>{isCronJob ? 'Succeeded' : 'Ready'}</th>
                        <th>Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewRevisions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="pods-detail-empty">No revisions</td>
                        </tr>
                      ) : (
                        overviewRevisions.map(revision => (
                          <tr key={`${revision.replicaSet}-${revision.revision}`}>
                            <td className="pods-detail-value-cell">{revision.revision}</td>
                            <td className="pods-detail-value-cell">{revision.replicaSet}</td>
                            <td className="pods-detail-value-cell">{revision.replicas}</td>
                            <td className="pods-detail-value-cell">{revision.ready}</td>
                            <td className="pods-detail-value-cell">{revision.age}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {!isCronJob && (
              <section className="pods-detail-section">
              <h5>Pods</h5>
              <div className="pods-detail-table-wrap">
                <table className="pods-detail-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Node</th>
                      <th>Namespace</th>
                      <th>Ready</th>
                      <th>CPU</th>
                      <th>Memory</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewPods.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="pods-detail-empty">No pods</td>
                      </tr>
                    ) : (
                      overviewPods.map(item => (
                        <tr key={item.name}>
                          <td className="pods-detail-value-cell">{item.name}</td>
                          <td className="pods-detail-value-cell">{item.node}</td>
                          <td className="pods-detail-value-cell">{item.namespace}</td>
                          <td className="pods-detail-value-cell">{item.ready}</td>
                          <td className="pods-detail-value-cell">{item.cpu}</td>
                          <td className="pods-detail-value-cell">{item.memory}</td>
                          <td className="pods-detail-value-cell">
                            <span className={`pods-status-pill ${parsePhase(item.status).toLowerCase()}`}>{item.status}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </section>
            )}

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
                    {overviewEvents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="pods-detail-empty">No events</td>
                      </tr>
                    ) : (
                      overviewEvents.map((event, index) => (
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
          </>
        )}
      </div>
    </section>
  )
}
