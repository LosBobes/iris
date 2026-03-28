import { useState } from 'react'
import { Login } from '@/components/Login/Login'

interface AuthenticatedUser {
  id: string
  username: string
  role: string
}

function App(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null)

  // Show the Login page until a user successfully authenticates
  if (!currentUser) {
    return <Login onLoginSuccess={(user) => setCurrentUser(user)} />
  }

  // Main application shell — replace this placeholder as features are built out
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Dobrodošli, {currentUser.username}!</p>
    </main>
  )
}

export default App
