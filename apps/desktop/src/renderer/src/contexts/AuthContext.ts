import { createContext } from 'react'

export interface AuthContextValue {
  currentUser: AuthenticatedUser
}

export const AuthContext = createContext<AuthContextValue | null>(null)
