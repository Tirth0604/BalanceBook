'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { fileUploader, AVATAR_TYPES } = require('../middleware/uploadMiddleware');
const schemas = require('../validation/userSchemas');
const controller = require('../controllers/userController');

const router = express.Router();

const receiveAvatar = fileUploader({ allowed: AVATAR_TYPES, field: 'file' });

/**
 * Multipart is optional: a client that already stored the image posts `avatarUrl` instead,
 * so only a form-encoded request is handed to multer.
 */
function maybeReceiveAvatar(req, res, next) {
  const isMultipart = String(req.headers['content-type'] || '').startsWith('multipart/form-data');
  if (!isMultipart) return next();
  return receiveAvatar(req, res, next);
}

router.use(requireAuth);

router.get('/me', controller.me);
router.patch('/me', validate({ body: schemas.updateProfile }), controller.update);
router.post('/me/avatar', maybeReceiveAvatar, validate({ body: schemas.avatar }), controller.avatar);
router.post('/me/password', validate({ body: schemas.changePassword }), controller.changePassword);
router.delete('/me', validate({ body: schemas.deleteAccount }), controller.removeAccount);
router.get('/search', validate({ query: schemas.searchQuery }), controller.search);

module.exports = router;
