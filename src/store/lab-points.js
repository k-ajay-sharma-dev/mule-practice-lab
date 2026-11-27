import { useSyncExternalStore } from 'react'
import { onLocalChange, writeLocal } from './local.js'
import { LAB_SOLVED_KEY } from './labs.js'

// Points from the Platform Lab, counted the same way as problem points: from what is already saved, so nothing is
// awarded twice. A lab counts once, the first time it is in pl.lab.solved. That key syncs, so a lab solved on two
// devices still counts once. The amounts go by the kind of lab, read from its id, so this file needs none of the large
// lab modules: console labs (p-) are longer than an advanced problem, CI/CD labs (cicd-) and the policy and
// deployment labs are about an intermediate problem.
export const LAB_POINTS = { console: 30, cicd: 15, other: 15 }
export const labPointsFor = (id) => (id.startsWith('p-') ? LAB_POINTS.console : id.startsWith('cicd-') ? LAB_POINTS.cicd : LAB_POINTS.other)

// On call drills: a history kept in this browser only (not synced), and the best score per lab. The bonus is the best
// score of each lab divided by 5, so a lab gives at most 20 bonus points however many times it is drilled.
export const DRILLS_KEY = 'pl.lab.drills'
const MAX_HISTORY = 50
export const drillBonus = (score) => Math.floor(Math.max(0, Math.min(100, score)) / 5)

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function parse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function cleanDrills(v) {
  const history = Array.isArray(v?.history) ? v.history.filter((d) => isObject(d) && typeof d.id === 'string' && Number.isFinite(d.score) && typeof d.at === 'string') : []
  const best = isObject(v?.best) ? Object.fromEntries(Object.entries(v.best).filter(([, s]) => Number.isFinite(s))) : {}
  return { history, best }
}

export function readDrills() {
  try {
    return cleanDrills(parse(localStorage.getItem(DRILLS_KEY)))
  } catch {
    return cleanDrills(null)
  }
}

// entry: { id, title, seconds, hints, wrong, score, gaveUp }. Returns the bonus points this drill added.
export function recordDrill(entry) {
  const drills = readDrills()
  const at = new Date().toISOString()
  const history = [{ ...entry, at }, ...drills.history].slice(0, MAX_HISTORY)
  const before = drills.best[entry.id]
  const best = !entry.gaveUp && (before === undefined || entry.score > before) ? { ...drills.best, [entry.id]: entry.score } : drills.best
  writeLocal(DRILLS_KEY, JSON.stringify({ history, best }))
  return drillBonus(best[entry.id] ?? 0) - drillBonus(before ?? 0)
}

// One snapshot for both keys, rebuilt only when either text changes
let last = { solvedRaw: undefined, drillsRaw: undefined, value: { labs: 0, labPoints: 0, drillPoints: 0 } }
function getSnapshot() {
  let solvedRaw = null
  let drillsRaw = null
  try {
    solvedRaw = localStorage.getItem(LAB_SOLVED_KEY)
    drillsRaw = localStorage.getItem(DRILLS_KEY)
  } catch {
    // storage blocked: no lab points
  }
  if (solvedRaw === last.solvedRaw && drillsRaw === last.drillsRaw) return last.value
  const solved = parse(solvedRaw)
  const ids = isObject(solved) ? Object.keys(solved).filter((id) => typeof solved[id] === 'string' && solved[id]) : []
  const labPoints = ids.reduce((sum, id) => sum + labPointsFor(id), 0)
  const drillPoints = Object.values(cleanDrills(parse(drillsRaw)).best).reduce((sum, s) => sum + drillBonus(s), 0)
  last = { solvedRaw, drillsRaw, value: { labs: ids.length, labPoints, drillPoints } }
  return last.value
}

function subscribe(listener) {
  const off = onLocalChange((key) => (key === LAB_SOLVED_KEY || key === DRILLS_KEY) && listener())
  const storage = (e) => (e.key === LAB_SOLVED_KEY || e.key === DRILLS_KEY || e.key === null) && listener()
  window.addEventListener('storage', storage)
  return () => {
    off()
    window.removeEventListener('storage', storage)
  }
}

// { labs, labPoints, drillPoints }. A sync writes pl.lab.solved straight to storage; the progress reload that follows
// renders the points again and the snapshot reads the new text then.
export function useLabPoints() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
