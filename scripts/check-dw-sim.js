// Checks the in-browser DataWeave evaluator (src/sim/dw):
//   1. unit cases for the core semantics,
//   2. every script and expression of the reference flows (the corpus) runs without SimUnsupported,
//   3. the solutions of the DataWeave practice problems give the expected outputs.
// Run: node scripts/check-dw-sim.js [--verbose] [--corpus corpus.json]  (by default the corpus is read from src/content/flows)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evalScript, evalValue, render, read } from '../src/sim/dw/index.js'
import { entriesOf, isPlainObject } from '../src/sim/dw/values.js'
import { DwError, SimUnsupported } from '../src/sim/errors.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
let failed = false

// ---------- 1. unit cases ----------

const NOW = new Date('2026-11-13T10:00:00Z')
const unitCtx = () => ({
  payload: [
    { id: 'A', price: 2, qty: 3 },
    { id: 'B', price: 5, qty: 1 },
  ],
  vars: { name: 'Ada', n: 3 },
  attributes: { headers: { 'x-id': 'h1' } },
  error: {
    errorType: { namespace: 'HTTP', identifier: 'NOT_FOUND', toString: () => 'HTTP:NOT_FOUND' },
    description: 'Not found',
    detailedDescription: 'Not found (404)',
    errorMessage: { payload: null },
    childErrors: [],
  },
  correlationId: 'c-1',
  properties: { 'api.host': 'example.com' },
  now: NOW,
  flowName: 'main-flow',
})

