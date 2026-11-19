// How much of a design problem (flow or diagram) you did on your own, from what the problem page records:
// hints[check] = highest hint level used, revealed / revealedAt = the reference was opened,
// rebuilds and rebuilding = rebuild from memory.
import { problems } from '../data/problems.js'

export const isDesign = (p) => p?.exercise === 'flow' || p?.exercise === 'diagram'
const ok = (e) => e !== null && typeof e === 'object'

export const topHint = (e) => (ok(e) && ok(e.hints) ? Math.max(0, ...Object.values(e.hints).map(Number).filter(Number.isFinite)) : 0)
export const hintCount = (e) => (ok(e) && ok(e.hints) ? Object.values(e.hints).reduce((a, b) => a + (Number(b) || 0), 0) : 0)

// solved again without looking after the reference was opened
export const rebuilt = (e) => ok(e) && e.rebuilds > 0 && !e.rebuilding && e.status === 'solved' && (e.solvedAt ?? '') > (e.revealedAt ?? '')
// The reference was opened before the problem was solved. Opening it after solving is only a comparison:
// new opens record revealedAfterSolveAt instead of revealedAt, and older ones show it as revealedAt after solvedAt.
const openedBeforeSolve = (e) =>
  Boolean(e.revealedAt) && !(e.status === 'solved' && !(e.rebuilds > 0) && e.solvedAt && e.solvedAt < e.revealedAt)
// the answer was seen and not yet rebuilt from memory
export const sawAnswer = (e) =>
  ok(e) &&
  !rebuilt(e) &&
  Boolean(e.rebuilding || openedBeforeSolve(e) || (e.revealed && !e.revealedAt && !e.revealedAfterSolveAt))
// solved with at most two hints per check and without the answer
export const onOwn = (e) => ok(e) && e.status === 'solved' && !sawAnswer(e) && topHint(e) < 3

export function independence(progress, list = problems) {
  const out = { flow: blank(), diagram: blank() }
  for (const p of list) {
    if (!isDesign(p)) continue
    const e = progress[p.id]
    const s = out[p.exercise]
    if (!ok(e) || e.status !== 'solved') continue
    s.solved++
    if (onOwn(e)) s.own++
    if (rebuilt(e)) s.rebuilt++
    if (sawAnswer(e)) s.answer++
    s.hints += hintCount(e)
  }
  return out
}
const blank = () => ({ solved: 0, own: 0, rebuilt: 0, answer: 0, hints: 0 })
