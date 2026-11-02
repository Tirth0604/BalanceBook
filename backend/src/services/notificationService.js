'use strict';

const Notification = require('../models/Notification');
const User = require('../models/User');
const Group = require('../models/Group');
const { emitToUser, emitToGroup } = require('../sockets/hub');
const { parsePagination, buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');

/**
 * The only path that creates notifications, so every module (expenses, settlements,
 * budgets, recurring) emits through one place and cannot drift in wording or payloads.
 */

const PREFERENCE_FOR_TYPE = {
  expense_added: 'expenseAdded',
  expense_updated: 'expenseUpdated',
  settlement_requested: 'settlementRequested',
  settlement_confirmed: 'settlementConfirmed',
  budget_threshold: 'budgetAlerts',
};

/**
 * @param {object} input
 * @param {string[]} input.userIds   explicit recipients
 * @param {boolean}  [input.includeGroupMembers] deliver to every active member of groupId
 * @param {string}   [input.excludeUserId] actor usually does not notify themselves
 */
async function notify({ userIds = [], groupId = null, includeGroupMembers = false, excludeUserId, type, title, body = '', payload = {}, session }) {
  if (!type || !title) throw ApiError.internal('A notification needs a type and a title');

  let recipients = [...new Set(userIds.map(String))];
  if (includeGroupMembers && groupId) {
    const group = await Group.findById(groupId).session(session ?? null);
    if (group) recipients = [...new Set([...recipients, ...group.activeMemberIds()])];
  }
  if (excludeUserId) recipients = recipients.filter((id) => id !== String(excludeUserId));
  if (!recipients.length) return { created: 0, delivered: 0 };

  const users = await User.find({ _id: { $in: recipients }, status: 'active' })
    .select('notificationPreferences name')
    .session(session ?? null);

  const rows = [];
  for (const user of users) {
    const preferences = user.notificationPreferences || {};
    // inApp is the master switch; a type-specific preference can silence a noisy category.
    if (!preferences.inApp) continue;
    const preferenceKey = PREFERENCE_FOR_TYPE[type];
    if (preferenceKey && preferences[preferenceKey] === false) continue;
    rows.push({ userId: user._id, groupId, type, title, body, payload, isRead: false });
  }

  if (!rows.length) return { created: 0, delivered: 0 };

  const created = await Notification.insertMany(rows, { session: session ?? null, ordered: false });

  const delivered = created.reduce((count, notification) => {
    const sent = emitToUser(notification.userId, 'notification:new', notification.toJSON());
    return count + (sent ? 1 : 0);
  }, 0);

  return { created: created.length, delivered, notifications: created };
}

/** Real-time-only broadcast (balance changed, expense added) with no persisted row. */
function broadcastGroup(groupId, event, payload) {
  return emitToGroup(groupId, event, payload);
}

async function listForUser(userId, query = {}) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultSort: '-createdAt' });
  const filter = { userId };
  if (query.unread === 'true' || query.unread === '1') filter.isRead = false;
  if (query.type) filter.type = query.type;
  if (query.groupId) filter.groupId = query.groupId;

  const [items, total] = await Promise.all([
    Notification.find(filter).sort(sort).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);
  // Clients address a notification by `id` (docs/03 /notifications/:id), so the Mongo
  // `_id` must not be the only identifier on the wire.
  return {
    items: items.map((notification) => ({
      id: String(notification._id),
      groupId: notification.groupId ? String(notification.groupId) : null,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payload ?? null,
      isRead: notification.isRead,
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt,
    })),
    meta: buildMeta({ page, limit, total }),
  };
}

async function unreadCount(userId) {
  return Notification.countDocuments({ userId, isRead: false });
}

async function markRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true, readAt: new Date() },
    { new: true },
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  return notification;
}

async function markAllRead(userId) {
  const result = await Notification.updateMany({ userId, isRead: false }, { isRead: true, readAt: new Date() });
  return { updated: result.modifiedCount ?? 0 };
}

async function remove(userId, notificationId) {
  const result = await Notification.deleteOne({ _id: notificationId, userId });
  if (!result.deletedCount) throw ApiError.notFound('Notification not found');
}

module.exports = { notify, broadcastGroup, listForUser, unreadCount, markRead, markAllRead, remove };
