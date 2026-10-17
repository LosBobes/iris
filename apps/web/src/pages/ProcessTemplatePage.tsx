import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
import { ProcessTemplateForm } from '@/components/process/ProcessTemplateForm'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import type { ProcessTemplate, ProcessTemplateInput } from '@/types/process'

function ProcessTemplatePage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = id === undefined || id === 'new'

  const [template, setTemplate] = useState<ProcessTemplate | undefined>(undefined)
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [dirty, setDirty] = useState(false)
  const guard = useUnsavedChangesGuard(dirty)
  const { allowNavigation } = guard

  useEffect(() => {
    if (isNew || !id) return
    let active = true
    window.api
      .getProcessTemplate(id)
      .then((found) => {
        if (!active) return
        if (found) setTemplate(found)
        else setNotFound(true)
      })
      .catch((cause: unknown) => {
        if (!active) return
        reportUnexpectedError('ProcessTemplatePage.load', cause)
        toast.error(formatActionError(t('process.templates.loadError'), cause))
        setNotFound(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, isNew, t])

  const goBack = useCallback(() => navigate('/settings'), [navigate])

  const handleSubmit = useCallback(
    async (input: ProcessTemplateInput): Promise<void> => {
      try {
        if (isNew) await window.api.createProcessTemplate(input)
        else await window.api.updateProcessTemplate(id as string, input)
        toast.success(t('process.templates.saved'))
        allowNavigation()
        navigate('/settings')
      } catch (cause) {
        toast.error(formatActionError(t('process.templates.saveError'), cause))
      }
    },
    [allowNavigation, id, isNew, navigate, t],
  )

  return (
    <>
      <div className="space-y-6">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <button
            type="button"
            onClick={goBack}
            className="iris-focusable iris-press mb-2 inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('process.page.back')}
          </button>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t('process.page.eyebrow')}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {isNew ? t('process.page.newTitle') : template?.name || t('process.page.editTitle')}
          </h1>
        </div>

        <div className="animate-iris-enter px-5 pb-10 sm:px-8 lg:px-10" style={{ animationDelay: '90ms' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </div>
          ) : notFound ? (
            <p className="py-20 text-center text-sm text-muted-foreground">{t('process.page.notFound')}</p>
          ) : (
            <ProcessTemplateForm
              template={template}
              onSubmit={handleSubmit}
              onCancel={goBack}
              onDirtyChange={setDirty}
            />
          )}
        </div>
      </div>
      <UnsavedChangesDialog {...guard} />
    </>
  )
}

export default ProcessTemplatePage
