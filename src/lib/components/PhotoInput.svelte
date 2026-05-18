<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/client/api';
  import { toast } from '$lib/stores';
  import { resizeImage } from '$lib/utils/resizeImage';
  import type { PhotoRef } from '$lib/schemas';
  import PhotoLightbox from './PhotoLightbox.svelte';

  export let value: PhotoRef[] = [];

  const dispatch = createEventDispatcher<{ change: PhotoRef[] }>();

  let uploading = 0;
  let lightboxSrc: string | null = null;

  function emit(): void {
    dispatch('change', value);
  }

  async function onFiles(ev: Event): Promise<void> {
    const input = ev.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    for (const f of files) {
      uploading++;
      try {
        const toUpload = f.type.startsWith('image/') ? await resizeImage(f) : f;
        const ref = await api.uploadPhoto(toUpload);
        value = [...value, ref];
        emit();
      } catch (err) {
        console.error(err);
        const msg =
          err instanceof Error
            ? err.message === 'file_too_large'
              ? 'File too large.'
              : err.message === 'unsupported_type'
              ? 'Unsupported file type. Use JPG, PNG, WebP, MP4, MOV, or WebM.'
              : 'Upload failed.'
            : 'Upload failed.';
        toast('error', msg);
      } finally {
        uploading--;
      }
    }
  }

  function remove(i: number): void {
    value = value.filter((_, idx) => idx !== i);
    emit();
  }

  function openLightbox(p: PhotoRef): void {
    lightboxSrc = `/uploads/${p.path}`;
  }

  function isVideo(p: PhotoRef): boolean {
    return /\.(mp4|mov|webm|m4v|avi)$/i.test(p.path);
  }
</script>

<div class="space-y-2">
  {#if value.length > 0}
    <div class="flex flex-wrap gap-2">
      {#each value as p, i}
        <div class="relative">
          <button
            type="button"
            class="block h-16 w-16 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-600"
            on:click={() => openLightbox(p)}
            aria-label={isVideo(p) ? 'Play video' : 'View photo'}
          >
            {#if isVideo(p)}
              <!-- svelte-ignore a11y-media-has-caption -->
              <video src={`/uploads/${p.path}`} class="h-full w-full object-cover" preload="metadata" muted></video>
            {:else}
              <img src={`/uploads/${p.path}`} alt="" class="h-full w-full object-cover" loading="lazy" />
            {/if}
          </button>
          <button
            type="button"
            class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white shadow hover:bg-red-700"
            aria-label="Remove photo"
            on:click={() => remove(i)}
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}
  <label class="btn-secondary inline-flex cursor-pointer !py-1.5 !text-xs">
    {uploading > 0 ? `Uploading ${uploading}…` : '+ Add photo / video'}
    <input
      type="file"
      accept="image/*,video/*"
      multiple
      class="sr-only"
      on:change={onFiles}
      disabled={uploading > 0}
    />
  </label>
</div>

<PhotoLightbox src={lightboxSrc} on:close={() => (lightboxSrc = null)} />
