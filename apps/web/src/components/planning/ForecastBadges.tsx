import { useTranslation } from 'react-i18next'
import type { OrderForecast } from '@/types/planning'

/** "Kasni" / "Ne može se planirati" markers of one forecast entry. */
export function ForecastBadges({ forecast }: { forecast: Pick<OrderForecast, 'late' | 'unplannable'> }): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!forecast.late && !forecast.unplannable) return null
  return (
    <>
      {forecast.late && (
        <span className="shrink-0 border border-destructive/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
          {t('planning.forecast.late')}
        </span>
      )}
      {forecast.unplannable && (
        <span className="shrink-0 border border-amber-500/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {t('planning.forecast.unplannable')}
        </span>
      )}
    </>
  )
}
