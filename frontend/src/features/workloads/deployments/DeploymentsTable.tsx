import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { DeploymentResource } from '../../../shared/types'
import { formatAgeFromUnix, parsePhase } from '../../../shared/utils/formatting'
import { useDragResize } from '../../../shared/hooks/useDragResize'
import { useDeployments } from './hooks/useDeployments'
import type { NonPodWorkloadTabId } from '../workloadKinds'
import { workloadPluralLabel } from '../workloadKinds'
import '../pods/PodsTable.css'

interface Props {
  clusterFilename: string
  selectedNamespaces: string[]
  workloadTab?: NonPodWorkloadTabId
  externalSelectedDeploymentKey?: string | null
  onDeploymentActivate?: (deployment: DeploymentResource, options: { pin: boolean }) => void
}

const STATUS_ALL = 'all'
const PAGE_SIZE_OPTIONS = [20, 50] as const

type DeploymentColumnKey =
  | 'name'
  | 'namespace'
  | 'pods'
  | 'replicas'
  | 'desired'
  | 'current'
  | 'ready'
  | 'upToDate'
  | 'available'
  | 'nodeSelector'
  | 'completions'
  | 'conditions'
  | 'schedule'
  | 'suspend'
  | 'active'
  | 'last'
  | 'next'
  | 'status'
  | 'age'

type DeploymentColumn = {
  key: DeploymentColumnKey
  label: string
  minWidth: number
  defaultWidth: number
  maxWidth: number
}

const DEPLOYMENT_COLUMNS: DeploymentColumn[] = [
  { key: 'name', label: 'Name', minWidth: 180, defaultWidth: 280, maxWidth: 560 },
  { key: 'namespace', label: 'Namespace', minWidth: 140, defaultWidth: 200, maxWidth: 360 },
  { key: 'pods', label: 'Pods', minWidth: 100, defaultWidth: 140, maxWidth: 220 },
  { key: 'replicas', label: 'Replicas', minWidth: 100, defaultWidth: 130, maxWidth: 220 },
  { key: 'desired', label: 'Desired', minWidth: 90, defaultWidth: 120, maxWidth: 200 },
  { key: 'current', label: 'Current', minWidth: 90, defaultWidth: 120, maxWidth: 200 },
  { key: 'ready', label: 'Ready', minWidth: 90, defaultWidth: 120, maxWidth: 200 },
  { key: 'upToDate', label: 'Up-to-date', minWidth: 100, defaultWidth: 140, maxWidth: 240 },
  { key: 'available', label: 'Available', minWidth: 100, defaultWidth: 130, maxWidth: 220 },
  { key: 'nodeSelector', label: 'Node Selector', minWidth: 180, defaultWidth: 280, maxWidth: 620 },
  { key: 'completions', label: 'Completions', minWidth: 120, defaultWidth: 160, maxWidth: 280 },
  { key: 'conditions', label: 'Conditions', minWidth: 140, defaultWidth: 220, maxWidth: 420 },
  { key: 'schedule', label: 'Schedule', minWidth: 140, defaultWidth: 220, maxWidth: 380 },
  { key: 'suspend', label: 'Suspend', minWidth: 100, defaultWidth: 130, maxWidth: 220 },
  { key: 'active', label: 'Active', minWidth: 90, defaultWidth: 120, maxWidth: 220 },
  { key: 'last', label: 'Last', minWidth: 150, defaultWidth: 220, maxWidth: 360 },
  { key: 'next', label: 'Next', minWidth: 150, defaultWidth: 220, maxWidth: 360 },
  { key: 'status', label: 'Status', minWidth: 140, defaultWidth: 210, maxWidth: 320 },
  { key: 'age', label: 'Age', minWidth: 80, defaultWidth: 110, maxWidth: 180 },
]

const DAEMON_SET_COLUMNS: DeploymentColumnKey[] = [
  'name',
  'namespace',
  'desired',
  'current',
  'ready',
  'upToDate',
  'available',
  'nodeSelector',
  'age',
]

const STATEFUL_SET_COLUMNS: DeploymentColumnKey[] = [
  'name',
  'namespace',
  'pods',
  'replicas',
  'age',
]

const JOB_COLUMNS: DeploymentColumnKey[] = [
  'name',
  'namespace',
  'completions',
  'conditions',
  'age',
]

