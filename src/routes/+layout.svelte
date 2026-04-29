<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  // Respect system theme + allow manual override via localStorage 'theme' key.
  onMount(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  });
</script>

<slot />
