import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Package, Save, Trash2, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { useOrganization } from '@/hooks/useOrganization'
import { useStockLevels } from '@/hooks/useStockLevels'
import { formatStockQuantity } from '@/lib/stock/format'
import { linkedArticleIds, materialRows, shortages, stockContextFor } from '@/lib/stock/posting'
import { cn } from '@/lib/utils'
import { ApiError, formatActionError, reportUnexpectedError } from '@/lib/errors'
import { graphsEqual, readySteps, summarizeProgress, validateGraph } from '@/lib/process/graph'
import { percentToScale, staggerStyle } from '@/lib/motion'
import { formatWorkOrderDateTime } from '@/shared/utils/work-orders'
import { ProcessSimulatorButton } from './ProcessSimulatorButton'
import type { ProcessGraph, ProcessTemplate, WorkOrderProcess } from '@/types/process'

// React Flow is heavy; it only loads once somebody opens the graph.
const ProcessGraphEditor = lazy(() => import('./ProcessGraphEditor'))

interface WorkOrderProcessPanelProps {
  workOrderId: string
  /** Admins may change the structure and remove the process; operators only state. */
  canEditStructure: boolean
}

function errorStatus(cause: unknown): number | null {
  return cause instanceof ApiError ? cause.status : null
}

/** "Proces rada" section of the work-order detail page. */
export function WorkOrderProcessPanel(props: WorkOrderProcessPanelProps): React.JSX.Element | null {
  const { modules } = useOrganization()
  // Off module: render nothing, so the order's process is never requested.
  if (!modules.processes) return null
  return <WorkOrderProcessPanelBody {...props} />
}

