<script lang="ts">
  import { DEFAULT_USE_COLORS, type UserSettings } from '$lib/schemas';

  export let settings: UserSettings | null;

  $: types = settings?.useTypes ?? [];
  $: colors = settings?.useColors ?? {};
  function colorFor(t: string): string {
    return colors[t] ?? DEFAULT_USE_COLORS[t] ?? '#9ca3af';
  }
</script>

{#if types.length > 0}
  <div class="pointer-events-auto absolute bottom-24 left-3 z-[1000] rounded-lg bg-white/95 p-2 text-xs shadow ring-1 ring-black/5 backdrop-blur dark:bg-slate-800/95">
    <p class="mb-1 font-medium text-slate-700 dark:text-slate-300">Current use</p>
    <ul class="space-y-0.5">
      {#each types as t}
        <li class="flex items-center gap-2">
          <span class="inline-block h-3 w-3 rounded-sm" style="background: {colorFor(t)}"></span>
          <span class="capitalize">{t}</span>
        </li>
      {/each}
      <li class="flex items-center gap-2 border-t border-slate-200 pt-1 text-slate-500 dark:border-slate-700">
        <span class="inline-block h-3 w-3 rounded-sm" style="background: #9ca3af; background-image: repeating-linear-gradient(45deg, transparent 0 3px, rgba(0,0,0,0.2) 3px 5px);"></span>
        <span>No current use</span>
      </li>
    </ul>
  </div>
{/if}
