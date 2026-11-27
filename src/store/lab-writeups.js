import { writeLocal } from './local.js'

// Post-incident write-ups for solved labs. Kept in this browser only: this key is never in SYNCED_KEYS or BACKUP_KEYS.
// Shape: { [labId]: { rootCause, impact, fix, prevention, at, covered, total, best } }, where best is the highest share
// of key points a saved write-up of that lab has covered (0 to 1). store/lab-points.js gives the bonus from `best`.
export const WRITEUPS_KEY = 'pl.lab.writeups'
export const WRITEUP_FIELDS = [
  ['rootCause', 'Root cause'],
  ['impact', 'Impact'],
  ['fix', 'Fix'],
  ['prevention', 'Prevention'],
]
export const WRITEUP_PASS = 0.7
export const WRITEUP_BONUS = 5

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export function cleanWriteups(v) {
  if (!isObject(v)) return {}
  return Object.fromEntries(
    Object.entries(v)
      .filter(([, w]) => isObject(w) && Number.isFinite(w.best))
      .map(([id, w]) => [id, { ...Object.fromEntries(WRITEUP_FIELDS.map(([k]) => [k, typeof w[k] === 'string' ? w[k] : ''])), at: String(w.at ?? ''), covered: Number(w.covered) || 0, total: Number(w.total) || 0, best: Math.max(0, Math.min(1, w.best)) }]),
  )
}

export function readWriteups() {
  try {
    return cleanWriteups(JSON.parse(localStorage.getItem(WRITEUPS_KEY)))
  } catch {
    return {}
  }
}

// Saves the write-up and returns the bonus points it added (5 the first time a write-up of this lab reaches 70%, else 0)
export function saveWriteup(id, fields, result) {
  const all = readWriteups()
  const before = all[id]?.best ?? 0
  const ratio = result.total ? result.covered / result.total : 0
  const entry = { ...Object.fromEntries(WRITEUP_FIELDS.map(([k]) => [k, String(fields[k] ?? '')])), at: new Date().toISOString(), covered: result.covered, total: result.total, best: Math.max(before, ratio) }
  writeLocal(WRITEUPS_KEY, JSON.stringify({ ...all, [id]: entry }))
  return before < WRITEUP_PASS && ratio >= WRITEUP_PASS ? WRITEUP_BONUS : 0
}

// ---------- key points ----------
// A lab may carry `keyPoints: [[label, [keyword alternatives]]]`. A point is covered when the write-up holds any one of
// its alternatives (a word or a phrase; case and simple endings such as s, es, ed, ing are ignored). Example:
//   keyPoints: [['The port was wrong', ['port', '1433']], ['Run the missed job by hand', ['run now', 'by hand', 'manual']]]
// No lab has the field yet, so without it the points are derived from the lab: the right answers of its first questions,
// the sentences of its `why`, its main fix steps, and one point about prevention.

const STOP = new Set(
  ('the a an and or but of to in on at by for with from into onto is are was were be been being it its this that these those then than there their them ' +
    'they you your we our as not no so if when what which who why how all any each every one two three more most less only same other also after before ' +
    'about over under again can does did do has have had will would should could must may might set use used open read look find check prove show see call ' +
    'run make get give put lab labs step steps console page runtime manager application applications settings click choose select apply changes change new ' +
    'value values here where while because them itself through until without want wants teammate first last next back sure tell says said point points ' +
    'nothing something anything thing things time times right wrong good part keep stays stay goes going come comes work works working fix fixed means mean logs log line lines team out off own yet now way too say per via let got far few lot try')
    .split(' '),
)

const stem = (w) => {
  const s = w.replace(/(ing|ed|es|s)$/, '')
  return s.length >= 4 ? s : w
}
const words = (text) => (String(text ?? '').toLowerCase().match(/[a-z0-9][a-z0-9:._-]*[a-z0-9]|[a-z0-9]/g) ?? []).map((w) => w.replace(/[._:-]+$/, ''))
// names with a dash (orders-nightly-load) name the application, not the cause, so they never count
const significant = (text) => words(text).filter((w) => !STOP.has(w) && !w.includes('-') && (w.length >= 3 || /\d/.test(w) || w.includes(':')))
const concrete = (w) => /[\d:.]/.test(w)

