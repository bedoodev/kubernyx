import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { PodResource } from '../../../shared/types'
import { getAgeLabel, parsePhase } from '../../../shared/utils/formatting'
import { useDragResize } from '../../../shared/hooks/useDragResize'
import { usePodsStream } from './hooks/usePodsStream'
import { usePodDetail } from './hooks/usePodDetail'
import { usePodLogs } from './hooks/usePodLogs'
import PodDetailPanel, { type PodDetailsTabId } from './components/PodDetailPanel'
import './PodsTable.css'

interface Props {
  clusterFilename: string
  selectedNamespaces: string[]
  showInlineDetails?: boolean
  externalSelectedPodKey?: string | null
  onPodActivate?: (pod: PodResource, options: { pin: boolean }) => void
}

const STATUS_ALL = 'all'
const DETAIL_LEFT_MIN_WIDTH = 520
const DETAIL_MIN_WIDTH = 420
const PAGE_SIZE_OPTIONS = [20, 50] as const

type PodColumnKey = 'name' | 'namespace' | 'cpu' | 'memory' | 'controlledBy' | 'status' | 'age'

type PodColumn = {
  key: PodColumnKey
  label: string
  minWidth: number
  defaultWidth: number
  maxWidth: number
}

const POD_COLUMNS: PodColumn[] = [
  { key: 'name', label: 'Name', minWidth: 180, defaultWidth: 260, maxWidth: 540 },
  { key: 'namespace', label: 'Namespace', minWidth: 140, defaultWidth: 190, maxWidth: 360 },
  { key: 'cpu', label: 'CPU', minWidth: 90, defaultWidth: 120, maxWidth: 200 },
  { key: 'memory', label: 'Memory', minWidth: 100, defaultWidth: 130, maxWidth: 220 },
  { key: 'controlledBy', label: 'Controlled By', minWidth: 180, defaultWidth: 240, maxWidth: 560 },
  { key: 'status', label: 'Status', minWidth: 140, defaultWidth: 210, maxWidth: 320 },
  { key: 'age', label: 'Age', minWidth: 80, defaultWidth: 100, maxWidth: 180 },
]

type ColumnWidthState = Record<PodColumnKey, number>

function buildInitialColumnWidths(): ColumnWidthState {
  return POD_COLUMNS.reduce((acc, column) => {
    acc[column.key] = column.defaultWidth
    return acc
  }, {} as ColumnWidthState)
}

function normalizeStatus(status: string): string {
  return parsePhase(status).toLowerCase()
}

