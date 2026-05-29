export type BatchDeleteKind =
  | 'pod'
  | 'deployment'
  | 'daemonset'
  | 'statefulset'
  | 'replicaset'
  | 'job'
  | 'cronjob'
  | 'configmap'
  | 'secret'
  | 'service'
  | 'ingress';

export interface ResourceRef {
  namespace: string;
  name: string;
}

export interface BatchDeleteFailure extends ResourceRef {
  error: string;
}

export interface BatchDeleteResult {
  deleted: ResourceRef[];
  failed: BatchDeleteFailure[];
}
