<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/client/api';
  import type { UserSettings } from '$lib/schemas';
  import { toast } from '$lib/stores';

  let settings: UserSettings | null = null;
  let pwCurrent = '';
  let pwNext = '';
  let pwConfirm = '';
  let pwBusy = false;
  let importBusy = false;
  let importMode: 'append' | 'replace' = 'append';
  let theme: 'system' | 'light' | 'dark' = 'system';

  onMount(async () => {
    try {
      settings = await api.getSettings();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = '/login';
        return;
      }
      toast('error', 'Could not load settings.');
    }
    theme = (localStorage.getItem('theme') as typeof theme) ?? 'system';
  });

  async function saveSettings(): Promise<void> {
    if (!settings) return;
    try {
      settings = await api.updateSettings(settings);
      toast('success', 'Saved.');
    } catch {
      toast('error', 'Save failed.');
    }
  }

  async function changePassword(): Promise<void> {
    if (pwNext.length < 8) {
      toast('error', 'New password must be at least 8 characters.');
      return;
    }
    if (pwNext !== pwConfirm) {
      toast('error', "New passwords don't match.");
      return;
    }
    pwBusy = true;
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current: pwCurrent, next: pwNext })
      });
      if (res.ok) {
        toast('success', 'Password changed.');
        pwCurrent = pwNext = pwConfirm = '';
      } else if (res.status === 401) {
        toast('error', 'Current password is wrong.');
      } else {
        toast('error', 'Could not change password.');
      }
    } finally {
      pwBusy = false;
    }
  }

  async function exportJson(): Promise<void> {
    const res = await fetch('/api/export?format=json');
    if (!res.ok) {
      toast('error', 'Export failed.');
      return;
    }
    const blob = await res.blob();
    triggerDownload(blob, `farm-manager-${stamp()}.json`);
  }
  async function exportGeojson(): Promise<void> {
    const res = await fetch('/api/export?format=geojson');
    if (!res.ok) {
      toast('error', 'Export failed.');
      return;
    }
    const blob = await res.blob();
    triggerDownload(blob, `farm-manager-${stamp()}.geojson`);
  }
  function triggerDownload(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function stamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async function handleImportFile(ev: Event): Promise<void> {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      importMode === 'replace' &&
      !confirm(
        'REPLACE mode will delete all existing locations and events before importing. Continue?'
      )
    ) {
      input.value = '';
      return;
    }
    importBusy = true;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch(`/api/import?mode=${importMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.text();
        toast('error', 'Import failed: ' + body.slice(0, 200));
      } else {
        const body = await res.json();
        toast(
          'success',
          `Imported ${body.counts.locations} locations, ${body.counts.events} events.`
        );
      }
    } catch (err) {
      console.error(err);
      toast('error', 'Import failed — invalid JSON?');
    } finally {
      importBusy = false;
      input.value = '';
    }
  }

  const THEMES: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];

  function setTheme(t: typeof theme): void {
    theme = t;
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
    const dark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }
</script>

<svelte:head>
  <title>Settings — Farm Manager</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-900">
  <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
    <div class="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
      <a href="/" class="btn-ghost !p-2" aria-label="Back to map">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
      <h1 class="flex-1 text-lg font-semibold">Settings</h1>
      <form method="POST" action="/logout">
        <button type="submit" class="btn-ghost !text-sm">Sign out</button>
      </form>
    </div>
  </header>

  <main class="mx-auto max-w-2xl space-y-4 p-4">
    <!-- Preferences -->
    <section class="card p-4">
      <h2 class="mb-3 text-base font-semibold">Preferences</h2>
      {#if settings}
        <div class="space-y-4">
          <div>
            <span class="label">Primary unit</span>
            <div class="flex gap-2">
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" bind:group={settings.unitsPrimary} value="ha" /> Hectares (ha)
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" bind:group={settings.unitsPrimary} value="ac" /> Acres (ac)
              </label>
            </div>
          </div>
          <div>
            <span class="label">Default base layer</span>
            <div class="flex gap-2">
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" bind:group={settings.baseLayer} value="esri" /> Satellite (Esri)
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" bind:group={settings.baseLayer} value="osm" /> OpenStreetMap
              </label>
            </div>
          </div>
          <div>
            <span class="label">Theme</span>
            <div class="flex gap-2">
              {#each THEMES as t}
                <button
                  type="button"
                  class="rounded-md border px-3 py-1 text-sm capitalize"
                  class:border-pasture-500={theme === t}
                  class:text-pasture-700={theme === t}
                  class:border-slate-300={theme !== t}
                  class:dark:border-slate-600={theme !== t}
                  on:click={() => setTheme(t)}
                >
                  {t}
                </button>
              {/each}
            </div>
          </div>
          <div class="pt-2">
            <button class="btn-primary" on:click={saveSettings}>Save preferences</button>
          </div>
        </div>
      {:else}
        <p class="text-sm text-slate-500">Loading…</p>
      {/if}
    </section>

    <!-- Password -->
    <section class="card p-4">
      <h2 class="mb-3 text-base font-semibold">Change password</h2>
      <p class="mb-3 text-xs text-slate-500">
        The new password is stored as a hash in the database and overrides the
        <code>APP_PASSWORD</code> env var until you change it again. If you ever
        lose it, change <code>APP_PASSWORD</code> in your compose file and restart
        — but note that the stored hash will still override it until cleared.
      </p>
      <div class="space-y-3">
        <div>
          <label for="pw-current" class="label">Current password</label>
          <input id="pw-current" class="input" type="password" autocomplete="current-password" bind:value={pwCurrent} />
        </div>
        <div>
          <label for="pw-next" class="label">New password</label>
          <input id="pw-next" class="input" type="password" autocomplete="new-password" bind:value={pwNext} />
        </div>
        <div>
          <label for="pw-confirm" class="label">Confirm new password</label>
          <input id="pw-confirm" class="input" type="password" autocomplete="new-password" bind:value={pwConfirm} />
        </div>
        <button class="btn-primary" disabled={pwBusy} on:click={changePassword}>
          {pwBusy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </section>

    <!-- Backup -->
    <section class="card p-4">
      <h2 class="mb-3 text-base font-semibold">Backup &amp; restore</h2>
      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary" on:click={exportJson}>Download full backup (.json)</button>
          <button class="btn-secondary" on:click={exportGeojson}>Download geometry only (.geojson)</button>
        </div>
        <div>
          <span class="label">Restore a backup</span>
          <div class="mb-2 flex gap-2 text-sm">
            <label class="flex items-center gap-2">
              <input type="radio" bind:group={importMode} value="append" /> Append
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" bind:group={importMode} value="replace" /> Replace all
            </label>
          </div>
          <input
            type="file"
            accept="application/json,.json"
            class="text-sm"
            disabled={importBusy}
            on:change={handleImportFile}
          />
        </div>
      </div>
    </section>

    <!-- Install PWA -->
    <section class="card p-4">
      <h2 class="mb-2 text-base font-semibold">Install app</h2>
      <p class="text-sm text-slate-600 dark:text-slate-400">
        On Android/desktop Chrome you'll see an "Install" prompt in the address bar or menu. On iOS, open this page in Safari, tap Share, then "Add to Home Screen".
      </p>
    </section>
  </main>
</div>
