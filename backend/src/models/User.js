'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const notificationPreferencesSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    expenseAdded: { type: Boolean, default: true },
    expenseUpdated: { type: Boolean, default: true },
    settlementRequested: { type: Boolean, default: true },
    settlementConfirmed: { type: Boolean, default: true },
    budgetAlerts: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_PATTERN, 'Email is not valid'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      maxlength: 128,
      select: false,
    },
    phone: { type: String, trim: true, maxlength: 20, default: null },
    avatarUrl: { type: String, default: null },
    preferredCurrency: {
      type: String,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'INR',
    },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, select: false, default: null },
    emailVerificationExpiresAt: { type: Date, select: false, default: null },
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date, select: false, default: null },
    otpHash: { type: String, select: false, default: null },
    otpExpiresAt: { type: Date, select: false, default: null },
    notificationPreferences: { type: notificationPreferencesSchema, default: () => ({}) },
    status: { type: String, enum: ['active', 'deactivated', 'deleted'], default: 'active' },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        // The password hash must never reach an API response or a log line.
        delete ret.password;
        delete ret.emailVerificationTokenHash;
        delete ret.passwordResetTokenHash;
        delete ret.__v;
        if (ret._id) ret.id = String(ret._id);
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
userSchema.statics.isValidEmail = (email) => EMAIL_PATTERN.test(String(email || '').trim());

const User = mongoose.model('User', userSchema);
module.exports = User;
module.exports.EMAIL_PATTERN = EMAIL_PATTERN;
