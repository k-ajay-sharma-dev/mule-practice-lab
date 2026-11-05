// The touch editor's coloured layer must hold exactly the typed text, or the cursor drifts away from the letters.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { tokenize } from '../src/editor/highlight.js'

const joined = (code, language) => tokenize(code, language).map((t) => t.text).join('')
const kindOf = (code, language, text) => tokenize(code, language).find((t) => t.text === text)?.kind

const samples = [
  '%dw 2.0\noutput application/json\n---\npayload map (item, i) -> { id: item.id, n: $$ }',
  '// comment\n/* block\nspans */ "a\\"b" \'c\' `d` |2026-11-05| 3.14 @attr',
  '/* never closed',
  '"never closed',
  '',
  '\n\n',
  '{"a": 1, "b": [true, null, -2.5e3], "c": "x"}',
  '<?xml version="1.0"?><a b="c"><!-- note --><d/></a>',
  '<!-- never closed',
  'é ñ 日本語 😀',
]

for (const language of ['dataweave', 'json', 'xml', 'plaintext', undefined]) {
  for (const code of samples) assert.equal(joined(code, language), code, `${language}: ${JSON.stringify(code)}`)
}

// every script in the site must survive too
let scripts = 0
const dir = new URL('../src/content/dataweave/', import.meta.url)
for (const file of readdirSync(dir)) {
  const text = readFileSync(new URL(file, dir), 'utf8')
  for (const language of ['dataweave', 'json', 'xml']) assert.equal(joined(text, language), text, file)
  scripts++
}

assert.equal(kindOf('output application/json', 'dataweave', 'output'), 'keyword')
assert.equal(kindOf('payload map f', 'dataweave', 'map'), 'builtin')
assert.equal(kindOf('payload map f', 'dataweave', 'payload'), 'plain')
assert.equal(kindOf('"map"', 'dataweave', '"map"'), 'string')
assert.equal(kindOf('// map', 'dataweave', '// map'), 'comment')
assert.equal(kindOf('---', 'dataweave', '---'), 'keyword')
assert.equal(kindOf('$$', 'dataweave', '$$'), 'variable')
assert.equal(kindOf('{"a": "b"}', 'json', '"a"'), 'variable')
assert.equal(kindOf('{"a": "b"}', 'json', '"b"'), 'string')
assert.equal(kindOf('<a b="c"/>', 'xml', '"c"'), 'string')

console.log(`All editor checks pass (${samples.length} samples, ${scripts} content files).`)
