import { useEffect, useRef, useState } from 'react'
import { AccountCard, BackupCard } from '../components/AccountCard.jsx'
import { checkRunner, getRunnerSettings, runnerMaySleep, saveRunnerSettings } from '../runner/client.js'
import { useSyncStatus } from '../sync/status.js'
import { useTheme } from '../theme.jsx'

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { lastSync } = useSyncStatus()
  const [runner, setRunner] = useState(getRunnerSettings)
  const [check, setCheck] = useState(null)
  const [saved, setSaved] = useState(false)
  const edited = useRef(false)

  // a sync may bring the runner settings from the account; never overwrite what is being typed
  useEffect(() => {
    if (!edited.current) setRunner(getRunnerSettings())
  }, [lastSync])

  function update(field, value) {
    edited.current = true
    setRunner((r) => ({ ...r, [field]: value }))
    setSaved(false)
    setCheck(null)
  }

  async function saveAndTest() {
    saveRunnerSettings(runner)
    edited.current = false
    setRunner(getRunnerSettings())
    setSaved(true)
    setCheck({ pending: true })
    setCheck(await checkRunner())
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <AccountCard />

      <section className="settings-card">
        <h2>DataWeave runner</h2>
        <p className="muted small">
          Run and Submit send your script here. On this laptop start it with <code>npm run runner</code> (
          <code>http://localhost:8787</code>). On the published site, use your Render service's address (
          <code>https://….onrender.com</code>) and the <code>RUNNER_KEY</code> from its Environment tab. The free Render
          plan sleeps when idle, so the first test after a break can take about a minute. On the published site these
          are saved to your account when you sign in, so you enter them once for all your devices.
        </p>
        <label className="field">
          <span>Runner URL</span>
          <input
            className="input"
            value={runner.url}
            onChange={(e) => update('url', e.target.value)}
            placeholder="http://localhost:8787"
          />
        </label>
        <label className="field">
          <span>Runner key (optional)</span>
          <input
            className="input"
            type="password"
            value={runner.key}
            onChange={(e) => update('key', e.target.value)}
            placeholder="Only needed if the runner sets RUNNER_KEY"
            autoComplete="off"
          />
        </label>
        <div className="settings-actions">
          <button className="btn btn-primary" onClick={saveAndTest}>
            Save & test
          </button>
          {check?.pending && (
            <span className="muted small">
              {runnerMaySleep(runner.url) ? 'Testing… (waking the runner can take up to a minute)' : 'Testing…'}
            </span>
          )}
          {check && !check.pending && check.ok && (
            <span className="ok-text small">✓ Connected · {check.version || 'DataWeave'}</span>
          )}
          {check && !check.pending && !check.ok && <span className="err-text small">✗ {check.error}</span>}
          {saved && !check && <span className="muted small">Saved</span>}
        </div>
      </section>

      <section className="settings-card">
        <h2>Appearance</h2>
        <div className="settings-actions">
          <span className="muted small">Theme: {theme}</span>
          <button className="btn" onClick={toggle}>
            Switch to {theme === 'dark' ? 'light' : 'dark'}
          </button>
        </div>
      </section>

      <BackupCard />
    </div>
  )
}
