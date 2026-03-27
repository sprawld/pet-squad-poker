/**
 * @typedef {{ displayName: string, seed: string }} ParticipantEntry
 * @typedef {import('socket.io').Server} IoServer
 * @typedef {import('socket.io').Socket} IoSocket
 */

/** @type {number} */
const MAX_ROOM_NAME_LEN = 128;
/** @type {number} */
const MAX_DISPLAY_NAME_LEN = 64;
/** @type {number} */
const MAX_SEED_LEN = 128;

/** Room id → socket id → participant data (single source of truth). @type {Map<string, Map<string, ParticipantEntry>>} */
const roomParticipants = new Map();

/**
 * @param {unknown} value
 * @param {number} maxLen
 * @returns {string | null}
 */
function nonEmptyString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s === '' || s.length > maxLen) return null;
  return s;
}

/**
 * @param {IoServer} io
 * @param {string} roomId
 */
function emitRoomState(io, roomId) {
  const map = roomParticipants.get(roomId);
  const participants = [];
  if (map) {
    for (const [socketId, { displayName, seed }] of map) {
      participants.push({ socketId, displayName, seed });
    }
  }
  io.to(roomId).emit('room:state', { participants });
}

/**
 * @param {IoServer} io
 * @param {IoSocket} socket
 * @param {string} roomId
 */
function removeSocketFromRoom(io, socket, roomId) {
  const map = roomParticipants.get(roomId);
  if (!map) return;
  map.delete(socket.id);
  if (map.size === 0) roomParticipants.delete(roomId);
  emitRoomState(io, roomId);
}

/**
 * @param {IoServer} io
 * @param {IoSocket} socket
 * @param {string} prevRoomId
 */
function leavePreviousRoom(io, socket, prevRoomId) {
  const map = roomParticipants.get(prevRoomId);
  if (map) {
    map.delete(socket.id);
    if (map.size === 0) roomParticipants.delete(prevRoomId);
  }
  socket.leave(prevRoomId);
  emitRoomState(io, prevRoomId);
}

/**
 * @param {IoServer} io
 */
export function connect(io) {
  /** @param {IoSocket} socket */
  return function onConnection(socket) {
    socket.on('room:join', (payload) => {
      const roomName = nonEmptyString(
        payload && typeof payload === 'object' ? payload.roomName : null,
        MAX_ROOM_NAME_LEN,
      );
      const displayName = nonEmptyString(
        payload && typeof payload === 'object' ? payload.displayName : null,
        MAX_DISPLAY_NAME_LEN,
      );
      const seed = nonEmptyString(
        payload && typeof payload === 'object' ? payload.seed : null,
        MAX_SEED_LEN,
      );
      if (!roomName || !displayName || !seed) return;

      const roomId = roomName;
      const prevRoomId = socket.data.roomId;

      if (prevRoomId && prevRoomId !== roomId) {
        leavePreviousRoom(io, socket, prevRoomId);
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.displayName = displayName;
      socket.data.seed = seed;

      let map = roomParticipants.get(roomId);
      if (!map) {
        map = new Map();
        roomParticipants.set(roomId, map);
      }
      map.set(socket.id, { displayName, seed });

      emitRoomState(io, roomId);
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (typeof roomId === 'string') {
        removeSocketFromRoom(io, socket, roomId);
      }
    });
  };
}
