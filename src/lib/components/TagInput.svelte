<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: string[] = [];
  /** Autocomplete suggestions from existing tags. */
  export let suggestions: string[] = [];
  export let placeholder = 'Add tag…';

  const dispatch = createEventDispatcher<{ change: string[] }>();

  let input = '';
  let inputEl: HTMLInputElement;

  function emit(): void {
    dispatch('change', value);
  }

  function commit(raw: string): void {
    const cleaned = raw.trim().replace(/^#+/, '').toLowerCase();
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    value = [...value, cleaned];
    emit();
  }

  function remove(i: number): void {
    value = value.filter((_, idx) => idx !== i);
    emit();
  }

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      commit(input);
      input = '';
    } else if (ev.key === 'Backspace' && input === '' && value.length > 0) {
      ev.preventDefault();
      remove(value.length - 1);
    }
  }

  $: filteredSuggestions = input
    ? suggestions
        .filter(
          (s) =>
            !value.includes(s) &&
            s.toLowerCase().includes(input.replace(/^#+/, '').toLowerCase())
        )
        .slice(0, 6)
    : [];
</script>

<div class="relative">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    class="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-within:border-pasture-500 focus-within:ring-1 focus-within:ring-pasture-500 dark:border-slate-600 dark:bg-slate-800"
    on:click={() => inputEl?.focus()}
    on:keydown={(e) => e.key === 'Enter' && inputEl?.focus()}
    role="group"
    tabindex="-1"
  >
    {#each value as tag, i}
      <span class="inline-flex items-center gap-1 rounded-full bg-pasture-100 px-2 py-0.5 text-xs text-pasture-800 dark:bg-pasture-600/20 dark:text-pasture-300">
        #{tag}
        <button
          type="button"
          class="text-pasture-500 hover:text-pasture-800 dark:hover:text-pasture-100"
          aria-label={`Remove tag ${tag}`}
          on:click|stopPropagation={() => remove(i)}
        >
          ×
        </button>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      bind:value={input}
      class="flex-1 min-w-[6ch] bg-transparent py-1 outline-none"
      placeholder={value.length === 0 ? placeholder : ''}
      on:keydown={onKey}
      on:blur={() => {
        if (input.trim()) {
          commit(input);
          input = '';
        }
      }}
    />
  </div>
  {#if filteredSuggestions.length > 0}
    <ul class="absolute left-0 right-0 z-10 mt-1 max-h-32 overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
      {#each filteredSuggestions as s}
        <li>
          <button
            type="button"
            class="flex w-full px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
            on:mousedown|preventDefault={() => {
              commit(s);
              input = '';
            }}
          >
            #{s}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
