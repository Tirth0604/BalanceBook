'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const config = require('./config/env');
const routes = require('./routes');
const { errorMiddleware, notFoundMiddleware } = require('./middleware/errorMiddleware');
const { supportsTransactions } = require('./config/db');

const app = express();

if (config.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: config.isProduction ? undefined : false,
  }),
);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (config.CORS_ORIGINS && config.CORS_ORIGINS.includes(origin)) return true;
  if (config.CLIENT_URL && origin === config.CLIENT_URL) return true;
  // Automatically allow any Vercel domain (*.vercel.app)
  if (/^https:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) return true;
  // Automatically allow local network IPs for mobile device testing (e.g. 192.168.x.x, 10.x.x.x, localhost)
  if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) return callback(null, true);
      // Deny without throwing an internal 500 error
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  }),
);

app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(cookieParser());
// Strip $-prefixed keys so a client cannot smuggle an operator into a mongo query.
app.use(mongoSanitize({ replaceWith: '_' }));

if (config.LOG_LEVEL !== 'silent' && !config.isTest) {
  app.use(morgan(config.isDevelopment ? 'dev' : 'combined'));
}

// Uploads are served straight from disk in the local driver.
app.use('/uploads', express.static(path.resolve(config.UPLOAD_DIR), { fallthrough: false, maxAge: '1d' }));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'balancebook-api',
      version: '1.0.0',
      environment: config.NODE_ENV,
      transactions: supportsTransactions(),
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});

app.get('/api', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'BalanceBook API',
      documentation: 'docs/03-api-contract.md',
      version: 'v1',
      endpoints: '/api/v1/{auth,users,groups,expenses,settlements,analytics,notifications}',
    },
  });
});

app.use(config.API_PREFIX, routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
