export type NetworkTabId = 'services' | 'ingress';

export interface NetworkTabOption {
  id: NetworkTabId;
  label: string;
}

export const NETWORK_TAB_OPTIONS: NetworkTabOption[] = [
  { id: 'services', label: 'Services' },
  { id: 'ingress', label: 'Ingress' },
];
