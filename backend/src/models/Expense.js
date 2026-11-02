'use strict';

const mongoose = require('mongoose');
const { categoryValues, splitTypeValues } = require('../utils/constants');
const money = require('../utils/money');
const ApiError = require('../utils/ApiError');

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shareMinor: {
      type: Number,
      required: true,
      min: [0, 'A share cannot be negative'],
      validate: {
        validator: (value) => Number.isInteger(value),
        message: 'shareMinor must be an integer minor-unit amount',
      },
    },
    percentage: { type: Number, min: 0, max: 100, default: null },
    weight: { type: Number, default: null },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: null },
    driver: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    fileName: { type: String, default: 'receipt' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const expenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    title: {
      type: String,
      required: [true, 'Expense title is required'],
      trim: true,
      minlength: [1, 'Expense title is required'],
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    category: { type: String, enum: categoryValues, default: 'others' },
    tags: {
      type: [String],
      default: [],
      maxlength: 10,
      set: (tags) => [...new Set((tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 10),
    },
    totalMinor: {
      type: Number,
      required: true,
      min: [1, 'Expense amount must be greater than zero'],
      validate: {
        validator: (value) => Number.isInteger(value) && Math.abs(value) <= money.MAX_SAFE,
        message: 'totalMinor must be a positive integer of minor units',
      },
    },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, required: true },
    groupAmountMinor: {
      type: Number,
      required: true,
      min: [0, 'Converted amount cannot be negative'],
      validate: {
        validator: (value) => Number.isInteger(value),
        message: 'groupAmountMinor must be an integer minor-unit amount',
      },
    },
    exchangeRate: { type: Number, default: 1, min: 0 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    splitType: { type: String, enum: splitTypeValues, required: true },
    participants: {
      type: [participantSchema],
      required: true,
      validate: {
        validator(participants) {
          return Array.isArray(participants) && participants.length > 0;
        },
        message: 'An expense needs at least one participant',
      },
    },
    expenseDate: { type: Date, default: Date.now, required: true },
    receipt: { type: receiptSchema, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    recurrenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringExpense', default: null },
    // Unique per generated occurrence; prevents a re-run scheduler from double-charging.
    occurrenceKey: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

expenseSchema.index({ groupId: 1, expenseDate: -1 });
expenseSchema.index({ groupId: 1, isDeleted: 1, expenseDate: -1 });
expenseSchema.index({ groupId: 1, category: 1 });
expenseSchema.index({ 'participants.userId': 1, expenseDate: -1 });
expenseSchema.index({ paidBy: 1, expenseDate: -1 });
expenseSchema.index(
  { recurrenceId: 1, occurrenceKey: 1 },
  {
    unique: true,
    // A sparse compound index would still index {null, null}, so ordinary expenses would
    // collide with each other; only index documents that actually carry an occurrence key.
    partialFilterExpression: { occurrenceKey: { $type: 'string' } },
  },
);
expenseSchema.index({ groupId: 1, title: 'text' }, { name: 'expense_title_text' });

/**
 * The ledger is only trustworthy if the stored shares always rebuild the total, so the
 * invariant is enforced at the schema boundary as well as in the service layer.
 */
expenseSchema.pre('validate', function reconcileShares(next) {
  if (!this.isModified('participants') && !this.isModified('totalMinor') && this.participants?.length) {
    return next();
  }
  if (!this.participants?.length || this.totalMinor == null) return next();

  const unique = new Set(this.participants.map((participant) => String(participant.userId)));
  if (unique.size !== this.participants.length) {
    // ApiError (not a mongoose ValidatorError) so the error middleware keeps the 422 code.
    return next(new ApiError(422, 'VALIDATION_ERROR', 'The same user cannot be a participant twice'));
  }

  const shareSum = this.participants.reduce((total, participant) => total + participant.shareMinor, 0);
  if (shareSum !== this.totalMinor) {
    return next(
      new ApiError(
        422,
        'VALIDATION_ERROR',
        `Participant shares (${shareSum}) must sum to the expense total (${this.totalMinor})`,
      ),
    );
  }
  return next();
});

expenseSchema.virtual('shareSumMinor').get(function shareSum() {
  return (this.participants || []).reduce((total, participant) => total + participant.shareMinor, 0);
});

expenseSchema.virtual('amount').get(function amountString() {
  return money.fromMinor(this.totalMinor ?? 0, this.currency || 'INR');
});

expenseSchema.virtual('display').get(function display() {
  return money.format(this.totalMinor ?? 0, this.currency || 'INR');
});

/** True when a member paid for a group they are also consuming from. */
expenseSchema.methods.wasPaidBy = function wasPaidBy(userId) {
  return String(this.paidBy) === String(userId);
};

expenseSchema.methods.shareFor = function shareFor(userId) {
  return this.participants.find((participant) => String(participant.userId) === String(userId))?.shareMinor ?? 0;
};

const Expense = mongoose.model('Expense', expenseSchema);
module.exports = Expense;
