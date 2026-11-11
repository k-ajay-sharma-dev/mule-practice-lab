import { useEffect, useRef } from 'react'

// Every mounted autosave, so Ctrl+S can save what is still waiting for its delay (see flushAutosaves).
const flushers = new Set()

// Saves every change that is still waiting for its delay, straight away.
export function flushAutosaves() {
  flushers.forEach((flush) => flush())
}

// Calls save(value) shortly after the value stops changing. Skips the initial value.
// Leaving the page (Prev/Next, a mock-interview step) saves any pending change straight away.
export function useAutosave(value, save, delay = 500) {
  const lastSaved = useRef(value)
  const latest = useRef(value)
  const saveRef = useRef(save)
  saveRef.current = save
  latest.current = value

  useEffect(() => {
    if (value === lastSaved.current) return
    const t = setTimeout(() => {
      lastSaved.current = value
      saveRef.current(value)
    }, delay)
    return () => clearTimeout(t)
  }, [value, delay])

  useEffect(() => {
    const flush = () => {
      if (latest.current !== lastSaved.current) {
        lastSaved.current = latest.current
        saveRef.current(latest.current)
      }
    }
    flushers.add(flush)
    return () => {
      flushers.delete(flush)
      flush()
    }
  }, [])
}
