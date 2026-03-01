import { useState, useEffect } from 'react'
import { GetBasePath, SetBasePath, SelectDirectory } from '../../shared/api'
import type { ShortcutId, ShortcutMap } from '../../shared/hooks/useShortcutSettings'
import KeyboardShortcuts from './KeyboardShortcuts'
import './Settings.css'

type SettingsTab = 'general' | 'shortcuts'

interface Props {
  onPathChanged: () => void
  embedded?: boolean
  shortcuts: ShortcutMap
  onUpdateShortcut: (id: ShortcutId, newKey: string) => { conflict: ShortcutId | null }
  onResetShortcuts: () => void
}

export default function Settings({ onPathChanged, embedded = false, shortcuts, onUpdateShortcut, onResetShortcuts }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
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
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`settings ${embedded ? 'embedded' : ''}`}>
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shortcuts')}
        >
          Keyboard Shortcuts
        </button>
      </div>

      {activeTab === 'general' ? (
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
      ) : (
        <KeyboardShortcuts
          shortcuts={shortcuts}
          onUpdateShortcut={onUpdateShortcut}
          onResetAll={onResetShortcuts}
        />
      )}
    </div>
  )
}
