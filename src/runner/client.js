// Client for the DataWeave runner service (runner/server.js).
// Contract: POST {runnerUrl}/run  { script, inputs: [{ name, mime, content }] }
//        → { ok: true, output, mime } | { ok: false, error }
const URL_KEY = 'pl.runnerUrl'
const SECRET_KEY = 'pl.runnerKey'
const LOCAL_DEFAULT = 'http://localhost:8787'

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Storage blocked; settings only last for this visit.
  }
}

// With nothing saved, a copy served from this laptop assumes the local runner; the published site starts
// with no runner (so visitors' browsers never probe localhost) until one is set in Settings.
const servedLocally = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)

export function getRunnerSettings() {
  return { url: read(URL_KEY) ?? (servedLocally() ? LOCAL_DEFAULT : ''), key: read(SECRET_KEY) || '' }
}

// An empty URL is saved as '' (runner switched off) rather than removed, so it doesn't fall back to the default.
export function saveRunnerSettings({ url, key }) {
  try {
    localStorage.setItem(URL_KEY, url.trim().replace(/\/$/, ''))
  } catch {
    // Storage blocked; settings only last for this visit.
  }
  write(SECRET_KEY, key.trim())
}

function headers(key) {
  return key ? { 'Content-Type': 'application/json', 'X-Runner-Key': key } : { 'Content-Type': 'application/json' }
}

const isLocalUrl = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url)

// A hosted runner on a free plan (Render) sleeps when idle and needs up to about a minute to wake up.
export const runnerMaySleep = (url = getRunnerSettings().url) => Boolean(url) && !isLocalUrl(url)

export async function checkRunner(settings = getRunnerSettings()) {
  if (!settings.url) return { ok: false, error: 'No runner URL set.' }
  // a local runner answers at once; a sleeping hosted one gets time to wake, but nothing waits forever
  const timeout = runnerMaySleep(settings.url) ? 90000 : 5000
  try {
    const res = await fetch(`${settings.url}/health`, { headers: headers(settings.key), signal: AbortSignal.timeout(timeout) })
    const body = await res.json()
    return res.ok ? body : { ok: false, error: body.error || `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: `Can't reach ${settings.url}` }
  }
}

export async function runScript(script, inputs) {
  const { url, key } = getRunnerSettings()
  if (!url) {
    return { ok: false, notConfigured: true, error: 'No runner URL is set. Add one in Settings (gear icon).' }
  }
  const call = async () => {
    const res = await fetch(`${url}/run`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({ script, inputs }),
      signal: AbortSignal.timeout(runnerMaySleep(url) ? 90000 : 30000),
    })
    // while a sleeping host starts up it may answer with its own error page instead of the runner's JSON
    if (res.status === 401) return res.json()
    if (!res.headers.get('content-type')?.includes('application/json')) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
  try {
    try {
      return await call()
    } catch (e) {
      if (!runnerMaySleep(url) || e.name === 'TimeoutError') throw e
      // one retry after a quick failure: the first request is often the one that woke the host
      return await call()
    }
  } catch {
    return {
      ok: false,
      notConfigured: true,
      error: runnerMaySleep(url)
        ? `Can't reach the DataWeave runner at ${url}.\n\nIt runs on a free host that sleeps when idle and can take about a minute to wake up — wait a moment and try again.\nIf it keeps failing, check the runner URL and key in Settings (gear icon).`
        : `Can't reach the DataWeave runner at ${url}.\n\nOn your laptop, start it with:  npm run runner\nOr change the runner URL in Settings (gear icon).`,
    }
  }
}
