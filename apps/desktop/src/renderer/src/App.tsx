import { useCallback, useState } from 'react'
import { Login } from '@/components/Login/Login'
import DashboardPage from '@/pages/DashboardPage'
import { Toaster } from '@/components/ui/sonner'

function AccessDenied(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">
        Nemate dozvolu za pristup ovoj stranici.
      </p>
    </main>
  )
}

function App(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null)

  const handleLoginSuccess = useCallback(
    (user: AuthenticatedUser) => setCurrentUser(user),
    []
  )

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  if (currentUser.role !== 'admin') {
    return <AccessDenied />
  }

  return (
    <>
      <DashboardPage />
      <Toaster />
    </>
  )
}

export default App
