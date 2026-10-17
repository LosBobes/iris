import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { graphsEqual, normalizeGraphForKinds, stripOrderState, validateGraph, MAX_LABEL_LENGTH } from '@/lib/process/graph'
import type { ProcessGraph, ProcessTemplate, ProcessTemplateInput } from '@/types/process'
import { ProcessGraphEditor } from './ProcessGraphEditor'

const EMPTY_TEMPLATE_GRAPH: ProcessGraph = { nodes: [], edges: [] }

interface FormValues {
  name: string
  description: string
  isDefault: boolean
}

interface ProcessTemplateFormProps {
  /** Existing template to edit; omit to create. */
  template?: ProcessTemplate
  onSubmit: (input: ProcessTemplateInput) => Promise<void>
  onCancel: () => void
  /** Reports unsaved edits so the host can arm a navigation guard. */
  onDirtyChange?: (dirty: boolean) => void
}

/** Name / description / default + graph editor for one process template. */
export function ProcessTemplateForm({
  template,
  onSubmit,
  onCancel,
  onDirtyChange,
}: ProcessTemplateFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('process.form.nameRequired'))
          .max(MAX_LABEL_LENGTH, t('process.form.nameTooLong', { max: MAX_LABEL_LENGTH })),
        description: z.string().max(2000, t('process.form.descriptionTooLong')),
        isDefault: z.boolean(),
      }),
    [t],
  )

  const initialGraph = useMemo(
    () => (template ? stripOrderState(template.graph) : EMPTY_TEMPLATE_GRAPH),
    [template],
  )
  const [graph, setGraph] = useState<ProcessGraph>(initialGraph)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template?.name ?? '',
      description: template?.description ?? '',
      isDefault: template?.isDefault ?? false,
    },
  })

  const dirty = isDirty || !graphsEqual(graph, initialGraph)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const submit = handleSubmit(async (values) => {
    if (validateGraph(graph).length > 0) {
      toast.error(t('process.form.fixGraph'))
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        name: values.name.trim(),
        description: values.description.trim(),
        isDefault: values.isDefault,
        graph: stripOrderState(normalizeGraphForKinds(graph)),
      })
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="process-name">{t('process.form.name')}</Label>
          <Input
            id="process-name"
            maxLength={MAX_LABEL_LENGTH}
            aria-invalid={errors.name ? true : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p role="alert" className="text-[11px] text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="process-description">{t('process.form.description')}</Label>
          <Textarea
            id="process-description"
            rows={2}
            aria-invalid={errors.description ? true : undefined}
            {...register('description')}
          />
          {errors.description && (
            <p role="alert" className="text-[11px] text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>
      </div>

      <Controller
        control={control}
        name="isDefault"
        render={({ field }) => (
          <div className="flex items-start gap-2">
            <Checkbox
              id="process-default"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            <div>
              <Label htmlFor="process-default">{t('process.form.isDefault')}</Label>
              <p className="mt-1 text-[11px] text-[color:var(--iris-ink-soft)]">{t('process.form.isDefaultHint')}</p>
            </div>
          </div>
        )}
      />

      <ProcessGraphEditor mode="template" value={graph} onChange={setGraph} canEditStructure />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t('common.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
