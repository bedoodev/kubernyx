import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { BatchDeleteResult, DeploymentResource, NetworkTabId } from '../../shared/types'
import { DeleteResourcesBatch } from '../../shared/api'
import Modal from '../../shared/components/Modal'
import { formatAgeFromUnix } from '../../shared/utils/formatting'
import { toBatchDeleteResult } from '../../shared/utils/normalization'
import { networkPluralLabel, networkSingularLabel, toNetworkAPIKind } from './networkKinds'
import { useNetworkResources } from './hooks/useNetworkResources'
import { createResourceSearchMatcher } from '../workloads/shared/workloadSearch'
import '../workloads/pods/PodsTable.css'

interface Props {
  clusterFilename: string
  selectedNamespaces: string[]
  networkTab: NetworkTabId
  externalSelectedKey?: string | null
  onResourceActivate?: (resource: DeploymentResource, options: { pin: boolean }) => void
  search: string
  onSearchChange: (value: string) => void
}

type ColumnKey = 'name' | 'namespace' | 'ports' | 'type' | 'selector' | 'age'

type Column = {
  key: ColumnKey
  label: string
  width: string
}

const PAGE_SIZE_OPTIONS = [20, 50] as const
const SELECT_COLUMN_WIDTH = 52

const SERVICE_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '30%' },
  { key: 'namespace', label: 'Namespace', width: '20%' },
  { key: 'ports', label: 'Ports', width: '22%' },
  { key: 'type', label: 'Type', width: '14%' },
  { key: 'age', label: 'Age', width: '14%' },
]

const INGRESS_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '28%' },
  { key: 'namespace', label: 'Namespace', width: '20%' },
  { key: 'ports', label: 'Hosts', width: '24%' },
  { key: 'type', label: 'Class', width: '14%' },
  { key: 'age', label: 'Age', width: '14%' },
]

