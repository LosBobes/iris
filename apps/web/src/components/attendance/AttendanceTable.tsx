import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'
import { NativeSelect } from '@/components/planning/NativeSelect'
import { QueryState } from '@/components/planning/QueryState'
import { useAttendance, useInvalidateAttendance } from '@/hooks/useAttendance'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { getLocalIsoDate } from '@/shared/utils/work-orders'
import type { AttendanceEntry } from '@/types/planning'

type OverrideChoice = 'auto' | 'present' | 'absent'

function choiceOf(entry: AttendanceEntry): OverrideChoice {
  if (entry.override === null) return 'auto'
  return entry.override ? 'present' : 'absent'
}

/**
 * "Prisustvo": who is at work on a date (sign-in, or an admin override). Its
 * own module, usable without planning; the planner reads the same data.
 */
export function AttendanceTable({ canEdit }: { canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => getLocalIsoDate())
  const query = useAttendance(date)
  const invalidate = useInvalidateAttendance()
  const [saving, setSaving] = useState<string | null>(null)

  const change = async (entry: AttendanceEntry, choice: OverrideChoice): Promise<void> => {
    setSaving(entry.userId)
    try {
      await window.api.setAttendance(entry.userId, {
        date,
        present: choice === 'auto' ? null : choice === 'present',
      })
      await invalidate()
    } catch (cause) {
      reportUnexpectedError('AttendanceTable.change', cause)
      toast.error(formatActionError(t('attendance.saveError'), cause))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section aria-labelledby="attendance-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p id="attendance-heading" className="text-[12px] text-[color:var(--iris-ink-soft)]">
          {t('attendance.hint')}
        </p>
        <DatePicker
          value={date}
          onChange={(next) => next && setDate(next)}
          id="attendance-date"
          placeholder={t('attendance.date')}
        />
      </div>
      <QueryState query={query} empty={t('attendance.empty')} loadError={t('attendance.loadError')}>
        {(entries) => (
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                  <th scope="col" className="px-4 py-2 font-normal">{t('attendance.user')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('attendance.signedIn')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('attendance.override')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('attendance.present')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                {entries.map((entry) => (
                  <tr key={entry.userId}>
                    <th scope="row" className="px-4 py-2 text-[13px] font-normal">{entry.username}</th>
                    <td className="px-4 py-2">{entry.signedIn ? t('common.yes') : t('common.no')}</td>
                    <td className="px-4 py-1.5">
                      <NativeSelect
                        className="max-w-44"
                        value={choiceOf(entry)}
                        disabled={!canEdit || saving === entry.userId}
                        aria-label={t('attendance.overrideAria', { user: entry.username })}
                        onChange={(event) => void change(entry, event.target.value as OverrideChoice)}
                      >
                        <option value="auto">{t('attendance.auto')}</option>
                        <option value="present">{t('attendance.forcePresent')}</option>
                        <option value="absent">{t('attendance.forceAbsent')}</option>
                      </NativeSelect>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          entry.present ? 'text-[color:var(--iris-status-done)]' : 'text-[color:var(--iris-ink-mute)]'
                        }
                      >
                        {entry.present ? t('attendance.presentYes') : t('attendance.presentNo')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </section>
  )
}
