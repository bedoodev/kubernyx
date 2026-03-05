import React from 'react'

export type LogToneKey = 'error' | 'success' | 'warning' | 'debug' | 'default'

export function valueToneClass(value: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  const normalized = value.trim().toLowerCase()
  if (normalized === '' || normalized === '-') {
    return 'neutral'
  }
  if (
    normalized.includes('true')
    || normalized.includes('yes')
    || normalized.includes('running')
    || normalized.includes('ready')
    || normalized.includes('available')
    || normalized.includes('updated')
  ) {
    return 'ok'
  }
  if (normalized.includes('false') || normalized.includes('failed') || normalized.includes('error') || normalized.includes('unavailable')) {
    return 'bad'
  }
  if (normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('terminating') || normalized.includes('updating') || normalized.includes('unknown')) {
    return 'warn'
  }
  return 'neutral'
}

export function formatCommandDisplay(parts: string[]): string {
  const filtered = parts.map(item => item.trim()).filter(Boolean)
  if (filtered.length === 0) {
    return '-'
  }
  if (filtered.length > 1) {
    return filtered.join('\n')
  }
  const single = filtered[0]
  if (!single.includes(' --')) {
    return single
  }
  const normalized = single.replace(/\s+/g, ' ').trim()
  return normalized.replace(/\s+(--[^\s]+)/g, '\n$1')
}

export function tryFormatLongJSONValue(rawValue: string): string | null {
  const trimmed = rawValue.trim()
  if (trimmed.length < 72) {
    return null
  }

  const looksLikeJSON = (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  )
  if (!looksLikeJSON) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

export function isLongMetadataValue(displayValue: string): boolean {
  if (displayValue.length > 900) {
    return true
  }
  return displayValue.split('\n').length > 14
}

export function renderMetadataValue(
  value: string,
  options?: {
    prettyJson?: string | null
    collapsed?: boolean
  },
) {
  const safeValue = value.trim() ? value : '-'
  const resolvedPrettyJson = options?.prettyJson ?? tryFormatLongJSONValue(safeValue)
  const collapsedClass = options?.collapsed ? ' is-collapsed' : ''
  if (!resolvedPrettyJson) {
    return <span className={`pods-meta-text-value${collapsedClass}`}>{safeValue}</span>
  }

  return (
    <code className={`pods-meta-json-value${collapsedClass}`}>{resolvedPrettyJson}</code>
  )
}

export function syncToggleState(current: Record<string, boolean>, keys: string[], defaultValue: boolean): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const key of keys) {
    next[key] = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : defaultValue
  }
  return next
}

export function detectLogTone(message: string): LogToneKey {
  const value = message.toLowerCase()
  if (/\b(error|fatal|panic|exception|traceback)\b/.test(value)) {
    return 'error'
  }
  if (/\b(warn|warning)\b/.test(value)) {
    return 'warning'
  }
  if (/\b(debug)\b/.test(value)) {
    return 'debug'
  }
  if (/\b(info|success|succeeded|successful|ok)\b/.test(value)) {
    return 'success'
  }
  return 'default'
}

export function matchesLogLevel(message: string, filter: string): boolean {
  if (filter === 'all') {
    return true
  }
  const tone = detectLogTone(message)
  if (filter === 'info') {
    return tone === 'success'
  }
  return tone === filter
}

export function formatMapAsInline(mapValue: Record<string, string> | undefined, fallback = '-'): string {
  if (!mapValue) {
    return fallback
  }
  const entries = Object.entries(mapValue)
  if (entries.length === 0) {
    return fallback
  }
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')
}
