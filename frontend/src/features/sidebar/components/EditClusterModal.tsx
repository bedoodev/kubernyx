import { useEffect, useState } from 'react'
import type { ClusterInfo } from '../../../shared/types'
import Modal from '../../../shared/components/Modal'
import YamlEditor from '../../../shared/components/YamlEditor'
import './EditClusterModal.css'

interface Props {
  cluster: ClusterInfo
  onLoad: (filename: string) => Promise<string>
  onSave: (filename: string, content: string) => Promise<void>
  onRename: (oldFilename: string, newName: string) => Promise<void>
  onClose: () => void
}

export default function EditClusterModal({ cluster, onLoad, onSave, onRename, onClose }: Props) {
  const [clusterName, setClusterName] = useState(cluster.name)
  const [content, setContent] = useState('')
  const [loadedContent, setLoadedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError('')
    onLoad(cluster.filename).then(text => {
      if (cancelled) {
        return
      }
      setClusterName(cluster.name)
      setContent(text)
      setLoadedContent(text)
      setLoading(false)
    }).catch((e: unknown) => {
      if (cancelled) {
        return
      }
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [cluster.filename, cluster.name, onLoad])

  const handleSave = async () => {
    const nextName = clusterName.trim()
    if (!nextName) {
      setError('Cluster name is required')
      return
    }
    if (!content.trim()) {
      setError('Kubeconfig content cannot be empty')
      return
    }

    const nameChanged = nextName !== cluster.name
    const contentChanged = content !== loadedContent
    if (!nameChanged && !contentChanged) {
      onClose()
      return
    }

    setSaving(true)
    setError('')
    try {
      if (contentChanged) {
        await onSave(cluster.filename, content)
      }
      if (nameChanged) {
        await onRename(cluster.filename, nextName)
      }
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit Kubeconfig: ${cluster.name}`} onClose={onClose} className="cluster-edit-modal">
      <div className="cluster-edit-shell">
        <label className="cluster-edit-field">
          <span>Cluster Name</span>
          <input
            type="text"
            value={clusterName}
            onChange={event => setClusterName(event.target.value)}
          />
        </label>
        {loading ? (
          <div className="cluster-edit-loading">Loading kubeconfig...</div>
        ) : (
          <YamlEditor
            className="cluster-edit-yaml"
            title={`${cluster.filename} (yaml)`}
            value={content}
            onChange={setContent}
            minHeight={0}
          />
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
