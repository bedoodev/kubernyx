import { useEffect, useMemo, useState } from 'react'
import type { DeploymentDetail, DeploymentResource, NetworkTabId, PortForwardSession } from '../../../shared/types'
import {
  DeleteWorkloadResource,
  EventsOn,
  ListPortForwards,
  StartPortForward,
  StopPortForward,
  UpdateWorkloadManifest,
} from '../../../shared/api'
import { toPortForwardSession } from '../../../shared/utils/normalization'
import Modal from '../../../shared/components/Modal'
import YamlEditor from '../../../shared/components/YamlEditor'
import {
  isLongMetadataValue,
  renderMetadataValue,
  tryFormatLongJSONValue,
  valueToneClass,
} from '../../workloads/shared/detailHelpers'
import { networkSingularLabel, toNetworkAPIKind } from '../networkKinds'
import '../../workloads/pods/PodsTable.css'

export type NetworkDetailsTabId = 'overview' | 'port-forward' | 'yaml'
type NetworkMetadataSectionKey = 'labels' | 'annotations'

interface Props {
  clusterFilename: string
  networkTab: NetworkTabId
  mode: 'split' | 'modal'
  activeDetailsTab: NetworkDetailsTabId
  onDetailsTabChange: (tab: NetworkDetailsTabId) => void
  selectedResource: DeploymentResource
  detail: DeploymentDetail | null
  detailLoading: boolean
  detailError: string | null
  detailsMaximized: boolean
  showMaximizeButton?: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

const BASE_DETAIL_TABS: Array<{ id: NetworkDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
]

const SERVICE_DETAIL_TABS: Array<{ id: NetworkDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'port-forward', label: 'Port Forward' },
  { id: 'yaml', label: 'YAML' },
]

function mapEntries(value: Record<string, string>): Array<[string, string]> {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
}

function parsePortInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const port = Number(trimmed)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

function isSameServicePortForward(session: PortForwardSession, clusterFilename: string, namespace: string, serviceName: string): boolean {
  return session.clusterFilename === clusterFilename
    && session.namespace === namespace
    && session.resourceKind === 'service'
    && session.resourceName === serviceName
}

