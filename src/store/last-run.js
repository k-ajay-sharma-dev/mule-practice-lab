// The last Run and Submit of each DataWeave problem in this tab, so Copy for AI can tell what the script did. A result
// only counts for the exact script it ran.
const runs = new Map()

export function rememberRun(id, code, patch) {
  const old = runs.get(id)
  runs.set(id, { ...(old?.code === code ? old : {}), code, ...patch })
}

// { run, tests } of this script, or null when it has not run since its last change
export function lastRunOf(id, code) {
  const last = runs.get(id)
  return last && last.code === code ? last : null
}
