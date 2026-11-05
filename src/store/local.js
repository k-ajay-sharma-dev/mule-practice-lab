// Single write path for the browser data that cloud sync carries to your Google account.
// Every write records when the key changed (pl.sync.meta) and tells listeners, so the sync engine
// knows what to upload — even for changes made offline or before sync finished loading.

export const servedLocally = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location?.hostname)

// Keys that go into a backup file. The runner key is a secret, and backups are plain files, so it stays out of them.
export const BACKUP_KEYS = [
  'pl.progress',
  'pl.activity',
  'pl.review',
  'pl.flash',
  'pl.mock.current',
  'pl.mock.history',
  'pl.interview.history',
  'pl.playground',
  'pl.planStart',
]

// Keys saved to the account. Theme and page size stay per device. So do the runner settings on a copy served from
// this laptop: it talks to the local runner, and the hosted runner only accepts calls from the published site.
export const SYNCED_KEYS = servedLocally ? BACKUP_KEYS : [...BACKUP_KEYS, 'pl.runnerUrl', 'pl.runnerKey']

const META_KEY = 'pl.sync.meta'
const listeners = new Set()

export function readMeta() {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY))
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  } catch {
    return {}
  }
}

export function writeMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // storage blocked: sync falls back to comparing values on the next run
  }
}

// value is a string, or null to remove the key.
export function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage full or blocked; the in-memory copy still works for this visit.
  }
  if (SYNCED_KEYS.includes(key)) writeMeta({ ...readMeta(), [key]: Date.now() })
  listeners.forEach((l) => l(key))
}

export function onLocalChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
