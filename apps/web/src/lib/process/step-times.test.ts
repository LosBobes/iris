import { describe, expect, it } from 'vitest'
import {
  applyStepTimestamps,
  formatStepTime,
  fromZonedInput,
  stepTimesOutOfOrder,
  toZonedInput,
} from './step-times'
import type { ProcessGraph } from '@/types/process'

const ZONE = 'Europe/Belgrade'

describe('step time formatting', () => {
  it('formats a UTC instant in the working-hours zone as DD.MM.YYYY HH:MM', () => {
    // CEST (+02:00) in October, CET (+01:00) in December.
    expect(formatStepTime('2026-10-19T06:05:00Z', ZONE)).toBe('19.10.2026 08:05')
    expect(formatStepTime('2026-12-19T23:30:00Z', ZONE)).toBe('20.12.2026 00:30')
    expect(formatStepTime(undefined, ZONE)).toBe('—')
    expect(formatStepTime('danas', ZONE)).toBe('—')
  })

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    expect(formatStepTime('2026-10-19T06:05:00Z', 'Mars/Olympus')).toBe('19.10.2026 06:05')
  })

  it('round-trips the datetime-local input through the zone', () => {
    expect(toZonedInput('2026-10-19T06:05:00Z', ZONE)).toBe('2026-10-19T08:05')
    expect(fromZonedInput('2026-10-19T08:05', ZONE)).toBe('2026-10-19T06:05:00Z')
    expect(fromZonedInput('2026-12-20T00:30', ZONE)).toBe('2026-12-19T23:30:00Z')
    expect(fromZonedInput('2026-07-01T12:00', 'UTC')).toBe('2026-07-01T12:00:00Z')
    expect(toZonedInput(undefined, ZONE)).toBe('')
    expect(fromZonedInput('', ZONE)).toBeUndefined()
    expect(fromZonedInput('19.10.2026', ZONE)).toBeUndefined()
  })

  it('detects a finish before the start', () => {
    expect(stepTimesOutOfOrder({ startedAt: '2026-10-19T08:00:00Z', finishedAt: '2026-10-19T07:59:00Z' })).toBe(true)
    expect(stepTimesOutOfOrder({ startedAt: '2026-10-19T08:00:00Z', finishedAt: '2026-10-19T08:00:00Z' })).toBe(false)
    expect(stepTimesOutOfOrder({ startedAt: '2026-10-19T08:00:00Z' })).toBe(false)
  })
})

function graph(status: 'pending' | 'in_progress' | 'done' | 'skipped', times: { startedAt?: string; finishedAt?: string } = {}): ProcessGraph {
  return {
    nodes: [
      { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 0, quantity: 1 },
      { id: 'print', kind: 'step', label: 'Štampa', x: 0, y: 0, status, ...times },
      { id: 'cut', kind: 'step', label: 'Sečenje', x: 0, y: 0, status: 'pending' },
    ],
    edges: [{ id: 'e1', source: 'paper', target: 'print' }],
  }
}

const step = (g: ProcessGraph) => g.nodes.find((node) => node.id === 'print')!
const NOW = new Date('2026-10-19T10:00:00.250Z')
const LATER = new Date('2026-10-19T10:45:00Z')

describe('applyStepTimestamps (fixture twin of the server rule)', () => {
  it('fills startedAt on in_progress and finishedAt on done, keeping the start', () => {
    const started = applyStepTimestamps(graph('pending'), graph('in_progress'), NOW)
    expect(step(started)).toMatchObject({ startedAt: '2026-10-19T10:00:00Z' })
    expect(step(started).finishedAt).toBeUndefined()
    // Untouched steps are left alone.
    expect(started.nodes[2]).toEqual(graph('pending').nodes[2])

    const done = applyStepTimestamps(started, { ...started, nodes: started.nodes.map((n) => (n.id === 'print' ? { ...n, status: 'done' } : n)) }, LATER)
    expect(step(done)).toMatchObject({ startedAt: '2026-10-19T10:00:00Z', finishedAt: '2026-10-19T10:45:00Z' })
  })

  it('fills only finishedAt when a step is skipped or done straight from pending', () => {
    expect(step(applyStepTimestamps(graph('pending'), graph('skipped'), NOW))).toMatchObject({ finishedAt: '2026-10-19T10:00:00Z' })
    expect(step(applyStepTimestamps(graph('pending'), graph('done'), NOW)).startedAt).toBeUndefined()
  })

  it('keeps the times when the status did not change and when the client sent them explicitly', () => {
    const times = { startedAt: '2026-10-19T07:00:00Z', finishedAt: '2026-10-19T08:00:00Z' }
    expect(step(applyStepTimestamps(graph('done', times), graph('done', times), LATER))).toMatchObject(times)
    expect(step(applyStepTimestamps(graph('pending'), graph('done', times), LATER))).toMatchObject(times)
    // A correction without a status change is kept as sent.
    const corrected = { ...times, startedAt: '2026-10-19T06:30:00Z' }
    expect(step(applyStepTimestamps(graph('done', times), graph('done', corrected), LATER))).toMatchObject(corrected)
  })

  it('clears finishedAt when a finished step is reopened and both when it goes back to pending', () => {
    const times = { startedAt: '2026-10-19T07:00:00Z', finishedAt: '2026-10-19T08:00:00Z' }
    const reopened = step(applyStepTimestamps(graph('done', times), graph('in_progress', times), LATER))
    expect(reopened.startedAt).toBe(times.startedAt)
    expect(reopened.finishedAt).toBeUndefined()
    const reset = step(applyStepTimestamps(graph('done', times), graph('pending', times), LATER))
    expect(reset.startedAt).toBeUndefined()
    expect(reset.finishedAt).toBeUndefined()
  })
})
