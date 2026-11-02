'use strict';

const mongoose = require('mongoose');

/**
 * Append-only record of every change to an expense. Financial history must be
 * reconstructable, so nothing in the application updates or deletes these rows.
 */
const expenseAuditLogSchema = new mongoose.Schema(
  {
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted', 'restored', 'receipt_added', 'receipt_removed'],
      required: true,
    },
    previousData: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedData: { type: mongoose.Schema.Types.Mixed, default: null },
    changeSummary: { type: String, trim: true, maxlength: 500, default: '' },
    // Human-supplied justification, kept separate from the diff.
    reason: { type: String, trim: true, maxlength: 300, default: null },
    clientMeta: {
      type: new mongoose.Schema(
        {
          ip: { type: String, default: null },
          userAgent: { type: String, default: null },
          requestId: { type: String, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        if (ret._id) ret.id = String(ret._id);
        return ret;
      },
    },
  },
);

expenseAuditLogSchema.index({ expenseId: 1, createdAt: -1 });
expenseAuditLogSchema.index({ groupId: 1, createdAt: -1 });

// Guard the append-only contract at the ODM level too.
const blockMutation = function blockMutation(next) {
  return next(new Error('Expense audit logs are immutable'));
};
expenseAuditLogSchema.pre('updateOne', blockMutation);
expenseAuditLogSchema.pre('updateMany', blockMutation);
expenseAuditLogSchema.pre('findOneAndUpdate', blockMutation);
expenseAuditLogSchema.pre('deleteOne', { document: true, query: false }, blockMutation);

const ExpenseAuditLog = mongoose.model('ExpenseAuditLog', expenseAuditLogSchema);
module.exports = ExpenseAuditLog;
