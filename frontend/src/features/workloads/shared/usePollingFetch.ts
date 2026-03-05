import { useEffect, useRef, useState } from 'react'

interface UsePollingFetchResult<T> {
  data: T
  loading: boolean
  error: string | null
}

/**
 * Generic polling hook that fetches data on an interval with request deduplication.
 * Used by useDeploymentDetail, usePodDetail, useDeploymentLogs, and useDeployments.
 */
export function usePollingFetch<T>(
  fetcher: (() => Promise<T>) | null,
  defaultValue: T,
  intervalMs: number,
  deps: unknown[],
): UsePollingFetchResult<T> {
  const [data, setData] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!fetcher) {
      setData(defaultValue)
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const requestId = requestRef.current + 1
    requestRef.current = requestId

    const load = async (initial: boolean) => {
      if (initial) {
        setLoading(true)
      }
      try {
        const result = await fetcher()
        if (!active || requestRef.current !== requestId) return
        setData(result)
        setError(null)
      } catch (errorValue: unknown) {
        if (!active || requestRef.current !== requestId) return
        setData(defaultValue)
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      } finally {
        if (!active || requestRef.current !== requestId) return
        setLoading(false)
      }
    }

    void load(true)
    const timer = window.setInterval(() => {
      void load(false)
    }, intervalMs)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error }
}
