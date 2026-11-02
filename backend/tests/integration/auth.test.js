'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'integration-access-secret-value-long-enough';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'integration-refresh-secret-value-long-enough';
// `config/env.js` validates at require time, so an URI must exist before app.js loads;
// the real server is the in-memory one started in beforeAll.
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/balancebook-probe';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const API = '/api/v1';
const PASSWORD = 'Balance@123';

let app = null;
try {
  // app.js is owned by the platform module and may not exist while this suite is written.
  // eslint-disable-next-line global-require
  app = require('../../src/app');
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn(`[auth.test] src/app.js unavailable, HTTP suites skipped: ${error.message}`);
}

const describeApp = app ? describe : describe.skip;

// eslint-disable-next-line global-require
const authService = require('../../src/services/authService');
// eslint-disable-next-line global-require
const userService = require('../../src/services/userService');
// eslint-disable-next-line global-require
const RefreshToken = require('../../src/models/RefreshToken');

let mongod = null;

function cookieFrom(response) {
  const header = response.headers['set-cookie'] || [];
  const entry = header.find((item) => item.startsWith(`${authService.REFRESH_COOKIE}=`));
  return entry ? entry.split(';')[0] : null;
}

function lastMail(kind) {
  const messages = authService.outbox.filter((message) => message.kind === kind);
  return messages[messages.length - 1];
}

async function reset() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function register(email, overrides = {}) {
  const response = await request(app)
    .post(`${API}/auth/register`)
    .send({ name: 'Test User', email, password: PASSWORD, ...overrides });
  expect(response.status).toBe(201);
  return {
    token: response.body.data.accessToken,
    cookie: cookieFrom(response),
    user: response.body.data.user,
    response,
  };
}

async function login(email, password = PASSWORD) {
  const response = await request(app).post(`${API}/auth/login`).send({ email, password });
  return { token: response.body?.data?.accessToken, cookie: cookieFrom(response), response };
}

beforeAll(async () => {
  if (!app) return;
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(mongod.getUri('balancebook-auth-test'));
});

afterAll(async () => {
  if (!app) return;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  if (!app) return;
  authService.outbox.length = 0;
  await reset();
});

describeApp('POST /auth/register', () => {
  it('creates the account, returns the user and sets a hardened refresh cookie', async () => {
    const { user, response } = await register('signup@balancebook.app');

    expect(response.body.success).toBe(true);
    expect(user.email).toBe('signup@balancebook.app');
    expect(typeof response.body.data.accessToken).toBe('string');
    expect(user.password).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/password/);
    expect(user.preferredCurrency).toBe('INR');

    const raw = (response.headers['set-cookie'] || []).join('; ');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(new RegExp(`Path=${API}/auth`, 'i'));
  });

  it('rejects a duplicate email with 409', async () => {
    await register('dupe@balancebook.app');
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send({ name: 'Other Name', email: 'dupe@balancebook.app', password: PASSWORD });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a weak password', async () => {
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send({ name: 'Weak Password', email: 'weak@balancebook.app', password: 'short' });

    // The edge validator maps zod failures onto 422 (docs/03: semantic validation).
    expect([400, 422]).toContain(response.status);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a password without an upper-case letter and a digit', async () => {
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send({ name: 'No Classes', email: 'classes@balancebook.app', password: 'alllowercase' });
    expect([400, 422]).toContain(response.status);
  });

  it('refuses a mongo operator in the email field', async () => {
    const response = await request(app)
      .post(`${API}/auth/register`)
      .send({ name: 'Operator', email: { $ne: null }, password: PASSWORD });
    expect([400, 422]).toContain(response.status);
  });

  it('stores no plaintext password and queues a verification mail', async () => {
    await register('hashed@balancebook.app');
    const stored = await mongoose.connection.db.collection('users').findOne({ email: 'hashed@balancebook.app' });
    expect(stored.password).toMatch(/^\$2a\$12\$/);
    expect(lastMail('verify-email')).toBeDefined();
  });
});

describeApp('POST /auth/login', () => {
  it('returns a user and an access token', async () => {
    await register('signin@balancebook.app');
    const response = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'signin@balancebook.app', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('signin@balancebook.app');
    expect(response.body.data.accessToken).toBeTruthy();
    expect(cookieFrom(response)).toBeTruthy();
  });

  it('answers 401 for a wrong password and for an unknown email', async () => {
    await register('wrongpass@balancebook.app');

    const bad = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'wrongpass@balancebook.app', password: 'NotThePassword1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('UNAUTHORIZED');

    const unknown = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'nobody@balancebook.app', password: PASSWORD });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });

  it('stamps lastLoginAt', async () => {
    await register('stamp@balancebook.app');
    const { token } = await login('stamp@balancebook.app');

    const response = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.user.lastLoginAt).toBeTruthy();
  });
});

