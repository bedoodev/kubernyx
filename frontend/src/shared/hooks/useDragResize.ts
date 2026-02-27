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
}

export function useDragResize({ onUpdate, invertDelta = false }: UseDragResizeOptions) {
  const [isResizing, setIsResizing] = useState(false)
  const resizeStateRef = useRef<DragResizeState | null>(null)

  const start = (
    event: ReactMouseEvent<HTMLButtonElement>,
    startWidth: number,
    minWidth: number,
    maxWidth: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStateRef.current = { startX: event.clientX, startWidth, minWidth, maxWidth }
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
      const nextWidth = Math.min(state.maxWidth, Math.max(state.minWidth, raw))
      onUpdate(nextWidth)
    }

    const stopResize = () => {
      resizeStateRef.current = null
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
  }, [isResizing, invertDelta, onUpdate])

  return { isResizing, start }
}
