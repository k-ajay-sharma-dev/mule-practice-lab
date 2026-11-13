// Auto-graded questions shared by the Platform Quiz and the Incident Investigator.
//
//   { type: 'single', prompt, options: [...], answer: 2, explain }
//   { type: 'multi',  prompt, options: [...], answer: [0, 3], explain }
//   { type: 'order',  prompt, items: [...in the correct order], explain }
//   { type: 'match',  prompt, pairs: [[left, right], ...], explain }
//   { type: 'level',  prompt, answer: ['WARN', ...accepted levels], explain }            (Logging Lab)
//   { type: 'logger', prompt, available, level: [...], checks, model, explain }        (Logging Lab: write the logger)
//
// Responses always refer to ORIGINAL indexes, so the shuffled display order never affects grading:
//   single → index · multi → [indexes] · order → [item indexes in the learner's order] · match → { leftIndex: rightIndex }
//   level → 'INFO' · logger → { level, message }

import { gradeWrite } from '../logging/grade.js'
import { LEVELS } from '../logging/rules.js'

export const QUESTION_TYPES = ['single', 'multi', 'order', 'match', 'level', 'logger']

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

// Deterministic shuffle of [0..n-1], so a question looks the same on every visit.
export function permutation(n, seed) {
  const idx = [...Array(n).keys()]
  let s = hash(seed) || 1
  for (let i = n - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0
    const j = s % (i + 1)
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  // an "order" puzzle must not start out already solved
  if (n > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift())
  return idx
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

export function isAnswered(q, r) {
  if (r == null) return false
  if (q.type === 'multi') return r.length > 0
  if (q.type === 'match') return q.pairs.every((_, i) => r[i] != null)
  if (q.type === 'logger') return Boolean(r.level && r.message?.trim())
  return true
}

export function grade(q, r) {
  if (!isAnswered(q, r)) return false
  switch (q.type) {
    case 'single':
      return r === q.answer
    case 'multi':
      return sameSet(r, q.answer)
    case 'order':
      return r.every((v, i) => v === i)
    case 'match':
      return q.pairs.every((_, i) => Number(r[i]) === i)
    case 'level':
      return q.answer.includes(r)
    case 'logger':
      return gradeWrite(q, r).correct
    default:
      return false
  }
}

// Problems with content in a question definition, for the content checker.
export function validateQuestion(q) {
  const errs = []
  if (!QUESTION_TYPES.includes(q.type)) return [`unknown type ${q.type}`]
  if (!q.prompt) errs.push('missing prompt')
  if (!q.explain) errs.push('missing explain')
  if (q.type === 'single') {
    if (!(q.options?.length >= 2)) errs.push('needs 2+ options')
    if (!Number.isInteger(q.answer) || !q.options?.[q.answer]) errs.push('answer index out of range')
  }
  if (q.type === 'multi') {
    if (!(q.options?.length >= 3)) errs.push('needs 3+ options')
    if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some((a) => !q.options?.[a])) errs.push('bad answer list')
  }
  if (q.type === 'order' && !(q.items?.length >= 3)) errs.push('needs 3+ items')
  if (q.type === 'level' && !(q.answer?.length && q.answer.every((l) => LEVELS.includes(l)))) errs.push('answer must list levels')
  if (q.type === 'logger') {
    if (!q.checks?.length || !q.level?.length) errs.push('needs checks and accepted levels')
    else if (!gradeWrite(q, q.model ?? {}).correct) errs.push('the model answer fails its own checks')
  }
  if (q.type === 'match') {
    if (!(q.pairs?.length >= 3)) errs.push('needs 3+ pairs')
    if (new Set(q.pairs?.map((p) => p[1])).size !== q.pairs?.length) errs.push('right-hand values must be unique')
  }
  return errs
}
