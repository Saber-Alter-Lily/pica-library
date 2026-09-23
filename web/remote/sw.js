const CACHE_PREFIX = 'pica-remote-shell-'
const CACHE_NAME = CACHE_PREFIX + 'v1'
const SHELL = Object.freeze([
  '/remote/',
  '/remote/styles.css',
  '/remote/app.js',
  '/remote/manifest.webmanifest',
  '/remote/icon.svg'
])
const SHELL_SET = new Set(SHELL)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Private library/API content is deliberately network-only in W5A.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/remote/session' ||
    url.pathname.startsWith('/remote/session/')
  ) return

  if (!SHELL_SET.has(url.pathname)) return

  if (url.pathname === '/remote/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put('/remote/', copy))
            )
          }
          return response
        })
        .catch(() => caches.match('/remote/').then((response) => response || Response.error()))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  )
})
