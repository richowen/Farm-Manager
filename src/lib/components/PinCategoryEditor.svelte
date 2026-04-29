<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { DEFAULT_PIN_CATEGORY_COLORS } from '$lib/schemas';
  import { toast } from '$lib/stores';

  export let categories: string[] = [];
  export let colors: Record<string, string> = {};

  const dispatch = createEventDispatcher<{
    change: { categories: string[]; colors: Record<string, string> };
  }>();

  let newCategory = '';

  function colorFor(cat: string): string {
    return colors[cat] ?? DEFAULT_PIN_CATEGORY_COLORS[cat] ?? '#6366f1';
  }

  function emit(
    next: { categories: string[]; colors: Record<string, string> }
  ): void {
    categories = next.categories;
    colors = next.colors;
    dispatch('change', next);
  }

  function addCategory(): void {
    const cleaned = newCategory.trim().toLowerCase();
    if (!cleaned) return;
    if (categories.includes(cleaned)) {
      toast('info', 'Already in list.');
      return;
    }
    emit({
      categories: [...categories, cleaned],
      colors
    });
    newCategory = '';
  }

  function removeCategory(c: string): void {
    if (
      !confirm(
        `Remove "${c}" from the pin category list? (Existing pins keep this category; they just won't be suggested.)`
      )
    ) return;
    const nextColors = { ...colors };
    delete nextColors[c];
    emit({
      categories: categories.filter((x) => x !== c),
      colors: nextColors
    });
  }

  function onColorInput(c: string, ev: Event): void {
    const val = (ev.currentTarget as HTMLInputElement).value;
    emit({
      categories,
      colors: { ...colors, [c]: val }
    });
  }
</script>

<div>
  <ul class="space-y-2">
    {#each categories as c}
      <li class="flex items-center gap-2">
        <input
          type="color"
          class="h-8 w-10 shrink-0 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
          value={colorFor(c)}
          on:input={(e) => onColorInput(c, e)}
          aria-label={`Colour for ${c}`}
        />
        <span class="flex-1 capitalize">{c.replaceAll('-', ' ')}</span>
        <button
          class="text-xs text-slate-500 hover:text-red-600"
          on:click={() => removeCategory(c)}
        >
          Remove
        </button>
      </li>
    {/each}
  </ul>
  <div class="mt-3 flex gap-2">
    <input
      class="input flex-1"
      placeholder="Add new category…"
      bind:value={newCategory}
      on:keydown={(e) => e.key === 'Enter' && addCategory()}
    />
    <button class="btn-secondary" on:click={addCategory}>Add</button>
  </div>
</div>
