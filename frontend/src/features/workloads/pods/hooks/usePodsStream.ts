import { useEffect, useRef, useState } from 'react'
import { EventsOn, StartPodsStream, StopPodsStream } from '../../../../shared/api'
import { toStreamEvent } from '../../../../shared/utils/normalization'
import type { PodResource, PodsStreamEvent } from '../../../../shared/types'

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
  const pendingEventsRef = useRef<Map<string, PodsStreamEvent>>(new Map())
  const initialErrorCountRef = useRef(0)
  const hasFirstSuccessfulSnapshotRef = useRef(false)
  const namespacesKey = selectedNamespaces.join('\u0000')

  useEffect(() => {
    let active = true
    streamIdRef.current = ''
    pendingEventsRef.current.clear()
    initialErrorCountRef.current = 0
    hasFirstSuccessfulSnapshotRef.current = false
    setError(null)

    if (selectedNamespaces.length === 0) {
      setItems([])
      setLoading(false)
      return () => {
        active = false
        streamIdRef.current = ''
      }
    }

    setLoading(true)

    const applyStreamEvent = (event: PodsStreamEvent) => {
      const nextItems = event.items || []
      if (event.error) {
        setItems(nextItems)
        if (!hasFirstSuccessfulSnapshotRef.current) {
          initialErrorCountRef.current += 1
          // Ignore the first transient error while initial data is still loading.
          if (initialErrorCountRef.current < 2) {
            setError(null)
            setLoading(true)
            return
          }
        }
        setError(event.error)
        setLoading(false)
        return
      }

      hasFirstSuccessfulSnapshotRef.current = true
      initialErrorCountRef.current = 0
      setError(null)
      setItems(nextItems)
      setLoading(false)
    }

    const unsubscribe = EventsOn('pods-stream', (payload: unknown) => {
      if (!active) {
        return
      }
      const event = toStreamEvent(payload)
      if (event.clusterFilename !== clusterFilename) {
        return
      }
      if (!streamIdRef.current) {
        if (event.streamId) {
          pendingEventsRef.current.set(event.streamId, event)
        }
        return
      }
      if (streamIdRef.current !== event.streamId) {
        return
      }
      applyStreamEvent(event)
    })

    void StartPodsStream(clusterFilename, selectedNamespaces).then(streamId => {
      if (!active) {
        return
      }
      streamIdRef.current = streamId
      const pending = pendingEventsRef.current.get(streamId)
      if (pending) {
        pendingEventsRef.current.delete(streamId)
        applyStreamEvent(pending)
      }
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
      pendingEventsRef.current.clear()
      void StopPodsStream()
    }
  }, [clusterFilename, namespacesKey])

  return { items, loading, error }
}
