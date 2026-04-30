import { overlayCount } from '$lib/stores';

interface Entry {
  id: number;
  close: () => void;
}

const stack: Entry[] = [];
let nextId = 1;
let suppressNextPop = false;
let installed = false;

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', () => {
    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }
    const top = stack.pop();
    if (!top) return;
    overlayCount.update((n) => Math.max(0, n - 1));
    try {
      top.close();
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Register an overlay. Returns a dispose function the component calls when it
 * closes itself via its own UI (X button, backdrop, Cancel, save-success).
 * Calling dispose while the overlay is at the top of the stack consumes the
 * matching history entry via `history.back()` so the user can't navigate to a
 * stale state. If the overlay is no longer at the top (already popped by
 * popstate), dispose is a no-op.
 */
export function openOverlay(close: () => void): () => void {
  install();
  const id = nextId++;
  const entry: Entry = { id, close };
  stack.push(entry);
  overlayCount.update((n) => n + 1);
  // Preserve SvelteKit's state keys so scroll restoration etc. keep working.
  const prev = (history.state ?? {}) as Record<string, unknown>;
  history.pushState({ ...prev, overlay: id }, '');

  return () => {
    const idx = stack.indexOf(entry);
    if (idx === -1) return; // already removed by popstate
    if (idx === stack.length - 1) {
      stack.pop();
      overlayCount.update((n) => Math.max(0, n - 1));
      suppressNextPop = true;
      history.back();
    } else {
      // Not at top (rare — another overlay was opened above us then already
      // dismissed). Just remove our entry; leave history untouched.
      stack.splice(idx, 1);
      overlayCount.update((n) => Math.max(0, n - 1));
    }
  };
}