export default function NetworkDetailPanel({
  clusterFilename,
  networkTab,
  mode,
  activeDetailsTab,
  onDetailsTabChange,
  selectedResource,
  detail,
  detailLoading,
  detailError,
  detailsMaximized,
  showMaximizeButton = true,
  onToggleMaximize,
  onClose,
}: Props) {
  const [yamlValue, setYamlValue] = useState('-')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSuccess, setYamlSuccess] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [metadataOpenSections, setMetadataOpenSections] = useState<Record<NetworkMetadataSectionKey, boolean>>({
    labels: true,
    annotations: true,
  })
  const [expandedMetadataValues, setExpandedMetadataValues] = useState<Record<string, boolean>>({})
  const [portForwardLocalPort, setPortForwardLocalPort] = useState('')
  const [portForwardRemotePort, setPortForwardRemotePort] = useState('')
  const [portForwardSessions, setPortForwardSessions] = useState<PortForwardSession[]>([])
  const [portForwardPending, setPortForwardPending] = useState(false)
  const [portForwardError, setPortForwardError] = useState<string | null>(null)

  const resourceLabel = networkSingularLabel(networkTab)
  const resourceKey = `${networkTab}:${selectedResource.namespace}/${selectedResource.name}`
  const canPortForward = networkTab === 'services'
  const detailTabs = canPortForward ? SERVICE_DETAIL_TABS : BASE_DETAIL_TABS

  useEffect(() => {
    setYamlDirty(false)
    setYamlError(null)
    setYamlSuccess(null)
    setYamlSaving(false)
    setDeletePending(false)
    setDeleteError(null)
    setDeleteConfirmOpen(false)
    setMetadataOpenSections({
      labels: true,
      annotations: true,
    })
    setExpandedMetadataValues({})
    setPortForwardLocalPort('')
    setPortForwardRemotePort('')
    setPortForwardSessions([])
    setPortForwardPending(false)
    setPortForwardError(null)
  }, [resourceKey])

  useEffect(() => {
    if (!yamlDirty) {
      setYamlValue(detail?.manifest ?? '-')
    }
  }, [detail?.manifest, yamlDirty])

  const labels = useMemo(() => mapEntries(detail?.labels ?? {}), [detail?.labels])
  const annotations = useMemo(() => mapEntries(detail?.annotations ?? {}), [detail?.annotations])
  const portForwardPortOptions = useMemo(() => {
    const seen = new Set<number>()
    const options: Array<{ port: number; name: string; protocol: string }> = []
    for (const container of detail?.containers ?? []) {
      for (const port of container.ports) {
        if (!Number.isFinite(port.containerPort) || port.containerPort <= 0 || seen.has(port.containerPort)) {
          continue
        }
        seen.add(port.containerPort)
        options.push({
          port: port.containerPort,
          name: port.name,
          protocol: port.protocol,
        })
      }
    }
    return options.sort((left, right) => left.port - right.port)
  }, [detail?.containers])
  const suggestedPortForwardPort = portForwardPortOptions[0]?.port ?? 0

  useEffect(() => {
    if (!canPortForward || !suggestedPortForwardPort) {
      return
    }
    const value = String(suggestedPortForwardPort)
    setPortForwardLocalPort(current => current || value)
    setPortForwardRemotePort(current => current || value)
  }, [canPortForward, resourceKey, suggestedPortForwardPort])

  useEffect(() => {
    if (!canPortForward) {
      return
    }

    let active = true
    const applySession = (session: PortForwardSession) => {
      if (!isSameServicePortForward(session, clusterFilename, selectedResource.namespace, selectedResource.name)) {
        return
      }
      setPortForwardSessions(current => {
        if (session.status === 'stopped' || session.status === 'failed') {
          const withoutSession = current.filter(item => item.id !== session.id)
          return session.status === 'failed'
            ? [session, ...withoutSession].slice(0, 8)
            : withoutSession
        }
        const exists = current.some(item => item.id === session.id)
        if (!exists) {
          return [session, ...current]
        }
        return current.map(item => (item.id === session.id ? session : item))
      })
    }

    const unsubscribe = EventsOn('port-forward-status', (payload: unknown) => {
      if (!active) {
        return
      }
      applySession(toPortForwardSession(payload))
    })

    void ListPortForwards().then(sessions => {
      if (!active) {
        return
      }
      setPortForwardSessions(sessions.filter(session => (
        isSameServicePortForward(session, clusterFilename, selectedResource.namespace, selectedResource.name)
      )))
    }).catch((errorValue: unknown) => {
      if (!active) {
        return
      }
      setPortForwardError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [canPortForward, clusterFilename, selectedResource.namespace, selectedResource.name])

  const handleYamlSave = async () => {
    setYamlSaving(true)
    setYamlError(null)
    setYamlSuccess(null)
    try {
      await UpdateWorkloadManifest(
        clusterFilename,
        toNetworkAPIKind(networkTab),
        selectedResource.namespace,
        selectedResource.name,
        yamlValue,
      )
      setYamlDirty(false)
      setYamlSuccess('Saved')
      setTimeout(() => setYamlSuccess(null), 2000)
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : String(error))
    } finally {
      setYamlSaving(false)
    }
  }

  const requestDelete = () => {
    if (deletePending) {
      return
    }
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (deletePending) {
      return
    }
    setDeleteConfirmOpen(false)
    setDeletePending(true)
    setDeleteError(null)
    try {
      await DeleteWorkloadResource(
        clusterFilename,
        toNetworkAPIKind(networkTab),
        selectedResource.namespace,
        selectedResource.name,
      )
      onClose()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
      setDeletePending(false)
    }
  }

  const startPortForward = () => {
    if (portForwardPending || !canPortForward) {
      return
    }

    const localPort = parsePortInput(portForwardLocalPort)
    const remotePort = parsePortInput(portForwardRemotePort)
    if (!localPort || !remotePort) {
      setPortForwardError('Local and service ports must be between 1 and 65535.')
      return
    }

    setPortForwardPending(true)
    setPortForwardError(null)
    void StartPortForward({
      clusterFilename,
      namespace: selectedResource.namespace,
      resourceKind: 'service',
      resourceName: selectedResource.name,
      localPort,
      remotePort,
    }).then(session => {
      setPortForwardSessions(current => [session, ...current.filter(item => item.id !== session.id)])
    }).catch((errorValue: unknown) => {
      setPortForwardError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    }).finally(() => {
      setPortForwardPending(false)
    })
  }

  const stopPortForward = (sessionId: string) => {
    setPortForwardError(null)
    void StopPortForward(sessionId).catch((errorValue: unknown) => {
      setPortForwardError(errorValue instanceof Error ? errorValue.message : String(errorValue))
    })
  }

  const toggleMetadataSection = (section: NetworkMetadataSectionKey) => {
    setMetadataOpenSections(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const toggleMetadataValueExpand = (key: string) => {
    setExpandedMetadataValues(current => ({
      ...current,
      [key]: !(current[key] ?? false),
    }))
  }

  const renderMetadataSection = (
    section: NetworkMetadataSectionKey,
    title: string,
    items: Array<[string, string]>,
  ) => (
    <section className="pods-meta-card">
      <header className="pods-meta-card-header">
        <button
          type="button"
          className={`pods-meta-header-btn ${metadataOpenSections[section] ? 'is-open' : ''}`}
          onClick={() => toggleMetadataSection(section)}
          aria-label={metadataOpenSections[section] ? `Collapse ${title.toLowerCase()}` : `Expand ${title.toLowerCase()}`}
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
              <div key={key} className={`pods-meta-item ${prettyJson ? 'is-json' : ''}`}>
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

  const renderPortForwardTab = () => (
    <div className="pods-port-forward-tab">
      <section className="pods-meta-card">
        <header className="pods-meta-card-header">
          <div className="pods-meta-header-static">
            <div className="pods-meta-title">
              <span>Forward Service Port</span>
            </div>
          </div>
        </header>

        <div className="pods-port-forward-form">
          <label className="pods-port-forward-field">
            <span>Local Port</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={portForwardLocalPort}
              onChange={event => setPortForwardLocalPort(event.target.value)}
              placeholder="8080"
            />
          </label>
          <label className="pods-port-forward-field">
            <span>Service Port</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={portForwardRemotePort}
              onChange={event => setPortForwardRemotePort(event.target.value)}
              placeholder="80"
            />
          </label>
          <button
            type="button"
            className="pods-port-forward-start-btn"
            onClick={startPortForward}
            disabled={portForwardPending}
          >
            {portForwardPending ? 'Starting...' : 'Start'}
          </button>
        </div>

        {portForwardPortOptions.length > 0 && (
          <div className="pods-port-forward-presets" aria-label="Service port presets">
            {portForwardPortOptions.map(option => (
              <button
                key={`${option.name}-${option.port}`}
                type="button"
                className="pods-port-forward-preset"
                onClick={() => {
                  const value = String(option.port)
                  setPortForwardLocalPort(value)
                  setPortForwardRemotePort(value)
                }}
              >
                <span>{option.port}/{option.protocol}</span>
                <small>{option.name && option.name !== '-' ? option.name : 'service'}</small>
              </button>
            ))}
          </div>
        )}

        <code className="pods-port-forward-command">
          kubectl -n {selectedResource.namespace} port-forward svc/{selectedResource.name} {portForwardLocalPort || '<local>'}:{portForwardRemotePort || '<service>'}
        </code>

        {portForwardError && (
          <div className="pods-detail-alert error">{portForwardError}</div>
        )}
      </section>

      <section className="pods-meta-card">
        <header className="pods-meta-card-header">
          <div className="pods-meta-header-static">
            <div className="pods-meta-title">
              <span>Active Forwards</span>
            </div>
            <span className="pods-meta-count">{portForwardSessions.length}</span>
          </div>
        </header>

        {portForwardSessions.length === 0 ? (
          <p className="pods-meta-empty">No active port forwards</p>
        ) : (
          <div className="pods-port-forward-list">
            {portForwardSessions.map(session => (
              <article key={session.id} className="pods-port-forward-item">
                <div className="pods-port-forward-main">
                  <strong>127.0.0.1:{session.localPort}</strong>
                  <span>svc/{session.resourceName}:{session.remotePort}</span>
                  <code>{session.command}</code>
                  {session.message && <small>{session.message}</small>}
                </div>
                <div className="pods-port-forward-actions">
                  <span className={`pods-tone-pill tone-${valueToneClass(session.status)}`}>{session.status}</span>
                  {session.status !== 'failed' && (
                    <button
                      type="button"
                      className="pods-port-forward-stop-btn"
                      onClick={() => stopPortForward(session.id)}
                      disabled={session.status === 'stopping'}
                    >
                      Stop
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  const statusClass = valueToneClass(detail?.status ?? selectedResource.status)

  return (
    <div className={`pod-detail-panel ${mode === 'modal' ? 'is-modal' : ''}`}>
      <div className="pod-detail-header">
        <div className="pod-detail-header-top">
          <div className="pod-detail-title-row">
            <h3 className="pod-detail-name" title={selectedResource.name}>{selectedResource.name}</h3>
            <span className={`pod-detail-phase ${statusClass}`}>{detail?.status ?? selectedResource.status}</span>
          </div>
          <div className="pod-detail-header-actions">
            <button
              type="button"
              className="pod-detail-delete-icon-btn"
              onClick={requestDelete}
              title={`Delete ${resourceLabel.toLowerCase()}`}
              aria-label={`Delete ${resourceLabel.toLowerCase()}`}
              disabled={deletePending}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M6 6l1 14a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            {showMaximizeButton && (
              <button type="button" className="pod-detail-maximize-btn" onClick={onToggleMaximize} title={detailsMaximized ? 'Restore panel' : 'Maximize panel'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {detailsMaximized ? (
                    <>
                      <polyline points="4 14 10 14 10 20" />
                      <polyline points="20 10 14 10 14 4" />
                      <line x1="14" y1="10" x2="21" y2="3" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </>
                  ) : (
                    <>
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </>
                  )}
                </svg>
              </button>
            )}
            <button type="button" className="pod-detail-close-btn" onClick={onClose} title="Close detail panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="pod-detail-tabs">
          {detailTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`pod-detail-tab ${activeDetailsTab === tab.id ? 'active' : ''}`}
              onClick={() => onDetailsTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pod-detail-body">
        {deleteError && (
          <div className="pods-detail-alert error">{deleteError}</div>
        )}
        {detailError ? (
          <div className="pods-empty-row error">{detailError}</div>
        ) : detailLoading && !detail ? (
          <div className="pods-empty-row">Loading {resourceLabel.toLowerCase()} details...</div>
        ) : activeDetailsTab === 'port-forward' && canPortForward ? (
          renderPortForwardTab()
        ) : activeDetailsTab === 'yaml' ? (
          <div className="pod-detail-yaml-wrap">
            <YamlEditor
              title={`${selectedResource.name}.yaml`}
              value={yamlValue}
              editSessionKey={resourceKey}
              onChange={value => { setYamlValue(value); setYamlDirty(true) }}
            />
            <div className="pod-detail-yaml-actions">
              <button type="button" className="pod-detail-yaml-save" disabled={!yamlDirty || yamlSaving} onClick={handleYamlSave}>
                {yamlSaving ? 'Saving...' : 'Save'}
              </button>
              {yamlError && <span className="pod-detail-yaml-error">{yamlError}</span>}
              {yamlSuccess && <span className="pod-detail-yaml-success">{yamlSuccess}</span>}
            </div>
          </div>
        ) : (
          <div className="pod-detail-overview">
            <section className="pod-detail-section">
              <h4 className="pod-detail-section-title">{resourceLabel} Info</h4>
              <div className="pod-detail-grid">
                <div className="pod-detail-field"><span className="pod-detail-label">Name</span><span className="pod-detail-value">{detail?.name ?? selectedResource.name}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Namespace</span><span className="pod-detail-value">{detail?.namespace ?? selectedResource.namespace}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Status</span><span className={`pod-detail-value ${statusClass}`}>{detail?.status ?? selectedResource.status}</span></div>
                {detail?.replicas && (
                  <div className="pod-detail-field"><span className="pod-detail-label">Replicas</span><span className="pod-detail-value">{detail.replicas}</span></div>
                )}
                <div className="pod-detail-field"><span className="pod-detail-label">Age</span><span className="pod-detail-value">{detail?.age ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Created</span><span className="pod-detail-value">{detail?.created ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">UID</span><span className="pod-detail-value mono">{detail?.uid ?? '-'}</span></div>
              </div>
            </section>

            {detail?.selector && Object.keys(detail.selector).length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Selector</h4>
                <div className="pod-detail-grid">
                  {Object.entries(detail.selector).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                    <div key={key} className="pod-detail-field">
                      <span className="pod-detail-label" title={key}>{key}</span>
                      <span className="pod-detail-value mono">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {renderMetadataSection('labels', 'Labels', labels)}

            {renderMetadataSection('annotations', 'Annotations', annotations)}

            {detail?.events && detail.events.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Events ({detail.events.length})</h4>
                <div className="pods-table-wrap" style={{ maxHeight: '240px' }}>
                  <table className="pods-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th><div className="pods-th-content"><span className="pods-th-label">Type</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Reason</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Message</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Count</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Age</span></div></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.events.map((evt, i) => (
                        <tr key={`${evt.reason}-${i}`}>
                          <td className={`pods-cell pods-status-cell ${evt.type === 'Warning' ? 'failed' : ''}`}>{evt.type}</td>
                          <td className="pods-cell">{evt.reason}</td>
                          <td className="pods-cell" title={evt.message}>{evt.message}</td>
                          <td className="pods-cell">{evt.count}</td>
                          <td className="pods-cell">{evt.age}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      {deleteConfirmOpen && (
        <Modal title={`Confirm Delete ${resourceLabel}`} onClose={() => setDeleteConfirmOpen(false)} variant="confirmation" tone="danger">
          <p>
            Delete {resourceLabel.toLowerCase()} <strong>{selectedResource.name}</strong> in
            {' '}
            <strong>{selectedResource.namespace}</strong>
            {' '}
            namespace?
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
