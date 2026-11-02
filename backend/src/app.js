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

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/curl requests have no Origin header.
      if (!origin || config.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
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