const CRONJOB_COLUMNS: DeploymentColumnKey[] = [
  'name',
  'namespace',
  'schedule',
  'suspend',
  'active',
  'last',
  'next',
  'age',
]

const DEFAULT_WORKLOAD_COLUMNS: DeploymentColumnKey[] = [
  'name',
  'namespace',
  'pods',
  'replicas',
  'status',
  'age',
]

type ColumnWidthState = Record<DeploymentColumnKey, number>

function buildInitialColumnWidths(): ColumnWidthState {
  return DEPLOYMENT_COLUMNS.reduce((acc, column) => {
    acc[column.key] = column.defaultWidth
    return acc
  }, {} as ColumnWidthState)
}

function normalizeStatus(status: string): string {
  return parsePhase(status).toLowerCase()
}

function formatStatusOption(option: string): string {
  if (option === STATUS_ALL) {
    return 'All Status'
  }
  return option.charAt(0).toUpperCase() + option.slice(1)
}

function getDeploymentKey(item: DeploymentResource): string {
  return `${item.namespace}/${item.name}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parsePodRatio(value: string): number {
  const [ready, total] = value.split('/').map(item => Number(item.trim()))
  if (!Number.isFinite(ready) || !Number.isFinite(total) || total <= 0) {
    return 0
  }
  return ready / total
}

export default function DeploymentsTable({
  clusterFilename,
  selectedNamespaces,
  workloadTab = 'deployments',
  externalSelectedDeploymentKey = null,
  onDeploymentActivate,
}: Props) {
  const { items, loading, error } = useDeployments(clusterFilename, selectedNamespaces, workloadTab)
  const pluralLabel = workloadPluralLabel(workloadTab)
  const visibleColumnKeys = useMemo(() => {
    switch (workloadTab) {
      case 'daemon-sets':
        return DAEMON_SET_COLUMNS
      case 'stateful-sets':
        return STATEFUL_SET_COLUMNS
      case 'jobs':
        return JOB_COLUMNS
      case 'cronjobs':
        return CRONJOB_COLUMNS
      default:
        return DEFAULT_WORKLOAD_COLUMNS
    }
  }, [workloadTab])
  const columnByKey = useMemo(
    () => new Map(DEPLOYMENT_COLUMNS.map(column => [column.key, column])),
    [],
  )
  const visibleColumns = useMemo(
    () => visibleColumnKeys
      .map(key => columnByKey.get(key))
      .filter((column): column is DeploymentColumn => Boolean(column)),
    [visibleColumnKeys, columnByKey],
  )

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(STATUS_ALL)
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<DeploymentColumnKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnWidths, setColumnWidths] = useState<ColumnWidthState>(() => buildInitialColumnWidths())
  const [tableViewportWidth, setTableViewportWidth] = useState(0)
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1)
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))

  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement | null>(null)
  const statusFilterRef = useRef<HTMLDivElement | null>(null)
  const activeColumnKeyRef = useRef<DeploymentColumnKey | null>(null)

  const handleColumnResizeUpdate = useCallback((nextWidth: number) => {
    const key = activeColumnKeyRef.current
    if (!key) return
    setColumnWidths(current => ({ ...current, [key]: nextWidth }))
  }, [])

  const columnResize = useDragResize({ onUpdate: handleColumnResizeUpdate })

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setStatusFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [])

  useEffect(() => {
    const tableWrap = tableWrapRef.current
    if (!tableWrap) {
      return
    }

    const syncWidth = () => {
      setTableViewportWidth(tableWrap.clientWidth)
    }

    syncWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncWidth)
      return () => window.removeEventListener('resize', syncWidth)
    }

    const observer = new ResizeObserver(() => syncWidth())
    observer.observe(tableWrap)
    return () => observer.disconnect()
  }, [])

  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((total, column) => total + columnWidths[column.key], 0),
    [columnWidths, visibleColumns],
  )
  const tableWidth = Math.max(tableMinWidth, tableViewportWidth)

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      set.add(normalizeStatus(item.status))
    }
    return [STATUS_ALL, ...Array.from(set).sort()]
  }, [items])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter(item => {
      const status = normalizeStatus(item.status)
      if (statusFilter !== STATUS_ALL && status !== statusFilter) {
        return false
      }
      if (!query) {
        return true
      }
      if (
        item.name.toLowerCase().includes(query)
        || item.namespace.toLowerCase().includes(query)
        || item.status.toLowerCase().includes(query)
        || item.pods.toLowerCase().includes(query)
        || String(item.replicas ?? '').toLowerCase().includes(query)
        || String(item.desired ?? '').toLowerCase().includes(query)
        || String(item.current ?? '').toLowerCase().includes(query)
        || String(item.ready ?? '').toLowerCase().includes(query)
        || String(item.upToDate ?? '').toLowerCase().includes(query)
        || String(item.available ?? '').toLowerCase().includes(query)
        || String(item.nodeSelector ?? '').toLowerCase().includes(query)
        || String(item.completions ?? '').toLowerCase().includes(query)
        || String(item.conditions ?? '').toLowerCase().includes(query)
        || String(item.schedule ?? '').toLowerCase().includes(query)
        || String(item.suspend ?? '').toLowerCase().includes(query)
        || String(item.active ?? '').toLowerCase().includes(query)
        || String(item.last ?? '').toLowerCase().includes(query)
        || String(item.next ?? '').toLowerCase().includes(query)
      ) {
        return true
      }
      if (item.labels) {
        for (const [key, value] of Object.entries(item.labels)) {
          if (key.toLowerCase().includes(query) || value.toLowerCase().includes(query)) return true
        }
      }
      if (item.annotations) {
        for (const [key, value] of Object.entries(item.annotations)) {
          if (key.toLowerCase().includes(query) || value.toLowerCase().includes(query)) return true
        }
      }
      return false
    })
  }, [items, search, statusFilter])

  const handleSort = (key: DeploymentColumnKey) => {
    if (sortKey === key) {
      setSortDir(current => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((left, right) => {
      switch (sortKey) {
        case 'name':
          return direction * left.name.localeCompare(right.name)
        case 'namespace':
          return direction * left.namespace.localeCompare(right.namespace)
        case 'pods':
          return direction * (parsePodRatio(left.pods) - parsePodRatio(right.pods))
        case 'replicas':
          return direction * (left.replicas - right.replicas)
        case 'desired':
          return direction * ((left.desired ?? left.replicas) - (right.desired ?? right.replicas))
        case 'current':
          return direction * ((left.current ?? 0) - (right.current ?? 0))
        case 'ready':
          return direction * ((left.ready ?? 0) - (right.ready ?? 0))
        case 'upToDate':
          return direction * ((left.upToDate ?? 0) - (right.upToDate ?? 0))
        case 'available':
          return direction * ((left.available ?? 0) - (right.available ?? 0))
        case 'nodeSelector':
          return direction * (left.nodeSelector ?? '').localeCompare(right.nodeSelector ?? '')
        case 'completions':
          return direction * (left.completions ?? '').localeCompare(right.completions ?? '')
        case 'conditions':
          return direction * (left.conditions ?? '').localeCompare(right.conditions ?? '')
        case 'schedule':
          return direction * (left.schedule ?? '').localeCompare(right.schedule ?? '')
        case 'suspend':
          return direction * (left.suspend ?? '').localeCompare(right.suspend ?? '')
        case 'active':
          return direction * ((left.active ?? 0) - (right.active ?? 0))
        case 'last':
          return direction * (left.last ?? '').localeCompare(right.last ?? '')
        case 'next':
          return direction * (left.next ?? '').localeCompare(right.next ?? '')
        case 'status':
          return direction * left.status.localeCompare(right.status)
        case 'age':
          return direction * ((left.createdAtUnix ?? 0) - (right.createdAtUnix ?? 0))
        default:
          return 0
      }
    })
  }, [filteredItems, sortDir, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pagedItems = useMemo(
    () => sortedItems.slice(pageStart, pageStart + pageSize),
    [sortedItems, pageStart, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, pageSize])

  useEffect(() => {
    setPage(current => Math.min(current, totalPages))
  }, [totalPages])

  const handleColumnResizeStart = (
    event: ReactMouseEvent<HTMLButtonElement>,
    key: DeploymentColumnKey,
    minWidth: number,
    maxWidth: number,
  ) => {
    activeColumnKeyRef.current = key
    columnResize.start(event, columnWidths[key], minWidth, maxWidth)
  }

  const handleTableKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (pagedItems.length === 0) return

    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusedRowIndex(current => {
        const next = current < pagedItems.length - 1 ? current + 1 : current
        const row = tableBodyRef.current?.children[next] as HTMLElement | undefined
        row?.scrollIntoView({ block: 'nearest' })
        return next
      })
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedRowIndex(current => {
        const next = current > 0 ? current - 1 : 0
        const row = tableBodyRef.current?.children[next] as HTMLElement | undefined
        row?.scrollIntoView({ block: 'nearest' })
        return next
      })
      return
    }

    if (event.key === 'Enter' && focusedRowIndex >= 0 && focusedRowIndex < pagedItems.length) {
      event.preventDefault()
      const deployment = pagedItems[focusedRowIndex]
      onDeploymentActivate?.(deployment, { pin: false })
    }
  }, [focusedRowIndex, onDeploymentActivate, pagedItems])

  useEffect(() => {
    setFocusedRowIndex(-1)
  }, [page, search, statusFilter, sortKey, sortDir])

  const rowCountLabel = loading ? '...' : String(sortedItems.length)
  const emptyStateMessage = selectedNamespaces.length === 0
    ? 'Select at least one namespace.'
    : `No ${pluralLabel.toLowerCase()} found`

  return (
    <div className={`pods-table-root ${(columnResize.isResizing) ? 'resizing' : ''}`}>
      <div className="pods-content">
        <div className="pods-table-pane">
          <div className="pods-toolbar">
            <div className="pods-resource-count">
              <strong>{rowCountLabel}</strong>
            </div>
            <input
              className="pods-search"
              placeholder="Search by name, namespace, pods or status"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <div className={`pods-status-select ${statusFilterOpen ? 'open' : ''}`} ref={statusFilterRef}>
              <button
                type="button"
                className={`pods-status-trigger ${statusFilterOpen ? 'open' : ''}`}
                onClick={() => setStatusFilterOpen(current => !current)}
                aria-haspopup="listbox"
                aria-expanded={statusFilterOpen}
              >
                <span className="pods-status-trigger-value">{formatStatusOption(statusFilter)}</span>
                <svg className="pods-status-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {statusFilterOpen && (
                <div className="pods-status-dropdown" role="listbox" aria-label="Deployment status filter">
                  {statusOptions.map(option => (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      className={`pods-status-option ${statusFilter === option ? 'selected' : ''}`}
                      aria-selected={statusFilter === option}
                      onClick={() => {
                        setStatusFilter(option)
                        setStatusFilterOpen(false)
                      }}
                    >
                      {formatStatusOption(option)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pods-table-wrap" ref={tableWrapRef} tabIndex={0} onKeyDown={handleTableKeyDown}>
            <table className="pods-table" style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
              <colgroup>
                {visibleColumns.map(column => (
                  <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((column, index) => (
                    <th key={column.key}>
                      <div className="pods-th-content">
                        <button
                          type="button"
                          className="pods-th-sort"
                          onClick={() => handleSort(column.key)}
                          aria-label={`Sort by ${column.label}`}
                          >
                            <span className="pods-th-label">{column.label}</span>
                          <svg
                            className={`pods-sort-icon ${sortKey === column.key ? 'active' : ''}`}
                            width="10"
                            height="14"
                            viewBox="0 0 10 14"
                            fill="none"
                          >
                            <path
                              d="M5 0.5L9 5.5H1L5 0.5Z"
                              fill="currentColor"
                              opacity={sortKey === column.key && sortDir === 'asc' ? 1 : 0.35}
                            />
                            <path
                              d="M5 13.5L1 8.5H9L5 13.5Z"
                              fill="currentColor"
                              opacity={sortKey === column.key && sortDir === 'desc' ? 1 : 0.35}
                            />
                          </svg>
                        </button>
                        {index < visibleColumns.length - 1 && (
                          <button
                            type="button"
                            className={`pods-col-resizer ${columnResize.isResizing && activeColumnKeyRef.current === column.key ? 'active' : ''}`}
                            onMouseDown={event => handleColumnResizeStart(event, column.key, column.minWidth, column.maxWidth)}
                            aria-label={`Resize ${column.label} column`}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={tableBodyRef}>
                {error ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="pods-empty-row error">{error}</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="pods-empty-row">Loading {pluralLabel.toLowerCase()}...</td>
                  </tr>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="pods-empty-row">{emptyStateMessage}</td>
                  </tr>
                ) : (
                  pagedItems.map((item, index) => {
                    const key = getDeploymentKey(item)
                    const isSelected = externalSelectedDeploymentKey === key
                    const isFocused = focusedRowIndex === index
                    const activateDeploymentFromNameCell = (event: ReactMouseEvent<HTMLElement>) => {
                      const pin = event.detail >= 2
                      onDeploymentActivate?.(item, { pin })
                    }
                    return (
                      <tr key={key} className={`${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focused' : ''}`}>
                        {visibleColumns.map(column => {
                          switch (column.key) {
                            case 'name':
                              return (
                                <td
                                  key={column.key}
                                  className="pods-name-cell pods-cell"
                                  title={item.name}
                                  onClick={activateDeploymentFromNameCell}
                                >
                                  <button
                                    type="button"
                                    className={`pods-name-button ${isSelected ? 'active' : ''}`}
                                    onClick={event => {
                                      event.stopPropagation()
                                      activateDeploymentFromNameCell(event)
                                    }}
                                  >
                                    {item.name}
                                  </button>
                                </td>
                              )
                            case 'namespace':
                              return <td key={column.key} className="pods-cell" title={item.namespace}>{item.namespace}</td>
                            case 'pods':
                              return <td key={column.key} className="pods-cell" title={item.pods}>{item.pods}</td>
                            case 'replicas':
                              return <td key={column.key} className="pods-cell" title={String(item.replicas)}>{item.replicas}</td>
                            case 'desired':
                              return <td key={column.key} className="pods-cell" title={String(item.desired ?? item.replicas ?? 0)}>{item.desired ?? item.replicas ?? 0}</td>
                            case 'current':
                              return <td key={column.key} className="pods-cell" title={String(item.current ?? 0)}>{item.current ?? 0}</td>
                            case 'ready':
                              return <td key={column.key} className="pods-cell" title={String(item.ready ?? 0)}>{item.ready ?? 0}</td>
                            case 'upToDate':
                              return <td key={column.key} className="pods-cell" title={String(item.upToDate ?? 0)}>{item.upToDate ?? 0}</td>
                            case 'available':
                              return <td key={column.key} className="pods-cell" title={String(item.available ?? 0)}>{item.available ?? 0}</td>
                            case 'nodeSelector':
                              return <td key={column.key} className="pods-cell" title={item.nodeSelector ?? '-'}>{item.nodeSelector ?? '-'}</td>
                            case 'completions':
                              return <td key={column.key} className="pods-cell" title={item.completions ?? '-'}>{item.completions ?? '-'}</td>
                            case 'conditions':
                              return <td key={column.key} className="pods-cell" title={item.conditions ?? '-'}>{item.conditions ?? '-'}</td>
                            case 'schedule':
                              return <td key={column.key} className="pods-cell" title={item.schedule ?? '-'}>{item.schedule ?? '-'}</td>
                            case 'suspend':
                              return <td key={column.key} className="pods-cell" title={item.suspend ?? '-'}>{item.suspend ?? '-'}</td>
                            case 'active':
                              return <td key={column.key} className="pods-cell" title={String(item.active ?? 0)}>{item.active ?? 0}</td>
                            case 'last':
                              return <td key={column.key} className="pods-cell" title={item.last ?? '-'}>{item.last ?? '-'}</td>
                            case 'next':
                              return <td key={column.key} className="pods-cell" title={item.next ?? '-'}>{item.next ?? '-'}</td>
                            case 'status':
                              return (
                                <td key={column.key}>
                                  <span className={`pods-status-pill ${normalizeStatus(item.status)}`} title={item.status}>
                                    {item.status}
                                  </span>
                                </td>
                              )
                            case 'age':
                              return (
                                <td key={column.key} className="pods-cell">
                                  {item.createdAtUnix ? formatAgeFromUnix(item.createdAtUnix, nowUnix) : (item.age ?? '-')}
                                </td>
                              )
                            default:
                              return <td key={column.key} className="pods-cell">-</td>
                          }
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="pods-pagination">
            <div className="pods-pagination-left">
              <span>Rows</span>
              <select
                className="pods-page-size"
                value={pageSize}
                onChange={event => setPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="pods-pagination-right">
              <span>Page {page} / {totalPages}</span>
              <button
                type="button"
                className="pods-page-btn"
                disabled={page <= 1}
                onClick={() => setPage(current => clamp(current - 1, 1, totalPages))}
              >
                Prev
              </button>
              <button
                type="button"
                className="pods-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(current => clamp(current + 1, 1, totalPages))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
