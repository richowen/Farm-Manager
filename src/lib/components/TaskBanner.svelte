<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/client/api';

  let dismissed = false;
  let counts: { overdue: number; dueToday: number; open: number } | null = null;

  onMount(async () => {
    // Dismissed for this browser tab session.
    if (sessionStorage.getItem('task-banner-dismissed') === '1') {
      dismissed = true;
      return;
    }
    try {
      const res = await api.listTasks('all', true);
      counts = res.counts ?? null;
    } catch {
      /* non-fatal */
    }
  });

  function dismiss(): void {
    dismissed = true;
    sessionStorage.setItem('task-banner-dismissed', '1');
  }

  $: show =
    !dismissed &&
    counts !== null &&
    (counts.overdue > 0 || counts.dueToday > 0);
</script>

{#if show && counts}
  <div class="pointer-events-auto absolute inset-x-0 top-16 z-[900] flex justify-center px-3">
    <div class="flex max-w-xl items-center gap-3 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-medium text-white shadow-lg">
      {#if counts.overdue > 0}
        <span>
          <strong>{counts.overdue}</strong> overdue
        </span>
      {/if}
      {#if counts.dueToday > 0}
        <span>
          <strong>{counts.dueToday}</strong> due today
        </span>
      {/if}
      <a href="/tasks" class="underline decoration-white/60 hover:decoration-white">View tasks</a>
      <button
        class="text-white/70 hover:text-white"
        aria-label="Dismiss"
        on:click={dismiss}
      >
        ×
      </button>
    </div>
  </div>
{/if}
