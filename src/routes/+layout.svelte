<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import MobileNav from '$lib/components/MobileNav.svelte';

  // Respect system theme + allow manual override via localStorage 'theme' key.
  onMount(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  });

  // Hide the mobile tab bar on /login (not useful there).
  $: showNav = !($page.url.pathname.startsWith('/login'));
</script>

<slot />

{#if showNav}
  <MobileNav />
{/if}
