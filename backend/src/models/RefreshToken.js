'use strict';

const mongoose = require('mongoose');

/**
 * Refresh tokens are opaque random strings; only their SHA-256 digest is stored so a
 * database leak cannot be replayed against the API. `familyId` groups every token minted
 * by one rotation chain: if a token that was already rotated out comes back, the whole
 * family is revoked (reuse/theft detection).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true },
    userAgent: { type: String, default: '', maxlength: 300 },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        // The digest is a secret-equivalent; never serialise it.
        delete ret.tokenHash;
        delete ret.__v;
        if (ret._id) ret.id = String(ret._id);
        return ret;
      },
    },
  },
);

refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ familyId: 1, revokedAt: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { name: 'refresh_ttl', expireAfterSeconds: 0 });

refreshTokenSchema.virtual('isRevoked').get(function isRevoked() {
  return Boolean(this.revokedAt) || this.expiresAt.getTime() <= Date.now();
});

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema, 'refreshtokens');

module.exports = RefreshToken;
