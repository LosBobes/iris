import { describe, expect, it } from 'vitest'
import {
  buildWorkOrderCustomerNotice,
  getAllowedWorkOrderTransitions,
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
      'waitingForMaterials',
      'cancelled',
    ])
    expect(getAllowedWorkOrderTransitions('inProgress')).toEqual([
      'waitingForCustomer',
      'waitingForMaterials',
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
    expect(isWorkOrderStatusTerminal('waitingForCustomer')).toBe(false)
  })

  it('returns customer-safe next step copy by status', () => {
    expect(getWorkOrderCustomerNextStep('waitingForCustomer')).toBe(
      'Čekamo vašu potvrdu materijala/dizajna.',
    )
    expect(getWorkOrderCustomerNextStep('completed')).toBe(
      'Nalog je završen i spreman za preuzimanje ili isporuku.',
    )
  })

  it('formats lifecycle statuses as Serbian UI labels', () => {
    expect(getWorkOrderStatusLabel('new')).toBe('Nov')
    expect(getWorkOrderStatusLabel('assigned')).toBe('Dodeljen')
    expect(getWorkOrderStatusLabel('inProgress')).toBe('U toku')
    expect(getWorkOrderStatusLabel('waitingForCustomer')).toBe('Čeka klijenta')
    expect(getWorkOrderStatusLabel('waitingForMaterials')).toBe('Čeka materijal')
  })

  it('builds a plain-text customer notice with due date fallback', () => {
    expect(
      buildWorkOrderCustomerNotice({
        orderNumber: 'RN-42',
        status: 'waitingForCustomer',
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
        'Status: Čeka klijenta',
        'Rok: 03.06.2026',
        'Sledeći korak: Čekamo vašu potvrdu materijala/dizajna.',
      ].join('\n'),
    )
  })
})
