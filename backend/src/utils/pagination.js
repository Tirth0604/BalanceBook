'use strict';

const ApiError = require('./ApiError');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Normalise ?page / ?limit / ?sort into safe mongo inputs. */
function parsePagination(query, { defaultSort = '-createdAt' } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  if (Number.isNaN(Number.parseInt(query.limit, 10)) && query.limit != null) {
    throw ApiError.badRequest('limit must be an integer');
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
  const sort = toSortOperator(query.sort || defaultSort);
  return { page, limit, skip: (page - 1) * limit, sort };
}

/** "-expenseDate,title" -> { expenseDate: -1, title: 1 } */
function toSortOperator(raw) {
  const allowed = new Set([
    'createdAt',
    'updatedAt',
    'expenseDate',
    'amountMinor',
    'totalMinor',
    'name',
    'title',
    'nextDueDate',
    'status',
    'confirmedAt',
    'initiatedAt',
  ]);
  const terms = String(raw)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const sort = {};
  for (const term of terms) {
    const descending = term.startsWith('-');
    const field = descending ? term.slice(1) : term;
    if (!allowed.has(field)) {
      throw ApiError.badRequest(`Cannot sort by ${field}`);
    }
    sort[field] = descending ? -1 : 1;
  }
  return Object.keys(sort).length ? sort : { createdAt: -1 };
}

function buildMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
  };
}

/** Parses ?from / ?to into an inclusive mongo date range. */
function parseDateRange(query, { field = 'expenseDate' } = {}) {
  const range = {};
  const from = query.from ?? query.startDate;
  const to = query.to ?? query.endDate;
  if (from) {
    const date = new Date(from);
    if (Number.isNaN(date.getTime())) throw ApiError.badRequest('from must be a valid date');
    range.$gte = date;
  }
  if (to) {
    const date = new Date(to);
    if (Number.isNaN(date.getTime())) throw ApiError.badRequest('to must be a valid date');
    // Inclusive of the whole final day, since ?to=2026-11-30 means "through that day".
    range.$lte = query.to?.includes?.('T') ? date : new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  if (!Object.keys(range).length) return null;
  return { [field]: range };
}

const RANGE_PRESETS = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

/** Resolves ?range= presets into an explicit { from, to } window (UTC). */
function resolveRange(query, now = new Date()) {
  const preset = query.range;
  if (!preset || preset === 'all') return parseDateRange(query);
  if (RANGE_PRESETS[preset]) return { expenseDate: { $gte: new Date(now.getTime() - RANGE_PRESETS[preset]) } };
  if (preset === 'this_month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { expenseDate: { $gte: start, $lte: now } };
  }
  if (preset === 'last_month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { expenseDate: { $gte: start, $lt: end } };
  }
  if (preset === 'this_year') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { expenseDate: { $gte: start, $lte: now } };
  }
  if (preset === 'custom') return parseDateRange(query);
  throw ApiError.badRequest(`Unknown range: ${preset}`);
}

module.exports = { parsePagination, toSortOperator, buildMeta, parseDateRange, resolveRange, DEFAULT_LIMIT, MAX_LIMIT };
