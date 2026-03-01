import { useEffect } from 'react'
import { isMacPlatform } from '../utils/platform'
import type { ShortcutMap } from './useShortcutSettings'

interface UseKeyboardShortcutsOptions {
  enabled: boolean
  shortcuts: ShortcutMap
  showSettings: boolean
  activeTabId: string | null
  hasDetailPanel: boolean
  onCloseSettings: () => void
  onCloseTab: (tabId: string) => void
  onToggleSidebar: () => void
  onToggleDetailMinimize: () => void
  onEscapeNav: () => void
}

export function useKeyboardShortcuts({
  enabled,
  shortcuts,
  showSettings,
  activeTabId,
  hasDetailPanel,
  onCloseSettings,
  onCloseTab,
  onToggleSidebar,
  onToggleDetailMinimize,
  onEscapeNav,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled) {
        return
      }

      if (event.key === 'Escape') {
        const target = event.target as HTMLElement
        const isInInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'

        if (isInInput) {
          target.blur()
          event.preventDefault()
          return
        }

        if (showSettings) {
          event.preventDefault()
          onCloseSettings()
          return
        }

        event.preventDefault()
        onEscapeNav()
        return
      }

      const commandOrControlOnly = isMacPlatform()
        ? (event.metaKey && !event.ctrlKey)
        : (event.ctrlKey && !event.metaKey)

      if (!commandOrControlOnly || event.altKey || event.shiftKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === shortcuts.closeTab.key) {
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

      if (key === shortcuts.toggleSidebar.key) {
        event.preventDefault()
        onToggleSidebar()
        return
      }

      if (key === shortcuts.toggleDetailPanel.key && hasDetailPanel) {
        event.preventDefault()
        onToggleDetailMinimize()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, shortcuts, activeTabId, hasDetailPanel, showSettings, onCloseSettings, onCloseTab, onToggleSidebar, onToggleDetailMinimize, onEscapeNav])
}
