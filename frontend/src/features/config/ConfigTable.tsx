import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { ConfigResource } from '../../shared/types'
import { formatAgeFromUnix } from '../../shared/utils/formatting'
import { configPluralLabel, type ImplementedConfigTabId } from './configKinds'
import { useConfigResources } from './hooks/useConfigResources'
import '../workloads/pods/PodsTable.css'

interface Props {
  clusterFilename: string
  selectedNamespaces: string[]
  configTab: ImplementedConfigTabId
  externalSelectedConfigKey?: string | null
  onConfigActivate?: (resource: ConfigResource, options: { pin: boolean }) => void
}

type ConfigColumnKey = 'name' | 'namespace' | 'keys' | 'type' | 'age'

type ConfigColumn = {
  key: ConfigColumnKey
  label: string
  width: string
}

const PAGE_SIZE_OPTIONS = [20, 50] as const

const CONFIG_MAP_COLUMNS: ConfigColumn[] = [
  { key: 'name', label: 'Name', width: '44%' },
  { key: 'namespace', label: 'Namespace', width: '28%' },
  { key: 'keys', label: 'Keys', width: '14%' },
  { key: 'age', label: 'Age', width: '14%' },
]

const SECRET_COLUMNS: ConfigColumn[] = [
  { key: 'name', label: 'Name', width: '36%' },
  { key: 'namespace', label: 'Namespace', width: '24%' },
  { key: 'keys', label: 'Keys', width: '10%' },
  { key: 'type', label: 'Type', width: '18%' },
  { key: 'age', label: 'Age', width: '12%' },
]

const CONFIG_MAP_MIN_TABLE_WIDTH = 760
const SECRET_MIN_TABLE_WIDTH = 860

function getResourceKey(item: ConfigResource): string {
  return `${item.namespace}/${item.name}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function ConfigTable({
  clusterFilename,
  selectedNamespaces,
  configTab,
  externalSelectedConfigKey = null,
  onConfigActivate,
}: Props) {
  const { items, loading, error } = useConfigResources(clusterFilename, selectedNamespaces, configTab)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<ConfigColumnKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  const columns = configTab === 'secrets' ? SECRET_COLUMNS : CONFIG_MAP_COLUMNS
  const tableMinWidth = configTab === 'secrets' ? SECRET_MIN_TABLE_WIDTH : CONFIG_MAP_MIN_TABLE_WIDTH
  const pluralLabel = configPluralLabel(configTab)

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return items
    }
    return items.filter(item => (
      item.name.toLowerCase().includes(query)
      || item.namespace.toLowerCase().includes(query)
      || String(item.keys).includes(query)
      || item.type.toLowerCase().includes(query)
      || Object.entries(item.labels ?? {}).some(([key, value]) => key.toLowerCase().includes(query) || value.toLowerCase().includes(query))
      || Object.entries(item.annotations ?? {}).some(([key, value]) => key.toLowerCase().includes(query) || value.toLowerCase().includes(query))
    ))
  }, [items, search])

  const sortedItems = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((left, right) => {
      switch (sortKey) {
        case 'name':
          return direction * left.name.localeCompare(right.name)
        case 'namespace':
          return direction * left.namespace.localeCompare(right.namespace)
        case 'keys':
          return direction * (left.keys - right.keys)
        case 'type':
          return direction * left.type.localeCompare(right.type)
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
  }, [search, pageSize, configTab])

  useEffect(() => {
    setPage(current => Math.min(current, totalPages))
  }, [totalPages])

  useEffect(() => {
    setFocusedRowIndex(-1)
  }, [page, search, sortKey, sortDir, configTab])

  const handleSort = (key: ConfigColumnKey) => {
    if (sortKey === key) {
      setSortDir(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const rowCountLabel = loading ? '...' : String(sortedItems.length)
  const emptyStateMessage = selectedNamespaces.length === 0
    ? 'Select at least one namespace.'
    : `No ${pluralLabel.toLowerCase()} found`

  return (
    <div className="pods-table-root">
      <div className="pods-content">
        <div className="pods-table-pane">
          <div className="pods-toolbar">
            <div className="pods-resource-count">
              <strong>{rowCountLabel}</strong>
            </div>
            <input
              className="pods-search"
              placeholder="Search by name, namespace, key count or type"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <div className="pods-table-wrap">
            <table className="pods-table" style={{ width: '100%', minWidth: `${tableMinWidth}px` }}>
              <colgroup>
                {columns.map(column => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map(column => (
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
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={columns.length} className="pods-empty-row error">{error}</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={columns.length} className="pods-empty-row">Loading {pluralLabel.toLowerCase()}...</td>
                  </tr>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="pods-empty-row">{emptyStateMessage}</td>
                  </tr>
                ) : (
                  pagedItems.map((item, index) => {
                    const key = getResourceKey(item)
                    const isSelected = externalSelectedConfigKey === key
                    const isFocused = focusedRowIndex === index
                    const activateFromNameCell = (event: ReactMouseEvent<HTMLElement>) => {
                      const pin = event.detail >= 2
                      onConfigActivate?.(item, { pin })
                    }
                    return (
                      <tr key={key} className={`${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focused' : ''}`}>
                        {columns.map(column => {
                          switch (column.key) {
                            case 'name':
                              return (
                                <td
                                  key={column.key}
                                  className="pods-name-cell pods-cell"
                                  title={item.name}
                                  onClick={activateFromNameCell}
                                >
                                  <button
                                    type="button"
                                    className={`pods-name-button ${isSelected ? 'active' : ''}`}
                                    onClick={event => {
                                      event.stopPropagation()
                                      activateFromNameCell(event)
                                    }}
                                  >
                                    {item.name}
                                  </button>
                                </td>
                              )
                            case 'namespace':
                              return <td key={column.key} className="pods-cell" title={item.namespace}>{item.namespace}</td>
                            case 'keys':
                              return <td key={column.key} className="pods-cell" title={String(item.keys)}>{item.keys}</td>
                            case 'type':
                              return <td key={column.key} className="pods-cell" title={item.type}>{item.type}</td>
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
