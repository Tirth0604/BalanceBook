/**
 * First-run helper: creates backend/.env from .env.example with freshly generated
 * secrets, so a fresh clone can start without hand-editing files. Never overwrites
 * an existing .env, and never prints the generated values.
 *
 *   npm run setup
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..');
const target = resolve(dir, '.env');
const template = resolve(dir, '.env.example');

if (existsSync(target)) {
  console.log('[setup] .env already exists — leaving it untouched.');
  process.exit(0);
}

if (!existsSync(template)) {
  console.error('[setup] .env.example is missing; cannot generate configuration.');
  process.exit(1);
}

const secret = () => randomBytes(48).toString('base64url');
const substitutions = {
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
};

const body = readFileSync(template, 'utf8')
  .split('\n')
  .map((line) => {
    const key = line.split('=')[0];
    return substitutions[key] ? `${key}=${substitutions[key]}` : line;
  })
  .join('\n');

writeFileSync(target, `${body.replace(/\r/g, '')}\n`);
console.log('[setup] wrote .env with generated secrets (not printed). Set MONGODB_URI if you are not using docker compose or npm run dev:memory.');
