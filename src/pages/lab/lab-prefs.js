import { useSyncExternalStore } from 'react'

// "Hide the how text" for guided labs: off by default, so the steps read as before. Kept in this browser only.
const HIDE_HOW_KEY = 'pl.lab.hideHow'
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(HIDE_HOW_KEY) === '1'
  } catch {
    return false
  }
}

export function setHideHow(on) {
  try {
    if (on) localStorage.setItem(HIDE_HOW_KEY, '1')
    else localStorage.removeItem(HIDE_HOW_KEY)
  } catch {
    // storage blocked: the setting lasts until the page reloads
  }
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useHideHow = () => useSyncExternalStore(subscribe, read, () => false)
