import { createHttpApi } from '@/lib/api-client'

const apiMode = import.meta.env.VITE_IRIS_API_MODE ?? 'http'
const apiBaseUrl =
  import.meta.env.VITE_IRIS_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin)

if (import.meta.env.DEV && apiMode === 'fixtures') {
  const { createFixtureApi } = await import('@/lib/fixture-api')
  window.api = createFixtureApi()
} else {
  window.api = createHttpApi(apiBaseUrl)
}