const units = [
  ['1 + 2 * 3', 7],
  ['(1 + 2) * 3', 9],
  ['10 - 4 - 3', 3],
  ['0.1 + 0.2', 0.3],
  ['2 > 1 and 1 > 2 or true', true],
  ['not true or true', false],
  ['!true or true', true],
  ['not 1 == 2', true],
  ['do { var x = 2 --- -x + 3 }', -5],
  ['-1 + 3', 2],
  ['payload.missing default "x"', 'x'],
  ['vars.missing default "x"', 'x'],
  ['vars.missing.deeper default 0', 0],
  ['{ a: 1 } ++ { b: 2 }', { a: 1, b: 2 }],
  ['[1, 2] ++ [3]', [1, 2, 3]],
  ['"a" ++ 1', 'a1'],
  ['"Hello $(vars.name)! n=$(vars.n + 1)"', 'Hello Ada! n=4'],
  ['"Hi $vars"', null, 'object-in-string'],
  ['payload map { id: $.id, i: $$ }', [{ id: 'A', i: 0 }, { id: 'B', i: 1 }]],
  ['payload map (p, i) -> p.price * p.qty + i', [6, 6]],
  ['sum(payload map ($.price * $.qty))', 11],
  ['payload filter ($.price > 2) map $.id', ['B']],
  ['[1, 2, 3] filter $ > 1', [2, 3]],
  ['[{ price: 100, ok: true }, { price: 900, ok: true }, { price: 50, ok: false }] filter $.price < 500 and $.ok', [{ price: 100, ok: true }]],
  ['do { var x = null --- x map $ default [] }', []],
  ['payload map $.missing default 0', [null, null]],
  ['[1] ++ [2] map $ * 10', [10, 20]],
  ['"a,b" splitBy "," joinBy "+" ++ "!"', 'a+b!'],
  ['payload orderBy -$.price map $.id', ['B', 'A']],
  ['payload groupBy $.id mapObject (v, k) -> { (k): sizeOf(v) }', { A: 1, B: 1 }],
  ['payload reduce (p, acc = 0) -> acc + p.qty', 4],
  ['[1, 2, 3] reduce ($$ + $)', 6],
  ['error.errorType ++ ""', 'HTTP:NOT_FOUND'],
  ['"Type: $(error.errorType)"', 'Type: HTTP:NOT_FOUND'],
  ['error.errorType.identifier', 'NOT_FOUND'],
  ['error.errorType.namespace ++ ":" ++ error.errorType.identifier', 'HTTP:NOT_FOUND'],
  ['now() as Number {unit: "milliseconds"}', NOW.getTime()],
  ['now() as Number', NOW.getTime() / 1000],
  ['now() as String {format: "yyyy-MM-dd"}', '2026-11-13'],
  ['(now() + |P1D|) as Date as String', '2026-11-14'],
  ['|2026-11-13T10:00:00Z| + |PT5M|', '2026-11-13T10:05:00Z', 'string'],
  ['"13/11/2026" as Date {format: "dd/MM/yyyy"} as String', '2026-11-13'],
  ['vars.n match { case 1 -> "one" case n if n > 2 -> "big" else -> "other" }', 'big'],
  ['"abc" match { case is Number -> "n" case is String -> "s" else -> "?" }', 's'],
  ['"x-42" match { case matches /x-(\\d+)/ -> "num" else -> "no" }', 'num'],
  ['{ (a: 1) if true, (b: 2) if false, ("c" ++ "d"): 3 }', { a: 1, cd: 3 }],
  ['{ (payload map { ($.id): $.qty }) }', { A: 3, B: 1 }],
  ['[1, 2, 3, 4][-1]', 4],
  ['[1, 2, 3, 4][1 to 2]', [2, 3]],
  ['"hello"[0 to 1]', 'he'],
  ['do { var x = 2 --- x * vars.n }', 6],
  ['if (vars.n > 2) "big" else "small"', 'big'],
  ['upper(trim("  a ")) ++ lower("B")', 'Ab'],
  ['"a,b,c" splitBy "," joinBy "-"', 'a-b-c'],
  ['"2026-11" replace "-" with "/"', '2026/11'],
  ['p("api.host")', 'example.com'],
  ['p("missing")', null],
  ['typeOf(payload)', 'Array'],
  ['sizeOf(payload) + sizeOf("abc") + sizeOf({ a: 1 })', 6],
  ['isEmpty([]) and isEmpty(null) and not isEmpty("x")', true],
  ['{ a: 1, b: 2 } - "a"', { b: 2 }],
  ['attributes.headers."x-id"', 'h1'],
  ['flow.name', 'main-flow'],
  ['(1 to 3) map $ * 2', [2, 4, 6]],
  ['[3, 1, 2] orderBy $', [1, 2, 3]],
  ['payload maxBy $.price', { id: 'B', price: 5, qty: 1 }],
  ['12.5 as String {format: "0.00"}', '12.50'],
  ['1234.5 as String {format: "#,##0.00"}', '1,234.50'],
  ['"42" as Number + 1', 43],
  ['{ a: { b: [1, 2] } } update { case x at .a.b -> x ++ [3] }', { a: { b: [1, 2, 3] } }],
  ['payload.*id', ['A', 'B']],
  ['read("{\\"k\\": [1]}", "application/json").k[0]', 1],
  ['write({ a: 1 }, "application/json", { indent: false })', '{"a": 1}'],
  ['%dw 2.0\nimport capitalize from dw::core::Strings\noutput text/plain\n---\ncapitalize("hello world")', 'Hello World'],
  ['%dw 2.0\nimport * from dw::core::Arrays\n---\n[1, 2, 3] some ($ > 2)', true],
  ['dw::core::Binaries::toBase64("hi" as Binary)', 'aGk='],
  ['dw::Crypto::SHA1("abc" as Binary)', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
  ['dw::Crypto::MD5("abc" as Binary)', '900150983cd24fb0d6963f7d28e17f72'],
  ['dw::core::Binaries::toHex(dw::Crypto::hashWith("abc" as Binary, "SHA-256"))', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['dw::Crypto::HMACWith("key" as Binary, "The quick brown fox jumps over the lazy dog" as Binary, "HmacSHA256")', 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'],
  ['%dw 2.0\nfun twice(x, f = (y) -> y * 2) = f(x)\n---\ntwice(4)', 8],
  ['%dw 2.0\nvar total = (items) -> sum(items)\n---\ntotal([1, 2])', 3],
  // Behaviour checked on the real engine (DataWeave 2.12.2).
  ['[].x', null],
  ['([{ sku: 1 }] filter $.sku > 5).sku', null],
  ['[{ b: 2 }].a', null],
  ['[{ a: 1 }, { a: null }].a', [1, null]],
  ['[1, 2, 3][0 to 10]', null],
  ['"abc"[0 to 34]', null],
  ['"abc"[1 to 2]', 'bc'],
  ['"31/02/2026" as Date {format: "dd/MM/yyyy"}', '28/02/2026'],
  ['"32/01/2026" as Date {format: "dd/MM/yyyy"}', null, 'object-in-string'],
  ['("01/11/2026" as Date {format: "dd/MM/yyyy"}) as String', '2026-11-01'],
  ['|2026-01-15| - |2026-01-01|', 'PT336H'],
  ['(|2026-01-15| - |2026-01-01|).days', 14],
  ['|2026-01-01T10:00:00Z| >> "America/Chicago"', '2026-01-01T04:00:00-06:00'],
  ['|2026-01-01T10:00:00Z| >> |America/Chicago|', null, 'object-in-string'],
  ['{ a @(type: "x"): 1 }.a.@type', null, 'object-in-string'],
  ['do { var input = 1 --- input }', null, 'object-in-string'],
  ['do { var x = fail("boom") --- 1 }', null, 'object-in-string'],
  ['"" splitBy ";"', ['']],
  ['"abc" as Number default 1', 1],
  ['null as Number default -1', -1],
  ['(1 / 0) default 0', null, 'object-in-string'],
  ['[{ k: null }] groupBy $.k', null, 'object-in-string'],
  ['"x $(null)"', null, 'object-in-string'],
  ['[].a ++ [1]', null, 'object-in-string'],
]

const SAME_UUID = ['uuid() == uuid()', false]

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

function toPlain(v) {
  return JSON.parse(render(v, 'application/json'))
}

let unitFails = 0
for (const [src, expected, mode] of [...units, SAME_UUID]) {
  try {
    const { value } = evalScript(src, unitCtx())
    if (mode === 'object-in-string') {
      console.log(`  unit FAIL ${JSON.stringify(src)}: expected an error, got ${JSON.stringify(toPlain(value))}`)
      unitFails++
      continue
    }
    const actual = mode === 'string' ? String(value) : toPlain(value)
    if (!deepEqual(actual, expected)) {
      unitFails++
      console.log(`  unit FAIL ${JSON.stringify(src)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
  } catch (e) {
    if (mode === 'object-in-string' && e instanceof DwError) continue
    unitFails++
    console.log(`  unit FAIL ${JSON.stringify(src)}: ${e.name}: ${e.message}`)
  }
}

// evalValue: literal text, placeholders, embedded and full expressions; uuid repeatable across runs.
{
  const ctx = unitCtx()
  const checks = [
    [evalValue('https://${api.host}/v1', ctx), 'https://example.com/v1'],
    [evalValue('#[vars.name]', ctx), 'Ada'],
    [evalValue('Hello #[vars.name], #[vars.n]', ctx), 'Hello Ada, 3'],
    [toPlain(evalValue('#[output application/json --- { a: vars.n }]', ctx)), { a: 3 }],
    [evalValue('#[uuid()]', { uuidSeed: 0 }), evalValue('#[uuid()]', { uuidSeed: 0 })],
    [render(evalScript('%dw 2.0\noutput application/csv\n---\n[{a: 1, b: "x,y"}]', ctx).value, 'application/csv'), 'a,b\n1,x\\,y'],
    [render(evalScript('%dw 2.0\noutput application/csv quoteValues=true\n---\n[{a: "x,y"}]', ctx).value, 'application/csv', { quoteValues: true }), 'a\n"x,y"'],
    [evalScript('%dw 2.0\noutput text/plain\n---\n"x"', ctx).mime, 'text/plain'],
  ]
  checks.forEach(([a, b], i) => {
    if (!deepEqual(a, b)) {
      unitFails++
      console.log(`  evalValue check ${i + 1} FAIL: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
    }
  })
}
console.log(`Unit cases: ${units.length + 8 - unitFails}/${units.length + 8} pass`)
if (unitFails) failed = true

// ---------- 2. corpus ----------

const corpusArg = args.indexOf('--corpus')
const corpusPath = corpusArg >= 0 ? args[corpusArg + 1] : process.env.DW_CORPUS

// Every Transform script and every #[...] setting in the reference flows of src/content/flows.
async function collectCorpus() {
  const dir = path.join(root, 'src', 'content', 'flows')
  const scripts = []
  const exprs = []
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (key === 'script') scripts.push(v)
      else if (v.includes('#[') && !/sql|query/i.test(key || '')) exprs.push(v)
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  for (const f of fs.readdirSync(dir).filter((x) => /^fl-.*\.js$/.test(x)).sort()) {
    const mod = (await import(pathToFileURL(path.join(dir, f)))).default
    walk(mod.referenceFlow)
  }
  return { scripts, exprs }
}

// A plausible ctx for one corpus item, built from the item's own selectors: every vars./payload./attributes. path
// and every .field gets a value whose type fits how the script uses it (a number before arithmetic, a list before map).
const SAMPLE_DATE = { yyyy: '2026', yy: '26', MM: '11', dd: '13', HH: '10', mm: '00', ss: '00' }

function guessValue(src, at, end, record) {
  const after = src.slice(end, end + 60).trimStart()
  const before = src.slice(Math.max(0, at - 16), at).replace(/---\s*$/, '')
  if (/now\(\)\s*[<>]=?\s*\(?\s*$/.test(before)) return '2026-11-13T10:00:00Z'
  if (/([*/+-]|[<>]=?)\s*\(?\s*$|\bto\s*$/.test(before) || /^to\b/.test(after)) return 1
  const literal = /^default\s+["']([^"']*)["']/.exec(after)
  if (literal) return literal[1]
  if (/^\+\+\s*\{/.test(after)) return { id: 'x' }
  if (/^(\+\+\s*\[|<<)/.test(after) || /\]\s*\+\+\s*$/.test(before)) return ['x']
  if (/\bnot\s*\(?\s*$|!\s*$/.test(before) || /^(==|!=)\s*(true|false)\b|^(and|or)\b|^\)\s*(and|or)\b/.test(after)) return true
  if (/(sizeOf|flatten|isEmpty|keysOf)\(\s*$/.test(before) && !/^\./.test(after)) return [record(), record()]
  if (/(sum|max|min|avg)\(\s*$/.test(before)) return [1, 2]
  if (/^(map|filter|groupBy|orderBy|reduce|flatMap|distinctBy|joinBy|some|every|maxBy|minBy|divideBy|then)\b/.test(after)) return [record(), record()]
  if (/^\[\s*-?\d+\s*\]/.test(after)) return [record(), record()]
  const fmt = /^as\s+(Date|DateTime|LocalDateTime)\s*\{\s*format:\s*["']([^"']+)["']/.exec(after)
  if (fmt) return fmt[2].replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => SAMPLE_DATE[t])
  if (/^as\s+(DateTime|LocalDateTime)\b|^(<|>|<=|>=)\s*now\(\)|^[<>]=?\s*\(?\s*\w+\s+as\s+DateTime|^\)\s*as\s+DateTime/.test(after)) return '2026-11-13T10:00:00Z'
  if (/^as\s+Date\b|^\)\s*as\s+Date\b/.test(after)) return '2026-11-13'
  if (/^as\s+Boolean/.test(after)) return 'true'
  if (/^(as\s+Number|[*/+-]\s*[\w(]|(==|!=|>=|<=|>|<)\s*-?\d|default\s+-?\d|\)\s*(as\s+Number|[*/+-]|[<>]))/.test(after)) return 1
  if (/^(>=|<=|>|<)/.test(after) || /([*/+-]|[<>]=?|==)\s*\(?\s*$/.test(before)) return 1
  return 'sample'
}

function setPath(rootObj, segs, leaf) {
  let cur = rootObj
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1
    if (typeof seg === 'number') return
    const nextIsIndex = typeof segs[i + 1] === 'number'
    if (last) {
      if (!(seg in cur)) cur[seg] = leaf
      return
    }
    if (nextIsIndex) {
      if (!Array.isArray(cur[seg])) cur[seg] = [{}, {}]
      cur = cur[seg][0]
    } else {
      if (cur[seg] === null || typeof cur[seg] !== 'object' || Array.isArray(cur[seg])) cur[seg] = {}
      cur = cur[seg]
    }
  })
}

function derivedContexts(src) {
  const fields = {}
  for (const m of src.matchAll(/\.(?:\*|@)?([A-Za-z_]\w*|"[^"]+")/g)) {
    const name = m[1].replace(/"/g, '')
    if (!(name in fields)) fields[name] = { at: m.index, end: m.index + m[0].length }
  }
  const record = () => {
    const r = {}
    for (const [k, pos] of Object.entries(fields)) r[k] = guessValue(src, pos.at, pos.end, () => ({ id: 'x' }))
    return r
  }
  const roots = { vars: {}, payload: {}, attributes: {} }
  for (const m of src.matchAll(/\b(vars|payload|attributes)((?:\.(?:[A-Za-z_]\w*|"[^"]*")|\[\d+\]|\["[^"]*"\])+)/g)) {
    const segs = [...m[2].matchAll(/\.([A-Za-z_]\w*|"[^"]*")|\[(\d+)\]|\[("[^"]*")\]/g)].map((s) =>
      s[2] !== undefined ? Number(s[2]) : (s[1] ?? s[3]).replace(/"/g, ''),
    )
    setPath(roots[m[1]], segs, guessValue(src, m.index, m.index + m[0].length, record))
  }
  const payloadIsList = /\bpayload\s*(map|filter|groupBy|orderBy|reduce|flatMap|distinctBy|\[|maxBy|minBy|then)\b|\bpayload\[|(sizeOf|isEmpty|flatten)\(payload\)/.test(src)
  const base = {
    attributes: { headers: { 'content-type': 'application/json' }, queryParams: {}, uriParams: {}, method: 'GET', requestPath: '/api/v1/orders/O-1/x', fileName: 'sales_20261113.csv', statusCode: 200, ...roots.attributes },
    vars: roots.vars,
    error: {
      errorType: { namespace: 'HTTP', identifier: 'NOT_FOUND', toString: () => 'HTTP:NOT_FOUND' },
      description: 'Not found', detailedDescription: 'Not found (404)', errorMessage: { payload: null, attributes: { statusCode: 404, headers: {} } }, childErrors: [],
    },
    correlationId: 'corr-1',
    properties: new Proxy({}, { get: () => 'prop-value', has: () => true, getOwnPropertyDescriptor: () => ({ value: 'prop-value', enumerable: true, configurable: true }) }),
    now: NOW,
    flowName: 'main-flow',
  }
  const objectPayload = { ...record(), ...roots.payload }
  const variants = [{ ...base, payload: payloadIsList ? [record(), record()] : objectPayload }]
  variants.push({ ...base, payload: payloadIsList ? objectPayload : [record(), record()] })
  variants.push({ ...base, payload: JSON.stringify(objectPayload) })
  return variants
}

function runCorpusItem(kind, src) {
  let lastError = null
  for (const ctx of derivedContexts(src)) {
    try {
      if (kind === 'script') evalScript(src, ctx)
      else evalValue(src, ctx)
      return { ok: true }
    } catch (e) {
      if (!lastError || e instanceof SimUnsupported) lastError = e
    }
  }
  return { ok: false, error: lastError }
}

{
  const corpus = corpusPath ? JSON.parse(fs.readFileSync(corpusPath, 'utf8')) : await collectCorpus()
  const items = [...corpus.scripts.map((s) => ['script', s]), ...corpus.exprs.map((s) => ['expr', s])]
  let ok = 0
  const unsupported = new Map()
  const dwErrors = []
  const other = []
  for (const [kind, src] of items) {
    const r = runCorpusItem(kind, src)
    if (r.ok) ok++
    else if (r.error instanceof SimUnsupported) unsupported.set(r.error.feature, [...(unsupported.get(r.error.feature) || []), src])
    else if (r.error instanceof DwError) dwErrors.push([src, r.error.message])
    else other.push([src, r.error])
  }
  const nUnsupported = [...unsupported.values()].reduce((s, l) => s + l.length, 0)
  const pct = (n) => ((100 * n) / items.length).toFixed(1) + '%'
  console.log(`\nCorpus: ${items.length} items (${corpus.scripts.length} scripts, ${corpus.exprs.length} expressions)`)
  console.log(`  ran: ${ok} (${pct(ok)})   DwError with the generic ctx: ${dwErrors.length} (${pct(dwErrors.length)})   SimUnsupported: ${nUnsupported} (${pct(nUnsupported)})   other: ${other.length}`)
  for (const [feature, list] of [...unsupported].sort((a, b) => b[1].length - a[1].length)) console.log(`  unsupported ${list.length} x ${feature}`)
  for (const [src, msg] of dwErrors.slice(0, verbose ? dwErrors.length : 8)) console.log(`  DwError sample: ${JSON.stringify(src).slice(0, 110)} -> ${msg.slice(0, 120)}`)
  for (const [src, e] of other) console.log(`  BUG (${e.name}): ${JSON.stringify(src).slice(0, 110)} -> ${e.stack.split('\n').slice(0, 2).join(' | ')}`)
  const runnable = items.length - nUnsupported
  if (runnable / items.length < 0.9) {
    console.log('  FAIL: fewer than 90% of corpus items run without SimUnsupported')
    failed = true
  }
  if (other.length) failed = true
}

// ---------- 3. DataWeave practice problems ----------

function canonicalXml(text) {
  const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon)
    if (isPlainObject(v)) {
      return entriesOf(v).map((e) => [e.key, e.attrs ? canon(e.attrs) : null, canon(typeof e.value === 'string' ? e.value.trim() : e.value)])
    }
    return v
  }
  return JSON.stringify(canon(read(text.trim(), 'application/xml')))
}

function compareOutput(value, scriptMime, options, expected, expectedMime) {
  const em = (expectedMime || 'application/json').split(';')[0]
  if (em === 'application/json') {
    const actual = JSON.parse(render(value, 'application/json', scriptMime === 'application/json' ? options : {}))
    const want = JSON.parse(expected)
    return deepEqual(actual, want) ? null : `expected ${JSON.stringify(want).slice(0, 160)}\n        got      ${JSON.stringify(actual).slice(0, 160)}`
  }
  const text = render(value, scriptMime, options)
  if (em === 'application/xml') {
    const a = canonicalXml(text)
    const b = canonicalXml(expected)
    return a === b ? null : `expected ${b.slice(0, 160)}\n        got      ${a.slice(0, 160)}`
  }
  const norm = (s) => s.replace(/\r\n/g, '\n').trim()
  return norm(text) === norm(expected) ? null : `expected ${JSON.stringify(norm(expected)).slice(0, 160)}\n        got      ${JSON.stringify(norm(text)).slice(0, 160)}`
}

// An input the script reads itself (an `input` directive) is passed as raw text, as a connector would deliver it.
function buildCtx(inputs, script) {
  const ctx = { vars: {}, inputs: {}, now: NOW, properties: {}, correlationId: 'corr-1' }
  for (const inp of inputs) {
    const declared = new RegExp(`^\\s*input\\s+${inp.name}\\s`, 'm').test(script.split(/^---/m)[0])
    const value = declared ? inp.content : read(inp.content, inp.mime)
    if (inp.name === 'payload') ctx.payload = value
    else if (inp.name === 'vars') ctx.vars = value
    else if (inp.name === 'attributes') ctx.attributes = value
    else ctx.inputs[inp.name] = value
  }
  return ctx
}

const dwDir = path.join(root, 'src', 'content', 'dataweave')
const problemFiles = fs.readdirSync(dwDir).filter((f) => /^dw-.*\.js$/.test(f)).sort()
const tally = { pass: 0, fail: 0, unsupported: 0, error: 0 }
const unsupportedProblems = new Map()
for (const file of problemFiles) {
  const p = (await import(pathToFileURL(path.join(dwDir, file)))).default
  if (!p.inputs || !p.solution) continue
  const cases = [{ name: 'sample', inputs: p.inputs, expected: p.expected.content }, ...(p.tests || []).map((t) => ({ ...t }))]
  for (const c of cases) {
    const label = `${p.id} / ${c.name}`
    try {
      const ctx = buildCtx(c.inputs, p.solution)
      const { value, mime, options } = evalScript(p.solution, ctx)
      const diff = compareOutput(value, mime, options, c.expected, p.expected.mime)
      if (diff) {
        tally.fail++
        failed = true
        console.log(`  WRONG ${label}\n        ${diff}`)
      } else tally.pass++
    } catch (e) {
      if (e instanceof SimUnsupported) {
        tally.unsupported++
        unsupportedProblems.set(e.feature, [...(unsupportedProblems.get(e.feature) || []), label])
      } else {
        tally.error++
        console.log(`  ERROR ${label}: ${e.name}: ${e.message}${e instanceof DwError ? '' : ' | ' + e.stack.split('\n')[1]}`)
      }
    }
  }
}
const total = tally.pass + tally.fail + tally.unsupported + tally.error
console.log(`\nDataWeave problems: ${total} cases: ${tally.pass} pass (${((100 * tally.pass) / total).toFixed(1)}%), ${tally.fail} wrong, ${tally.error} errors, ${tally.unsupported} unsupported`)
for (const [feature, list] of unsupportedProblems) console.log(`  unsupported ${list.length} x ${feature} (${[...new Set(list.map((l) => l.split(' / ')[0]))].join(', ')})`)

console.log(failed ? '\nFAIL' : '\nOK')
process.exit(failed ? 1 : 0)
