import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { StockDialog } from '@/components/Stock/StockDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useInvalidatePlanning, useMachineTypes, useMachines } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { machineSchema, type MachineFormValues } from '@/lib/planning/validation'
import type { Machine, MachineType } from '@/types/planning'
import { ConfirmDialog } from './ConfirmDialog'
import { NativeSelect } from './NativeSelect'
import { QueryState } from './QueryState'

function MachineDialog({
  editing,
  types,
  open,
  onOpenChange,
}: {
  editing: Machine | null
  types: MachineType[]
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const invalidate = useInvalidatePlanning()
  const [serverError, setServerError] = useState<string | null>(null)
  const schema = machineSchema()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MachineFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { machineTypeId: '', name: '', inService: true, note: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({
      machineTypeId: editing?.machineTypeId ?? '',
      name: editing?.name ?? '',
      inService: editing?.inService ?? true,
      note: editing?.note ?? '',
    })
    setServerError(null)
  }, [open, editing, reset])

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    const input = {
      machineTypeId: values.machineTypeId,
      name: values.name,
      inService: values.inService,
      note: values.note.trim() === '' ? undefined : values.note.trim(),
    }
    try {
      if (editing) await window.api.updateMachine(editing.id, input)
      else await window.api.createMachine(input)
      await invalidate()
      toast.success(t(editing ? 'planning.machines.updated' : 'planning.machines.created'))
      onOpenChange(false)
    } catch (cause) {
      reportUnexpectedError('MachineDialog.submit', cause)
      setServerError(formatActionError(t('planning.machines.saveError'), cause))
    }
  })

  return (
    <StockDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? 'planning.machines.editTitle' : 'planning.machines.createTitle')}
      description={t('planning.machines.dialogDescription')}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="machine-name">{t('planning.machines.name')}</Label>
          <Input id="machine-name" aria-invalid={errors.name ? true : undefined} {...register('name')} />
          {errors.name && (
            <p role="alert" className="text-[11px] text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="machine-type">{t('planning.machines.type')}</Label>
          <NativeSelect
            id="machine-type"
            aria-invalid={errors.machineTypeId ? true : undefined}
            {...register('machineTypeId')}
          >
            <option value="">{t('planning.machines.typePlaceholder')}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
          {errors.machineTypeId && (
            <p role="alert" className="text-[11px] text-destructive">
              {errors.machineTypeId.message}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" className="size-4" {...register('inService')} />
          {t('planning.machines.inService')}
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="machine-note">{t('planning.machines.note')}</Label>
          <Textarea id="machine-note" rows={2} aria-invalid={errors.note ? true : undefined} {...register('note')} />
          {errors.note && (
            <p role="alert" className="text-[11px] text-destructive">
              {errors.note.message}
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

/** "Mašine": individual units of a machine type (admins edit; units out of service are never planned). */
export function MachinesTab({ canEdit }: { canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const machinesQuery = useMachines()
  const typesQuery = useMachineTypes()
  const invalidate = useInvalidatePlanning()
  const [dialog, setDialog] = useState<{ editing: Machine | null } | null>(null)
  const [removing, setRemoving] = useState<Machine | null>(null)
  const typeNames = useMemo(
    () => new Map((typesQuery.data ?? []).map((type) => [type.id, type.name])),
    [typesQuery.data],
  )

  return (
    <section aria-labelledby="machines-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="machines-heading" className="text-[14px] font-medium">
          {t('planning.machines.title')}
        </h2>
        {canEdit && (
          <Button
            type="button"
            disabled={(typesQuery.data ?? []).length === 0}
            title={(typesQuery.data ?? []).length === 0 ? t('planning.machines.needType') : undefined}
            onClick={() => setDialog({ editing: null })}
          >
            <Plus aria-hidden /> {t('planning.machines.add')}
          </Button>
        )}
      </div>
      <QueryState query={machinesQuery} empty={t('planning.machines.empty')} loadError={t('planning.loadError')}>
        {(machines) => (
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.name')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.type')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.status')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.note')}</th>
                  {canEdit && <th scope="col" className="w-24 px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                {machines.map((machine) => (
                  <tr key={machine.id}>
                    <th scope="row" className="px-4 py-2 text-[13px] font-normal">{machine.name}</th>
                    <td className="px-4 py-2">{typeNames.get(machine.machineTypeId) ?? '—'}</td>
                    <td className="px-4 py-2">
                      {machine.inService ? t('planning.machines.inServiceYes') : t('planning.machines.inServiceNo')}
                    </td>
                    <td className="px-4 py-2 text-[color:var(--iris-ink-soft)]">{machine.note ?? ''}</td>
                    {canEdit && (
                      <td className="px-4 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('planning.machines.editAria', { name: machine.name })}
                          onClick={() => setDialog({ editing: machine })}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('planning.machines.deleteAria', { name: machine.name })}
                          onClick={() => setRemoving(machine)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>

      <MachineDialog
        editing={dialog?.editing ?? null}
        types={typesQuery.data ?? []}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={t('planning.machines.deleteTitle')}
        description={t('planning.machines.deleteDescription', { name: removing?.name ?? '' })}
        confirmLabel={t('common.delete')}
        errorPrefix={t('planning.machines.deleteError')}
        onConfirm={async () => {
          if (!removing) return
          await window.api.deleteMachine(removing.id)
          await invalidate()
          toast.success(t('planning.machines.deleted'))
        }}
      />
    </section>
  )
}
