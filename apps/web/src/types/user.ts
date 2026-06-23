// User accounts managed by admins. Contract-sync point with the User /
// CreateUserInput / UpdateUserInput schemas in iris-api/openapi.yaml.

export type UserRole = 'admin' | 'user'

export interface ManagedUser {
  id: string
  username: string
  role: UserRole
}

export interface CreateUserInput {
  username: string
  password: string
  role: UserRole
}

export interface UpdateUserInput {
  role: UserRole
  /** When non-empty, resets the password; empty leaves it unchanged. */
  password?: string
}
