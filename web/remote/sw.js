const CACHE_NAME = 'pica-remote-shell-w5c-v1'
const SHELL_ASSETS = [
  '/remote/',
  '/remote/remote.js',
  '/remote/remote.css',
  '/remote/manifest.webmanifest',
  '/remote/icon.svg'
]
const SHELL_PATHS = new Set(SHELL_ASSETS)

async function refreshShellCache() {
  const cache = await caches.open(CACHE_NAME)
  for (const url of SHELL_ASSETS) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'reload'
    })
    if (!response.ok)
      throw new Error(`Pica Remote shell asset failed: ${url}`)
    await cache.put(url, response.clone())
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    refreshShellCache().then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith('pica-remote-shell-') &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (
    url.origin !== self.location.origin ||
    !SHELL_PATHS.has(url.pathname)
  )
    return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
          )
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        return cached || Response.error()
      })
  )
})
