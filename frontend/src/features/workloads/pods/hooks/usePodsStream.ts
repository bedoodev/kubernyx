import { useEffect, useRef, useState } from 'react'
import { EventsOn, StartPodsStream, StopPodsStream } from '../../../../shared/api'
import { toStreamEvent } from '../../../../shared/utils/normalization'
import type { PodResource } from '../../../../shared/types'

interface UsePodsStreamResult {
  items: PodResource[]
  loading: boolean
  error: string | null
}

export function usePodsStream(clusterFilename: string, selectedNamespaces: string[]): UsePodsStreamResult {
  const [items, setItems] = useState<PodResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const streamIdRef = useRef<string>('')

  useEffect(() => {
    let active = true
    streamIdRef.current = ''
    setLoading(true)
    setError(null)

    const unsubscribe = EventsOn('pods-stream', (payload: unknown) => {
      if (!active) {
        return
      }
      const event = toStreamEvent(payload)
      if (event.clusterFilename !== clusterFilename) {
        return
      }
      if (streamIdRef.current && streamIdRef.current !== event.streamId) {
        return
      }
      if (!streamIdRef.current) {
        streamIdRef.current = event.streamId
      }
      if (event.error) {
        setError(event.error)
      } else {
        setError(null)
      }
      setItems(event.items || [])
      setLoading(false)
    })

    void StartPodsStream(clusterFilename, selectedNamespaces).then(streamId => {
      if (!active) {
        return
      }
      streamIdRef.current = streamId
    }).catch((e: unknown) => {
      if (!active) {
        return
      }
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
      streamIdRef.current = ''
      void StopPodsStream()
    }
  }, [clusterFilename, selectedNamespaces])

  return { items, loading, error }
}
