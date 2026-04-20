// Production environment configuration
export const config = {
  environment: 'production' as const,
  auth: {
    // No default credentials in production - all auth goes through the secure data store
  }
}
