'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');

const outbox = [];

let resendClient = null;
if (config.RESEND_API_KEY) {
  try {
    const { Resend } = require('resend');
    resendClient = new Resend(config.RESEND_API_KEY);
  } catch (err) {
    console.warn(`[mail] failed to initialize Resend: ${err.message}`);
  }
}

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

  // 1. Brevo API (https://api.brevo.com/v3/smtp/email)
  if (config.BREVO_API_KEY) {
    try {
      const senderEmail = config.BREVO_SENDER_EMAIL || 'ashishgandhi366@gmail.com';
      const senderName = config.BREVO_SENDER_NAME || 'BalanceBook';

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': config.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html || `<p>${(text || '').replace(/\n/g, '<br/>')}</p>`,
          textContent: text || '',
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = body?.message || `Brevo returned status ${res.status}`;
        console.error(`[brevo] delivery failed for ${to}:`, errorMsg);
        outbox.push({ ...message, error: errorMsg });
        return { delivered: false, captured: true, error: errorMsg };
      }

      console.info(`[brevo] email delivered to ${to} (messageId: ${body?.messageId})`);
      outbox.push({ ...message, brevoId: body?.messageId });
      return { delivered: true, captured: false, messageId: body?.messageId };
    } catch (error) {
      console.error(`[brevo] delivery exception for ${to}: ${error.message}`);
      outbox.push({ ...message, error: error.message });
      return { delivered: false, captured: true };
    }
  }

  // 2. Resend API
  if (resendClient) {
    try {
      const from = config.RESEND_FROM || 'BalanceBook <onboarding@resend.dev>';
      const { data, error } = await resendClient.emails.send({
        from,
        to: [to],
        subject,
        text,
        html: html || `<p>${(text || '').replace(/\n/g, '<br/>')}</p>`,
      });
      if (error) {
        console.error(`[resend] send error for ${to}:`, error);
        outbox.push({ ...message, error: error.message });
        return { delivered: false, captured: true, error };
      }
      console.info(`[resend] email sent to ${to} (id: ${data?.id})`);
      outbox.push({ ...message, resendId: data?.id });
      return { delivered: true, captured: false, id: data?.id };
    } catch (error) {
      console.error(`[resend] delivery exception for ${to}: ${error.message}`);
      outbox.push({ ...message, error: error.message });
      return { delivered: false, captured: true };
    }
  }

  // 2. SMTP Transporter
  if (transporter) {
    try {
      await transporter.sendMail({ from: config.MAIL_FROM, to, subject, text, html });
      return { delivered: true, captured: false };
    } catch (error) {
      console.error(`[mail] delivery failed for ${to}: ${error.message}`);
      outbox.push({ ...message, error: error.message });
      return { delivered: false, captured: true };
    }
  }

  // 3. Fallback to outbox (dev / test)
  outbox.push(message);
  if (config.isDevelopment) console.info(`[mail] (no Resend/SMTP) -> ${to}: ${subject}`);
  return { delivered: false, captured: true };
}

function templates() {
  const base = String(config.CLIENT_URL).replace(/\/$/, '');
  return {
    otpVerification(otp) {
      return {
        subject: `${otp} is your BalanceBook verification code`,
        text: `Welcome to BalanceBook!\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #111827; margin: 0 0 8px 0; font-size: 22px; font-weight: 700;">Confirm your email</h2>
              <p style="color: #4b5563; margin: 0; font-size: 14px;">Enter the code below to complete your registration on BalanceBook.</p>
            </div>
            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <span style="font-family: monospace; font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #111827;">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0 0 8px 0;">This code is valid for 10 minutes.</p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `,
      };
    },
    verifyEmail(token) {
      const url = `${base}/verify-email?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Confirm your BalanceBook email',
        text: `Welcome to BalanceBook. Confirm your email: ${url}`,
      };
    },
    resetPassword(token) {
      const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Reset your BalanceBook password',
        text: `Hello,\n\nYou requested a password reset for your BalanceBook account.\n\nClick the link below to set a new password:\n${url}\n\nThis link is valid for 15 minutes. If you did not request this, you can ignore this email.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; background: #eff6ff; color: #2563eb; font-size: 24px; margin-bottom: 12px;">🔒</div>
              <h2 style="color: #111827; margin: 0 0 8px 0; font-size: 22px; font-weight: 700;">Reset your password</h2>
              <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.5;">
                We received a request to reset the password for your BalanceBook account. Click the button below to choose a new password.
              </p>
            </div>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${url}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 600; font-size: 15px; padding: 13px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0 0 8px 0;">
              This link is valid for <strong>15 minutes</strong>.
            </p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        `,
      };
    },
    groupInvitation({ groupName, inviterName, code, token }) {
      const joinUrl = `${base}/join?code=${encodeURIComponent(code || '')}`;
      return {
        subject: `${inviterName} invited you to join "${groupName}" on BalanceBook`,
        text: `Hello!\n\n${inviterName} invited you to join the group "${groupName}" on BalanceBook to share and settle expenses.\n\nClick here to join directly:\n${joinUrl}\n\nInvitation Code: ${code || ''}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; background: #eff6ff; color: #2563eb; font-size: 24px; margin-bottom: 12px;">👥</div>
              <h2 style="color: #111827; margin: 0 0 8px 0; font-size: 22px; font-weight: 700;">Group Invitation</h2>
              <p style="color: #4b5563; margin: 0; font-size: 15px; line-height: 1.5;">
                <strong>${inviterName}</strong> invited you to join <strong>"${groupName}"</strong> on BalanceBook.
              </p>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <p style="color: #64748b; font-size: 13px; margin: 0 0 6px 0; font-weight: 500;">Invitation Code</p>
              <span style="font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${code || ''}</span>
            </div>
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${joinUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 600; font-size: 15px; padding: 13px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">
                Join "${groupName}"
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
              Or visit BalanceBook and enter code <strong>${code || ''}</strong>.
            </p>
          </div>
        `,
      };
    },
  };
}

module.exports = {
  send,
  outbox,
  templates,
  isConfigured: () => Boolean(config.BREVO_API_KEY || resendClient || transporter),
};
