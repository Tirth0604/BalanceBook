'use strict';

const mongoose = require('mongoose');
const { SETTLEMENT_STATUS, PAYMENT_METHODS } = require('../utils/constants');
const money = require('../utils/money');

const settlementSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator(value) {
          return !this.payerId || String(value) !== String(this.payerId);
        },
        message: 'A settlement cannot pay itself',
      },
    },
    amountMinor: {
      type: Number,
      required: true,
      min: [1, 'Settlement amount must be greater than zero'],
      validate: {
        validator: (value) => Number.isInteger(value) && Math.abs(value) <= money.MAX_SAFE,
        message: 'amountMinor must be a positive integer of minor units',
      },
    },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, required: true },
    status: {
      type: String,
      enum: Object.values(SETTLEMENT_STATUS),
      default: SETTLEMENT_STATUS.AWAITING_CONFIRMATION,
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    proofUrl: { type: String, default: null },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatedAt: { type: Date, default: Date.now },
    awaitingConfirmationAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedReason: { type: String, trim: true, maxlength: 300, default: null },
    disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    disputedAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    // Replayed requests must reuse the original settlement instead of creating a second one.
    idempotencyKey: { type: String, trim: true, maxlength: 128, default: null },
    auditTrail: {
      type: [
        {
          _id: false,
          action: { type: String, required: true },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          at: { type: Date, default: Date.now },
          from: { type: String, default: null },
          to: { type: String, default: null },
          note: { type: String, default: null },
        },
      ],
      default: [],
    },
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

settlementSchema.index({ groupId: 1, status: 1, initiatedAt: -1 });
settlementSchema.index({ payerId: 1, status: 1 });
settlementSchema.index({ receiverId: 1, status: 1 });
settlementSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

settlementSchema.virtual('isCompleted').get(function isCompleted() {
  return this.status === SETTLEMENT_STATUS.COMPLETED;
});

settlementSchema.virtual('amount').get(function amountString() {
  return money.fromMinor(this.amountMinor ?? 0, this.currency || 'INR');
});

settlementSchema.virtual('display').get(function display() {
  return money.format(this.amountMinor ?? 0, this.currency || 'INR');
});

settlementSchema.statics.Status = SETTLEMENT_STATUS;

const Settlement = mongoose.model('Settlement', settlementSchema);
module.exports = Settlement;
