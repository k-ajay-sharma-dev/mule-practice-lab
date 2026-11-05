import { grade } from './quiz.js'

// Practice exam rules. Plain functions with no page or storage code, so scripts/check-exam.js can test them.
// An exam item is { id, q }: a problem id and the index of one question in that problem's quiz.

export const PASS_MARK = 70
export const MINUTES_PER_QUESTION = 2
export const LENGTHS = [20, 40, 60]
export const RETAKE_FOCUS = 'Missed questions'

export const LEVEL_SETS = {
  any: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
  mid: ['INTERMEDIATE', 'ADVANCED', 'EXPERT'],
  senior: ['ADVANCED', 'EXPERT'],
}

export const itemKey = (item) => `${item.id}:${item.q}`

export function shuffled(list, random = Math.random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// One question per problem first, so a short exam covers as many topics as it can. A small pool then goes round
// again. Questions from recent exams are used last. keep can leave some questions out, such as detail ones.
export function chooseQuestions(loaded, count, seen = new Set(), random = Math.random, keep = () => true) {
  const queues = loaded.map((problem) => {
    const all = problem.quiz.map((question, q) => ({ question, item: { id: problem.id, q } }))
    const items = shuffled(all.filter((x) => keep(x.question)).map((x) => x.item), random)
    return [...items.filter((i) => !seen.has(itemKey(i))), ...items.filter((i) => seen.has(itemKey(i)))]
  })
  const picked = []
  while (picked.length < count && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (picked.length === count) break
      if (queue.length) picked.push(queue.shift())
    }
  }
  return shuffled(picked, random)
}

// An untouched question has no response, so it counts as wrong rather than as whatever it first displayed.
export function scoreExam(items, responses, questionOf) {
  return items.map((item) => {
    const response = responses[itemKey(item)]
    return { id: item.id, q: item.q, answered: response != null, ok: grade(questionOf(item), response) }
  })
}

export function examSummary(results) {
  const correct = results.filter((r) => r.ok).length
  const total = results.length
  const exact = total ? (correct / total) * 100 : 0
  // the rounded figure is for display: 69.6% must not pass by being shown as 70%
  return { correct, total, pct: Math.round(exact), passed: exact >= PASS_MARK }
}

// Weakest topics first. A topic needs two questions, because one question says nothing about a topic.
export function topicScores(results, topics) {
  return topics
    .map((topic) => {
      const mine = results.filter((r) => topic.ids.has(r.id))
      const correct = mine.filter((r) => r.ok).length
      return { ...topic, correct, total: mine.length, pct: mine.length ? Math.round((correct / mine.length) * 100) : 0 }
    })
    .filter((t) => t.total >= 2)
    .sort((a, b) => a.pct - b.pct || b.total - a.total)
}

export const seenInHistory = (history) => new Set(history.flatMap((h) => h.results.map(itemKey)))

// Stored exams are checked before use: an old or corrupt one is dropped, and so are items whose problem was removed.
export function validSession(s, isKnown) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null
  const items = s.items.filter((i) => i && Number.isInteger(i.q) && i.q >= 0 && isKnown(i.id))
  if (!items.length || typeof s.startedIso !== 'string' || isNaN(Date.parse(s.startedIso))) return null
  if (!Number.isFinite(s.minutes) || s.minutes <= 0) return null
  if (s.finishedIso && !Array.isArray(s.results)) return null
  const responses = s.responses && typeof s.responses === 'object' && !Array.isArray(s.responses) ? s.responses : {}
  const flagged = Array.isArray(s.flagged) ? s.flagged : []
  return { ...s, items, responses, flagged, current: Math.min(Math.max(0, Number(s.current) || 0), items.length - 1) }
}
