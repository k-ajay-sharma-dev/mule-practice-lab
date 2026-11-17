import { useSyncExternalStore } from 'react'
import { onLocalChange, writeLocal } from './local.js'

// What went wrong on design problems, kept so the Mistakes page can show what keeps coming back: the settings that
// differed from the reference and the parts a failed check was about. Written when Check design finds failing checks
// and when Find it is opened. One entry per problem, check and day, the newest 300 kept. Saved to the account.
const KEY = 'pl.mistakes'
const MAX = 300

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.check === 'string') : []
  } catch {
    return []
  }
}

let cache = null
const read = () => (cache ??= readAll())
onLocalChange((key) => key === KEY && (cache = null))
const subscribe = (l) => onLocalChange((key) => key === KEY && l())

export const useMistakes = () => useSyncExternalStore(subscribe, read)

// info: what Find it worked out for the check (flow or architecture)
export function recordMistake(problemId, check, info) {
  if (!info) return
  const day = new Date().toISOString().slice(0, 10)
  const fields = info.pairs.flatMap((p) => p.diffs.map((d) => ({ part: p.label, field: d.field, mine: String(d.mine ?? ''), ref: String(d.ref ?? '') })))
  const parts = [...new Set([...info.pairs.map((p) => p.label), ...info.extra.map((x) => x.label), ...info.mine.map((m) => m.label)])].slice(0, 6)
  const entry = { at: new Date().toISOString(), day, id: problemId, check: check.label, fields: fields.slice(0, 8), parts, missingLines: info.lines?.missing?.length ?? 0 }
  const all = read().filter((x) => !(x.id === problemId && x.check === check.label && x.day === day))
  writeLocal(KEY, JSON.stringify([entry, ...all].slice(0, MAX)))
}

export function clearMistakes() {
  writeLocal(KEY, null)
}
