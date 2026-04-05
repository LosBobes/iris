import { render, screen } from '@testing-library/react'
import App from './App'

// Mock window.api — injected by the preload script at runtime, not available in jsdom
vi.stubGlobal('api', { login: vi.fn() })

describe('App', () => {
  it('renders the Login page as the initial view', () => {
    render(<App />)

    expect(screen.getByLabelText('Korisničko ime')).toBeInTheDocument()
    expect(screen.getByLabelText('Lozinka')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijavite se' })).toBeInTheDocument()
  })
})
