import { useId, type ReactNode } from 'react'
import './Modal.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  variant?: 'default' | 'confirmation'
  tone?: 'danger' | 'warning' | 'info'
}

export default function Modal({
  title,
  onClose,
  children,
  className,
  variant = 'default',
  tone = 'info',
}: Props) {
  const isConfirmation = variant === 'confirmation'
  const titleId = useId()
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-shell ${isConfirmation ? `is-confirmation tone-${tone}` : ''} ${className ?? ''}`}
        onClick={event => event.stopPropagation()}
        role={isConfirmation ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            {isConfirmation && (
              <span className="modal-confirm-icon" aria-hidden="true">
                {tone === 'danger' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3 2.7 20h18.6L12 3Z" />
                    <path d="M12 9v5M12 17.5h.01" />
                  </svg>
                )}
              </span>
            )}
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}
