import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Login } from './Login'

// Mock window.api — the real implementation is injected by the preload script at runtime
const mockLogin = vi.fn()
vi.stubGlobal('api', { login: mockLogin })

describe('Login', () => {
  const onLoginSuccess = vi.fn()

  beforeEach(() => {
    mockLogin.mockReset()
    onLoginSuccess.mockReset()
  })

  it('renders the login form', () => {
    render(<Login onLoginSuccess={onLoginSuccess} />)

    expect(screen.getByLabelText('Korisničko ime')).toBeInTheDocument()
    expect(screen.getByLabelText('Lozinka')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijavite se' })).toBeInTheDocument()
  })

  it('calls api.login with the entered credentials on submit', async () => {
    const fakeUser = { id: '1', username: 'admin', role: 'admin' }
    mockLogin.mockResolvedValueOnce({ success: true, user: fakeUser })

    render(<Login onLoginSuccess={onLoginSuccess} />)

    fireEvent.change(screen.getByLabelText('Korisničko ime'), {
      target: { value: 'admin' }
    })
    fireEvent.change(screen.getByLabelText('Lozinka'), {
      target: { value: 'admin123' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prijavite se' }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', password: 'admin123' })
      expect(onLoginSuccess).toHaveBeenCalledWith(fakeUser)
    })
  })

  it('displays an English error message when credentials are wrong', async () => {
    mockLogin.mockResolvedValueOnce({
      success: false,
      error: 'Neispravno korisničko ime ili lozinka.'
    })

    render(<Login onLoginSuccess={onLoginSuccess} />)

    fireEvent.change(screen.getByLabelText('Korisničko ime'), {
      target: { value: 'pogresno' }
    })
    fireEvent.change(screen.getByLabelText('Lozinka'), {
      target: { value: 'pogresno' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prijavite se' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Neispravno korisničko ime ili lozinka.')
      expect(onLoginSuccess).not.toHaveBeenCalled()
    })
  })

  it('displays a Serbian connection error when the IPC call throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('IPC error'))

    render(<Login onLoginSuccess={onLoginSuccess} />)

    fireEvent.change(screen.getByLabelText('Korisničko ime'), {
      target: { value: 'admin' }
    })
    fireEvent.change(screen.getByLabelText('Lozinka'), {
      target: { value: 'admin123' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prijavite se' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Greška u komunikaciji sa glavnim procesom aplikacije. (IPC error)'
      )
    })
  })
})
