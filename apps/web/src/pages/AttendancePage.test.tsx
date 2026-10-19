// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { ATTENDANCE_ONLY } from '@/test/modules'
import { renderPlanningPage } from '@/test/planning'
import AttendancePage from './AttendancePage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function stubApi() {
  const api = {
    listAttendance: vi.fn(async (date: string) => [
      { userId: 'u1', username: 'marko', date, signedIn: true, override: null, present: true },
      { userId: 'u2', username: 'jelena', date, signedIn: false, override: null, present: false },
    ]),
    setAttendance: vi.fn(async () => ({})),
  }
  vi.stubGlobal('api', api)
  return api
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AttendancePage', () => {
  it('sets an attendance override for the picked date with only the attendance module on', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<AttendancePage />, { modules: ATTENDANCE_ONLY })

    expect(await screen.findByRole('heading', { name: 'Prisustvo' })).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('Prisustvo korisnika jelena'), 'present')
    await waitFor(() => expect(api.setAttendance).toHaveBeenCalled())
    expect(api.setAttendance.mock.calls[0][0]).toBe('u2')
    expect(api.setAttendance.mock.calls[0][1]).toMatchObject({ present: true })
  })

  it('is read-only for operators', async () => {
    stubApi()
    renderPlanningPage(<AttendancePage />, { modules: ATTENDANCE_ONLY, role: 'user' })
    expect(await screen.findByLabelText('Prisustvo korisnika jelena')).toBeDisabled()
    expect(screen.getByText('Pregled prisustva. Izmene može da unosi samo administrator.')).toBeInTheDocument()
  })
})
