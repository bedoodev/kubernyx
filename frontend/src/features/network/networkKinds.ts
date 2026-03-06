import type { NetworkTabId } from '../../shared/types'

export type NetworkAPIKind = 'service' | 'ingress'

export function toNetworkAPIKind(tab: NetworkTabId): NetworkAPIKind {
  return tab === 'services' ? 'service' : 'ingress'
}

export function networkSingularLabel(tab: NetworkTabId): string {
  return tab === 'services' ? 'Service' : 'Ingress'
}

export function networkPluralLabel(tab: NetworkTabId): string {
  return tab === 'services' ? 'Services' : 'Ingresses'
}
