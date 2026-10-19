import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Crown, Lock } from 'lucide-react'
import { StockDialog } from '@/components/Stock/StockDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fromMinutes, spanMinutes, timeOfLocal, toMinutes, withTime } from '@/lib/planning/time'
import { blockEditSchema, type BlockEditValues } from '@/lib/planning/validation'
import type { Machine, PlanAssignment } from '@/types/planning'
import { NativeSelect } from './NativeSelect'

interface PlanBlockDialogProps {
  assignment: PlanAssignment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  userNames: ReadonlyMap<string, string>
  machines: readonly Machine[]
  /** Admin looking at a draft; locked blocks stay read-only. */
  editable: boolean
  /** Receives the edited block; the page keeps it as an unsaved draft change. */
  onApply: (updated: PlanAssignment) => void
}

/** Details of one block and, for admins on a draft, its manual edit form. */
export function PlanBlockDialog({
  assignment,
  open,
  onOpenChange,
  userNames,
  machines,
  editable,
  onApply,
}: PlanBlockDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const canEdit = editable && assignment !== null && !assignment.locked
  const schema = blockEditSchema()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<BlockEditValues>({
    resolver: zodResolver(schema),
    defaultValues: { machineId: '', start: '', leadUserId: '', userIds: [] },
  })

  useEffect(() => {
    if (!open || !assignment) return
    reset({
      machineId: assignment.machineId ?? '',
      start: timeOfLocal(assignment.start),
      leadUserId: assignment.leadUserId,
      userIds: assignment.userIds,
    })
  }, [open, assignment, reset])

  if (!assignment) return null

  const current = machines.find((machine) => machine.id === assignment.machineId)
  // Only units of the same type can take over the step.
  const machineOptions = current
    ? machines.filter((machine) => machine.machineTypeId === current.machineTypeId && (machine.inService || machine.id === current.id))
    : []
  const crewIds = watch('userIds')
  const nameOf = (id: string): string => userNames.get(id) ?? id
  const userIds = [...userNames.keys()]
  const range = `${timeOfLocal(assignment.start)}–${timeOfLocal(assignment.end)}`

  const submit = handleSubmit((values) => {
    const length = spanMinutes(assignment)
    const startMinutes = toMinutes(values.start)
    if (startMinutes + length > 24 * 60 - 1) {
      setError('start', { message: t('planning.validation.endsNextDay') })
      return
    }
    const machine = machines.find((entry) => entry.id === values.machineId)
    const crew = [values.leadUserId, ...values.userIds.filter((id) => id !== values.leadUserId)]
    onApply({
      ...assignment,
      machineId: machine ? machine.id : assignment.machineId,
      machineName: machine ? machine.name : assignment.machineName,
      leadUserId: values.leadUserId,
      userIds: crew,
      start: withTime(assignment.start, values.start),
      end: withTime(assignment.start, fromMinutes(startMinutes + length)),
    })
    onOpenChange(false)
  })

  return (
    <StockDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${assignment.orderNumber} · ${assignment.stepLabel}`}
      description={t(canEdit ? 'planning.block.descriptionEdit' : 'planning.block.description')}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
        <dt className="text-[color:var(--iris-ink-mute)]">{t('planning.block.order')}</dt>
        <dd>
          <Link to={`/work-orders/${encodeURIComponent(assignment.workOrderId)}`} className="iris-focusable underline">
            {assignment.orderNumber}
          </Link>{' '}
          · {assignment.clientName}
        </dd>
        <dt className="text-[color:var(--iris-ink-mute)]">{t('planning.block.time')}</dt>
        <dd className="tnum">
          {range} ({t('planning.block.minutes', { count: assignment.minutes })})
        </dd>
        <dt className="text-[color:var(--iris-ink-mute)]">{t('planning.block.machine')}</dt>
        <dd>{assignment.machineName || t('planning.timeline.noMachine')}</dd>
        <dt className="text-[color:var(--iris-ink-mute)]">{t('planning.block.crew')}</dt>
        <dd>
          {assignment.userIds.map((id) => (
            <span key={id} className="mr-2 inline-flex items-center gap-1">
              {id === assignment.leadUserId && <Crown className="size-3" aria-label={t('planning.lead')} />}
              {nameOf(id)}
            </span>
          ))}
        </dd>
        {assignment.parts > 1 && (
          <>
            <dt className="text-[color:var(--iris-ink-mute)]">{t('planning.block.carryOver')}</dt>
            <dd>{t('planning.block.part', { part: assignment.part, parts: assignment.parts })}</dd>
          </>
        )}
        {assignment.locked && (
          <>
            <dt className="text-[color:var(--iris-ink-mute)]">
              <Lock className="size-3.5" aria-hidden />
            </dt>
            <dd>{t('planning.block.locked')}</dd>
          </>
        )}
      </dl>

      {canEdit ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-3 border-t border-border pt-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="block-machine">{t('planning.block.machine')}</Label>
              <NativeSelect id="block-machine" disabled={machineOptions.length === 0} {...register('machineId')}>
                {machineOptions.length === 0 && <option value="">{assignment.machineName}</option>}
                {machineOptions.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-start">{t('planning.block.start')}</Label>
              <Input
                id="block-start"
                type="time"
                aria-invalid={errors.start ? true : undefined}
                {...register('start')}
              />
              {errors.start && (
                <p role="alert" className="text-[11px] text-destructive">
                  {errors.start.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-lead">{t('planning.block.lead')}</Label>
            <NativeSelect
              id="block-lead"
              aria-invalid={errors.leadUserId ? true : undefined}
              {...register('leadUserId', {
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                  const lead = event.target.value
                  const crew = watch('userIds')
                  if (lead && !crew.includes(lead)) setValue('userIds', [lead, ...crew], { shouldValidate: true })
                },
              })}
            >
              {userIds.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </NativeSelect>
            {errors.leadUserId && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.leadUserId.message}
              </p>
            )}
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-[12px] font-medium">{t('planning.block.crewEdit')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {userIds.map((id) => (
                <label key={id} className="flex items-center gap-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={crewIds.includes(id)}
                    onChange={(event) =>
                      setValue(
                        'userIds',
                        event.target.checked ? [...crewIds, id] : crewIds.filter((other) => other !== id),
                        { shouldValidate: true },
                      )
                    }
                  />
                  {nameOf(id)}
                </label>
              ))}
            </div>
            {errors.userIds && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.userIds.message ?? errors.userIds.root?.message}
              </p>
            )}
          </fieldset>
          <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('planning.block.editHint')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('planning.block.apply')}</Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </StockDialog>
  )
}
