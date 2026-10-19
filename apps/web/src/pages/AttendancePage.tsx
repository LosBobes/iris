import { useTranslation } from 'react-i18next'
import { AttendanceTable } from '@/components/attendance/AttendanceTable'
import { useAuth } from '@/hooks/useAuth'

/**
 * "Prisustvo" module page (route is wrapped in ModuleGate by App). Admins set
 * overrides; other users see the same data read-only.
 */
function AttendancePage(): React.JSX.Element {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const canEdit = currentUser.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t('attendance.eyebrow')}
        </div>
        <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">{t('attendance.title')}</h1>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
          {canEdit ? t('attendance.hint') : t('attendance.subtitleReadOnly')}
        </p>
      </div>
      <div className="px-5 pb-8 sm:px-8">
        <AttendanceTable canEdit={canEdit} />
      </div>
    </div>
  )
}

export default AttendancePage
