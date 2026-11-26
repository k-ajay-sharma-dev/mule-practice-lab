import { useSyncExternalStore } from 'react'
import { onLocalChange, writeLocal } from './local.js'

// Quiz questions you answered wrong, kept so Weak Spots can bring each one back on its own. Written when a quiz or a
// Practice Exam is checked and when you retry on the Weak Spots page. A question leaves the list once you answer it
// right on two different days, so a lucky second click does not clear it. Only the problem id, the question number
// and the start of the prompt are kept; the full question loads with its problem. Saved to the account.
const KEY = 'pl.wrong'
const MAX = 200
export const RIGHT_DAYS_TO_CLEAR = 2

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(v) ? v.filter((x) => x && typeof x.pid === 'string' && Number.isInteger(x.qi)) : []
  } catch {
    return []
  }
}

let cache = null
export const readWrong = () => (cache ??= readAll())
onLocalChange((key) => key === KEY && (cache = null))
const subscribe = (l) => onLocalChange((key) => key === KEY && l())

export const useWrong = () => useSyncExternalStore(subscribe, readWrong)

const day = () => new Date().toISOString().slice(0, 10)
const promptStart = (q) => String(q?.prompt ?? '').replace(/\s+/g, ' ').slice(0, 160)

// The saved question still matches the content, so an edit that moved questions around does not show the wrong one.
export const sameQuestion = (item, q) => Boolean(q) && promptStart(q).slice(0, 60) === item.p.slice(0, 60)

// answers: [{ pid, qi, q, ok }] for every question that was answered
export function recordAnswers(answers) {
  const today = day()
  const now = new Date().toISOString()
  let list = [...readWrong()]
  let changed = false
  for (const { pid, qi, q, ok } of answers) {
    const at = list.findIndex((x) => x.pid === pid && x.qi === qi)
    const item = at >= 0 ? list[at] : null
    if (!ok) {
      const next = { pid, qi, p: promptStart(q), misses: (item?.misses ?? 0) + 1, right: [], at: now }
      list = [next, ...list.filter((_, i) => i !== at)]
      changed = true
    } else if (item && !item.right?.includes(today)) {
      const right = [...(item.right ?? []), today]
      list = right.length >= RIGHT_DAYS_TO_CLEAR ? list.filter((_, i) => i !== at) : list.map((x, i) => (i === at ? { ...x, right } : x))
      changed = true
    }
  }
  if (changed) writeLocal(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function forgetWrong(pid, qi) {
  writeLocal(KEY, JSON.stringify(readWrong().filter((x) => !(x.pid === pid && x.qi === qi))))
}

// The saved start of a prompt as plain text, for one-line lists
export const promptText = (p) => String(p ?? '').replace(/[`*_#>]/g, '').trim()

// Most missed first, then the newest
export const rankWrong = (list) => [...list].sort((a, b) => b.misses - a.misses || b.at.localeCompare(a.at))
