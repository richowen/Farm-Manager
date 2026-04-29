<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/client/api';
  import { DEFAULT_USE_COLORS, type LocationRecord, type UserSettings } from '$lib/schemas';
  import { toast } from '$lib/stores';

  let settings: UserSettings | null = null;
  let pwCurrent = '';
  let pwNext = '';
  let pwConfirm = '';
  let pwBusy = false;
  let importBusy = false;
  let importMode: 'append' | 'replace' = 'append';
  let theme: 'system' | 'light' | 'dark' = 'system';

  // iCal
  let icalBusy = false;

  // Use types
  let newUseType = '';

  // Legacy line classification prompt (v0.2.1 upgrade).
  let legacyLines: LocationRecord[] = [];
  let legacyDialogOpen = false;
  let legacyBusy = false;

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

    // Check for unclassified legacy line rows once per install — show the
    // bulk-assign dialog on first visit after upgrading to 0.2.1.
    if (settings && !settings.legacyLinesPrompted) {
      try {
        const { items } = await api.listLocations();
        legacyLines = items.filter(
          (l) => l.kind === 'line' && !l.line_type
        );
        if (legacyLines.length > 0) {
          legacyDialogOpen = true;
        } else {
          // No legacy rows → flip the flag so we don't re-check next load.
          await api.updateSettings({ legacyLinesPrompted: true });
          if (settings) settings = { ...settings, legacyLinesPrompted: true };
        }
      } catch {
        /* non-fatal */
      }
    }
  });

  async function classifyLegacy(
    lineType: 'pipe' | 'drain' | null
  ): Promise<void> {
    legacyBusy = true;
    try {
      if (lineType && legacyLines.length > 0) {
        const ids = legacyLines.map((l) => l.id);
        const color = lineType === 'pipe' ? '#3b82f6' : '#92400e';
        await api.batchLocationsPatch({
          ids,
          patch: { line_type: lineType, color }
        });
      }
      await api.updateSettings({ legacyLinesPrompted: true });
      if (settings) settings = { ...settings, legacyLinesPrompted: true };
      legacyDialogOpen = false;
      if (lineType) {
        toast('success', `Updated ${legacyLines.length} lines.`);
      }
      legacyLines = [];
    } catch (err) {
      console.error(err);
      toast('error', 'Could not update legacy lines.');
    } finally {
      legacyBusy = false;
    }
  }

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
        'REPLACE mode will delete all existing locations, events, field-use history, and tasks before importing. Continue?'
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
        const parts = [
          `${body.counts.locations} locations`,
          `${body.counts.events} events`
        ];
        if (body.counts.field_uses) parts.push(`${body.counts.field_uses} use periods`);
        if (body.counts.tasks) parts.push(`${body.counts.tasks} tasks`);
        toast('success', 'Imported ' + parts.join(', ') + '.');
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

  // ---- iCal feed ----------------------------------------------------------
  async function rotateIcal(): Promise<void> {
    if (settings?.icalFeedToken) {
      if (!confirm('Rotating will invalidate the current URL — any existing subscriptions will stop updating until you re-subscribe with the new URL. Continue?')) return;
    }
    icalBusy = true;
    try {
      const res = await api.rotateIcalToken();
      if (settings) settings = { ...settings, icalFeedToken: res.token };
      toast('success', 'Feed URL generated.');
    } catch {
      toast('error', 'Could not generate feed URL.');
    } finally {
      icalBusy = false;
    }
  }

  async function disableIcal(): Promise<void> {
    if (!confirm('Disable the calendar feed? The URL will stop working.')) return;
    icalBusy = true;
    try {
      await api.disableIcalToken();
      if (settings) settings = { ...settings, icalFeedToken: null };
      toast('success', 'Feed disabled.');
    } catch {
      toast('error', 'Could not disable feed.');
    } finally {
      icalBusy = false;
    }
  }

  function icalUrl(): string {
    if (!settings?.icalFeedToken) return '';
    const base =
      typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}`
        : '';
    return `${base}/calendar.ics?token=${settings.icalFeedToken}`;
  }

  async function copyIcalUrl(): Promise<void> {
    const url = icalUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast('success', 'URL copied.');
    } catch {
      toast('error', 'Copy failed — select it manually.');
    }
  }

  // ---- Use types ----------------------------------------------------------
  function addUseType(): void {
    if (!settings) return;
    const cleaned = newUseType.trim().toLowerCase();
    if (!cleaned) return;
    if (settings.useTypes.includes(cleaned)) {
      toast('info', 'Already in list.');
      return;
    }
    settings = {
      ...settings,
      useTypes: [...settings.useTypes, cleaned]
    };
    newUseType = '';
  }

  function removeUseType(t: string): void {
    if (!settings) return;
    if (!confirm(`Remove "${t}" from use type list? (Existing history entries keep this type; they just won't be suggested.)`)) return;
    settings = {
      ...settings,
      useTypes: settings.useTypes.filter((x) => x !== t)
    };
  }

  function colorForUseType(t: string): string {
    if (!settings) return '#9ca3af';
    return settings.useColors[t] ?? DEFAULT_USE_COLORS[t] ?? '#6366f1';
  }

  function onUseColorInput(t: string, ev: Event): void {
    const val = (ev.currentTarget as HTMLInputElement).value;
    setUseColor(t, val);
  }

  function setUseColor(t: string, c: string): void {
    if (!settings) return;
    settings = {
      ...settings,
      useColors: { ...settings.useColors, [t]: c }
    };
  }
</script>

