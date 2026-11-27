import { useSyncExternalStore } from 'react'

// "Hide the how text" for guided labs: off by default, so the steps read as before. Kept in this browser only.
const HIDE_HOW_KEY = 'pl.lab.hideHow'
const listeners = new Set()
const notify = () => listeners.forEach((l) => l())

// A mystery incident turns the how text off for as long as it is open, without touching the saved setting.
// While the override is on, the checkbox in the guide changes the override only.
let override = null // null | boolean

function stored() {
  try {
    return localStorage.getItem(HIDE_HOW_KEY) === '1'
  } catch {
    return false
  }
}
const read = () => override ?? stored()

export function setHideHow(on) {
  if (override !== null) {
    override = Boolean(on)
    notify()
    return
  }
  try {
    if (on) localStorage.setItem(HIDE_HOW_KEY, '1')
    else localStorage.removeItem(HIDE_HOW_KEY)
  } catch {
    // storage blocked: the setting lasts until the page reloads
  }
  notify()
}

// on: true hides the how text until endHideHowOverride runs; the saved setting comes back after that
export function beginHideHowOverride(on = true) {
  override = Boolean(on)
  notify()
}
export function endHideHowOverride() {
  if (override === null) return
  override = null
  notify()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useHideHow = () => useSyncExternalStore(subscribe, read, () => false)

// The groups a mystery incident picks from. Kept in this browser only.
const MYSTERY_GROUPS_KEY = 'pl.lab.mysteryGroups'
export function readMysteryGroups(fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(MYSTERY_GROUPS_KEY))
    return Array.isArray(v) && v.every((g) => typeof g === 'string') ? v : fallback
  } catch {
    return fallback
  }
}
export function writeMysteryGroups(groups) {
  try {
    localStorage.setItem(MYSTERY_GROUPS_KEY, JSON.stringify(groups))
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}
