import { Fragment, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { usePlanDay } from '@/hooks/usePlanning'
import { useWorkstationLoad } from '@/hooks/useWorkstationLoad'
import { MAX_LOAD_DAYS } from '@/lib/planning/fixture-load'
import {
  addDays,
  calendarDates,
  formatLoadMinutes,
  loadBand,
  loadFill,
  loadPercent,
  rangeLength,
  type LoadBand,
} from '@/lib/planning/load-view'
import { cn } from '@/lib/utils'
import { formatWorkOrderDate } from '@/shared/utils/work-orders'
import type { LoadSource, WorkstationLoad, WorkstationLoadBlock, WorkstationLoadQuery } from '@/types/planning'

// "Zauzetost" (workstation load, D-028): one row per machine type (expandable to
// its units) and one per person, with a bar per day filled planned/available.
// Bands: under 80 % neutral, 80–100 % amber, over 100 % red ("preopterećeno");
// days off, units out of service and absent people are hatched. Colours come
// from theme tokens (or light/dark pairs) so they read in both themes, and every
// band also has a text label (popover, aria-label, legend, warning icon).

const BAR_CLASS: Record<Exclude<LoadBand, 'off'>, string> = {
  under: 'bg-[color:var(--iris-status-draft)]',
  near: 'bg-amber-600 dark:bg-amber-400',
  over: 'bg-destructive',
}

const HATCH_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, var(--iris-ink-faint) 0 1px, transparent 1px 5px)',
}

interface CellData {
  rowLabel: string
  date: string
  planned: number
  available: number
  blocks: readonly WorkstationLoadBlock[]
  /** The pseudo type "Bez mašine": no machine capacity, planned time only. */
  noCapacity?: boolean
  /** Shown instead of the generic "day off" when nothing is available (out of service, absent). */
  offLabel: string
}

function bandLabel(band: LoadBand, t: (key: string) => string): string | null {
  if (band === 'over') return t('planning.load.overloaded')
  if (band === 'near') return t('planning.load.nearlyFull')
  return null
}

