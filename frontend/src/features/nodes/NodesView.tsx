import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { ClusterInfo, NodeResource } from '../../shared/types'
import { formatAgeFromUnix } from '../../shared/utils/formatting'
import { useNodeResources } from './hooks/useNodeResources'
import '../workloads/pods/PodsTable.css'

interface Props {
  cluster: ClusterInfo
  activeNodeKey: string | null
  onNodeActivate: (node: NodeResource, options: { pin: boolean }) => void
}

type ColumnKey = 'name' | 'role' | 'status' | 'version' | 'cpu' | 'memory' | 'pods' | 'age'

type Column = {
  key: ColumnKey
  label: string
  width: string
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '22%' },
  { key: 'role', label: 'Role', width: '10%' },
  { key: 'status', label: 'Status', width: '10%' },
  { key: 'version', label: 'Version', width: '14%' },
  { key: 'cpu', label: 'CPU', width: '12%' },
  { key: 'memory', label: 'Memory', width: '12%' },
  { key: 'pods', label: 'Pods', width: '10%' },
  { key: 'age', label: 'Age', width: '10%' },
]

const PAGE_SIZE_OPTIONS = [20, 50] as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function NodesView({ cluster, activeNodeKey, onNodeActivate }: Props) {
  const { items, loading, error } = useNodeResources(cluster.filename)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<ColumnKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter(item => (
      item.name.toLowerCase().includes(query)
      || item.role.toLowerCase().includes(query)
      || item.status.toLowerCase().includes(query)
      || item.version.toLowerCase().includes(query)
    ))
  }, [items, search])

  const sortedItems = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((left, right) => {
      switch (sortKey) {
        case 'name': return direction * left.name.localeCompare(right.name)
        case 'role': return direction * left.role.localeCompare(right.role)
        case 'status': return direction * left.status.localeCompare(right.status)
        case 'version': return direction * left.version.localeCompare(right.version)
        case 'cpu': return direction * left.cpu.localeCompare(right.cpu)
        case 'memory': return direction * left.memory.localeCompare(right.memory)
        case 'pods': return direction * left.pods.localeCompare(right.pods)
        case 'age': return direction * ((left.createdAtUnix ?? 0) - (right.createdAtUnix ?? 0))
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

  useEffect(() => { setPage(1) }, [search, pageSize])
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
          <p>Cluster nodes (cluster-scoped, no namespace filter).</p>
        </div>
      </div>

      <div className="config-panel">
        <div className="pods-table-root">
          <div className="pods-content">
            <div className="pods-table-pane">
              <div className="pods-toolbar">
                <div className="pods-resource-count">
                  <strong>{rowCountLabel}</strong>
                </div>
                <input
                  className="pods-search"
                  placeholder="Search nodes..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>

              <div className="pods-table-wrap">
                <table className="pods-table" style={{ width: '100%', minWidth: '860px' }}>
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
                      <tr><td colSpan={COLUMNS.length} className="pods-empty-row">Loading nodes...</td></tr>
                    ) : sortedItems.length === 0 ? (
                      <tr><td colSpan={COLUMNS.length} className="pods-empty-row">No nodes found</td></tr>
                    ) : (
                      pagedItems.map(item => {
                        const isSelected = activeNodeKey === item.name
                        const statusClass = item.status === 'Ready' ? 'running' : item.status === 'NotReady' ? 'failed' : 'pending'
                        const activateFromNameCell = (event: ReactMouseEvent<HTMLElement>) => {
                          const pin = event.detail >= 2
                          onNodeActivate(item, { pin })
                        }
                        return (
                          <tr key={item.name} className={isSelected ? 'selected' : ''}>
                            <td className="pods-name-cell pods-cell" title={item.name} onClick={activateFromNameCell}>
                              <button
                                type="button"
                                className={`pods-name-button ${isSelected ? 'active' : ''}`}
                                onClick={event => { event.stopPropagation(); activateFromNameCell(event) }}
                              >
                                {item.name}
                              </button>
                            </td>
                            <td className="pods-cell">{item.role}</td>
                            <td className={`pods-cell pods-status-cell ${statusClass}`}>{item.status}</td>
                            <td className="pods-cell">{item.version}</td>
                            <td className="pods-cell">{item.cpu}</td>
                            <td className="pods-cell">{item.memory}</td>
                            <td className="pods-cell">{item.pods}</td>
                            <td className="pods-cell">
                              {item.createdAtUnix ? formatAgeFromUnix(item.createdAtUnix, nowUnix) : (item.age ?? '-')}
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
