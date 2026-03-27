<script lang="ts">
  import { io, type Socket } from 'socket.io-client';
  import Avatar from './lib/Avatar.svelte';
  import ParticipantVoteCard from './lib/ParticipantVoteCard.svelte';
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
    VoteProgress,
  } from './lib/types';
  import { loadSavedProfile, saveProfile } from './lib/localProfile';

  const savedProfile = loadSavedProfile();

  function initialRoomFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    return decodeRoomParam(
      new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM),
    );
  }

  const initialRoomName = initialRoomFromUrl();
  const joinWithSavedProfileNow =
    initialRoomName !== null &&
    savedProfile !== null &&
    savedProfile.displayName.trim() !== '';

  const initialAutoJoinPayload: RoomJoinPayload | null =
    joinWithSavedProfileNow && initialRoomName && savedProfile
      ? {
          roomName: initialRoomName,
          displayName: savedProfile.displayName.trim(),
          seed: savedProfile.seed,
        }
      : null;

  const socket: Socket = io();

  let connection = $state<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting',
  );
  let roomName = $state<string | null>(initialRoomName);
  let roomNameInput = $state('');
  let displayName = $state(savedProfile?.displayName ?? '');
  let seed = $state(savedProfile?.seed ?? crypto.randomUUID());
  let joined = $state(joinWithSavedProfileNow);
  let participants = $state<RoomParticipant[]>([]);
  let votePhase = $state<VotePhase>('idle');
  let voteProgress = $state<VoteProgress | null>(null);
  let clientSocketId = $state<string | undefined>(undefined);
  let pendingJoin = $state<RoomJoinPayload | null>(initialAutoJoinPayload);

  $effect(() => {
    saveProfile(displayName, seed);
  });

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

  function applySocketConnected() {
    connection = 'connected';
    clientSocketId = socket.id;
    emitJoinIfPending();
  }

  socket.on('connect', applySocketConnected);

  socket.on('disconnect', () => {
    connection = 'disconnected';
    participants = [];
    votePhase = 'idle';
    voteProgress = null;
  });

  socket.on('connect_error', (err: Error) => {
    connection = 'error';
  });

  socket.on('room:state', (payload: RoomStatePayload) => {
    participants = payload.participants;
    votePhase = payload.votePhase;
    voteProgress = payload.voteProgress;
  });

  if (socket.connected) {
    applySocketConnected();
  }

  /** After picking a room name on `/`, skip the join screen when a full profile is saved. */
  function tryJoinWithSavedProfileNow() {
    if (joined) return;
    if (!roomName) return;
    if (!savedProfile?.displayName.trim()) return;
    const dn = displayName.trim();
    if (!dn) return;
    const payload: RoomJoinPayload = {
      roomName,
      displayName: dn,
      seed,
    };
    pendingJoin = payload;
    joined = true;
    emitJoinIfPending();
  }

  function submitRoomName(e: SubmitEvent) {
    e.preventDefault();
    const name = roomNameInput.trim();
    if (!name || name.length > MAX_ROOM_NAME_LENGTH) return;
    roomName = name;
    buildRoomUrl(name);
    roomNameInput = '';
    tryJoinWithSavedProfileNow();
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
      if (p.vote === null) return 'not voted yet';
      return 'voted'; // no value while hidden (including your own pick)
    }
    if (p.vote === null) return '—';
    if (p.vote === 'abstain') return 'Abstain';
    return String(p.vote);
  }
</script>

