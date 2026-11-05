import { PASS_MARK, RETAKE_FOCUS } from '../quiz/exam.js'
import { inTime } from './timer.js'

// Readiness rules. Plain functions with no page or storage code, so scripts/check-readiness.js can test them.
// An area earns "ready" with evidence: missing evidence blocks it, so a few lucky answers can't pass an area.

export const COVERAGE_READY = 60
export const COVERAGE_CLOSE = 30
export const ACCURACY_READY = PASS_MARK
export const IN_TIME_READY = 70
export const LOW_MARK = 50 // below this, a measured result holds an area back from "close"
export const MIN_ANSWERS = 10
export const MIN_TIMED = 5
export const MAX_OVERDUE = 3
export const MIN_TOPIC_TIMED = 3
const RECENT = 10

export const LEVELS = {
  ready: 'Ready',
  close: 'Getting there',
  building: 'Building',
  'not-started': 'Not started',
}
const LEVEL_ORDER = ['not-started', 'building', 'close', 'ready']

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null)

// Latest attempt per problem: what you can do now matters more than your first slow try.
export function latestTimes(progress) {
  const times = new Map()
  for (const [id, entry] of Object.entries(progress)) {
    const last = Array.isArray(entry?.timeLog) ? entry.timeLog.at(-1) : null
    if (Number.isFinite(last?.totalSeconds) && last.minutes > 0) times.set(id, last)
  }
  return times
}

// Both histories are newest first. A retake is left out: it holds only questions you already got wrong, so its score
// says nothing about the area as a whole.
export function collectAnswers(exams, mocks) {
  const fromExams = exams.filter((e) => e.focus !== RETAKE_FOCUS).slice(0, RECENT).flatMap((e) => e.results)
  const fromMocks = mocks.slice(0, RECENT).flatMap((m) => m.results.map((r) => ({ id: r.id, ok: Boolean(r.solved) })))
  return [...fromExams, ...fromMocks]
}

export function areaReport({ slug, label, items, progress, review, answers, times, today }) {
  const ids = new Set(items.map((p) => p.id))
  const solved = items.filter((p) => progress[p.id]?.status === 'solved').length
  const mine = answers.filter((a) => ids.has(a.id))
  const timed = items.map((p) => times.get(p.id)).filter(Boolean)
  const report = {
    slug,
    label,
    total: items.length,
    solved,
    coverage: percent(solved, items.length) ?? 0,
    // exams only draw on quizzes, so an area without any can't be asked for exam evidence
    examined: items.some((p) => p.exercise === 'quiz'),
    answers: mine.length,
    accuracy: mine.length >= MIN_ANSWERS ? percent(mine.filter((a) => a.ok).length, mine.length) : null,
    timed: timed.length,
    inTime: timed.length >= MIN_TIMED ? percent(timed.filter(inTime).length, timed.length) : null,
    overdue: items.filter((p) => review[p.id] && review[p.id].due < today).length,
  }
  report.gaps = gapsOf(report)
  report.level = levelOf(report)
  return report
}

// What stands between this area and "ready", most useful first. Weak results come before missing evidence.
function gapsOf(a) {
  const gaps = []
  if (a.accuracy !== null && a.accuracy < ACCURACY_READY) {
    gaps.push({ kind: 'accuracy', text: `Exam accuracy is ${a.accuracy}%. Aim for ${ACCURACY_READY}%.` })
  }
  if (a.inTime !== null && a.inTime < IN_TIME_READY) {
    gaps.push({ kind: 'speed', text: `You finish ${a.inTime}% in time. Aim for ${IN_TIME_READY}%.` })
  }
  if (a.overdue > MAX_OVERDUE) gaps.push({ kind: 'overdue', text: `Clear your overdue reviews: ${a.overdue} waiting.` })
  if (a.coverage < COVERAGE_READY) {
    const more = Math.ceil((a.total * COVERAGE_READY) / 100) - a.solved
    gaps.push({ kind: 'coverage', text: `Solve ${more} more to cover ${COVERAGE_READY}%.` })
  }
  if (a.examined && a.accuracy === null) {
    gaps.push({ kind: 'accuracy', text: `Not enough exam answers yet: ${a.answers} of ${MIN_ANSWERS}.` })
  }
  if (a.inTime === null) gaps.push({ kind: 'speed', text: `Not enough timed solves yet: ${a.timed} of ${MIN_TIMED}.` })
  return gaps
}

function levelOf(a) {
  if (!a.solved && !a.answers && !a.timed) return 'not-started'
  if (!a.gaps.length) return 'ready'
  const weak = (a.accuracy !== null && a.accuracy < LOW_MARK) || (a.inTime !== null && a.inTime < LOW_MARK)
  return a.coverage >= COVERAGE_CLOSE && !weak ? 'close' : 'building'
}

// Furthest behind first, because that is where time pays back most.
export const sortAreas = (areas) =>
  [...areas].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.coverage - b.coverage)

// Topics you can solve but not in time, which accuracy alone never shows. Total time, so resets don't flatter it.
export function topicSpeed(topics, times) {
  return topics
    .map((topic) => {
      const records = [...topic.ids].map((id) => times.get(id)).filter(Boolean)
      const usage = records.reduce((sum, r) => sum + r.totalSeconds / (r.minutes * 60), 0)
      return {
        slug: topic.slug,
        title: topic.title,
        timed: records.length,
        inTime: percent(records.filter(inTime).length, records.length),
        pace: records.length ? Math.round((usage / records.length) * 100) : 0, // 100 means exactly on target
      }
    })
    .filter((t) => t.timed >= MIN_TOPIC_TIMED)
    .sort((a, b) => b.pace - a.pace)
}

export function overview(areas, answers, times) {
  const records = [...times.values()]
  return {
    ready: areas.filter((a) => a.level === 'ready').length,
    total: areas.length,
    accuracy: answers.length >= MIN_ANSWERS ? percent(answers.filter((a) => a.ok).length, answers.length) : null,
    inTime: records.length >= MIN_TIMED ? percent(records.filter(inTime).length, records.length) : null,
    overdue: areas.reduce((sum, a) => sum + a.overdue, 0),
  }
}
