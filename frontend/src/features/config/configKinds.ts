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
    case 'resource-quotas':
      return 'Resource Quota'
    case 'limit-ranges':
      return 'Limit Range'
    case 'hpas':
      return 'HPA'
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
    case 'resource-quotas':
      return 'Resource Quotas'
    case 'limit-ranges':
      return 'Limit Ranges'
    case 'hpas':
      return 'HPAs'
    default:
      return 'Config Resources'
  }
}
