import { useState, useEffect } from 'react'
import { GetBasePath, SetBasePath, SelectDirectory } from '../../wailsjs/go/main/App'
import './Settings.css'

interface Props {
  onPathChanged: () => void
}

export default function Settings({ onPathChanged }: Props) {
  const [basePath, setBasePathLocal] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    GetBasePath().then(p => setBasePathLocal(p || '')).catch(() => {})
  }, [])

  const handleBrowse = async () => {
    try {
      const dir = await SelectDirectory()
      if (!dir) return
      setSaving(true)
      setMessage(null)
      await SetBasePath(dir)
      setBasePathLocal(dir)
      onPathChanged()
      setMessage({ type: 'success', text: 'Path updated successfully' })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings">
      <div className="settings-section">
        <h2>Kubeconfig Directory</h2>
        <p className="settings-desc">
          The directory where your kubeconfig files are stored. Each file appears as a cluster in the sidebar.
        </p>
        <div className="path-row">
          <div className="path-display">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <span className="path-text">{basePath || 'Not set'}</span>
          </div>
          <button className="btn-primary" onClick={handleBrowse} disabled={saving}>
            {saving ? 'Saving...' : 'Change'}
          </button>
        </div>
        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}
