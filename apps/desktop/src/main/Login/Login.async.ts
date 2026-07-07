import { ipcMain } from 'electron'
import type { User } from '../../../model/user'
import {
  createConfiguredIrisApiClient,
  mapIrisApiErrorToUserMessage
} from '../shared/iris-api-client'

interface LoginResponse {
  success: boolean
  error?: string
  user?: User
}

/**
 * Registers all IPC handlers for the Login feature.
 *
 * Channel: 'auth:login'
 *   Receives: { orgSlug: string, username: string, password: string }
 *   Returns:  LoginResponse
 *
 * Call this once from main/index.ts inside app.whenReady().
 */
export function registerLoginHandlers(): void {
  ipcMain.handle(
    'auth:login',
    async (
      _event,
      credentials: { orgSlug: string; username: string; password: string }
    ): Promise<LoginResponse> => {
      try {
        const client = createConfiguredIrisApiClient()
        const result = await client.login(credentials)

        if (!result.success || !result.user) {
          return {
            success: false,
            error: result.error ?? 'Neispravno korisničko ime ili lozinka.'
          }
        }

        const user: User = {
          id: result.user.id,
          username: result.user.username,
          role: result.user.role
        }

        return { success: true, user }
      } catch (error) {
        return {
          success: false,
          error: mapIrisApiErrorToUserMessage(error, 'Greška pri prijavljivanju.')
        }
      }
    }
  )
}
