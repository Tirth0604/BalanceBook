/**
 * Boots the real API against a database and walks the golden path with HTTP calls.
 * This is the "run the application and check the responses" gate: it exits non-zero
 * when any expectation fails, so CI and local review both get a hard signal.
 *
 * Usage:
 *   node scripts/smoke.mjs                       # ephemeral replica set + seed
 *   MONGODB_URI=... PORT=... node scripts/smoke.mjs   # against a running instance
 */
import { spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '5055';
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const PASSWORD = 'Balance@123';
const EMAIL = 'tirth@balancebook.app';

let replSet = null;
let server = null;
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function waitForServer(attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`${BASE.replace('/api/v1', '')}/health`);
      if (res.ok) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startDatabase() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  return replSet.getUri();
}

function run(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: process.cwd(), env, stdio: 'ignore' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const uri = await startDatabase();
  const env = { ...process.env, MONGODB_URI: uri, NODE_ENV: 'development', PORT };

  if (replSet) {
    console.log(`Seeding ephemeral replica set…`);
    const code = await run('src/scripts/seed.js', env);
    if (code !== 0) throw new Error(`seed exited ${code}`);
    console.log(`Starting API on :${PORT}…`);
    server = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env, stdio: 'ignore' });
  } else {
    console.log(`Using MONGODB_URI already exported; expecting the API on :${PORT}…`);
  }

  if (!(await waitForServer())) throw new Error('API did not become healthy in time');

  const login = await call('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  record('POST /auth/login', login.status === 200, `status ${login.status}`);
  const token = login.json?.data?.tokens?.accessToken ?? login.json?.data?.accessToken;
  if (!token) throw new Error('login returned no access token');

  const groups = await call('GET', '/groups', { token });
  const list = groups.json?.data ?? groups.json?.data?.items ?? [];
  record('GET /groups', groups.status === 200 && list.length > 0, `${list.length} groups`);
  const group = list[0];
  const gid = group?.id ?? group?._id;
  if (!gid) throw new Error('no group id in response');

  const balances = await call('GET', `/groups/${gid}/balances`, { token });
  const netSum = (balances.json?.data?.balances ?? balances.json?.data ?? []).reduce(
    (sum, row) => sum + (row.netMinor ?? row.net ?? 0),
    0,
  );
  record('GET /groups/:id/balances', balances.status === 200, `status ${balances.status}`);
  record('ledger nets to zero', netSum === 0, `Σ net = ${netSum} minor units`);

  const expenses = await call('GET', `/expenses?groupId=${gid}`, { token });
  record('GET /expenses?groupId=:id', expenses.status === 200, `status ${expenses.status}`);

  const settlements = await call('GET', `/groups/${gid}/settlements`, { token });
  record('GET /groups/:id/settlements', settlements.status === 200, `status ${settlements.status}`);

  const suggested = await call('GET', `/groups/${gid}/settlements/suggested`, { token });
  const plan = suggested.json?.data ?? {};
  record(
    'GET /groups/:id/settlements/suggested',
    suggested.status === 200,
    `${plan.transactions?.length ?? 0} optimised vs ${plan.naiveTransactionCount ?? '?'} naive`,
  );

  const summary = await call('GET', '/me/summary', { token });
  record('GET /me/summary', summary.status === 200, `status ${summary.status}`);

  for (const path of ['/meta/categories', '/meta/split-types', '/notifications', '/analytics/dashboard']) {
    const res = await call('GET', path, { token });
    record(`GET ${path}`, res.status === 200, `status ${res.status}`);
  }

  const forbidden = await call('GET', '/groups', { token: 'not.a.real.token' });
  record('rejected invalid token', forbidden.status === 401, `status ${forbidden.status}`);
}

main()
  .catch((error) => {
    record('smoke run', false, error.message);
  })
  .finally(async () => {
    server?.kill();
    await replSet?.stop();
    const failed = results.filter((result) => !result.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log(`Failed: ${failed.map((result) => result.name).join(', ')}`);
      process.exit(1);
    }
    process.exit(0);
  });
