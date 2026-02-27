import { useCallback, useEffect, useRef, useState } from 'react'
import { EventsOn, StartPodLogsStream, StopPodLogsStream } from '../../../../shared/api'
import { toPodLogsStreamEvent } from '../../../../shared/utils/normalization'
import type { PodLogLine, PodResource } from '../../../../shared/types'

const INITIAL_TAIL_LINES = 1000
const TAIL_STEP = 1000

interface UsePodLogsResult {
  podLogs: PodLogLine[]
  podLogsLoading: boolean
  podLogsError: string | null
  podLogsLoadingOlder: boolean
  loadOlderLogs: () => void
}

export function usePodLogs(
  clusterFilename: string,
  selectedPod: PodResource | null,
  enabled: boolean,
): UsePodLogsResult {
  const [podLogs, setPodLogs] = useState<PodLogLine[]>([])
  const [podLogsLoading, setPodLogsLoading] = useState(false)
  const [podLogsError, setPodLogsError] = useState<string | null>(null)
  const [podLogsLoadingOlder, setPodLogsLoadingOlder] = useState(false)
  const [tailLines, setTailLines] = useState(INITIAL_TAIL_LINES)
  const streamIDRef = useRef<string>('')

  const namespace = selectedPod?.namespace ?? ''
  const podName = selectedPod?.name ?? ''

  useEffect(() => {
    setTailLines(INITIAL_TAIL_LINES)
    setPodLogsLoadingOlder(false)
  }, [clusterFilename, namespace, podName])

  const loadOlderLogs = useCallback(() => {
    if (!enabled) {
      return
    }
    setPodLogsLoadingOlder(current => {
      if (current) {
        return current
      }
      setTailLines(value => value + TAIL_STEP)
      return true
    })
  }, [enabled])

  useEffect(() => {
    if (!namespace || !podName || !enabled) {
      setPodLogs([])
      setPodLogsLoading(false)
      setPodLogsError(null)
      setPodLogsLoadingOlder(false)
      return
    }

    let active = true
    let isFirstEvent = true
    streamIDRef.current = ''
    setPodLogsError(null)
    setPodLogsLoading(true)
    if (!podLogsLoadingOlder) {
      setPodLogs([])
    }

    const unsubscribe = EventsOn('pod-logs-stream', (payload: unknown) => {
      if (!active) {
        return
      }
      const event = toPodLogsStreamEvent(payload)
      if (
        event.clusterFilename !== clusterFilename
        || event.namespace !== namespace
        || event.podName !== podName
      ) {
        return
      }
      if (streamIDRef.current && streamIDRef.current !== event.streamId) {
        return
      }
      if (!streamIDRef.current) {
        streamIDRef.current = event.streamId
      }

      if (event.error) {
        setPodLogsError(event.error)
      } else {
        setPodLogsError(null)
        if (isFirstEvent) {
          setPodLogs(event.items)
        } else if (event.items.length > 0) {
          setPodLogs(current => [...current, ...event.items])
        }
      }

      isFirstEvent = false
      setPodLogsLoading(false)
      setPodLogsLoadingOlder(false)
    })

    void StartPodLogsStream(clusterFilename, namespace, podName, tailLines).then(streamID => {
      if (!active) {
        return
      }
      streamIDRef.current = streamID
    }).catch((errorValue: unknown) => {
      if (!active) {
        return
      }
      setPodLogsError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      setPodLogsLoading(false)
      setPodLogsLoadingOlder(false)
    })

    return () => {
      active = false
      unsubscribe()
      streamIDRef.current = ''
      void StopPodLogsStream()
    }
  }, [clusterFilename, namespace, podName, enabled, tailLines])

  return { podLogs, podLogsLoading, podLogsError, podLogsLoadingOlder, loadOlderLogs }
}
