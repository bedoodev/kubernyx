import { useState } from 'react'
import type { PodResource, PodDetail } from '../../../../shared/types'
import { formatAgeFromUnix } from '../../../../shared/utils/formatting'

type PodDetailsTabId = 'overview' | 'metadata' | 'init-containers' | 'containers' | 'logs' | 'shell' | 'usages' | 'manifest'
type MetadataSectionKey = 'labels' | 'annotations' | 'volumes'

const POD_DETAIL_TABS: Array<{ id: PodDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'init-containers', label: 'Init Containers' },
  { id: 'containers', label: 'Containers' },
  { id: 'logs', label: 'Logs' },
  { id: 'shell', label: 'Shell' },
  { id: 'usages', label: 'Usages' },
  { id: 'manifest', label: 'Manifest' },
]

function phaseFromStatus(status: string): string {
  const phase = status.trim().split(' ')[0]
  return phase || 'Unknown'
}

function valueToneClass(value: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  const normalized = value.trim().toLowerCase()
  if (normalized === '' || normalized === '-') {
    return 'neutral'
  }
  if (normalized.includes('true') || normalized.includes('yes') || normalized.includes('running') || normalized.includes('ready')) {
    return 'ok'
  }
  if (normalized.includes('false') || normalized.includes('failed') || normalized.includes('error')) {
    return 'bad'
  }
  if (normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('terminating') || normalized.includes('unknown')) {
    return 'warn'
  }
  return 'neutral'
}

function getAgeLabel(item: PodResource, nowUnix: number): string {
  if (item.createdAtUnix && item.createdAtUnix > 0) {
    return formatAgeFromUnix(item.createdAtUnix, nowUnix)
  }
  return item.age ?? '-'
}

