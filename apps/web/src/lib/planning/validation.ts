import { z } from 'zod'
import i18n from '@/i18n'
import {
  MAX_CREW_SIZE,
  MAX_MACHINE_NAME_LENGTH,
  MAX_MACHINE_NOTE_LENGTH,
  MAX_TRANSFER_MINUTES,
  type WorkingHours,
} from '@/types/planning'
import { isTime, toMinutes } from './time'

const tr = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options) as string

export const machineTypeSchema = (): z.ZodObject<{ name: z.ZodString }> =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, tr('planning.validation.nameRequired'))
      .max(MAX_MACHINE_NAME_LENGTH, tr('planning.validation.nameTooLong', { max: MAX_MACHINE_NAME_LENGTH })),
  })

export interface MachineFormValues {
  machineTypeId: string
  name: string
  inService: boolean
  note: string
}

export const machineSchema = () =>
  z.object({
    machineTypeId: z.string().min(1, tr('planning.validation.typeRequired')),
    name: z
      .string()
      .trim()
      .min(1, tr('planning.validation.nameRequired'))
      .max(MAX_MACHINE_NAME_LENGTH, tr('planning.validation.nameTooLong', { max: MAX_MACHINE_NAME_LENGTH })),
    inService: z.boolean(),
    note: z
      .string()
      .max(MAX_MACHINE_NOTE_LENGTH, tr('planning.validation.noteTooLong', { max: MAX_MACHINE_NOTE_LENGTH })),
  })

export interface BlockEditValues {
  machineId: string
  start: string
  leadUserId: string
  userIds: string[]
}

export const blockEditSchema = () =>
  z.object({
    machineId: z.string(),
    start: z.string().refine(isTime, tr('planning.validation.timeInvalid')),
    leadUserId: z.string().min(1, tr('planning.validation.leadRequired')),
    userIds: z
      .array(z.string())
      .min(1, tr('planning.validation.crewRequired'))
      .max(MAX_CREW_SIZE, tr('planning.validation.crewTooLarge', { max: MAX_CREW_SIZE })),
  })

export interface DayFormValues {
  weekday: number
  enabled: boolean
  start: string
  end: string
  breaks: { start: string; end: string }[]
}

export interface WorkingHoursFormValues {
  timeZone: string
  days: DayFormValues[]
  /** Inter-operation time in minutes (registered with valueAsNumber; NaN when empty). */
  transferMinutes: number
}

function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const timeField = () => z.string().refine(isTime, tr('planning.validation.timeInvalid'))

const transferMinutesField = () => {
  const message = tr('planning.validation.transferMinutesRange', { max: MAX_TRANSFER_MINUTES })
  return z.number({ error: message }).int(message).min(0, message).max(MAX_TRANSFER_MINUTES, message)
}

export const workingHoursSchema = () =>
  z
    .object({
      timeZone: z
        .string()
        .trim()
        .min(1, tr('planning.validation.timeZoneRequired'))
        .refine(validTimeZone, tr('planning.validation.timeZoneInvalid')),
      transferMinutes: transferMinutesField(),
      days: z.array(
        z.object({
          weekday: z.number().int().min(1).max(7),
          enabled: z.boolean(),
          start: z.string(),
          end: z.string(),
          breaks: z.array(z.object({ start: z.string(), end: z.string() })),
        }),
      ),
    })
    .superRefine((value, ctx) => {
      value.days.forEach((day, index) => {
        if (!day.enabled) return
        const check = (path: (string | number)[], raw: string): number | null => {
          if (!timeField().safeParse(raw).success) {
            ctx.addIssue({ code: 'custom', path, message: tr('planning.validation.timeInvalid') })
            return null
          }
          return toMinutes(raw)
        }
        const start = check(['days', index, 'start'], day.start)
        const end = check(['days', index, 'end'], day.end)
        if (start !== null && end !== null && start >= end) {
          ctx.addIssue({
            code: 'custom',
            path: ['days', index, 'end'],
            message: tr('planning.validation.endAfterStart'),
          })
        }
        const ranges: { from: number; to: number; at: number }[] = []
        day.breaks.forEach((brk, bIndex) => {
          const from = check(['days', index, 'breaks', bIndex, 'start'], brk.start)
          const to = check(['days', index, 'breaks', bIndex, 'end'], brk.end)
          if (from === null || to === null) return
          if (from >= to) {
            ctx.addIssue({
              code: 'custom',
              path: ['days', index, 'breaks', bIndex, 'end'],
              message: tr('planning.validation.endAfterStart'),
            })
            return
          }
          if (start !== null && end !== null && (from < start || to > end)) {
            ctx.addIssue({
              code: 'custom',
              path: ['days', index, 'breaks', bIndex, 'start'],
              message: tr('planning.validation.breakOutside'),
            })
            return
          }
          ranges.push({ from, to, at: bIndex })
        })
        const sorted = [...ranges].sort((a, b) => a.from - b.from)
        for (let i = 1; i < sorted.length; i += 1) {
          if (sorted[i].from < sorted[i - 1].to) {
            ctx.addIssue({
              code: 'custom',
              path: ['days', index, 'breaks', sorted[i].at, 'start'],
              message: tr('planning.validation.breakOverlap'),
            })
          }
        }
      })
    })

const DEFAULT_START = '07:00'
const DEFAULT_END = '15:00'

/** Seven editable rows (Monday to Sunday); unlisted weekdays are days off. */
export function hoursToForm(hours: WorkingHours): WorkingHoursFormValues {
  return {
    timeZone: hours.timeZone,
    transferMinutes: hours.transferMinutes,
    days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
      const day = hours.days.find((entry) => entry.weekday === weekday)
      return day
        ? { weekday, enabled: true, start: day.start, end: day.end, breaks: day.breaks.map((b) => ({ ...b })) }
        : { weekday, enabled: false, start: DEFAULT_START, end: DEFAULT_END, breaks: [] }
    }),
  }
}

export function formToHours(values: WorkingHoursFormValues): WorkingHours {
  return {
    timeZone: values.timeZone.trim(),
    transferMinutes: values.transferMinutes,
    days: values.days
      .filter((day) => day.enabled)
      .map((day) => ({
        weekday: day.weekday,
        start: day.start,
        end: day.end,
        breaks: day.breaks.map((b) => ({ start: b.start, end: b.end })),
      })),
  }
}
