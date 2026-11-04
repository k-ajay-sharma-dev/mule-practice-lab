import { categoryBySlug } from './categories.js'
import { problems } from './problems.js'

// Every word of the query must appear somewhere in the problem; matches in the id, title and tags
// rank higher than matches in the summary.
export function searchProblems(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const results = []
  for (const p of problems) {
    const id = p.id.toLowerCase()
    const title = p.title.toLowerCase()
    const tags = p.tags.join(' ').toLowerCase()
    const cat = (categoryBySlug.get(p.category)?.label ?? '').toLowerCase()
    const summary = (p.summary ?? '').toLowerCase()
    let score = 0
    let all = true
    for (const w of words) {
      const s =
        (id === w ? 20 : id.includes(w) ? 8 : 0) +
        (title.includes(w) ? 6 : 0) +
        (p.tags.some((t) => t === w) ? 5 : tags.includes(w) ? 3 : 0) +
        (cat.includes(w) ? 2 : 0) +
        (summary.includes(w) ? 1 : 0)
      if (!s) {
        all = false
        break
      }
      score += s
    }
    if (all) results.push({ problem: p, score })
  }
  return results
    .sort((a, b) => b.score - a.score || a.problem.id.localeCompare(b.problem.id, undefined, { numeric: true }))
    .map((r) => r.problem)
}
