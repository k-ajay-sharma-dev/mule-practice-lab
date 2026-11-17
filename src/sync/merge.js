// Merges two copies of one problem's progress, one from this browser and one from the account.
//
// Whole-entry "newest wins" lost solves: opening a problem on a second device starts its timer, which made that
// device's unsolved copy the newest, and it replaced the solved one. So each part is merged on its own:
// - status: the later deliberate change wins (statusAt). Without dates the further status wins, so a solve is kept.
// - your work (code, answers, notes and the rest): the copy edited last wins (editedAt, else updatedAt).
// - solve, review and edit dates: the later one. The time log: both devices' records.
// - timer: the copy touched last, unless the problem was solved after that attempt started.
const RANK = { solved: 3, revisit: 2, attempted: 1 }
const LOG_SIZE = 20

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const later = (a, b) => ((a ?? '') > (b ?? '') ? a : b)
const editAt = (e) => e.editedAt ?? e.updatedAt ?? ''

export function mergeEntry(a, b) {
  if (!isObject(a)) return b
  if (!isObject(b)) return a
  const [older, newer] = editAt(b) > editAt(a) ? [a, b] : [b, a]
  const out = { ...older, ...newer }

  // a copy without statusAt changed its status no later than its last edit
  const known = (x, y) => x.statusAt && x.statusAt > (y.statusAt ?? editAt(y))
  // editing never takes a problem back below solved or revisit, on one device or across two (as workedStatus)
  const status =
    Math.min(RANK[a.status] ?? 0, RANK[b.status] ?? 0) < 2 || !(known(a, b) || known(b, a))
      ? (RANK[b.status] ?? 0) > (RANK[a.status] ?? 0)
        ? b.status
        : a.status
      : known(a, b)
        ? a.status
        : b.status
  if (status) out.status = status
  else delete out.status

  for (const key of ['solvedAt', 'reviewedAt', 'statusAt', 'editedAt', 'updatedAt']) {
    const value = later(a[key], b[key])
    if (value) out[key] = value
  }

  const logs = [...(Array.isArray(a.timeLog) ? a.timeLog : []), ...(Array.isArray(b.timeLog) ? b.timeLog : [])]
  if (logs.length) {
    const byAt = new Map()
    for (const r of logs) if (isObject(r) && typeof r.at === 'string') byAt.set(r.at, r)
    out.timeLog = [...byAt.values()].sort((x, y) => (x.at < y.at ? -1 : 1)).slice(-LOG_SIZE)
  }

  const timer = ((b.updatedAt ?? '') > (a.updatedAt ?? '') ? b : a).timer ?? null
  const ended = out.status === 'solved' && out.solvedAt && timer?.firstStartedAt && timer.firstStartedAt <= out.solvedAt
  out.timer = ended ? null : timer
  if (out.timer == null && a.timer === undefined && b.timer === undefined) delete out.timer
  return out
}

// JSON with sorted keys, so two equal entries always compare equal
export function sameEntry(a, b) {
  return stable(a) === stable(b)
}
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (isObject(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
