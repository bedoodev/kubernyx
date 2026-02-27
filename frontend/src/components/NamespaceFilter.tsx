import { useState, useMemo, useRef, useEffect } from 'react'
import './NamespaceFilter.css'

interface Props {
  namespaces: string[]
  selected: string[]
  onChange: (ns: string[]) => void
}

export default function NamespaceFilter({ namespaces, selected, onChange }: Props) {
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
    if (selected.includes(ns)) {
      onChange(selected.filter(s => s !== ns))
    } else {
      onChange([...selected, ns])
    }
  }

  const allSelected = selected.length === 0
  const label = allSelected
    ? 'All namespaces'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} namespaces`

  return (
    <div className="ns-filter" ref={ref}>
      <div className="ns-filter-row">
        <span className="ns-label">Namespaces</span>
        <button className="ns-trigger" onClick={() => setOpen(!open)}>
          <span>{label}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

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
              <input type="checkbox" checked={allSelected} onChange={() => onChange([])} />
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
  )
}
