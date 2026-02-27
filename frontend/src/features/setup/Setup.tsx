import './Setup.css'

interface Props {
  onSelect: () => void
}

export default function Setup({ onSelect }: Props) {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-logo">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1>Kubernyx</h1>
        <p className="setup-subtitle">Lightweight Kubernetes IDE</p>
        <p className="setup-desc">
          Choose a directory to store your kubeconfig files.
          Each file will appear as a cluster in the sidebar.
        </p>
        <button className="setup-btn" onClick={onSelect}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          Select Directory
        </button>
      </div>
    </div>
  )
}
