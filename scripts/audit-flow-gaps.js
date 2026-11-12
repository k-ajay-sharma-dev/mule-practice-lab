// Lists, for each flow problem, the components a design can leave out and still pass every check, and whether
// the problem marks each one optional (see scripts/flow-gaps.js). Usage: node scripts/audit-flow-gaps.js [fl-008 ...]
// --all also prints the ones marked optional.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gapsOf } from './flow-gaps.js'

const dir = join(import.meta.dirname, '..', 'src', 'content', 'flows')
const args = process.argv.slice(2)
const all = args.includes('--all')
const only = args.filter((a) => !a.startsWith('--'))
let open = 0
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.js')).sort()) {
  const p = (await import(pathToFileURL(join(dir, file)))).default
  if (only.length && !only.includes(p.id)) continue
  const gaps = gapsOf(p).filter((g) => all || !g.optional)
  if (!gaps.length) continue
  open += gaps.filter((g) => !g.optional).length
  console.log(`${p.id}  ${p.title}`)
  for (const g of gaps) console.log(`    ${g.text}${g.optional ? `   [optional: ${g.optional}]` : ''}`)
}
console.log(`\n${open} components can be left out unnoticed`)
