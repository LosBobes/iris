// The two-step sign-in: the organization is chosen (and validated against the
// API) once per device, then every later visit goes straight to that
// organization's own sign-in page at /login/<slug>.

import { z } from 'zod'

/** Kept from the previous single-form login so returning devices skip step one. */
const REMEMBERED_ORG_KEY = 'iris.rememberedOrg'

export const LOGIN_PATH = '/login'

export function organizationLoginPath(slug: string): string {
  return `${LOGIN_PATH}/${encodeURIComponent(slug)}`
}

/** Where a signed-out visitor goes: their organization's page, or step one. */
export function loginEntryPath(): string {
  const remembered = readRememberedOrganization()
  return remembered ? organizationLoginPath(remembered) : LOGIN_PATH
}

export function readRememberedOrganization(): string | null {
  try {
    return localStorage.getItem(REMEMBERED_ORG_KEY) || null
  } catch {
    return null
  }
}

export function rememberOrganization(slug: string): void {
  try {
    localStorage.setItem(REMEMBERED_ORG_KEY, slug)
  } catch {
    // Without storage the visitor just picks the organization again next time.
  }
}

export function forgetOrganization(): void {
  try {
    localStorage.removeItem(REMEMBERED_ORG_KEY)
  } catch {
    // Nothing stored means nothing to forget.
  }
}

/**
 * Shape check for the organization field. Existence is checked against the API
 * afterwards; this only catches what could never be a slug (empty, spaces, or
 * characters that would break the /login/<slug> URL).
 */
export const organizationSlugSchema = z.object({
  orgSlug: z
    .string()
    .trim()
    .min(1, 'auth.orgRequired')
    .max(64, 'auth.orgInvalid')
    .regex(/^[^\s/?#%\\]+$/, 'auth.orgInvalid')
    .transform((value) => value.toLowerCase()),
})

export type OrganizationSlugForm = z.input<typeof organizationSlugSchema>