function WorkOrderProcessPanelBody({
  workOrderId,
  canEditStructure,
}: WorkOrderProcessPanelProps): React.JSX.Element {
  const { modules } = useOrganization()
  // Stock is a separate module: without it the process works with no articles,
  // material table, shortage checks or stock requests.
  const stockEnabled = modules.stock
  const { t } = useTranslation()
  // undefined = loading, null = the order has no process.
  const [process, setProcess] = useState<WorkOrderProcess | null | undefined>(undefined)
  const [draft, setDraft] = useState<ProcessGraph | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ProcessTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const adopt = useCallback((next: WorkOrderProcess | null) => {
    setProcess(next)
    setDraft(next ? next.graph : null)
  }, [])

  useEffect(() => {
    let active = true
    setProcess(undefined)
    window.api
      .getWorkOrderProcess(workOrderId)
      .then((loaded) => {
        if (!active) return
        setLoadError(null)
        adopt(loaded)
      })
      .catch((cause: unknown) => {
        if (!active) return
        reportUnexpectedError('WorkOrderProcessPanel.load', cause)
        setLoadError(formatActionError(t('process.order.loadError'), cause))
        setProcess(null)
      })
    return () => {
      active = false
    }
  }, [workOrderId, adopt, t])

  // Templates are only needed to pick one for an order without a process.
  useEffect(() => {
    if (process !== null) return
    let active = true
    window.api
      .getProcessTemplates()
      .then((list) => {
        if (!active) return
        setTemplates(list)
        setTemplateId((current) => current || (list.find((item) => item.isDefault) ?? list[0])?.id || '')
      })
      .catch((cause: unknown) => {
        if (!active) return
        reportUnexpectedError('WorkOrderProcessPanel.templates', cause)
        setTemplates([])
      })
    return () => {
      active = false
    }
  }, [process])

  const dirty = process != null && draft !== null && !graphsEqual(draft, process.graph)
  const guard = useUnsavedChangesGuard(dirty)

  // Live warehouse state of the linked articles. The order's own reservation is
  // added back (see materialRows), so an order never reports a shortage caused
  // only by its own planned material.
  const linkedIds = useMemo(() => (draft ? linkedArticleIds(draft) : []), [draft])
  const { levels, loaded: stockLoaded, reload: reloadStock } = useStockLevels(linkedIds, stockEnabled)
  const materials = useMemo(() => (draft ? materialRows(draft, 'order', levels) : []), [draft, levels])
  const missing = useMemo(() => shortages(materials), [materials])
  const stockContext = useMemo(
    () => (draft && stockEnabled ? stockContextFor(draft, 'order', levels) : undefined),
    [draft, levels, stockEnabled],
  )

  const progress = useMemo(() => (draft ? summarizeProgress(draft) : null), [draft])
  const ready = useMemo(() => (draft ? readySteps(draft) : []), [draft])

  const handleApply = async (): Promise<void> => {
    if (!templateId) return
    setBusy(true)
    try {
      adopt(await window.api.applyProcessTemplate(workOrderId, templateId))
      setExpanded(true)
      toast.success(t('process.order.applied'))
    } catch (cause) {
      if (errorStatus(cause) === 409) {
        toast.error(t('process.order.alreadyHas'))
        try {
          adopt(await window.api.getWorkOrderProcess(workOrderId))
        } catch {
          // The toast already explained the conflict; a reload retries.
        }
      } else {
        toast.error(formatActionError(t('process.order.applyError'), cause))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!draft) return
    if (validateGraph(draft).length > 0) {
      toast.error(t('process.form.fixGraph'))
      return
    }
    setBusy(true)
    try {
      adopt(await window.api.updateWorkOrderProcess(workOrderId, { graph: draft }))
      // Saving may have moved stock (completed steps post movements): refresh it.
      reloadStock()
      toast.success(t('process.order.saved'))
    } catch (cause) {
      const status = errorStatus(cause)
      if (status === 403) toast.error(t('process.order.forbidden'))
      else if (status === 409) toast.error(formatActionError(t('process.order.conflict'), cause))
      else toast.error(formatActionError(t('process.order.saveError'), cause))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.deleteWorkOrderProcess(workOrderId)
      adopt(null)
      setExpanded(false)
      toast.success(t('process.order.removed'))
    } catch (cause) {
      if (errorStatus(cause) === 403) toast.error(t('process.order.forbidden'))
      else toast.error(formatActionError(t('process.order.removeError'), cause))
    } finally {
      setBusy(false)
      setConfirmRemove(false)
    }
  }

  const header = (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
      <Workflow className="size-3.5 text-[color:var(--iris-accent)]" aria-hidden />
      {t('process.order.title')}
    </div>
  )

  let body: React.ReactNode
  if (process === undefined) {
    body = (
      <div className="flex items-center gap-2 text-[12px] text-[color:var(--iris-ink-soft)]">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
      </div>
    )
  } else if (process === null) {
    body = (
      <div className="animate-iris-rise space-y-3">
        {loadError && (
          <p role="alert" className="text-[12px] text-[color:var(--iris-status-cancelled)]">
            {loadError}
          </p>
        )}
        <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('process.order.none')}</p>
        {templates === null ? null : templates.length === 0 ? (
          <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('process.order.noTemplates')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-64" aria-label={t('process.order.pickTemplate')}>
                <SelectValue placeholder={t('process.order.pickTemplate')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.isDefault ? ` (${t('process.templates.default').toLowerCase()})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={busy || !templateId} onClick={() => void handleApply()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {t('process.order.apply')}
            </Button>
          </div>
        )}
      </div>
    )
  } else if (draft && progress) {
    body = (
      <div className="space-y-4">
        <div className="animate-iris-enter iris-stagger space-y-2" style={staggerStyle(0)}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[13px] text-foreground">
              {t('process.order.progress', { done: progress.finished, total: progress.total })}
              <span className="ml-2 text-[11px] text-[color:var(--iris-ink-soft)]">
                {process.templateName}
              </span>
            </div>
            <div className="text-[11px] text-[color:var(--iris-ink-mute)]">
              {t('process.order.updated', {
                time: formatWorkOrderDateTime(process.updatedAt),
                user: process.updatedBy,
              })}
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={t('process.order.title')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="h-1.5 w-full overflow-hidden bg-muted"
          >
            <div
              className="iris-bar h-full w-full bg-[color:var(--iris-status-done)]"
              style={
                {
                  '--iris-bar': percentToScale(progress.percent),
                  scale: `${percentToScale(progress.percent)} 1`,
                } as React.CSSProperties
              }
            />
          </div>
          <p className="text-[12px] text-[color:var(--iris-ink-soft)]">
            {progress.total > 0 && progress.finished === progress.total
              ? t('process.order.allDone')
              : ready.length > 0
                ? t('process.order.readySteps', { steps: ready.map((step) => step.label).join(', ') })
                : t('process.order.noReady')}
          </p>
        </div>

        {stockEnabled && linkedIds.length > 0 && (
          <section
            aria-label={t('process.materials.title')}
            data-testid="process-materials"
            className="animate-iris-enter iris-stagger space-y-2"
            style={staggerStyle(1)}
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              <Package className="size-3.5 text-[color:var(--iris-accent)]" aria-hidden />
              {t('process.materials.title')}
              <Link
                to="/stock"
                className="iris-focusable ml-auto normal-case tracking-normal text-[color:var(--iris-ink-soft)] underline-offset-2 hover:text-foreground hover:underline"
              >
                {t('process.materials.openStock')}
              </Link>
            </div>
            {missing.length > 0 && (
              <p
                role="alert"
                className="animate-iris-rise flex items-start gap-2 border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {t('process.materials.warning', {
                    items: missing
                      .map((row) =>
                        t('process.materials.warningItem', {
                          name: row.name,
                          qty: formatStockQuantity(row.shortage, row.unit),
                        }),
                      )
                      .join(', '),
                  })}
                </span>
              </p>
            )}
            {!stockLoaded ? (
              <div className="flex items-center gap-2 text-[12px] text-[color:var(--iris-ink-soft)]">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t('process.materials.loading')}
              </div>
            ) : materials.length === 0 ? (
              <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('process.materials.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                      <th scope="col" className="py-1.5 pr-3 font-normal">{t('process.materials.article')}</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-normal">{t('process.materials.planned')}</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-normal">{t('process.materials.actual')}</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-normal">{t('process.materials.available')}</th>
                      <th scope="col" className="py-1.5 text-right font-normal">{t('process.materials.shortage')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                    {materials.map((row, index) => (
                      <tr
                        key={row.catalogItemId}
                        data-short={row.shortage > 0 ? 'true' : undefined}
                        className="iris-row animate-iris-rise iris-stagger"
                        style={staggerStyle(index)}
                      >
                        <th scope="row" className="py-1.5 pr-3 font-normal text-foreground">
                          {row.name}
                          {row.nodeLabels.length > 0 && (
                            <span className="ml-2 text-[11px] text-[color:var(--iris-ink-mute)]">
                              {row.nodeLabels.join(', ')}
                            </span>
                          )}
                        </th>
                        <td className="tnum py-1.5 pr-3 text-right">{formatStockQuantity(row.planned, row.unit)}</td>
                        <td className="tnum py-1.5 pr-3 text-right">
                          {row.actual === null ? '—' : formatStockQuantity(row.actual, row.unit)}
                        </td>
                        <td className="tnum py-1.5 pr-3 text-right">{formatStockQuantity(row.available, row.unit)}</td>
                        <td
                          className={cn(
                            'tnum py-1.5 text-right',
                            row.shortage > 0
                              ? 'font-medium text-destructive'
                              : 'text-[color:var(--iris-status-done)]',
                          )}
                        >
                          {row.consumed
                            ? t('process.materials.consumed')
                            : row.shortage > 0
                              ? formatStockQuantity(row.shortage, row.unit)
                              : t('process.materials.enough')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <div className="animate-iris-enter iris-stagger flex flex-wrap items-center gap-2" style={staggerStyle(2)}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            {expanded ? t('process.order.hideGraph') : t('process.order.showGraph')}
          </Button>
          {/* Previews the current draft only; the simulator never saves or mutates it. */}
          <ProcessSimulatorButton graph={draft} stock={stockContext} />
          {dirty && (
            <span className="text-[11px] text-[color:var(--iris-status-active)]">{t('process.order.unsaved')}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" disabled={busy || !dirty} onClick={() => void handleSave()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {t('common.save')}
            </Button>
            {canEditStructure && (
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>
                <Trash2 aria-hidden /> {t('process.order.remove')}
              </Button>
            )}
          </div>
        </div>

        {stockEnabled && (
          <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('process.materials.autoPosting')}</p>
        )}

        {expanded && (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 text-[12px] text-[color:var(--iris-ink-soft)]">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
              </div>
            }
          >
            <ProcessGraphEditor
              mode="order"
              value={draft}
              onChange={setDraft}
              canEditStructure={canEditStructure}
              stock={stockEnabled ? levels : undefined}
              articleLinking={stockEnabled}
              articlesHidden={!stockEnabled}
            />
          </Suspense>
        )}
      </div>
    )
  }

  return (
    <section
      aria-label={t('process.order.title')}
      className="border-t border-border bg-card p-5 sm:p-8"
      data-testid="work-order-process"
    >
      <div className="mb-4">{header}</div>
      {body}

      <AlertDialog open={confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('process.order.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('process.order.removeConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleRemove()}>
              {t('process.order.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UnsavedChangesDialog {...guard} />
    </section>
  )
}

export default WorkOrderProcessPanel
