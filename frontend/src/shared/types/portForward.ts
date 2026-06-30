export type PortForwardStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed' | string

export interface PortForwardRequest {
  clusterFilename: string
  namespace: string
  resourceKind: string
  resourceName: string
  localPort: number
  remotePort: number
}

export interface PortForwardSession {
  id: string
  clusterFilename: string
  namespace: string
  resourceKind: string
  resourceName: string
  localPort: number
  remotePort: number
  command: string
  status: PortForwardStatus
  message: string
  startedAtUnix: number
}
