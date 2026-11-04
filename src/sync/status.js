import { useSyncExternalStore } from 'react'
import { firebaseConfig, useEmulator } from './config.js'

// Cloud sync status for the UI. The Firebase code itself (engine.js) is a separate chunk that only loads
// when sync is configured, so the site stays light without it.
//   state: off (not configured) | loading | signed-out | syncing | synced | offline | error
export const syncAvailable = Boolean(firebaseConfig) || useEmulator

let status = { state: syncAvailable ? 'loading' : 'off', user: null, lastSync: null, error: null }
const listeners = new Set()

export function setStatus(patch) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useSyncStatus = () => useSyncExternalStore(subscribe, () => status)

let engine
const loadEngine = () => (engine ??= import('./engine.js'))
const withEngine = (action) => () =>
  loadEngine()
    .then((e) => e[action]())
    .catch((error) => setStatus({ state: 'error', error: error?.message ?? String(error) }))

export function startSync() {
  if (syncAvailable) withEngine('start')()
}
export const signIn = withEngine('signIn')
export const signOutUser = withEngine('signOutUser')
export const syncNow = withEngine('syncNow')
