// Undo history for the designers. Typing in a field counts as one step, while every other change is its own step.
const LIMIT = 100
const MERGE_MS = 700

export const startHistory = (value) => ({ past: [], present: value, future: [], at: 0 })

export function record(h, value, now, typing = false) {
  if (value === h.present) return h
  if (typing && h.past.length && now - h.at < MERGE_MS) return { ...h, present: value, future: [], at: now }
  return { past: [...h.past, h.present].slice(-LIMIT), present: value, future: [], at: now }
}

export function undo(h) {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future], at: 0 }
}

export function redo(h) {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), at: 0 }
}
