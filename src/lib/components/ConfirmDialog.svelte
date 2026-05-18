<script lang="ts">
  import { _confirmState } from '$lib/stores';

  function respond(result: boolean): void {
    const { options, resolve } = $_confirmState;
    _confirmState.set({ open: false, options, resolve: null });
    resolve?.(result);
  }
</script>

{#if $_confirmState.open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    role="dialog"
    aria-modal="true"
    class="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 p-4"
    on:click|self={() => respond(false)}
    on:keydown={(e) => e.key === 'Escape' && respond(false)}
  >
    <div class="card w-full max-w-sm rounded-2xl p-5 shadow-2xl">
      <h3 class="text-base font-semibold">
        {$_confirmState.options.title ?? 'Are you sure?'}
      </h3>
      {#if $_confirmState.options.message}
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {$_confirmState.options.message}
        </p>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-ghost" on:click={() => respond(false)}>
          {$_confirmState.options.cancelLabel ?? 'Cancel'}
        </button>
        <button
          class={$_confirmState.options.danger ? 'btn-danger' : 'btn-primary'}
          on:click={() => respond(true)}
        >
          {$_confirmState.options.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}
