// User model — represents an authenticated application user
export interface User {
  id: string
  username: string
  role: 'admin' | 'user'
}
