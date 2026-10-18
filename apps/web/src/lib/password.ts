// bcrypt, which the API hashes passwords with, cannot take more than 72 bytes.
// Letters like č, ć, š, ž and đ take two bytes each in UTF-8, so a password of
// fewer than 72 characters can still be too long. Mirrors
// store.MaxPasswordBytes; the API re-checks it.
export const MAX_PASSWORD_BYTES = 72

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length
}

export function isPasswordTooLong(password: string): boolean {
  return passwordByteLength(password) > MAX_PASSWORD_BYTES
}
