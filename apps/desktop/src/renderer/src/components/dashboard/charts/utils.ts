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

export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  return `${SR_MONTH_NAMES[parseInt(month) - 1]} '${year.slice(2)}`
}

export function formatRSD(value: number): string {
  return `${value.toLocaleString('sr-RS')} RSD`
}
