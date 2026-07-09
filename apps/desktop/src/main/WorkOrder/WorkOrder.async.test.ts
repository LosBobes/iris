// @vitest-environment node

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { mockHandle, mockGetWorkOrderById } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockGetWorkOrderById: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockHandle,
  },
}))

vi.mock('../shared/iris-api-client', () => ({
  createConfiguredIrisApiClient: vi.fn(() => ({
    getWorkOrders: vi.fn(),
    getWorkOrderOperators: vi.fn(),
    getWorkOrderById: mockGetWorkOrderById,
    createWorkOrder: vi.fn(),
    updateWorkOrder: vi.fn(),
    deleteWorkOrder: vi.fn(),
  })),
  mapIrisApiErrorToUserMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
}))

import { registerWorkOrderHandlers } from './WorkOrder.async'

describe('registerWorkOrderHandlers', () => {
  beforeEach(() => {
    mockHandle.mockReset()
    mockGetWorkOrderById.mockReset()
  })

  it('maps the getById IPC handler to the configured API client', async () => {
    mockGetWorkOrderById.mockResolvedValueOnce({ id: '42', orderNumber: 'RN-2026-00042' })

    registerWorkOrderHandlers()

    const handlerEntry = mockHandle.mock.calls.find(
      ([channel]) => channel === 'workorders:getById',
    )

    expect(handlerEntry).toBeDefined()

    const handler = handlerEntry?.[1] as (
      event: unknown,
      payload: { id: string },
    ) => Promise<unknown>

    await expect(handler({}, { id: '42' })).resolves.toEqual({
      id: '42',
      orderNumber: 'RN-2026-00042',
    })
    expect(mockGetWorkOrderById).toHaveBeenCalledWith('42')
  })
})