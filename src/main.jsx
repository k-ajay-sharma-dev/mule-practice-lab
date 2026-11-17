import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { enableDragScroll } from './hscroll.js'
import { prefetchOnHover, prefetchPages } from './prefetch.js'
import { startSync } from './sync/status.js'
import { ThemeProvider } from './theme.jsx'
import './styles.css'
import './practice.css'

// After a redeploy, an open tab may ask for chunk files that no longer exist. Reload once to pick up the
// new build; the session flag stops a reload loop if the files are genuinely unreachable (e.g. offline).
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('pl.reloadedForUpdate')) return
    sessionStorage.setItem('pl.reloadedForUpdate', '1')
  } catch {
    return
  }
  event.preventDefault()
  // the saved copy of the page (public/sw.js) may point at files of the old build: drop it, so the reload is fresh
  const fresh = window.caches ? caches.delete('pl-page-v1').catch(() => {}) : Promise.resolve()
  fresh.finally(() => location.reload())
})

// A saved copy of the site's files, so later visits draw at once even on a slow connection (see public/sw.js).
// Only in the built site: during development the files change all the time.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}
window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      sessionStorage.removeItem('pl.reloadedForUpdate')
    } catch {
      // storage blocked: nothing to clear
    }
  }, 10000)
})

// Cloud sync (Google account) loads in the background when it's configured; the site never waits for it. Its code
// is large, so it starts once the first screen has drawn and the browser is idle, to keep that screen quick.
// Signing in before then loads it at once (see sync/status.js).
const whenIdle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300))
whenIdle(startSync, { timeout: 2000 })

// then the pages people open most, so a first click on them opens at once
window.addEventListener('load', () => setTimeout(prefetchPages, 1500))
prefetchOnHover()

// areas wider than their box can be dragged sideways with the mouse (scrollbars are hidden)
enableDragScroll()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
