// Runs every DataWeave problem's reference solution against its sample and hidden tests
// using the local runner, so broken problems are caught before they ship.
// Usage: npm run runner (in another terminal), then npm run check-content [-- dw-012 dw-013 ...]
// Optional arguments limit the check to those problem ids.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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

let failures = 0
for (const file of files) {
  const p = (await import(pathToFileURL(join(dir, file)))).default
  const cases = [{ name: 'Sample', inputs: p.inputs, expected: p.expected.content }, ...(p.tests || [])]
  for (const tc of cases) {
    const r = await run(p.solution, tc.inputs)
    const ok = r.ok && outputsMatch(r.output, tc.expected, p.expected.mime)
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.id}  ${tc.name}`)
    if (!ok) console.log(r.ok ? `      got: ${r.output}` : `      error: ${r.error}`)
  }
}
console.log(failures ? `\n${failures} failing case(s)` : '\nAll solutions pass.')
// exitCode instead of exit(): exiting with fetch sockets still open crashes Node on Windows.
process.exitCode = failures ? 1 : 0
