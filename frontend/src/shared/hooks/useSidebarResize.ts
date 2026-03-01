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

const COLLAPSE_THRESHOLD = 60

export function useSidebarResize(options: UseSidebarResizeOptions): UseSidebarResizeResult {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(options.default)
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)
  const collapsedDuringDragRef = useRef(false)
  const widthBeforeCollapseRef = useRef(options.default)

  useEffect(() => {
    if (!sidebarResizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (event: MouseEvent) => {
      const resizeStart = resizeStartRef.current
      if (!resizeStart) {
        return
      }
      const raw = resizeStart.width + (event.clientX - resizeStart.x)

      if (collapsedDuringDragRef.current) {
        if (raw >= options.min) {
          collapsedDuringDragRef.current = false
          setSidebarCollapsed(false)
          setSidebarWidth(Math.min(options.max, Math.max(options.min, raw)))
        }
        return
      }

      if (raw < options.min - COLLAPSE_THRESHOLD) {
        collapsedDuringDragRef.current = true
        widthBeforeCollapseRef.current = sidebarWidth
        setSidebarCollapsed(true)
        setSidebarWidth(0)
        return
      }

      setSidebarWidth(Math.min(options.max, Math.max(options.min, raw)))
    }

    const stopResizing = () => {
      collapsedDuringDragRef.current = false
      setSidebarResizing(false)
      resizeStartRef.current = null
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResizing)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResizing)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [sidebarResizing, sidebarWidth, options.min, options.max])

  const onResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width: sidebarWidth }
    collapsedDuringDragRef.current = false
    setSidebarResizing(true)
  }

  const onToggle = useCallback(() => {
    setSidebarCollapsed(current => {
      if (current) {
        setSidebarWidth(widthBeforeCollapseRef.current || options.default)
      } else {
        widthBeforeCollapseRef.current = sidebarWidth
      }
      return !current
    })
    setSidebarResizing(false)
    resizeStartRef.current = null
  }, [sidebarWidth, options.default])

  return {
    sidebarWidth,
    sidebarResizing,
    sidebarCollapsed,
    onResizeStart,
    onToggle,
  }
}
