// Saving a console state in the browser. Shared by the open console and the guided labs.
import { useEffect, useRef } from 'react'

export const isState = (s) => Number.isFinite(s?.clock) && ['apps', 'apis', 'projects', 'assets', 'studio', 'queues', 'mail', 'events', 'traffic', 'clients', 'monAlerts', 'rmAlerts'].every((k) => Array.isArray(s[k])) && typeof s.seen === 'object' && typeof s.creds === 'object'
export function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked or full: the console lasts for this visit
  }
}
// a save after each click would write a large text many times, so it waits until the clicks pause
export function useSaved(key, value) {
  const latest = useRef(value)
  latest.current = value
  const changed = useRef(false)
  useEffect(() => {
    if (!changed.current) {
      changed.current = true
      return undefined
    }
    const timer = setTimeout(() => write(key, value), 500)
    return () => clearTimeout(timer)
  }, [key, value])
  useEffect(() => () => void (changed.current && write(key, latest.current)), [key])
}

