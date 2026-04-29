<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { selectionCount, selectionKind } from '$lib/stores';

  const dispatch = createEventDispatcher<{
    batchEvent: void;
    batchEdit: void;
    clear: void;
  }>();

  $: n = $selectionCount;
  $: kind = $selectionKind;
  $: label = n === 1 ? '1 location' : `${n} locations`;
  $: kindHint =
    kind === 'field' ? 'fields'
      : kind === 'shed' ? 'sheds'
      : kind === 'line' ? 'lines'
      : 'locations';
</script>

{#if n > 0}
  <div class="pointer-events-none absolute inset-x-0 bottom-24 z-[1050] flex justify-center px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-24">
    <div
      class="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-slate-900/95 px-3 py-2 text-sm text-white shadow-xl ring-1 ring-white/10"
    >
      <span class="rounded-full bg-pasture-600 px-2 py-0.5 text-xs font-semibold tabular-nums">
        {n}
      </span>
      <span class="hidden sm:inline">{label} selected</span>
      <span class="inline sm:hidden">{kind ? kindHint : 'selected'}</span>
      <div class="flex items-center gap-1 pl-1">
        <button
          class="rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
          on:click={() => dispatch('batchEvent')}
        >
          Log event
        </button>
        <button
          class="rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
          on:click={() => dispatch('batchEdit')}
        >
          Edit
        </button>
        <button
          class="rounded-full bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/15"
          aria-label="Clear selection"
          on:click={() => dispatch('clear')}
        >
          ✕
        </button>
      </div>
    </div>
  </div>
{/if}
