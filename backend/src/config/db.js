'use strict';

const mongoose = require('mongoose');
const config = require('./env');

mongoose.set('strictQuery', true);

let transactionsAvailable = false;

/**
 * A standalone mongod rejects transactions. Rather than letting every financial write
 * fail on a developer laptop, probe once at boot and run without a session when the
 * deployment cannot support one. Services still assert their invariants either way.
 */
async function detectTransactionSupport() {
  if (!config.USE_TRANSACTIONS) return false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      /* no-op commit */
    });
    return true;
  } catch (error) {
    if (config.isDevelopment || config.isTest) {
      // eslint-disable-next-line no-console
      console.warn(`[db] transactions unavailable (${error.codeName || error.code}); running single-document writes`);
    }
    return false;
  } finally {
    await session.endSession();
  }
}

async function connectDatabase(uri = config.MONGODB_URI) {
  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
    dbName: config.MONGODB_DB_NAME,
    autoIndex: !config.isProduction,
  });
  transactionsAvailable = await detectTransactionSupport();
  return connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  transactionsAvailable = false;
}

function supportsTransactions() {
  return transactionsAvailable;
}

/**
 * Runs `work({ session })`, inside a real transaction when the deployment supports one.
 * `work` must pass the session through to every query it issues.
 */
async function withTransaction(work) {
  if (!transactionsAvailable) {
    return work({ session: null });
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work({ session });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
  supportsTransactions,
  mongoose,
};
