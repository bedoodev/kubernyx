export type TerminalTargetKind = 'cluster' | 'pod' | 'node';

export interface TerminalTarget {
  kind: TerminalTargetKind;
  filename: string;
  namespace?: string;
  podName?: string;
  container?: string;
  nodeName?: string;
}

export type TerminalStatusState =
  | 'connecting'
  | 'connected'
  | 'creating-debug-pod'
  | 'failed'
  | 'cleaning-up'
  | 'closed';

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
  error?: string;
}

export interface TerminalStatusEvent {
  sessionId: string;
  state: TerminalStatusState | string;
  message?: string;
}
