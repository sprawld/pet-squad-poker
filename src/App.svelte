<script lang="ts">
  import { io, type Socket } from 'socket.io-client';
  import Avatar from './lib/Avatar.svelte';
  import {
    ROOM_QUERY_PARAM,
    decodeRoomParam,
    buildRoomUrl,
    MAX_ROOM_NAME_LENGTH,
  } from './lib/roomUrl';
  import type { RoomJoinPayload, RoomParticipant, RoomStatePayload } from './lib/types';

  const socket: Socket = io();

  let connection = $state<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting',
  );
  let roomName = $state<string | null>(
    decodeRoomParam(
      new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM),
    ),
  );
  let roomNameInput = $state('');
  let displayName = $state('');
  let seed = $state(crypto.randomUUID());
  let joined = $state(false);
  let participants = $state<RoomParticipant[]>([]);
  let pendingJoin = $state<RoomJoinPayload | null>(null);

  function emitJoinIfPending() {
    if (pendingJoin && joined) {
      socket.emit('room:join', pendingJoin);
    }
  }

  socket.on('connect', () => {
    connection = 'connected';
    emitJoinIfPending();
  });

  socket.on('disconnect', () => {
    connection = 'disconnected';
    participants = [];
  });

  socket.on('connect_error', (err: Error) => {
    connection = 'error';
  });

  socket.on('room:state', (payload: RoomStatePayload) => {
    participants = payload.participants;
  });

  function submitRoomName(e: SubmitEvent) {
    e.preventDefault();
    const name = roomNameInput.trim();
    if (!name || name.length > MAX_ROOM_NAME_LENGTH) return;
    roomName = name;
    buildRoomUrl(name);
    roomNameInput = '';
  }

  function regenerateAvatar() {
    seed = crypto.randomUUID();
  }

  function submitJoin(e: SubmitEvent) {
    e.preventDefault();
    const dn = displayName.trim();
    if (!dn || !roomName) return;
    const payload: RoomJoinPayload = {
      roomName,
      displayName: dn,
      seed,
    };
    pendingJoin = payload;
    socket.emit('room:join', payload);
    joined = true;
  }
</script>

<p class="socket-status" data-state={connection}>
  Socket:
  {#if connection === 'connecting'}
    connecting…
  {:else if connection === 'connected'}
    connected
  {:else if connection === 'disconnected'}
    disconnected — reconnecting when available
  {:else}
    connection error
  {/if}
</p>

<main class="poker">
  {#if roomName === null}
    <section class="card" aria-labelledby="room-title">
      <h1 id="room-title">Create or join a room</h1>
      <p class="lede">Enter a room name. Your browser URL will update so you can share it.</p>
      <form class="form" onsubmit={submitRoomName}>
        <label class="label" for="room-input">Room name</label>
        <input
          id="room-input"
          class="input"
          type="text"
          maxlength={MAX_ROOM_NAME_LENGTH}
          bind:value={roomNameInput}
          placeholder="e.g. Sprint 42 planning"
          autocomplete="off"
        />
        <button class="btn primary" type="submit">Continue</button>
      </form>
    </section>
  {:else if !joined}
    <section class="card" aria-labelledby="join-title">
      <p class="room-pill">Room: <strong>{roomName}</strong></p>
      <h1 id="join-title">Join the table</h1>
      <p class="lede">Pick a display name and an avatar. You can reroll the avatar before joining.</p>
      <div class="join-grid">
        <div class="avatar-block">
          <Avatar {seed} size={160} alt="" />
          <button type="button" class="btn secondary" onclick={regenerateAvatar}>
            Regenerate avatar
          </button>
        </div>
        <form class="form join-form" onsubmit={submitJoin}>
          <label class="label" for="display-input">Display name</label>
          <input
            id="display-input"
            class="input"
            type="text"
            maxlength={64}
            bind:value={displayName}
            placeholder="Your name"
            autocomplete="nickname"
            required
          />
          <button class="btn primary" type="submit" disabled={connection !== 'connected'}>
            Join room
          </button>
        </form>
      </div>
    </section>
  {:else}
    <section class="card room" aria-labelledby="room-live-title">
      <p class="room-pill">Room: <strong>{roomName}</strong></p>
      <h1 id="room-live-title">Participants</h1>
      <p class="lede">
        {#if connection !== 'connected'}
          You are offline; the list will refresh when the connection returns.
        {:else}
          Everyone in this room right now (updates live).
        {/if}
      </p>
      {#if participants.length === 0}
        <p class="empty">No one else here yet — or reconnecting…</p>
      {:else}
        <ul class="participants">
          {#each participants as p (p.socketId)}
            <li class="participant">
              <Avatar seed={p.seed} size={64} alt="" />
              <span class="participant-name">{p.displayName}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<style>
  .poker {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem 3rem;
    box-sizing: border-box;
  }

  .card {
    width: 100%;
    max-width: 520px;
    text-align: left;
    padding: 1.5rem 1.75rem 2rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    box-shadow: var(--shadow);
  }

  .card h1 {
    font-size: 1.75rem;
    margin: 0 0 0.5rem;
  }

  .lede {
    margin: 0 0 1.25rem;
    color: var(--text);
    line-height: 1.45;
  }

  .room-pill {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--text);
  }

  .room-pill strong {
    color: var(--text-h);
    font-weight: 600;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-h);
  }

  .input {
    font: inherit;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-h);
  }

  .input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .btn {
    font: inherit;
    cursor: pointer;
    border-radius: 8px;
    padding: 0.55rem 1rem;
    border: 2px solid transparent;
    align-self: flex-start;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    color: var(--text-h);
    background: var(--accent-bg);
    border-color: var(--accent-border);
  }

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .btn.secondary {
    color: var(--text-h);
    background: var(--code-bg);
    border-color: var(--border);
  }

  .join-grid {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  @media (min-width: 520px) {
    .join-grid {
      flex-direction: row;
      align-items: flex-start;
      gap: 2rem;
    }
  }

  .avatar-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .join-form {
    flex: 1;
    min-width: 0;
  }

  .participants {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .participant {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--code-bg);
  }

  .participant-name {
    font-weight: 500;
    color: var(--text-h);
  }

  .empty {
    margin: 0;
    color: var(--text);
    font-style: italic;
  }
</style>
