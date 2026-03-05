import { useEffect, useMemo, useState } from 'react'
import type { ConfigDetail, ConfigResource, ConfigTabId } from '../../../shared/types'
import { DeleteWorkloadResource, UpdateWorkloadManifest } from '../../../shared/api'
import YamlEditor from '../../../shared/components/YamlEditor'
import { isLongMetadataValue, renderMetadataValue, tryFormatLongJSONValue } from '../../workloads/shared/detailHelpers'
import { configSingularLabel, isImplementedConfigTab, toConfigAPIKind } from '../configKinds'
import '../../workloads/pods/PodsTable.css'

export type ConfigDetailsTabId = 'overview' | 'yaml'

interface Props {
  clusterFilename: string
  configTab: ConfigTabId
  mode: 'split' | 'modal'
  activeDetailsTab: ConfigDetailsTabId
  onDetailsTabChange: (tab: ConfigDetailsTabId) => void
  selectedResource: ConfigResource
  configDetail: ConfigDetail | null
  configDetailLoading: boolean
  configDetailError: string | null
  detailsMaximized: boolean
  showMaximizeButton?: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

const DETAIL_TABS: Array<{ id: ConfigDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
]

function mapEntries(value: Record<string, string>): Array<[string, string]> {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
}

export default function ConfigDetailPanel({
  clusterFilename,
  configTab,
  mode,
  activeDetailsTab,
  onDetailsTabChange,
  selectedResource,
  configDetail,
  configDetailLoading,
  configDetailError,
  detailsMaximized,
  showMaximizeButton = true,
  onToggleMaximize,
  onClose,
}: Props) {
  const [expandedMetadataValues, setExpandedMetadataValues] = useState<Record<string, boolean>>({})
  const [yamlValue, setYamlValue] = useState('-')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSuccess, setYamlSuccess] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const resourceLabel = configSingularLabel(configTab)
  const configKey = `${configTab}:${selectedResource.namespace}/${selectedResource.name}`

  useEffect(() => {
    setYamlDirty(false)
    setYamlError(null)
    setYamlSuccess(null)
    setYamlSaving(false)
    setDeletePending(false)
    setDeleteError(null)
    setExpandedMetadataValues({})
  }, [configKey])

  useEffect(() => {
    if (!yamlDirty) {
      setYamlValue(configDetail?.manifest ?? '-')
    }
  }, [configDetail?.manifest, yamlDirty])

  const labels = useMemo(() => mapEntries(configDetail?.labels ?? {}), [configDetail?.labels])
  const annotations = useMemo(() => mapEntries(configDetail?.annotations ?? {}), [configDetail?.annotations])
  const dataEntries = useMemo(() => mapEntries(configDetail?.data ?? {}), [configDetail?.data])
  const events = configDetail?.events ?? []

  const toggleMetadataValueExpand = (key: string) => {
    setExpandedMetadataValues(current => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const renderMapSection = (title: string, items: Array<[string, string]>, sectionKey: string) => (
    <section className="pods-meta-card">
      <header className="pods-meta-card-header">
        <div className="pods-meta-title">
          <span>{title}</span>
        </div>
        <span className="pods-meta-count">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="pods-meta-empty">No {title.toLowerCase()}</p>
      ) : (
        <div className="pods-meta-list">
          {items.map(([key, value]) => {
            const prettyJson = tryFormatLongJSONValue(value)
            const safeValue = value.trim() ? value : '-'
            const displayValue = prettyJson ?? safeValue
            const isLong = isLongMetadataValue(displayValue)
            const expandKey = `${sectionKey}:${key}`
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

  const saveManifest = () => {
    if (!isImplementedConfigTab(configTab) || !yamlDirty || yamlSaving) {
      return
    }
    setYamlSaving(true)
    setYamlError(null)
    setYamlSuccess(null)
    void UpdateWorkloadManifest(
      clusterFilename,
      toConfigAPIKind(configTab),
      selectedResource.namespace,
      selectedResource.name,
      yamlValue,
    ).then(() => {
      setYamlDirty(false)
      setYamlSuccess(`${resourceLabel} manifest saved.`)
    }).catch((errorValue: unknown) => {
      setYamlError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setYamlSaving(false)
    })
  }

  const deleteResource = () => {
    if (!isImplementedConfigTab(configTab) || deletePending) {
      return
    }
    const confirmed = window.confirm(`Delete ${resourceLabel} "${selectedResource.name}" in namespace "${selectedResource.namespace}"?`)
    if (!confirmed) {
      return
    }
    setDeletePending(true)
    setDeleteError(null)
    void DeleteWorkloadResource(
      clusterFilename,
      toConfigAPIKind(configTab),
      selectedResource.namespace,
      selectedResource.name,
    ).then(() => {
      onClose()
    }).catch((errorValue: unknown) => {
      setDeleteError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setDeletePending(false)
    })
  }

  return (
    <section className={`pods-detail-card ${mode === 'modal' ? 'is-modal' : 'is-split'}`}>
      <header className="pods-detail-header">
        <div className="pods-detail-heading">
          <h4>{selectedResource.name}</h4>
          <p>{selectedResource.namespace}</p>
        </div>
        <div className="pods-detail-actions">
          <button
            type="button"
            className="pods-detail-icon-btn danger"
            onClick={deleteResource}
            title={`Delete ${resourceLabel}`}
            aria-label={`Delete ${resourceLabel}`}
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

      <nav className="pods-detail-tabs" aria-label={`${resourceLabel} details tabs`}>
        {DETAIL_TABS.map(tab => (
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

      <div className={`pods-detail-body ${activeDetailsTab === 'yaml' ? 'manifest-mode' : ''}`}>
        {deleteError && (
          <div className="pods-detail-alert error">{deleteError}</div>
        )}
        {configDetailError && activeDetailsTab !== 'yaml' && (
          <div className="pods-detail-alert error">{configDetailError}</div>
        )}
        {activeDetailsTab === 'yaml' ? (
          <>
            {(yamlError || yamlSuccess) && (
              <div className={`pods-detail-alert ${yamlError ? 'error' : 'info'}`}>
                {yamlError ?? yamlSuccess}
              </div>
            )}
            <section className="pods-detail-section pods-detail-manifest-section">
              <YamlEditor
                title={`${selectedResource.name}.yaml`}
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
                  disabled={!yamlDirty || yamlSaving || !isImplementedConfigTab(configTab)}
                >
                  {yamlSaving ? 'Saving...' : 'Save YAML'}
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            {configDetailLoading && !configDetail && (
              <div className="pods-detail-alert">Loading {resourceLabel.toLowerCase()} details...</div>
            )}
            <div className="pods-overview-grid">
              <div className="pods-overview-card">
                <span>Name</span>
                <strong>{selectedResource.name}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Namespace</span>
                <strong>{selectedResource.namespace}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Type</span>
                <strong>{configDetail?.type ?? selectedResource.type ?? '-'}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Created</span>
                <strong>{configDetail?.created ?? '-'}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Keys</span>
                <strong>{selectedResource.keys}</strong>
              </div>
              <div className="pods-overview-card is-full">
                <span>UID</span>
                <strong>{configDetail?.uid ?? '-'}</strong>
              </div>
            </div>

            {renderMapSection('Labels', labels, 'labels')}
            {renderMapSection('Annotations', annotations, 'annotations')}
            {renderMapSection('Data', dataEntries, 'data')}

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
                    {events.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="pods-detail-empty">No events</td>
                      </tr>
                    ) : (
                      events.map((event, index) => (
                        <tr key={`${event.reason}-${event.message}-${index}`}>
                          <td className="pods-detail-value-cell">{event.type}</td>
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
