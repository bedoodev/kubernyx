import { useState, useMemo, useRef, useEffect } from 'react'
import './NamespaceFilter.css'

interface Props {
  namespaces: string[]
  selected: string[]
  onChange: (ns: string[]) => void
  className?: string
  emptyMeansAll?: boolean
}

export default function NamespaceFilter({
  namespaces,
  selected,
  onChange,
  className,
  emptyMeansAll = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    if (!search) return namespaces
    const q = search.toLowerCase()
    return namespaces.filter(ns => ns.toLowerCase().includes(q))
  }, [namespaces, search])

  const toggle = (ns: string) => {
    if (emptyMeansAll && selected.length === 0) {
      onChange(namespaces.filter(item => item !== ns))
      return
    }
    if (selected.includes(ns)) {
      onChange(selected.filter(s => s !== ns))
    } else {
      onChange([...selected, ns])
    }
  }

  const allExplicitlySelected = namespaces.length > 0 && namespaces.every(ns => selected.includes(ns))
  const allSelected = emptyMeansAll
    ? selected.length === 0 || allExplicitlySelected
    : allExplicitlySelected

  const label = allSelected
    ? 'All namespaces'
    : selected.length === 0
      ? 'Select namespaces'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} namespaces`

  const rootClassName = className ? `ns-filter ${className}` : 'ns-filter'

  return (
    <div className={rootClassName} ref={ref}>
      <div className="ns-filter-row">
        <span className="ns-label">Namespaces</span>
        <div className="ns-control">
          <button
            type="button"
            className={`ns-trigger ${open ? 'open' : ''}`}
            onClick={() => setOpen(!open)}
          >
            <span className="ns-trigger-value">{label}</span>
            <svg className="ns-trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {open && (
            <div className="ns-dropdown">
              <input
                className="ns-search"
                placeholder="Search namespaces..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <div className="ns-options">
                <label className="ns-option">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (emptyMeansAll) {
                        onChange([])
                        return
                      }
                      onChange(allSelected ? [] : [...namespaces])
                    }}
                  />
                  <span>All namespaces</span>
                </label>
                {filtered.map(ns => (
                  <label key={ns} className="ns-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(ns)}
                      onChange={() => toggle(ns)}
                    />
                    <span>{ns}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
