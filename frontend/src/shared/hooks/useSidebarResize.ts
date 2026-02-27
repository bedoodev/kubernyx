import { useState, useEffect, useRef, useCallback } from 'react'

interface UseSidebarResizeOptions {
  default: number
  min: number
  max: number
}

interface UseSidebarResizeResult {
  sidebarWidth: number
  sidebarResizing: boolean
  sidebarCollapsed: boolean
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void
  onToggle: () => void
}

export function useSidebarResize(options: UseSidebarResizeOptions): UseSidebarResizeResult {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(options.default)
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    if (!sidebarResizing || sidebarCollapsed) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const resizeStart = resizeStartRef.current
      if (!resizeStart) {
        return
      }
      const nextWidth = resizeStart.width + (event.clientX - resizeStart.x)
      setSidebarWidth(Math.min(options.max, Math.max(options.min, nextWidth)))
    }

    const stopResizing = () => {
      setSidebarResizing(false)
      resizeStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResizing)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [sidebarResizing, sidebarCollapsed, options.min, options.max])

  const onResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width: sidebarWidth }
    setSidebarResizing(true)
  }

  const onToggle = useCallback(() => {
    setSidebarCollapsed(current => !current)
    setSidebarResizing(false)
    resizeStartRef.current = null
  }, [])

  return {
    sidebarWidth,
    sidebarResizing,
    sidebarCollapsed,
    onResizeStart,
    onToggle,
  }
}
