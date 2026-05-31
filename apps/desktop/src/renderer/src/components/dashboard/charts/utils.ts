const SR_MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'avg',
  'sep',
  'okt',
  'nov',
  'dec',
] as const

export function getLast12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/** Twelve calendar months ending at yyyyMM (inclusive). */
export function get12MonthsEndingAt(yyyyMM: string): string[] {
  const [year, month] = yyyyMM.split('-').map(Number)
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/**
 * Picks the chart x-axis months. Uses the rolling last-12-months window when any
 * data falls inside it; otherwise anchors the window on the latest data month so
 * historical records remain visible.
 */
export function resolveChartMonths(dataMonths: string[]): string[] {
  const rolling = getLast12Months()
  if (dataMonths.length === 0) return rolling

  const rollingMonths = new Set(rolling)
  if (dataMonths.some((month) => rollingMonths.has(month))) return rolling

  const latestData = dataMonths.reduce((max, month) => (month > max ? month : max))
  return get12MonthsEndingAt(latestData)
}

export function formatRevenueAxisTick(value: number): string {
  if (value === 0) return '0'
  if (Math.abs(value) < 1000) return String(Math.round(value))
  return `${Math.round(value / 1000)}k`
}

export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  return `${SR_MONTH_NAMES[parseInt(month) - 1]} '${year.slice(2)}`
}

export function formatRSD(value: number): string {
  return `${value.toLocaleString('sr-RS')} RSD`
}
