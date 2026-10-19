import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, ListChecks, Loader2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/planning/ConfirmDialog'
import { ForecastBadges } from '@/components/planning/ForecastBadges'
import { ForecastTable } from '@/components/planning/ForecastTable'
import { MaterialNeedsTab } from '@/components/planning/MaterialNeedsTab'
import { PlanBlockDialog } from '@/components/planning/PlanBlockDialog'
import { PlanTimeline, type TimelineView } from '@/components/planning/PlanTimeline'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/useAuth'
import { useOrganization } from '@/hooks/useOrganization'
import {
  useInvalidatePlanning,
  useMachines,
  usePlanDay,
  useUserNames,
  useWorkingHours,
} from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { formatWorkOrderDate, formatWorkOrderDateTime, getLocalIsoDate } from '@/shared/utils/work-orders'
import type { PlanAssignment, ProductionPlan } from '@/types/planning'

type PlanSource = 'draft' | 'published'
type PendingConfirm = 'generate' | 'replan' | 'publish' | 'discard' | null
/** Page sections: the day plan and, with Magacin on, material needs (D-028). */
type PlanningSection = 'plan' | 'materials'

function PlanMeta({ plan, source }: { plan: ProductionPlan; source: PlanSource }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <p className="text-[11px] text-[color:var(--iris-ink-soft)]">
      {source === 'draft'
        ? t('planning.plan.draftMeta', {
            at: formatWorkOrderDateTime(plan.updatedAt || plan.generatedAt),
            by: plan.updatedBy || plan.generatedBy,
          })
        : t('planning.plan.publishedMeta', {
            at: plan.publishedAt ? formatWorkOrderDateTime(plan.publishedAt) : '—',
            by: plan.publishedBy ?? '—',
          })}
    </p>
  )
}

/**
 * "Planiranje": the day plan. Admins generate a draft, adjust it by hand,
 * publish it and re-plan today; operators see the published plan read-only.
 */
function PlanningPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const isAdmin = currentUser.role === 'admin'
  const invalidate = useInvalidatePlanning()
  const today = getLocalIsoDate()

  const [date, setDate] = useState(today)
  const [view, setView] = useState<TimelineView>('machines')
  const [source, setSource] = useState<PlanSource | null>(null)
  const [edits, setEdits] = useState<PlanAssignment[] | null>(null)
  const [selected, setSelected] = useState<PlanAssignment | null>(null)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { modules } = useOrganization()
  const showMaterials = modules.planning && modules.stock
  const [section, setSection] = useState<PlanningSection>('plan')
  const activeSection: PlanningSection = showMaterials ? section : 'plan'

  const dayQuery = usePlanDay(date)
  const hoursQuery = useWorkingHours()
  const machinesQuery = useMachines()
  const userNames = useUserNames()

  const day = dayQuery.data
  const draft = isAdmin ? (day?.draft ?? null) : null
  const published = day?.published ?? null
  const effective: PlanSource = isAdmin && draft && source !== 'published' ? 'draft' : 'published'
  const plan = effective === 'draft' ? draft : published
  const dirty = edits !== null
  const assignments = useMemo(
    () => (effective === 'draft' && edits ? edits : (plan?.assignments ?? [])),
    [effective, edits, plan],
  )
  const showDrift = isAdmin && date === today && published !== null && day?.drift?.suggested === true

  const changeDate = (next: string): void => {
    setDate(next)
    setEdits(null)
    setSource(null)
    setSelected(null)
    setActionError(null)
  }

  const run = async (
    name: string,
    action: () => Promise<unknown>,
    messages: { success: string; error: string },
    after?: () => void,
  ): Promise<void> => {
    setBusy(name)
    setActionError(null)
    try {
      await action()
      after?.()
      await invalidate()
      toast.success(messages.success)
    } catch (cause) {
      reportUnexpectedError(`PlanningPage.${name}`, cause)
      const message = formatActionError(messages.error, cause)
      setActionError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const generate = (replan: boolean): Promise<void> =>
    run(
      replan ? 'replan' : 'generate',
      () => window.api.generatePlan({ date, replan }),
      { success: t(replan ? 'planning.actions.replanned' : 'planning.actions.generated'), error: t('planning.actions.generateError') },
      () => {
        setEdits(null)
        setSource(null)
      },
    )

  const ask = (kind: Exclude<PendingConfirm, null>): void => {
    const needsConfirm =
      kind === 'discard' ||
      (kind === 'publish' && published !== null) ||
      ((kind === 'generate' || kind === 'replan') && (draft !== null || dirty))
    if (needsConfirm) {
      setConfirm(kind)
      return
    }
    void (kind === 'publish' ? publish() : generate(kind === 'replan'))
  }

  const publish = (): Promise<void> =>
    run('publish', () => window.api.publishPlan({ date }), {
      success: t('planning.actions.published'),
      error: t('planning.actions.publishError'),
    }, () => {
      setEdits(null)
      setSource('published')
    })

  const save = (): Promise<void> =>
    run('save', () => window.api.updatePlanDraft({ date, assignments: edits ?? [] }), {
      success: t('planning.actions.saved'),
      error: t('planning.actions.saveError'),
    }, () => setEdits(null))

  const discard = (): Promise<void> =>
    run('discard', () => window.api.deletePlanDraft(date), {
      success: t('planning.actions.discarded'),
      error: t('planning.actions.discardError'),
    }, () => {
      setEdits(null)
      setSource(null)
    })

  const applyEdit = (updated: PlanAssignment): void => {
    const base = edits ?? draft?.assignments ?? []
    setEdits(base.map((entry) => (entry.id === updated.id ? updated : entry)))
  }

  const sourceTabs: TabItem<PlanSource>[] = [
    { value: 'draft', label: t('planning.plan.draft'), disabled: !draft },
    { value: 'published', label: t('planning.plan.published'), disabled: !published },
  ]
  const sectionTabs: TabItem<PlanningSection>[] = [
    { value: 'plan', label: t('planning.materials.tabPlan') },
    { value: 'materials', label: t('planning.materials.tab') },
  ]
  const viewTabs: TabItem<TimelineView>[] = [
    { value: 'machines', label: t('planning.timeline.byMachine') },
    { value: 'people', label: t('planning.timeline.byPerson') },
  ]

  const confirmCopy: Record<Exclude<PendingConfirm, null>, { title: string; description: string; label: string; run: () => Promise<void>; destructive?: boolean }> = {
    generate: {
      title: t('planning.confirm.generateTitle'),
      description: t('planning.confirm.generateDescription'),
      label: t('planning.actions.generate'),
      run: () => generate(false),
    },
    replan: {
      title: t('planning.confirm.replanTitle'),
      description: t('planning.confirm.replanDescription'),
      label: t('planning.actions.replan'),
      run: () => generate(true),
    },
    publish: {
      title: t('planning.confirm.publishTitle'),
      description: t('planning.confirm.publishDescription'),
      label: t('planning.actions.publish'),
      run: publish,
    },
    discard: {
      title: t('planning.confirm.discardTitle'),
      description: t('planning.confirm.discardDescription'),
      label: t('planning.actions.discard'),
      run: discard,
      destructive: true,
    },
  }
  const current = confirm ? confirmCopy[confirm] : null

  return (
    <div className="space-y-6">
      <div className="animate-iris-enter flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t('planning.eyebrow')}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">{t('planning.title')}</h1>
          <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            {isAdmin ? t('planning.subtitle') : t('planning.subtitleReadOnly')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/planning/my-queue">
              <ListChecks aria-hidden /> {t('planning.myQueue.link')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/planning/resources">
              <Settings2 aria-hidden /> {t('planning.resources.link')}
            </Link>
          </Button>
        </div>
      </div>

      {showMaterials && (
        <div className="px-5 sm:px-8">
          <Tabs tabs={sectionTabs} value={activeSection} onValueChange={setSection} aria-label={t('planning.materials.sectionsAria')} />
        </div>
      )}
      {activeSection === 'materials' && (
        <div className="px-5 pb-8 sm:px-8">
          <MaterialNeedsTab />
        </div>
      )}

      <div className="space-y-5 px-5 pb-8 sm:px-8" hidden={activeSection !== 'plan'}>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            id="plan-date"
            value={date}
            onChange={(next) => next && changeDate(next)}
            placeholder={t('planning.date')}
          />
          <span className="tnum text-[12px] text-[color:var(--iris-ink-soft)]" aria-live="polite">
            {formatWorkOrderDate(date)}
          </span>
          {isAdmin && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy !== null} onClick={() => ask('generate')}>
                {busy === 'generate' && <Loader2 className="animate-spin" aria-hidden />}
                {t('planning.actions.generate')}
              </Button>
              {date === today && published !== null && (
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => ask('replan')}>
                  {busy === 'replan' && <Loader2 className="animate-spin" aria-hidden />}
                  {t('planning.actions.replan')}
                </Button>
              )}
              <Button type="button" variant="outline" disabled={!dirty || busy !== null} onClick={() => void save()}>
                {busy === 'save' && <Loader2 className="animate-spin" aria-hidden />}
                {t('planning.actions.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!draft || dirty || busy !== null}
                title={dirty ? t('planning.actions.saveFirst') : undefined}
                onClick={() => ask('publish')}
              >
                {busy === 'publish' && <Loader2 className="animate-spin" aria-hidden />}
                {t('planning.actions.publish')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!draft || busy !== null}
                onClick={() => ask('discard')}
              >
                {t('planning.actions.discard')}
              </Button>
            </div>
          )}
        </div>

        {actionError && (
          <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {actionError}
          </p>
        )}

        {showDrift && (
          <div
            role="status"
            data-testid="drift-banner"
            className="flex flex-wrap items-start gap-3 border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-[12px]"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('planning.drift.title')}</p>
              <ul className="mt-1 list-disc pl-4 text-[color:var(--iris-ink-soft)]">
                {day?.drift?.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
            <Button type="button" size="sm" disabled={busy !== null} onClick={() => ask('replan')}>
              {t('planning.actions.replan')}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {isAdmin ? (
            <Tabs tabs={sourceTabs} value={effective} onValueChange={setSource} aria-label={t('planning.plan.sourceAria')} />
          ) : (
            <h2 className="text-[14px] font-medium">{t('planning.plan.published')}</h2>
          )}
          <Tabs tabs={viewTabs} value={view} onValueChange={setView} aria-label={t('planning.timeline.viewAria')} />
        </div>

        {dayQuery.isPending ? (
          <div className="flex items-center gap-2 py-10 text-[12px] text-[color:var(--iris-ink-soft)]">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
          </div>
        ) : dayQuery.isError ? (
          <p role="alert" className="py-6 text-[12px] text-destructive">
            {t('planning.plan.loadError')}
          </p>
        ) : !plan ? (
          <p className="border border-border bg-card px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
            {isAdmin ? t('planning.plan.noneAdmin') : t('planning.plan.none')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <PlanMeta plan={plan} source={effective} />
              {dirty && (
                <span role="status" className="border border-amber-500/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {t('planning.plan.unsaved')}
                </span>
              )}
            </div>
            <PlanTimeline
              date={date}
              assignments={assignments}
              view={view}
              workingHours={hoursQuery.data}
              userNames={userNames}
              machines={machinesQuery.data}
              selectedId={selected?.id}
              onSelect={setSelected}
            />

            {plan.issues.length > 0 && (
              <section aria-labelledby="issues-heading" className="space-y-2">
                <h2 id="issues-heading" className="text-[14px] font-medium">
                  {t('planning.issues.title', { count: plan.issues.length })}
                </h2>
                <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
                  {plan.issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.workOrderId}-${issue.stepNodeId ?? ''}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-[12px]">
                      <Link to={`/work-orders/${encodeURIComponent(issue.workOrderId)}`} className="iris-focusable font-medium underline">
                        {issue.orderNumber}
                      </Link>
                      {issue.stepLabel && <span className="text-[color:var(--iris-ink-soft)]">{issue.stepLabel}</span>}
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.lateOrders.length > 0 && (
              <section aria-labelledby="late-heading" className="space-y-2">
                <h2 id="late-heading" className="text-[14px] font-medium">
                  {t('planning.late.title', { count: plan.lateOrders.length })}
                </h2>
                <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
                  {plan.lateOrders.map((order) => (
                    <li key={order.workOrderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[12px]">
                      <Link to={`/work-orders/${encodeURIComponent(order.workOrderId)}`} className="iris-focusable font-medium underline">
                        {order.orderNumber}
                      </Link>
                      <span>{order.clientName}</span>
                      <span className="tnum text-[color:var(--iris-ink-soft)]">
                        {t('planning.late.due', { date: order.dueDate ? formatWorkOrderDate(order.dueDate) : '—' })}
                        {' · '}
                        {t('planning.late.finish', { date: order.estimatedFinish ? formatWorkOrderDate(order.estimatedFinish) : '—' })}
                      </span>
                      <ForecastBadges forecast={order} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <ForecastTable />
      </div>

      <PlanBlockDialog
        assignment={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        userNames={userNames}
        machines={machinesQuery.data ?? []}
        editable={isAdmin && effective === 'draft'}
        onApply={applyEdit}
      />
      {current && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={current.title}
          description={current.description}
          confirmLabel={current.label}
          errorPrefix={t('planning.actions.genericError')}
          destructive={current.destructive}
          onConfirm={current.run}
        />
      )}
    </div>
  )
}

export default PlanningPage