function getResourceKey(item: Pick<DeploymentResource, 'namespace' | 'name'>): string {
  return `${item.namespace}/${item.name}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function NetworkTable({
  clusterFilename,
  selectedNamespaces,
  networkTab,
  externalSelectedKey = null,
  onResourceActivate,
  search,
  onSearchChange,
}: Props) {
  const { items, loading, error } = useNetworkResources(clusterFilename, selectedNamespaces, networkTab)
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<ColumnKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteResult, setDeleteResult] = useState<BatchDeleteResult | null>(null)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  const columns = networkTab === 'ingress' ? INGRESS_COLUMNS : SERVICE_COLUMNS
  const pluralLabel = networkPluralLabel(networkTab)
  const resourceSearchMatcher = useMemo(() => createResourceSearchMatcher(search), [search])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter(item => (
      item.name.toLowerCase().includes(query)
      || item.namespace.toLowerCase().includes(query)
      || (item.pods ?? '').toLowerCase().includes(query)
      || (item.status ?? '').toLowerCase().includes(query)
      || resourceSearchMatcher(item)
    ))
  }, [items, resourceSearchMatcher, search])

  const sortedItems = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((left, right) => {
      switch (sortKey) {
        case 'name': return direction * left.name.localeCompare(right.name)
        case 'namespace': return direction * left.namespace.localeCompare(right.namespace)
        case 'ports': return direction * (left.pods ?? '').localeCompare(right.pods ?? '')
        case 'type': return direction * (left.status ?? '').localeCompare(right.status ?? '')
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

  useEffect(() => { setPage(1) }, [search, pageSize, networkTab])
  useEffect(() => { setPage(current => Math.min(current, totalPages)) }, [totalPages])
  useEffect(() => { setSelectedKeys([]) }, [clusterFilename, networkTab, search, selectedNamespaces])
  useEffect(() => {
    const validKeys = new Set(items.map(getResourceKey))
    setSelectedKeys(current => current.filter(key => validKeys.has(key)))
  }, [items])

  const handleSort = (key: ColumnKey) => {
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
  const selectedCount = selectedKeys.length
  const visibleKeys = pagedItems.map(getResourceKey)
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every(key => selectedKeys.includes(key))
  const selectedResources = sortedItems.filter(item => selectedKeys.includes(getResourceKey(item)))
  const resourceLabel = networkSingularLabel(networkTab)

  const toggleRowSelection = (key: string) => {
    setSelectedKeys(current => (
      current.includes(key)
        ? current.filter(item => item !== key)
        : [...current, key]
    ))
  }

  const toggleVisibleSelection = () => {
    setSelectedKeys(current => {
      if (allVisibleSelected) {
        const visibleSet = new Set(visibleKeys)
        return current.filter(key => !visibleSet.has(key))
      }
      const next = new Set(current)
      for (const key of visibleKeys) {
        next.add(key)
      }
      return Array.from(next)
    })
  }

  const handleDeleteSelected = async () => {
    if (selectedResources.length === 0 || deletePending) {
      return
    }

    setDeletePending(true)
    setDeleteError(null)
    try {
      const response = await DeleteResourcesBatch(
        clusterFilename,
        toNetworkAPIKind(networkTab),
        selectedResources.map(item => ({
          namespace: item.namespace,
          name: item.name,
        })),
      )
      const result = toBatchDeleteResult(response)
      setDeleteResult(result)
      setSelectedKeys(current => {
        const failedKeys = new Set(result.failed.map(item => getResourceKey(item)))
        return current.filter(key => failedKeys.has(key))
      })
      setDeleteConfirmOpen(false)
    } catch (errorValue: unknown) {
      setDeleteError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className="pods-table-root">
      <div className="pods-content">
        <div className="pods-table-pane">
          <div className="pods-toolbar">
            <div className="pods-toolbar-meta">
              <div className="pods-resource-count" aria-label={`${rowCountLabel} visible ${pluralLabel.toLowerCase()}`}>
                <strong>{rowCountLabel}</strong>
                <span>visible</span>
              </div>
              {selectedCount > 0 && (
                <div className="pods-bulk-actions">
                  <span className="pods-bulk-count">
                    <strong>{selectedCount}</strong>
                    <span>selected</span>
                  </span>
                  <button type="button" className="pods-bulk-btn" onClick={toggleVisibleSelection}>
                    {allVisibleSelected ? 'Clear visible' : 'Select visible'}
                  </button>
                  <button type="button" className="pods-bulk-btn danger" onClick={() => setDeleteConfirmOpen(true)}>
                    Delete selected
                  </button>
                </div>
              )}
            </div>
            <input
              className="pods-search"
              placeholder={`Search ${pluralLabel.toLowerCase()}, labels or annotations...`}
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="pods-table-wrap">
            <table className="pods-table" style={{ width: '100%', minWidth: `${SELECT_COLUMN_WIDTH + 760}px` }}>
              <colgroup>
                <col style={{ width: `${SELECT_COLUMN_WIDTH}px` }} />
                {columns.map(column => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="pods-select-col">
                    <div className="pods-th-content">
                      <input
                        type="checkbox"
                        className="pods-row-checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Select visible rows"
                      />
                    </div>
                  </th>
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
                  <tr><td colSpan={columns.length + 1} className="pods-empty-row error">{error}</td></tr>
                ) : loading ? (
                  <tr><td colSpan={columns.length + 1} className="pods-empty-row">Loading {pluralLabel.toLowerCase()}...</td></tr>
                ) : sortedItems.length === 0 ? (
                  <tr><td colSpan={columns.length + 1} className="pods-empty-row">{emptyStateMessage}</td></tr>
                ) : (
                  pagedItems.map(item => {
                    const key = getResourceKey(item)
                    const isSelected = externalSelectedKey === key
                    const isChecked = selectedKeys.includes(key)
                    const activateFromNameCell = (event: ReactMouseEvent<HTMLElement>) => {
                      const pin = event.detail >= 2
                      onResourceActivate?.(item, { pin })
                    }
                    return (
                      <tr key={key} className={isSelected ? 'selected' : ''}>
                        <td className="pods-cell pods-select-col">
                          <input
                            type="checkbox"
                            className="pods-row-checkbox"
                            checked={isChecked}
                            onChange={() => toggleRowSelection(key)}
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                        <td className="pods-name-cell pods-cell" title={item.name} onClick={activateFromNameCell}>
                          <button
                            type="button"
                            className={`pods-name-button ${isSelected ? 'active' : ''}`}
                            onClick={event => { event.stopPropagation(); activateFromNameCell(event) }}
                          >
                            {item.name}
                          </button>
                        </td>
                        <td className="pods-cell" title={item.namespace}>{item.namespace}</td>
                        <td className="pods-cell" title={item.pods}>{item.pods}</td>
                        <td className="pods-cell" title={item.status}>{item.status}</td>
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

      {deleteConfirmOpen && (
        <Modal title={`Delete ${selectedCount} ${resourceLabel}${selectedCount === 1 ? '' : 's'}`} onClose={() => setDeleteConfirmOpen(false)} variant="confirmation" tone="danger">
          <p>Delete {selectedCount} selected {resourceLabel.toLowerCase()}{selectedCount === 1 ? '' : 's'}?</p>
          {deleteError && (
            <div className="pods-detail-alert error">{deleteError}</div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={() => void handleDeleteSelected()} disabled={deletePending}>
              {deletePending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {deleteResult && (
        <Modal title="Bulk Delete Result" onClose={() => setDeleteResult(null)}>
          <p>Deleted {deleteResult.deleted.length} {resourceLabel.toLowerCase()}{deleteResult.deleted.length === 1 ? '' : 's'}.</p>
          {deleteResult.failed.length > 0 && (
            <div className="pods-bulk-result">
              {deleteResult.failed.map(item => (
                <div key={getResourceKey(item)} className="pods-bulk-result-item">
                  <strong>{item.namespace}/{item.name}</strong>
                  <span>{item.error}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
