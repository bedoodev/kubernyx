import { useEffect, useMemo, useState } from 'react'
import type { ClusterInfo } from '../../shared/types'
import { formatAgeFromUnix } from '../../shared/utils/formatting'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import { useClusterEvents } from './hooks/useClusterEvents'
import '../workloads/pods/PodsTable.css'
import '../config/ConfigView.css'

interface Props {
  cluster: ClusterInfo
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
}

type ColumnKey = 'type' | 'reason' | 'object' | 'namespace' | 'message' | 'count' | 'age'

type Column = {
  key: ColumnKey
  label: string
  width: string
}

const COLUMNS: Column[] = [
  { key: 'type', label: 'Type', width: '8%' },
  { key: 'reason', label: 'Reason', width: '12%' },
  { key: 'object', label: 'Object', width: '18%' },
  { key: 'namespace', label: 'Namespace', width: '12%' },
  { key: 'message', label: 'Message', width: '32%' },
  { key: 'count', label: 'Count', width: '8%' },
  { key: 'age', label: 'Age', width: '10%' },
]

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function EventsView({
  cluster,
  namespaces,
  selectedNamespaces,
  onNamespacesChange,
}: Props) {
  const { items, loading, error } = useClusterEvents(cluster.filename, selectedNamespaces)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'Warning' | 'Normal'>('all')
  const [pageSize, setPageSize] = useState<number>(50)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<ColumnKey>('age')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  const filteredItems = useMemo(() => {
    let result = items
    if (typeFilter !== 'all') {
      result = result.filter(item => item.type === typeFilter)
    }
    const query = search.trim().toLowerCase()
    if (query) {
      result = result.filter(item => (
        item.reason.toLowerCase().includes(query)
        || item.objectName.toLowerCase().includes(query)
        || item.objectKind.toLowerCase().includes(query)
        || item.message.toLowerCase().includes(query)
        || item.namespace.toLowerCase().includes(query)
      ))
    }
    return result
  }, [items, search, typeFilter])

  const sortedItems = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((left, right) => {
      switch (sortKey) {
        case 'type': return direction * left.type.localeCompare(right.type)
        case 'reason': return direction * left.reason.localeCompare(right.reason)
        case 'object': return direction * `${left.objectKind}/${left.objectName}`.localeCompare(`${right.objectKind}/${right.objectName}`)
        case 'namespace': return direction * left.namespace.localeCompare(right.namespace)
        case 'message': return direction * left.message.localeCompare(right.message)
        case 'count': return direction * (left.count - right.count)
        case 'age': return direction * (left.createdAtUnix - right.createdAtUnix)
        default: return 0
      }
    })
  }, [filteredItems, sortDir, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pagedItems = useMemo(
    () => sortedItems.slice(pageStart, pageStart + pageSize),
    [sortedItems, pageStart, pageSize],
  )

  useEffect(() => { setPage(1) }, [search, pageSize, typeFilter])
  useEffect(() => { setPage(current => Math.min(current, totalPages)) }, [totalPages])

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const rowCountLabel = loading ? '...' : String(sortedItems.length)

  return (
    <div className="config-view">
      <div className="config-view-header">
        <div className="config-view-title">
          <p>Select one or more namespaces to view cluster events.</p>
        </div>
        <NamespaceFilter
          className="config-namespace-filter"
          namespaces={namespaces}
          selected={selectedNamespaces}
          emptyMeansAll={false}
          onChange={onNamespacesChange}
        />
      </div>

      <div className="config-panel">
        <div className="pods-table-root">
          <div className="pods-content">
            <div className="pods-table-pane">
              <div className="pods-toolbar">
                <div className="pods-resource-count">
                  <strong>{rowCountLabel}</strong>
                </div>
                <select
                  className="pods-page-size"
                  value={typeFilter}
                  onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}
                  style={{ marginRight: '8px' }}
                >
                  <option value="all">All Types</option>
                  <option value="Warning">Warning</option>
                  <option value="Normal">Normal</option>
                </select>
                <input
                  className="pods-search"
                  placeholder="Search events..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>

              <div className="pods-table-wrap">
                <table className="pods-table" style={{ width: '100%', minWidth: '960px' }}>
                  <colgroup>
                    {COLUMNS.map(column => (
                      <col key={column.key} style={{ width: column.width }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {COLUMNS.map(column => (
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
                                <path d="M5 0.5L9 5.5H1L5 0.5Z" fill="currentColor" opacity={sortKey === column.key && sortDir === 'asc' ? 1 : 0.35} />
                                <path d="M5 13.5L1 8.5H9L5 13.5Z" fill="currentColor" opacity={sortKey === column.key && sortDir === 'desc' ? 1 : 0.35} />
                              </svg>
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {error ? (
                      <tr><td colSpan={COLUMNS.length} className="pods-empty-row error">{error}</td></tr>
                    ) : loading ? (
                      <tr><td colSpan={COLUMNS.length} className="pods-empty-row">Loading events...</td></tr>
                    ) : sortedItems.length === 0 ? (
                      <tr><td colSpan={COLUMNS.length} className="pods-empty-row">
                        {selectedNamespaces.length === 0 ? 'Select at least one namespace.' : 'No events found'}
                      </td></tr>
                    ) : (
                      pagedItems.map((item, index) => {
                        const typeClass = item.type === 'Warning' ? 'failed' : ''
                        return (
                          <tr key={`${item.namespace}-${item.objectKind}-${item.objectName}-${item.reason}-${index}`}>
                            <td className={`pods-cell pods-status-cell ${typeClass}`}>{item.type}</td>
                            <td className="pods-cell">{item.reason}</td>
                            <td className="pods-cell" title={`${item.objectKind}/${item.objectName}`}>
                              {item.objectKind}/{item.objectName}
                            </td>
                            <td className="pods-cell">{item.namespace}</td>
                            <td className="pods-cell" title={item.message}>{item.message}</td>
                            <td className="pods-cell">{item.count}</td>
                            <td className="pods-cell">
                              {item.createdAtUnix ? formatAgeFromUnix(item.createdAtUnix, nowUnix) : item.age}
                            </td>
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
                  <select className="pods-page-size" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                    {PAGE_SIZE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="pods-pagination-right">
                  <span>Page {page} / {totalPages}</span>
                  <button type="button" className="pods-page-btn" disabled={page <= 1} onClick={() => setPage(current => clamp(current - 1, 1, totalPages))}>Prev</button>
                  <button type="button" className="pods-page-btn" disabled={page >= totalPages} onClick={() => setPage(current => clamp(current + 1, 1, totalPages))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
