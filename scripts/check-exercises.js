// Validates interactive exercises in content files:
//   diagram       → reference uses known node types, every check passes on the reference and fails on an empty canvas
//   quiz          → 4+ well-formed questions
//   investigation → log lines with both relevant and irrelevant lines, 3+ well-formed questions
// Usage: node scripts/check-exercises.js [id ...]
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isNodeType } from '../src/arch/catalog.js'
import { matcherTypes, RULE_TYPES, runDiagramChecks } from '../src/arch/checks.js'
import { emptyDiagram } from '../src/arch/model.js'
import { validateQuestion } from '../src/quiz/quiz.js'

const root = resolve('src/content')
const only = new Set(process.argv.slice(2))
const counts = { diagram: 0, quiz: 0, investigation: 0, written: 0 }
let failures = 0

function checkDiagram(d) {
  const errs = []
  if (!d.reference?.nodes?.length) return ['diagram.reference missing']
  if (!(d.checks?.length >= 4)) errs.push('needs 4+ checks')
  for (const n of d.reference.nodes) if (!isNodeType(n.type)) errs.push(`unknown node type "${n.type}" in reference`)
  for (const c of d.checks ?? []) {
    if (!c.label) errs.push('check without label')
    if (!RULE_TYPES.includes(c.rule?.type)) errs.push(`unknown rule type "${c.rule?.type}"`)
    const r = c.rule ?? {}
    for (const m of [r.match, r.from, r.to, r.via, r.target, r.of, r.edgeTo, r.edgeFrom])
      for (const t of matcherTypes(m)) if (!isNodeType(t)) errs.push(`unknown node type "${t}" in check "${c.label}"`)
  }
  if (errs.length) return errs
  runDiagramChecks(d.reference, d.checks).forEach((r) => !r.pass && errs.push(`reference fails: ${r.label}`))
  runDiagramChecks(emptyDiagram(), d.checks).forEach((r) => r.pass && errs.push(`passes on empty canvas: ${r.label}`))
  return errs
}

function checkQuestions(qs, min) {
  if (!Array.isArray(qs) || qs.length < min) return [`needs ${min}+ questions`]
  return qs.flatMap((q, i) => validateQuestion(q).map((e) => `Q${i + 1}: ${e}`))
}

function checkInvestigation(inv) {
  const errs = []
  const logs = inv.logs ?? []
  if (logs.length < 4) errs.push('needs 4+ log lines')
  if (!logs.some((l) => l.relevant)) errs.push('no relevant log line')
  if (!logs.some((l) => !l.relevant)) errs.push('every log line is relevant — add noise')
  for (const l of logs) if (!l.text) errs.push('log line without text')
  for (const l of logs) if (l.relevant && !l.why) errs.push(`relevant line without "why": ${l.text?.slice(0, 40)}`)
  return [...errs, ...checkQuestions(inv.questions, 3)]
}

for (const cat of readdirSync(root)) {
  for (const file of readdirSync(join(root, cat)).filter((f) => f.endsWith('.js')).sort()) {
    const p = (await import(pathToFileURL(join(root, cat, file)).href)).default
    if (only.size && !only.has(p.id)) continue
    let errs = []
    if (p.diagram) (counts.diagram++, (errs = checkDiagram(p.diagram)))
    else if (p.investigation) (counts.investigation++, (errs = checkInvestigation(p.investigation)))
    else if (p.quiz) (counts.quiz++, (errs = checkQuestions(p.quiz, 4)))
    else {
      if (['mulesoft', 'architecture', 'use-cases', 'case-studies', 'incidents'].includes(cat)) counts.written++
      continue
    }
    if (errs.length) {
      failures++
      console.log(`FAIL  ${p.id}`)
      for (const e of errs) console.log(`      - ${e}`)
    } else if (only.size) console.log(`PASS  ${p.id}`)
  }
}

console.log(
  `\nDiagrams ${counts.diagram} · quizzes ${counts.quiz} · investigations ${counts.investigation} · still written ${counts.written}`,
)
console.log(failures ? `${failures} problem(s) with errors.` : 'All exercises are consistent.')
process.exitCode = failures ? 1 : 0
