'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { loginLimiter, registerLimiter, resetPasswordLimiter } = require('../middleware/rateLimiters');
const schemas = require('../validation/authSchemas');
const controller = require('../controllers/authController');

const router = express.Router();

// Public credential routes; the limiters are the contract's anti-brute-force budget.
router.post('/register', registerLimiter, validate({ body: schemas.register }), controller.register);
router.post('/login', loginLimiter, validate({ body: schemas.login }), controller.login);
router.post('/refresh', validate({ body: schemas.refresh }), controller.refresh);
router.post('/logout', controller.logout);
router.post('/forgot-password', resetPasswordLimiter, validate({ body: schemas.forgotPassword }), controller.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, validate({ body: schemas.resetPassword }), controller.resetPassword);
router.post('/verify-email', validate({ body: schemas.verifyEmail }), controller.verifyEmail);
router.post('/verify-otp', validate({ body: schemas.verifyOtp }), controller.verifyOtp);
router.post('/resend-otp', resetPasswordLimiter, validate({ body: schemas.resendOtp }), controller.resendOtp);

router.get('/me', requireAuth, controller.me);

module.exports = router;
