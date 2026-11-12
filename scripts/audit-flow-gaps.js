// For each flow problem: take one component out of the reference design and see whether every check still passes.
// When it does, a learner can leave that component out and still be told the design is done.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { designChecks, runChecks } from '../src/flow/checks.js'
import { removeNode, walk } from '../src/flow/model.js'

const CORE = new Set(['logger', 'transform', 'set-payload', 'set-variable', 'flow-ref', 'raise-error', 'validation', 'parse-template'])
const dir = join(import.meta.dirname, '..', 'src', 'content', 'flows')
const only = process.argv.slice(2)
let total = 0
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.js')).sort()) {
  const p = (await import(pathToFileURL(join(dir, file)))).default
  if (only.length && !only.includes(p.id)) continue
  if (!p.flowChecks?.length) continue
  const checks = designChecks(p)
  const gaps = []
  walk(p.referenceFlow, (item, ctx) => {
    if (ctx.isFlow || ctx.isRoute || CORE.has(item.type)) return
    const without = removeNode(p.referenceFlow, item.id)
    if (runChecks(without, checks).every((r) => r.pass)) gaps.push(`${item.type} in ${ctx.flow.name}${item.config?.sql ? ` (${item.config.sql.slice(0, 40)})` : item.config?.path ? ` (${item.config.path})` : ''}`)
  })
  if (gaps.length) {
    total += gaps.length
    console.log(`${p.id}  ${p.title}\n    ${gaps.join('\n    ')}`)
  }
}
console.log(`\n${total} components can be left out unnoticed`)
