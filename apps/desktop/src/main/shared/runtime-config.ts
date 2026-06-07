import { readFileSync } from 'fs'
import { resolve } from 'path'
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

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

let cachedEnvFile: Map<string, string> | null = null

function loadEnvFile(): Map<string, string> {
  if (cachedEnvFile) {
    return cachedEnvFile
  }

  const map = new Map<string, string>()
  try {
    const contents = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      const rawValue = trimmed.slice(separatorIndex + 1).trim()
      map.set(key, stripWrappingQuotes(rawValue))
    }
  } catch {
    // No .env file (or unreadable) - leave the cache empty so we don't retry on every call.
  }

  cachedEnvFile = map
  return map
}

function getEnvironmentValue(name: string): string | undefined {
  return process.env[name] ?? loadEnvFile().get(name)
}

export function getDesktopConfig() {
  const baseConfig = isDevelopmentEnvironment() ? developmentConfig : productionConfig
  const envBaseUrl = normalizeBaseUrl(getEnvironmentValue('IRIS_API_BASE_URL'))

  return {
    ...baseConfig,
    api: {
      ...baseConfig.api,
      baseUrl: envBaseUrl ?? baseConfig.api.baseUrl,
    },
  }
}

export function __resetEnvFileCacheForTests(): void {
  cachedEnvFile = null
}
