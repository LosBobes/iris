import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Star, Trash2, Workflow } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProcessTemplates } from '@/hooks/useProcessTemplates'
import { formatActionError } from '@/lib/errors'
import { staggerStyle } from '@/lib/motion'
import type { ProcessTemplate } from '@/types/process'

function stepCount(template: ProcessTemplate): number {
  return template.graph.nodes.filter((node) => node.kind === 'step').length
}

/** Admin-only Settings section: list, create, edit, delete and default-pick process templates. */
export function ProcessTemplatesSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { templates, loading, error, remove, setDefault } = useProcessTemplates()
  const [pendingDelete, setPendingDelete] = useState<ProcessTemplate | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSetDefault = async (template: ProcessTemplate): Promise<void> => {
    setBusy(true)
    try {
      await setDefault(template)
      toast.success(t('process.templates.defaultSet', { name: template.name }))
    } catch (cause) {
      toast.error(formatActionError(t('process.templates.saveError'), cause))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await remove(pendingDelete.id)
      toast.success(t('process.templates.deleted'))
    } catch (cause) {
      toast.error(formatActionError(t('process.templates.deleteError'), cause))
    } finally {
      setBusy(false)
      setPendingDelete(null)
    }
  }

  return (
    <section className="animate-iris-enter max-w-2xl border border-border bg-card" aria-labelledby="process-templates-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Workflow size={16} className="text-[color:var(--iris-accent)]" />
          <div>
            <div id="process-templates-title" className="text-[13px] font-medium text-foreground">
              {t('process.templates.title')}
            </div>
            <div className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('process.templates.hint')}</div>
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => navigate('/settings/processes/new')}>
          <Plus aria-hidden /> {t('process.templates.new')}
        </Button>
      </div>

      {loading && (
        <div className="px-5 py-6 text-[12px] text-[color:var(--iris-ink-soft)]">{t('common.loading')}</div>
      )}
      {error && !loading && (
        <div role="alert" className="px-5 py-6 text-[12px] text-[color:var(--iris-status-cancelled)]">
          {error}
        </div>
      )}
      {!loading && !error && templates.length === 0 && (
        <div className="px-5 py-6 text-[12px] text-[color:var(--iris-ink-soft)]">{t('process.templates.empty')}</div>
      )}

      {!loading && !error && templates.length > 0 && (
        <ul className="divide-y divide-border">
          {templates.map((template, index) => {
            const steps = stepCount(template)
            return (
              <li
                key={template.id}
                style={staggerStyle(index)}
                className="animate-iris-rise iris-stagger iris-row flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">{template.name}</span>
                    {template.isDefault && (
                      <Badge variant="secondary" className="animate-iris-pop">
                        {t('process.templates.default')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
                    {t('process.templates.stepCount', { count: steps })}
                    {template.description ? ` · ${template.description}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!template.isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={t('process.templates.makeDefaultAria', { name: template.name })}
                      onClick={() => void handleSetDefault(template)}
                    >
                      <Star aria-hidden /> {t('process.templates.makeDefault')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('process.templates.editAria', { name: template.name })}
                    onClick={() => navigate(`/settings/processes/${encodeURIComponent(template.id)}`)}
                  >
                    <Pencil aria-hidden /> {t('common.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('process.templates.deleteAria', { name: template.name })}
                    onClick={() => setPendingDelete(template)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('process.templates.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('process.templates.deleteConfirm', { name: pendingDelete?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