function getPodKey(item: PodResource): string {
  return `${item.namespace}/${item.name}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseSortableNumber(value: string): number {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function formatStatusOption(option: string): string {
  if (option === STATUS_ALL) {
    return 'All Status'
  }
  return option.charAt(0).toUpperCase() + option.slice(1)
}

export default function PodsTable({
  clusterFilename,
  selectedNamespaces,
  showInlineDetails = true,
  externalSelectedPodKey = null,
  onPodActivate,
}: Props) {
  const { items, loading, error } = usePodsStream(clusterFilename, selectedNamespaces)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(STATUS_ALL)
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<PodColumnKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnWidths, setColumnWidths] = useState<ColumnWidthState>(() => buildInitialColumnWidths())
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const [tableViewportWidth, setTableViewportWidth] = useState(0)
  const [selectedPodKey, setSelectedPodKey] = useState<string | null>(null)
  const [activeDetailsTab, setActiveDetailsTab] = useState<PodDetailsTabId>('overview')
  const [detailWidth, setDetailWidth] = useState(560)
  const [detailsMaximized, setDetailsMaximized] = useState(false)
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1)

  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement | null>(null)
  const splitWrapRef = useRef<HTMLDivElement | null>(null)
  const statusFilterRef = useRef<HTMLDivElement | null>(null)
  const activeColumnKeyRef = useRef<PodColumnKey | null>(null)

  const handleColumnResizeUpdate = useCallback((nextWidth: number) => {
    const key = activeColumnKeyRef.current
    if (!key) return
    setColumnWidths(current => ({ ...current, [key]: nextWidth }))
  }, [])

  const columnResize = useDragResize({ onUpdate: handleColumnResizeUpdate })
  const detailsResize = useDragResize({ onUpdate: setDetailWidth, invertDelta: true })

  const selectedPod = useMemo(
    () => (selectedPodKey ? (items.find(item => getPodKey(item) === selectedPodKey) ?? null) : null),
    [items, selectedPodKey],
  )
  const visibleSelectedPodKey = externalSelectedPodKey ?? selectedPodKey

  const { podDetail, podDetailLoading, podDetailError } = usePodDetail(clusterFilename, selectedPod)
  const { podLogs, podLogsLoading, podLogsError, podLogsLoadingOlder, loadOlderLogs } = usePodLogs(
    clusterFilename,
    selectedPod,
    Boolean(selectedPod && activeDetailsTab === 'logs'),
  )

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

    const observer = new ResizeObserver(() => {
      syncWidth()
    })
    observer.observe(tableWrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!selectedPodKey) {
      return
    }
    if (selectedPod) {
      return
    }
    setSelectedPodKey(null)
    setDetailsMaximized(false)
  }, [selectedPod, selectedPodKey])

  useEffect(() => {
    if (!selectedPod) {
      return
    }

    const syncDetailWidth = () => {
      const splitWrap = splitWrapRef.current
      if (!splitWrap) {
        return
      }
      const totalWidth = splitWrap.clientWidth
      const maxWidth = Math.max(DETAIL_MIN_WIDTH, totalWidth - DETAIL_LEFT_MIN_WIDTH)
      setDetailWidth(current => clamp(current, DETAIL_MIN_WIDTH, maxWidth))
    }

    syncDetailWidth()
    window.addEventListener('resize', syncDetailWidth)
    return () => window.removeEventListener('resize', syncDetailWidth)
  }, [selectedPod])

  const tableMinWidth = useMemo(
    () => POD_COLUMNS.reduce((total, column) => total + columnWidths[column.key], 0),
    [columnWidths],
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
        || item.controlledBy.toLowerCase().includes(query)
        || item.status.toLowerCase().includes(query)
      ) {
        return true
      }
      if (item.labels) {
        for (const [k, v] of Object.entries(item.labels)) {
          if (k.toLowerCase().includes(query) || v.toLowerCase().includes(query)) return true
        }
      }
      if (item.annotations) {
        for (const [k, v] of Object.entries(item.annotations)) {
          if (k.toLowerCase().includes(query) || v.toLowerCase().includes(query)) return true
        }
      }
      return false
    })
  }, [items, search, statusFilter])

  const handleSort = (key: PodColumnKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name)
        case 'namespace':
          return dir * a.namespace.localeCompare(b.namespace)
        case 'controlledBy':
          return dir * a.controlledBy.localeCompare(b.controlledBy)
        case 'status':
          return dir * a.status.localeCompare(b.status)
        case 'cpu':
          return dir * (parseSortableNumber(a.cpu) - parseSortableNumber(b.cpu))
        case 'memory':
          return dir * (parseSortableNumber(a.memory) - parseSortableNumber(b.memory))
        case 'age':
          return dir * ((a.createdAtUnix ?? 0) - (b.createdAtUnix ?? 0))
        default:
          return 0
      }
    })
  }, [filteredItems, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pagedItems = useMemo(
    () => sortedItems.slice(pageStart, pageStart + pageSize),
    [sortedItems, pageSize, pageStart],
  )

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, pageSize])

  useEffect(() => {
    setPage(current => Math.min(current, totalPages))
  }, [totalPages])

  const rowCountLabel = loading ? '...' : String(sortedItems.length)
  const emptyStateMessage = selectedNamespaces.length === 0
    ? 'Select at least one namespace.'
    : 'No pods found'

  const handleColumnResizeStart = (
    event: ReactMouseEvent<HTMLButtonElement>,
    key: PodColumnKey,
    minWidth: number,
    maxWidth: number,
  ) => {
    activeColumnKeyRef.current = key
    columnResize.start(event, columnWidths[key], minWidth, maxWidth)
  }

  const handleDetailsResizeStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const splitWrap = splitWrapRef.current
    if (!splitWrap) {
      return
    }

    const totalWidth = splitWrap.clientWidth
    const maxWidth = Math.max(DETAIL_MIN_WIDTH, totalWidth - DETAIL_LEFT_MIN_WIDTH)

    detailsResize.start(event, detailWidth, DETAIL_MIN_WIDTH, maxWidth)
  }

  const openPodDetails = (pod: PodResource) => {
    const podKey = getPodKey(pod)
    if (podKey !== selectedPodKey) {
      setActiveDetailsTab('overview')
    }
    setSelectedPodKey(podKey)

    const splitWrap = splitWrapRef.current
    if (splitWrap) {
      const totalWidth = splitWrap.clientWidth
      const maxWidth = Math.max(DETAIL_MIN_WIDTH, totalWidth - DETAIL_LEFT_MIN_WIDTH)
      const preferredWidth = Math.floor(totalWidth * 0.47)
      setDetailWidth(clamp(preferredWidth, DETAIL_MIN_WIDTH, maxWidth))
    }
  }

  const closePodDetails = () => {
    setSelectedPodKey(null)
    setActiveDetailsTab('overview')
    setDetailsMaximized(false)
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
      const pod = pagedItems[focusedRowIndex]
      onPodActivate?.(pod, { pin: false })
      if (showInlineDetails) {
        openPodDetails(pod)
      }
      return
    }
  }, [pagedItems, focusedRowIndex, onPodActivate, showInlineDetails])

  useEffect(() => {
    setFocusedRowIndex(-1)
  }, [page, search, statusFilter, sortKey, sortDir])

  return (
    <div className={`pods-table-root ${showInlineDetails && selectedPod ? 'with-details' : ''} ${(columnResize.isResizing || detailsResize.isResizing) ? 'resizing' : ''}`}>
      <div className={`pods-content ${showInlineDetails && selectedPod ? 'with-details' : ''}`} ref={splitWrapRef}>
        <div className="pods-table-pane">
          <div className="pods-toolbar">
            <div className="pods-resource-count">
              <strong>{rowCountLabel}</strong>
            </div>
            <input
              className="pods-search"
              placeholder="Search by name, namespace, owner, status, annotations or labels"
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
                <div className="pods-status-dropdown" role="listbox" aria-label="Status filter">
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
                {POD_COLUMNS.map(column => (
                  <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {POD_COLUMNS.map((column, index) => (
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
                        {index < POD_COLUMNS.length - 1 && (
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
                    <td colSpan={POD_COLUMNS.length} className="pods-empty-row error">{error}</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={POD_COLUMNS.length} className="pods-empty-row">Loading pods...</td>
                  </tr>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={POD_COLUMNS.length} className="pods-empty-row">{emptyStateMessage}</td>
                  </tr>
                ) : (
                  pagedItems.map((item, index) => {
                    const podKey = getPodKey(item)
                    const isSelected = visibleSelectedPodKey === podKey
                    const isFocused = focusedRowIndex === index
                    const activatePodFromNameCell = (event: ReactMouseEvent<HTMLElement>) => {
                      const pin = event.detail >= 2
                      onPodActivate?.(item, { pin })
                      if (showInlineDetails) {
                        openPodDetails(item)
                      }
                    }
                    return (
                      <tr key={podKey} className={`${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focused' : ''}`}>
                        <td
                          className="pods-name-cell pods-cell"
                          title={item.name}
                          onClick={activatePodFromNameCell}
                        >
                          <button
                            type="button"
                            className={`pods-name-button ${isSelected ? 'active' : ''}`}
                            onClick={event => {
                              event.stopPropagation()
                              activatePodFromNameCell(event)
                            }}
                          >
                            {item.name}
                          </button>
                        </td>
                        <td className="pods-cell" title={item.namespace}>{item.namespace}</td>
                        <td className="pods-cell" title={item.cpu}>{item.cpu}</td>
                        <td className="pods-cell" title={item.memory}>{item.memory}</td>
                        <td className="pods-cell" title={item.controlledBy}>{item.controlledBy}</td>
                        <td>
                          <span
                            className={`pods-status-pill ${normalizeStatus(item.status)}`}
                            title={item.status}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="pods-cell">{getAgeLabel(item, nowUnix)}</td>
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
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className="pods-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {showInlineDetails && selectedPod && !detailsMaximized && (
          <button
            type="button"
            className="pods-detail-split-resizer"
            onMouseDown={handleDetailsResizeStart}
            aria-label="Resize pod details panel"
          />
        )}
        {showInlineDetails && selectedPod && (
          <aside
            className={`pods-detail-pane ${detailsMaximized ? 'pods-detail-pane-maximized' : ''}`}
            style={detailsMaximized ? undefined : { width: `${detailWidth}px`, minWidth: `${detailWidth}px` }}
          >
            <PodDetailPanel
              clusterFilename={clusterFilename}
              mode={detailsMaximized ? 'modal' : 'split'}
              activeDetailsTab={activeDetailsTab}
              onDetailsTabChange={setActiveDetailsTab}
              selectedPod={selectedPod}
              podDetail={podDetail}
              podDetailLoading={podDetailLoading}
              podDetailError={podDetailError}
              podLogs={podLogs}
              podLogsLoading={podLogsLoading}
              podLogsError={podLogsError}
              podLogsLoadingOlder={podLogsLoadingOlder}
              onLoadOlderLogs={loadOlderLogs}
              detailsMaximized={detailsMaximized}
              onToggleMaximize={() => setDetailsMaximized(current => !current)}
              onClose={closePodDetails}
            />
          </aside>
        )}
      </div>

      {showInlineDetails && selectedPod && detailsMaximized && (
        <div className="pods-detail-modal-overlay" onClick={() => setDetailsMaximized(false)} />
      )}
    </div>
  )
}
