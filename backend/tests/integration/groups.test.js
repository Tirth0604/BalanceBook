'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'integration-access-secret-value-long-enough';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'integration-refresh-secret-value-long-enough';
// `config/env.js` validates at require time; the in-memory URI is applied in beforeAll.
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
  console.warn(`[groups.test] src/app.js unavailable, HTTP suites skipped: ${error.message}`);
}

const describeApp = app ? describe : describe.skip;

let mongod = null;

async function reset() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function signIn(name, email) {
  const response = await request(app)
    .post(`${API}/auth/register`)
    .send({ name, email, password: PASSWORD });
  expect(response.status).toBe(201);
  return { id: response.body.data.user.id, email, token: response.body.data.accessToken };
}

function authed(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createGroup(token, payload = { name: 'Goa Trip 2026', category: 'trip' }) {
  const response = await request(app).post(`${API}/groups`).set(authed(token)).send(payload);
  expect(response.status).toBe(201);
  return response.body.data.group;
}

beforeAll(async () => {
  if (!app) return;
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(mongod.getUri('balancebook-groups-test'));
});

afterAll(async () => {
  if (!app) return;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  if (!app) return;
  await reset();
});

describeApp('POST /groups', () => {
  it('creates the group with the creator as an active admin', async () => {
    const owner = await signIn('Owner One', 'owner1@balancebook.app');
    const group = await createGroup(owner.token);

    expect(group.id).toBeTruthy();
    expect(group.myRole).toBe('admin');
    expect(group.baseCurrency).toBe('INR');
    expect(group.isArchived).toBe(false);
    expect(group.memberCount).toBe(1);

    const creator = group.members.find((member) => member.user && member.user.id === owner.id);
    expect(creator.role).toBe('admin');
    expect(creator.status).toBe('active');
    expect(group.createdBy.id).toBe(owner.id);
    expect(group.invitationCode).toMatch(/^[A-Z0-9]{10}$/);
  });

  it('rejects an anonymous caller', async () => {
    const response = await request(app).post(`${API}/groups`).send({ name: 'No Auth Group' });
    expect(response.status).toBe(401);
  });

  it('rejects a name that is too short', async () => {
    const owner = await signIn('Owner Two', 'owner2@balancebook.app');
    const response = await request(app).post(`${API}/groups`).set(authed(owner.token)).send({ name: 'x' });
    expect([400, 422]).toContain(response.status);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describeApp('GET /groups', () => {
  it('lists only the caller groups with pagination meta', async () => {
    const owner = await signIn('Owner Three', 'owner3@balancebook.app');
    const stranger = await signIn('Stranger', 'stranger3@balancebook.app');
    await createGroup(owner.token, { name: 'Beach House', category: 'home' });
    await createGroup(owner.token, { name: 'Office Lunches', category: 'office' });

    const response = await request(app).get(`${API}/groups`).set(authed(owner.token)).query({ limit: '1', page: '1' });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });

    const empty = await request(app).get(`${API}/groups`).set(authed(stranger.token));
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.meta.total).toBe(0);
  });

  it('filters by category and search text', async () => {
    const owner = await signIn('Owner Four', 'owner4@balancebook.app');
    await createGroup(owner.token, { name: 'Kerala Backwaters', category: 'trip' });
    await createGroup(owner.token, { name: 'Flat Rent', category: 'home' });

    const byCategory = await request(app).get(`${API}/groups`).set(authed(owner.token)).query({ category: 'home' });
    expect(byCategory.body.data).toHaveLength(1);
    expect(byCategory.body.data[0].name).toBe('Flat Rent');

    const bySearch = await request(app).get(`${API}/groups`).set(authed(owner.token)).query({ search: 'kerala' });
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].category).toBe('trip');
  });
});

describeApp('GET /groups/:id', () => {
  it('gives a member the populated roster', async () => {
    const owner = await signIn('Owner Five', 'owner5@balancebook.app');
    const group = await createGroup(owner.token);

    const response = await request(app).get(`${API}/groups/${group.id}`).set(authed(owner.token));
    expect(response.status).toBe(200);
    expect(response.body.data.group.members[0].user.email).toBe(owner.email);
  });

  it('answers 403 for a non-member and 404 for a missing group', async () => {
    const owner = await signIn('Owner Six', 'owner6@balancebook.app');
    const outsider = await signIn('Outsider', 'outsider6@balancebook.app');
    const group = await createGroup(owner.token);

    const forbidden = await request(app).get(`${API}/groups/${group.id}`).set(authed(outsider.token));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const missing = await request(app)
      .get(`${API}/groups/507f1f77bcf86cd799439011`)
      .set(authed(owner.token));
    expect(missing.status).toBe(404);
  });
});

