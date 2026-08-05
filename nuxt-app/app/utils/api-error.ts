/** Extracts a safe, always-string error message from an ofetch error, falling back when the API didn't return the expected `{ error: string }` shape. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const apiError = (error as any)?.data?.error
  return typeof apiError === 'string' && apiError ? apiError : fallback
}
