import type { ConfigTabId } from '../../shared/types'

export type ImplementedConfigTabId = 'config-maps' | 'secrets'

export function isImplementedConfigTab(tab: ConfigTabId): tab is ImplementedConfigTabId {
  return tab === 'config-maps' || tab === 'secrets'
}

export function toConfigAPIKind(tab: ImplementedConfigTabId): 'configmap' | 'secret' {
  return tab === 'config-maps' ? 'configmap' : 'secret'
}

export function configSingularLabel(tab: ConfigTabId): string {
  switch (tab) {
    case 'config-maps':
      return 'Config Map'
    case 'secrets':
      return 'Secret'
    default:
      return 'Config Resource'
  }
}

export function configPluralLabel(tab: ConfigTabId): string {
  switch (tab) {
    case 'config-maps':
      return 'Config Maps'
    case 'secrets':
      return 'Secrets'
    default:
      return 'Config Resources'
  }
}
