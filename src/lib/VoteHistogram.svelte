<script lang="ts">
  import type { RoomParticipant } from './types';
  import { VOTE_VALUES } from './voteConstants';

  let { participants }: { participants: RoomParticipant[] } = $props();

  /** Deck order for histogram columns (only non-zero counts are shown). */
  const DECK_ORDER: string[] = [
    'unsure',
    'coffee',
    ...VOTE_VALUES.map((n) => String(n)),
    'infinity',
  ];

  function formatLabel(key: string): string {
    if (key === 'unsure') return '?';
    if (key === 'coffee') return '☕';
    if (key === 'infinity') return '∞';
    return key;
  }

  const bins = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const p of participants) {
      const v = p.vote;
      if (v === null || v === 'abstain' || v === 'hidden') continue;
      const key = typeof v === 'number' ? String(v) : v;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: { key: string; label: string; count: number }[] = [];
    for (const key of DECK_ORDER) {
      const c = counts.get(key) ?? 0;
      if (c > 0) out.push({ key, label: formatLabel(key), count: c });
    }
    return out;
  });

  const maxCount = $derived(bins.length > 0 ? Math.max(...bins.map((b) => b.count)) : 0);
</script>

{#if bins.length > 0}
  <section class="vote-histogram" aria-labelledby="vote-histogram-title">
    <h2 id="vote-histogram-title" class="vote-histogram-title">Vote distribution</h2>
    <div class="vote-histogram-chart" role="list">
      {#each bins as bin (bin.key)}
        <div
          class="vote-histogram-col"
          role="listitem"
          aria-label="{bin.count} {bin.count === 1 ? 'vote' : 'votes'} for {bin.label}"
        >
          <div class="vote-histogram-bar-area">
            <div
              class="vote-histogram-bar"
              style:height="{maxCount ? (bin.count / maxCount) * 100 : 0}%"
            ></div>
          </div>
          <span class="vote-histogram-count">{bin.count}</span>
          <span class="vote-histogram-label">{bin.label}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .vote-histogram {
    margin-top: 1.5rem;
    padding: 1rem 1rem 1.15rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    box-shadow: var(--shadow);
  }

  .vote-histogram-title {
    margin: 0 0 1rem;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-h);
  }

  .vote-histogram-chart {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(0.35rem, 2vw, 0.85rem);
  }

  .vote-histogram-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    flex: 1 1 0;
    min-width: 0;
    max-width: 4.5rem;
  }

  .vote-histogram-bar-area {
    width: 100%;
    height: 7.5rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: stretch;
  }

  .vote-histogram-bar {
    width: 100%;
    min-height: 5px;
    border-radius: 6px 6px 2px 2px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 88%, #fff) 0%,
      var(--accent) 100%
    );
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
    transition: height 0.35s ease;
  }

  @media (prefers-color-scheme: dark) {
    .vote-histogram-bar {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 70%, transparent) 0%,
        var(--accent) 100%
      );
    }
  }

  .vote-histogram-count {
    font-size: 0.9rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-h);
  }

  .vote-histogram-label {
    font-size: clamp(0.85rem, 2.5vw, 1rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    line-height: 1.1;
    text-align: center;
  }
</style>
