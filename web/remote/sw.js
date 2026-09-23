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
      credentials: 'omit',
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
    (async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(url.pathname, response.clone())
        }
        return response
      } catch {
        const cached = await caches.match(url.pathname)
        return cached || Response.error()
      }
    })()
  )
})
