import { createContext } from 'react'

export interface AuthContextValue {
  currentUser: AuthenticatedUser
  onLogout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
