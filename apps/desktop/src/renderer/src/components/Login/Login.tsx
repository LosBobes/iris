import { useState } from 'react'
import { Button } from '@/components/ui/button'
import './Login.css'

interface LoginProps {
  // Called when authentication succeeds — parent decides what to render next
  onLoginSuccess: (user: { id: string; username: string; role: string }) => void
}

export function Login({ onLoginSuccess }: LoginProps): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await window.api.login({ username, password })

      if (result.success && result.user) {
        onLoginSuccess(result.user)
      } else {
        // error text comes from the main process, already in Serbian
        setError(result.error ?? 'Greška pri prijavljivanju.')
      }
    } catch {
      // Network/IPC failure — the main process was unreachable
      setError('Nije moguće uspostaviti vezu sa serverom.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">

        {/* App name and welcome header */}
        <div className="login-header">
          <h1 className="login-title">Iris aplikacija</h1>
          <p className="login-description">Prijavite se na vaš nalog</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="username" className="login-label">
              Korisničko ime
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Unesite korisničko ime"
              autoComplete="username"
              required
              disabled={isLoading}
              className="login-input"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">
              Lozinka
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Unesite lozinku"
              autoComplete="current-password"
              required
              disabled={isLoading}
              className="login-input"
            />
          </div>

          {/* Error box — only rendered when there is an active error */}
          {error ? (
            <div className="login-error" role="alert">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full mt-1" disabled={isLoading}>
            {isLoading ? 'Učitavanje...' : 'Prijavite se'}
          </Button>
        </form>
      </div>
    </div>
  )
}
