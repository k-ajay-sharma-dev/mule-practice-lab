import { useEffect, useRef, useState } from 'react'
import { syncNow, useSyncStatus } from '../sync/status.js'
import { flushAutosaves } from '../workspaces/useAutosave.js'

// Ctrl+S (Cmd+S on a Mac) saves your work to your Google account instead of opening the browser's "Save page as".
// Work is already saved on this device as you type; the shortcut saves what is still waiting and uploads it now.
export default function SaveShortcut() {
  const sync = useSyncStatus()
  const [note, setNote] = useState(null) // { text, tone: 'info' | 'done' | 'error' }
  const asked = useRef(0) // when Ctrl+S was last pressed while signed in, so only a sync after it counts
  const hide = useRef(null)
  const signedIn = Boolean(sync.user) && sync.state !== 'signed-out'

  const show = (text, tone, ms = 2500) => {
    clearTimeout(hide.current)
    setNote({ text, tone })
    if (ms) hide.current = setTimeout(() => setNote(null), ms)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      flushAutosaves()
      if (!signedIn) {
        show(sync.state === 'off' ? 'Saved on this device.' : 'Saved on this device. Sign in to save it to your account too.', 'info', 3500)
        return
      }
      asked.current = Date.now()
      show('Saving to your account…', 'info', 0)
      syncNow()
    }
    // capture: the code editor must not keep the key to itself
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [signedIn, sync.state])

  useEffect(() => {
    if (!asked.current) return
    if (sync.state === 'synced' && sync.lastSync >= asked.current) {
      asked.current = 0
      show('Saved to your account.', 'done')
    } else if (sync.state === 'offline' || sync.state === 'error') {
      asked.current = 0
      show(
        sync.state === 'offline'
          ? 'Saved on this device. You are offline, so it goes to your account when you are back online.'
          : 'Saved on this device, but your account could not be reached. It will try again.',
        'error',
        5000,
      )
    }
  }, [sync.state, sync.lastSync])

  useEffect(() => () => clearTimeout(hide.current), [])

  if (!note) return null
  return (
    <div className={`save-note ${note.tone}`} role="status" aria-live="polite">
      {note.text}
    </div>
  )
}
