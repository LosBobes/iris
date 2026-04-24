import { config as developmentConfig } from '../../../config/development'
import { config as productionConfig } from '../../../config/production'

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/\/+$/, '')
}

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === 'development' || Boolean(process.env.ELECTRON_RENDERER_URL)
}

export function getDesktopConfig() {
  const baseConfig = isDevelopmentEnvironment() ? developmentConfig : productionConfig
  const envBaseUrl = normalizeBaseUrl(process.env.IRIS_API_BASE_URL)

  return {
    ...baseConfig,
    api: {
      ...baseConfig.api,
      baseUrl: envBaseUrl ?? baseConfig.api.baseUrl,
    },
  }
}