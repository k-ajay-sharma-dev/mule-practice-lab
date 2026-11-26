// Guards a rewrite of quiz options. Compares each changed content file with the last commit and fails when anything other
// than the wrong options of choice questions changed, when an option the explanation quotes was changed, when a new
// option breaks the writing rules, or when the right answer is still clearly the longest option.
//   node scripts/check-quiz-rewrite.js            every changed file under src/content
//   node scripts/check-quiz-rewrite.js ms-001 ms-002
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cueOf } from './check-quiz-cues.js'

const wanted = process.argv.slice(2)
const changed = execSync('git diff --name-only -- src/content', {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f.endsWith('.js'))
const files = wanted.length ? changed.filter((f) => wanted.some((w) => f.includes(w))) : changed
// each copy sits next to its file, so relative imports in the file still resolve
const load = async (file, text) => {
  const at = path.join(path.dirname(file), `.quiz-check-${path.basename(file, '.js')}-${Math.random().toString(36).slice(2)}.mjs`)
  fs.writeFileSync(at, text)
  try {
    return (await import(pathToFileURL(path.resolve(at)).href)).default
  } finally {
    fs.rmSync(at, { force: true })
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const plain = (t) => String(t).replace(/[`*_]/g, '').trim()
const STYLE = [/ [—–] |—|–/, /\b(simply|just|easy|easily|easier|simpler)\b/i]
const problems = []
let options = 0
let rewritten = 0

for (const file of files) {
  const before = await load(file, execSync(`git show HEAD:${file}`, { encoding: 'utf8' }))
  const after = await load(file, fs.readFileSync(file, 'utf8'))
  const say = (text) => problems.push(`${path.basename(file)}: ${text}`)
  const { quiz: q0 = [], ...rest0 } = before
  const { quiz: q1 = [], ...rest1 } = after
  if (!same(rest0, rest1)) say('something outside the quiz changed')
  if (q0.length !== q1.length) {
    say('the number of questions changed')
    continue
  }
  q0.forEach((a, i) => {
    const b = q1[i]
    const where = `q${i + 1}`
    const { options: o0, ...k0 } = a
    const { options: o1, ...k1 } = b
    // a question rewritten as a whole: a new prompt, with its own options, answer and explanation
    // (a new option count, such as a second wrong option added to a multi, counts as a whole rewrite too)
    const grown = Array.isArray(o0) && Array.isArray(o1) && o0.length !== o1.length
    if ((a.prompt !== b.prompt || grown) && ['single', 'multi'].includes(a.type) && a.type === b.type) {
      rewritten++
      const right = Array.isArray(b.answer) ? b.answer : [b.answer]
      if (!Array.isArray(o1) || o1.length < 4) say(`${where}: a rewritten question needs at least 4 options`)
      else if (!right.length || right.some((r) => !Number.isInteger(r) || r < 0 || r >= o1.length)) say(`${where}: the answer points outside the options`)
      if (!String(b.explain ?? '').trim()) say(`${where}: a rewritten question needs an explanation`)
      for (const text of [b.prompt, b.explain, ...(o1 ?? [])]) for (const rule of STYLE) if (rule.test(text)) say(`${where}: breaks a writing rule: ${String(text).slice(0, 80)}`)
      if (new Set(o1).size !== o1.length) say(`${where}: two options are the same`)
      const cue = cueOf(b)
      if (cue) say(`${where}: the right answer is the longest by far (${cue})`)
      return
    }
    if (!same(k0, k1)) return say(`${where}: a field other than the options changed`)
    if (!Array.isArray(o0)) return same(o0, o1) || say(`${where}: options changed`)
    if (!['single', 'multi'].includes(a.type)) return same(o0, o1) || say(`${where}: options of a ${a.type} question changed`)
    if (o0.length !== o1.length) return say(`${where}: the number of options changed`)
    const right = new Set(Array.isArray(a.answer) ? a.answer : [a.answer])
    o0.forEach((old, j) => {
      if (right.has(j)) return old === o1[j] || say(`${where}: the right option changed`)
      if (old === o1[j]) return
      options++
      // the explanation may name a wrong option: then that part of it stays in the option
      const quoted = [...String(a.explain ?? '').matchAll(/"([^"]{6,})"|`([^`]{6,})`/g)].map((m) => m[1] ?? m[2])
      for (const quote of quoted)
        if (plain(old).includes(plain(quote)) && !plain(o1[j]).includes(plain(quote)))
          say(`${where}: the explanation quotes "${quote}", which left option ${j + 1}`)
      for (const rule of STYLE) if (rule.test(o1[j])) say(`${where}: option ${j + 1} breaks a writing rule: ${o1[j]}`)
      if (o1.filter((x) => x === o1[j]).length > 1) say(`${where}: two options are the same`)
    })
    const cue = cueOf(b)
    if (cue) say(`${where}: the right answer is still the longest by far (${cue})`)
  })
}
console.log(`${files.length} files, ${rewritten} questions rewritten whole, ${options} options rewritten, ${problems.length} problems`)
for (const p of problems) console.log(`  ${p}`)
process.exit(problems.length ? 1 : 0)
