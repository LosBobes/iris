// Development environment configuration
// These values are for local development only - never used in production builds
export const config = {
  environment: 'development' as const,
  api: {
    baseUrl: null as string | null
  },
  auth: {
    // Suggested credentials for the local Iris API fixture seed.
    defaultUsername: 'admin',
    defaultPassword: 'admin123'
  }
}
