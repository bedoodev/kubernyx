import { useState, useCallback } from 'react'

export type ShortcutId = 'closeTab' | 'toggleSidebar' | 'toggleDetailPanel'

export interface ShortcutBinding {
  key: string
  label: string
}

export type ShortcutMap = Record<ShortcutId, ShortcutBinding>

const STORAGE_KEY = 'kubernyx-shortcuts'

const DEFAULT_SHORTCUTS: ShortcutMap = {
  closeTab: { key: 'w', label: 'Close Tab' },
  toggleSidebar: { key: 'b', label: 'Toggle Sidebar' },
  toggleDetailPanel: { key: 'd', label: 'Toggle Detail Panel' },
}

function loadShortcuts(): ShortcutMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...DEFAULT_SHORTCUTS }
    const parsed = JSON.parse(stored) as Partial<ShortcutMap>
    return {
      closeTab: parsed.closeTab ?? DEFAULT_SHORTCUTS.closeTab,
      toggleSidebar: parsed.toggleSidebar ?? DEFAULT_SHORTCUTS.toggleSidebar,
      toggleDetailPanel: parsed.toggleDetailPanel ?? DEFAULT_SHORTCUTS.toggleDetailPanel,
    }
  } catch {
    return { ...DEFAULT_SHORTCUTS }
  }
}

function saveShortcuts(shortcuts: ShortcutMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
}

export function useShortcutSettings() {
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(loadShortcuts)

  const updateShortcut = useCallback((id: ShortcutId, newKey: string): { conflict: ShortcutId | null } => {
    const conflictEntry = (Object.entries(shortcuts) as [ShortcutId, ShortcutBinding][])
      .find(([otherId, binding]) => otherId !== id && binding.key === newKey)

    if (conflictEntry) {
      return { conflict: conflictEntry[0] }
    }

    const next: ShortcutMap = {
      ...shortcuts,
      [id]: { ...shortcuts[id], key: newKey },
    }
    setShortcuts(next)
    saveShortcuts(next)
    return { conflict: null }
  }, [shortcuts])

  const resetAll = useCallback(() => {
    const defaults = { ...DEFAULT_SHORTCUTS }
    setShortcuts(defaults)
    saveShortcuts(defaults)
  }, [])

  return { shortcuts, updateShortcut, resetAll }
}

export { DEFAULT_SHORTCUTS }
