// Development environment configuration
// These values are for local development only — never used in production builds
export const config = {
  environment: 'development' as const,
  auth: {
    // Test credentials seeded in Login.async.ts during development
    defaultUsername: 'admin',
    defaultPassword: 'admin123'
  }
}
