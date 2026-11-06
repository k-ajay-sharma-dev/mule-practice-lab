// RAML problems: every model answer is valid and passes, every starter is unfinished, each check really tests something,
// and the parser reports the mistakes people make. Usage: node scripts/check-raml.js [rm-001 rm-002 ...]
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseRaml, ramlChecks, ramlHint, runRamlChecks } from '../src/raml/checks.js'

const head = '#%RAML 1.0\ntitle: T\nmediaType: application/json\n'
const errorsOf = (text) => parseRaml(text).errors
const says = (text, pattern, line) => {
  const found = errorsOf(text).find((e) => pattern.test(e.message))
  assert.ok(found, `expected ${pattern}, got: ${errorsOf(text).map((e) => e.message).join(' | ') || 'no errors'}`)
  if (line) assert.equal(found.line, line)
}
const clean = (text) => assert.deepEqual(errorsOf(text), [], text)

// The mistakes
says('title: T\n', /first line/)
says('#%RAML 1.0 Library\ntitle: T\n', /full API/)
says('#%RAML 1.0\ntitle:\n', /needs a title/)
says('#%RAML 1.0\ntitle: T\nbaseUri: https://x/{version}\n', /version key/)
says(`${head}titel: x\n`, /Unknown key “titel”/, 4)
says(`${head}/a:\n  GET:\n    description: x\n`, /lower case/, 5)
says(`${head}/a:\n  get:\n    query:\n      x: string\n`, /Unknown key “query”/, 6)
says(`${head}/a:\n  get:\n    responses:\n      abc:\n        description: x\n`, /not an HTTP status/, 7)
says(`${head}/a:\n  get:\n    responses:\n      200:\n        descripton: x\n`, /Unknown key “descripton”/, 8)
says(`${head}/a:\n  post:\n    body:\n      type: Missing\n`, /“Missing” is not declared/)
says(`${head}types:\n  A:\n    properties:\n      d: date\n`, /no type “date”/)
says(`${head}types:\n  A:\n    properties:\n      d: int\n`, /no type “int”/)
says(`${head}/a:\n  get:\n    is: [ nope ]\n`, /Trait “nope”/)
says(`${head}/a:\n  type: nope\n`, /Resource type “nope”/)
says(`${head}/a:\n  get:\n    securedBy: [ nope ]\n`, /Security scheme “nope”/)
says('#%RAML 1.0\ntitle: T\n/a:\n  post:\n    body:\n      type: string\n', /no media type/)
says(`${head}a: [\n`, /./)
says(`${head}types:
  A:
    pattern: '[a'
    type: string
    example: x
`, /not a valid regular expression/, 6)
says(`${head}/a:\n  (nope): x\n  get:\n`, /Annotation \(nope\)/)
says(`${head}/a:\n  get:\n  get:\n`, /unique/i)
says(`${head}types:\n  A:\n    properties:\n      n: number\n    example:\n      n: abc\n`, /must be a number/)
says(`${head}types:\n  A:\n    properties:\n      n: number\n    example:\n      m: 1\n`, /missing “n”/)
says(`${head}types:\n  S:\n    enum: [ A, B ]\n    type: string\n    example: C\n`, /must be one of/)
says(`${head}types:\n  A:\n    additionalProperties: false\n    properties:\n      n: number\n    example:\n      n: 1\n      z: 2\n`, /“z”/)
says(`${head}types:\n  A:\n    properties:\n      d: date-only\n    example:\n      d: 12/01/2026\n`, /not a valid date-only/)
says(`${head}types:\n  A:\n    properties:\n      n: number\n    example: '{ "n": '\n`, /not valid JSON/)

