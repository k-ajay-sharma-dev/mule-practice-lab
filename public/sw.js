// Keeps a copy of the site's own files in the browser, so a visit after the first draws at once from that copy, even
// on a slow or flaky connection, while any update is fetched in the background.
//  - built files (assets/…, named by their content, so they never change): from the copy, fetched once
//  - the page itself: from the copy straight away, refreshed from the network for the next visit
// Only this site's own files are kept. Calls to other sites (the account, the runner, the code editor's CDN) are
// left alone, and nothing personal is stored here.
const PAGE = 'pl-page-v1'
const FILES = 'pl-files-v1'
const MAX_FILES = 400

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pl-') && k !== PAGE && k !== FILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim() {
  const cache = await caches.open(FILES)
  const keys = await cache.keys()
  // oldest first: drop files from earlier builds once there are too many
  for (const req of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) await cache.delete(req)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // the page: the saved copy at once, and a fresh one saved for next time
    event.respondWith(
      caches.open(PAGE).then(async (cache) => {
        const saved = await cache.match('page')
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put('page', res.clone())
            return res
          })
          .catch(() => saved)
        if (saved) {
          event.waitUntil(fresh)
          return saved
        }
        return fresh
      }),
    )
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.open(FILES).then(async (cache) => {
        const saved = await cache.match(req)
        if (saved) return saved
        const res = await fetch(req)
        if (res.ok) {
          cache.put(req, res.clone())
          event.waitUntil(trim())
        }
        return res
      }),
    )
  }
})
