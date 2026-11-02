'use strict';

/**
 * Socket.IO hub. Services emit through this module instead of reaching for `req.io`,
 * which keeps controllers free of transport concerns and avoids import cycles.
 */

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../middleware/authMiddleware');
const Group = require('../models/Group');

let io = null;
const online = new Map(); // userId -> Set<socketId>

const userRoom = (userId) => `user:${userId}`;
const groupRoom = (groupId) => `group:${groupId}`;

function attachSocket(server) {
  io = new Server(server, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      return next();
    } catch {
      return next(new Error('Unauthenticated socket'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    socket.join(userRoom(userId));
    if (!online.has(userId)) online.set(userId, new Set());
    online.get(userId).add(socket.id);

    // Join every room the user belongs to, so group events reach them without a subscribe.
    try {
      const groups = await Group.find({
        'members.userId': userId,
        'members.status': 'active',
      }).select('members');
      for (const group of groups) {
        if (group.isMember(userId)) socket.join(groupRoom(group._id));
      }
    } catch {
      // A failed room sync must not drop the connection; the client re-subscribes explicitly.
    }

    socket.on('group:subscribe', async (groupId, ack) => {
      try {
        const group = await Group.findById(groupId).select('members');
        if (!group || !group.isMember(userId)) throw new Error('Not a member');
        socket.join(groupRoom(groupId));
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error.message });
      }
    });

    socket.on('group:unsubscribe', (groupId) => socket.leave(groupRoom(groupId)));

    socket.on('disconnect', () => {
      const sockets = online.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (!sockets.size) {
          online.delete(userId);
          io?.emit('presence:updated', { userId, online: false });
        }
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return false;
  io.to(userRoom(userId)).emit(event, payload);
  return true;
}

function emitToGroup(groupId, event, payload) {
  if (!io) return false;
  io.to(groupRoom(groupId)).emit(event, payload);
  return true;
}

function isOnline(userId) {
  return online.has(String(userId));
}

function onlineUserIds() {
  return [...online.keys()];
}

module.exports = { attachSocket, getIO, emitToUser, emitToGroup, isOnline, onlineUserIds, userRoom, groupRoom };
