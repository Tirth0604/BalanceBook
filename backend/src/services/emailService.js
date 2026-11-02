'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');

/**
 * Email is best-effort in this build: when SMTP is not configured the message is captured
 * in `outbox` (visible to tests and to the dev console) instead of throwing, so a missing
 * SMTP server can never break registration or an invitation.
 */

const outbox = [];

let transporter = null;
if (config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: Number(config.SMTP_PORT) === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
}

async function send({ to, subject, text, html }) {
  const message = { to, subject, text: text || '', html: html || text || '', sentAt: new Date() };
  if (!transporter) {
    outbox.push(message);
    if (config.isDevelopment) console.info(`[mail] (no SMTP) -> ${to}: ${subject}`);
    return { delivered: false, captured: true };
  }
  try {
    await transporter.sendMail({ from: config.MAIL_FROM, to, subject, text, html });
    return { delivered: true, captured: false };
  } catch (error) {
    // A provider outage should not fail the user's action; log and fall back to capture.
    console.error(`[mail] delivery failed for ${to}: ${error.message}`);
    outbox.push({ ...message, error: error.message });
    return { delivered: false, captured: true };
  }
}

function templates() {
  const base = String(config.CLIENT_URL).replace(/\/$/, '');
  return {
    verifyEmail(token) {
      const url = `${base}/verify-email?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Confirm your BalanceBook email',
        text: `Welcome to BalanceBook. Confirm your email: ${url}`,
      };
    },
    resetPassword(token) {
      const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      return { subject: 'Reset your BalanceBook password', text: `Use this link within 15 minutes: ${url}` };
    },
    groupInvitation({ groupName, inviterName, token }) {
      const url = `${base}/invitations?token=${encodeURIComponent(token)}`;
      return {
        subject: `${inviterName} added you to ${groupName} on BalanceBook`,
        text: `${inviterName} invited you to share expenses in "${groupName}". Join: ${url}`,
      };
    },
  };
}

module.exports = { send, outbox, templates, isConfigured: () => Boolean(transporter) };
