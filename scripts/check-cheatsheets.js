// Checks src/data/cheatsheets.js: every sheet's shape, then re-runs every DataWeave example on the local runner
// and compares the output with the Result column, character for character.
// Usage: npm run runner (in another terminal), then node scripts/check-cheatsheets.js
import { CHEATSHEETS } from '../src/data/cheatsheets.js'

const RUNNER = process.env.RUNNER_URL || 'http://localhost:8787'
const DW_SLUG = 'dataweave'

async function run(script) {
  const res = await fetch(`${RUNNER}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, inputs: [] }),
  })
  return res.json()
}

// A cell that is exactly one code span, without its backticks; null for anything else.
const code = (cell) => (/^`[^`]+`$/.test(cell) ? cell.slice(1, -1) : null)

// See the header comment in cheatsheets.js for how a row becomes a script.
function scriptFor(example, meta) {
  const [header, ...body] = example.split(' --- ')
  const hasOwnHeader = body.length > 0
  return [
    '%dw 2.0',
    ...(meta?.header ? [meta.header] : []),
    hasOwnHeader ? header : 'output application/json indent=false',
    '---',
    hasOwnHeader ? body.join(' --- ') : example,
  ].join('\n')
}

function shapeErrors(sheet) {
  const errs = []
  if (!sheet.slug || !sheet.title || !sheet.blurb || !sheet.sections?.length) errs.push(`${sheet.slug}: missing a sheet field`)
  for (const s of sheet.sections ?? []) {
    const where = `${sheet.slug} / ${s.title}`
    if (!s.title || !s.columns?.length || !s.rows?.length) errs.push(`${where}: missing a section field`)
    for (const [i, row] of (s.rows ?? []).entries()) {
      const hasMeta = sheet.slug === DW_SLUG && row.length === s.columns.length + 1 && typeof row.at(-1) === 'object'
      const cells = hasMeta ? row.slice(0, -1) : row
      if (cells.length !== s.columns.length) errs.push(`${where} row ${i + 1}: ${cells.length} cells for ${s.columns.length} columns`)
      for (const c of cells) {
        if (typeof c !== 'string') errs.push(`${where} row ${i + 1}: cell is not a string`)
        else if ((c.match(/`/g) ?? []).length % 2) errs.push(`${where} row ${i + 1}: unbalanced backticks in ${c}`)
      }
    }
  }
  return errs
}

let failures = 0
for (const sheet of CHEATSHEETS) {
  for (const e of shapeErrors(sheet)) {
    failures++
    console.log(`FAIL  shape  ${e}`)
  }
}

let examples = 0
const sheet = CHEATSHEETS.find((s) => s.slug === DW_SLUG)
for (const section of sheet.sections) {
  for (const [fn, , exampleCell, resultCell, meta] of section.rows) {
    const label = `${section.title}  ${fn}  ${exampleCell}`
    examples++
    const example = code(exampleCell)
    const expected = code(resultCell)
    if (example === null || expected === null) {
      failures++
      console.log(`FAIL  ${label}\n      Example and Result must each be one code span`)
      continue
    }
    const r = await run(scriptFor(example, meta))
    const ok = r.ok && r.output === expected
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    if (!ok) console.log(r.ok ? `      got: ${r.output}\n      expected: ${expected}` : `      error: ${r.error}`)
  }
}

console.log(failures ? `\n${failures} failing check(s) of ${examples} example(s)` : `\nAll ${examples} examples match.`)
// exitCode instead of exit(): exiting with fetch sockets still open crashes Node on Windows.
process.exitCode = failures ? 1 : 0
