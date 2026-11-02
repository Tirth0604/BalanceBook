/**
 * Runs the API without a local mongod: starts an in-process single-node replica set
 * (transactions need one), seeds it, then boots src/server.js against it.
 *
 *   node scripts/dev-memory.mjs            # seed once, then serve on PORT (default 5000)
 *   SKIP_SEED=1 node scripts/dev-memory.mjs
 *
 * Data lives in a temp dir and disappears when the process exits.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '5000';
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replSet.getUri();
const env = { ...process.env, MONGODB_URI: uri, NODE_ENV: 'development', PORT };

console.log(`[dev-memory] replica set at ${uri.replace(/127\.0\.0\.1:\d+/, '127.0.0.1:<port>')}`);

const run = (file, stdio) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: process.cwd(), env, stdio });
    child.on('exit', (code) => resolve(code ?? 1));
  });

if (!process.env.SKIP_SEED) {
  console.log('[dev-memory] seeding…');
  const code = await run('src/scripts/seed.js', 'ignore');
  if (code !== 0) throw new Error(`seed exited ${code}`);
}

console.log(`[dev-memory] API on http://localhost:${PORT} — Ctrl+C to stop`);
const server = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env, stdio: 'inherit' });

const shutdown = async () => {
  server.kill();
  await replSet.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await new Promise((resolve) => server.on('exit', resolve));
await shutdown();