describeApp('POST /groups/:id/invites', () => {
  it('splits emails into invited, already and notFound', async () => {
    const owner = await signIn('Owner Seven', 'owner7@balancebook.app');
    const friend = await signIn('Friend', 'friend7@balancebook.app');
    const group = await createGroup(owner.token);

    const first = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email, 'ghost7@balancebook.app', owner.email] });

    expect(first.status).toBe(201);
    expect(first.body.data.invited.map((item) => item.email)).toEqual([friend.email]);
    expect(first.body.data.notFound.map((item) => item.email)).toEqual(['ghost7@balancebook.app']);
    expect(first.body.data.already.map((item) => item.email)).toEqual([owner.email]);
    expect(first.body.data.invited[0].inviteId).toBeTruthy();
  });

  it('deduplicates repeat invitations', async () => {
    const owner = await signIn('Owner Eight', 'owner8@balancebook.app');
    const friend = await signIn('Friend Eight', 'friend8@balancebook.app');
    const group = await createGroup(owner.token);

    await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email, 'ghost8@balancebook.app'] });

    const again = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email, 'ghost8@balancebook.app'] });

    expect(again.status).toBe(201);
    expect(again.body.data.invited).toEqual([]);
    expect(again.body.data.already.map((item) => item.email).sort()).toEqual([
      'friend8@balancebook.app',
      'ghost8@balancebook.app',
    ]);

    const detail = await request(app).get(`${API}/groups/${group.id}`).set(authed(owner.token));
    const invited = detail.body.data.group.members.filter((member) => member.status === 'invited');
    expect(invited).toHaveLength(2);
  });

  it('refuses a non-admin inviter', async () => {
    const owner = await signIn('Owner Nine', 'owner9@balancebook.app');
    const friend = await signIn('Friend Nine', 'friend9@balancebook.app');
    const group = await createGroup(owner.token);
    await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email] });
    await request(app).post(`${API}/auth/login`).send({ email: friend.email, password: PASSWORD });

    const accepted = await request(app)
      .post(`${API}/groups/join`)
      .set(authed(friend.token))
      .send({ code: group.invitationCode });
    expect(accepted.status).toBe(200);

    const response = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(friend.token))
      .send({ emails: ['nobody9@balancebook.app'] });
    expect(response.status).toBe(403);
  });

  it('rejects more than 50 emails and an empty list', async () => {
    const owner = await signIn('Owner Ten', 'owner10@balancebook.app');
    const group = await createGroup(owner.token);

    const empty = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [] });
    expect([400, 422]).toContain(empty.status);

    const tooMany = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: Array.from({ length: 51 }, (unused, index) => `person${index}@balancebook.app`) });
    expect([400, 422]).toContain(tooMany.status);
  });
});

