// Runs every DataWeave problem's reference solution against its sample and hidden tests
// using the local runner, so broken problems are caught before they ship.
// Usage: npm run runner (in another terminal), then npm run check-content [-- dw-012 dw-013 ...]
// Optional arguments limit the check to those problem ids.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAILS } from '../src/quiz/output-question.js'
import { outputsMatch } from '../src/runner/grade.js'

const RUNNER = process.env.RUNNER_URL || 'http://localhost:8787'
const dir = join(import.meta.dirname, '..', 'src', 'content', 'dataweave')

async function run(script, inputs) {
  const res = await fetch(`${RUNNER}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, inputs }),
  })
  return res.json()
}

const onlyIds = process.argv.slice(2)
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !onlyIds.length || onlyIds.includes(f.replace(/\.js$/, '')))
  .sort()

// The script must give the marked answer and none of the wrong ones. Duplicate keys vanish in a JSON comparison, so
// a question about them should ask for something countable.
async function checkQuestion(q, label) {
  const r = await run(q.run.script, q.run.inputs)
  const expected = q.options[q.answer]
  const matches = (option) => r.ok && option !== FAILS && outputsMatch(r.output, option, r.mime)
  // a question that expects a failure names the error, so a typo in its script can't pass as the right kind of failure
  const failedRightly = !r.ok && Boolean(q.run.error) && r.error?.includes(q.run.error)
  const ok = expected === FAILS ? failedRightly : matches(expected) && !q.options.some((o, i) => i !== q.answer && matches(o))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(r.ok ? `      got: ${r.output}` : `      error: ${r.error}`)
  return ok
}

let failures = 0
let questions = 0
for (const file of files) {
  const p = (await import(pathToFileURL(join(dir, file)))).default
  if (p.quiz) {
    for (const [i, q] of p.quiz.entries()) {
      questions++
      if (!q.run) {
        failures++
        console.log(`FAIL  ${p.id}  Q${i + 1}: has no script to run`)
      } else if (!(await checkQuestion(q, `${p.id}  Q${i + 1}`))) failures++
    }
    continue
  }
  const cases = [{ name: 'Sample', inputs: p.inputs, expected: p.expected.content }, ...(p.tests || [])]
  for (const tc of cases) {
    const r = await run(p.solution, tc.inputs)
    const ok = r.ok && outputsMatch(r.output, tc.expected, p.expected.mime)
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.id}  ${tc.name}`)
    if (!ok) console.log(r.ok ? `      got: ${r.output}` : `      error: ${r.error}`)
  }
}
console.log(failures ? `\n${failures} failing case(s)` : `\nAll solutions pass, and all ${questions} output questions match the engine.`)
// exitCode instead of exit(): exiting with fetch sockets still open crashes Node on Windows.
process.exitCode = failures ? 1 : 0
