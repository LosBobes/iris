import { describe, expect, it } from 'vitest'
import {
  getAllowedWorkOrderTransitions,
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
})