// Valid files the parser must not reject
clean(`${head}/a:
  get:
    responses:
      200:
        body:
          example: { a: 1 }
`)
clean(`${head}types:\n  A:\n    properties:\n      n?: number\n      tags: string[]\n      s: string | nil\n    example:\n      tags: [ a ]\n      s: null\n`)
clean(`${head}types:\n  Base:\n    properties:\n      id: string\n  Kid:\n    type: Base\n    properties:\n      n: integer\n    example:\n      id: x\n      n: 1\n`)
clean(`${head}types:\n  A:\n    properties:\n      n: number\n    examples:\n      one:\n        value:\n          n: 1\n      two:\n        n: 2\n`)
clean(`${head}types:\n  A:\n    properties:\n      n: number\n    example: '{ "n": 1 }'\n`)
clean(`${head}traits:\n  t:\n    usage: Use on lists\n    queryParameters:\n      <<name>>: string\nresourceTypes:\n  c:\n    usage: Collections\n    get?:\n      is: [ t: { name: x } ]\n/a:\n  type: c\n  get:\n`)
clean(`${head}uses:\n  lib: !include libs/common.raml\n/a:\n  get:\n    is: [ lib.paged ]\n    responses:\n      200:\n        body:\n          type: lib.Order\n`)
clean(`${head}securitySchemes:\n  oauth:\n    type: OAuth 2.0\n    settings:\n      accessTokenUri: https://x/token\n      authorizationGrants: [ client_credentials ]\nsecuredBy: [ oauth, null ]\n/a:\n  get:\n    securedBy: [ oauth: { scopes: [ read ] } ]\n`)
clean(`${head}annotationTypes:\n  owner: string\n(owner): team-a\n/a:\n  (owner): team-b\n  get:\n    (owner): team-c\n`)
clean(`${head}/a:\n  post:\n    body:\n      application/json:\n        type: object\n      application/xml:\n        type: object\n`)
clean(`${head}/a:\n  uriParameters:\n    x: integer\n  /{id}:\n    get:\n`)

// Traits, resource types and optional methods are applied before checks run
const applied = parseRaml(`${head}traits:\n  paged:\n    queryParameters:\n      page?: integer\nresourceTypes:\n  c:\n    get:\n      is: [ paged ]\n      responses:\n        200:\n          description: <<resourcePathName | !singularize>>\n    delete?:\n      description: x\n/orders:\n  type: c\n`)
const rule = (r) => runRamlChecks(applied, [{ label: 'x', rule: r }])[0].pass
assert.ok(rule({ type: 'param', path: '/orders', method: 'get', in: 'query', name: 'page', want: { required: false } }))
assert.ok(rule({ type: 'response', path: '/orders', method: 'get', status: '200' }))
assert.ok(rule({ type: 'noMethod', path: '/orders', method: 'delete' }), 'delete? stays out unless the resource has it')
assert.equal(applied.model.resources[0].methods.get.responses[200].description, 'order')
// Shorthand and long forms read the same
const forms = parseRaml(`${head}types:\n  O:\n    properties:\n      a: string\n/x:\n  get:\n    responses:\n      200:\n        body:\n          application/json:\n            type: array\n            items: O\n  /{id}:\n    get:\n      responses:\n        200:\n          body: O\n`)
const form = (r) => runRamlChecks(forms, [{ label: 'x', rule: r }])[0].pass
assert.ok(form({ type: 'response', path: '/x', method: 'get', status: '200', typeIs: 'O[]', media: 'json' }))
assert.ok(form({ type: 'response', path: '/x/{}', method: 'get', status: '200', typeIs: 'O' }))
// Stricter rule options
const strict = parseRaml(`${head}types:
  S:
    type: string
    enum: [ A, B, C ]
/x/{id}:
  uriParameters:
    other: integer
  delete:
    responses:
      204:
        body:
          type: S
`)
const sees = (r) => runRamlChecks(strict, [{ label: 'x', rule: r }])[0].pass
assert.equal(sees({ type: 'typeDecl', name: 'S', want: { enum: { exactly: ['A', 'B'] } } }), false)
assert.equal(sees({ type: 'typeDecl', name: 'S', want: { enum: { exactly: ['C', 'A', 'B'] } } }), true)
assert.equal(sees({ type: 'param', path: '/x/{}', in: 'uri', want: { type: 'integer' } }), false, 'the name must be in the path')
assert.equal(sees({ type: 'response', path: '/x/{}', method: 'delete', status: '204', noBody: true }), false)
assert.equal(sees({ type: 'response', path: '/x/{}', method: 'delete', status: '204' }), true)
// A facet on a named type counts, and scheme contents and scopes can be read
const deep = parseRaml(`${head}types:\n  St:\n    type: string\n    enum: [ A, B ]\n  O:\n    properties:\n      s: St\nsecuritySchemes:\n  k:\n    type: Pass Through\n    describedBy:\n      headers:\n        client_id: string\n  oauth:\n    type: OAuth 2.0\n    settings:\n      accessTokenUri: https://x/t\n      authorizationGrants: [ client_credentials ]\n/a:\n  get:\n    securedBy: [ oauth: { scopes: [ read ] } ]\n`)
const reads = (r) => runRamlChecks(deep, [{ label: 'x', rule: r }])[0].pass
assert.ok(reads({ type: 'prop', typeName: 'O', prop: 's', want: { enum: { exactly: ['A', 'B'] } } }))
assert.ok(reads({ type: 'scheme', name: 'k', has: 'describedBy.headers.client_id' }))
assert.equal(reads({ type: 'scheme', name: 'k', has: 'describedBy.headers.client_secret' }), false)
assert.ok(reads({ type: 'secured', path: '/a', method: 'get', scheme: 'oauth', scopes: ['read'] }))
assert.equal(reads({ type: 'secured', path: '/a', method: 'get', scheme: 'oauth', scopes: ['write'] }), false)
assert.ok(reads({ type: 'noProp', typeName: 'O', prop: 'zz' }))
assert.equal(reads({ type: 'noType', name: 'O' }), false)
// Broken input never throws
for (const junk of ['', '#%RAML 1.0', '#%RAML 1.0\n- a\n- b\n', `${head}/a: 5\n`, `${head}/a:\n  get: 5\n`, `${head}/a:\n  get:\n    responses: 5\n`, `${head}types: 5\ntraits: 5\n`, `${head}/a:\n  get:\n    responses:\n      200: x\n`, `${head}types:\n  A: A\n`, `${head}types:\n  A:\n    type: B\n  B:\n    type: A\n    example: 1\n`]) {
  const parsed = parseRaml(junk)
  runRamlChecks(parsed, [{ label: 'x', rule: { type: 'response', path: '/a', method: 'get', status: '200', typeIs: 'O' } }])
}

