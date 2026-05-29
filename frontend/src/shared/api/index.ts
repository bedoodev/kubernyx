export {
  GetBasePath,
  SetBasePath,
  SelectDirectory,
  ListClusters,
  ConnectCluster,
  RefreshOverview,
  GetWorkloads,
  AddCluster,
  RenameCluster,
  DeleteCluster,
  DeleteDeploymentResource,
  DeletePodResource,
  DeleteWorkloadResource,
  GetClusterConfig,
  UpdateClusterConfig,
  GetDeploymentResources,
  GetDeploymentDetails,
  GetDeploymentLogs,
  GetWorkloadResources,
  GetWorkloadDetails,
  GetWorkloadLogs,
  UpdateDeploymentManifest,
  UpdateWorkloadManifest,
  ScaleDeployment,
  ScaleWorkload,
  SetCronJobSuspendResource,
  GetPodDetails,
  GetPodLogs,
  CompleteClusterKubectl,
  ExecClusterKubectl,
  ExecPodCommand,
  SavePodLogsFile,
  StartPodLogsStream,
  StartPodsStream,
  StopPodLogsStream,
  StopPodsStream,
  TriggerCronJobResource,
  GetNodeResources,
  GetNodeDetail,
  DebugNode,
  GetClusterEvents,
  RestartWorkload,
} from '../../../wailsjs/go/main/App'

export { EventsOn } from '../../../wailsjs/runtime/runtime'

import type { BatchDeleteKind, BatchDeleteResult, ResourceRef, TerminalTarget } from '../types'

type WailsAppBridge = {
  DeleteResourcesBatch: (filename: string, kind: BatchDeleteKind, items: ResourceRef[]) => Promise<BatchDeleteResult>
  StartTerminalSession: (sessionId: string, target: TerminalTarget) => Promise<void>
  WriteTerminalInput: (sessionId: string, data: string) => Promise<void>
  ResizeTerminalSession: (sessionId: string, cols: number, rows: number) => Promise<void>
  CloseTerminalSession: (sessionId: string) => Promise<void>
}

function getAppBridge(): WailsAppBridge {
  const bridge = (window as typeof window & { go?: { main?: { App?: WailsAppBridge } } }).go?.main?.App
  if (!bridge) {
    throw new Error('Wails app bridge is unavailable')
  }
  return bridge
}

export function DeleteResourcesBatch(filename: string, kind: BatchDeleteKind, items: ResourceRef[]): Promise<BatchDeleteResult> {
  return getAppBridge().DeleteResourcesBatch(filename, kind, items)
}

export function StartTerminalSession(sessionId: string, target: TerminalTarget): Promise<void> {
  return getAppBridge().StartTerminalSession(sessionId, target)
}

export function WriteTerminalInput(sessionId: string, data: string): Promise<void> {
  return getAppBridge().WriteTerminalInput(sessionId, data)
}

export function ResizeTerminalSession(sessionId: string, cols: number, rows: number): Promise<void> {
  return getAppBridge().ResizeTerminalSession(sessionId, cols, rows)
}

export function CloseTerminalSession(sessionId: string): Promise<void> {
  return getAppBridge().CloseTerminalSession(sessionId)
}
