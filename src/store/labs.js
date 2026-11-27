import { writeLocal } from './local.js'

// The guided labs of the Platform Lab you solved: { labId: time it was first solved }. Small, so cloud sync carries
// it. The state of a lab in progress is large and stays in this browser (pl.lab.guided, pl.lab.console, pl.lab.cicd).
export const LAB_SOLVED_KEY = 'pl.lab.solved'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const clean = (v) => (isObject(v) ? Object.fromEntries(Object.entries(v).filter(([, at]) => typeof at === 'string' && at)) : {})

export function readSolvedLabs() {
  try {
    return clean(JSON.parse(localStorage.getItem(LAB_SOLVED_KEY)))
  } catch {
    return {}
  }
}

// A lab solved on any device stays solved, with the earliest time it was solved
export function mergeSolvedLabs(a, b) {
  const out = clean(a)
  for (const [id, at] of Object.entries(clean(b))) if (!out[id] || at < out[id]) out[id] = at
  return out
}

export function writeSolvedLabs(solved) {
  writeLocal(LAB_SOLVED_KEY, JSON.stringify(clean(solved)))
}

export function markLabSolved(id) {
  const solved = readSolvedLabs()
  if (solved[id]) return solved
  const next = { ...solved, [id]: new Date().toISOString() }
  writeSolvedLabs(next)
  return next
}
