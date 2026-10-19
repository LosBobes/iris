import type { ProcessGraph, ProcessNode, ProcessStepStatus } from '@/types/process'

// Actual step times (D-028): `startedAt` / `finishedAt` on step nodes are RFC
// 3339 UTC strings. The server fills them from status transitions; the helpers
// here format them in the shop's time zone, convert the inspector's
// `datetime-local` input back to UTC, and mirror the server rule for fixture mode.

export const DEFAULT_STEP_TIME_ZONE = 'Europe/Belgrade'

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone })
  } catch {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' })
  }
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {}
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseIso(iso: string | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "19.10.2026 08:05" in the given zone, or "—" when unset/unreadable. */
export function formatStepTime(iso: string | undefined, timeZone = DEFAULT_STEP_TIME_ZONE): string {
  const date = parseIso(iso)
  if (!date) return '—'
  const p = zonedParts(date, timeZone)
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`
}

/** "YYYY-MM-DDTHH:MM" in the given zone for a `datetime-local` input; "" when unset. */
export function toZonedInput(iso: string | undefined, timeZone = DEFAULT_STEP_TIME_ZONE): string {
  const date = parseIso(iso)
  if (!date) return ''
  const p = zonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * The UTC instant of a `datetime-local` value read in the given zone, as RFC
 * 3339; undefined for an empty or malformed value. Computes the zone offset at
 * the instant itself (two passes, so a DST change on that day still lands on
 * the wall-clock time typed).
 */
export function fromZonedInput(local: string, timeZone = DEFAULT_STEP_TIME_ZONE): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim())
  if (!match) return undefined
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number)
  const wanted = Date.UTC(year, month - 1, day, hour, minute)
  let guess = wanted
  for (let pass = 0; pass < 2; pass += 1) {
    const p = zonedParts(new Date(guess), timeZone)
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += wanted - seen
  }
  const result = new Date(guess)
  if (Number.isNaN(result.getTime())) return undefined
  return result.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** True when both are set and the finish is earlier than the start. */
export function stepTimesOutOfOrder(node: Pick<ProcessNode, 'startedAt' | 'finishedAt'>): boolean {
  const started = parseIso(node.startedAt)
  const finished = parseIso(node.finishedAt)
  return started !== null && finished !== null && finished.getTime() < started.getTime()
}

function isFinished(status: ProcessStepStatus | undefined): boolean {
  return status === 'done' || status === 'skipped'
}

/**
 * Fixture-mode twin of the server's step-time rule: for every step whose
 * status changed against `prev`, moving to `in_progress` fills `startedAt` when
 * empty (and drops a `finishedAt` carried over from a reopened finished step),
 * moving to `done`/`skipped` fills `finishedAt` when empty, and `pending`
 * clears both unless the request changed them. Explicit values are kept. The
 * input is not modified.
 */
export function applyStepTimestamps(prev: ProcessGraph, next: ProcessGraph, now: Date = new Date()): ProcessGraph {
  const before = new Map(prev.nodes.map((node) => [node.id, node]))
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  return {
    ...next,
    nodes: next.nodes.map((node) => {
      if (node.kind !== 'step') return node
      const old = before.get(node.id)
      const status = node.status ?? 'pending'
      if (old && old.kind === 'step' && (old.status ?? 'pending') === status) return node
      const sameStart = !old || (old.startedAt ?? '') === (node.startedAt ?? '')
      const sameFinish = !old || (old.finishedAt ?? '') === (node.finishedAt ?? '')
      const out: ProcessNode = { ...node }
      if (status === 'in_progress') {
        if (!out.startedAt) out.startedAt = stamp
        if (old && isFinished(old.status) && sameFinish) delete out.finishedAt
      } else if (isFinished(status)) {
        if (!out.finishedAt) out.finishedAt = stamp
      } else if (sameStart && sameFinish) {
        delete out.startedAt
        delete out.finishedAt
      }
      return out
    }),
  }
}
