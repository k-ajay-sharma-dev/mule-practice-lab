// Checks the prompt of Copy for AI (src/study/ai-prompt.js) on every problem: with no work yet, with work in progress,
// and with finished work.
// 1. It has the question and the work, and the checks and the runs where the problem has them.
// 2. Nothing in it is undefined, NaN or [object Object] because of how it is built.
// 3. It never holds the model answer, and a quiz never tells which option is right.
// 4. It is small enough to paste into an AI chat.
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exerciseOf } from '../src/data/exercises.js'
import { buildPrompt, promptKinds } from '../src/study/ai-prompt.js'

const MAX = 90000
const only = process.argv.slice(2)
const failures = []
const longest = {}
let prompts = 0

// the work a learner could have saved: { empty, part, done }
function entriesFor(p, exercise) {
  const out = { empty: {} }
  if (exercise === 'flow' && p.referenceFlow) {
    out.done = { flow: p.referenceFlow }
    const half = structuredClone(p.referenceFlow)
    for (const f of half.flows) f.steps = f.steps.slice(0, Math.ceil(f.steps.length / 2))
    out.part = { flow: half, plan: ['An HTTP call starts it.', '', '', '', ''] }
  }
  if (exercise === 'diagram') {
    const ref = p.diagram.reference
    out.done = { diagram: ref }
    out.part = { diagram: { nodes: ref.nodes.map(({ config, ...n }) => n), edges: ref.edges.slice(0, Math.ceil(ref.edges.length / 2)) } }
  }
  if (exercise === 'code') {
    out.part = { code: `${p.starterCode}\n// mine` }
    out.done = { code: p.solution }
  }
  if (exercise === 'raml') {
    out.part = { raml: '#%RAML 1.0\ntitle: Mine\n/orders:\n  get:\n' }
    out.done = { raml: p.referenceRaml, ramlFiles: Object.entries(p.referenceFiles ?? {}).map(([path, text]) => ({ path, text })) }
  }
  if (exercise === 'quiz' || exercise === 'investigation') {
    const questions = p.investigation?.questions ?? p.quiz
    const responses = {}
    questions.forEach((q, i) => {
      if (q.type === 'single') responses[i] = (q.answer + 1) % q.options.length
      if (q.type === 'multi') responses[i] = [0]
      if (q.type === 'order') responses[i] = q.items.map((_, k) => k)
      if (q.type === 'match') responses[i] = Object.fromEntries(q.pairs.map((_, k) => [k, k]))
      if (q.type === 'level') responses[i] = 'WARN'
      if (q.type === 'logger') responses[i] = { level: 'INFO', message: '#["Order received"]' }
    })
    out.part = { exercise: { responses, logs: [0] } }
    out.done = { exercise: { responses, logs: [0], submitted: true } }
  }
  if (exercise === 'written') out.part = { answer: 'My answer with a fence\n```json\n{}\n```' }
  return out
}

// long lines of the model answer that are not in the question too
function secretLines(p) {
  const given = `${p.description}\n${p.answerTemplate ?? ''}\n${JSON.stringify(p.diagram?.task ?? '')}`
  const texts = [typeof p.solution === 'string' ? p.solution : '', ...(p.keyPoints ?? []), ...(p.hints ?? [])]
  return texts.flatMap((t) => t.split('\n')).map((l) => l.trim()).filter((l) => l.length > 60 && !given.includes(l))
}

for (const dir of readdirSync(resolve('src/content'))) {
  for (const file of readdirSync(resolve('src/content', dir)).filter((f) => f.endsWith('.js'))) {
    const id = file.replace(/\.js$/, '')
    if (only.length && !only.includes(id)) continue
    const p = (await import(pathToFileURL(join(resolve('src/content', dir), file)).href)).default
    if (!p?.id || !p.category) continue
    const exercise = exerciseOf(p)
    const secrets = secretLines(p)
    const quiz = p.investigation?.questions ?? p.quiz
    for (const [state, entry] of Object.entries(entriesFor(p, exercise))) {
      for (const { key, ask } of promptKinds(exercise)) {
        // one kind is enough on most states: only the sentences around the same body differ
        if (state !== 'empty' && key !== 'review') continue
        const at = `${id} (${state}, ${key})`
        const bad = (text) => failures.push(`${at}: ${text}`)
        let text
        try {
          text = buildPrompt(p, entry, key)
        } catch (e) {
          bad(e.stack.split('\n').slice(0, 2).join(' '))
          continue
        }
        prompts++
        for (const name of ['problem', 'question', 'my_work']) if (!new RegExp(`<${name}>\\n[\\s\\S]+\\n</${name}>`).test(text)) bad(`no ${name}`)
        if (!text.includes(p.description.trim().slice(0, 200))) bad('the question is cut')
        if (ask && !text.includes(ask)) bad('the request is missing')
        if (!ask && !text.trimEnd().endsWith('My question:')) bad('context only should end with the place for a question')
        if (['flow', 'diagram', 'raml'].includes(exercise)) {
          const has = exercise === 'flow' ? p.flowChecks?.length : exercise === 'raml' ? true : p.diagram.checks?.length
          if (has && !text.includes('<checks>')) bad('no checks')
          const runs = (p.simulation ?? p.diagram?.simulation)?.tests?.length
          if (runs && !text.includes('<test_runs>')) bad('no test runs')
          if (state === 'done' && /- FAIL|Result: FAIL/.test(text)) bad('the reference answer shows as failing')
          if (state === 'part' && has && !/- (PASS|FAIL)/.test(text)) bad('no results')
        }
        if (exercise === 'code' && !text.includes('<my_test_runs>')) bad('no runs')
        const own = text.replaceAll(p.description.trim(), '')
        for (const junk of ['[object Object]', 'undefined', 'NaN']) {
          if (own.includes(junk) && !JSON.stringify([p.inputs, p.expected, p.starterCode, p.solution, p.referenceFlow, p.referenceRaml, quiz, p.investigation?.logs, p.diagram, p.simulation]).includes(junk)) bad(`holds ${junk}`)
        }
        // what the learner wrote can match the solution; everything else must not
        if (state === 'empty' || (state === 'part' && exercise !== 'flow')) for (const s of secrets) if (text.includes(s) && !JSON.stringify([quiz, p.investigation, p.diagram, p.simulation, p.starterCode, p.files, p.inputs, p.tests, p.ramlChecks, p.flowChecks].filter(Boolean)).includes(JSON.stringify(s).slice(1, -1))) bad(`gives away: ${s.slice(0, 80)}`)
        if (quiz && state !== 'done') {
          for (const q of quiz) if (q.explain && text.includes(q.explain.trim()) && !p.description.includes(q.explain.trim())) bad('gives away an explanation')
        }
        if (text.length > MAX) bad(`is ${text.length} characters`)
        if (!longest[exercise] || longest[exercise].n < text.length) longest[exercise] = { n: text.length, at }
      }
    }
  }
}

if (failures.length) {
  console.log(`${failures.length} prompt problem(s):`)
  for (const f of failures.slice(0, 40)) console.log(`  ${f}`)
  process.exitCode = 1
} else {
  console.log(`All Copy for AI prompts are complete (${prompts} prompts).`)
}
for (const [k, v] of Object.entries(longest)) console.log(`Longest ${k}: ${v.n} characters, ${v.at}`)
