// Verifies Flow Design problems: every reference design must pass all of its own checks,
// every check must fail on an empty design, and every component type must exist in the catalog.
// Usage: npm run check-flows [-- fl-001 fl-002 ...]
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COMPONENTS } from '../src/flow/catalog.js'
import { designChecks, runChecks } from '../src/flow/checks.js'
import { emptyDesign, walk } from '../src/flow/model.js'
import { gapsOf } from './flow-gaps.js'

const dir = join(import.meta.dirname, '..', 'src', 'content', 'flows')
const onlyIds = process.argv.slice(2)

let failures = 0
let withChecks = 0
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !onlyIds.length || onlyIds.includes(f.replace(/\.js$/, '')))
  .sort()

const fail = (id, msg) => {
  failures++
  console.log(`FAIL  ${id}  ${msg}`)
}

for (const file of files) {
  const p = (await import(pathToFileURL(join(dir, file)))).default
  if (!p.flowChecks?.length) {
    console.log(`----  ${p.id}  no flowChecks (self-assessed)`)
    continue
  }
  withChecks++
  if (!p.referenceFlow) {
    fail(p.id, 'has flowChecks but no referenceFlow')
    continue
  }

  walk(p.referenceFlow, (item, ctx) => {
    if (!ctx.isFlow && !ctx.isRoute && !COMPONENTS[item.type]) fail(p.id, `unknown component type "${item.type}"`)
  })
  const checks = designChecks(p)
  for (const r of runChecks(p.referenceFlow, checks)) {
    if (!r.pass) fail(p.id, `reference fails: ${r.label}`)
  }
  const emptyPasses = runChecks(emptyDesign(), checks).filter((r) => r.pass)
  for (const r of emptyPasses) fail(p.id, `passes on an empty design: ${r.label}`)
  // every component of the reference is either needed by a check or listed in optionalSteps with a reason
  const gaps = gapsOf(p)
  for (const g of gaps.filter((x) => !x.optional)) fail(p.id, `can be left out and every check still passes: ${g.text}`)
  for (const o of p.optionalSteps ?? []) {
    if (!o.why?.trim()) fail(p.id, `optionalSteps entry for ${o.type} needs a reason (why)`)
    if (!gaps.some((g) => g.type === o.type && (!o.flow || g.flow === o.flow))) fail(p.id, `optionalSteps lists ${o.type}${o.flow ? ` in ${o.flow}` : ''}, but a check already needs it, or the reference has none`)
  }
  console.log(`PASS  ${p.id}  ${checks.length} checks`)
}

console.log(failures ? `\n${failures} problem(s)` : `\nAll ${withChecks} flow problems with checks are consistent.`)
process.exitCode = failures ? 1 : 0
