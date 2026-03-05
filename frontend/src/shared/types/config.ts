export type ConfigTabId =
  | 'config-maps'
  | 'secrets'
  | 'resource-quotas'
  | 'limit-ranges'
  | 'hpas';

export interface ConfigTabOption {
  id: ConfigTabId;
  label: string;
}

export const CONFIG_TAB_OPTIONS: ConfigTabOption[] = [
  { id: 'config-maps', label: 'Config Maps' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'resource-quotas', label: 'Resource Quotas' },
  { id: 'limit-ranges', label: 'Limit Ranges' },
  { id: 'hpas', label: 'HPAs' },
];

export interface ConfigResource {
  name: string;
  namespace: string;
  keys: number;
  type: string;
  createdAtUnix?: number;
  age?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface ConfigDetail {
  name: string;
  namespace: string;
  type: string;
  created: string;
  uid: string;
  resourceVersion: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  data: Record<string, string>;
  events: Array<{ type: string; reason: string; message: string; count: number; age: string }>;
  manifest: string;
}
