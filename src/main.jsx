import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { enableDragScroll } from './hscroll.js'
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
  location.reload()
})
window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      sessionStorage.removeItem('pl.reloadedForUpdate')
    } catch {
      // storage blocked: nothing to clear
    }
  }, 10000)
})

// Cloud sync (Google account) loads in the background when it's configured; the site never waits for it.
startSync()

// areas wider than their box can be dragged sideways with the mouse (scrollbars are hidden)
enableDragScroll()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
