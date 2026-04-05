import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  // Represents an authenticated application user, mirroring model/user.ts
  interface AuthenticatedUser {
    id: string
    username: string
    role: 'admin' | 'user'
  }

  // Response shape returned by the 'auth:login' IPC channel
  interface LoginResponse {
    success: boolean
    error?: string
    user?: AuthenticatedUser
  }

  interface Window {
    electron: ElectronAPI
    api: {
      login: (credentials: {
        username: string
        password: string
      }) => Promise<LoginResponse>
    }
  }
}
