import { describe, expect, it } from 'vitest'
import {
  dayWindow,
  formatLocalDateTime,
  fromMinutes,
  isLocalDateTime,
  isoWeekday,
  layoutLanes,
  orderHue,
  toMinutes,
  withTime,
} from './time'

describe('planning time helpers', () => {
  it('converts between HH:MM and minutes', () => {
    expect(toMinutes('07:30')).toBe(450)
    expect(fromMinutes(450)).toBe('07:30')
    expect(Number.isNaN(toMinutes('7:3'))).toBe(true)
  })

  it('keeps the date when replacing the time', () => {
    expect(withTime('2026-10-19T08:00', '09:15')).toBe('2026-10-19T09:15')
  })

  it('computes ISO weekdays', () => {
    expect(isoWeekday('2026-10-19')).toBe(1) // Monday
    expect(isoWeekday('2026-10-18')).toBe(7) // Sunday
  })

  it('uses the shift of the weekday and widens it to cover blocks', () => {
    const hours = { timeZone: 'Europe/Belgrade', days: [{ weekday: 1, start: '07:00', end: '15:00', breaks: [] }] }
    expect(dayWindow('2026-10-19', hours, [])).toEqual({ start: 420, end: 900 })
    const late = {
      start: '2026-10-19T14:00',
      end: '2026-10-19T16:30',
    } as never
    expect(dayWindow('2026-10-19', hours, [late])).toEqual({ start: 420, end: 1020 })
  })

  it('falls back to a default window without a shift or blocks', () => {
    expect(dayWindow('2026-10-18', undefined, [])).toEqual({ start: 420, end: 900 })
  })

  it('lets an exception date override the weekday shift', () => {
    const hours = {
      timeZone: 'Europe/Belgrade',
      days: [{ weekday: 1, start: '07:00', end: '15:00', breaks: [] }],
      transferMinutes: 0,
      exceptions: [
        { date: '2026-10-19', off: true },
        { date: '2026-10-24', off: false, start: '08:00', end: '12:00', breaks: [] },
      ],
    }
    expect(dayWindow('2026-10-19', hours, [])).toEqual({ start: 420, end: 900 }) // day off: fallback
    expect(dayWindow('2026-10-24', hours, [])).toEqual({ start: 480, end: 720 })
  })

  it('validates and formats local date-times', () => {
    expect(isLocalDateTime('2026-10-19T08:30')).toBe(true)
    expect(isLocalDateTime('2026-02-30T08:30')).toBe(false)
    expect(isLocalDateTime('2026-10-19 08:30')).toBe(false)
    expect(formatLocalDateTime('2026-10-19T08:30')).toBe('19.10.2026 08:30')
    expect(formatLocalDateTime('nope')).toBe('nope')
  })

  it('stacks overlapping blocks in separate lanes', () => {
    const { lanes, count } = layoutLanes([
      { id: 'a', start: 0, end: 100 },
      { id: 'b', start: 50, end: 150 },
      { id: 'c', start: 100, end: 200 },
    ])
    expect(count).toBe(2)
    expect(lanes.get('a')).toBe(0)
    expect(lanes.get('b')).toBe(1)
    expect(lanes.get('c')).toBe(0)
  })

  it('gives one order one stable hue', () => {
    expect(orderHue('wo-1')).toBe(orderHue('wo-1'))
    expect(orderHue('wo-1')).toBeGreaterThanOrEqual(0)
    expect(orderHue('wo-1')).toBeLessThan(360)
  })
})
