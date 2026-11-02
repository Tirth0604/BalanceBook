'use strict';

const mongoose = require('mongoose');
const { GROUP_ROLE, MEMBER_STATUS, groupCategoryValues } = require('../utils/constants');

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: Object.values(GROUP_ROLE), default: GROUP_ROLE.MEMBER },
    status: { type: String, enum: Object.values(MEMBER_STATUS), default: MEMBER_STATUS.ACTIVE },
    joinedAt: { type: Date, default: Date.now },
    invitedEmail: { type: String, lowercase: true, trim: true, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedAt: { type: Date, default: null },
  },
  { _id: false },
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      minlength: [2, 'Group name must be at least 2 characters'],
      maxlength: [80, 'Group name cannot exceed 80 characters'],
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    category: { type: String, enum: groupCategoryValues, default: 'other' },
    imageUrl: { type: String, default: null },
    baseCurrency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: 'INR' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: {
      type: [memberSchema],
      default: [],
      validate: {
        validator(members) {
          const ids = members.map((member) => String(member.userId));
          return new Set(ids).size === ids.length;
        },
        message: 'A user can only appear once in a group',
      },
    },
    invitationCode: { type: String, unique: true, trim: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    settledUpAt: { type: Date, default: null },
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

groupSchema.index({ 'members.userId': 1, isArchived: 1 });
groupSchema.index({ createdBy: 1 });
groupSchema.index({ name: 'text', description: 'text' });

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Link code is a convenience for joining; it is not a credential and can be rotated. */
groupSchema.statics.generateInvitationCode = function generateInvitationCode(length = 10) {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
};

groupSchema.pre('validate', function ensureInvitationCode(next) {
  if (!this.invitationCode) this.invitationCode = this.constructor.generateInvitationCode();
  return next();
});

groupSchema.methods.activeMembers = function activeMembers() {
  return this.members.filter((member) => member.status === MEMBER_STATUS.ACTIVE);
};

groupSchema.methods.activeMemberIds = function activeMemberIds() {
  return this.activeMembers().map((member) => String(member.userId));
};

groupSchema.methods.findMember = function findMember(userId) {
  return this.members.find((member) => String(member.userId) === String(userId));
};

groupSchema.methods.isMember = function isMember(userId) {
  const member = this.findMember(userId);
  return Boolean(member && member.status === MEMBER_STATUS.ACTIVE);
};

groupSchema.methods.hasActiveAdmin = function hasActiveAdmin(userId) {
  const member = this.findMember(userId);
  return Boolean(member && member.status === MEMBER_STATUS.ACTIVE && member.role === GROUP_ROLE.ADMIN);
};

groupSchema.methods.activeAdminCount = function activeAdminCount() {
  return this.members.filter(
    (member) => member.status === MEMBER_STATUS.ACTIVE && member.role === GROUP_ROLE.ADMIN,
  ).length;
};

/** A group cannot go admin-less: the last active admin may not be demoted or removed. */
groupSchema.methods.canRemoveMember = function canRemoveMember(userId) {
  const member = this.findMember(userId);
  if (!member) return { allowed: false, reason: 'NOT_A_MEMBER' };
  if (member.role === GROUP_ROLE.ADMIN && this.activeAdminCount() <= 1) {
    return { allowed: false, reason: 'LAST_ADMIN' };
  }
  return { allowed: true };
};

const Group = mongoose.model('Group', groupSchema);
module.exports = Group;
