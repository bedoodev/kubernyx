interface SearchableWorkload {
  name: string
  labels?: Record<string, string>
}

type SearchClause =
  | { type: 'name'; value: string }
  | { type: 'label'; key: string; value: string }

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

function parseLabelClause(value: string): SearchClause | null {
  const match = value.match(/^labels?\s*(?:=|:)(.+)$/i)
  if (!match) {
    return null
  }

  const labelValue = stripQuotes(match[1])
  const separatorIndex = labelValue.search(/[:=]/)
  if (separatorIndex <= 0 || separatorIndex === labelValue.length - 1) {
    return null
  }

  return {
    type: 'label',
    key: labelValue.slice(0, separatorIndex).trim().toLowerCase(),
    value: labelValue.slice(separatorIndex + 1).trim().toLowerCase(),
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
  return parseLabelClause(normalized) ?? parseNameClause(normalized)
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

function matchesLabel(labels: Record<string, string> | undefined, key: string, value: string): boolean {
  if (!labels) {
    return false
  }

  for (const [labelKey, labelValue] of Object.entries(labels)) {
    if (labelKey.toLowerCase() === key && labelValue.toLowerCase() === value) {
      return true
    }
  }

  return false
}

function matchesClause(item: SearchableWorkload, clause: SearchClause): boolean {
  if (clause.type === 'label') {
    return matchesLabel(item.labels, clause.key, clause.value)
  }
  return item.name.toLowerCase().includes(clause.value)
}

export function createWorkloadSearchMatcher(query: string): (item: SearchableWorkload) => boolean {
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
