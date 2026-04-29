<script lang="ts">
  import { EVENT_META } from '$lib/utils/event-types';
  import type { EventType } from '$lib/schemas';

  export let type: EventType;
  export let size: 'sm' | 'md' = 'md';

  $: meta = EVENT_META[type];
  $: dimension = size === 'sm' ? 16 : 20;
</script>

<span
  class="inline-flex items-center justify-center rounded-full"
  style="background: {meta.color}; width: {dimension + 12}px; height: {dimension + 12}px;"
  title={meta.label}
  aria-hidden="true"
>
  <svg
    viewBox="0 0 24 24"
    width={dimension}
    height={dimension}
    fill="none"
    stroke="#fff"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={meta.icon} />
  </svg>
</span>
