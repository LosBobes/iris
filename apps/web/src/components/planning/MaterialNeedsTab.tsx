import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { useMaterialNeeds } from '@/hooks/useMaterialNeeds'
import { useOrganization } from '@/hooks/useOrganization'
import { formatStockQuantity } from '@/lib/stock/format'
import { cn } from '@/lib/utils'
import { formatWorkOrderDate } from '@/shared/utils/work-orders'
import type { MaterialNeedsItem, MaterialNeedsQuery, MaterialNeedsWeek } from '@/types/planning'

/** "DD.MM.–DD.MM." for a week column header. */
export function formatWeekRange(week: MaterialNeedsWeek): string {
  const short = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.`
  return `${short(week.start)}–${short(week.end)}`
}

const figure = (value: number | null): string => (value === null ? '—' : formatStockQuantity(value))

function MaterialRow({ item, weeks }: { item: MaterialNeedsItem; weeks: MaterialNeedsWeek[] }): React.JSX.Element {
  const { t } = useTranslation()
  const short = item.shortFromWeek !== null
  return (
    <tr data-short={short ? 'true' : undefined} className={cn(short && 'bg-destructive/5')}>
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <span className="flex flex-wrap items-center gap-2">
          {item.catalogItemId ? (
            <Link
              to={`/catalog/${encodeURIComponent(item.catalogItemId)}`}
              className="iris-focusable underline"
              aria-label={t('planning.materials.openArticle', { name: item.name })}
            >
              {item.name}
            </Link>
          ) : (
            <span title={t('planning.materials.notLinked')}>{item.name}</span>
          )}
          {short && (
            <span className="border border-destructive/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
              {t('planning.materials.short')}
            </span>
          )}
        </span>
      </th>
      <td className="px-3 py-2">{item.unit || '—'}</td>
      <td className="tnum px-3 py-2 text-right">{figure(item.onHand)}</td>
      <td className="tnum px-3 py-2 text-right">{figure(item.reserved)}</td>
      <td className={cn('tnum px-3 py-2 text-right', item.available !== null && item.available < 0 && 'text-destructive')}>
        {figure(item.available)}
      </td>
      {weeks.map((week, index) => {
        const firstShort = item.shortFromWeek === index
        return (
          <td
            key={week.start}
            data-short-start={firstShort ? 'true' : undefined}
            title={
              firstShort
                ? `${t('planning.materials.shortFrom')} · ${t('planning.materials.cumulative', { value: formatStockQuantity(item.cumulative[index] ?? 0) })}`
                : t('planning.materials.cumulative', { value: formatStockQuantity(item.cumulative[index] ?? 0) })
            }
            className={cn(
              'tnum px-3 py-2 text-right',
              (item.weeks[index] ?? 0) === 0 && 'text-[color:var(--iris-ink-mute)]',
              firstShort && 'border-x border-destructive/60 font-medium text-destructive',
            )}
          >
            {formatStockQuantity(item.weeks[index] ?? 0)}
          </td>
        )
      })}
      <td className={cn('tnum px-3 py-2 text-right', item.unplanned === 0 && 'text-[color:var(--iris-ink-mute)]')}>
        {formatStockQuantity(item.unplanned)}
      </td>
    </tr>
  )
}

function MaterialNeedsReport({ query }: { query: MaterialNeedsQuery }): React.JSX.Element {
  const { t } = useTranslation()
  const needs = useMaterialNeeds(query)

  if (needs.isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-[12px] text-[color:var(--iris-ink-soft)]">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
      </div>
    )
  }
  if (needs.isError) {
    return (
      <p role="alert" className="py-4 text-[12px] text-destructive">
        {t('planning.materials.loadError')}
      </p>
    )
  }
  const { weeks, items } = needs.data
  return (
    <div className="space-y-2">
      <p className="tnum text-[11px] text-[color:var(--iris-ink-soft)]">
        {t('planning.materials.window', { from: formatWorkOrderDate(needs.data.from), to: formatWorkOrderDate(needs.data.to) })}
      </p>
      {items.length === 0 ? (
        <p className="border border-border bg-card px-4 py-8 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t('planning.materials.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[720px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                <th scope="col" className="px-3 py-2 text-left font-normal">{t('planning.materials.material')}</th>
                <th scope="col" className="px-3 py-2 text-left font-normal">{t('planning.materials.unit')}</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">{t('planning.materials.onHand')}</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">{t('planning.materials.reserved')}</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">{t('planning.materials.available')}</th>
                {weeks.map((week) => (
                  <th key={week.start} scope="col" className="tnum px-3 py-2 text-right font-normal whitespace-nowrap">
                    {formatWeekRange(week)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-normal" title={t('planning.materials.unplannedHint')}>
                  {t('planning.materials.unplanned')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
              {items.map((item) => (
                <MaterialRow key={item.catalogItemId ?? `input:${item.name}:${item.unit}`} item={item} weeks={weeks} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * "Potrebe materijala" (D-028): input material per week from the published
 * plans' horizon against the stock. Needs both the planning and the stock
 * module; without stock nothing is requested.
 */
export function MaterialNeedsTab(): React.JSX.Element {
  const { t } = useTranslation()
  const { modules } = useOrganization()
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const enabled = modules.planning && modules.stock

  return (
    <section aria-labelledby="material-needs-heading" className="space-y-3">
      <div>
        <h2 id="material-needs-heading" className="text-[14px] font-medium">
          {t('planning.materials.title')}
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.materials.hint')}</p>
      </div>
      {!enabled ? (
        <p role="status" className="border border-border bg-card px-4 py-8 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t('planning.materials.needsStock')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker id="material-needs-from" value={from} onChange={setFrom} placeholder={t('planning.materials.from')} />
            <DatePicker id="material-needs-to" value={to} onChange={setTo} placeholder={t('planning.materials.to')} />
            {(from || to) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrom(null)
                  setTo(null)
                }}
              >
                {t('planning.materials.defaultWindow')}
              </Button>
            )}
          </div>
          <MaterialNeedsReport query={{ ...(from ? { from } : {}), ...(to ? { to } : {}) }} />
        </>
      )}
    </section>
  )
}
