<script lang="ts">
  import { Check, Copy } from 'lucide-svelte';
  import { getRoomShareUrl } from './roomUrl';

  let { roomName }: { roomName: string } = $props();

  let copied = $state(false);
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyLink() {
    const url = getRoomShareUrl(roomName);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
      return;
    }
    copied = true;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

<button
  type="button"
  class="copy-link-btn"
  onclick={copyLink}
  aria-label={copied ? 'Link copied to clipboard' : 'Copy room link to clipboard'}
>
  {#if copied}
    <Check class="copy-link-icon" size={18} strokeWidth={2.25} aria-hidden="true" />
    <span>Copied</span>
  {:else}
    <Copy class="copy-link-icon" size={18} strokeWidth={2.25} aria-hidden="true" />
    <span>Copy link</span>
  {/if}
</button>

<style>
  .copy-link-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-h);
    cursor: pointer;
    padding: 0.4rem 0.65rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--code-bg);
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .copy-link-btn:hover {
    border-color: var(--accent-border);
    background: var(--accent-bg);
  }

  .copy-link-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .copy-link-btn :global(.copy-link-icon) {
    flex-shrink: 0;
    color: var(--accent);
  }
</style>
