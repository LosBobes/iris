import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AttendanceTab } from '@/components/planning/AttendanceTab'
import { MachineTypesTab } from '@/components/planning/MachineTypesTab'
import { MachinesTab } from '@/components/planning/MachinesTab'
import { QualificationsTab } from '@/components/planning/QualificationsTab'
import { WorkingHoursTab } from '@/components/planning/WorkingHoursTab'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/useAuth'

type ResourceTab = 'types' | 'machines' | 'qualifications' | 'attendance' | 'hours'

/**
 * "Resursi" of the Planiranje module (route is wrapped in ModuleGate by App).
 * Admins edit; other users see the same data read-only (every GET is open to
 * signed-in users per the API contract).
 */
function PlanningResourcesPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const canEdit = currentUser.role === 'admin'
  const [tab, setTab] = useState<ResourceTab>('types')

  const tabs: TabItem<ResourceTab>[] = [
    { value: 'types', label: t('planning.resources.tabs.types') },
    { value: 'machines', label: t('planning.resources.tabs.machines') },
    { value: 'qualifications', label: t('planning.resources.tabs.qualifications') },
    { value: 'attendance', label: t('planning.resources.tabs.attendance') },
    { value: 'hours', label: t('planning.resources.tabs.hours') },
  ]

  return (
    <div className="space-y-6">
      <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
        <Link
          to="/planning"
          className="iris-focusable inline-flex items-center gap-1 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> {t('planning.resources.backToPlan')}
        </Link>
        <div className="mt-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t('planning.eyebrow')}
        </div>
        <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
          {t('planning.resources.title')}
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
          {canEdit ? t('planning.resources.subtitle') : t('planning.resources.subtitleReadOnly')}
        </p>
      </div>
      <div className="space-y-5 px-5 pb-8 sm:px-8">
        <div className="overflow-x-auto">
          <Tabs tabs={tabs} value={tab} onValueChange={setTab} aria-label={t('planning.resources.tabsAria')} />
        </div>
        <div role="tabpanel">
          {tab === 'types' && <MachineTypesTab canEdit={canEdit} />}
          {tab === 'machines' && <MachinesTab canEdit={canEdit} />}
          {tab === 'qualifications' && <QualificationsTab canEdit={canEdit} />}
          {tab === 'attendance' && <AttendanceTab canEdit={canEdit} />}
          {tab === 'hours' && <WorkingHoursTab canEdit={canEdit} />}
        </div>
      </div>
    </div>
  )
}

export default PlanningResourcesPage
