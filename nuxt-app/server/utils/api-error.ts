/**
 * Throws a Nitro error whose JSON body matches the legacy Vercel API's shape
 * (`{ error: string }`), not Nitro's default `{ statusCode, statusMessage,
 * message }` — the frontend's apiErrorMessage() util reads `data.error`
 * specifically, inherited from the legacy contract.
 */
export function apiError(statusCode: number, message: string): never {
  throw createError({ statusCode, statusMessage: message, data: { error: message } })
}
