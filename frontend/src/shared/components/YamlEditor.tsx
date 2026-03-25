import { memo, useEffect, useMemo, useRef, useState } from 'react'
import './YamlEditor.css'

interface Props {
  value: string
  onChange?: (next: string) => void
  readOnly?: boolean
  requireExplicitEdit?: boolean
  editSessionKey?: string
  minHeight?: number
  title?: string
  className?: string
}

function findSearchIndexes(value: string, query: string): number[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) {
    return []
  }

  const haystack = value.toLowerCase()
  const hits: number[] = []
  let cursor = 0
  while (cursor < haystack.length) {
    const index = haystack.indexOf(trimmed, cursor)
    if (index === -1) {
      break
    }
    hits.push(index)
    cursor = index + Math.max(trimmed.length, 1)
  }

  return hits
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function highlightStrings(value: string): string {
  const pattern = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g
  let cursor = 0
  let output = ''
  let match = pattern.exec(value)
  while (match) {
    output += escapeHtml(value.slice(cursor, match.index))
    output += `<span class="yaml-token-string">${escapeHtml(match[0])}</span>`
    cursor = match.index + match[0].length
    match = pattern.exec(value)
  }
  output += escapeHtml(value.slice(cursor))
  return output
}

function highlightValue(rawValue: string): string {
  if (rawValue.length === 0) {
    return ''
  }

  const commentMatch = rawValue.match(/^(.*?)(\s+#.*)$/)
  const valuePart = commentMatch ? commentMatch[1] : rawValue
  const commentPart = commentMatch ? commentMatch[2] : ''
  const trimmed = valuePart.trim()

  let valueHtml = highlightStrings(valuePart)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    valueHtml = `<span class="yaml-token-number">${escapeHtml(valuePart)}</span>`
  } else if (/^(true|false|null|yes|no|on|off)$/i.test(trimmed)) {
    valueHtml = `<span class="yaml-token-bool">${escapeHtml(valuePart)}</span>`
  }

  if (!commentPart) {
    return valueHtml
  }
  return `${valueHtml}<span class="yaml-token-comment">${escapeHtml(commentPart)}</span>`
}

function highlightLine(line: string): string {
  if (line.trim().length === 0) {
    return ' '
  }

  const indentMatch = line.match(/^(\s*)/)
  const indent = indentMatch ? indentMatch[1] : ''
  const trimmed = line.slice(indent.length)
  if (trimmed.startsWith('#')) {
    return `${escapeHtml(indent)}<span class="yaml-token-comment">${escapeHtml(trimmed)}</span>`
  }

  let rest = trimmed
  let result = escapeHtml(indent)
  if (rest.startsWith('- ')) {
    result += '<span class="yaml-token-punc">- </span>'
    rest = rest.slice(2)
  }

  const keyMatch = rest.match(/^([^"'#][^:]*?)(\s*:\s*)(.*)$/)
  if (keyMatch) {
    result += `<span class="yaml-token-key">${escapeHtml(keyMatch[1])}</span>`
    result += `<span class="yaml-token-punc">${escapeHtml(keyMatch[2])}</span>`
    result += highlightValue(keyMatch[3])
    return result
  }

  result += highlightValue(rest)
  return result
}

function highlightYaml(value: string): string {
  const lines = value.length === 0 ? [''] : value.split('\n')
  return lines.map((line, index) =>
    `<div class="yaml-line" data-ln="${index + 1}">${highlightLine(line)}</div>`
  ).join('')
}

const YamlEditor = memo(function YamlEditor({
  value,
  onChange,
  readOnly = false,
  requireExplicitEdit = true,
  editSessionKey,
  minHeight = 360,
  title = 'YAML',
  className,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightRef = useRef<HTMLPreElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const [hasFocusedMatch, setHasFocusedMatch] = useState(false)
  const [editUnlocked, setEditUnlocked] = useState(false)
  const canEdit = Boolean(onChange) && !readOnly
  const isReadOnly = !canEdit || (requireExplicitEdit && !editUnlocked)
  const searchQuery = searchValue.trim()

  const highlighted = useMemo(() => highlightYaml(value), [value])
  const searchMatches = useMemo(
    () => findSearchIndexes(value, searchQuery),
    [value, searchQuery],
  )

  const syncScrollNow = () => {
    const input = inputRef.current
    if (!input) {
      return
    }
    const { scrollTop } = input
    if (highlightRef.current) {
      if (Math.abs(highlightRef.current.scrollTop - scrollTop) > 0.5) {
        highlightRef.current.scrollTop = scrollTop
      }
    }
  }

  const scheduleSyncScroll = () => {
    if (rafRef.current !== null) {
      return
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      syncScrollNow()
    })
  }

  useEffect(() => {
    scheduleSyncScroll()
  }, [value])

  const focusSearchMatch = (index: number) => {
    if (!searchQuery || searchMatches.length === 0) {
      return
    }
    const input = inputRef.current
    if (!input) {
      return
    }
    const start = searchMatches[index]
    if (typeof start !== 'number') {
      return
    }
    const end = start + searchQuery.length
    input.focus()
    input.setSelectionRange(start, end)
    scheduleSyncScroll()
  }

  useEffect(() => {
    setSearchMatchIndex(0)
    setHasFocusedMatch(false)
  }, [searchQuery])

  useEffect(() => {
    if (searchMatches.length === 0) {
      setHasFocusedMatch(false)
      if (searchMatchIndex !== 0) {
        setSearchMatchIndex(0)
      }
      return
    }
    if (searchMatchIndex > searchMatches.length - 1) {
      setSearchMatchIndex(searchMatches.length - 1)
    }
  }, [searchMatchIndex, searchMatches])

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const root = rootRef.current
        if (!root) {
          return
        }

        const style = window.getComputedStyle(root)
        if (style.display === 'none' || style.visibility === 'hidden') {
          return
        }

        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener('keydown', handleFindShortcut)
    return () => window.removeEventListener('keydown', handleFindShortcut)
  }, [])

  useEffect(() => () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!canEdit || !requireExplicitEdit) {
      setEditUnlocked(false)
    }
  }, [canEdit, requireExplicitEdit])

  useEffect(() => {
    if (requireExplicitEdit) {
      setEditUnlocked(false)
    }
  }, [editSessionKey, requireExplicitEdit])

  const stepToNextMatch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) {
      return
    }
    const nextIndex = hasFocusedMatch
      ? (searchMatchIndex + direction + searchMatches.length) % searchMatches.length
      : direction === 1
        ? 0
        : searchMatches.length - 1
    setSearchMatchIndex(nextIndex)
    setHasFocusedMatch(true)
    focusSearchMatch(nextIndex)
  }

  const searchCounterLabel = searchQuery.length === 0
    ? ''
    : searchMatches.length === 0
      ? '0/0'
      : `${hasFocusedMatch ? Math.min(searchMatchIndex + 1, searchMatches.length) : 0}/${searchMatches.length}`

  return (
    <section ref={rootRef} className={`yaml-editor ${className ?? ''} ${isReadOnly ? 'is-readonly' : ''}`}>
      <header className="yaml-editor-toolbar">
        <div className="yaml-editor-toolbar-left">
          <span className="yaml-editor-dot red" />
          <span className="yaml-editor-dot yellow" />
          <span className="yaml-editor-dot green" />
          <span className="yaml-editor-title">{title}</span>
        </div>
        <div className="yaml-editor-toolbar-right">
          <div className="yaml-editor-search">
            <input
              ref={searchInputRef}
              type="search"
              className="yaml-editor-search-input"
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  stepToNextMatch(event.shiftKey ? -1 : 1)
                  return
                }
                if (event.key === 'Escape' && searchValue.length > 0) {
                  event.preventDefault()
                  setSearchValue('')
                  setHasFocusedMatch(false)
                }
              }}
              placeholder="Search..."
              aria-label="Search YAML"
            />
            {searchCounterLabel && (
              <span className="yaml-editor-search-count">{searchCounterLabel}</span>
            )}
          </div>
          {canEdit && requireExplicitEdit && (
            <button
              type="button"
              className={`yaml-editor-edit-btn ${editUnlocked ? 'is-active' : ''}`}
              onClick={() => {
                setEditUnlocked(current => {
                  const next = !current
                  if (next) {
                    window.requestAnimationFrame(() => inputRef.current?.focus())
                  }
                  return next
                })
              }}
            >
              {editUnlocked ? 'Lock' : 'Edit'}
            </button>
          )}
          <span className="yaml-editor-badge">{isReadOnly ? 'READ ONLY' : 'EDITABLE'}</span>
        </div>
      </header>

      <div className="yaml-editor-main" style={{ minHeight: `${minHeight}px` }}>
        <div className="yaml-editor-surface">
          <pre
            ref={highlightRef}
            className="yaml-editor-highlight"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
          <textarea
            ref={inputRef}
            className="yaml-editor-input"
            value={value}
            readOnly={isReadOnly}
            spellCheck={false}
            onChange={event => onChange?.(event.target.value)}
            onScroll={scheduleSyncScroll}
          />
        </div>
      </div>
    </section>
  )
})

export default YamlEditor
