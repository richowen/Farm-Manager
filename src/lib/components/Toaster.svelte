<script lang="ts">
  import { toasts, dismissToast } from '$lib/stores';
  import { fly } from 'svelte/transition';
</script>

<div class="pointer-events-none fixed inset-x-0 top-3 z-[10000] flex flex-col items-center gap-2 px-3">
  {#each $toasts as t (t.id)}
    <div
      in:fly={{ y: -8, duration: 160 }}
      out:fly={{ y: -8, duration: 120 }}
      class="pointer-events-auto w-full max-w-md rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ring-black/5 backdrop-blur"
      class:bg-slate-900={t.kind === 'info'}
      class:text-white={t.kind === 'info' || t.kind === 'error' || t.kind === 'success' || t.kind === 'warning'}
      class:bg-red-600={t.kind === 'error'}
      class:bg-pasture-600={t.kind === 'success'}
      class:bg-amber-600={t.kind === 'warning'}
    >
      <div class="flex items-start justify-between gap-3">
        <span class="flex-1">{t.message}</span>
        {#if t.action}
          <button
            class="rounded-md bg-white/15 px-2 py-0.5 text-xs font-semibold text-white hover:bg-white/30"
            on:click={() => {
              t.action?.onClick();
              dismissToast(t.id);
            }}
          >
            {t.action.label}
          </button>
        {/if}
        <button
          class="opacity-70 hover:opacity-100"
          aria-label="Dismiss"
          on:click={() => dismissToast(t.id)}
        >
          &times;
        </button>
      </div>
    </div>
  {/each}
</div>
