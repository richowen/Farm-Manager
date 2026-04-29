<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { locations, settings, colorMode } from '$lib/stores';
  import type { LocationRecord } from '$lib/schemas';

  const dispatch = createEventDispatcher<{ toggleLines: void }>();

  function countsOf(list: LocationRecord[]): { pipes: number; drains: number; generic: number } {
    let pipes = 0;
    let drains = 0;
    let generic = 0;
    for (const l of list) {
      if (l.kind !== 'line') continue;
      if (l.line_type === 'pipe') pipes++;
      else if (l.line_type === 'drain') drains++;
      else generic++;
    }
    return { pipes, drains, generic };
  }

  $: counts = countsOf($locations);
  $: total = counts.pipes + counts.drains + counts.generic;
  $: hidden = !($settings?.showLines ?? false);
  $: show = hidden && total > 0;

  // Use legend occupies the same bottom-left slot whenever colour-by-use is
  // active and the user has at least one use-type configured. When that's
  // the case we stack the chip above it instead of overlapping.
  $: legendVisible =
    $colorMode === 'use' && ($settings?.useTypes?.length ?? 0) > 0;
  $: bottomOffset = legendVisible ? '11rem' : '6rem';

  function label(): string {
    const parts: string[] = [];
    if (counts.pipes > 0) parts.push(`${counts.pipes} pipe${counts.pipes === 1 ? '' : 's'}`);
    if (counts.drains > 0) parts.push(`${counts.drains} drain${counts.drains === 1 ? '' : 's'}`);
    if (counts.generic > 0) parts.push(`${counts.generic} line${counts.generic === 1 ? '' : 's'}`);
    return parts.join(' · ') + ' hidden';
  }
</script>

{#if show}
  <button
    type="button"
    class="pointer-events-auto absolute left-3 z-[1050] flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 hover:bg-slate-900"
    style="bottom: calc(var(--fm-nav-inset) + {bottomOffset});"
    title="Show pipes and drains on the map"
    on:click={() => dispatch('toggleLines')}
  >
    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4" stroke-linecap="round" />
    </svg>
    <span>{label()} — tap to show</span>
  </button>
{/if}
