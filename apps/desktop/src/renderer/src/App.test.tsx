import { render, screen } from '@testing-library/react'
import App from './App'

// Mock window.api - injected by the preload script at runtime, not available in jsdom
vi.stubGlobal('api', { login: vi.fn(), getAppVersion: vi.fn().mockResolvedValue('0.1.0-dev') })

describe('App', () => {
  it('renders the Login page as the initial view', async () => {
    render(<App />)

    await screen.findByText('v0.1.0-dev')

    expect(screen.getByLabelText('Korisničko ime')).toBeInTheDocument()
    expect(screen.getByLabelText('Lozinka')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijavite se' })).toBeInTheDocument()
  })
})
