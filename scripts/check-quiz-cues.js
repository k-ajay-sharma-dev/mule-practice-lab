// Finds choice questions whose right answer can be picked without the knowledge: it is clearly the longest option, or
// every wrong option is much shorter. Run with a folder of src/content to list the questions, or --summary for counts.
//   node scripts/check-quiz-cues.js mulesoft            lists the flagged questions of one area
//   node scripts/check-quiz-cues.js --summary           counts for every area
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve('src/content')
const args = process.argv.slice(2)
const summary = args.includes('--summary')
const areas = args.filter((a) => !a.startsWith('--'))
const plain = (text) => String(text).replace(/[`*_]/g, '').trim()

// The cue rule: the right option is longer than every wrong one by a third, or it is the longest and the wrong options
// average under 60 percent of its length. Several right options (multi) count when all of them are longer than all wrong.
export function cueOf(q) {
  if (!Array.isArray(q.options) || q.options.length < 3) return null
  const right = new Set(Array.isArray(q.answer) ? q.answer : [q.answer])
  const len = q.options.map((o) => plain(o).length)
  const good = len.filter((_, i) => right.has(i))
  const bad = len.filter((_, i) => !right.has(i))
  if (!good.length || !bad.length) return null
  const shortGood = Math.min(...good)
  const longBad = Math.max(...bad)
  const meanBad = bad.reduce((a, b) => a + b, 0) / bad.length
  if (shortGood >= longBad * 1.33) return `right ${shortGood} chars, longest wrong ${longBad}`
  if (shortGood > longBad && meanBad < shortGood * 0.6) return `right ${shortGood} chars, wrong ones average ${Math.round(meanBad)}`
  return null
}
export const isLongest = (q) => {
  const right = new Set(Array.isArray(q.answer) ? q.answer : [q.answer])
  const len = q.options.map((o) => plain(o).length)
  return Math.min(...len.filter((_, i) => right.has(i))) >= Math.max(...len.filter((_, i) => !right.has(i)))
}

async function area(name) {
  const dir = path.join(ROOT, name)
  const rows = []
  let total = 0
  let longest = 0
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort()) {
    const { default: problem } = await import(pathToFileURL(path.join(dir, file)).href)
    ;(problem.quiz ?? []).forEach((q, i) => {
      if (!['single', 'multi'].includes(q.type) || !Array.isArray(q.options)) return
      total++
      if (isLongest(q)) longest++
      const cue = cueOf(q)
      if (cue)
        rows.push({
          file,
          index: i,
          cue,
          prompt: plain(q.prompt).slice(0, 90),
        })
    })
  }
  return { name, total, longest, rows }
}

// only when run, not when another script imports the rule
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = areas.length ? areas : fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory())
  for (const name of all) {
    const r = await area(name)
    const pct = (n) => (r.total ? Math.round((100 * n) / r.total) : 0)
    console.log(`${name}: ${r.total} choice questions, right answer longest in ${pct(r.longest)}%, ${r.rows.length} with a length cue (${pct(r.rows.length)}%)`)
    if (!summary) for (const row of r.rows) console.log(`  ${row.file} q${row.index + 1}: ${row.cue}. ${row.prompt}`)
  }
}
