<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let busy = false;

  const dispatch = createEventDispatcher<{ click: void }>();
</script>

<button
  class="fixed right-4 z-[1100] flex min-h-14 min-w-14 items-center justify-center rounded-full bg-pasture-600 text-white shadow-lg ring-2 ring-white/80 transition active:scale-95 disabled:opacity-60 sm:right-6 sm:min-h-16 sm:min-w-16"
  style="bottom: calc(var(--fm-nav-inset) + 1rem);"
  aria-label="Log my current location"
  title="Log where you are right now"
  disabled={busy}
  on:click={() => dispatch('click')}
>
  {#if busy}
    <svg class="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="9" class="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
    </svg>
  {:else}
    <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke-linecap="round" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  {/if}
</button>
