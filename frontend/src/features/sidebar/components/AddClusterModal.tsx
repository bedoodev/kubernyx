import { useState, useRef } from 'react'

interface Props {
  onAdd: (name: string, content: string) => Promise<void>
  onClose: () => void
}

export default function AddClusterModal({ onAdd, onClose }: Props) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setContent(reader.result as string)
      if (!name) setName(file.name.replace(/\.(yaml|yml|json|conf|kubeconfig)$/i, ''))
    }
    reader.readAsText(file)
  }

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      setError('Name and content are required')
      return
    }
    setSaving(true)
    try {
      await onAdd(name.trim(), content.trim())
      onClose()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Add Cluster</h3>
        <label>
          <span>Cluster Name</span>
          <input
            type="text"
            placeholder="my-cluster"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label>
          <span>Kubeconfig Content</span>
          <textarea
            placeholder="Paste YAML or JSON kubeconfig here..."
            rows={10}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </label>
        <div className="modal-divider">
          <span>or</span>
        </div>
        <button className="upload-btn" onClick={() => fileRef.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload File
        </button>
        <input ref={fileRef} type="file" accept=".yaml,.yml,.json,.conf,.kubeconfig" onChange={handleFile} hidden />
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
