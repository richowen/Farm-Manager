import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      srcDir: 'src',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'Farm Manager',
        short_name: 'Farm',
        description:
          'Self-hosted farm field and shed manager with timestamped event log on a satellite map.',
        theme_color: '#15803d',
        background_color: '#0b132b',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          {
            src: '/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/healthz$/,
          /^\/login/,
          /^\/logout/,
          /^\/uploads\//,
          /^\/calendar\.ics/
        ],
        runtimeCaching: [
          {
            // Esri World Imagery tile service — CacheFirst with a small cap (ToS: limited caching only).
            urlPattern:
              /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-world-imagery',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // OSM fallback tiles.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // API GETs — NetworkFirst with short fallback for brief offline viewing.
            // Exclude uploads and the calendar feed explicitly below.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/api/uploads'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }
            }
          },
          {
            // Photos — private images; never cache in the SW (browser cache
            // headers already make them cacheable by the browser itself).
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
            handler: 'NetworkOnly'
          },
          {
            // iCal feed — must always hit the network so the calendar app
            // always gets fresh data and a stale cache can't leak tasks.
            urlPattern: ({ url }) => url.pathname === '/calendar.ics',
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    port: 5173
  },
  test: {
    include: ['tests/unit/**/*.{test,spec}.{js,ts}']
  }
});
