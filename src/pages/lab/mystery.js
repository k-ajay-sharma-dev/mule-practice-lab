import { writeLocal } from '../../store/local.js'

// Mystery incidents: a console lab opens with its title, its group and the step titles that give the cause away hidden.
// The learner works from the symptoms only: the scenario, the mail and the logs. The lab is shown at the end.
// The lab runs through the normal guide (steps still tick off), with the how text hidden through lab-prefs.js.

// the groups chosen by default: every group about things that break, so the walkthrough groups are left out
const WALKTHROUGHS = ['Full life cycle', 'API-led project', 'API operations']
export const defaultMysteryGroups = (groups) => groups.filter((g) => !WALKTHROUGHS.includes(g))

// a random lab from the chosen groups, one not solved yet when there is one, and never the lab open now
export function pickMystery(labs, groups, solved, notId) {
  const pool = labs.filter((l) => groups.includes(l.group) && l.id !== notId)
  const fresh = pool.filter((l) => !solved[l.id])
  const from = fresh.length ? fresh : pool
  return from[Math.floor(Math.random() * from.length)] ?? null
}

// steps that only point at where the symptoms are (logs, mail, dashboard) keep their title: they give nothing away
const SYMPTOM_STEP = /^(open|read|look at)\b.*\b(logs?|mails?|inbox|dashboard|map|errors tab|alerts?)\b/i
export const HIDDEN_STEP_TITLE = 'Hidden step. Its title shows once it is met.'

// A copy of the lab for the guide. The getters read `isRevealed()` and what each step last reported, so a title shows
// once its step is met and the whole lab shows once it is solved or revealed. The id is new, so the console starts
// fresh instead of loading a saved run of the same lab with its steps already met.
export function maskLab(lab, isRevealed, runId) {
  const met = []
  let question = 0
  const steps = lab.steps.map((step, i) => {
    if (step.ask) {
      const n = ++question
      const copy = { ...step }
      Object.defineProperty(copy, 'title', { enumerable: true, get: () => (isRevealed() ? step.title : `Question ${n}`) })
      return copy
    }
    const keep = SYMPTOM_STEP.test(step.title ?? '')
    const copy = {
      ...step,
      done: (s) => {
        const ok = step.done(s)
        met[i] = Boolean(ok)
        return ok
      },
    }
    Object.defineProperty(copy, 'title', { enumerable: true, get: () => (keep || met[i] || isRevealed() ? step.title : HIDDEN_STEP_TITLE) })
    return copy
  })
  const masked = { ...lab, id: `mystery-${lab.id}-${runId}`, steps }
  delete masked.group
  Object.defineProperty(masked, 'title', { enumerable: true, get: () => (isRevealed() ? lab.title : 'Mystery incident') })
  return masked
}

// A short history in this browser only (never synced): which lab each mystery was and how it ended.
export const MYSTERY_KEY = 'pl.lab.mystery'
const MAX = 50
export function readMysteries() {
  try {
    const v = JSON.parse(localStorage.getItem(MYSTERY_KEY))
    return Array.isArray(v) ? v.filter((m) => m && typeof m.id === 'string' && typeof m.at === 'string' && (m.end === 'solved' || m.end === 'revealed')) : []
  } catch {
    return []
  }
}
// end: 'solved' (finished with the lab hidden) or 'revealed' (the learner asked to see which lab it was)
export function recordMystery(id, end) {
  writeLocal(MYSTERY_KEY, JSON.stringify([{ id, end, at: new Date().toISOString() }, ...readMysteries()].slice(0, MAX)))
}
