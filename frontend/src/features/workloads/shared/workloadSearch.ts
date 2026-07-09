interface SearchableResource {
  name: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

type SearchClause =
  | { type: 'name'; value: string }
  | { type: 'metadata'; field: 'labels' | 'annotations'; value: string }

type SearchExpression = SearchClause[][]

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function tokenizeSearch(query: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null

  for (let index = 0; index < query.length; index += 1) {
    const char = query[index]
    if (quote) {
      current += char
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    if ((char === '&' && query[index + 1] === '&') || (char === '|' && query[index + 1] === '|')) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      tokens.push(char + query[index + 1])
      index += 1
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function parseMetadataClause(value: string): SearchClause | null {
  const match = value.match(/^(labels?|annotations?)\s*(?:=|:)(.+)$/i)
  if (!match) return null

  const metadataValue = stripQuotes(match[2]).toLowerCase()
  if (!metadataValue) return null

  return {
    type: 'metadata',
    field: match[1].toLowerCase().startsWith('annotation') ? 'annotations' : 'labels',
    value: metadataValue,
  }
}

function parseNameClause(value: string): SearchClause {
  const explicitNameMatch = value.match(/^(?:name|pod|workload)\s*(?:=|:)(.+)$/i)
  return {
    type: 'name',
    value: stripQuotes(explicitNameMatch ? explicitNameMatch[1] : value).toLowerCase(),
  }
}

function parseClause(token: string): SearchClause | null {
  const normalized = stripQuotes(token)
  if (!normalized) {
    return null
  }
  return parseMetadataClause(normalized) ?? parseNameClause(normalized)
}

function parseSearchExpression(query: string): SearchExpression {
  const tokens = tokenizeSearch(query)
  const expression: SearchExpression = [[]]

  for (const token of tokens) {
    const lowerToken = token.toLowerCase()
    if (lowerToken === '&&' || lowerToken === 'and') {
      continue
    }
    if (lowerToken === '||' || lowerToken === 'or') {
      if (expression[expression.length - 1].length > 0) {
        expression.push([])
      }
      continue
    }

    const clause = parseClause(token)
    if (clause) {
      expression[expression.length - 1].push(clause)
    }
  }

  return expression.filter(group => group.length > 0)
}

function matchesMetadata(metadata: Record<string, string> | undefined, query: string): boolean {
  if (!metadata) {
    return false
  }

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.toLowerCase()
    const normalizedValue = value.toLowerCase()
    if (
      normalizedKey.includes(query)
      || normalizedValue.includes(query)
      || `${normalizedKey}=${normalizedValue}`.includes(query)
      || `${normalizedKey}:${normalizedValue}`.includes(query)
    ) {
      return true
    }
  }

  return false
}

function matchesClause(item: SearchableResource, clause: SearchClause): boolean {
  if (clause.type === 'metadata') {
    return matchesMetadata(item[clause.field], clause.value)
  }
  return item.name.toLowerCase().includes(clause.value)
}

export function createResourceSearchMatcher(query: string): (item: SearchableResource) => boolean {
  const trimmed = query.trim()
  if (!trimmed) {
    return () => true
  }

  const expression = parseSearchExpression(trimmed)
  if (expression.length === 0) {
    const fallback = trimmed.toLowerCase()
    return item => item.name.toLowerCase().includes(fallback)
  }

  return item => expression.some(group => group.every(clause => matchesClause(item, clause)))
}

export function createWorkloadSearchMatcher(query: string): (item: SearchableResource) => boolean {
  return createResourceSearchMatcher(query)
}
