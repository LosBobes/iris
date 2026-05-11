// Production environment configuration
export const config = {
  environment: 'production' as const,
  api: {
    baseUrl: null as string | null
  },
  auth: {
    // No default credentials in production - all auth goes through the secure data store
  }
}
