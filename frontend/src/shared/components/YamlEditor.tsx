import { memo, useEffect, useMemo, useRef } from 'react'
import './YamlEditor.css'

interface Props {
  value: string
  onChange?: (next: string) => void
  readOnly?: boolean
  minHeight?: number
  title?: string
  className?: string
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
  minHeight = 360,
  title = 'YAML',
  className,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightRef = useRef<HTMLPreElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const isReadOnly = readOnly || !onChange

  const highlighted = useMemo(() => highlightYaml(value), [value])

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

  useEffect(() => () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  return (
    <section className={`yaml-editor ${className ?? ''} ${isReadOnly ? 'is-readonly' : ''}`}>
      <header className="yaml-editor-toolbar">
        <div className="yaml-editor-toolbar-left">
          <span className="yaml-editor-dot red" />
          <span className="yaml-editor-dot yellow" />
          <span className="yaml-editor-dot green" />
          <span className="yaml-editor-title">{title}</span>
        </div>
        <span className="yaml-editor-badge">{isReadOnly ? 'READ ONLY' : 'EDITABLE'}</span>
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
