<script lang="ts">
  import type { RoomParticipant, VotePhase } from './types';

  let {
    participant: p,
    votePhase,
    ariaLabel,
  }: {
    participant: RoomParticipant;
    votePhase: VotePhase;
    ariaLabel: string;
  } = $props();

  /** Value face only after reveal; while voting everyone sees the back (face-down). */
  const showFront = $derived(votePhase === 'revealed');

  /** Text on the front face (value when visible). */
  const frontText = $derived.by(() => {
    if (votePhase === 'idle') return '—';
    if (votePhase === 'revealed') {
      if (p.vote === null || p.vote === 'hidden') return '—';
      if (p.vote === 'abstain') return 'Pass';
      return String(p.vote);
    }
    return '—';
  });

  /** While voting: "?" until they vote, then plain back (no hint). */
  const backHint = $derived.by(() => {
    if (votePhase === 'idle') return '';
    if (votePhase === 'voting' && p.vote === null) return '?';
    return '';
  });
</script>

<div class="flip-scene" role="img" aria-label={ariaLabel}>
  <div class="flip-inner" class:revealed={showFront}>
    <div class="face face-back">
      <span class="back-pattern"></span>
      {#if backHint}
        <span class="back-hint">{backHint}</span>
      {/if}
    </div>
    <div class="face face-front">
      <span class="face-value">{frontText}</span>
    </div>
  </div>
</div>

<style>
  .flip-scene {
    width: 3.25rem;
    height: 4.5rem;
    flex-shrink: 0;
    perspective: 600px;
  }

  .flip-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.65s cubic-bezier(0.4, 0, 0.2, 1);
    transform: rotateY(0deg);
  }

  .flip-inner.revealed {
    transform: rotateY(180deg);
  }

  .face {
    position: absolute;
    inset: 0;
    border-radius: 0.35rem;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--poker-card-edge, var(--border));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.35),
      0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .face-back {
    transform: rotateY(0deg);
    background: linear-gradient(145deg, #3d2a5c 0%, #1e1430 50%, #2a1f42 100%);
    color: rgba(255, 255, 255, 0.85);
  }

  @media (prefers-color-scheme: dark) {
    .face-back {
      background: linear-gradient(145deg, #4a3570 0%, #251a38 50%, #322448 100%);
    }
  }

  .back-pattern {
    position: absolute;
    inset: 0.35rem;
    border-radius: 0.2rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: repeating-linear-gradient(
      -12deg,
      transparent,
      transparent 3px,
      rgba(255, 255, 255, 0.06) 3px,
      rgba(255, 255, 255, 0.06) 4px
    );
  }

  .back-hint {
    position: relative;
    z-index: 1;
    font-size: 1.1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .face-front {
    transform: rotateY(180deg);
    background: linear-gradient(180deg, #faf8ff 0%, #f0ecf8 100%);
    color: var(--text-h);
  }

  @media (prefers-color-scheme: dark) {
    .face-front {
      background: linear-gradient(180deg, #2a2d38 0%, #1f2028 100%);
      color: var(--text-h);
    }
  }

  .face-value {
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }
</style>