interface Props {
  mode: 'split' | 'modal'
  selectedPod: PodResource
  podDetail: PodDetail | null
  podDetailLoading: boolean
  podDetailError: string | null
  nowUnix: number
  detailsMaximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

export default function PodDetailPanel({
  mode,
  selectedPod,
  podDetail,
  podDetailLoading,
  podDetailError,
  nowUnix,
  detailsMaximized,
  onToggleMaximize,
  onClose,
}: Props) {
  const [activeDetailsTab, setActiveDetailsTab] = useState<PodDetailsTabId>('overview')
  const [metadataOpenSections, setMetadataOpenSections] = useState<Record<MetadataSectionKey, boolean>>({
    labels: false,
    annotations: false,
    volumes: false,
  })

  const detailTabLabel = POD_DETAIL_TABS.find(tab => tab.id === activeDetailsTab)?.label ?? 'Overview'
  const overviewStatus = podDetail?.status ?? selectedPod.status ?? '-'
  const overviewPhase = podDetail?.phase ?? phaseFromStatus(selectedPod.status ?? '')
  const overviewAge = podDetail?.age ?? getAgeLabel(selectedPod, nowUnix)
  const overviewPodIP = podDetail?.podIP ?? '-'
  const overviewNode = podDetail?.node ?? '-'
  const overviewQOSClass = podDetail?.qosClass ?? '-'
  const overviewRestartCount = podDetail?.restartCount ?? 0
  const overviewControlledBy = podDetail?.controlledBy ?? selectedPod.controlledBy ?? '-'
  const overviewCreated = podDetail?.created ?? '-'
  const overviewUID = podDetail?.uid ?? '-'
  const overviewContainers = podDetail?.containers ?? []
  const overviewConditions = podDetail?.conditions ?? []
  const metadataResourceVersion = podDetail?.resourceVersion ?? '-'
  const metadataLabels = Object.entries(podDetail?.labels ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataAnnotations = Object.entries(podDetail?.annotations ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const metadataOwnerReferences = podDetail?.ownerReferences ?? []
  const metadataVolumes = podDetail?.volumes ?? []

  const toggleMetadataSection = (section: MetadataSectionKey) => {
    setMetadataOpenSections(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  return (
    <section className={`pods-detail-card ${mode === 'modal' ? 'is-modal' : 'is-split'}`}>
      <header className="pods-detail-header">
        <div className="pods-detail-heading">
          <h4>{selectedPod.name}</h4>
          <p>{selectedPod.namespace}</p>
        </div>
        <div className="pods-detail-actions">
          <button
            type="button"
            className="pods-detail-icon-btn"
            onClick={onToggleMaximize}
            title={mode === 'modal' ? 'Restore panel' : 'Open in large view'}
            aria-label={mode === 'modal' ? 'Restore panel' : 'Open in large view'}
          >
            {mode === 'modal' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="5" y2="5"></line><polyline points="5 3 5 5 3 5"></polyline><line x1="14" y1="2" x2="11" y2="5"></line><polyline points="11 3 11 5 13 5"></polyline><line x1="2" y1="14" x2="5" y2="11"></line><polyline points="3 11 5 11 5 13"></polyline><line x1="14" y1="14" x2="11" y2="11"></line><polyline points="11 13 11 11 13 11"></polyline></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="5" x2="2" y2="2"></line><polyline points="2 4 2 2 4 2"></polyline><line x1="11" y1="5" x2="14" y2="2"></line><polyline points="12 2 14 2 14 4"></polyline><line x1="5" y1="11" x2="2" y2="14"></line><polyline points="2 12 2 14 4 14"></polyline><line x1="11" y1="11" x2="14" y2="14"></line><polyline points="12 14 14 14 14 12"></polyline></svg>
            )}
          </button>
          <button
            type="button"
            className="pods-detail-icon-btn danger"
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

      <nav className="pods-detail-tabs" aria-label="Pod details tabs">
        {POD_DETAIL_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`pods-detail-tab ${activeDetailsTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveDetailsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="pods-detail-body">
        {(activeDetailsTab !== 'overview' && activeDetailsTab !== 'metadata') ? (
          <>
            <h5>{detailTabLabel}</h5>
            <p>Coming soon...</p>
          </>
        ) : podDetailError ? (
          <div className="pods-detail-alert error">{podDetailError}</div>
        ) : activeDetailsTab === 'metadata' ? (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading pod metadata...</div>
            )}

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.labels ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('labels')}
                  aria-label={metadataOpenSections.labels ? 'Collapse labels' : 'Expand labels'}
                  aria-expanded={metadataOpenSections.labels}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <h5>Labels</h5>
                  </div>
                  <span className="pods-meta-count">{metadataLabels.length}</span>
                </button>
              </header>
              {!metadataOpenSections.labels ? null : metadataLabels.length === 0 ? (
                <p className="pods-meta-empty">No labels</p>
              ) : (
                <div className="pods-meta-list">
                  {metadataLabels.map(([key, value]) => (
                    <div key={key} className="pods-meta-item">
                      <span className="pods-meta-key">{key}:</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.annotations ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('annotations')}
                  aria-label={metadataOpenSections.annotations ? 'Collapse annotations' : 'Expand annotations'}
                  aria-expanded={metadataOpenSections.annotations}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <h5>Annotations</h5>
                  </div>
                  <span className="pods-meta-count">{metadataAnnotations.length}</span>
                </button>
              </header>
              {!metadataOpenSections.annotations ? null : metadataAnnotations.length === 0 ? (
                <p className="pods-meta-empty">No annotations</p>
              ) : (
                <div className="pods-meta-list">
                  {metadataAnnotations.map(([key, value]) => (
                    <div key={key} className="pods-meta-item">
                      <span className="pods-meta-key">{key}:</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <div className="pods-meta-header-static">
                  <div className="pods-meta-title">
                    <h5>Owner References</h5>
                  </div>
                  <span className="pods-meta-count">{metadataOwnerReferences.length}</span>
                </div>
              </header>
              {metadataOwnerReferences.length === 0 ? (
                <p className="pods-meta-empty">No owner references</p>
              ) : (
                <div className="pods-meta-list">
                  {metadataOwnerReferences.map((owner, index) => (
                    <div key={`${owner.kind}-${owner.name}-${index}`} className="pods-meta-item">
                      <span className="pods-meta-key">
                        {owner.kind}/{owner.name}
                      </span>
                      <span>{owner.uid || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="pods-meta-grid-two">
              <section className="pods-meta-card">
                <header className="pods-meta-card-header">
                  <div className="pods-meta-header-static">
                    <div className="pods-meta-title">
                      <h5>Resource Version</h5>
                    </div>
                  </div>
                </header>
                <div className="pods-meta-value">{metadataResourceVersion}</div>
              </section>

              <section className="pods-meta-card">
                <header className="pods-meta-card-header">
                  <div className="pods-meta-header-static">
                    <div className="pods-meta-title">
                      <h5>UID</h5>
                    </div>
                  </div>
                </header>
                <div className="pods-meta-value">{overviewUID}</div>
              </section>
            </div>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.volumes ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('volumes')}
                  aria-label={metadataOpenSections.volumes ? 'Collapse pod volumes' : 'Expand pod volumes'}
                  aria-expanded={metadataOpenSections.volumes}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <h5>Pod Volumes</h5>
                  </div>
                  <span className="pods-meta-count">{metadataVolumes.length}</span>
                </button>
              </header>
              {metadataOpenSections.volumes ? (
                <div className="pods-detail-table-wrap">
                  <table className="pods-detail-table pods-volume-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metadataVolumes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="pods-detail-empty">No volumes</td>
                        </tr>
                      ) : (
                        metadataVolumes.map((volume, index) => (
                          <tr key={`${volume.name}-${index}`}>
                            <td>{volume.name || '-'}</td>
                            <td>{volume.type || '-'}</td>
                            <td className="pods-volume-details">{volume.details || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <>
            {podDetailLoading && !podDetail && (
              <div className="pods-detail-alert">Loading pod details...</div>
            )}

            <div className="pods-overview-grid">
              <div className="pods-overview-card">
                <span>Name</span>
                <strong>{selectedPod.name ?? '-'}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Namespace</span>
                <strong>{selectedPod.namespace ?? '-'}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Status</span>
                <strong className={`tone-${valueToneClass(overviewStatus)}`}>{overviewStatus}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Phase</span>
                <strong className={`tone-${valueToneClass(overviewPhase)}`}>{overviewPhase}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Age</span>
                <strong>{overviewAge}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Pod IP</span>
                <strong>{overviewPodIP}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Node</span>
                <strong>{overviewNode}</strong>
              </div>
              <div className="pods-overview-card">
                <span>QOS Class</span>
                <strong>{overviewQOSClass}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Restart Count</span>
                <strong>{overviewRestartCount}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Controlled By</span>
                <strong>{overviewControlledBy}</strong>
              </div>
              <div className="pods-overview-card">
                <span>Created</span>
                <strong>{overviewCreated}</strong>
              </div>
              <div className="pods-overview-card">
                <span>UID</span>
                <strong>{overviewUID}</strong>
              </div>
            </div>

            <section className="pods-detail-section">
              <h5>Containers</h5>
              <div className="pods-detail-table-wrap">
                <table className="pods-detail-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Image</th>
                      <th>State</th>
                      <th>Ready</th>
                      <th>Restarts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewContainers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="pods-detail-empty">No containers</td>
                      </tr>
                    ) : (
                      overviewContainers.map(container => (
                        <tr key={container.name}>
                          <td>{container.name}</td>
                          <td>{container.image}</td>
                          <td>
                            <span className={`tone-${valueToneClass(container.state)}`}>
                              {container.state}
                            </span>
                          </td>
                          <td>
                            <span className={`tone-${valueToneClass(container.ready ? 'true' : 'false')}`}>
                              {container.ready ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td>{container.restarts}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="pods-detail-section">
              <h5>Conditions</h5>
              <div className="pods-detail-table-wrap">
                <table className="pods-detail-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewConditions.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="pods-detail-empty">No conditions</td>
                      </tr>
                    ) : (
                      overviewConditions.map((condition, index) => (
                        <tr key={`${condition.type}-${condition.status}-${index}`}>
                          <td>{condition.type}</td>
                          <td>
                            <span className={`tone-${valueToneClass(condition.status)}`}>
                              {condition.status}
                            </span>
                          </td>
                          <td>{condition.message}</td>
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