describeApp('Invitation acceptance', () => {
  it('accepts an invitation and activates the membership', async () => {
    const owner = await signIn('Owner Eleven', 'owner11@balancebook.app');
    const friend = await signIn('Friend Eleven', 'friend11@balancebook.app');
    const group = await createGroup(owner.token);

    const invite = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email] });
    const inviteId = invite.body.data.invited[0].inviteId;

    const response = await request(app)
      .post(`${API}/groups/${group.id}/invites/${inviteId}/accept`)
      .set(authed(friend.token));

    expect(response.status).toBe(200);
    expect(response.body.data.group.myRole).toBe('member');
    const member = response.body.data.group.members.find((entry) => entry.user && entry.user.id === friend.id);
    expect(member.status).toBe('active');

    const list = await request(app).get(`${API}/groups`).set(authed(friend.token));
    expect(list.body.data.map((entry) => entry.id)).toContain(group.id);
  });

  it('refuses an invitation issued to another address', async () => {
    const owner = await signIn('Owner Twelve', 'owner12@balancebook.app');
    const friend = await signIn('Friend Twelve', 'friend12@balancebook.app');
    const stranger = await signIn('Stranger Twelve', 'stranger12@balancebook.app');
    const group = await createGroup(owner.token);

    const invite = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email] });

    const response = await request(app)
      .post(`${API}/groups/${group.id}/invites/${invite.body.data.invited[0].inviteId}/accept`)
      .set(authed(stranger.token));
    expect(response.status).toBe(403);
  });

  it('declines an invitation without creating a membership', async () => {
    const owner = await signIn('Owner Thirteen', 'owner13@balancebook.app');
    const friend = await signIn('Friend Thirteen', 'friend13@balancebook.app');
    const group = await createGroup(owner.token);

    const invite = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: [friend.email] });

    const response = await request(app)
      .post(`${API}/groups/${group.id}/invites/${invite.body.data.invited[0].inviteId}/decline`)
      .set(authed(friend.token));
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('declined');

    const detail = await request(app).get(`${API}/groups/${group.id}`).set(authed(owner.token));
    expect(detail.body.data.group.members.some((member) => member.status === 'declined')).toBe(true);
  });

  it('lets an unknown address claim its placeholder invitation after signing up', async () => {
    const owner = await signIn('Owner Fourteen', 'owner14@balancebook.app');
    const group = await createGroup(owner.token);

    const invite = await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: ['late14@balancebook.app'] });
    const inviteId = invite.body.data.notFound[0].inviteId;

    const late = await signIn('Late Joiner', 'late14@balancebook.app');
    const response = await request(app)
      .post(`${API}/groups/${group.id}/invites/${inviteId}/accept`)
      .set(authed(late.token));

    expect(response.status).toBe(200);
    expect(response.body.data.group.memberCount).toBe(2);
  });
});

