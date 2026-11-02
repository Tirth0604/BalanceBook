'use strict';

const mongoose = require('mongoose');
const { categoryValues, FREQUENCIES } = require('../utils/constants');

const templateParticipantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    percentage: { type: Number, min: 0, max: 100, default: null },
    shareMinor: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * A recurring rule is a template, not a charge: materialising an occurrence only inserts
 * an ordinary Expense, and the unique occurrenceKey makes re-runs idempotent.
 */
const recurringExpenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    category: { type: String, enum: categoryValues, default: 'utilities' },
    totalMinor: {
      type: Number,
      required: true,
      min: [1, 'Amount must be greater than zero'],
      validate: { validator: (value) => Number.isInteger(value), message: 'Must be integer minor units' },
    },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, required: true },
    splitType: { type: String, enum: ['equal', 'exact', 'percentage'], default: 'equal' },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: { type: [templateParticipantSchema], required: true, minlength: 1 },
    frequency: { type: String, enum: FREQUENCIES, required: true },
    interval: { type: Number, min: 1, max: 365, default: 1 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    maxOccurrences: { type: Number, min: 1, max: 1200, default: null },
    nextDueDate: { type: Date, required: true, index: true },
    occurrenceCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    pausedAt: { type: Date, default: null },
    pausedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastGeneratedExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },
    lastGeneratedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reminderSentFor: { type: Date, default: null },
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

recurringExpenseSchema.index({ isActive: 1, nextDueDate: 1 });
recurringExpenseSchema.index({ groupId: 1, isActive: 1 });

recurringExpenseSchema.virtual('isPaused').get(function isPaused() {
  return !this.isActive && Boolean(this.pausedAt);
});

/** `2026-11` style key so an occurrence can only ever be created once. */
recurringExpenseSchema.methods.occurrenceKeyFor = function occurrenceKeyFor(date) {
  const iso = new Date(date).toISOString();
  return `${String(this._id)}|${iso.slice(0, 10)}`;
};

recurringExpenseSchema.methods.isExhausted = function isExhausted() {
  if (this.maxOccurrences != null && this.occurrenceCount >= this.maxOccurrences) return true;
  if (this.endDate && this.nextDueDate > this.endDate) return true;
  return false;
};

const RecurringExpense = mongoose.model('RecurringExpense', recurringExpenseSchema);
module.exports = RecurringExpense;
