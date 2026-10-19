import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { useInvalidatePlanning, useMachineTypes, useQualifications } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { QueryState } from './QueryState'

/**
 * "Kvalifikacije": users x machine types. A ticked box lets the user lead a
 * step on that type (helpers can be anyone). Each toggle saves that user's row.
 */
export function QualificationsTab({ canEdit }: { canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const usersQuery = useQualifications()
  const typesQuery = useMachineTypes()
  const invalidate = useInvalidatePlanning()
  const [saving, setSaving] = useState<string | null>(null)
  const types = typesQuery.data ?? []

  const toggle = async (userId: string, current: string[], typeId: string, checked: boolean): Promise<void> => {
    const next = checked ? [...new Set([...current, typeId])] : current.filter((id) => id !== typeId)
    setSaving(userId)
    try {
      await window.api.setQualifications(userId, { machineTypeIds: next })
      await invalidate()
    } catch (cause) {
      reportUnexpectedError('QualificationsTab.toggle', cause)
      toast.error(formatActionError(t('planning.qualifications.saveError'), cause))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section aria-labelledby="qualifications-heading" className="space-y-3">
      <div>
        <h2 id="qualifications-heading" className="text-[14px] font-medium">
          {t('planning.qualifications.title')}
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.qualifications.hint')}</p>
      </div>
      {typesQuery.isSuccess && types.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t('planning.qualifications.noTypes')}
        </p>
      ) : (
        <QueryState query={usersQuery} empty={t('planning.qualifications.noUsers')} loadError={t('planning.loadError')}>
          {(users) => (
            <div className="overflow-x-auto border border-border bg-card">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                    <th scope="col" className="px-4 py-2 font-normal">{t('planning.qualifications.user')}</th>
                    {types.map((type) => (
                      <th key={type.id} scope="col" className="px-3 py-2 text-center font-normal">
                        {type.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                  {users.map((user) => (
                    <tr key={user.userId}>
                      <th scope="row" className="px-4 py-2 text-[13px] font-normal">{user.username}</th>
                      {types.map((type) => (
                        <td key={type.id} className="px-3 py-2 text-center">
                          <Checkbox
                            className="mx-auto"
                            checked={user.machineTypeIds.includes(type.id)}
                            disabled={!canEdit || saving === user.userId}
                            aria-label={t('planning.qualifications.cellAria', {
                              user: user.username,
                              type: type.name,
                            })}
                            onCheckedChange={(checked) =>
                              void toggle(user.userId, user.machineTypeIds, type.id, checked === true)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      )}
    </section>
  )
}