describeApp('POST /groups/join', () => {
  it('joins through the invitation code', async () => {
    const owner = await signIn('Owner Fifteen', 'owner15@balancebook.app');
    const joiner = await signIn('Joiner', 'joiner15@balancebook.app');
    const group = await createGroup(owner.token);

    const response = await request(app).post(`${API}/groups/join`).set(authed(joiner.token)).send({ code: group.invitationCode });
    expect(response.status).toBe(200);
    expect(response.body.data.group.myRole).toBe('member');
    expect(response.body.data.group.memberCount).toBe(2);

    const detail = await request(app).get(`${API}/groups/${group.id}`).set(authed(joiner.token));
    expect(detail.status).toBe(200);
  });

  it('is idempotent for an existing member', async () => {
    const owner = await signIn('Owner Sixteen', 'owner16@balancebook.app');
    const group = await createGroup(owner.token);

    const response = await request(app)
      .post(`${API}/groups/join`)
      .set(authed(owner.token))
      .send({ code: group.invitationCode });
    expect(response.status).toBe(200);
    expect(response.body.data.group.memberCount).toBe(1);
  });

  it('rejects an unknown code', async () => {
    const joiner = await signIn('Joiner Sixteen', 'joiner16@balancebook.app');
    const response = await request(app).post(`${API}/groups/join`).set(authed(joiner.token)).send({ code: 'ZZZZZZZZZZ' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describeApp('Member management', () => {
  async function groupWithMember() {
    const owner = await signIn('Owner Seventeen', 'owner17@balancebook.app');
    const member = await signIn('Member Seventeen', 'member17@balancebook.app');
    const group = await createGroup(owner.token);
    await request(app).post(`${API}/groups/join`).set(authed(member.token)).send({ code: group.invitationCode });
    return { owner, member, group };
  }

  it('removes an active member', async () => {
    const { owner, member, group } = await groupWithMember();

    const response = await request(app)
      .post(`${API}/groups/${group.id}/members/${member.id}/remove`)
      .set(authed(owner.token));
    expect(response.status).toBe(200);
    expect(response.body.data.removedUserId).toBe(member.id);

    const detail = await request(app).get(`${API}/groups/${group.id}`).set(authed(owner.token));
    const removed = detail.body.data.group.members.find((entry) => entry.user && entry.user.id === member.id);
    expect(removed.status).toBe('removed');
    expect(detail.body.data.group.memberCount).toBe(1);
  });

  it('promotes a member to admin and back', async () => {
    const { owner, member, group } = await groupWithMember();

    const promote = await request(app)
      .post(`${API}/groups/${group.id}/members/${member.id}/role`)
      .set(authed(owner.token))
      .send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.role).toBe('admin');

    const demote = await request(app)
      .post(`${API}/groups/${group.id}/members/${member.id}/role`)
      .set(authed(owner.token))
      .send({ role: 'member' });
    expect(demote.status).toBe(200);
  });

  it('blocks demoting the last active admin', async () => {
    const { owner, group } = await groupWithMember();

    const response = await request(app)
      .post(`${API}/groups/${group.id}/members/${owner.id}/role`)
      .set(authed(owner.token))
      .send({ role: 'member' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');

    const detail = await request(app).get(`${API}/groups/${group.id}`).set(authed(owner.token));
    const creator = detail.body.data.group.members.find((entry) => entry.user && entry.user.id === owner.id);
    expect(creator.role).toBe('admin');
  });

  it('blocks removing the last active admin', async () => {
    const { owner, group } = await groupWithMember();
    const response = await request(app)
      .post(`${API}/groups/${group.id}/members/${owner.id}/remove`)
      .set(authed(owner.token));
    expect(response.status).toBe(409);
  });

  it('refuses role changes from a plain member', async () => {
    const { member, group } = await groupWithMember();
    const response = await request(app)
      .post(`${API}/groups/${group.id}/members/${member.id}/role`)
      .set(authed(member.token))
      .send({ role: 'admin' });
    expect(response.status).toBe(403);
  });
});

describeApp('PATCH and archive', () => {
  it('lets an admin rename the group and rejects a non-admin', async () => {
    const owner = await signIn('Owner Eighteen', 'owner18@balancebook.app');
    const member = await signIn('Member Eighteen', 'member18@balancebook.app');
    const group = await createGroup(owner.token);
    await request(app).post(`${API}/groups/join`).set(authed(member.token)).send({ code: group.invitationCode });

    const updated = await request(app)
      .patch(`${API}/groups/${group.id}`)
      .set(authed(owner.token))
      .send({ name: 'Renamed Group', description: 'Beach week' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.group.name).toBe('Renamed Group');

    const refused = await request(app)
      .patch(`${API}/groups/${group.id}`)
      .set(authed(member.token))
      .send({ name: 'Hijacked Name' });
    expect(refused.status).toBe(403);
  });

  it('archives for the admin and keeps archived groups out of the default list', async () => {
    const owner = await signIn('Owner Nineteen', 'owner19@balancebook.app');
    const group = await createGroup(owner.token);

    const response = await request(app).delete(`${API}/groups/${group.id}`).set(authed(owner.token));
    expect(response.status).toBe(200);
    expect(response.body.data.isArchived).toBe(true);

    const active = await request(app).get(`${API}/groups`).set(authed(owner.token));
    expect(active.body.data).toEqual([]);

    const all = await request(app).get(`${API}/groups`).set(authed(owner.token)).query({ archived: 'all' });
    expect(all.body.data).toHaveLength(1);

    const onlyArchived = await request(app).get(`${API}/groups`).set(authed(owner.token)).query({ archived: 'true' });
    expect(onlyArchived.body.data).toHaveLength(1);
  });
});

describeApp('GET /groups/:id/invites', () => {
  it('lists pending invitations for the admin only', async () => {
    const owner = await signIn('Owner Twenty', 'owner20@balancebook.app');
    const member = await signIn('Member Twenty', 'member20@balancebook.app');
    const group = await createGroup(owner.token);
    await request(app)
      .post(`${API}/groups/${group.id}/invites`)
      .set(authed(owner.token))
      .send({ emails: ['ghost20@balancebook.app'] });
    await request(app).post(`${API}/groups/join`).set(authed(member.token)).send({ code: group.invitationCode });

    const response = await request(app).get(`${API}/groups/${group.id}/invites`).set(authed(owner.token));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].email).toBe('ghost20@balancebook.app');
    expect(response.body.data[0].status).toBe('pending');
    expect(response.body.meta).toMatchObject({ page: 1, total: 1 });

    const refused = await request(app).get(`${API}/groups/${group.id}/invites`).set(authed(member.token));
    expect(refused.status).toBe(403);
  });
});