function LoadCell({ cell, onOpenDay }: { cell: CellData; onOpenDay: (date: string) => void }): React.JSX.Element {
  const { t } = useTranslation()
  const band: LoadBand | 'none' = cell.noCapacity
    ? cell.planned > 0
      ? 'none'
      : 'off'
    : loadBand(cell.planned, cell.available)
  const fill = band === 'none' ? 0 : loadFill(cell.planned, cell.available)
  const percent = cell.noCapacity ? null : loadPercent(cell.planned, cell.available)
  const date = formatWorkOrderDate(cell.date)
  const planned = formatLoadMinutes(cell.planned)
  const available = formatLoadMinutes(cell.available)
  const state = band === 'off' ? cell.offLabel : band === 'none' ? t('planning.load.noCapacity') : bandLabel(band, t)
  const ariaLabel = [
    cell.noCapacity
      ? t('planning.load.cellAriaNoCapacity', { row: cell.rowLabel, date, planned })
      : t('planning.load.cellAria', { row: cell.rowLabel, date, planned, available }),
    percent !== null ? t('planning.load.percent', { value: percent }) : null,
    state,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          data-band={band}
          className="iris-focusable group relative mx-auto flex h-9 w-5 items-end overflow-hidden bg-[color:var(--iris-border-soft)]"
          style={band === 'off' ? HATCH_STYLE : undefined}
        >
          {band !== 'off' && band !== 'none' && (
            <span
              aria-hidden
              className={cn('block w-full', BAR_CLASS[band])}
              style={{ height: `${Math.max(fill * 100, cell.planned > 0 ? 6 : 0)}%` }}
            />
          )}
          {band === 'none' && (
            <span aria-hidden className="tnum block w-full text-center text-[8px] leading-9 text-[color:var(--iris-ink-soft)]">
              {Math.round(cell.planned / 60)}
            </span>
          )}
          {band === 'over' && (
            <AlertTriangle aria-hidden className="absolute top-0.5 left-1/2 size-3 -translate-x-1/2 text-destructive-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 text-[12px]">
        <div>
          <p className="font-medium">{cell.rowLabel}</p>
          <p className="tnum text-[11px] text-[color:var(--iris-ink-soft)]">{date}</p>
        </div>
        <p className="tnum">
          {cell.noCapacity ? planned : t('planning.load.ofAvailable', { planned, available })}
          {percent !== null && ` · ${t('planning.load.percent', { value: percent })}`}
          {state && (
            <span className={cn('ml-1', band === 'over' && 'font-medium text-destructive')}>
              {band === 'over' && <AlertTriangle aria-hidden className="mr-0.5 inline size-3 align-[-2px]" />}
              {state}
            </span>
          )}
        </p>
        {cell.blocks.length === 0 ? (
          <p className="text-[color:var(--iris-ink-mute)]">{t('planning.load.noBlocks')}</p>
        ) : (
          <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border">
            {cell.blocks.map((block) => (
              <li key={`${block.workOrderId}-${block.stepNodeId}-${block.start}`} className="flex items-baseline gap-2 px-2 py-1">
                <span className="font-medium">{block.orderNumber}</span>
                <span className="min-w-0 flex-1 truncate text-[color:var(--iris-ink-soft)]">
                  {block.stepLabel}
                  {block.machineName && ` · ${block.machineName}`}
                </span>
                <span className="tnum">{formatLoadMinutes(block.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenDay(cell.date)}>
          {t('planning.load.openDay')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function TotalCell({ planned, available, noCapacity }: { planned: number; available: number; noCapacity?: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const percent = noCapacity ? null : loadPercent(planned, available)
  const over = !noCapacity && loadBand(planned, available) === 'over'
  return (
    <td className="tnum px-2 text-right text-[11px] whitespace-nowrap">
      <span>{noCapacity ? formatLoadMinutes(planned) : `${formatLoadMinutes(planned)} / ${formatLoadMinutes(available)}`}</span>
      {percent !== null && <span className="ml-1 text-[color:var(--iris-ink-soft)]">{t('planning.load.percent', { value: percent })}</span>}
      {over && (
        <span className="ml-1 font-medium text-destructive">
          <AlertTriangle aria-hidden className="mr-0.5 inline size-3 align-[-2px]" />
          {t('planning.load.overloaded')}
        </span>
      )}
    </td>
  )
}

interface GridRow {
  key: string
  label: string
  level: 0 | 1
  /** Index-aligned with WorkstationLoad.days. */
  days: { planned: number; available: number; blocks: readonly WorkstationLoadBlock[] }[]
  noCapacity?: boolean
  offLabel: string
  note?: string
  expandable?: { expanded: boolean; toggle: () => void; name: string }
}

function LoadGrid({
  caption,
  rows,
  dates,
  dayIndex,
  onOpenDay,
}: {
  caption: string
  rows: GridRow[]
  dates: string[]
  dayIndex: Map<string, number>
  onOpenDay: (date: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-max min-w-full border-collapse text-[12px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
              {caption}
            </th>
            {dates.map((date) => {
              const working = dayIndex.has(date)
              const [, month, day] = date.split('-')
              return (
                <th key={date} scope="col" className="w-7 px-0.5 py-1 text-center font-normal">
                  <button
                    type="button"
                    disabled={!working}
                    title={working ? formatWorkOrderDate(date) : `${formatWorkOrderDate(date)} · ${t('planning.load.dayOff')}`}
                    aria-label={t('planning.load.openDayAria', { date: formatWorkOrderDate(date) })}
                    onClick={() => onOpenDay(date)}
                    className={cn(
                      'iris-focusable tnum text-[10px] leading-tight underline-offset-2 hover:underline disabled:no-underline',
                      working ? 'text-foreground' : 'text-[color:var(--iris-ink-faint)]',
                    )}
                  >
                    {day}.
                    <br />
                    {month}.
                  </button>
                </th>
              )
            })}
            <th scope="col" className="px-2 py-2 text-right font-medium">
              {t('planning.load.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const planned = row.days.reduce((sum, day) => sum + day.planned, 0)
            const available = row.days.reduce((sum, day) => sum + day.available, 0)
            return (
              <tr
                key={row.key}
                aria-label={row.label}
                className={cn('border-b border-[color:var(--iris-border-soft)] last:border-b-0', row.level === 0 && row.expandable && 'bg-[color:var(--iris-border-soft)]/30')}
              >
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1 text-left font-normal">
                  <div className={cn('flex max-w-[14rem] items-center gap-1.5', row.level === 1 && 'pl-5')}>
                    {row.expandable ? (
                      <button
                        type="button"
                        aria-expanded={row.expandable.expanded}
                        aria-label={t(row.expandable.expanded ? 'planning.load.collapse' : 'planning.load.expand', { name: row.expandable.name })}
                        onClick={row.expandable.toggle}
                        className="iris-focusable flex min-w-0 items-center gap-1 font-medium"
                      >
                        {row.expandable.expanded ? <ChevronDown aria-hidden className="size-3.5 shrink-0" /> : <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
                        <span className="truncate">{row.label}</span>
                      </button>
                    ) : (
                      <span className={cn('truncate', row.level === 0 && 'font-medium')}>{row.label}</span>
                    )}
                    {row.note && (
                      <span className="shrink-0 border border-border px-1 text-[9px] uppercase tracking-wide text-[color:var(--iris-ink-soft)]">
                        {row.note}
                      </span>
                    )}
                  </div>
                </th>
                {dates.map((date) => {
                  const index = dayIndex.get(date)
                  if (index === undefined) {
                    return (
                      <td key={date} className="px-0.5 py-1">
                        <div
                          role="img"
                          aria-label={`${row.label}, ${formatWorkOrderDate(date)}: ${t('planning.load.dayOff')}`}
                          data-band="off"
                          className="mx-auto h-9 w-5"
                          style={HATCH_STYLE}
                        />
                      </td>
                    )
                  }
                  const day = row.days[index]
                  return (
                    <td key={date} className="px-0.5 py-1">
                      <LoadCell
                        onOpenDay={onOpenDay}
                        cell={{
                          rowLabel: row.label,
                          date,
                          planned: day?.planned ?? 0,
                          available: day?.available ?? 0,
                          blocks: day?.blocks ?? [],
                          noCapacity: row.noCapacity,
                          offLabel: row.offLabel,
                        }}
                      />
                    </td>
                  )
                })}
                <TotalCell planned={planned} available={available} noCapacity={row.noCapacity} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Legend(): React.JSX.Element {
  const { t } = useTranslation()
  const items: { key: string; label: string; className?: string; style?: React.CSSProperties }[] = [
    { key: 'under', label: t('planning.load.legend.under'), className: BAR_CLASS.under },
    { key: 'near', label: t('planning.load.legend.near'), className: BAR_CLASS.near },
    { key: 'over', label: t('planning.load.legend.over'), className: BAR_CLASS.over },
    { key: 'off', label: t('planning.load.legend.off'), className: 'bg-[color:var(--iris-border-soft)]', style: HATCH_STYLE },
  ]
  return (
    <ul aria-label={t('planning.load.legendAria')} className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--iris-ink-soft)]">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('inline-block size-3', item.className)} style={item.style} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function buildRows(
  load: WorkstationLoad,
  expanded: ReadonlySet<string>,
  toggle: (id: string) => void,
  t: (key: string, options?: Record<string, unknown>) => string,
): { machines: GridRow[]; people: GridRow[] } {
  const machines: GridRow[] = []
  for (const type of load.machineTypes) {
    const pseudo = type.id === ''
    const name = pseudo ? t('planning.load.noMachine') : type.name
    const isExpanded = expanded.has(type.id)
    machines.push({
      key: `type:${type.id}`,
      label: name,
      level: 0,
      noCapacity: pseudo,
      offLabel: t('planning.load.dayOff'),
      days: type.days.map((total, index) => ({
        planned: total.plannedMinutes,
        available: total.availableMinutes,
        blocks: type.units
          .flatMap((unit) => unit.days[index]?.blocks ?? [])
          .sort((a, b) => a.start.localeCompare(b.start)),
      })),
      expandable: type.units.length > 0 ? { expanded: isExpanded, toggle: () => toggle(type.id), name } : undefined,
    })
    if (!isExpanded) continue
    for (const unit of type.units) {
      machines.push({
        key: `unit:${type.id}:${unit.id}`,
        label: unit.id === '' ? t('planning.load.noMachine') : unit.name,
        level: 1,
        noCapacity: unit.id === '',
        offLabel: unit.inService ? t('planning.load.dayOff') : t('planning.load.outOfService'),
        note: unit.inService ? undefined : t('planning.load.outOfService'),
        days: unit.days.map((day) => ({ planned: day.plannedMinutes, available: day.availableMinutes, blocks: day.blocks })),
      })
    }
  }
  const people: GridRow[] = load.people.map((person) => ({
    key: `person:${person.userId}`,
    label: person.username,
    level: 0,
    offLabel: t('planning.load.absent'),
    days: person.days.map((day) => ({ planned: day.plannedMinutes, available: day.availableMinutes, blocks: day.blocks })),
  }))
  return { machines, people }
}

export interface LoadTabProps {
  isAdmin: boolean
  /** Local "YYYY-MM-DD" of today. */
  today: string
  /** Switches the day plan (PlanTimeline) to a date. */
  onOpenDay: (date: string) => void
}

/** "Zauzetost": planned against available time per machine and person per day. */
export function LoadTab({ isAdmin, today, onOpenDay }: LoadTabProps): React.JSX.Element {
  const { t } = useTranslation()
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [source, setSource] = useState<LoadSource>('published')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const rangeError = !range
    ? null
    : range.to < range.from
      ? t('planning.load.rangeOrder')
      : rangeLength(range.from, range.to) > MAX_LOAD_DAYS
        ? t('planning.load.rangeTooLong', { max: MAX_LOAD_DAYS })
        : null
  // Admins may look at the load with today's draft (e.g. a re-plan) instead of the published plan.
  const todayDay = usePlanDay(today)
  const hasTodayDraft = isAdmin && (todayDay.data?.draft ?? null) !== null
  const draftAllowed = hasTodayDraft && (range?.from ?? today) === today
  const plan: LoadSource = draftAllowed ? source : 'published'
  const query: WorkstationLoadQuery = {
    ...(range ? { from: range.from, to: range.to } : {}),
    ...(plan === 'draft' ? { plan } : {}),
  }
  const loadQuery = useWorkstationLoad(query, rangeError === null)
  const load = loadQuery.data

  const from = range?.from ?? load?.from ?? today
  const to = range?.to ?? load?.to ?? today
  const dates = useMemo(() => (load ? calendarDates(load.from, load.to) : []), [load])
  const dayIndex = useMemo(() => new Map((load?.days ?? []).map((date, index) => [date, index])), [load])
  const toggle = useCallback(
    (id: string): void =>
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )
  const rows = useMemo(() => (load ? buildRows(load, expanded, toggle, t) : null), [load, expanded, toggle, t])
  const hasBlocks =
    load?.machineTypes.some((type) => type.days.some((day) => day.plannedMinutes > 0)) ?? false

  const changeFrom = (next: string): void => {
    const span = Math.min(Math.max(rangeLength(from, to), 1), MAX_LOAD_DAYS)
    setRange({ from: next, to: addDays(next, span - 1) })
  }
  const changeTo = (next: string): void => setRange({ from, to: next })

  const sourceTabs: TabItem<LoadSource>[] = [
    { value: 'published', label: t('planning.load.source.published') },
    { value: 'draft', label: t('planning.load.source.draft') },
  ]
  const parse = (date: string): Date => new Date(`${date}T00:00:00`)

  return (
    <section aria-labelledby="load-heading" className="space-y-4">
      <div>
        <h2 id="load-heading" className="text-[14px] font-medium">
          {t('planning.load.title')}
        </h2>
        <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.load.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="load-from" className="text-[12px] text-[color:var(--iris-ink-soft)]">
          {t('planning.load.from')}
        </label>
        <DatePicker id="load-from" value={from} onChange={(next) => next && changeFrom(next)} placeholder={t('planning.load.from')} />
        <label htmlFor="load-to" className="text-[12px] text-[color:var(--iris-ink-soft)]">
          {t('planning.load.to')}
        </label>
        <DatePicker
          id="load-to"
          value={to}
          onChange={(next) => next && changeTo(next)}
          placeholder={t('planning.load.to')}
          fromDate={parse(from)}
          toDate={parse(addDays(from, MAX_LOAD_DAYS - 1))}
        />
        <span className="tnum text-[12px] text-[color:var(--iris-ink-soft)]" aria-live="polite">
          {formatWorkOrderDate(from)} – {formatWorkOrderDate(to)}
        </span>
        {draftAllowed && (
          <Tabs className="ml-auto" tabs={sourceTabs} value={plan} onValueChange={setSource} aria-label={t('planning.load.sourceAria')} />
        )}
      </div>

      {rangeError && (
        <p role="alert" className="text-[12px] text-destructive">
          {rangeError}
        </p>
      )}

      <Legend />

      {loadQuery.isPending && rangeError === null ? (
        <div className="flex items-center gap-2 py-10 text-[12px] text-[color:var(--iris-ink-soft)]">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
        </div>
      ) : loadQuery.isError ? (
        <p role="alert" className="py-6 text-[12px] text-destructive">
          {t('planning.load.loadError')}
        </p>
      ) : load && rows ? (
        rows.machines.length === 0 && rows.people.length === 0 ? (
          <p className="border border-border bg-card px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
            {t('planning.load.empty')}
          </p>
        ) : (
          <Fragment>
            {!hasBlocks && <p className="text-[12px] text-[color:var(--iris-ink-mute)]">{t('planning.load.noPlan')}</p>}
            {rows.machines.length > 0 && (
              <LoadGrid caption={t('planning.load.machines')} rows={rows.machines} dates={dates} dayIndex={dayIndex} onOpenDay={onOpenDay} />
            )}
            {rows.people.length > 0 && (
              <section aria-labelledby="load-people-heading" className="space-y-2">
                <h3 id="load-people-heading" className="text-[13px] font-medium">
                  {t('planning.load.people')}
                </h3>
                <LoadGrid caption={t('planning.load.people')} rows={rows.people} dates={dates} dayIndex={dayIndex} onOpenDay={onOpenDay} />
              </section>
            )}
          </Fragment>
        )
      ) : null}
    </section>
  )
}
