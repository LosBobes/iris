import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { DispatchList } from '@/components/planning/DispatchList'
import { NativeSelect } from '@/components/planning/NativeSelect'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/useAuth'
import { useOrganization } from '@/hooks/useOrganization'
import { useMachines, useMachineTypes, usePlanDay, usePlanHorizon, useUserNames } from '@/hooks/usePlanning'
import {
  MAX_DISPATCH_DAYS,
  addIsoDays,
  clampRangeEnd,
  isIsoDate,
  type DispatchGroupBy,
} from '@/lib/planning/dispatch'
import { queryKeys } from '@/lib/query-client'
import { getLocalIsoDate } from '@/shared/utils/work-orders'
import type { PlanHorizonDay, PlanStatus } from '@/types/planning'

type Source = 'draft' | 'published'

interface PrintData {
  days: PlanHorizonDay[]
  status: PlanStatus
  /** Whether the chosen plan exists at all (vs. a plan without blocks). */
  found: boolean
}

const WORK_ORDER_STALE_TIME_MS = 30_000

/**
 * "Radni raspored" (D-028): the printable dispatch list per machine unit (or
 * per person) for one day, from `GET /planning/plan`. Admins may print up to
 * seven days, read from the date's plan horizon (`GET /planning/plan/horizon`,
 * admin-only), and the draft instead of the published plan. URL:
 * `/planning/print?date=&to=&by=machine|person&source=draft|published`.
 * Order quantities are not on plan blocks, so each order on the sheet is read
 * once through the cached work-order detail query (`jobDetails.quantity`).
 */
function PlanningPrintPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const isAdmin = currentUser.role === 'admin'
  const { firmName } = useOrganization()
  const [params, setParams] = useSearchParams()

  const dateParam = params.get('date')
  const date = isIsoDate(dateParam) ? dateParam : getLocalIsoDate()
  // Operators cannot read the horizon, so they always get the single day.
  const to = isAdmin ? clampRangeEnd(date, params.get('to')) : date
  const isRange = to !== date
  const groupBy: DispatchGroupBy = params.get('by') === 'person' ? 'person' : 'machine'
  const wantDraft = isAdmin && params.get('source') === 'draft'

  const dayQuery = usePlanDay(date, !isRange)
  const horizonQuery = usePlanHorizon(date, isRange)
  const machinesQuery = useMachines()
  const typesQuery = useMachineTypes()
  const userNames = useUserNames()

  const activeQuery = isRange ? horizonQuery : dayQuery
  const hasDraft = isRange ? Boolean(horizonQuery.data?.draft) : Boolean(isAdmin && dayQuery.data?.draft)
  const source: Source = wantDraft && hasDraft ? 'draft' : 'published'

  const data = useMemo<PrintData | null>(() => {
    if (isRange) {
      const horizon = horizonQuery.data
      if (!horizon) return null
      const chosen = source === 'draft' ? horizon.draft : horizon.published
      if (!chosen) return { days: [], status: source, found: false }
      return {
        days: chosen.days.filter((day) => day.date >= date && day.date <= to),
        status: chosen.status,
        found: true,
      }
    }
    const day = dayQuery.data
    if (!day) return null
    const chosen = source === 'draft' ? day.draft : day.published
    if (!chosen) return { days: [], status: source, found: false }
    return { days: [{ date, assignments: chosen.assignments }], status: chosen.status, found: true }
  }, [isRange, horizonQuery.data, dayQuery.data, source, date, to])

  const orderIds = useMemo(() => {
    const ids = new Set<string>()
    for (const day of data?.days ?? []) for (const block of day.assignments) ids.add(block.workOrderId)
    return [...ids].sort()
  }, [data])

  const orderQueries = useQueries({
    queries: orderIds.map((id) => ({
      queryKey: queryKeys.workOrder(id),
      queryFn: () => window.api.getWorkOrderById(id),
      staleTime: WORK_ORDER_STALE_TIME_MS,
      retry: false,
    })),
  })
  const quantities = useMemo(() => {
    const map = new Map<string, number | null>()
    orderIds.forEach((id, index) => {
      map.set(id, orderQueries[index]?.data?.jobDetails?.quantity ?? null)
    })
    return map
  }, [orderIds, orderQueries])

  const update = (changes: Record<string, string | null>): void => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const dayCount = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000) + 1

  const groupTabs: TabItem<DispatchGroupBy>[] = [
    { value: 'machine', label: t('planning.print.byMachine') },
    { value: 'person', label: t('planning.print.byPerson') },
  ]
  const sourceTabs: TabItem<Source>[] = [
    { value: 'draft', label: t('planning.print.draft') },
    { value: 'published', label: t('planning.print.published') },
  ]

  const loading = activeQuery.isPending || machinesQuery.isPending || typesQuery.isPending

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-5 px-5 py-6 sm:px-8">
        <div className="flex flex-col gap-4 border-b border-border pb-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/planning">
                <ArrowLeft aria-hidden /> {t('planning.print.back')}
              </Link>
            </Button>
            <Button type="button" onClick={() => window.print()} disabled={loading || !data?.found}>
              <Printer aria-hidden /> {t('planning.print.print')}
            </Button>
          </div>
          <h1 className="text-[26px] font-normal tracking-[-0.6px]">{t('planning.print.title')}</h1>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">{t('planning.print.date')}</span>
              <DatePicker
                id="print-date"
                value={date}
                onChange={(next) => next && update({ date: next, to: isRange ? addIsoDays(next, dayCount - 1) : null })}
                placeholder={t('planning.print.date')}
              />
            </div>
            {isAdmin && (
              <label className="space-y-1">
                <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">{t('planning.print.days')}</span>
                <NativeSelect
                  className="w-20"
                  value={String(dayCount)}
                  onChange={(event) => {
                    const count = Number(event.target.value)
                    update({ to: count > 1 ? addIsoDays(date, count - 1) : null })
                  }}
                >
                  {Array.from({ length: MAX_DISPATCH_DAYS }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            <Tabs
              tabs={groupTabs}
              value={groupBy}
              onValueChange={(next) => update({ by: next === 'person' ? 'person' : null })}
              aria-label={t('planning.print.groupAria')}
            />
            {isAdmin && hasDraft && (
              <Tabs
                tabs={sourceTabs}
                value={source}
                onValueChange={(next) => update({ source: next === 'draft' ? 'draft' : null })}
                aria-label={t('planning.print.sourceAria')}
              />
            )}
          </div>
          {isRange && <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('planning.print.rangeHint')}</p>}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[12px] text-[color:var(--iris-ink-soft)]">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
          </div>
        ) : activeQuery.isError ? (
          <p role="alert" className="py-6 text-[12px] text-destructive">
            {t('planning.plan.loadError')}
          </p>
        ) : !data?.found ? (
          <p className="py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">{t('planning.print.noPlan')}</p>
        ) : (
          <DispatchList
            days={data.days}
            groupBy={groupBy}
            status={data.status}
            firmName={firmName}
            from={date}
            to={to}
            machines={machinesQuery.data ?? []}
            machineTypes={typesQuery.data ?? []}
            userNames={userNames}
            quantities={quantities}
          />
        )}
      </div>
    </main>
  )
}

export default PlanningPrintPage
