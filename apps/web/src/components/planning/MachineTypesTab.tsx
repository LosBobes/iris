import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { StockDialog } from '@/components/Stock/StockDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useInvalidatePlanning, useMachineTypes } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { machineTypeSchema } from '@/lib/planning/validation'
import type { MachineType } from '@/types/planning'
import { ConfirmDialog } from './ConfirmDialog'
import { QueryState } from './QueryState'

interface FormValues {
  name: string
}

function MachineTypeDialog({
  editing,
  open,
  onOpenChange,
}: {
  editing: MachineType | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const invalidate = useInvalidatePlanning()
  const [serverError, setServerError] = useState<string | null>(null)
  // Built per render so the messages follow the active language.
  const schema = machineTypeSchema()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  useEffect(() => {
    if (!open) return
    reset({ name: editing?.name ?? '' })
    setServerError(null)
  }, [open, editing, reset])

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      if (editing) await window.api.updateMachineType(editing.id, { name: values.name })
      else await window.api.createMachineType({ name: values.name })
      await invalidate()
      toast.success(t(editing ? 'planning.types.updated' : 'planning.types.created'))
      onOpenChange(false)
    } catch (cause) {
      reportUnexpectedError('MachineTypeDialog.submit', cause)
      setServerError(formatActionError(t('planning.types.saveError'), cause))
    }
  })

  return (
    <StockDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? 'planning.types.editTitle' : 'planning.types.createTitle')}
      description={t('planning.types.dialogDescription')}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="machine-type-name">{t('planning.types.name')}</Label>
          <Input id="machine-type-name" aria-invalid={errors.name ? true : undefined} {...register('name')} />
          {errors.name && (
            <p role="alert" className="text-[11px] text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>
        {serverError && (
          <p role="alert" className="text-[12px] text-destructive">
            {serverError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {t('common.save')}
          </Button>
        </div>
      </form>
    </StockDialog>
  )
}

/** "Tipovi mašina": the kinds of machine a step can require. */
export function MachineTypesTab({ canEdit }: { canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const query = useMachineTypes()
  const invalidate = useInvalidatePlanning()
  const [dialog, setDialog] = useState<{ editing: MachineType | null } | null>(null)
  const [removing, setRemoving] = useState<MachineType | null>(null)

  return (
    <section aria-labelledby="types-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="types-heading" className="text-[14px] font-medium">
          {t('planning.types.title')}
        </h2>
        {canEdit && (
          <Button type="button" onClick={() => setDialog({ editing: null })}>
            <Plus aria-hidden /> {t('planning.types.add')}
          </Button>
        )}
      </div>
      <QueryState query={query} empty={t('planning.types.empty')} loadError={t('planning.loadError')}>
        {(types) => (
          <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
            {types.map((type) => (
              <li key={type.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="truncate">{type.name}</span>
                {canEdit && (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('planning.types.editAria', { name: type.name })}
                      onClick={() => setDialog({ editing: type })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('planning.types.deleteAria', { name: type.name })}
                      onClick={() => setRemoving(type)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <MachineTypeDialog
        editing={dialog?.editing ?? null}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={t('planning.types.deleteTitle')}
        description={t('planning.types.deleteDescription', { name: removing?.name ?? '' })}
        confirmLabel={t('common.delete')}
        errorPrefix={t('planning.types.deleteError')}
        onConfirm={async () => {
          if (!removing) return
          await window.api.deleteMachineType(removing.id)
          await invalidate()
          toast.success(t('planning.types.deleted'))
        }}
      />
    </section>
  )
}
