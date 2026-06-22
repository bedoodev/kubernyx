import { useCallback, useState } from 'react'

const searchCache = new Map<string, string>()

export function useScopedSearch(scope: string): [string, (value: string) => void] {
  const [searchByScope, setSearchByScope] = useState<Record<string, string>>({})
  const search = searchByScope[scope] ?? searchCache.get(scope) ?? ''

  const setSearch = useCallback((value: string) => {
    searchCache.set(scope, value)
    setSearchByScope(current => ({ ...current, [scope]: value }))
  }, [scope])

  return [search, setSearch]
}
