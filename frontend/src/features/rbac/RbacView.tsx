import { useEffect, useMemo, useState } from 'react'
import type { ClusterInfo, RbacResource, RbacTabId } from '../../shared/types'
import { useScopedSearch } from '../../shared/hooks/useScopedSearch'
import { formatAgeFromUnix } from '../../shared/utils/formatting'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import { isClusterScopedRbacTab, useRbacResources } from './hooks/useRbacResources'
import '../workloads/pods/PodsTable.css'
import '../config/ConfigView.css'
import './RbacView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: RbacTabId
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
}

type ColumnKey = 'name' | 'namespace' | 'roleRef' | 'subjects' | 'rules' | 'apiGroups' | 'resources' | 'verbs' | 'age'

interface Column {
  key: ColumnKey
  label: string
  width: string
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

const ROLE_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '22%' },
  { key: 'namespace', label: 'Namespace', width: '14%' },
  { key: 'rules', label: 'Rules', width: '8%' },
  { key: 'resources', label: 'Resources', width: '24%' },
  { key: 'verbs', label: 'Verbs', width: '20%' },
  { key: 'age', label: 'Age', width: '12%' },
]

const CLUSTER_ROLE_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '26%' },
  { key: 'rules', label: 'Rules', width: '8%' },
  { key: 'apiGroups', label: 'API Groups', width: '18%' },
  { key: 'resources', label: 'Resources', width: '26%' },
  { key: 'verbs', label: 'Verbs', width: '14%' },
  { key: 'age', label: 'Age', width: '8%' },
]

const BINDING_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '22%' },
  { key: 'namespace', label: 'Namespace', width: '14%' },
  { key: 'roleRef', label: 'Role Ref', width: '20%' },
  { key: 'subjects', label: 'Subjects', width: '32%' },
  { key: 'age', label: 'Age', width: '12%' },
]

const CLUSTER_BINDING_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: '28%' },
  { key: 'roleRef', label: 'Role Ref', width: '22%' },
  { key: 'subjects', label: 'Subjects', width: '38%' },
  { key: 'age', label: 'Age', width: '12%' },
]

function getColumns(activeTab: RbacTabId): Column[] {
  switch (activeTab) {
    case 'roles': return ROLE_COLUMNS
    case 'cluster-roles': return CLUSTER_ROLE_COLUMNS
    case 'cluster-role-bindings': return CLUSTER_BINDING_COLUMNS
    case 'role-bindings':
    default: return BINDING_COLUMNS
  }
}

function getEmptyLabel(activeTab: RbacTabId): string {
  switch (activeTab) {
    case 'roles': return 'roles'
    case 'role-bindings': return 'role bindings'
    case 'cluster-roles': return 'cluster roles'
    case 'cluster-role-bindings': return 'cluster role bindings'
  }
}

function getCellValue(item: RbacResource, key: ColumnKey): string | number {
  switch (key) {
    case 'name': return item.name
    case 'namespace': return item.namespace || '-'
    case 'roleRef': return item.roleRef || '-'
    case 'subjects': return item.subjects || '-'
    case 'rules': return item.rules
    case 'apiGroups': return item.apiGroups || '-'
    case 'resources': return item.resources || '-'
    case 'verbs': return item.verbs || '-'
    case 'age': return item.createdAtUnix
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function RbacView({
  cluster,
  activeTab,
  namespaces,
  selectedNamespaces,
  onNamespacesChange,
}: Props) {
  const clusterScoped = isClusterScopedRbacTab(activeTab)
  const { items, loading, error } = useRbacResources(cluster.filename, activeTab, selectedNamespaces)
  const [search, setSearch] = useScopedSearch(`rbac:${cluster.filename}:${activeTab}`)
  const [pageSize, setPageSize] = useState<number>(50)
  const [page, setPage] = useState<number>(1)
  const [sortKey, setSortKey] = useState<ColumnKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000))
  const columns = getColumns(activeTab)
  const emptyLabel = getEmptyLabel(activeTab)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return items
    }
    return items.filter(item => (
      item.name.toLowerCase().includes(query)
      || item.namespace.toLowerCase().includes(query)
      || item.roleRef.toLowerCase().includes(query)
      || item.subjects.toLowerCase().includes(query)
      || item.apiGroups.toLowerCase().includes(query)
      || item.resources.toLowerCase().includes(query)
      || item.verbs.toLowerCase().includes(query)
    ))
  }, [items, search])

  const sortedItems = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filteredItems].sort((left, right) => {
      const leftValue = getCellValue(left, sortKey)
      const rightValue = getCellValue(right, sortKey)
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return direction * (leftValue - rightValue)
      }
      return direction * String(leftValue).localeCompare(String(rightValue))
    })
  }, [filteredItems, sortDir, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pagedItems = useMemo(
    () => sortedItems.slice(pageStart, pageStart + pageSize),
    [sortedItems, pageStart, pageSize],
  )

  useEffect(() => { setPage(1) }, [search, pageSize, activeTab, selectedNamespaces])
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
  const emptyMessage = !clusterScoped && selectedNamespaces.length === 0
    ? 'Select at least one namespace.'
    : `No ${emptyLabel} found`

  return (
    <div className="config-view rbac-view">
      <div className="config-view-header">
        <div className="config-view-title">
          <p>{clusterScoped ? 'Cluster-scoped RBAC resources.' : 'Select one or more namespaces to list RBAC resources.'}</p>
        </div>
        {!clusterScoped && (
          <NamespaceFilter
            className="config-namespace-filter"
            namespaces={namespaces}
            selected={selectedNamespaces}
            emptyMeansAll={false}
            onChange={onNamespacesChange}
          />
        )}
      </div>

      <div className="config-panel">
        <div className="pods-table-root">
          <div className="pods-content">
            <div className="pods-table-pane">
              <div className="pods-toolbar">
                <div className="pods-resource-count">
                  <strong>{rowCountLabel}</strong>
                  <span>visible</span>
                </div>
                <input
                  className="pods-search"
                  placeholder="Search RBAC resources..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>

              <div className="pods-table-wrap">
                <table className="pods-table rbac-table" style={{ width: '100%', minWidth: clusterScoped ? '960px' : '1040px' }}>
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
                      <tr><td colSpan={columns.length} className="pods-empty-row error">{error}</td></tr>
                    ) : loading ? (
                      <tr><td colSpan={columns.length} className="pods-empty-row">Loading RBAC resources...</td></tr>
                    ) : sortedItems.length === 0 ? (
                      <tr><td colSpan={columns.length} className="pods-empty-row">{emptyMessage}</td></tr>
                    ) : (
                      pagedItems.map(item => (
                        <tr key={`${item.kind}:${item.namespace}:${item.name}`}>
                          {columns.map(column => {
                            const value = column.key === 'age'
                              ? (item.createdAtUnix ? formatAgeFromUnix(item.createdAtUnix, nowUnix) : item.age)
                              : getCellValue(item, column.key)
                            return (
                              <td
                                key={column.key}
                                className={`pods-cell ${column.key === 'resources' || column.key === 'verbs' || column.key === 'subjects' ? 'rbac-wrap-cell' : ''}`}
                                title={String(value)}
                              >
                                {value}
                              </td>
                            )
                          })}
                        </tr>
                      ))
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
