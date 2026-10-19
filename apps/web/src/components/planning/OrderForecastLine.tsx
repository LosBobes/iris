import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { usePlanningForecast } from '@/hooks/usePlanning'
import { formatWorkOrderDate } from '@/shared/utils/work-orders'
import { ForecastBadges } from './ForecastBadges'
import { LatestStartDate } from './LatestStartDate'

/**
 * "Procenjeni završetak" on the order detail page. Renders nothing (and
 * requests nothing) while the planning module is off, and nothing for orders
 * the forecast does not cover (closed, or without a process). Shares the one
 * forecast query with the planning page.
 */
export function OrderForecastLine({ workOrderId }: { workOrderId: string }): React.JSX.Element | null {
  const { modules } = useOrganization()
  if (!modules.planning) return null
  return <OrderForecastLineBody workOrderId={workOrderId} />
}

function OrderForecastLineBody({ workOrderId }: { workOrderId: string }): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data } = usePlanningForecast()
  const entry = data?.find((forecast) => forecast.workOrderId === workOrderId)
  if (!entry) return null
  return (
    <div
      data-testid="order-forecast-line"
      className="mx-5 mt-4 flex flex-wrap items-center gap-2 border border-border bg-card px-4 py-2.5 text-[12px] sm:mx-8"
    >
      <CalendarClock className="size-4 text-[color:var(--iris-ink-mute)]" aria-hidden />
      <span className="text-[color:var(--iris-ink-soft)]">{t('planning.forecast.estimatedFinish')}:</span>
      <span className="tnum font-medium">
        {entry.estimatedFinish ? formatWorkOrderDate(entry.estimatedFinish) : t('planning.forecast.noEstimate')}
      </span>
      <ForecastBadges forecast={entry} />
      {entry.latestStart && (
        <span>
          <span className="text-[color:var(--iris-ink-soft)]">{t('planning.forecast.latestStart')}:</span>{' '}
          <LatestStartDate forecast={entry} />
        </span>
      )}
    </div>
  )
}
