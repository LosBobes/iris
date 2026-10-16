// Iris service worker (template).
//
// pwa/vite-plugin.ts prepends two constants and emits the result as /sw.js on
// every production build:
//   PRECACHE_VERSION  hash of the build's file list (changes on every deploy)
//   PRECACHE_URLS     every file Vite emitted plus everything in public/
//
// What it does, and deliberately does not do:
// - Precaches the app shell and all hashed chunks so the installed app opens
//   instantly and lazy routes still load on a flaky shop-floor connection.
// - Navigations are network-first: an online user always gets the freshly
//   deployed index.html; the cached copy is only an offline fallback.
// - API traffic is never touched. Responses are tenant- and session-scoped
//   (iris_session cookie), so caching them could show one user's data to the
//   next person on the same device. Anything not in PRECACHE_URLS and not a
//   navigation falls straight through to the network.

const CACHE_PREFIX = 'iris-precache-'
const CACHE_NAME = CACHE_PREFIX + PRECACHE_VERSION
const SHELL_URL = '/index.html'
const PRECACHED = new Set(PRECACHE_URLS)

// Paths that must always reach the server even on a navigation: the API
// behind the nginx proxy, and anything the browser opens directly from it
// (PDF work-order reports open in a new tab).
const BYPASS_PREFIXES = ['/api/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // cache: 'reload' skips the HTTP cache so a stale index.html or chunk
        // from before the deploy can never end up precached.
        // Deduplicated because addAll rejects a list naming the same URL
        // twice, and the build already lists index.html.
        cache.addAll(
          [...new Set([SHELL_URL, ...PRECACHE_URLS])].map(
            (url) => new Request(url, { cache: 'reload' }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(SHELL_URL).then((cached) => cached || Response.error()),
      ),
    )
    return
  }

  if (PRECACHED.has(url.pathname)) {
    event.respondWith(
      caches.match(url.pathname).then((cached) => cached || fetch(request)),
    )
  }
})
