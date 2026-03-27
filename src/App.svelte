<script lang="ts">
  import { io, type Socket } from 'socket.io-client';
  import Avatar from './lib/Avatar.svelte';
  import CopyRoomLink from './lib/CopyRoomLink.svelte';
  import ParticipantVoteCard from './lib/ParticipantVoteCard.svelte';
  import {
    ROOM_QUERY_PARAM,
    decodeRoomParam,
    buildRoomUrl,
    MAX_ROOM_NAME_LENGTH,
  } from './lib/roomUrl';
  import { Coffee } from 'lucide-svelte';
  import {
    COFFEE_VOTE,
    INFINITY_VOTE,
    UNSURE_VOTE,
    VOTE_VALUES,
  } from './lib/voteConstants';
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

  const meParticipant = $derived.by(() => {
    if (!clientSocketId) return undefined;
    return participants.find((p) => p.socketId === clientSocketId);
  });

  const headerUserName = $derived(
    meParticipant?.displayName ?? pendingJoin?.displayName ?? displayName,
  );

  const headerUserSeed = $derived(meParticipant?.seed ?? seed);

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
    if (myVote === value) {
      socket.emit('vote:submit', { value: null });
    } else {
      socket.emit('vote:submit', { value });
    }
  }

  /** Persistent “I'm not voting” — separate from the ∞ deck card; survives new rounds. */
  function toggleAbstain() {
    if (myVote === 'abstain') {
      socket.emit('vote:submit', { value: null });
    } else {
      socket.emit('vote:submit', { value: 'abstain' });
    }
  }

  const participantsAbstain = $derived(
    participants.filter((p) => p.vote === 'abstain'),
  );
  const participantsVoters = $derived(
    participants.filter((p) => p.vote !== 'abstain'),
  );

  function voteLabel(p: RoomParticipant, phase: VotePhase): string {
    if (phase === 'idle') return '—';
    if (phase === 'voting') {
      if (p.vote === 'abstain') return 'Not voting';
      if (p.vote === null) return 'not voted yet';
      return 'voted'; // no value while hidden (including your own pick)
    }
    if (p.vote === null) return '—';
    if (p.vote === 'abstain') return 'Not voting';
    if (p.vote === 'unsure') return '? (not joining)';
    if (p.vote === 'coffee') return 'Coffee';
    if (p.vote === 'infinity') return '∞';
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
      <div class="join-room-bar">
        <p class="room-pill">Room: <strong>{roomName}</strong></p>
        <CopyRoomLink roomName={roomName} />
      </div>
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
    <section class="room-view" aria-labelledby="room-live-title">
      <header class="room-header-full">
        <div class="room-header">
          <div class="room-header-start">
            <CopyRoomLink roomName={roomName} />
          </div>
          <h1 id="room-live-title" class="room-title">
            <span class="room-title-name">{roomName}</span><span class="room-title-suffix"> Poker</span>
          </h1>
          <div class="room-user-bar">
            <span class="room-user-name">{headerUserName}</span>
            <Avatar seed={headerUserSeed} size={44} alt="" />
          </div>
        </div>
      </header>
      <div class="room-body">
      {#if connection === 'connected'}
        <div class="vote-abstain-row">
          <button
            type="button"
            class="btn secondary vote-abstain-btn"
            class:selected={myVote === 'abstain'}
            onclick={toggleAbstain}
            aria-pressed={myVote === 'abstain'}
            aria-label="I'm not voting — stays on for new rounds"
          >
            I&apos;m not voting
          </button>
        </div>
        <div class="vote-cards" role="group" aria-label="Story point cards">
          <button
            type="button"
            class="vote-card vote-card-unsure"
            class:selected={myVote === UNSURE_VOTE}
            onclick={() => submitVote(UNSURE_VOTE)}
            aria-label="Not joining this round (shown as question mark)"
          >
            ?
          </button>
          <button
            type="button"
            class="vote-card vote-card-coffee"
            class:selected={myVote === COFFEE_VOTE}
            onclick={() => submitVote(COFFEE_VOTE)}
            aria-label="Coffee break"
          >
            <Coffee class="vote-card-coffee-icon" size={33} strokeWidth={2} aria-hidden="true" />
          </button>
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
            class="vote-card vote-card-infinity"
            class:selected={myVote === INFINITY_VOTE}
            onclick={() => submitVote(INFINITY_VOTE)}
            aria-label="Infinity"
          >
            ∞
          </button>
        </div>
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
      {/if}

      <div
        class="participants-panel"
        class:participants-panel--voting={votePhase === 'voting'}
        class:participants-panel--revealed={votePhase === 'revealed'}
      >
        <header class="participants-panel-head">
          <h2 class="participants-panel-title">Participants</h2>
          {#if votePhase === 'voting' && voteProgress}
            <p class="participants-panel-progress" aria-live="polite">
              {voteProgress.cast} of {voteProgress.total} voted
            </p>
          {/if}
        </header>
        <div class="participants-panel-body">
          {#if participants.length === 0}
            <p class="empty">No one here yet — or reconnecting…</p>
          {:else}
            {#if participantsAbstain.length > 0}
              <ul class="participants participants-non-voters">
                {#each participantsAbstain as p (p.socketId)}
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
            {#if participantsAbstain.length > 0 && participantsVoters.length > 0}
              <h3 class="participants-subgroup">Voting</h3>
            {/if}
            {#if participantsVoters.length > 0}
              <ul class="participants">
                {#each participantsVoters as p (p.socketId)}
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
          {/if}
        </div>
      </div>
      </div>
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
  }

  @media (prefers-color-scheme: dark) {
    .connection-warning {
      background: color-mix(in srgb, #f59e0b 22%, var(--code-bg));
    }
  }

  .poker {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    padding: 0;
    box-sizing: border-box;
  }

  .card {
    align-self: center;
    width: 100%;
    max-width: 520px;
    text-align: left;
    padding: 1.5rem 1.75rem 2rem;
    margin: 2rem 1.5rem 3rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    box-shadow: var(--shadow);
    box-sizing: border-box;
  }

  .room-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    min-height: 0;
  }

  .room-header-full {
    width: 100%;
    box-sizing: border-box;
    padding: 1rem clamp(1rem, 3vw, 2rem) 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .room-body {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 3vw, 1.5rem) 3rem;
    box-sizing: border-box;
  }

  .room-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.75rem 1rem;
    margin: 0;
    width: 100%;
  }

  .room-header-start {
    grid-column: 1;
    justify-self: start;
    align-self: start;
    min-width: 0;
  }

  .join-room-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0 0 0.75rem;
  }

  .join-room-bar .room-pill {
    margin: 0;
  }

  .room-title {
    grid-column: 2;
    justify-self: center;
    margin: 0;
    max-width: 100%;
    text-align: center;
    font-family: var(--heading, system-ui, sans-serif);
    font-size: clamp(2rem, 5.5vw, 3.25rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--text-h);
  }

  .room-user-bar {
    grid-column: 3;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .room-user-bar :global(img) {
    flex-shrink: 0;
    box-shadow: none;
  }

  .room-user-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-h);
    max-width: min(12rem, 28vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .room-title {
      font-size: clamp(1.5rem, 5.2vw, 2.35rem);
    }

    .room-user-name {
      max-width: 6.5rem;
      font-size: 0.88rem;
    }
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

  .participants-non-voters {
    margin-bottom: 0.25rem;
  }

  .participants-panel {
    margin-top: 1.5rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--code-bg);
    box-shadow: var(--shadow);
    overflow: hidden;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      background 0.2s ease;
  }

  .participants-panel--voting {
    border-color: var(--accent-border);
    background: color-mix(in srgb, var(--accent-bg) 55%, var(--code-bg));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent),
      var(--shadow);
  }

  .participants-panel--revealed {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  @media (prefers-color-scheme: dark) {
    .participants-panel--voting {
      background: color-mix(in srgb, var(--accent-bg) 40%, var(--code-bg));
    }
  }

  .participants-panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .participants-panel--voting .participants-panel-head {
    border-bottom-color: var(--accent-border);
  }

  .participants-panel-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text-h);
  }

  .participants-panel-progress {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }

  .participants-panel-body {
    padding: 1rem;
  }

  .participants-subgroup {
    margin: 0.75rem 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-h);
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
    width: 100%;
    margin-top: 1rem;
  }

  .vote-toggle {
    width: 100%;
    max-width: none;
    align-self: stretch;
    text-align: center;
    box-sizing: border-box;
  }

  .vote-abstain-row {
    width: 100%;
    margin-bottom: 0.85rem;
  }

  .vote-abstain-btn {
    width: 100%;
    max-width: none;
    align-self: stretch;
    text-align: center;
    box-sizing: border-box;
  }

  .vote-abstain-btn.selected {
    border-color: var(--accent);
    background: var(--accent-bg);
    box-shadow: inset 0 0 0 2px rgba(170, 59, 255, 0.15);
  }

  .vote-cards {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-template-rows: repeat(2, auto);
    gap: 0.65rem;
    margin-bottom: 1.5rem;
    align-items: stretch;
  }

  .vote-card {
    font-family: inherit;
    font-size: clamp(1.35rem, 3.8vw, 1.95rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    width: 100%;
    max-width: none;
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

  .vote-card-infinity {
    font-size: clamp(1.55rem, 5vw, 2.15rem);
    font-weight: 500;
    font-variant-numeric: normal;
    line-height: 1;
  }

  .vote-card-unsure {
    font-size: clamp(1.45rem, 4.8vw, 2rem);
    font-weight: 700;
    font-variant-numeric: normal;
  }

  .vote-card-coffee {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-variant-numeric: normal;
  }

  .vote-card-coffee :global(.vote-card-coffee-icon) {
    color: #fff;
    flex-shrink: 0;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
  }

  .vote-card-coffee.selected :global(.vote-card-coffee-icon) {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
</style>
