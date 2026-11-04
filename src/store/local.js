// Single write path for the browser data that cloud sync carries to your Google account.
// Every write records when the key changed (pl.sync.meta) and tells listeners, so the sync engine
// knows what to upload — even for changes made offline or before sync finished loading.

// Keys saved to the account. Theme, page size and runner settings stay per device.
export const SYNCED_KEYS = [
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
