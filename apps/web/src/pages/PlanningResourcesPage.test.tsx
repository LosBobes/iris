// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { renderPlanningPage } from '@/test/planning'
import PlanningResourcesPage from './PlanningResourcesPage'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

const types = [
  { id: 't1', name: 'Offset', createdAt: '', updatedAt: '' },
  { id: 't2', name: 'Knjigovezac', createdAt: '', updatedAt: '' },
]
const machines = [{ id: 'm1', machineTypeId: 't1', name: 'Heidelberg 1', inService: true, note: 'Hala A', createdAt: '', updatedAt: '' }]
const hours = {
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '07:00', end: '15:00', breaks: [{ start: '11:00', end: '11:30' }] })),
  transferMinutes: 0,
  exceptions: [],
}
const downtimes = [{ id: 'd1', machineId: 'm1', from: '2026-10-21T08:00', to: '2026-10-22T15:00', note: 'Servis', createdAt: '' }]

function stubApi() {
  const api = {
    listMachineTypes: vi.fn(async () => types),
    createMachineType: vi.fn(async (input: { name: string }) => ({ id: 't3', ...input, createdAt: '', updatedAt: '' })),
    updateMachineType: vi.fn(),
    deleteMachineType: vi.fn(async () => {}),
    listMachines: vi.fn(async () => machines),
    createMachine: vi.fn(),
    updateMachine: vi.fn(),
    deleteMachine: vi.fn(async () => {}),
    listMachineDowntimes: vi.fn(async () => downtimes),
    createMachineDowntime: vi.fn(async (machineId: string, input: { from: string; to: string }) => ({ id: 'd2', machineId, ...input, createdAt: '' })),
    deleteMachineDowntime: vi.fn(async () => {}),
    listQualifications: vi.fn(async () => [
      { userId: 'u1', username: 'marko', machineTypeIds: ['t1'] },
      { userId: 'u2', username: 'jelena', machineTypeIds: [] },
    ]),
    setQualifications: vi.fn(async (userId: string, input: { machineTypeIds: string[] }) => ({ userId, username: 'x', ...input })),
    getWorkingHours: vi.fn(async () => hours),
    setWorkingHours: vi.fn(async (input: unknown) => input),
  }
  vi.stubGlobal('api', api)
  return api
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlanningResourcesPage', () => {
  it('validates the machine type name before calling the API', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('button', { name: 'Novi tip' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novi tip mašine' })
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    expect(await within(dialog).findByText('Naziv je obavezan')).toBeInTheDocument()
    expect(api.createMachineType).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Naziv tipa'), 'Digitalna štampa')
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.createMachineType).toHaveBeenCalledWith({ name: 'Digitalna štampa' }))
  })

  it('shows the server 422 message in the dialog', async () => {
    const api = stubApi()
    api.createMachineType.mockRejectedValueOnce(new Error('Tip mašine sa tim nazivom već postoji.'))
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('button', { name: 'Novi tip' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Naziv tipa'), 'Offset')
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Greška pri čuvanju tipa mašine: Tip mašine sa tim nazivom već postoji.',
    )
  })

  it('confirms a delete and shows the 409 message when the type is still in use', async () => {
    const api = stubApi()
    api.deleteMachineType.mockRejectedValueOnce(new Error('Tip se koristi: postoje mašine ovog tipa.'))
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('button', { name: 'Obriši tip Offset' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(api.deleteMachineType).not.toHaveBeenCalled()
    await user.click(within(confirm).getByRole('button', { name: 'Obriši' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Tip se koristi: postoje mašine ovog tipa.')
    expect(api.deleteMachineType).toHaveBeenCalledWith('t1')
  })

  it('requires a type for a machine', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Mašine' }))
    await user.click(await screen.findByRole('button', { name: 'Nova mašina' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Naziv jedinice'), 'Polar')
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    expect(await within(dialog).findByText('Izaberite tip mašine')).toBeInTheDocument()
    expect(api.createMachine).not.toHaveBeenCalled()
  })

  it('lists a machine\'s downtime windows and deletes one', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Mašine' }))
    await user.click(await screen.findByRole('button', { name: 'Zastoji mašine Heidelberg 1' }))
    expect(await screen.findByText('21.10.2026 08:00 – 22.10.2026 15:00')).toBeInTheDocument()
    expect(screen.getByText('Servis')).toBeInTheDocument()
    expect(api.listMachineDowntimes).toHaveBeenCalledWith('m1')

    await user.click(screen.getByRole('button', { name: 'Obriši zastoj 21.10.2026 08:00 – 22.10.2026 15:00' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'Obriši' }))
    await waitFor(() => expect(api.deleteMachineDowntime).toHaveBeenCalledWith('m1', 'd1'))
  })

  it('validates a new downtime window before sending it', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Mašine' }))
    await user.click(await screen.findByRole('button', { name: 'Zastoji mašine Heidelberg 1' }))
    await user.click(await screen.findByRole('button', { name: 'Dodaj zastoj' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novi zastoj mašine' })
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    expect(await within(dialog).findAllByText('Unesite datum i vreme')).toHaveLength(2)
    expect(api.createMachineDowntime).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText('Od'), { target: { value: '2026-10-23T10:00' } })
    fireEvent.change(within(dialog).getByLabelText('Do'), { target: { value: '2026-10-23T08:00' } })
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    expect(await within(dialog).findByText('Kraj zastoja mora biti posle početka')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Do'), { target: { value: '2026-10-23T12:00' } })
    await user.type(within(dialog).getByLabelText('Napomena'), 'Servis valjaka')
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() =>
      expect(api.createMachineDowntime).toHaveBeenCalledWith('m1', { from: '2026-10-23T10:00', to: '2026-10-23T12:00', note: 'Servis valjaka' }),
    )
  })

  it('adds exception dates to the working hours', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Radno vreme' }))
    expect(await screen.findByText('Nema izuzetaka.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dodaj neradni dan' }))
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByText('Izuzetak 1: Unesite datum u obliku GGGG-MM-DD')).toBeInTheDocument()
    expect(api.setWorkingHours).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Datum izuzetka 1'), { target: { value: '2026-12-25' } })
    await user.click(screen.getByRole('button', { name: 'Dodaj posebno radno vreme' }))
    fireEvent.change(screen.getByLabelText('Datum izuzetka 2'), { target: { value: '2026-10-24' } })
    const end = screen.getByLabelText('Kraj smene: izuzetak 2')
    await user.clear(end)
    await user.type(end, '12:00')
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.setWorkingHours).toHaveBeenCalledTimes(1))
    expect(api.setWorkingHours.mock.calls[0][0]).toMatchObject({
      exceptions: [
        { date: '2026-12-25', off: true, breaks: [] },
        { date: '2026-10-24', off: false, start: '07:00', end: '12:00', breaks: [] },
      ],
    })
  })

  it('saves a qualification toggle for one user', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Kvalifikacije' }))
    await user.click(await screen.findByRole('checkbox', { name: 'jelena može da vodi: Knjigovezac' }))
    await waitFor(() => expect(api.setQualifications).toHaveBeenCalledWith('u2', { machineTypeIds: ['t2'] }))
  })

  it('validates working hours and shows the server 422 message', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Radno vreme' }))
    const end = await screen.findByLabelText('Kraj smene: Ponedeljak')
    // End before start is rejected client-side.
    await user.clear(end)
    await user.type(end, '06:00')
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByText('Ponedeljak: Kraj mora biti posle početka')).toBeInTheDocument()
    expect(api.setWorkingHours).not.toHaveBeenCalled()

    await user.clear(end)
    await user.type(end, '16:00')
    api.setWorkingHours.mockRejectedValueOnce(new Error('Pauza mora biti unutar smene.'))
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.setWorkingHours).toHaveBeenCalledTimes(1))
    const sent = api.setWorkingHours.mock.calls[0][0] as {
      timeZone: string
      transferMinutes: number
      days: { weekday: number; end: string }[]
    }
    expect(sent.timeZone).toBe('Europe/Belgrade')
    expect(sent.transferMinutes).toBe(0)
    expect(sent.days).toHaveLength(5)
    expect(sent.days[0]).toMatchObject({ weekday: 1, end: '16:00' })
    expect(await screen.findByText('Greška pri čuvanju radnog vremena: Pauza mora biti unutar smene.')).toBeInTheDocument()
  })

  it('validates and sends the inter-operation time', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)
    await user.click(await screen.findByRole('tab', { name: 'Radno vreme' }))
    const lag = await screen.findByLabelText('Međuoperacijsko vreme (min)')
    expect(screen.getByText(/Prosečno vreme čekanja i transporta/)).toBeInTheDocument()
    await user.clear(lag)
    await user.type(lag, '500')
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByText('Unesite ceo broj minuta između 0 i 480')).toBeInTheDocument()
    expect(api.setWorkingHours).not.toHaveBeenCalled()

    await user.clear(lag)
    await user.type(lag, '45')
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.setWorkingHours).toHaveBeenCalledTimes(1))
    expect(api.setWorkingHours.mock.calls[0][0]).toMatchObject({ transferMinutes: 45 })
  })

  it('rejects an unknown time zone', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />)
    await user.click(await screen.findByRole('tab', { name: 'Radno vreme' }))
    const zone = await screen.findByLabelText('Vremenska zona')
    await user.clear(zone)
    await user.type(zone, 'Mars/Olympus')
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByText(/Nepoznata vremenska zona/)).toBeInTheDocument()
    expect(api.setWorkingHours).not.toHaveBeenCalled()
  })

  it('is read-only for operators', async () => {
    stubApi()
    renderPlanningPage(<PlanningResourcesPage />, { role: 'user' })
    expect(await screen.findByText('Offset')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novi tip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Obriši tip Offset' })).not.toBeInTheDocument()
  })
})