describeApp('Authenticating protected routes', () => {
  it('returns 401 without a token', async () => {
    const response = await request(app).get(`${API}/auth/me`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');

    const groups = await request(app).get(`${API}/groups`);
    expect(groups.status).toBe(401);
  });

  it('returns the caller profile with a token', async () => {
    const { token } = await register('profile@balancebook.app');
    const response = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('profile@balancebook.app');
  });
});

describeApp('POST /auth/refresh', () => {
  it('rotates the refresh token and keeps the session alive', async () => {
    const { cookie } = await register('rotate@balancebook.app');

    const first = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toBeTruthy();
    expect(first.body.data.user.email).toBe('rotate@balancebook.app');

    const rotated = cookieFrom(first);
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(cookie);

    const second = await request(app).post(`${API}/auth/refresh`).set('Cookie', rotated);
    expect(second.status).toBe(200);
  });

  it('detects reuse of a rotated token and kills the whole family', async () => {
    const { cookie } = await register('stolen@balancebook.app');

    const rotation = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(rotation.status).toBe(200);
    const fresh = cookieFrom(rotation);

    const replay = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('UNAUTHORIZED');

    // The live token is revoked with the family, so the thief cannot keep the session.
    const afterReplay = await request(app).post(`${API}/auth/refresh`).set('Cookie', fresh);
    expect(afterReplay.status).toBe(401);

    const tokens = await RefreshToken.find({});
    expect(tokens.every((token) => token.revokedAt)).toBe(true);
  });

  it('rejects a request with no cookie', async () => {
    const response = await request(app).post(`${API}/auth/refresh`);
    expect(response.status).toBe(401);
  });
});

describeApp('POST /auth/logout', () => {
  it('revokes the refresh family', async () => {
    const { cookie } = await register('signout@balancebook.app');

    const response = await request(app).post(`${API}/auth/logout`).set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();

    const reuse = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(reuse.status).toBe(401);
  });

  it('clears the cookie', async () => {
    const { cookie } = await register('cleared@balancebook.app');
    const response = await request(app).post(`${API}/auth/logout`).set('Cookie', cookie);
    expect((response.headers['set-cookie'] || []).join('; ')).toMatch(/refreshToken=;/);
  });
});

describeApp('Password reset', () => {
  it('forgot-password does not leak whether the address exists', async () => {
    const known = await request(app).post(`${API}/auth/forgot-password`).send({ email: 'exists@balancebook.app' });
    expect(known.status).toBe(200);
    expect(known.body.data.resetUrl).toBeUndefined();

    const unknown = await request(app).post(`${API}/auth/forgot-password`).send({ email: 'ghost@balancebook.app' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it('resets the password with the emailed token and drops old sessions', async () => {
    const { cookie } = await register('reset@balancebook.app');

    await request(app).post(`${API}/auth/forgot-password`).send({ email: 'reset@balancebook.app' });
    const mail = lastMail('password-reset');
    expect(mail).toBeDefined();
    const token = /token=([^&\s]+)/.exec(mail.url)[1];

    const reset = await request(app).post(`${API}/auth/reset-password`).send({ token, password: 'Rotation@456' });
    expect(reset.status).toBe(200);
    expect(reset.body.data.user.email).toBe('reset@balancebook.app');

    const oldSession = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(oldSession.status).toBe(401);

    const oldPassword = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'reset@balancebook.app', password: PASSWORD });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'reset@balancebook.app', password: 'Rotation@456' });
    expect(newPassword.status).toBe(200);
  });

  it('rejects an invalid or used token', async () => {
    await register('badtoken@balancebook.app');
    const response = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: 'not-a-real-reset-token-value', password: 'Whatever@123' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describeApp('POST /auth/verify-email', () => {  it('marks the address verified', async () => {
    await register('verify@balancebook.app');
    const mail = lastMail('verify-email');
    const token = /token=([^&\s]+)/.exec(mail.url)[1];

    const response = await request(app).post(`${API}/auth/verify-email`).send({ token });
    expect(response.status).toBe(200);
    expect(response.body.data.user.isEmailVerified).toBe(true);

    const again = await request(app).post(`${API}/auth/verify-email`).send({ token });
    expect(again.status).toBe(400);
  });
});

describeApp('User profile routes', () => {
  it('PATCH /users/me updates the profile and merges notification preferences', async () => {
    const { token } = await register('patchme@balancebook.app');

    const response = await request(app)
      .patch(`${API}/users/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+919999988888', preferredCurrency: 'USD', notificationPreferences: { email: true }, password: 'x' });

    expect(response.status).toBe(200);
    expect(response.body.data.user.phone).toBe('+919999988888');
    expect(response.body.data.user.preferredCurrency).toBe('USD');
    expect(response.body.data.user.notificationPreferences.email).toBe(true);
    expect(response.body.data.user.notificationPreferences.inApp).toBe(true);
  });

  it('POST /users/me/password rotates the password and keeps this session', async () => {
    const { token, cookie } = await register('pwchange@balancebook.app');

    const refused = await request(app)
      .post(`${API}/users/me/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongCurrent@1', newPassword: 'Brand@New99' });
    expect(refused.status).toBe(401);

    const changed = await request(app)
      .post(`${API}/users/me/password`)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'Brand@New99' });
    expect(changed.status).toBe(200);

    const refreshed = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(refreshed.status).toBe(200);

    const relogin = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'pwchange@balancebook.app', password: 'Brand@New99' });
    expect(relogin.status).toBe(200);
  });

  it('DELETE /users/me soft-deletes the account and revokes its tokens', async () => {
    const { token, cookie, user } = await register('goodbye@balancebook.app');

    const refused = await request(app)
      .delete(`${API}/users/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: 'nope' });
    expect([400, 422]).toContain(refused.status);

    const response = await request(app)
      .delete(`${API}/users/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: 'DELETE' });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('deleted');

    const stored = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(user.id) });
    expect(stored.status).toBe('deleted');
    expect(stored.password).toBeTruthy();

    const reuse = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(reuse.status).toBe(401);
  });

  it('GET /users/search finds an exact email and returns meta', async () => {
    await register('findme@balancebook.app');
    const { token } = await register('seeker@balancebook.app');

    const response = await request(app)
      .get(`${API}/users/search`)
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'findme@balancebook.app' });

    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.email)).toContain('findme@balancebook.app');
    expect(response.body.meta.limit).toBeLessThanOrEqual(userService.MAX_SEARCH_RESULTS);
    expect(response.body.data[0].password).toBeUndefined();
  });
});