// Every problem
const root = resolve('src/content/api-design')
const only = process.argv.slice(2)
const files = readdirSync(root).filter((f) => f.endsWith('.js') && (!only.length || only.includes(f.replace('.js', ''))))
const empty = parseRaml('#%RAML 1.0\ntitle: Empty\n')
let count = 0
const fail = []
for (const file of files.sort()) {
  const p = (await import(pathToFileURL(join(root, file)).href)).default
  const checks = ramlChecks(p)
  count++
  const reference = parseRaml(p.referenceRaml)
  for (const e of reference.errors) fail.push(`${p.id}: reference line ${e.line}: ${e.message}`)
  for (const r of runRamlChecks(reference, checks)) if (!r.pass) fail.push(`${p.id}: reference fails: ${r.label}`)
  // The shared valid check is the only one a near-empty file may pass.
  runRamlChecks(empty, checks).slice(1).forEach((r) => r.pass && fail.push(`${p.id}: passes on an empty file: ${r.label}`))
  const starter = runRamlChecks(parseRaml(p.starter), checks)
  if (starter.every((r) => r.pass)) fail.push(`${p.id}: the starter already passes`)
  checks.forEach((c) => {
    const hint = ramlHint(empty, c.rule)
    if (hint.length < 8 || /undefined|\[object/.test(hint)) fail.push(`${p.id}: bad hint: ${hint}`)
  })
  for (const key of ['description', 'solution', 'keyPoints', 'followUps']) if (!p[key]?.length) fail.push(`${p.id}: no ${key}`)
}
assert.deepEqual(fail, [])
console.log(`All RAML checks pass (${count} problems).`)
