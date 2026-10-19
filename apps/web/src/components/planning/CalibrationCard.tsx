import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Gauge, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanningCalibration } from '@/hooks/usePlanningCalibration'
import { workingHoursLink } from '@/lib/planning/calibration-link'
import { formatWorkOrderDate } from '@/shared/utils/work-orders'
import { CALIBRATION_RATIO_THRESHOLD, type PlanningCalibration } from '@/types/planning'

const minutesFormatter = new Intl.NumberFormat('sr-Latn', { maximumFractionDigits: 1 })
const ratioFormatter = new Intl.NumberFormat('sr-Latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-[96px]">
      <dt className="text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">{label}</dt>
      <dd className="tnum mt-0.5 text-[18px] text-foreground">{value}</dd>
    </div>
  )
}

function CalibrationBody({ report }: { report: PlanningCalibration }): React.JSX.Element {
  const { t } = useTranslation()
  const percent = Math.round(CALIBRATION_RATIO_THRESHOLD * 100)
  if (report.ordersWithTimes === 0) {
    return (
      <p className="border border-dashed border-border px-4 py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
        {t('planning.calibration.empty')}
      </p>
    )
  }
  const deviating = report.steps.filter((step) => Math.abs(step.ratio - 1) > CALIBRATION_RATIO_THRESHOLD)
  const recommended = report.avgTransferMinutes
  const minutes = (value: number | null): string =>
    value === null ? '—' : t('planning.calibration.minutes', { value: minutesFormatter.format(value) })

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[color:var(--iris-ink-soft)]">
        {t('planning.calibration.basis', { withTimes: report.ordersWithTimes, orders: report.orders })}
      </p>
      <div className="space-y-2">
        <h3 className="text-[13px] font-medium">{t('planning.calibration.transferTitle')}</h3>
        {recommended === null ? (
          <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.calibration.noTransfer')}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              <Stat label={t('planning.calibration.recommended')} value={minutes(recommended)} />
              <Stat label={t('planning.calibration.median')} value={minutes(report.medianTransferMinutes)} />
              <Stat label={t('planning.calibration.current')} value={minutes(report.currentTransferMinutes)} />
            </dl>
            {recommended !== report.currentTransferMinutes ? (
              <Button asChild variant="outline" size="sm">
                <Link to={workingHoursLink(recommended)}>{t('planning.calibration.apply', { value: recommended })}</Link>
              </Button>
            ) : (
              <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.calibration.matches')}</p>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-[13px] font-medium">{t('planning.calibration.stepsTitle', { percent })}</h3>
        {deviating.length === 0 ? (
          <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.calibration.stepsNone', { percent })}</p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.calibration.step')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">{t('planning.calibration.count')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">{t('planning.calibration.planned')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">{t('planning.calibration.actual')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">{t('planning.calibration.ratio')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                {deviating.map((step) => (
                  <tr key={step.label} data-slow={step.ratio > 1 ? 'true' : undefined}>
                    <th scope="row" className="px-4 py-2 font-normal">{step.label}</th>
                    <td className="tnum px-4 py-2 text-right">{step.count}</td>
                    <td className="tnum px-4 py-2 text-right">{minutesFormatter.format(step.plannedMinutesAvg)}</td>
                    <td className="tnum px-4 py-2 text-right">{minutesFormatter.format(step.actualMinutesAvg)}</td>
                    <td
                      className={`tnum px-4 py-2 text-right ${step.ratio > 1 ? 'text-amber-700 dark:text-amber-400' : 'text-[color:var(--iris-ink-soft)]'}`}
                    >
                      {ratioFormatter.format(step.ratio)}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * "Kalibracija" (admins, D-028): the measured inter-operation time against the
 * working-hours setting, with a link that opens the working hours prefilled
 * (nothing is saved here), and the step labels whose measured minutes deviate
 * from the plan by more than CALIBRATION_RATIO_THRESHOLD.
 */
export function CalibrationCard(): React.JSX.Element {
  const { t } = useTranslation()
  const query = usePlanningCalibration()

  return (
    <section aria-labelledby="calibration-heading" className="space-y-3 border border-border bg-card px-4 py-4">
      <div>
        <h2 id="calibration-heading" className="flex items-center gap-2 text-[14px] font-medium">
          <Gauge className="size-4 text-[color:var(--iris-ink-soft)]" aria-hidden /> {t('planning.calibration.title')}
        </h2>
        {query.data && (
          <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            {t('planning.calibration.hint', {
              from: formatWorkOrderDate(query.data.window.from),
              to: formatWorkOrderDate(query.data.window.to),
            })}
          </p>
        )}
      </div>
      {query.isPending ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-[color:var(--iris-ink-soft)]">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
        </div>
      ) : query.isError ? (
        <p role="alert" className="py-2 text-[12px] text-destructive">
          {t('planning.calibration.loadError')}
        </p>
      ) : (
        <CalibrationBody report={query.data} />
      )}
    </section>
  )
}
