// Formatting for the operator dashboard. Numbers use the Serbian grouping the
// rest of the app uses; dates are shown DD.MM.YYYY like everywhere else.

const numberFormat = new Intl.NumberFormat('sr-Latn-RS')

export function formatCount(value: number): string {
  return numberFormat.format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[exponent]}`
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD` → `DD.MM.YYYY`, without timezone shifts. */
export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

/** `DD.MM.` for chart axes. */
export function formatShortDate(value: string): string {
  const [, month, day] = value.slice(0, 10).split('-')
  return `${day}.${month}.`
}

/** An ISO timestamp → local `DD.MM.YYYY HH:mm`; null/invalid → null. */
export function formatDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) return formatDate(value)
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
