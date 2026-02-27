import type { NodeSummary } from '../types'
import './SummaryCards.css'

interface Props {
  summary: NodeSummary
}

export default function SummaryCards({ summary }: Props) {
  const total = Math.max(summary.total, summary.ready + summary.notReady)
  const ready = Math.max(0, summary.ready)
  const notReady = Math.max(0, summary.notReady)
  const readyPct = total > 0 ? (ready / total) * 100 : 0
  const notReadyPct = total > 0 ? (notReady / total) * 100 : 0

  const cards = [
    { label: 'Total Nodes', value: summary.total, color: 'var(--text-primary)' },
    { label: 'Ready', value: summary.ready, color: 'var(--green)' },
    { label: 'Not Ready', value: summary.notReady, color: 'var(--red)' },
    { label: 'Master', value: summary.masters, color: 'var(--purple)' },
    { label: 'Worker', value: summary.workers, color: 'var(--cyan)' },
  ]

  return (
    <div className="summary-section">
      <div className="summary-cards">
        {cards.map(c => (
          <div key={c.label} className="summary-card">
            <span className="card-value" style={{ color: c.color }}>{c.value}</span>
            <span className="card-label">{c.label}</span>
          </div>
        ))}
      </div>
      <div className="readiness-bar-container">
        <div className="readiness-info">
          <span className="readiness-label">Readiness</span>
          <span className="readiness-total">{total}</span>
        </div>
        <div className="readiness-track">
          <div
            className="readiness-segment ready"
            style={{ width: `${readyPct}%` }}
          />
          <div
            className="readiness-segment not-ready"
            style={{ width: `${notReadyPct}%` }}
          />
        </div>
        <div className="readiness-meta">
          <span className="readiness-chip ready">
            <span className="readiness-chip-dot" />
            Ready: {ready}
          </span>
          <span className="readiness-chip not-ready">
            <span className="readiness-chip-dot" />
            Not Ready: {notReady}
          </span>
        </div>
      </div>
    </div>
  )
}
