import { render, screen } from '@testing-library/react'
import App from './App'

// Mock window.api - injected by the preload script at runtime, not available in jsdom
const mockLogin = vi.fn()
const mockGetAppVersion = vi.fn().mockResolvedValue('0.1.0-dev')
const mockGetBackendStatus = vi.fn().mockResolvedValue({ ready: true })

vi.stubGlobal('api', {
  login: mockLogin,
  getAppVersion: mockGetAppVersion,
  getBackendStatus: mockGetBackendStatus,
})

describe('App', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockGetAppVersion.mockReset()
    mockGetAppVersion.mockResolvedValue('0.1.0-dev')
    mockGetBackendStatus.mockReset()
    mockGetBackendStatus.mockResolvedValue({ ready: true })
  })

  it('renders the Login page after the backend readiness check succeeds', async () => {
    render(<App />)

    await screen.findByText('v0.1.0-dev')

    expect(mockGetBackendStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Korisničko ime')).toBeInTheDocument()
    expect(screen.getByLabelText('Lozinka')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijavite se' })).toBeInTheDocument()
  })

  it('shows a Serbian startup error when the backend is unavailable', async () => {
    mockGetBackendStatus.mockResolvedValueOnce({
      ready: false,
      message: 'Backend servis nije dostupan. Proverite da li je Iris API pokrenut.',
    })

    render(<App />)

    expect(await screen.findByText('Backend nije dostupan')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Backend servis nije dostupan. Proverite da li je Iris API pokrenut.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Korisničko ime')).not.toBeInTheDocument()
  })
})
