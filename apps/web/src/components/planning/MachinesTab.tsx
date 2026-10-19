import { Fragment, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { StockDialog } from '@/components/Stock/StockDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useInvalidatePlanning, useMachineDowntimes, useMachineTypes, useMachines } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { formatLocalDateTime } from '@/lib/planning/time'
import { downtimeSchema, machineSchema, type DowntimeFormValues, type MachineFormValues } from '@/lib/planning/validation'
import type { Machine, MachineDowntime, MachineType } from '@/types/planning'
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

/** Adds a downtime window (D-028) to one machine: local from/to and a note. */
function DowntimeDialog({
  machine,
  open,
  onOpenChange,
}: {
  machine: Machine
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const invalidate = useInvalidatePlanning()
  const [serverError, setServerError] = useState<string | null>(null)
  const schema = downtimeSchema()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DowntimeFormValues>({ resolver: zodResolver(schema), defaultValues: { from: '', to: '', note: '' } })

  useEffect(() => {
    if (!open) return
    reset({ from: '', to: '', note: '' })
    setServerError(null)
  }, [open, reset])

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await window.api.createMachineDowntime(machine.id, {
        from: values.from,
        to: values.to,
        note: values.note.trim() === '' ? undefined : values.note.trim(),
      })
      await invalidate()
      toast.success(t('planning.machines.downtimes.created'))
      onOpenChange(false)
    } catch (cause) {
      reportUnexpectedError('DowntimeDialog.submit', cause)
      setServerError(formatActionError(t('planning.machines.downtimes.saveError'), cause))
    }
  })

  return (
    <StockDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('planning.machines.downtimes.createTitle')}
      description={t('planning.machines.downtimes.dialogDescription', { name: machine.name })}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="downtime-from">{t('planning.machines.downtimes.from')}</Label>
            <Input
              id="downtime-from"
              type="datetime-local"
              step={60}
              aria-invalid={errors.from ? true : undefined}
              {...register('from')}
            />
            {errors.from && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.from.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="downtime-to">{t('planning.machines.downtimes.to')}</Label>
            <Input
              id="downtime-to"
              type="datetime-local"
              step={60}
              aria-invalid={errors.to ? true : undefined}
              {...register('to')}
            />
            {errors.to && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.to.message}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="downtime-note">{t('planning.machines.downtimes.note')}</Label>
          <Textarea id="downtime-note" rows={2} aria-invalid={errors.note ? true : undefined} {...register('note')} />
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

/** The downtime windows of one machine, under its row; admins add and remove them. */
function DowntimePanel({ machine, canEdit }: { machine: Machine; canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const query = useMachineDowntimes(machine.id)
  const invalidate = useInvalidatePlanning()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<MachineDowntime | null>(null)
  const span = (downtime: MachineDowntime): string =>
    `${formatLocalDateTime(downtime.from)} – ${formatLocalDateTime(downtime.to)}`

  return (
    <div className="space-y-2 border-l-2 border-[color:var(--iris-border-soft)] bg-[color:var(--iris-surface-soft,transparent)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-medium">{t('planning.machines.downtimes.title', { name: machine.name })}</h3>
          <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('planning.machines.downtimes.hint')}</p>
        </div>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> {t('planning.machines.downtimes.add')}
          </Button>
        )}
      </div>
      <QueryState
        query={query}
        empty={t('planning.machines.downtimes.empty')}
        loadError={t('planning.machines.downtimes.loadError')}
      >
        {(downtimes) => (
          <ul className="divide-y divide-[color:var(--iris-border-soft)] text-[12px]">
            {downtimes.map((downtime) => (
              <li key={downtime.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                <span className="tabular-nums">{span(downtime)}</span>
                {downtime.note && <span className="text-[color:var(--iris-ink-soft)]">{downtime.note}</span>}
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={t('planning.machines.downtimes.deleteAria', {
                      from: formatLocalDateTime(downtime.from),
                      to: formatLocalDateTime(downtime.to),
                    })}
                    onClick={() => setRemoving(downtime)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <DowntimeDialog machine={machine} open={adding} onOpenChange={setAdding} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={t('planning.machines.downtimes.deleteTitle')}
        description={t('planning.machines.downtimes.deleteDescription', {
          from: removing ? formatLocalDateTime(removing.from) : '',
          to: removing ? formatLocalDateTime(removing.to) : '',
        })}
        confirmLabel={t('common.delete')}
        errorPrefix={t('planning.machines.downtimes.deleteError')}
        onConfirm={async () => {
          if (!removing) return
          await window.api.deleteMachineDowntime(machine.id, removing.id)
          await invalidate()
          toast.success(t('planning.machines.downtimes.deleted'))
        }}
      />
    </div>
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
  const [expanded, setExpanded] = useState<string | null>(null)
  const typeNames = useMemo(
    () => new Map((typesQuery.data ?? []).map((type) => [type.id, type.name])),
    [typesQuery.data],
  )
  const columns = canEdit ? 6 : 5

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
            <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.name')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.type')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.status')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.note')}</th>
                  <th scope="col" className="px-4 py-2 font-normal">{t('planning.machines.downtimes.column')}</th>
                  {canEdit && <th scope="col" className="w-24 px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                {machines.map((machine) => {
                  const open = expanded === machine.id
                  return (
                    <Fragment key={machine.id}>
                      <tr>
                        <th scope="row" className="px-4 py-2 text-[13px] font-normal">{machine.name}</th>
                        <td className="px-4 py-2">{typeNames.get(machine.machineTypeId) ?? '—'}</td>
                        <td className="px-4 py-2">
                          {machine.inService ? t('planning.machines.inServiceYes') : t('planning.machines.inServiceNo')}
                        </td>
                        <td className="px-4 py-2 text-[color:var(--iris-ink-soft)]">{machine.note ?? ''}</td>
                        <td className="px-4 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-expanded={open}
                            aria-label={t('planning.machines.downtimes.toggleAria', { name: machine.name })}
                            onClick={() => setExpanded(open ? null : machine.id)}
                          >
                            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                            {t('planning.machines.downtimes.column')}
                          </Button>
                        </td>
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
                      {open && (
                        <tr>
                          <td colSpan={columns} className="p-0">
                            <DowntimePanel machine={machine} canEdit={canEdit} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
