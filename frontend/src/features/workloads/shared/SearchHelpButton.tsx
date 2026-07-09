import { useEffect, useRef, useState } from 'react'

interface Props {
  entityLabel: string
}

export default function SearchHelpButton({ entityLabel }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="pods-search-help" ref={rootRef}>
      <button
        type="button"
        className={`pods-search-help-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen(current => !current)}
        aria-label="Show search help"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Search help"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <div className="pods-search-help-popover" role="dialog" aria-label="Search help">
          <strong>Search syntax</strong>
          <p>Plain text matches {entityLabel} names. Label and annotation searches match partial keys, values, key=value, and key:value.</p>
          <dl>
            <div>
              <dt>Name</dt>
              <dd><code>datainfra</code></dd>
            </div>
            <div>
              <dt>Label</dt>
              <dd><code>label='app=backend'</code></dd>
            </div>
            <div>
              <dt>Annotation</dt>
              <dd><code>annotation=sidecar</code></dd>
            </div>
            <div>
              <dt>AND</dt>
              <dd><code>label=team:infra && datainfra</code></dd>
            </div>
            <div>
              <dt>OR</dt>
              <dd><code>label=api || annotation=webhook</code></dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
