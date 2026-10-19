import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { usePlanningForecast } from '@/hooks/usePlanning'
import { formatWorkOrderDate, getWorkOrderPriorityLabel } from '@/shared/utils/work-orders'
import { ForecastBadges } from './ForecastBadges'
import { LatestStartDate } from './LatestStartDate'

/** "Prognoza": estimated finish of every open order with a process. */
export function ForecastTable(): React.JSX.Element {
  const { t } = useTranslation()
  const query = usePlanningForecast()

  return (
    <section aria-labelledby="forecast-heading" className="space-y-2">
      <div>
        <h2 id="forecast-heading" className="text-[14px] font-medium">
          {t('planning.forecast.title')}
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.forecast.hint')}</p>
      </div>
      {query.isPending ? (
        <div className="flex items-center gap-2 py-6 text-[12px] text-[color:var(--iris-ink-soft)]">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
        </div>
      ) : query.isError ? (
        <p role="alert" className="py-4 text-[12px] text-destructive">
          {t('planning.forecast.loadError')}
        </p>
      ) : query.data.length === 0 ? (
        <p className="border border-border bg-card px-4 py-8 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t('planning.forecast.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                <th scope="col" className="px-4 py-2 font-normal">{t('planning.forecast.order')}</th>
                <th scope="col" className="px-4 py-2 font-normal">{t('planning.forecast.client')}</th>
                <th scope="col" className="px-4 py-2 font-normal">{t('planning.forecast.dueDate')}</th>
                <th scope="col" className="px-4 py-2 font-normal">{t('planning.forecast.priority')}</th>
                <th scope="col" className="px-4 py-2 font-normal">{t('planning.forecast.estimatedFinish')}</th>
                <th scope="col" className="px-4 py-2 font-normal">{t('planning.forecast.latestStart')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
              {query.data.map((entry) => (
                <tr key={entry.workOrderId} data-late={entry.late ? 'true' : undefined}>
                  <th scope="row" className="px-4 py-2 font-normal">
                    <Link to={`/work-orders/${encodeURIComponent(entry.workOrderId)}`} className="iris-focusable underline">
                      {entry.orderNumber}
                    </Link>
                  </th>
                  <td className="px-4 py-2">{entry.clientName}</td>
                  <td className="tnum px-4 py-2">{entry.dueDate ? formatWorkOrderDate(entry.dueDate) : '—'}</td>
                  <td className="px-4 py-2">{getWorkOrderPriorityLabel(entry.priority)}</td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tnum">
                        {entry.estimatedFinish ? formatWorkOrderDate(entry.estimatedFinish) : '—'}
                      </span>
                      <ForecastBadges forecast={entry} />
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <LatestStartDate forecast={entry} fallback="—" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
