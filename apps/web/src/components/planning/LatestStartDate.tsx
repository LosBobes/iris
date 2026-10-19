import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatWorkOrderDate } from '@/shared/utils/work-orders'
import type { OrderForecast } from '@/types/planning'

/**
 * The forecast's "Najkasniji početak" date (D-028), red when it has passed.
 * Renders `fallback` when the forecast has no latest start.
 */
export function LatestStartDate({
  forecast,
  fallback = null,
}: {
  forecast: Pick<OrderForecast, 'latestStart' | 'latestStartPassed'>
  fallback?: React.ReactNode
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!forecast.latestStart) return <>{fallback}</>
  const passed = forecast.latestStartPassed
  return (
    <span
      data-testid="latest-start"
      data-passed={passed ? 'true' : undefined}
      title={passed ? t('planning.forecast.latestStartPassed') : undefined}
      className={cn('tnum', passed && 'font-medium text-destructive')}
    >
      {formatWorkOrderDate(forecast.latestStart)}
      {passed && <span className="sr-only"> ({t('planning.forecast.latestStartPassed')})</span>}
    </span>
  )
}
