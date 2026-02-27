import { useEffect } from 'react'
import { isMacPlatform } from '../utils/platform'

interface UseKeyboardShortcutsOptions {
  enabled: boolean
  showSettings: boolean
  activeTabId: string | null
  onCloseSettings: () => void
  onCloseTab: (tabId: string) => void
  onToggleSidebar: () => void
}

export function useKeyboardShortcuts({
  enabled,
  showSettings,
  activeTabId,
  onCloseSettings,
  onCloseTab,
  onToggleSidebar,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled) {
        return
      }

      if (event.key === 'Escape' && showSettings) {
        event.preventDefault()
        onCloseSettings()
        return
      }

      const commandOrControlOnly = isMacPlatform()
        ? (event.metaKey && !event.ctrlKey)
        : (event.ctrlKey && !event.metaKey)

      if (!commandOrControlOnly || event.altKey || event.shiftKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'w') {
        event.preventDefault()
        if (showSettings) {
          onCloseSettings()
          return
        }
        if (!activeTabId) {
          return
        }
        onCloseTab(activeTabId)
        return
      }

      if (key === 'b') {
        event.preventDefault()
        onToggleSidebar()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, activeTabId, showSettings, onCloseSettings, onCloseTab, onToggleSidebar])
}
