<script lang="ts">
  import { createAvatar } from '@dicebear/core';
  import { botttsNeutral } from '@dicebear/collection';

  let {
    seed = 'fallback',
    size = 128,
    alt = '',
  }: { seed?: string; size?: number; alt?: string } = $props();

  const dataUri = $derived(
    createAvatar(botttsNeutral, {
      seed,
      size,
    }).toDataUri(),
  );
</script>

<img src={dataUri} width={size} height={size} {alt} class="avatar-img" />

<style>
  .avatar-img {
    border-radius: 12px;
    display: block;
    box-shadow: var(--shadow);
  }
</style>
