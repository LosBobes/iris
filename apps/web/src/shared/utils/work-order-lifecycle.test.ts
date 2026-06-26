import { describe, expect, it } from 'vitest'
import {
  buildWorkOrderCustomerNotice,
  formatWorkOrderEventLabel,
  getAllowedWorkOrderTransitions,
  getWorkOrderPriorityLabel,
  getWorkOrderStatusLabel,
  getWorkOrderCustomerNextStep,
  getPrimaryWorkOrderTransition,
  isWorkOrderStatusTerminal,
} from './work-orders'

describe('work-order lifecycle transitions', () => {
  it('exposes transition-controlled steps for active operations statuses', () => {
    expect(getAllowedWorkOrderTransitions('new')).toEqual(['assigned', 'cancelled'])
    expect(getAllowedWorkOrderTransitions('assigned')).toEqual([
      'inProgress',
      'cancelled',
    ])
    expect(getAllowedWorkOrderTransitions('inProgress')).toEqual([
      'completed',
      'cancelled',
    ])
  })

  it('returns one primary forward action for list-row controls', () => {
    expect(getPrimaryWorkOrderTransition('new')).toBe('assigned')
    expect(getPrimaryWorkOrderTransition('assigned')).toBe('inProgress')
    expect(getPrimaryWorkOrderTransition('inProgress')).toBe('completed')
    expect(getPrimaryWorkOrderTransition('completed')).toBe('invoiced')
    expect(getPrimaryWorkOrderTransition('cancelled')).toBeNull()
  })

  it('treats invoiced and cancelled work orders as terminal', () => {
    expect(isWorkOrderStatusTerminal('invoiced')).toBe(true)
    expect(isWorkOrderStatusTerminal('cancelled')).toBe(true)
    expect(isWorkOrderStatusTerminal('inProgress')).toBe(false)
  })

  it('returns customer-safe next step copy by status', () => {
    expect(getWorkOrderCustomerNextStep('inProgress')).toBe(
      'Rad je u toku; javljamo se čim bude spremno za sledeći korak.',
    )
    expect(getWorkOrderCustomerNextStep('completed')).toBe(
      'Nalog je završen i spreman za preuzimanje ili isporuku.',
    )
  })

  it('formats work order priorities as Serbian UI labels', () => {
    expect(getWorkOrderPriorityLabel('low')).toBe('Nizak')
    expect(getWorkOrderPriorityLabel('normal')).toBe('Normalan')
    expect(getWorkOrderPriorityLabel('high')).toBe('Visok')
    expect(getWorkOrderPriorityLabel('urgent')).toBe('Hitno')
  })

  it('formats lifecycle statuses as Serbian UI labels', () => {
    expect(getWorkOrderStatusLabel('new')).toBe('Nov')
    expect(getWorkOrderStatusLabel('assigned')).toBe('Dodeljen')
    expect(getWorkOrderStatusLabel('inProgress')).toBe('U toku')
    expect(getWorkOrderStatusLabel('completed')).toBe('Završen')
    expect(getWorkOrderStatusLabel('cancelled')).toBe('Otkazan')
  })

  it('localizes status-change timeline labels with raw enum values', () => {
    expect(
      formatWorkOrderEventLabel('Status promenjen na assigned', 'status'),
    ).toBe('Status promenjen na Dodeljen')
    expect(formatWorkOrderEventLabel('Nalog kreiran', 'created')).toBe('Nalog kreiran')
    expect(
      formatWorkOrderEventLabel('Status promenjen na Dodeljen', 'status'),
    ).toBe('Status promenjen na Dodeljen')
  })

  it('builds a plain-text customer notice with due date fallback', () => {
    expect(
      buildWorkOrderCustomerNotice({
        orderNumber: 'RN-42',
        status: 'inProgress',
        dueDate: null,
        assignment: {
          assignedTo: 'ana',
          priority: 'normal',
          scheduledDate: '2026-06-03',
        },
      }),
    ).toBe(
      [
        'Radni nalog RN-42',
        'Status: U toku',
        'Rok: 03.06.2026',
        'Sledeći korak: Rad je u toku; javljamo se čim bude spremno za sledeći korak.',
      ].join('\n'),
    )
  })
})
