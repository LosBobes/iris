import { createHttpApi } from '@/lib/api-client'
import { withQueryInvalidation } from '@/lib/query-client'

const apiMode = import.meta.env.VITE_IRIS_API_MODE ?? 'http'
const apiBaseUrl =
  import.meta.env.VITE_IRIS_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin)

// Mutations invalidate the cached queries they affect (see query-client.ts).
if (import.meta.env.DEV && apiMode === 'fixtures') {
  const { createFixtureApi } = await import('@/lib/fixture-api')
  window.api = withQueryInvalidation(createFixtureApi())
} else {
  window.api = withQueryInvalidation(createHttpApi(apiBaseUrl))
}
