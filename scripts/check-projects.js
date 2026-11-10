// My Projects helpers: sections, practice questions, and the sandboxed architecture page.
import assert from 'node:assert/strict'
import { architectureDoc, ARCH_POLICY, questionsIn, splitSections } from '../src/study/project-notes.js'

const body = `Intro line.

## 1. Overview

Text one.

\`\`\`md
## not a heading inside code
\`\`\`

## 2. **Questions**

**Why not split it?** One source and one target.

More of that answer.

**How do you restart?**

From the run log.

## 3. After

**Not a question** because no question mark.
`

const { intro, sections } = splitSections(body)
assert.equal(intro, 'Intro line.')
assert.deepEqual(sections.map((s) => s.title), ['1. Overview', '2. Questions', '3. After'])
assert.match(sections[0].text, /not a heading inside code/)
assert.deepEqual(sections.map((s) => s.id), ['section-1', 'section-2', 'section-3'])
assert.deepEqual(splitSections(''), { intro: '', sections: [] })

const qs = questionsIn(body)
assert.deepEqual(qs, [
  { q: 'Why not split it?', a: 'One source and one target.\n\nMore of that answer.' },
  { q: 'How do you restart?', a: 'From the run log.' },
])
assert.deepEqual(questionsIn('**Lonely?**\n\n## Next'), [], 'a question with no answer is skipped')
assert.equal(questionsIn('**A?** yes\r\n\r\nand more').length, 1, 'Windows line endings')

// the policy goes first inside <head>, and <header> is not mistaken for it
const withHead = architectureDoc('<!doctype html><html><head><title>x</title></head><body><header>h</header></body></html>')
assert.ok(withHead.indexOf('Content-Security-Policy') < withHead.indexOf('<title>'))
assert.ok(withHead.startsWith('<!doctype html><html><head><meta http-equiv="Content-Security-Policy"'))
const headerOnly = architectureDoc('<html><body><header>h</header></body></html>')
assert.ok(headerOnly.startsWith('<html><head><meta http-equiv="Content-Security-Policy"'), headerOnly.slice(0, 80))
const fragment = architectureDoc('<header>h</header><svg></svg>')
assert.ok(fragment.startsWith('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv'))
assert.ok(fragment.includes('<body><header>h</header><svg></svg></body>'))
assert.ok(!architectureDoc('<p>x</p>', { fitHeight: false }).includes('plArchHeight'))
assert.ok(architectureDoc('<p>x</p>').includes('plArchHeight'))
for (const rule of ['connect-src blob: data:', "form-action 'none'", "frame-src 'none'", "default-src 'none'"]) assert.ok(ARCH_POLICY.includes(rule), rule)
// the page may never call out over the network
const connect = ARCH_POLICY.split('; ').find((r) => r.startsWith('connect-src'))
assert.ok(!/https?:|\*/.test(connect), connect)

console.log('check-projects: all passed')
