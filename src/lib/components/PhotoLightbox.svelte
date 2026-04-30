<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { openOverlay } from '$lib/utils/overlay';

  export let src: string | null = null;

  const dispatch = createEventDispatcher<{ close: void }>();

  let dispose: (() => void) | null = null;
  let lastFocused: Element | null = null;

  $: {
    if (src && !dispose && typeof window !== 'undefined') {
      lastFocused = document.activeElement;
      document.documentElement.classList.add('overflow-hidden');
      dispose = openOverlay(() => dispatch('close'));
    } else if (!src && dispose) {
      dispose();
      dispose = null;
      if (typeof window !== 'undefined') {
        document.documentElement.classList.remove('overflow-hidden');
        if (lastFocused instanceof HTMLElement) lastFocused.focus();
      }
    }
  }

  onDestroy(() => {
    if (dispose) {
      dispose();
      dispose = null;
    }
    if (typeof window !== 'undefined') {
      document.documentElement.classList.remove('overflow-hidden');
    }
  });

  function close(): void {
    dispatch('close');
  }
</script>

{#if src}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Photo viewer"
    on:click|self={close}
    on:keydown={(e) => e.key === 'Escape' && close()}
  >
    <button
      type="button"
      class="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
      style="top: max(1rem, env(safe-area-inset-top, 1rem))"
      aria-label="Close photo"
      on:click={close}
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 6l12 12M18 6l-12 12" stroke-linecap="round" />
      </svg>
    </button>
    <img
      {src}
      alt="Full size"
      class="max-h-full max-w-full rounded-md shadow-2xl"
      loading="eager"
      decoding="async"
    />
  </div>
{/if}
