import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Crown, Loader2, Play, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { useInvalidatePlanning, useMyQueue, useUserNames } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { timeOfLocal } from '@/lib/planning/time'
import { setProcessStepStatus } from '@/lib/planning/step-status'
import { formatWorkOrderDate, formatWorkOrderDateTime, getLocalIsoDate } from '@/shared/utils/work-orders'
import type { MyQueueItem } from '@/types/planning'
import type { ProcessStepStatus } from '@/types/process'

function StatusBadge({ status }: { status: ProcessStepStatus }): React.JSX.Element {
  const { t } = useTranslation()
  const tone =
    status === 'done'
      ? 'border-[color:var(--iris-status-done)] text-[color:var(--iris-status-done)]'
      : status === 'in_progress'
        ? 'border-[color:var(--iris-accent)] text-[color:var(--iris-accent)]'
        : 'border-border text-[color:var(--iris-ink-soft)]'
  return (
    <span className={`shrink-0 border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${tone}`}>
      {t(`planning.myQueue.status.${status}`)}
    </span>
  )
}

/** "Moj red": the signed-in user's blocks of the published plan, with start/finish actions. */
function MyQueuePage(): React.JSX.Element {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => getLocalIsoDate())
  const query = useMyQueue(date)
  const userNames = useUserNames()
  const invalidate = useInvalidatePlanning()
  const [busyId, setBusyId] = useState<string | null>(null)

  const changeStatus = async (item: MyQueueItem, status: ProcessStepStatus): Promise<void> => {
    setBusyId(item.id)
    try {
      await setProcessStepStatus(item.workOrderId, item.stepNodeId, status)
      // Queue, plan and forecast all depend on step state; the order's own
      // queries (and so its process panel) refetch too.
      await invalidate({ workOrders: true })
      toast.success(t(status === 'done' ? 'planning.myQueue.doneToast' : 'planning.myQueue.startedToast'))
    } catch (cause) {
      reportUnexpectedError('MyQueuePage.changeStatus', cause)
      toast.error(formatActionError(t('planning.myQueue.statusError'), cause))
    } finally {
      setBusyId(null)
    }
  }

  const items = query.data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="animate-iris-enter flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t('planning.eyebrow')}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {t('planning.myQueue.title')}
          </h1>
          <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.myQueue.subtitle')}</p>
        </div>
        <DatePicker
          id="queue-date"
          value={date}
          onChange={(next) => next && setDate(next)}
          placeholder={t('planning.date')}
        />
      </div>

      <div className="space-y-3 px-5 pb-8 sm:px-8">
        <p className="text-[12px] text-[color:var(--iris-ink-soft)]">
          <span className="tnum">{formatWorkOrderDate(date)}</span>
          {query.data?.publishedAt && (
            <> · {t('planning.myQueue.publishedAt', { at: formatWorkOrderDateTime(query.data.publishedAt) })}</>
          )}
        </p>

        {query.isPending ? (
          <div className="flex items-center gap-2 py-10 text-[12px] text-[color:var(--iris-ink-soft)]">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
          </div>
        ) : query.isError ? (
          <p role="alert" className="py-6 text-[12px] text-destructive">
            {t('planning.myQueue.loadError')}
          </p>
        ) : items.length === 0 ? (
          <p className="border border-border bg-card px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
            {query.data?.publishedAt ? t('planning.myQueue.empty') : t('planning.myQueue.notPublished')}
          </p>
        ) : (
          <ol className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
            {items.map((item) => (
              <li
                key={item.id}
                data-status={item.stepStatus}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/work-orders/${encodeURIComponent(item.workOrderId)}`}
                      className="iris-focusable text-[14px] font-medium underline"
                    >
                      {item.orderNumber}
                    </Link>
                    <span className="text-[13px]">{item.stepLabel}</span>
                    {item.parts > 1 && (
                      <span className="tnum text-[11px] text-[color:var(--iris-ink-soft)]">
                        {t('planning.block.part', { part: item.part, parts: item.parts })}
                      </span>
                    )}
                    {item.isLead && (
                      <span className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        <Crown className="size-3" aria-hidden /> {t('planning.lead')}
                      </span>
                    )}
                    <StatusBadge status={item.stepStatus} />
                  </div>
                  <div className="tnum text-[12px] text-[color:var(--iris-ink-soft)]">
                    {timeOfLocal(item.start)}–{timeOfLocal(item.end)}
                    {' · '}
                    {item.machineName || t('planning.timeline.noMachine')}
                    {' · '}
                    {item.clientName}
                  </div>
                  <div className="text-[12px] text-[color:var(--iris-ink-soft)]">
                    {t('planning.myQueue.crew')}: {item.userIds.map((id) => userNames.get(id) ?? id).join(', ')}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.stepStatus === 'pending' && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busyId !== null}
                      aria-label={t('planning.myQueue.startAria', { order: item.orderNumber, step: item.stepLabel })}
                      onClick={() => void changeStatus(item, 'in_progress')}
                    >
                      {busyId === item.id ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                      {t('planning.myQueue.start')}
                    </Button>
                  )}
                  {(item.stepStatus === 'pending' || item.stepStatus === 'in_progress') && (
                    <Button
                      type="button"
                      disabled={busyId !== null}
                      aria-label={t('planning.myQueue.finishAria', { order: item.orderNumber, step: item.stepLabel })}
                      onClick={() => void changeStatus(item, 'done')}
                    >
                      <CheckCheck aria-hidden />
                      {t('planning.myQueue.finish')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

export default MyQueuePage
