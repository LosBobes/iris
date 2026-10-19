import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildDispatchSections, formatDuration, type DispatchGroupBy } from '@/lib/planning/dispatch'
import { timeOfLocal } from '@/lib/planning/time'
import { formatWorkOrderDate } from '@/shared/utils/work-orders'
import type { Machine, MachineType, PlanHorizonDay, PlanStatus } from '@/types/planning'

interface DispatchListProps {
  /** Day blocks to print, in date order (one day, or up to seven from the horizon). */
  days: readonly PlanHorizonDay[]
  groupBy: DispatchGroupBy
  status: PlanStatus
  /** Organization name for the sheet header. */
  firmName: string
  /** First and last date of the printed period ("YYYY-MM-DD"). */
  from: string
  to: string
  machines: readonly Machine[]
  machineTypes: readonly MachineType[]
  /** userId to username. */
  userNames: ReadonlyMap<string, string>
  /** workOrderId to the order quantity (`jobDetails.quantity`); missing or null prints "–". */
  quantities: ReadonlyMap<string, number | null>
}

const quantityFormat = new Intl.NumberFormat('sr-Latn-RS', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

/**
 * The printable dispatch list ("Radni raspored", D-028): one sheet per machine
 * unit (or per person), each with the organization, period and plan status in
 * its header and one table per day (order, step, quantity, start, end,
 * duration, lead) closed by the day's total. Sheets break onto their own page
 * when printed (see the `dispatch-print-*` rules in main.css).
 */
export function DispatchList({
  days,
  groupBy,
  status,
  firmName,
  from,
  to,
  machines,
  machineTypes,
  userNames,
  quantities,
}: DispatchListProps): React.JSX.Element {
  const { t } = useTranslation()
  const sections = useMemo(
    () =>
      buildDispatchSections(days, groupBy, {
        machines,
        machineTypes,
        userNames,
        noMachineLabel: t('planning.print.noMachine'),
      }),
    [days, groupBy, machines, machineTypes, userNames, t],
  )

  if (sections.length === 0) {
    return <p className="py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">{t('planning.print.empty')}</p>
  }

  const multiDay = from !== to
  const period = multiDay
    ? t('planning.print.period', { from: formatWorkOrderDate(from), to: formatWorkOrderDate(to) })
    : formatWorkOrderDate(from)
  const statusLabel = status === 'draft' ? t('planning.print.statusDraft') : t('planning.print.statusPublished')
  const byPerson = groupBy === 'person'

  return (
    <div className="dispatch-print-root space-y-6" data-testid="dispatch-list">
      {sections.map((section) => {
        const heading = byPerson
          ? t('planning.print.personHeading', { name: section.title })
          : section.noMachine
            ? section.title
            : t('planning.print.machineHeading', { name: section.title })
        return (
          <section
            key={section.key}
            aria-label={heading}
            data-testid="dispatch-section"
            className="dispatch-print-section border border-border bg-card p-5"
          >
            <header className="dispatch-print-header mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-foreground pb-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">{firmName}</div>
                <h2 className="dispatch-print-title text-[18px] font-semibold">{t('planning.print.title')}</h2>
              </div>
              <div className="text-right text-[12px]">
                <div className="tnum font-medium">{period}</div>
                <div className="text-[color:var(--iris-ink-soft)]" data-testid="dispatch-status">
                  {statusLabel}
                </div>
              </div>
            </header>
            {section.groupLabel && (
              <div className="text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                {section.groupLabel}
              </div>
            )}
            <h3 className="dispatch-print-machine mb-3 text-[20px] font-semibold">{heading}</h3>

            {section.days.map((day) => (
              <div key={day.date} className="dispatch-print-day mb-4 last:mb-0">
                {multiDay && (
                  <h4 className="tnum mb-1 text-[13px] font-semibold">{formatWorkOrderDate(day.date)}</h4>
                )}
                <table className="dispatch-print-table w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr>
                      <th scope="col">{t('planning.print.columns.order')}</th>
                      <th scope="col">{t('planning.print.columns.step')}</th>
                      {byPerson && <th scope="col">{t('planning.print.columns.machine')}</th>}
                      <th scope="col" className="text-right">{t('planning.print.columns.quantity')}</th>
                      <th scope="col">{t('planning.print.columns.start')}</th>
                      <th scope="col">{t('planning.print.columns.end')}</th>
                      <th scope="col" className="text-right">{t('planning.print.columns.duration')}</th>
                      <th scope="col">{t('planning.print.columns.lead')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((row) => {
                      const quantity = quantities.get(row.workOrderId)
                      return (
                        <tr key={row.id}>
                          <td className="tnum font-medium">{row.orderNumber}</td>
                          <td>
                            {row.stepLabel}
                            {row.parts > 1 && (
                              <span className="text-[color:var(--iris-ink-soft)]">
                                {' '}
                                ({t('planning.block.part', { part: row.part, parts: row.parts })})
                              </span>
                            )}
                          </td>
                          {byPerson && <td>{row.machineId ? row.machineName : t('planning.print.noMachine')}</td>}
                          <td className="tnum text-right">
                            {quantity === undefined || quantity === null ? '–' : quantityFormat.format(quantity)}
                          </td>
                          <td className="tnum">{timeOfLocal(row.start)}</td>
                          <td className="tnum">{timeOfLocal(row.end)}</td>
                          <td className="tnum text-right">{formatDuration(row.minutes)}</td>
                          <td>{userNames.get(row.leadUserId) ?? '–'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr data-testid="dispatch-day-total">
                      <th scope="row" colSpan={byPerson ? 6 : 5} className="text-right">
                        {t('planning.print.dayTotal')}
                      </th>
                      <td className="tnum text-right font-semibold">{formatDuration(day.totalMinutes)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
