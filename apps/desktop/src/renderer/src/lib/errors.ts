/**
 * Builds the message shown on the shop terminal: the action that failed plus
 * what the API said about it.
 *
 * The main-process client already appends the request reference the API
 * returned ("… (kod: AbC123-000042)"), so a photographed screen carries both the
 * reason and a code that resolves to the exact request in the server log.
 */
export function formatActionError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}
