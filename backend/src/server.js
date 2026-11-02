'use strict';

const http = require('http');
const config = require('./config/env');
const app = require('./app');
const { connectDatabase } = require('./config/db');
const { attachSocket } = require('./sockets/hub');
const recurringScheduler = require('./services/recurringExpenseService');

async function start() {
  await connectDatabase();
  const server = http.createServer(app);
  attachSocket(server);

  // Recurring rules materialise on a timer; no payment is ever initiated silently.
  const scheduler = recurringScheduler?.startScheduler?.();

  server.listen(config.PORT, config.HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] BalanceBook listening on http://${config.HOST}:${config.PORT}${config.API_PREFIX}`);
  });

  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`[api] ${signal} received, closing connections`);
    scheduler?.stop?.();
    server.close(async () => {
      const { disconnectDatabase } = require('./config/db');
      await disconnectDatabase();
      process.exit(0);
    });
    // Never hang forever behind an open socket.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[api] unhandled rejection', reason);
  });

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    // A boot failure must be loud and non-zero, or a deploy looks healthy when it is not.
    console.error('[api] failed to start', error);
    process.exit(1);
  });
}

module.exports = { start };
