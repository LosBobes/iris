import { useEffect, useMemo, useState } from 'react'
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useInvalidatePlanning, useWorkingHours } from '@/hooks/usePlanning'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import {
  formToHours,
  hoursToForm,
  workingHoursSchema,
  type WorkingHoursFormValues,
} from '@/lib/planning/validation'
import { MAX_TRANSFER_MINUTES } from '@/types/planning'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function DayRow({
  index,
  control,
  register,
  disabled,
  errors,
}: {
  index: number
  control: Control<WorkingHoursFormValues>
  register: UseFormRegister<WorkingHoursFormValues>
  disabled: boolean
  errors: FieldErrors<WorkingHoursFormValues>
}): React.JSX.Element {
  const { t } = useTranslation()
  const dayName = t(`planning.hours.weekdays.${WEEKDAY_KEYS[index]}`)
  const enabled = useWatch({ control, name: `days.${index}.enabled` })
  const { fields, append, remove } = useFieldArray({ control, name: `days.${index}.breaks` })
  const dayErrors = errors.days?.[index]
  const breakErrors = (dayErrors?.breaks ?? []) as ({
    start?: { message?: string }
    end?: { message?: string }
  } | undefined)[]
  const messages = [
    dayErrors?.start?.message,
    dayErrors?.end?.message,
    ...breakErrors.flatMap((brk) => [brk?.start?.message, brk?.end?.message]),
  ].filter((message): message is string => Boolean(message))

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex w-32 items-center gap-2 text-[13px]">
          <input type="checkbox" className="size-4" disabled={disabled} {...register(`days.${index}.enabled`)} />
          {dayName}
        </label>
        {enabled ? (
          <>
            <Input
              type="time"
              className="w-28"
              disabled={disabled}
              aria-label={t('planning.hours.startAria', { day: dayName })}
              aria-invalid={dayErrors?.start ? true : undefined}
              {...register(`days.${index}.start`)}
            />
            <span aria-hidden>–</span>
            <Input
              type="time"
              className="w-28"
              disabled={disabled}
              aria-label={t('planning.hours.endAria', { day: dayName })}
              aria-invalid={dayErrors?.end ? true : undefined}
              {...register(`days.${index}.end`)}
            />
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ start: '11:00', end: '11:30' })}
              >
                <Plus aria-hidden /> {t('planning.hours.addBreak')}
              </Button>
            )}
          </>
        ) : (
          <span className="text-[12px] text-[color:var(--iris-ink-mute)]">{t('planning.hours.dayOff')}</span>
        )}
      </div>
      {enabled &&
        fields.map((field, bIndex) => (
          <div key={field.id} className="ml-0 flex flex-wrap items-center gap-3 sm:ml-32">
            <span className="w-14 text-[11px] text-[color:var(--iris-ink-soft)]">{t('planning.hours.break')}</span>
            <Input
              type="time"
              className="w-28"
              disabled={disabled}
              aria-label={t('planning.hours.breakStartAria', { day: dayName, n: bIndex + 1 })}
              {...register(`days.${index}.breaks.${bIndex}.start`)}
            />
            <span aria-hidden>–</span>
            <Input
              type="time"
              className="w-28"
              disabled={disabled}
              aria-label={t('planning.hours.breakEndAria', { day: dayName, n: bIndex + 1 })}
              {...register(`days.${index}.breaks.${bIndex}.end`)}
            />
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('planning.hours.removeBreakAria', { day: dayName, n: bIndex + 1 })}
                onClick={() => remove(bIndex)}
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </div>
        ))}
      {messages.map((message) => (
        <p key={message} role="alert" className="text-[11px] text-destructive">
          {dayName}: {message}
        </p>
      ))}
    </li>
  )
}

function WorkingHoursForm({
  initial,
  canEdit,
}: {
  initial: WorkingHoursFormValues
  canEdit: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const invalidate = useInvalidatePlanning()
  const [serverError, setServerError] = useState<string | null>(null)
  const schema = workingHoursSchema()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WorkingHoursFormValues>({ resolver: zodResolver(schema), defaultValues: initial })

  useEffect(() => {
    reset(initial)
  }, [initial, reset])

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await window.api.setWorkingHours(formToHours(values))
      await invalidate()
      toast.success(t('planning.hours.saved'))
    } catch (cause) {
      reportUnexpectedError('WorkingHoursTab.submit', cause)
      setServerError(formatActionError(t('planning.hours.saveError'), cause))
    }
  })

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="hours-time-zone">{t('planning.hours.timeZone')}</Label>
        <Input
          id="hours-time-zone"
          disabled={!canEdit}
          aria-invalid={errors.timeZone ? true : undefined}
          placeholder="Europe/Belgrade"
          {...register('timeZone')}
        />
        {errors.timeZone && (
          <p role="alert" className="text-[11px] text-destructive">
            {errors.timeZone.message}
          </p>
        )}
      </div>
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="hours-transfer-minutes">{t('planning.hours.transferMinutes')}</Label>
        <Input
          id="hours-transfer-minutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_TRANSFER_MINUTES}
          step={1}
          className="w-28"
          disabled={!canEdit}
          aria-invalid={errors.transferMinutes ? true : undefined}
          aria-describedby="hours-transfer-minutes-hint"
          {...register('transferMinutes', { valueAsNumber: true })}
        />
        <p id="hours-transfer-minutes-hint" className="text-[11px] text-[color:var(--iris-ink-soft)]">
          {t('planning.hours.transferMinutesHint')}
        </p>
        {errors.transferMinutes && (
          <p role="alert" className="text-[11px] text-destructive">
            {errors.transferMinutes.message}
          </p>
        )}
      </div>
      <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
        {initial.days.map((day, index) => (
          <DayRow
            key={day.weekday}
            index={index}
            control={control}
            register={register}
            disabled={!canEdit}
            errors={errors}
          />
        ))}
      </ul>
      {serverError && (
        <p role="alert" className="text-[12px] text-destructive">
          {serverError}
        </p>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {t('common.save')}
          </Button>
        </div>
      )}
    </form>
  )
}

/** "Radno vreme": time zone plus per-weekday shift and breaks for the whole organization. */
export function WorkingHoursTab({ canEdit }: { canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const query = useWorkingHours()
  const initial = useMemo(() => (query.data ? hoursToForm(query.data) : null), [query.data])

  return (
    <section aria-labelledby="hours-heading" className="space-y-3">
      <div>
        <h2 id="hours-heading" className="text-[14px] font-medium">
          {t('planning.hours.title')}
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('planning.hours.hint')}</p>
      </div>
      {query.isPending ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-[color:var(--iris-ink-soft)]">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
        </div>
      ) : query.isError || !initial ? (
        <p role="alert" className="py-6 text-[12px] text-destructive">
          {t('planning.loadError')}
        </p>
      ) : (
        <WorkingHoursForm initial={initial} canEdit={canEdit} />
      )}
    </section>
  )
}
