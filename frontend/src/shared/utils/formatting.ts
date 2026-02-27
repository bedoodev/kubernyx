export function formatCPU(millis: number): string {
  return `${(millis / 1000).toFixed(2)} cores`
}

export function formatMem(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`
}

export function formatInt(value: number): string {
  return String(Math.max(0, Math.round(value)))
}

export function toPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Math.min((Math.max(0, value) / total) * 100, 100)
}

export function formatAgeFromUnix(createdAtUnix: number, nowUnix: number): string {
  const ageSeconds = Math.max(0, nowUnix - createdAtUnix)
  if (ageSeconds < 60) {
    return `${ageSeconds}s`
  }
  if (ageSeconds < 3600) {
    return `${Math.floor(ageSeconds / 60)}m`
  }
  if (ageSeconds < 86400) {
    return `${Math.floor(ageSeconds / 3600)}h`
  }
  if (ageSeconds < 86400 * 30) {
    return `${Math.floor(ageSeconds / 86400)}d`
  }
  return `${Math.floor(ageSeconds / (86400 * 30))}mo`
}
