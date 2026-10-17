import type { PlatformImpersonationAction } from '@/types/platform'

// Readable names for the change requests an impersonation trail records,
// keyed by "<METHOD> <API route pattern>" (see the routes in iris-api
// server.go). Values are keys under platform.impersonations.actions; anything
// not listed is shown as its method and path.
const ACTION_KEYS: Record<string, string> = {
  'POST /customers': 'customerCreate',
  'PUT /customers/{id}': 'customerUpdate',
  'DELETE /customers/{id}': 'customerDelete',
  'POST /locations': 'locationCreate',
  'PUT /locations/{id}': 'locationUpdate',
  'DELETE /locations/{id}': 'locationDelete',
  'POST /work-orders': 'workOrderCreate',
  'PATCH /work-orders/{id}': 'workOrderUpdate',
  'DELETE /work-orders/{id}': 'workOrderDelete',
  'POST /work-orders/preview': 'workOrderPreview',
  'POST /work-orders/reserve-number': 'orderNumberReserve',
  'POST /work-orders/release-number': 'orderNumberRelease',
  'POST /enum-values': 'enumCreate',
  'PUT /enum-values/{id}': 'enumUpdate',
  'DELETE /enum-values/{id}': 'enumDelete',
  'POST /catalog-items': 'catalogCreate',
  'PUT /catalog-items/{id}': 'catalogUpdate',
  'DELETE /catalog-items/{id}': 'catalogDelete',
  'POST /catalog-items/cleanup': 'catalogCleanup',
  'PUT /settings': 'settingsUpdate',
  'PUT /settings/login-logo': 'logoUpdate',
  'DELETE /settings/login-logo': 'logoDelete',
  'POST /users': 'userCreate',
  'PUT /users/{id}': 'userUpdate',
  'DELETE /users/{id}': 'userDelete',
}

/** The i18n key for an action, or null to fall back to method + path. */
export function actionLabelKey(action: Pick<PlatformImpersonationAction, 'method' | 'route'>): string | null {
  const key = ACTION_KEYS[`${action.method} ${action.route}`]
  return key ? `platform.impersonations.actions.${key}` : null
}

/** The record the action touched: the `{id}` segment of its path, if any. */
export function actionTarget(action: Pick<PlatformImpersonationAction, 'route' | 'path'>): string | null {
  const routeParts = action.route.split('/')
  const index = routeParts.indexOf('{id}')
  if (index < 0) return null
  const value = action.path.split('/')[index]
  return value ? decodeURIComponent(value) : null
}
