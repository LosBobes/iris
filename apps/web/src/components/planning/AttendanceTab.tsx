import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'
import { useAttendance, useInvalidatePlanning } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { getLocalIsoDate } from '@/shared/utils/work-orders'
import type { AttendanceEntry } from '@/types/planning'
import { NativeSelect } from './NativeSelect'
import { QueryState } from './QueryState'

type OverrideChoice = 'auto' | 'present' | 'absent'

function choiceOf(entry: AttendanceEntry): OverrideChoice {
  if (entry.override === null) return 'auto'
  return entry.override ? 'present' : 'absent'
}

/** "Prisustvo": who is at work on a date (sign-in, or an admin override). */
export function AttendanceTab({ canEdit }: { canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => getLocalIsoDate())
  const query = useAttendance(date)
  const invalidate = useInvalidatePlanning()
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
      reportUnexpectedError('AttendanceTab.change', cause)
      toast.error(formatActionError(t('planning.attendance.saveError'), cause))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section aria-labelledby="attendance-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="attendance-heading" className="text-[14px] font-medium">
            {t('planning.attendance.title')}
          </h2>
          <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.attendance.hint')}</p>
        </div>
        <DatePicker
          value={date}
          onChange={(next) => next && setDate(next)}
          id="attendance-date"
          placeholder={t('planning.date')}
        />
      </div>
      <QueryState query={query} empty={t('planning.attendance.empty')} loadError={t('planning.loadError')}>
        {(entries) => (
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.qualifications.user')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.attendance.signedIn')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.attendance.override')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.attendance.present')}</th>
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
                        aria-label={t('planning.attendance.overrideAria', { user: entry.username })}
                        onChange={(event) => void change(entry, event.target.value as OverrideChoice)}
                      >
                        <option value="auto">{t('planning.attendance.auto')}</option>
                        <option value="present">{t('planning.attendance.forcePresent')}</option>
                        <option value="absent">{t('planning.attendance.forceAbsent')}</option>
                      </NativeSelect>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          entry.present ? 'text-[color:var(--iris-status-done)]' : 'text-[color:var(--iris-ink-mute)]'
                        }
                      >
                        {entry.present ? t('planning.attendance.presentYes') : t('planning.attendance.presentNo')}
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
