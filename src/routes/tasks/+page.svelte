<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/client/api';
  import { locations, toast } from '$lib/stores';
  import type { LocationRecord, Recurrence, TaskRecord } from '$lib/schemas';
  import { formatDate, formatDateTime, formatRelative } from '$lib/utils/format';

  type FilterKey = 'due' | 'overdue' | 'upcoming' | 'done';
  const FILTERS: Array<{ id: FilterKey; label: string }> = [
    { id: 'overdue', label: 'Overdue' },
    { id: 'due', label: 'Due today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'done', label: 'Done' }
  ];

  let activeFilter: FilterKey = 'upcoming';
  let allTasks: TaskRecord[] = [];
  let allLocations: LocationRecord[] = [];
  let loading = false;

  let showForm = false;
  let editingId: string | null = null;
  let f_title = '';
  let f_notes = '';
  let f_due = '';
  let f_location = '';
  let f_recurrence: Recurrence = 'none';
  let f_saving = false;
  let formError = '';

  onMount(async () => {
    try {
      const locs = await api.listLocations();
      locations.set(locs.items);
      allLocations = locs.items;
    } catch {
      /* non-fatal */
    }
    // Deep-link: /tasks#<id> opens the editor for that task.
    await reload();
    const hashId = $page.url.hash?.replace(/^#/, '');
    if (hashId) {
      const t = allTasks.find((x) => x.id === hashId);
      if (t) openEdit(t);
    }
  });

  async function reload(): Promise<void> {
    loading = true;
    try {
      const res = await api.listTasks('all');
      allTasks = res.items;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error(err);
      toast('error', 'Failed to load tasks.');
    } finally {
      loading = false;
    }
  }

  function filtered(tasks: TaskRecord[], filter: FilterKey): TaskRecord[] {
    const now = Date.now();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return tasks.filter((t) => {
      if (filter === 'done') return !!t.done_at;
      if (t.done_at) return false;
      const due = new Date(t.due_at).getTime();
      if (filter === 'overdue') return due < now;
      if (filter === 'due') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return due >= start.getTime() && due <= todayEnd.getTime();
      }
      // upcoming
      return due > todayEnd.getTime();
    });
  }

  $: shown = filtered(allTasks, activeFilter);

  function openNew(): void {
    editingId = null;
    f_title = '';
    f_notes = '';
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    f_due = now.toISOString().slice(0, 16);
    f_location = '';
    f_recurrence = 'none';
    formError = '';
    showForm = true;
  }

  function openEdit(t: TaskRecord): void {
    editingId = t.id;
    f_title = t.title;
    f_notes = t.notes ?? '';
    f_due = new Date(t.due_at).toISOString().slice(0, 16);
    f_location = t.location_id ?? '';
    f_recurrence = t.recurrence;
    formError = '';
    showForm = true;
  }

  async function submitForm(): Promise<void> {
    if (!f_title.trim()) {
      formError = 'Title is required.';
      return;
    }
    f_saving = true;
    try {
      const payload = {
        title: f_title.trim(),
        notes: f_notes || null,
        due_at: new Date(f_due).toISOString(),
        location_id: f_location || null,
        recurrence: f_recurrence
      };
      if (editingId) await api.updateTask(editingId, payload);
      else await api.createTask(payload);
      showForm = false;
      await reload();
      toast('success', editingId ? 'Task updated.' : 'Task created.');
    } catch (err) {
      console.error(err);
      toast('error', 'Save failed.');
    } finally {
      f_saving = false;
    }
  }

  async function completeTask(t: TaskRecord): Promise<void> {
    try {
      const res = await api.completeTask(t.id);
      await reload();
      if (res.next) {
        toast('success', `Marked done. Next ${t.recurrence} task on ${formatDate(res.next.due_at)}.`);
      } else {
        toast('success', 'Marked done.');
      }
    } catch (err) {
      console.error(err);
      toast('error', 'Could not complete.');
    }
  }

  async function deleteTask(t: TaskRecord): Promise<void> {
    if (!confirm(`Delete "${t.title}"?`)) return;
    try {
      await api.deleteTask(t.id);
      await reload();
      toast('success', 'Deleted.');
    } catch {
      toast('error', 'Delete failed.');
    }
  }

  async function snooze(t: TaskRecord, days: number): Promise<void> {
    const when = new Date(t.due_at);
    when.setDate(when.getDate() + days);
    try {
      await api.updateTask(t.id, { due_at: when.toISOString() });
      await reload();
      toast('success', `Snoozed ${days} day${days === 1 ? '' : 's'}.`);
    } catch {
      toast('error', 'Snooze failed.');
    }
  }

  // ---- Swipe-to-delete (touch) ------------------------------------------
  let swipeX = new Map<string, number>();
  let startX = 0;
  let swipingId: string | null = null;

  function onTouchStart(id: string, ev: TouchEvent): void {
    swipingId = id;
    startX = ev.touches[0].clientX;
  }
  function onTouchMove(id: string, ev: TouchEvent): void {
    if (swipingId !== id) return;
    const dx = ev.touches[0].clientX - startX;
    if (dx < 0) {
      swipeX.set(id, Math.max(dx, -120));
      swipeX = new Map(swipeX);
    }
  }
  function onTouchEnd(id: string, t: TaskRecord): void {
    const dx = swipeX.get(id) ?? 0;
    if (dx < -80) {
      void deleteTask(t);
    }
    swipeX.delete(id);
    swipeX = new Map(swipeX);
    swipingId = null;
  }

  function locationName(id: string | null): string | null {
    if (!id) return null;
    return allLocations.find((l) => l.id === id)?.name ?? null;
  }

  function counts(key: FilterKey): number {
    return filtered(allTasks, key).length;
  }
</script>

<svelte:head>
  <title>Tasks — Farm Manager</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
  <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
    <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
      <a href="/" class="btn-ghost !p-2" aria-label="Back to map">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
      <h1 class="flex-1 text-lg font-semibold">Tasks</h1>
      <button class="btn-primary !py-1.5 !text-xs" on:click={openNew}>+ New</button>
    </div>
    <nav class="mx-auto flex max-w-3xl gap-1 px-2 pb-2 overflow-x-auto">
      {#each FILTERS as f}
        <button
          class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          class:bg-pasture-600={activeFilter === f.id}
          class:text-white={activeFilter === f.id}
          class:text-slate-600={activeFilter !== f.id}
          class:hover:bg-slate-100={activeFilter !== f.id}
          class:dark:text-slate-300={activeFilter !== f.id}
          class:dark:hover:bg-slate-800={activeFilter !== f.id}
          on:click={() => (activeFilter = f.id)}
        >
          {f.label}
          <span
            class="rounded-full px-1.5 py-0 text-[10px] tabular-nums"
            class:bg-white={activeFilter === f.id}
            class:text-pasture-700={activeFilter === f.id}
            class:bg-slate-200={activeFilter !== f.id}
            class:dark:bg-slate-700={activeFilter !== f.id}
          >
            {counts(f.id)}
          </span>
        </button>
      {/each}
    </nav>
  </header>

  <main class="mx-auto max-w-3xl p-4">
    {#if loading && shown.length === 0}
      <p class="text-sm text-slate-500">Loading…</p>
    {:else if shown.length === 0}
      <div class="card p-8 text-center text-sm text-slate-500">
        {#if activeFilter === 'done'}
          No completed tasks.
        {:else if activeFilter === 'overdue'}
          Nothing overdue — nice.
        {:else if activeFilter === 'due'}
          Nothing due today.
        {:else}
          No upcoming tasks. Tap <strong>+ New</strong> to add one.
        {/if}
      </div>
    {:else}
      <ul class="card divide-y divide-slate-200 overflow-hidden dark:divide-slate-700">
        {#each shown as t (t.id)}
          <li
            class="relative overflow-hidden"
            on:touchstart={(e) => onTouchStart(t.id, e)}
            on:touchmove={(e) => onTouchMove(t.id, e)}
            on:touchend={() => onTouchEnd(t.id, t)}
          >
            <div
              class="absolute inset-y-0 right-0 flex items-center bg-red-600 pr-4 text-xs font-semibold text-white"
            >
              Delete
            </div>
            <div
              class="relative flex items-start gap-3 bg-white p-3 dark:bg-slate-800"
              style="transform: translateX({swipeX.get(t.id) ?? 0}px); transition: {swipingId === t.id ? 'none' : 'transform 120ms ease-out'}"
            >
              <button
                class="mt-1 h-5 w-5 shrink-0 rounded-full border-2"
                class:border-pasture-600={!t.done_at}
                class:bg-pasture-600={t.done_at}
                class:border-slate-300={!t.done_at && false}
                aria-label="Mark complete"
                disabled={!!t.done_at}
                on:click={() => completeTask(t)}
              >
                {#if t.done_at}
                  <svg viewBox="0 0 24 24" class="h-4 w-4 text-white"><path fill="currentColor" d="m9 16.2-3.5-3.6L4 14l5 5 11-11-1.4-1.4z" /></svg>
                {/if}
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="font-medium" class:line-through={!!t.done_at} class:text-slate-400={!!t.done_at}>
                    {t.title}
                  </p>
                  <time
                    class="shrink-0 text-xs"
                    class:text-red-600={!t.done_at && new Date(t.due_at) < new Date()}
                    class:text-slate-500={!(!t.done_at && new Date(t.due_at) < new Date())}
                    title={formatDateTime(t.due_at)}
                  >
                    {formatRelative(t.due_at)}
                  </time>
                </div>
                <p class="text-xs text-slate-500">
                  {formatDate(t.due_at)}
                  {#if t.recurrence !== 'none'}
                    &middot; repeats {t.recurrence}
                  {/if}
                  {#if locationName(t.location_id)}
                    &middot; <a class="text-pasture-600 hover:underline" href="/?location={t.location_id}">{locationName(t.location_id)}</a>
                  {/if}
                </p>
                {#if t.notes}
                  <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{t.notes}</p>
                {/if}
                <div class="mt-1.5 flex gap-3 text-xs">
                  <button class="text-slate-500 hover:text-pasture-600" on:click={() => openEdit(t)}>Edit</button>
                  {#if !t.done_at}
                    <button class="text-slate-500 hover:text-pasture-600" on:click={() => snooze(t, 1)}>+1 day</button>
                    <button class="text-slate-500 hover:text-pasture-600" on:click={() => snooze(t, 7)}>+1 week</button>
                  {/if}
                  <button class="text-slate-500 hover:text-red-600" on:click={() => deleteTask(t)}>Delete</button>
                </div>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>

{#if showForm}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    role="dialog"
    aria-modal="true"
    class="fixed inset-0 z-[2500] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    on:click|self={() => (showForm = false)}
    on:keydown={(e) => e.key === 'Escape' && (showForm = false)}
  >
    <div class="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5 sm:rounded-2xl">
      <h2 class="mb-3 text-lg font-semibold">{editingId ? 'Edit task' : 'New task'}</h2>
      <div class="space-y-3">
        <div>
          <label for="t-title" class="label">Title</label>
          <!-- svelte-ignore a11y-autofocus -->
          <input id="t-title" class="input" bind:value={f_title} autofocus maxlength="300" />
        </div>
        <div>
          <label for="t-due" class="label">Due</label>
          <input id="t-due" type="datetime-local" class="input" bind:value={f_due} />
        </div>
        <div>
          <label for="t-loc" class="label">Location (optional)</label>
          <select id="t-loc" class="input" bind:value={f_location}>
            <option value="">(none)</option>
            {#each allLocations as l}
              <option value={l.id}>{l.name} ({l.kind})</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="t-rec" class="label">Recurrence</label>
          <select id="t-rec" class="input" bind:value={f_recurrence}>
            <option value="none">One-off</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label for="t-notes" class="label">Notes</label>
          <textarea id="t-notes" class="input" rows="3" bind:value={f_notes} maxlength="5000"></textarea>
        </div>
        {#if formError}
          <p class="text-sm text-red-600">{formError}</p>
        {/if}
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" on:click={() => (showForm = false)}>Cancel</button>
          <button class="btn-primary" disabled={f_saving} on:click={submitForm}>
            {f_saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
