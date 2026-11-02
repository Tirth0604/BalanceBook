import { io } from 'socket.io-client'

/**
 * Socket.io singleton — auth-aware, auto-reconnecting.
 * The access token authorises the handshake via `{ auth: { token } }` (docs/03).
 * Socket events only trigger cache invalidations — never literal amounts.
 */

let socket = null
let connectedToken = null
const subscribedRooms = new Set()
const url = import.meta.env.VITE_SOCKET_URL || undefined // same-origin; Vite proxies /socket.io

function rejoinRooms() {
  if (!socket) return
  subscribedRooms.forEach((groupId) => socket.emit('group:subscribe', { groupId }))
}

export function connect(token) {
  if (!token) return null
  if (socket && connectedToken === token) return socket
  disconnect()
  connectedToken = token
  socket = io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    withCredentials: true,
  })
  socket.on('connect', rejoinRooms)
  return socket
}

export function disconnect() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    connectedToken = null
  }
  subscribedRooms.clear()
}

export function getSocket() {
  return socket
}

/** on(event, handler) → returns an unsubscribe function (auto-cleanup helper). */
export function on(event, handler) {
  const s = socket
  if (!s) return () => {}
  s.on(event, handler)
  return () => {
    s.off(event, handler)
  }
}

export function subscribeGroup(groupId) {
  if (!groupId) return
  subscribedRooms.add(String(groupId))
  if (socket?.connected) socket.emit('group:subscribe', { groupId })
  else socket?.on('connect', () => socket.emit('group:subscribe', { groupId }))
}

export function unsubscribeGroup(groupId) {
  if (!groupId) return
  subscribedRooms.delete(String(groupId))
  socket?.emit('group:unsubscribe', { groupId })
}