// The most distinctive words: those of `main` first (longest first), then concrete values from `extra` (db.port, 1433),
// then its other words. An error type such as DB:CONNECTIVITY also counts by its last part.
function keywords(main, max = 4, extra = '') {
  const byLength = (a, b) => b.length - a.length
  const head = [...new Set(significant(main))].sort(byLength)
  const tail = [...new Set(significant(extra))].filter((w) => !head.includes(w))
  const all = [...head, ...tail.filter(concrete), ...tail.filter((w) => !concrete(w)).sort(byLength)]
  const picked = all.slice(0, max)
  return [...new Set(picked.flatMap((w) => (w.includes(':') ? [w, w.split(':').pop()] : [w])))]
}

export const sentences = (text) =>
  String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !/\b(the|this) lab\b/i.test(s))

// steps that only look at something; the others are the actions of the fix
const INSPECT = /^(open|see|look|find|prove|call|go to|watch|try|move the clock|read (the |an? )?(logs?|mails?|dashboard|map|errors?|response|cpu|alerts?|specification|order))\b/i
export function actionSteps(lab) {
  const did = (lab.steps ?? []).filter((s) => !s.ask)
  const acts = did.filter((s) => !INSPECT.test(s.title ?? ''))
  return acts.length ? acts : did.slice(1)
}
export const diagnoses = (lab) =>
  (lab.steps ?? [])
    .filter((s) => s.ask && Array.isArray(s.options) && s.options[s.right])
    .slice(0, 2)
    .map((s) => s.options[s.right])

const PREVENTION = ['Prevention: something that catches it earlier next time', ['alert', 'monitor', 'alarm', 'dashboard', 'test', 'check', 'review', 'runbook', 'validate', 'prevent', 'limit', 'retry', 'automate', 'pipeline']]

export function keyPointsOf(lab) {
  if (Array.isArray(lab.keyPoints) && lab.keyPoints.length) {
    const given = lab.keyPoints.filter((p) => Array.isArray(p) && typeof p[0] === 'string' && Array.isArray(p[1]) && p[1].length).map(([label, alts]) => [label, alts.map(String)])
    if (given.length) return given
  }
  const points = []
  for (const option of diagnoses(lab)) points.push([`Diagnosis: ${sentences(option)[0] ?? option}`, keywords(option, 3)])
  for (const s of sentences(lab.why).slice(0, 3)) points.push([s, keywords(s)])
  const fixes = actionSteps(lab)
  if (fixes.length) for (const step of fixes.slice(0, 2)) points.push([/^fix\b/i.test(step.title) ? step.title : `Fix: ${step.title}`, keywords(step.title, 4, step.how)])
  else if (lab.solution) points.push([`Fix: ${sentences(lab.solution)[0]}`, keywords(lab.solution)])
  points.push(PREVENTION)
  // a point whose words are all in an earlier point adds nothing
  const seen = new Set()
  return points.filter(([, alts]) => {
    const fresh = alts.filter((a) => !seen.has(stem(a)))
    alts.forEach((a) => seen.add(stem(a)))
    return alts.length && fresh.length
  })
}

export function scoreWriteup(lab, fields) {
  const text = WRITEUP_FIELDS.map(([k]) => fields[k] ?? '').join(' \n ')
  const flat = ` ${words(text).join(' ')} `
  const stems = new Set(words(text).map(stem))
  const has = (alt) => {
    const parts = words(alt)
    if (!parts.length) return false
    return parts.length === 1 ? stems.has(stem(parts[0])) : flat.includes(` ${parts.join(' ')} `)
  }
  const points = keyPointsOf(lab).map(([label, alts]) => ({ label, hit: alts.find(has) ?? null }))
  const covered = points.filter((p) => p.hit).length
  return { points, covered, total: points.length, ratio: points.length ? covered / points.length : 0 }
}

// A short model write-up, built from the lab itself
export function modelWriteup(lab) {
  const why = sentences(lab.why)
  const cause = [...diagnoses(lab).map((d) => (/[.!?]$/.test(d) ? d : `${d}.`)), why[0]].filter(Boolean).join(' ')
  const fixes = actionSteps(lab).map((s) => `${s.title}.`)
  return {
    rootCause: cause,
    impact: sentences(lab.scenario).filter((s) => !/^It is \d/.test(s)).join(' '),
    fix: fixes.length ? fixes.join(' ') : String(lab.solution ?? ''),
    prevention: [why.length > 1 ? why[why.length - 1] : '', 'Add an alert or a check that catches this sooner, and note the steps in the runbook.'].filter(Boolean).join(' '),
  }
}
