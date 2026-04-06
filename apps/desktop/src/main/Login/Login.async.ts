import { ipcMain } from 'electron'
import type { User } from '../../../model/user'
import { loadFixtureJson } from '../shared/load-fixture'

interface FixtureUser extends User {
  password: string
}

interface LoginResponse {
  success: boolean
  error?: string
  user?: User
}

/**
 * Registers all IPC handlers for the Login feature.
 *
 * Channel: 'auth:login'
 *   Receives: { username: string, password: string }
 *   Returns:  LoginResponse
 *
 * Call this once from main/index.ts inside app.whenReady().
 */
export function registerLoginHandlers(): void {
  ipcMain.handle(
    'auth:login',
    async (
      _event,
      credentials: { username: string; password: string }
    ): Promise<LoginResponse> => {
      const users = loadFixtureJson<FixtureUser[]>('users.json')
      const { username, password } = credentials

      // Look up the user — in production this should be an async DB query
      const match = users.find(
        (u) => u.username === username && u.password === password
      )

      if (!match) {
        return { success: false, error: 'Neispravno korisničko ime ili lozinka.' }
      }

      // Never send the password back to the renderer
      const user: User = { id: match.id, username: match.username, role: match.role }
      return { success: true, user }
    }
  )
}
