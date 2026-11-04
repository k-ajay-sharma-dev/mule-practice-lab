import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup } from '../store/backup.js'
import { signIn, signOutUser, syncNow, useSyncStatus } from '../sync/status.js'

// "1 min ago" style time for the last sync.
function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const STATE_TEXT = {
  loading: 'Connecting…',
  syncing: 'Syncing…',
  offline: 'Offline — your work is kept here and syncs when you are back online.',
  error: 'Sync failed',
}

export function AccountCard() {
  const sync = useSyncStatus()
  const [, tick] = useState(0)

  // keep "synced 2 min ago" current while the page is open
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  if (sync.state === 'off') {
    return (
      <section className="settings-card">
        <h2>Account & sync</h2>
        <p className="muted small">
          Cloud sync isn't set up, so your progress is saved in this browser only. Add your Firebase project to{' '}
          <code>src/sync/config.js</code> (see <code>DEPLOY.md</code>) to save it to your Google account. Until then, use
          the backup below to keep a copy.
        </p>
      </section>
    )
  }

  const signedIn = Boolean(sync.user) && sync.state !== 'signed-out'
  return (
    <section className="settings-card">
      <h2>Account & sync</h2>
      {signedIn ? (
        <>
          <div className="account-row">
            {sync.user.photo ? (
              <img className="avatar" src={sync.user.photo} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar avatar-letter">{(sync.user.name || sync.user.email || '?')[0].toUpperCase()}</span>
            )}
            <div className="account-who">
              <strong>{sync.user.name || sync.user.email}</strong>
              {sync.user.name && <span className="muted small">{sync.user.email}</span>}
            </div>
          </div>
          <p className={`small ${sync.state === 'error' ? 'err-text' : sync.state === 'synced' ? 'ok-text' : 'muted'}`}>
            {sync.state === 'synced' ? `✓ Progress saved to your account · ${ago(sync.lastSync)}` : STATE_TEXT[sync.state]}
            {sync.state === 'error' && sync.error ? ` — ${sync.error}` : ''}
          </p>
          <p className="muted small">
            Everything you do is saved to your Google account automatically, so it is the same on every device where you
            sign in.
          </p>
          <div className="settings-actions">
            <button className="btn" onClick={syncNow} disabled={sync.state === 'syncing'}>
              Sync now
            </button>
            <button className="btn btn-ghost" onClick={signOutUser}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">
            Sign in to save your progress permanently to your Google account and use it on any device. Progress already
            in this browser is uploaded on your first sign-in.
          </p>
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={signIn} disabled={sync.state === 'loading'}>
              <GoogleIcon /> Sign in with Google
            </button>
          </div>
        </>
      )}
      {sync.error && sync.state !== 'error' && <p className="err-text small">{sync.error}</p>}
    </section>
  )
}

export function BackupCard() {
  const fileInput = useRef(null)
  const [message, setMessage] = useState(null)

  async function restore(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('Restore this backup into this browser? For each problem the newer version is kept.')) return
    try {
      const count = await importBackup(file)
      setMessage({ ok: true, text: `Restored ${count} problems. Reloading…` })
      setTimeout(() => location.reload(), 900)
    } catch (error) {
      setMessage({ ok: false, text: error.message })
    }
  }

  return (
    <section className="settings-card">
      <h2>Backup</h2>
      <p className="muted small">
        Download all your progress as one file you keep yourself, or restore it into this or another browser.
      </p>
      <div className="settings-actions">
        <button className="btn" onClick={exportBackup}>
          Export backup
        </button>
        <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
          Import backup…
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={restore} />
        {message && <span className={`small ${message.ok ? 'ok-text' : 'err-text'}`}>{message.text}</span>}
      </div>
    </section>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
