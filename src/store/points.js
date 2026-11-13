import { problems } from '../data/problems.js'
import { useLoggingProgress } from './logging.js'
import { statusOf, useProgress } from './progress.js'

// Points and levels. Nothing extra is stored: points are counted from what is already saved (solved problems and
// solved Logging Lab exercises), so work done before this existed counts too, and every device shows the same total.
export const POINTS = { BEGINNER: 10, INTERMEDIATE: 20, ADVANCED: 30, EXPERT: 40 }
export const LOGGING_POINTS = 5

export const pointsFor = (problem) => POINTS[problem?.level] ?? 10

// Level n starts at 50 × n × (n − 1) points: 0, 100, 300, 600, 1000, 1500… Each level asks a little more than the last.
const startOf = (level) => 50 * level * (level - 1)
export function levelOf(points) {
  let level = 1
  while (startOf(level + 1) <= points) level++
  const from = startOf(level)
  const to = startOf(level + 1)
  return { level, name: LEVEL_NAMES[level - 1] ?? `Level ${level}`, from, to, into: points - from, need: to - from }
}

const LEVEL_NAMES = [
  'First Steps',
  'Curious Builder',
  'Flow Starter',
  'DataWeave Explorer',
  'Connector Crafter',
  'Error Handler',
  'API Designer',
  'Integration Builder',
  'Batch Master',
  'Solution Thinker',
  'Integration Architect',
  'Mule Mentor',
]

export function countPoints(progress, logging) {
  let fromProblems = 0
  let solvedProblems = 0
  for (const p of problems) {
    if (statusOf(progress[p.id]) !== 'solved') continue
    fromProblems += pointsFor(p)
    solvedProblems++
  }
  const solvedLogging = Object.values(logging).filter((e) => e?.solved).length
  const fromLogging = solvedLogging * LOGGING_POINTS
  return { total: fromProblems + fromLogging, fromProblems, solvedProblems, fromLogging, solvedLogging }
}

export function usePoints() {
  const progress = useProgress()
  const logging = useLoggingProgress()
  const counted = countPoints(progress, logging)
  return { ...counted, ...levelOf(counted.total) }
}
