import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { PodResource } from '../../../shared/types'
import { formatAgeFromUnix } from '../../../shared/utils/formatting'
import { usePodsStream } from './hooks/usePodsStream'
import { usePodDetail } from './hooks/usePodDetail'
import PodDetailPanel from './components/PodDetailPanel'
import './PodsTable.css'

interface Props {
  clusterFilename: string
  selectedNamespaces: string[]
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
  const base = status.trim().split(' ')[0] || 'unknown'
  return base.toLowerCase()
}

function getAgeLabel(item: PodResource, nowUnix: number): string {
  if (item.createdAtUnix && item.createdAtUnix > 0) {
    return formatAgeFromUnix(item.createdAtUnix, nowUnix)
  }
  return item.age ?? '-'
}

function getPodKey(item: PodResource): string {
  return `${item.namespace}/${item.name}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function PodsTable({ clusterFilename, selectedNamespaces }: Props) {
  const { items, loading, error } = usePodsStream(clusterFilename, selectedNamespaces)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(STATUS_ALL)
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [columnWidths, setColumnWidths] = useState<ColumnWidthState>(() => buildInitialColumnWidths())
  const [isColumnResizing, setIsColumnResizing] = useState(false)
  const [isDetailsResizing, setIsDetailsResizing] = useState(false)
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const [tableViewportWidth, setTableViewportWidth] = useState(0)
  const [selectedPodKey, setSelectedPodKey] = useState<string | null>(null)
  const [detailWidth, setDetailWidth] = useState(560)
  const [detailsMaximized, setDetailsMaximized] = useState(false)

  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const splitWrapRef = useRef<HTMLDivElement | null>(null)
  const columnResizeStateRef = useRef<{
    key: PodColumnKey
    startX: number
    startWidth: number
    minWidth: number
    maxWidth: number
  } | null>(null)
  const detailsResizeStateRef = useRef<{
    startX: number
    startWidth: number
    minWidth: number
    maxWidth: number
  } | null>(null)

  const selectedPod = useMemo(
    () => (selectedPodKey ? (items.find(item => getPodKey(item) === selectedPodKey) ?? null) : null),
    [items, selectedPodKey],
  )

  const { podDetail, podDetailLoading, podDetailError } = usePodDetail(clusterFilename, selectedPod)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
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

  useEffect(() => {
    if (!isColumnResizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = columnResizeStateRef.current
      if (!resizeState) {
        return
      }
      const delta = event.clientX - resizeState.startX
      setColumnWidths(current => {
        const nextWidth = Math.min(
          resizeState.maxWidth,
          Math.max(resizeState.minWidth, resizeState.startWidth + delta),
        )
        return { ...current, [resizeState.key]: nextWidth }
      })
    }

    const stopResize = () => {
      columnResizeStateRef.current = null
      setIsColumnResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [isColumnResizing])

  useEffect(() => {
    if (!isDetailsResizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = detailsResizeStateRef.current
      if (!resizeState) {
        return
      }
      const delta = event.clientX - resizeState.startX
      const nextWidth = clamp(resizeState.startWidth - delta, resizeState.minWidth, resizeState.maxWidth)
      setDetailWidth(nextWidth)
    }

    const stopResize = () => {
      detailsResizeStateRef.current = null
      setIsDetailsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [isDetailsResizing])

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
      return (
        item.name.toLowerCase().includes(query)
        || item.namespace.toLowerCase().includes(query)
        || item.controlledBy.toLowerCase().includes(query)
        || item.status.toLowerCase().includes(query)
      )
    })
  }, [items, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pagedItems = useMemo(
    () => filteredItems.slice(pageStart, pageStart + pageSize),
    [filteredItems, pageSize, pageStart],
  )

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, pageSize])

  useEffect(() => {
    setPage(current => Math.min(current, totalPages))
  }, [totalPages])

  const rowCountLabel = loading ? '...' : String(filteredItems.length)

  const handleColumnResizeStart = (
    event: ReactMouseEvent<HTMLButtonElement>,
    key: PodColumnKey,
    minWidth: number,
    maxWidth: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    columnResizeStateRef.current = {
      key,
      startX: event.clientX,
      startWidth: columnWidths[key],
      minWidth,
      maxWidth,
    }
    setIsColumnResizing(true)
  }

  const handleDetailsResizeStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const splitWrap = splitWrapRef.current
    if (!splitWrap) {
      return
    }

    const totalWidth = splitWrap.clientWidth
    const maxWidth = Math.max(DETAIL_MIN_WIDTH, totalWidth - DETAIL_LEFT_MIN_WIDTH)

    detailsResizeStateRef.current = {
      startX: event.clientX,
      startWidth: detailWidth,
      minWidth: DETAIL_MIN_WIDTH,
      maxWidth,
    }
    setIsDetailsResizing(true)
  }

  const openPodDetails = (pod: PodResource) => {
    const podKey = getPodKey(pod)
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
    setDetailsMaximized(false)
  }

  return (
    <div className={`pods-table-root ${selectedPod ? 'with-details' : ''} ${(isColumnResizing || isDetailsResizing) ? 'resizing' : ''}`}>
      <div className={`pods-content ${selectedPod ? 'with-details' : ''}`} ref={splitWrapRef}>
        <div className="pods-table-pane">
          <div className="pods-toolbar">
            <div className="pods-resource-count">
              <span>Resources</span>
              <strong>{rowCountLabel}</strong>
            </div>
            <input
              className="pods-search"
              placeholder="Search by name, namespace, owner or status"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <select
              className="pods-status-filter"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
            >
              {statusOptions.map(option => (
                <option key={option} value={option}>
                  {option === STATUS_ALL ? 'All' : option}
                </option>
              ))}
            </select>
          </div>

          <div className="pods-table-wrap" ref={tableWrapRef}>
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
                        <span className="pods-th-label">{column.label}</span>
                        {index < POD_COLUMNS.length - 1 && (
                          <button
                            type="button"
                            className="pods-col-resizer"
                            onMouseDown={event => handleColumnResizeStart(event, column.key, column.minWidth, column.maxWidth)}
                            aria-label={`Resize ${column.label} column`}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={7} className="pods-empty-row error">{error}</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={7} className="pods-empty-row">Loading pods...</td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="pods-empty-row">No pods found</td>
                  </tr>
                ) : (
                  pagedItems.map(item => {
                    const podKey = getPodKey(item)
                    const isSelected = selectedPodKey === podKey
                    return (
                      <tr key={podKey} className={isSelected ? 'selected' : ''}>
                        <td className="pods-name-cell pods-cell" title={item.name}>
                          <button
                            type="button"
                            className={`pods-name-button ${isSelected ? 'active' : ''}`}
                            onClick={() => openPodDetails(item)}
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

        {selectedPod && !detailsMaximized && (
          <>
            <button
              type="button"
              className="pods-detail-split-resizer"
              onMouseDown={handleDetailsResizeStart}
              aria-label="Resize pod details panel"
            />
            <aside className="pods-detail-pane" style={{ width: `${detailWidth}px`, minWidth: `${detailWidth}px` }}>
              <PodDetailPanel
                mode="split"
                selectedPod={selectedPod}
                podDetail={podDetail}
                podDetailLoading={podDetailLoading}
                podDetailError={podDetailError}
                nowUnix={nowUnix}
                detailsMaximized={detailsMaximized}
                onToggleMaximize={() => setDetailsMaximized(current => !current)}
                onClose={closePodDetails}
              />
            </aside>
          </>
        )}
      </div>

      {selectedPod && detailsMaximized && (
        <div className="pods-detail-modal-overlay" onClick={() => setDetailsMaximized(false)}>
          <div className="pods-detail-modal" onClick={event => event.stopPropagation()}>
            <PodDetailPanel
              mode="modal"
              selectedPod={selectedPod}
              podDetail={podDetail}
              podDetailLoading={podDetailLoading}
              podDetailError={podDetailError}
              nowUnix={nowUnix}
              detailsMaximized={detailsMaximized}
              onToggleMaximize={() => setDetailsMaximized(current => !current)}
              onClose={closePodDetails}
            />
          </div>
        </div>
      )}
    </div>
  )
}
