// JSON layout: one entry per line, values exactly as written, and anything that isn't JSON left alone.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { formatJson } from '../src/study/json-format.js'

const rows = `[
  { "text": "Racecar", "reversed": "racecaR", "isPalindrome": true },
  { "text": "Mule 4", "reversed": "4 eluM", "isPalindrome": false }
]`
assert.equal(
  formatJson(rows),
  `[
  {
    "text": "Racecar",
    "reversed": "racecaR",
    "isPalindrome": true
  },
  {
    "text": "Mule 4",
    "reversed": "4 eluM",
    "isPalindrome": false
  }
]`,
)
// values keep their exact text
assert.equal(formatJson('{"price":10.50,"id":12345678901234567890,"e":1E5}'), '{\n  "price": 10.50,\n  "id": 12345678901234567890,\n  "e": 1E5\n}')
// a short list of plain values stays on one line, a long one breaks
assert.equal(formatJson('{"tags":["a","b"]}'), '{\n  "tags": ["a", "b"]\n}')
assert.ok(formatJson(`[${'"a long value", '.repeat(5)}"end"]`).includes('\n  "a long value",'))
assert.equal(formatJson('{"a":{},"b":[]}'), '{\n  "a": {},\n  "b": []\n}')
// strings with brackets, commas and escapes inside stay whole
assert.equal(formatJson('{"s":"a, [b]: {c} \\"q\\""}'), '{\n  "s": "a, [b]: {c} \\"q\\""\n}')
// formatting twice changes nothing
assert.equal(formatJson(formatJson(rows)), formatJson(rows))

// not JSON: unchanged
for (const text of [
  '%dw 2.0\noutput application/json\n---\n{ a: 1 }',
  '{ a: 1 }',
  '[1, 2,]',
  '{"a": 1} extra',
  '<root/>',
  'plain words',
  '{"a": 1, ...}',
  '',
]) {
  assert.equal(formatJson(text), text, text)
}
assert.equal(formatJson(undefined), undefined)

// every JSON input and expected output on the site still means the same after formatting
let formatted = 0
for (const file of readdirSync('src/content/dataweave')) {
  const p = (await import(pathToFileURL(resolve('src/content/dataweave', file)).href)).default
  const samples = [...(p.inputs ?? []), p.expected, ...(p.tests ?? []).flatMap((t) => t.inputs ?? [])].filter((s) => s?.mime?.includes('json'))
  for (const s of samples) {
    const out = formatJson(s.content)
    assert.deepEqual(JSON.parse(out), JSON.parse(s.content), `${p.id}: meaning changed`)
    if (out !== s.content) formatted++
  }
}
console.log(`All JSON format checks pass (${formatted} samples laid out again).`)
