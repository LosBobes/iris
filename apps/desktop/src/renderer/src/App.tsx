import { useCallback, useState } from 'react'
import { Login } from '@/components/Login/Login'

interface AuthenticatedUser {
  id: string
  username: string
  role: string
}

function App(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null)

  const handleLoginSuccess = useCallback(
    (user: AuthenticatedUser) => setCurrentUser(user),
    []
  )

  // Show the Login page until a user successfully authenticates
  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Dobrodošli, {currentUser.username}!</p>
    </main>
  )
}

export default App
