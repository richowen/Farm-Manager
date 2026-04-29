<script lang="ts">
  import { page } from '$app/stores';

  $: pathname = $page.url.pathname;

  const items: Array<{ href: string; label: string; icon: string; match: (p: string) => boolean }> = [
    {
      href: '/',
      label: 'Map',
      icon: 'M9 20 3 18V4l6 2m0 14 6-2m-6 2V6m6 12 6 2V6l-6-2m0 14V4',
      match: (p) => p === '/' || p === ''
    },
    {
      href: '/timeline',
      label: 'Timeline',
      icon: 'M4 7h16M4 12h12M4 17h8',
      match: (p) => p.startsWith('/timeline')
    },
    {
      href: '/tasks',
      label: 'Tasks',
      icon: 'M5 12l5 5L20 7',
      match: (p) => p.startsWith('/tasks')
    },
    {
      href: '/settings',
      label: 'More',
      icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8L4.2 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
      match: (p) => p.startsWith('/settings')
    }
  ];
</script>

<nav
  class="fixed inset-x-0 bottom-0 z-[2000] flex items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:hidden"
>
  {#each items as item}
    {@const active = item.match(pathname)}
    <a
      href={item.href}
      class="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium"
      class:text-pasture-600={active}
      class:text-slate-500={!active}
      aria-current={active ? 'page' : undefined}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d={item.icon} stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {item.label}
    </a>
  {/each}
</nav>
