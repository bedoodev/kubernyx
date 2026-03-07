import { useState } from 'react'
import { isMacPlatform } from '../../shared/utils/platform'
import type { ShortcutId, ShortcutMap } from '../../shared/hooks/useShortcutSettings'
import './KeyboardShortcuts.css'

interface Props {
  shortcuts: ShortcutMap
  onUpdateShortcut: (id: ShortcutId, newKey: string) => { conflict: ShortcutId | null }
  onResetAll: () => void
}

const SHORTCUT_ORDER: ShortcutId[] = ['closeTab', 'toggleSidebar', 'toggleDetailPanel', 'openTerminal']

function formatKey(key: string): string {
  const modifier = isMacPlatform() ? 'Cmd' : 'Ctrl'
  return `${modifier}+${key.toUpperCase()}`
}

export default function KeyboardShortcuts({ shortcuts, onUpdateShortcut, onResetAll }: Props) {
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [conflict, setConflict] = useState<{ id: ShortcutId; conflictWith: ShortcutId } | null>(null)

  const handleRecord = (id: ShortcutId) => {
    setConflict(null)
    setRecording(id)
  }

  const handleCancel = () => {
    setRecording(null)
    setConflict(null)
  }

  const handleKeyCapture = (id: ShortcutId, event: React.KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const key = event.key.toLowerCase()

    // Ignore modifier-only presses and escape
    if (['meta', 'control', 'alt', 'shift', 'escape'].includes(key)) {
      if (key === 'escape') {
        handleCancel()
      }
      return
    }

    // Only accept single printable keys
    if (key.length !== 1) return

    const result = onUpdateShortcut(id, key)
    if (result.conflict) {
      setConflict({ id, conflictWith: result.conflict })
    } else {
      setConflict(null)
      setRecording(null)
    }
  }

  const handleReset = () => {
    onResetAll()
    setRecording(null)
    setConflict(null)
  }

  return (
    <div className="keyboard-shortcuts">
      <div className="shortcuts-list">
        {SHORTCUT_ORDER.map(id => {
          const binding = shortcuts[id]
          const isRecording = recording === id
          const hasConflict = conflict?.id === id

          return (
            <div key={id} className={`shortcut-row ${isRecording ? 'recording' : ''}`}>
              <span className="shortcut-label">{binding.label}</span>
              <div className="shortcut-controls">
                {isRecording ? (
                  <span
                    className="shortcut-key recording"
                    tabIndex={0}
                    onKeyDown={event => handleKeyCapture(id, event)}
                    ref={el => el?.focus()}
                  >
                    Press a key...
                  </span>
                ) : (
                  <span className="shortcut-key">{formatKey(binding.key)}</span>
                )}
                {isRecording ? (
                  <button className="btn-shortcut" onClick={handleCancel}>Cancel</button>
                ) : (
                  <button className="btn-shortcut" onClick={() => handleRecord(id)}>Change</button>
                )}
              </div>
              {hasConflict && (
                <span className="shortcut-conflict">
                  Already used by "{shortcuts[conflict.conflictWith].label}"
                </span>
              )}
            </div>
          )
        })}
      </div>
      <button className="btn-reset-shortcuts" onClick={handleReset}>
        Reset to Defaults
      </button>
    </div>
  )
}
