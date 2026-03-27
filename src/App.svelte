<script lang="ts">
  import { io, type Socket } from 'socket.io-client';
  import Avatar from './lib/Avatar.svelte';
  import {
    ROOM_QUERY_PARAM,
    decodeRoomParam,
    buildRoomUrl,
    MAX_ROOM_NAME_LENGTH,
  } from './lib/roomUrl';
  import { VOTE_VALUES } from './lib/voteConstants';
  import type {
    RoomJoinPayload,
    RoomParticipant,
    RoomStatePayload,
    VoteChoice,
    VotePhase,
  } from './lib/types';

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
  let votePhase = $state<VotePhase>('idle');
  let clientSocketId = $state<string | undefined>(undefined);
  let pendingJoin = $state<RoomJoinPayload | null>(null);

  const myVote = $derived.by(() => {
    if (!clientSocketId) return null;
    const me = participants.find((p) => p.socketId === clientSocketId);
    if (!me || me.vote === 'hidden') return null;
    return me.vote;
  });

  function emitJoinIfPending() {
    if (pendingJoin && joined) {
      socket.emit('room:join', pendingJoin);
    }
  }

  socket.on('connect', () => {
    connection = 'connected';
    clientSocketId = socket.id;
    emitJoinIfPending();
  });

  socket.on('disconnect', () => {
    connection = 'disconnected';
    participants = [];
    votePhase = 'idle';
  });

  socket.on('connect_error', (err: Error) => {
    connection = 'error';
  });

  socket.on('room:state', (payload: RoomStatePayload) => {
    participants = payload.participants;
    votePhase = payload.votePhase;
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

  /** Hide all votes and start a fresh round (same as server `vote:start`). */
  function startVoting() {
    socket.emit('vote:start');
  }

  function revealVotes() {
    socket.emit('vote:reveal');
  }

  function toggleRevealOrStart() {
    if (votePhase === 'voting') {
      revealVotes();
    } else {
      startVoting();
    }
  }

  function submitVote(value: VoteChoice) {
    socket.emit('vote:submit', { value });
  }

  function voteLabel(p: RoomParticipant, phase: VotePhase): string {
    if (phase === 'idle') return '—';
    if (phase === 'voting') {
      if (p.vote === 'hidden') return '?';
      if (p.vote === null) return '…';
      if (p.vote === 'abstain') return 'Abstain';
      return String(p.vote);
    }
    if (p.vote === null) return '—';
    if (p.vote === 'abstain') return 'Abstain';
    return String(p.vote);
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
      <h1 id="room-live-title">Planning poker</h1>
      <p class="lede">
        {#if connection !== 'connected'}
          You are offline; the list will refresh when the connection returns.
        {:else}
          Pick a card anytime; use the button to hide everyone&apos;s votes or reveal them.
        {/if}
      </p>

      <div class="vote-toolbar">
        <button
          type="button"
          class="btn primary vote-toggle"
          disabled={connection !== 'connected'}
          onclick={toggleRevealOrStart}
        >
          {#if votePhase === 'voting'}
            Reveal Votes
          {:else}
            Start Voting
          {/if}
        </button>
      </div>
      <p class="phase-hint" aria-live="polite">
        {#if votePhase === 'voting'}
          Votes are hidden from others until you reveal.
        {:else if votePhase === 'revealed'}
          Votes are visible. Start Voting begins a new hidden round.
        {:else}
          Choose a card to start a hidden round, or press Start Voting to reset the round.
        {/if}
      </p>

      {#if connection === 'connected'}
        <div class="vote-cards" role="group" aria-label="Story point cards">
          {#each VOTE_VALUES as v (v)}
            <button
              type="button"
              class="vote-card"
              class:selected={myVote === v}
              onclick={() => submitVote(v)}
            >
              {v}
            </button>
          {/each}
          <button
            type="button"
            class="vote-card abstain"
            class:selected={myVote === 'abstain'}
            onclick={() => submitVote('abstain')}
          >
            I'm not voting
          </button>
        </div>
      {/if}

      <h2 class="subheading">Participants</h2>
      {#if participants.length === 0}
        <p class="empty">No one here yet — or reconnecting…</p>
      {:else}
        <ul class="participants">
          {#each participants as p (p.socketId)}
            <li class="participant">
              <Avatar seed={p.seed} size={64} alt="" />
              <span class="participant-name">{p.displayName}</span>
              <span class="participant-vote" title="Vote">{voteLabel(p, votePhase)}</span>
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

  .card.room {
    max-width: 720px;
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

  .vote-toolbar {
    margin-bottom: 0.5rem;
  }

  .vote-toggle {
    width: 100%;
    max-width: 20rem;
    align-self: stretch;
    text-align: center;
  }

  .phase-hint {
    margin: 0 0 1.25rem;
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.4;
  }

  .subheading {
    font-size: 1.15rem;
    font-weight: 500;
    color: var(--text-h);
    margin: 1.25rem 0 0.75rem;
  }

  .vote-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .vote-card {
    font: inherit;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    min-height: 2.75rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    border: 2px solid var(--border);
    background: var(--code-bg);
    color: var(--text-h);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .vote-card:hover {
    border-color: var(--accent-border);
  }

  .vote-card.selected {
    border-color: var(--accent);
    background: var(--accent-bg);
  }

  .vote-card.abstain {
    grid-column: 1 / -1;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .participant-vote {
    margin-left: auto;
    min-width: 3rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--accent);
  }
</style>
