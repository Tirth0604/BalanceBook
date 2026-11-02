'use strict';

const mongoose = require('mongoose');

/**
 * One document per emailed group invitation. `tokenHash` is the digest of the opaque
 * accept token so a leaked table cannot mint acceptances; `code` mirrors the group join
 * code for the invite link.
 */
const invitationSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, trim: true, default: null },
    tokenHash: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    declinedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        // The accept token digest is secret; the join code is not, members already see it.
        delete ret.tokenHash;
        delete ret.__v;
        if (ret._id) ret.id = String(ret._id);
        return ret;
      },
    },
  },
);

invitationSchema.index({ groupId: 1, status: 1, createdAt: -1 }, { name: 'group_invites' });
invitationSchema.index({ email: 1, status: 1 });
invitationSchema.index({ expiresAt: 1 }, { name: 'invitation_ttl', expireAfterSeconds: 0 });

invitationSchema.virtual('isPending').get(function isPending() {
  return this.status === 'pending' && this.expiresAt.getTime() > Date.now();
});

const Invitation = mongoose.model('Invitation', invitationSchema, 'invitationtokens');

module.exports = Invitation;
