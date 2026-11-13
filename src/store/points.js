import { problems } from '../data/problems.js'
import { statusOf, useProgress } from './progress.js'

// Points and levels. Nothing extra is stored: points are counted from the solved problems already saved, so work
// done before this existed counts too, and every device shows the same total. Every section, the Logging Lab
// included, gives points by the problem's level.
export const POINTS = { BEGINNER: 10, INTERMEDIATE: 20, ADVANCED: 30, EXPERT: 40 }

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

export function countPoints(progress) {
  let total = 0
  let solved = 0
  for (const p of problems) {
    if (statusOf(progress[p.id]) !== 'solved') continue
    total += pointsFor(p)
    solved++
  }
  return { total, solved }
}

export function usePoints() {
  const counted = countPoints(useProgress())
  return { ...counted, ...levelOf(counted.total) }
}
