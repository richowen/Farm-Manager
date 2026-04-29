<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  $: next = $page.url.searchParams.get('next') ?? '/';
</script>

<svelte:head>
  <title>Sign in — {data.appName}</title>
</svelte:head>

<main
  class="flex min-h-screen items-center justify-center bg-gradient-to-br from-pasture-700 to-pasture-900 p-4"
>
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center text-white">
      <div
        class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur"
        aria-hidden="true"
      >
        <svg class="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 21V9l9-6 9 6v12" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M9 21V12h6v9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h1 class="text-2xl font-semibold">{data.appName}</h1>
      <p class="text-sm text-pasture-100/80">Sign in to continue</p>
    </div>

    <form
      method="POST"
      use:enhance
      class="card space-y-4 p-6"
      autocomplete="on"
    >
      <div>
        <label for="password" class="label">Password</label>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          class="input"
          autofocus
        />
      </div>

      <input type="hidden" name="next" value={next} />

      {#if form?.error}
        <p class="text-sm text-red-600 dark:text-red-400">{form.error}</p>
      {/if}

      <button type="submit" class="btn-primary w-full">Sign in</button>
    </form>
  </div>
</main>
