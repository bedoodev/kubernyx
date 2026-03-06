export interface ClusterEvent {
  type: string;
  reason: string;
  objectKind: string;
  objectName: string;
  namespace: string;
  message: string;
  count: number;
  age: string;
  createdAtUnix: number;
}
