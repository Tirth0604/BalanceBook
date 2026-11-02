'use strict';

const multer = require('multer');
const crypto = require('crypto');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Uploads land in memory first; the storage driver decides where bytes end up (local disk
 * or Cloudinary). That keeps the controller free of transport details.
 */
const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
});

const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(mimeType) {
  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'application/pdf': 'pdf',
    }[mimeType] || 'bin'
  );
}

function fileUploader({ allowed, field = 'file' }) {
  const uploader = memory.single(field);
  return (req, res, next) => {
    uploader(req, res, (error) => {
      if (error) return next(ApiError.badRequest(error.message));
      if (!req.file) return next(ApiError.badRequest(`No file received in the "${field}" field`));
      if (!allowed.has(req.file.mimetype)) {
        return next(
          new ApiError(415, 'UPLOAD_INVALID', `Unsupported file type: ${req.file.mimetype}`, {
            allowed: [...allowed],
          }),
        );
      }
      // The client-supplied name is untrusted: never let it reach a filesystem path.
      req.file.safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extensionFor(req.file.mimetype)}`;
      return next();
    });
  };
}

const uploadReceipt = fileUploader({ allowed: RECEIPT_TYPES, field: 'receipt' });
const uploadAvatar = fileUploader({ allowed: AVATAR_TYPES, field: 'avatar' });

module.exports = { uploadReceipt, uploadAvatar, fileUploader, RECEIPT_TYPES, AVATAR_TYPES, extensionFor };
