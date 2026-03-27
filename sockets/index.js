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

/** @type {Set<number>} */
const ALLOWED_VOTES = new Set([1, 2, 3, 5, 8, 13, 20, 40, 100]);

/** Room id → socket id → participant data (single source of truth). @type {Map<string, Map<string, ParticipantEntry>>} */
const roomParticipants = new Map();

/** Room id → 'idle' | 'voting' | 'revealed' */
const votePhase = new Map();

/** Room id → socket id → number | 'abstain' | 'unsure' | 'coffee' | 'infinity' | null */
const votes = new Map();

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
 * @param {string} roomId
 */
function ensureVoteMaps(roomId) {
  if (!votePhase.has(roomId)) votePhase.set(roomId, 'idle');
  if (!votes.has(roomId)) votes.set(roomId, new Map());
}

/**
 * @param {string} roomId
 */
function clearRoomVotes(roomId) {
  const vm = votes.get(roomId);
  const pmap = roomParticipants.get(roomId);
  if (!vm || !pmap) return;
  for (const id of pmap.keys()) {
    const cur = vm.get(id);
    vm.set(id, cur === 'abstain' ? 'abstain' : null);
  }
}

/**
 * Counts toward “X of Y have voted” during a hidden round (not persistent abstain).
 * @param {unknown} raw
 */
function countsTowardVoteProgress(raw) {
  return raw !== null && raw !== undefined && raw !== 'abstain';
}

/**
 * @param {string} roomId
 * @param {string} forSocketId
 */
function buildRoomState(roomId, forSocketId) {
  const pmap = roomParticipants.get(roomId);
  const phase = votePhase.get(roomId) ?? 'idle';
  const voteMap = votes.get(roomId) ?? new Map();

  const participants = [];
  if (pmap) {
    for (const [socketId, { displayName, seed }] of pmap) {
      const raw = voteMap.get(socketId) ?? null;
      /** @type {number | 'abstain' | 'unsure' | 'coffee' | 'infinity' | null | 'hidden'} */
      let vote;
      if (phase === 'idle') {
        vote = raw === 'abstain' ? 'abstain' : null;
      } else if (phase === 'revealed' || socketId === forSocketId) {
        vote = raw;
      } else {
        // voting: hide estimates from others, but persistent abstain is visible to the room.
        vote =
          raw === 'abstain'
            ? 'abstain'
            : raw !== null && raw !== undefined
              ? 'hidden'
              : null;
      }
      participants.push({ socketId, displayName, seed, vote });
    }
  }

  /** @type {{ cast: number, total: number } | null} */
  let voteProgress = null;
  if (phase === 'voting' && pmap) {
    let cast = 0;
    let total = 0;
    for (const id of pmap.keys()) {
      const raw = voteMap.get(id) ?? null;
      if (raw === 'abstain') continue;
      total++;
      if (countsTowardVoteProgress(raw)) cast++;
    }
    voteProgress = total > 0 ? { cast, total } : null;
  }

  return { participants, votePhase: phase, voteProgress };
}

/**
 * @param {IoServer} io
 * @param {string} roomId
 */
function emitRoomState(io, roomId) {
  const roomSet = io.sockets.adapter.rooms.get(roomId);
  if (!roomSet) return;
  for (const socketId of roomSet) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;
    sock.emit('room:state', buildRoomState(roomId, socketId));
  }
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
  const vm = votes.get(roomId);
  if (vm) vm.delete(socket.id);
  if (map.size === 0) {
    roomParticipants.delete(roomId);
    votePhase.delete(roomId);
    votes.delete(roomId);
  } else {
    emitRoomState(io, roomId);
  }
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
  }
  const vm = votes.get(prevRoomId);
  if (vm) vm.delete(socket.id);
  if (map && map.size === 0) {
    roomParticipants.delete(prevRoomId);
    votePhase.delete(prevRoomId);
    votes.delete(prevRoomId);
  }
  socket.leave(prevRoomId);
  if (roomParticipants.has(prevRoomId)) {
    emitRoomState(io, prevRoomId);
  }
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

      ensureVoteMaps(roomId);
      const vm = votes.get(roomId);
      if (vm) vm.set(socket.id, null);

      emitRoomState(io, roomId);
    });

    socket.on('vote:start', () => {
      const roomId = socket.data.roomId;
      if (typeof roomId !== 'string') return;
      if (!roomParticipants.get(roomId)?.has(socket.id)) return;
      votePhase.set(roomId, 'voting');
      clearRoomVotes(roomId);
      emitRoomState(io, roomId);
    });

    socket.on('vote:reveal', () => {
      const roomId = socket.data.roomId;
      if (typeof roomId !== 'string') return;
      if (!roomParticipants.get(roomId)?.has(socket.id)) return;
      if (votePhase.get(roomId) !== 'voting') return;
      votePhase.set(roomId, 'revealed');
      emitRoomState(io, roomId);
    });

    socket.on('vote:submit', (payload) => {
      const roomId = socket.data.roomId;
      if (typeof roomId !== 'string') return;
      if (!roomParticipants.get(roomId)?.has(socket.id)) return;

      const phase = votePhase.get(roomId);
      const val =
        payload && typeof payload === 'object' ? payload.value : undefined;

      /** Retract vote (clears deck pick or persistent abstain when idle). */
      if (val === null) {
        if (phase === 'idle' || phase === 'voting' || phase === 'revealed') {
          votes.get(roomId)?.set(socket.id, null);
          emitRoomState(io, roomId);
        }
        return;
      }

      /** Idle: “I'm not voting” only updates preference; does not start a round. */
      if (phase === 'idle' && val === 'abstain') {
        votes.get(roomId)?.set(socket.id, 'abstain');
        emitRoomState(io, roomId);
        return;
      }

      // idle: first deck pick starts a hidden round (clears non-abstain votes).
      // voting: update hidden vote.
      // revealed: update vote in the open; everyone sees changes live.
      if (phase === 'idle') {
        votePhase.set(roomId, 'voting');
        clearRoomVotes(roomId);
      } else if (phase !== 'voting' && phase !== 'revealed') {
        return;
      }

      if (val === 'abstain') {
        votes.get(roomId)?.set(socket.id, 'abstain');
      } else if (val === 'unsure') {
        votes.get(roomId)?.set(socket.id, 'unsure');
      } else if (val === 'coffee') {
        votes.get(roomId)?.set(socket.id, 'coffee');
      } else if (val === 'infinity') {
        votes.get(roomId)?.set(socket.id, 'infinity');
      } else if (typeof val === 'number' && ALLOWED_VOTES.has(val)) {
        votes.get(roomId)?.set(socket.id, val);
      } else {
        return;
      }
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