{#if connection !== 'connected'}
  <aside class="connection-warning" role="status">
    {#if connection === 'connecting'}
      Connecting…
    {:else if connection === 'disconnected'}
      Disconnected — reconnecting when available.
    {:else}
      Connection error — check your network and try again.
    {/if}
  </aside>
{/if}

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
      <header class="room-header">
        <h1 id="room-live-title" class="room-title">
          <span class="room-title-name">{roomName}</span><span class="room-title-suffix"> Poker</span>
        </h1>
      </header>
      <p class="lede">
        After <strong>Start Voting</strong>, picks stay hidden until <strong>Reveal Votes</strong>. While
        revealed, everyone sees votes and any changes live.
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
          Hidden round — others can&apos;t see your pick until you reveal.
        {:else if votePhase === 'revealed'}
          Open round — votes are visible; change your card and everyone sees it.
        {:else}
          Idle — Start Voting or pick a card to begin a hidden round.
        {/if}
      </p>
      {#if votePhase === 'voting' && voteProgress}
        <p class="vote-progress" aria-live="polite">
          {voteProgress.cast} of {voteProgress.total} participants have voted
        </p>
      {/if}

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
              <Avatar seed={p.seed} size={56} alt="" />
              <span class="participant-name">{p.displayName}</span>
              <ParticipantVoteCard
                participant={p}
                votePhase={votePhase}
                ariaLabel={`${p.displayName}: ${voteLabel(p, votePhase)}`}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<style>
  .connection-warning {
    margin: 0;
    padding: 0.65rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-h);
    background: color-mix(in srgb, #f59e0b 18%, var(--code-bg));
    border-bottom: 1px solid color-mix(in srgb, #f59e0b 45%, var(--border));
  }

  @media (prefers-color-scheme: dark) {
    .connection-warning {
      background: color-mix(in srgb, #f59e0b 22%, var(--code-bg));
      border-bottom-color: color-mix(in srgb, #f59e0b 35%, var(--border));
    }
  }

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

  .room-header {
    margin: 0 0 1rem;
    text-align: center;
  }

  .room-title {
    margin: 0;
    font-family: var(--heading, system-ui, sans-serif);
    font-size: clamp(2rem, 5.5vw, 3.25rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--text-h);
  }

  .room-title-name {
    color: var(--accent);
  }

  .room-title-suffix {
    font-weight: 700;
    color: var(--text-h);
  }

  .card h1:not(.room-title) {
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
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--code-bg);
  }

  .participant-name {
    flex: 1;
    min-width: 0;
    font-weight: 600;
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

  .vote-progress {
    margin: 0 0 1.25rem;
    font-size: 0.95rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-h);
  }

  .subheading {
    font-size: 1.15rem;
    font-weight: 500;
    color: var(--text-h);
    margin: 1.25rem 0 0.75rem;
  }

  .vote-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(3.75rem, 1fr));
    gap: 0.65rem;
    margin-bottom: 1.5rem;
    justify-items: center;
  }

  .vote-card {
    font: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    width: 100%;
    max-width: 4.5rem;
    aspect-ratio: 5 / 7;
    padding: 0;
    border-radius: 0.4rem;
    border: 2px solid var(--border);
    background: linear-gradient(180deg, #faf8ff 0%, #f0ecf8 100%);
    color: var(--text-h);
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 4px 14px rgba(0, 0, 0, 0.08);
    transition:
      border-color 0.15s,
      background 0.15s,
      transform 0.12s ease,
      box-shadow 0.15s;
  }

  @media (prefers-color-scheme: dark) {
    .vote-card {
      background: linear-gradient(180deg, #2c2f3a 0%, #22252e 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 4px 14px rgba(0, 0, 0, 0.35);
    }
  }

  .vote-card:hover:not(:disabled) {
    border-color: var(--accent-border);
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 8px 20px rgba(0, 0, 0, 0.12);
  }

  .vote-card:active:not(:disabled) {
    transform: translateY(0);
  }

  .vote-card.selected {
    border-color: var(--accent);
    background: var(--accent-bg);
    box-shadow:
      inset 0 0 0 2px rgba(170, 59, 255, 0.2),
      0 4px 16px rgba(170, 59, 255, 0.2);
  }

  .vote-card.abstain {
    grid-column: 1 / -1;
    max-width: 100%;
    aspect-ratio: auto;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    font-weight: 600;
    font-size: 0.88rem;
  }
</style>