<svelte:head>
  <title>Settings — Farm Manager</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-900 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pb-4">
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

    <!-- Use types -->
    <section class="card p-4">
      <h2 class="mb-1 text-base font-semibold">Field use types</h2>
      <p class="mb-3 text-xs text-slate-500">
        Types available when starting a new field-use period. Colours are used when the map is set to "colour by current use".
      </p>
      {#if settings}
        <ul class="space-y-2">
          {#each settings.useTypes as t}
            <li class="flex items-center gap-2">
              <input
                type="color"
                class="h-8 w-10 shrink-0 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
                value={colorForUseType(t)}
                on:input={(e) => onUseColorInput(t, e)}
                aria-label="Colour for {t}"
              />
              <span class="flex-1 capitalize">{t}</span>
              <button class="text-xs text-slate-500 hover:text-red-600" on:click={() => removeUseType(t)}>Remove</button>
            </li>
          {/each}
        </ul>
        <div class="mt-3 flex gap-2">
          <input
            class="input flex-1"
            placeholder="Add new use type…"
            bind:value={newUseType}
            on:keydown={(e) => e.key === 'Enter' && addUseType()}
          />
          <button class="btn-secondary" on:click={addUseType}>Add</button>
        </div>
        <div class="mt-3">
          <button class="btn-primary" on:click={saveSettings}>Save use types</button>
        </div>
      {/if}
    </section>

    <!-- Calendar feed -->
    <section class="card p-4">
      <h2 class="mb-1 text-base font-semibold">Calendar feed</h2>
      <p class="mb-3 text-xs text-slate-500">
        Subscribe from Google Calendar / Apple Calendar / Outlook to see your farm tasks in your normal calendar. Anyone with this URL can read your tasks — keep it private.
      </p>
      {#if settings?.icalFeedToken}
        <div class="space-y-2">
          <label for="ical-url" class="label">Your feed URL</label>
          <div class="flex gap-2">
            <input id="ical-url" class="input font-mono text-xs" readonly value={icalUrl()} />
            <button class="btn-secondary shrink-0" on:click={copyIcalUrl}>Copy</button>
          </div>
          <details class="text-xs">
            <summary class="cursor-pointer text-slate-500">How to subscribe</summary>
            <ul class="mt-2 space-y-1 text-slate-600 dark:text-slate-400">
              <li><strong>Google Calendar</strong> (desktop): Other calendars → + → From URL → paste</li>
              <li><strong>Apple Calendar</strong>: File → New Calendar Subscription → paste</li>
              <li><strong>Outlook</strong>: Add calendar → Subscribe from web → paste</li>
            </ul>
            <p class="mt-2 text-slate-500">
              Calendars poll on their own cadence (hours, not minutes) — completing a task in Farm Manager may take a while to reflect. Ticking done in Google Calendar does not mark it done here (read-only feed).
            </p>
          </details>
          <div class="flex gap-2 pt-1">
            <button class="btn-secondary !text-xs" disabled={icalBusy} on:click={rotateIcal}>
              {icalBusy ? '…' : 'Rotate URL'}
            </button>
            <button class="btn-danger !text-xs" disabled={icalBusy} on:click={disableIcal}>Disable feed</button>
          </div>
        </div>
      {:else}
        <p class="text-sm text-slate-500 mb-3">Feed is disabled.</p>
        <button class="btn-primary" disabled={icalBusy} on:click={rotateIcal}>
          {icalBusy ? '…' : 'Generate feed URL'}
        </button>
      {/if}
    </section>

    <!-- Password -->
    <section class="card p-4">
      <h2 class="mb-3 text-base font-semibold">Change password</h2>
      <p class="mb-3 text-xs text-slate-500">
        The new password is stored as a hash in the database and overrides the
        <code>APP_PASSWORD</code> env var until you change it again.
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
      <p class="mb-3 text-xs text-slate-500">
        The JSON backup now includes field-use history and tasks as well as locations and events. v1 backups (from Farm Manager 0.1) still import correctly.
      </p>
      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary" on:click={exportJson}>Download full backup (.json)</button>
          <button class="btn-secondary" on:click={exportGeojson}>Download geometry only (.geojson)</button>
        </div>
        <p class="text-xs text-slate-500">
          Photos are stored in the uploads volume (<code>/data/uploads</code>) and are not included in the JSON export — back them up from the host (see README).
        </p>
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

{#if legacyDialogOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    role="dialog"
    aria-modal="true"
    class="fixed inset-0 z-[2500] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    on:keydown={(e) => e.key === 'Escape' && !legacyBusy && classifyLegacy(null)}
  >
    <div class="card w-full max-w-md p-5 sm:rounded-2xl">
      <h2 class="text-lg font-semibold">Classify existing lines</h2>
      <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Farm Manager now separates lines into <strong>water pipes</strong> and
        <strong>drains</strong>. You have
        <strong>{legacyLines.length}</strong>
        existing line{legacyLines.length === 1 ? '' : 's'} to classify.
      </p>
      <p class="mt-2 text-xs text-slate-500">
        You can change an individual line's type later from its detail panel.
      </p>
      <div class="mt-4 flex flex-col gap-2">
        <button
          class="btn-primary"
          style="background:#3b82f6"
          disabled={legacyBusy}
          on:click={() => classifyLegacy('pipe')}
        >
          {legacyBusy ? '…' : `Assign all to water pipe (${legacyLines.length})`}
        </button>
        <button
          class="btn-primary"
          style="background:#92400e"
          disabled={legacyBusy}
          on:click={() => classifyLegacy('drain')}
        >
          {legacyBusy ? '…' : `Assign all to drain (${legacyLines.length})`}
        </button>
        <button
          class="btn-ghost"
          disabled={legacyBusy}
          on:click={() => classifyLegacy(null)}
        >
          Leave generic — do later
        </button>
      </div>
    </div>
  </div>
{/if}
