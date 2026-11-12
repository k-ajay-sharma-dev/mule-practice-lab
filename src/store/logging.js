import { useSyncExternalStore } from 'react'
import { onLocalChange, writeLocal } from './local.js'

// Logging Lab progress: pl.logging = { exerciseId: { solved, tries, at } }. Saved to the account like the other
// study data (see store/local.js).
export const LOGGING_KEY = 'pl.logging'

// Read from storage each time, kept while the stored text is the same: a download from the account writes storage
// directly, and this way the page shows it the next time it renders.
let raw = null
let cache = {}
function current() {
  let text = null
  try {
    text = localStorage.getItem(LOGGING_KEY)
  } catch {
    return cache
  }
  if (text === raw) return cache
  raw = text
  try {
    const value = JSON.parse(text)
    cache = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    cache = {}
  }
  return cache
}

const listeners = new Set()
onLocalChange((key) => key === LOGGING_KEY && listeners.forEach((l) => l()))

export const useLoggingProgress = () =>
  useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, current)

// One attempt: a solved exercise stays solved, even if a later attempt is wrong.
export function recordAttempt(id, correct) {
  const all = current()
  const prev = all[id] ?? { solved: false, tries: 0 }
  writeLocal(LOGGING_KEY, JSON.stringify({ ...all, [id]: { solved: prev.solved || correct, tries: prev.tries + 1, at: new Date().toISOString() } }))
}

export function resetLogging() {
  writeLocal(LOGGING_KEY, null)
}
