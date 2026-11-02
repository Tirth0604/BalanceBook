'use strict';

/** Shared vocabularies. Single source of truth for both the API and the UI. */

const EXPENSE_CATEGORIES = [
  { value: 'food', label: 'Food & Dining', icon: 'utensils', color: 'indigo' },
  { value: 'groceries', label: 'Groceries', icon: 'shopping-basket', color: 'teal' },
  { value: 'transport', label: 'Transportation', icon: 'car', color: 'amber' },
  { value: 'accommodation', label: 'Accommodation', icon: 'bed', color: 'violet' },
  { value: 'shopping', label: 'Shopping', icon: 'shopping-bag', color: 'rose' },
  { value: 'entertainment', label: 'Entertainment', icon: 'clapperboard', color: 'sky' },
  { value: 'utilities', label: 'Utilities', icon: 'zap', color: 'lime' },
  { value: 'travel', label: 'Travel', icon: 'plane', color: 'cyan' },
  { value: 'health', label: 'Healthcare', icon: 'stethoscope', color: 'pink' },
  { value: 'others', label: 'Others', icon: 'circle-ellipsis', color: 'slate' },
];

const GROUP_CATEGORIES = [
  { value: 'trip', label: 'Trip', icon: 'palmtree' },
  { value: 'home', label: 'Home / Roommates', icon: 'home' },
  { value: 'family', label: 'Family', icon: 'users' },
  { value: 'office', label: 'Office', icon: 'briefcase' },
  { value: 'friends', label: 'Friends', icon: 'coffee' },
  { value: 'other', label: 'Other', icon: 'tag' },
];

const SPLIT_TYPES = [
  { value: 'equal', label: 'Split equally', hint: 'Everyone pays the same amount' },
  { value: 'exact', label: 'Exact amounts', hint: 'Enter what each person owes' },
  { value: 'percentage', label: 'By percentage', hint: 'Assign a share of 100%' },
];

const GROUP_ROLE = { ADMIN: 'admin', MEMBER: 'member' };
const MEMBER_STATUS = { ACTIVE: 'active', INVITED: 'invited', DECLINED: 'declined', REMOVED: 'removed' };
const SETTLEMENT_STATUS = {
  PENDING: 'pending',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  DISPUTED: 'disputed',
  CANCELLED: 'cancelled',
};
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'upi', 'card', 'other'];
const NOTIFICATION_TYPES = [
  'group_invitation',
  'group_joined',
  'group_left',
  'group_removed',
  'expense_added',
  'expense_updated',
  'expense_deleted',
  'settlement_requested',
  'settlement_confirmed',
  'settlement_rejected',
  'settlement_disputed',
  'budget_threshold',
  'recurring_due',
  'insight',
];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const BUDGET_SCOPES = ['group_total', 'category'];

const categoryValues = EXPENSE_CATEGORIES.map((item) => item.value);
const groupCategoryValues = GROUP_CATEGORIES.map((item) => item.value);
const splitTypeValues = SPLIT_TYPES.map((item) => item.value);
const settlementStatusValues = Object.values(SETTLEMENT_STATUS);

module.exports = {
  EXPENSE_CATEGORIES,
  GROUP_CATEGORIES,
  SPLIT_TYPES,
  GROUP_ROLE,
  MEMBER_STATUS,
  SETTLEMENT_STATUS,
  PAYMENT_METHODS,
  NOTIFICATION_TYPES,
  FREQUENCIES,
  BUDGET_SCOPES,
  categoryValues,
  groupCategoryValues,
  splitTypeValues,
  settlementStatusValues,
  categoryLabel(value) {
    return EXPENSE_CATEGORIES.find((item) => item.value === value)?.label ?? 'Others';
  },
};
