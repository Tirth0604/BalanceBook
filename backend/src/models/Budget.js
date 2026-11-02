'use strict';

const mongoose = require('mongoose');
const { BUDGET_SCOPES, categoryValues } = require('../utils/constants');

/**
 * A budget is a spending plan for a group (or one category inside it). It stores only the
 * limit — "spent" is always aggregated from live expenses so the two can never disagree.
 */
const budgetSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    scope: { type: String, enum: BUDGET_SCOPES, default: BUDGET_SCOPES.GROUP_TOTAL },
    category: { type: String, enum: categoryValues, default: null },
    label: { type: String, trim: true, maxlength: 80, default: '' },
    limitMinor: {
      type: Number,
      required: true,
      min: [1, 'Budget limit must be greater than zero'],
      validate: { validator: (value) => Number.isInteger(value), message: 'Must be integer minor units' },
    },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, required: true },
    period: { type: String, enum: ['overall', 'monthly'], default: 'overall' },
    // "2026-11" for monthly budgets, null for overall ones; part of the uniqueness key.
    periodKey: { type: String, trim: true, maxlength: 10, default: null },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    alertThresholds: {
      type: [Number],
      default: [75, 90, 100],
      validate: {
        validator: (thresholds) => thresholds.every((value) => value > 0 && value <= 1000),
        message: 'Alert thresholds must be between 1 and 1000',
      },
    },
    // Which thresholds have already produced a notification, so alerts do not spam.
    notifiedThresholds: { type: [Number], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        if (ret._id) ret.id = String(ret._id);
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

budgetSchema.index(
  { groupId: 1, scope: 1, category: 1, periodKey: 1 },
  { unique: true, name: 'budget_unique_per_scope' },
);

budgetSchema.pre('validate', function normaliseScope(next) {
  if (this.scope === 'category' && !this.category) {
    return next(new Error('A category budget must name its category'));
  }
  if (this.scope === 'group_total') this.category = null;
  if (this.period === 'monthly' && !this.periodKey) {
    return next(new Error('A monthly budget must name its period (YYYY-MM)'));
  }
  if (this.period === 'overall') this.periodKey = null;
  return next();
});

const Budget = mongoose.model('Budget', budgetSchema);
module.exports = Budget;
