'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const booleanish = (fallback) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return fallback;
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
    });

const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    Array.isArray(value)
      ? value
      : String(value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().optional(),
  // Standalone mongod cannot run transactions; keep the switch so CI and Atlas behave.
  USE_TRANSACTIONS: booleanish(true),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECURE: booleanish(false),
  COOKIE_DOMAIN: z.string().optional(),

  CLIENT_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: list.transform((values) => (values.length ? values : ['http://localhost:5173'])),
  TRUST_PROXY: booleanish(false),

  UPLOAD_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  UPLOAD_DIR: z.string().default(path.resolve(__dirname, '../../uploads')),
  PUBLIC_URL: z.string().default('http://localhost:5000'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('BalanceBook <no-reply@balancebook.app>'),

  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().optional(),
  BREVO_SENDER_NAME: z.string().default('BalanceBook'),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('BalanceBook <onboarding@resend.dev>'),

  SEED_PASSWORD: z.string().default('Balance@123'),
  SETTLEMENT_EXACT_MAX_SIZE: z.coerce.number().int().min(2).max(20).default(12),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'http', 'debug']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  // Fail fast: a half-configured financial service is worse than a service that will not boot.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const config = parsed.data;
config.isProduction = config.NODE_ENV === 'production';
config.isTest = config.NODE_ENV === 'test';
config.isDevelopment = config.NODE_ENV === 'development';

module.exports = config;
