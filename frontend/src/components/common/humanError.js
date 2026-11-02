/**
 * Map backend error codes (docs/03 §Envelope) to human sentences.
 * Server `message` is the fallback; codes give friendlier copy where the
 * raw message is developer-facing.
 */

const CODE_MESSAGES = {
  UNAUTHORIZED: 'That email or password is not correct. Please try again.',
  VALIDATION_ERROR: 'Some of the details you entered need fixing.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find what you were looking for.',
  CONFLICT: 'That action conflicts with something that already exists.',
  RATE_LIMITED: 'Too many attempts — please wait a moment and try again.',
  FINANCIAL_INVARIANT_VIOLATION: 'The amounts do not add up. Nothing was saved.',
  UNKNOWN_CURRENCY: 'That currency is not supported. Pick one from the list.',
  UPLOAD_INVALID: 'That file could not be uploaded. Check its type and size.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

/** RTKQ errors reach components as { status, code, message, details } via baseQuery. */
const TECHNICAL_RE = /(duplicate key|E\d{5}|Mongo|CastError|stack|traceback|JSON|payload validation)/i

export function humanizeApiError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return error

  const code = error.code || error.data?.error?.code
  const status = error.status ?? error.data?.status

  if (status === 429) return CODE_MESSAGES.RATE_LIMITED
  const message = error.message || error.data?.error?.message
  if (code && CODE_MESSAGES[code]) {
    // A specific, already-human server message wins over generic code copy —
    // unless it reads like an internal/driver error string.
    if (message && !/^[A-Z0-9_]+$/.test(message) && !TECHNICAL_RE.test(message)) return message
    return CODE_MESSAGES[code]
  }
  if (status === 0 || status === 'FETCH_ERROR') {
    return 'You appear to be offline. Check your connection and try again.'
  }
  if (message && !TECHNICAL_RE.test(message)) return message
  return fallback
}

/** First field-level message from envelope `details[]`, keyed by path. */
export function fieldErrorsFrom(error) {
  const details = error?.details ?? error?.data?.error?.details
  if (!Array.isArray(details)) return {}
  const out = {}
  for (const d of details) {
    if (d?.path && !out[d.path]) out[d.path] = d.message || 'Check this field.'
  }
  return out
}

export default humanizeApiError
