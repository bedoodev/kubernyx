export function isMacPlatform(): boolean {
  const platform = (navigator.platform || '').toLowerCase()
  const userAgent = (navigator.userAgent || '').toLowerCase()
  return platform.includes('mac') || userAgent.includes('mac')
}
