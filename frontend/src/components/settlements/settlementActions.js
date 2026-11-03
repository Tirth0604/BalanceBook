/**
 * Settlement action gating — mirrors what the API enforces (docs/03):
 *   confirm / reject : receiver only, while `awaiting_confirmation`
 *   dispute          : payer or receiver
 *   cancel           : the initiator, while still unconfirmed
 * The server sends `canConfirm` / `canReject`; when those flags are present they win,
 * because the server always knows more about membership than the cache does.
 */
export const STATUS_AWAITING = 'awaiting_confirmation'
export const STATUS_PENDING = 'pending'
export const STATUS_COMPLETED = 'completed'
export const STATUS_REJECTED = 'rejected'
export const STATUS_DISPUTED = 'disputed'
export const STATUS_CANCELLED = 'cancelled'

export const SETTLEMENT_STATUSES = [
  STATUS_PENDING,
  STATUS_AWAITING,
  STATUS_COMPLETED,
  STATUS_REJECTED,
  STATUS_DISPUTED,
  STATUS_CANCELLED,
]

const idOf = (ref) => (typeof ref === 'string' ? ref : ref?.id ?? null)

export function resolveSettlementActions(settlement, myId) {
  const status = settlement?.status ?? STATUS_PENDING
  const payerId = idOf(settlement?.payer)
  const receiverId = idOf(settlement?.receiver)
  const initiatorId = idOf(settlement?.initiatedBy) ?? payerId

  const isPayer = Boolean(myId) && payerId === myId
  const isReceiver = Boolean(myId) && receiverId === myId
  const isInitiator = Boolean(myId) && initiatorId === myId
  const awaiting = status === STATUS_AWAITING || status === STATUS_PENDING

  const confirm = Boolean(settlement?.canConfirm ?? isReceiver) && awaiting
  const reject = Boolean(settlement?.canReject ?? isReceiver) && awaiting
  const dispute = (isPayer || isReceiver) && awaiting && status !== STATUS_DISPUTED
  const cancel = isInitiator && awaiting

  const notAwaiting = `This settlement is already ${status}.`
  return {
    status,
    isPayer,
    isReceiver,
    isInitiator,
    actions: { confirm, reject, dispute, cancel },
    canAct: confirm || reject || dispute || cancel,
    reasons: {
      confirm: confirm
        ? null
        : !awaiting
          ? notAwaiting
          : !isReceiver
            ? 'Only the receiver can confirm a payment.'
            : settlement?.canConfirm === false
              ? 'The server has closed this payment, so it cannot be confirmed.'
              : null,
      reject: reject
        ? null
        : !awaiting
          ? notAwaiting
          : !isReceiver
            ? 'Only the receiver can reject a payment.'
            : settlement?.canReject === false
              ? 'The server has closed this payment, so it cannot be rejected.'
              : null,
      dispute: dispute
        ? null
        : !isPayer && !isReceiver
          ? 'Only the payer or the receiver can dispute it.'
          : `A ${status} settlement cannot be disputed.`,
      cancel: cancel ? null : !isInitiator ? 'Only whoever recorded it can cancel it.' : notAwaiting,
    },
  }
}

/** Tone + words for the status badge — never colour alone (docs/06 UX rule 3). */
export function statusPresentation(status) {
  switch (status) {
    case STATUS_COMPLETED:
      return { tone: 'success', words: 'settled', Icon: 'CheckCircle2' }
    case STATUS_AWAITING:
      return { tone: 'warning', words: 'awaiting confirmation', Icon: 'Hourglass' }
    case STATUS_PENDING:
      return { tone: 'warning', words: 'pending', Icon: 'Hourglass' }
    case STATUS_REJECTED:
      return { tone: 'danger', words: 'rejected', Icon: 'XCircle' }
    case STATUS_DISPUTED:
      return { tone: 'danger', words: 'disputed', Icon: 'ShieldAlert' }
    case STATUS_CANCELLED:
      return { tone: 'neutral', words: 'cancelled', Icon: 'Ban' }
    default:
      return { tone: 'neutral', words: status ?? 'unknown', Icon: 'Info' }
  }
}

/**
 * Idempotency: one key per dialog session, so a double click or a retry replays
 * the original settlement instead of creating a second payment. The backend reads
 * it from the body (`idempotencyKey`) or the `X-Idempotency-Key` header.
 */
export function makeIdempotencyKey(scope = 'settlement') {
  const random = Math.random().toString(36).slice(2, 10)
  return `${scope}-${Date.now().toString(36)}-${random}`
}

export function buildSettlementBody({
  groupId,
  payerId,
  receiverId,
  amount,
  currency,
  paymentMethod,
  note,
  idempotencyKey,
}) {
  return {
    groupId,
    payerId,
    receiverId,
    amount: String(amount ?? '').trim(),
    currency,
    paymentMethod: paymentMethod || 'cash',
    ...(note ? { note: note.trim() } : {}),
    idempotencyKey,
  }
}
