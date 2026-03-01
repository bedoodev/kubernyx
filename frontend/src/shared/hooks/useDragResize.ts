import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

interface DragResizeState {
  startX: number
  startWidth: number
  minWidth: number
  maxWidth: number
}

interface UseDragResizeOptions {
  onUpdate: (nextWidth: number) => void
  /** If true, delta is subtracted from startWidth (for right-to-left resize). Default: false (left-to-right). */
  invertDelta?: boolean
  /** Called when the user drags past the collapse threshold (below minWidth). */
  onCollapseSnap?: () => void
  /** Called when the user drags back above minWidth after having collapsed. */
  onExpandSnap?: () => void
}

export function useDragResize({ onUpdate, invertDelta = false, onCollapseSnap, onExpandSnap }: UseDragResizeOptions) {
  const [isResizing, setIsResizing] = useState(false)
  const resizeStateRef = useRef<DragResizeState | null>(null)
  const collapsedRef = useRef(false)

  const start = (
    event: ReactMouseEvent<HTMLButtonElement>,
    startWidth: number,
    minWidth: number,
    maxWidth: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStateRef.current = { startX: event.clientX, startWidth, minWidth, maxWidth }
    collapsedRef.current = false
    setIsResizing(true)
  }

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current
      if (!state) {
        return
      }
      const delta = event.clientX - state.startX
      const raw = invertDelta ? state.startWidth - delta : state.startWidth + delta

      if (collapsedRef.current) {
        if (onExpandSnap && raw >= state.minWidth) {
          collapsedRef.current = false
          onExpandSnap()
          const nextWidth = Math.min(state.maxWidth, Math.max(state.minWidth, raw))
          onUpdate(nextWidth)
        }
        return
      }

      if (onCollapseSnap && raw < state.minWidth - 60) {
        collapsedRef.current = true
        onCollapseSnap()
        return
      }

      const nextWidth = Math.min(state.maxWidth, Math.max(state.minWidth, raw))
      onUpdate(nextWidth)
    }

    const stopResize = () => {
      resizeStateRef.current = null
      collapsedRef.current = false
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [isResizing, invertDelta, onUpdate, onCollapseSnap, onExpandSnap])

  return { isResizing, start }
}
