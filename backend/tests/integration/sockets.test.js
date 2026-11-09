'use strict';

// Standalone in-memory mongod; the env switch runs every write session-less
// (same supported fallback the other integration suites use).
process.env.USE_TRANSACTIONS = 'false';

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const { attachSocket, getIO, userRoom, groupRoom } = require('../../src/sockets/hub');
const { notify, broadcastGroup } = require('../../src/services/notificationService');
const { signAccessToken } = require('../../src/middleware/authMiddleware');

let mongoServer;
let server;
let baseUrl;
let alice;
let bob;
let outsider;
let trip;

function connectClient(token) {
  const socket = ioClient(baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
  });
  return socket;
}

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const fail = (err) => reject(new Error(`connect error: ${err.message}`));
    socket.once(event, resolve);
    socket.once('connect_error', fail);
  });
}

async function connected(token) {
  const socket = connectClient(token);
  await once(socket, 'connect');
  return socket;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDatabase(mongoServer.getUri());

  [alice, bob, outsider] = await Promise.all([
    User.create({ name: 'Alice Patel', email: 'alice@example.com', password: 'TestPass123!' }),
    User.create({ name: 'Bob Rao', email: 'bob@example.com', password: 'TestPass123!' }),
    User.create({ name: 'Sam X', email: 'sam@example.com', password: 'TestPass123!' }),
  ]);

  trip = await Group.create({
    name: 'Goa Trip',
    createdBy: alice._id,
    members: [
      { userId: alice._id, role: 'admin', status: 'active' },
      { userId: bob._id, role: 'member', status: 'active' },
    ],
  });

  server = http.createServer(app);
  attachSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
  if (mongoServer) await mongoServer.stop();
});

describe('socket hub handshake and rooms', () => {
  test('rejects a socket without a valid access token', async () => {
    await expect(connected('not-a-jwt')).rejects.toThrow(/Unauthenticated socket/);
  });

  test('authed socket joins user:<id> and every group:<id> room of active memberships', async () => {
    const socket = await connected(signAccessToken(alice));
    try {
      const sockets = await getIO().fetchSockets();
      const mine = sockets.find((s) => s.id === socket.id);
      expect(mine.rooms.has(userRoom(String(alice._id)))).toBe(true);
      expect(mine.rooms.has(groupRoom(String(trip._id)))).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  test('group:subscribe accepts the client envelope { groupId } for members', async () => {
    const socket = await connected(signAccessToken(bob));
    try {
      const ack = await new Promise((resolve) => socket.emit('group:subscribe', { groupId: String(trip._id) }, resolve));
      expect(ack).toEqual({ ok: true });
      const sockets = await getIO().fetchSockets();
      const mine = sockets.find((s) => s.id === socket.id);
      expect(mine.rooms.has(groupRoom(String(trip._id)))).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  test('group:subscribe refuses non-members', async () => {
    const socket = await connected(signAccessToken(outsider));
    try {
      const ack = await new Promise((resolve) => socket.emit('group:subscribe', { groupId: String(trip._id) }, resolve));
      expect(ack.ok).toBe(false);
    } finally {
      socket.disconnect();
    }
  });
});

describe('event payloads delivered to rooms', () => {
  test('notification:new reaches the recipient user room with id (never _id) on the wire', async () => {
    const socket = await connected(signAccessToken(alice));
    try {
      const received = once(socket, 'notification:new');
      await notify({
        userIds: [String(alice._id)],
        groupId: String(trip._id),
        type: 'settlement_requested',
        title: 'Settlement requested',
        body: 'Bob requests ₹500.00',
        payload: { settlementId: 'abc123', groupId: String(trip._id) },
      });
      const wire = await received;
      expect(typeof wire.id).toBe('string');
      expect(wire._id).toBeUndefined();
      expect(wire.type).toBe('settlement_requested');
      expect(wire.payload.groupId).toBe(String(trip._id));
    } finally {
      socket.disconnect();
    }
  });

  test('expense:created broadcasts to the group room and emits the balance:changed companion', async () => {
    const [a, b, out] = await Promise.all([
      connected(signAccessToken(alice)),
      connected(signAccessToken(bob)),
      connected(signAccessToken(outsider)),
    ]);
    try {
      const eventsA = [];
      const eventsOut = [];
      for (const ev of ['expense:created', 'balance:changed']) {
        a.on(ev, (p) => eventsA.push([ev, p]));
        out.on(ev, (p) => eventsOut.push([ev, p]));
      }
      broadcastGroup(String(trip._id), 'expense:created', {
        expenseId: 'e1',
        groupId: String(trip._id),
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(eventsA.map((e) => e[0])).toEqual(expect.arrayContaining(['expense:created', 'balance:changed']));
      const companion = eventsA.find((e) => e[0] === 'balance:changed');
      expect(companion[1]).toEqual({ groupId: String(trip._id) });
      expect(eventsOut).toHaveLength(0);
    } finally {
      a.disconnect();
      b.disconnect();
      out.disconnect();
    }
  });

  test('settlement confirmation still drives balance:changed through broadcastGroup', async () => {
    const socket = await connected(signAccessToken(bob));
    try {
      const received = once(socket, 'balance:changed');
      broadcastGroup(String(trip._id), 'balance:changed', { groupId: String(trip._id) });
      await received;
    } finally {
      socket.disconnect();
    }
  });
});
