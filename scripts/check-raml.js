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
clean('#%RAML 1.0\ntitle: T\nbaseUri: https://x/{version}\n')
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
says(`${head}types:\n  A:\n    properties:\n      n: number\n    example: '{ "n": '\n`, /JSON in quotes/)

says(`${head}types:
  A:
    properties:
      n: number
    example: |
      { "n":
`, /not valid JSON/)
says(`${head}types:\n  A:\n    type: boolean\n    default: 'false'\n`, /The default must be true or false/)

// A list whose items are a union, written inline: the brackets make it one list, not a union with a list in it
const unionTypes = `${head}types:\n  E:\n    properties:\n      email: string\n  S:\n    properties:\n      phone: string\n  L:\n    type: (E | S)[]\n`
clean(`${unionTypes}    example:\n      - email: a@example.com\n      - phone: '+441234'\n`)
says(`${unionTypes}    example:\n      - fax: 1\n`, /does not fit/)
says(`${unionTypes}    example:\n      email: a@example.com\n`, /must be an array/)
clean(`${head}types:\n  N:\n    type: string | number[]\n    example: [ 1, 2 ]\n`)
clean(`${head}types:\n  N:\n    type: string | number[]\n    example: x\n`)

// Traits from a resource type and the method's own traits all apply
const both = parseRaml(`${head}traits:
  paged:
    queryParameters:
      page?: integer
  traced:
    headers:
      X-Trace-Id: string
resourceTypes:
  collection:
    get:
      is: [ paged ]
/orders:
  type: collection
  get:
    is: [ traced ]
`).model.resources[0].methods.get
assert.deepEqual([...both.traits].sort(), ['paged', 'traced'])
assert.ok(both.queryParameters?.['page?'] && both.headers?.['X-Trace-Id'], 'both traits add their parameters')

// protocols are case-insensitive
const https = (p) => runRamlChecks(parseRaml(`${head}protocols: [ ${p} ]\n`), [{ label: 'HTTPS only', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } }])[0].pass
assert.equal(https('https'), true)
assert.equal(https('HTTPS'), true)
assert.equal(https('HTTP, HTTPS'), false)
says(`${head}types:\n  A:\n    type: integer\n    format: int32\n    example: 3000000000\n`, /does not fit format int32/)
says(`${head}types:\n  A:\n    type: string\n    example: a\n    examples:\n      b: c\n`, /not both/)
// Valid files the parser must not reject
clean(`${head}types:\n  A:\n    type: boolean\n    default: false\n  B:\n    type: integer\n    format: int64\n    example: 3000000000\n`)
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
clean(`${head}types:\n  A:\n    properties:\n      n: number\n    example: |\n      { "n": 1 }\n`)
says(`${head}types:\n  A:\n    properties:\n      n: number\n    example: '{ "n": 1 }'\n`, /JSON in quotes/)
says(`${head}types:\n  A:\n    properties:\n      n: number\n    example: |\n      { "n": "x" }\n`, /must be a number/)
clean(`${head}traits:\n  t:\n    usage: Use on lists\n    queryParameters:\n      <<name>>: string\nresourceTypes:\n  c:\n    usage: Collections\n    get?:\n      is: [ t: { name: x } ]\n/a:\n  type: c\n  get:\n`)
clean(`${head}securitySchemes:\n  oauth:\n    type: OAuth 2.0\n    settings:\n      accessTokenUri: https://x/token\n      authorizationGrants: [ client_credentials ]\nsecuredBy: [ oauth, null ]\n/a:\n  get:\n    securedBy: [ oauth: { scopes: [ read ] } ]\n`)
clean(`${head}annotationTypes:\n  owner: string\n(owner): team-a\n/a:\n  (owner): team-b\n  get:\n    (owner): team-c\n`)
clean(`${head}/a:\n  post:\n    body:\n      application/json:\n        type: object\n      application/xml:\n        type: object\n`)
clean(`${head}/a:\n  uriParameters:\n    x: integer\n  /{id}:\n    get:\n`)

// Annotations and documentation, as AMF treats them
const notes = `${head}annotationTypes:\n  owner:\n    type: string\n    allowedTargets: [ Method ]\n  level: integer\n`
clean(`${notes}/a:\n  get:\n    (owner): x\n`)
says(`${notes}/a:\n  (owner): x\n  get:\n`, /cannot sit on a Resource/)
says(`${notes}/a:\n  (level): abc\n  get:\n`, /must be an integer/)
says(`${notes.replace('[ Method ]', '[ Nowhere ]')}/a:\n  get:\n`, /not an annotation target/)
says(`${head}documentation: hello\n`, /must be a list/)
says(`${head}documentation:\n  - title: x\n`, /needs content/)
clean(`${head}documentation:\n  - title: x\n    content: y\n`)

// Libraries and fragments, as AMF treats them
const lib = '#%RAML 1.0 Library\nusage: Shared\ntypes:\n  Money:\n    properties:\n      amount: number\n  Order:\n    properties:\n      total: Money\ntraits:\n  paged:\n    queryParameters:\n      page?: integer\n'
const inApi = `${head}uses:\n  lib: libs/common.raml\n/a:\n  get:\n    is: [ lib.paged ]\n    responses:\n      200:\n        body:\n          type: lib.Order\n`
const withLib = { 'libs/common.raml': lib }
const errs = (text, files) => parseRaml(text, files).errors
const has = (text, files, pattern) => assert.ok(errs(text, files).some((e) => pattern.test(e.message)), `${pattern}: ${errs(text, files).map((e) => e.message).join(' | ') || 'no errors'}`)
assert.deepEqual(errs(inApi, withLib), [])
has(inApi, {}, /does not exist/)
has(inApi.replace('lib.Order', 'lib.Nope'), withLib, /“lib.Nope” is not declared/)
has(inApi.replace('lib.Order', 'Order'), withLib, /“Order” is not declared/)
has(inApi, { 'libs/common.raml': '#%RAML 1.0\ntitle: X\n' }, /must start with #%RAML 1.0 Library/)
has(inApi.replace('lib: libs', 'lib: !include libs'), withLib, /plain path/)
const badLib = errs(inApi.replace('lib.Order', 'string').replace('is: [ lib.paged ]', ''), { 'libs/common.raml': lib.replace('total: Money', 'total: Missing') })
assert.equal(badLib[0].file, 'libs/common.raml')
assert.match(badLib[0].message, /“Missing” is not declared/)
has(inApi, { 'libs/common.raml': `${lib}title: x\n` }, /cannot sit in a library/)
// Nested libraries work inside, and stay private outside
const nested = { 'libs/a.raml': '#%RAML 1.0 Library\nuses:\n  b: b.raml\ntypes:\n  Order:\n    properties:\n      m: b.Money\n', 'libs/b.raml': '#%RAML 1.0 Library\ntypes:\n  Money:\n    properties:\n      amount: number\n' }
const nestedApi = `${head}uses:\n  lib: libs/a.raml\n/x:\n  get:\n    responses:\n      200:\n        body:\n          type: lib.Order\n`
assert.deepEqual(errs(nestedApi, nested), [])
has(nestedApi.replace('lib.Order', 'lib.b.Money'), nested, /not declared/)
const seen = parseRaml(nestedApi, nested)
assert.equal(runRamlChecks(seen, [{ label: 'x', rule: { type: 'prop', typeName: 'lib.Order', prop: 'm', want: { type: 'lib.b.Money' } } }])[0].pass, true)
assert.equal(runRamlChecks(seen, [{ label: 'x', rule: { type: 'library', prefix: 'lib', file: 'libs/a.raml' } }])[0].pass, true)
// A trait from a library reaches the method
const traited = parseRaml(inApi, withLib)
assert.ok(runRamlChecks(traited, [{ label: 'x', rule: { type: 'param', path: '/a', method: 'get', in: 'query', name: 'page' } }])[0].pass)
assert.ok(runRamlChecks(traited, [{ label: 'x', rule: { type: 'applied', path: '/a', method: 'get', trait: 'lib.paged' } }])[0].pass)
// !include
const inc = `${head}types:\n  Order: !include types/order.raml\n/a:\n  get:\n    responses:\n      200:\n        body:\n          type: Order\n`
assert.deepEqual(errs(inc, { 'types/order.raml': '#%RAML 1.0 DataType\nproperties:\n  id: string\n' }), [])
has(inc, {}, /does not exist/)
has(inc, { 'types/order.raml': '#%RAML 1.0 Trait\ndescription: x\n' }, /needs DataType/)
const exampled = (json) => errs(`${head}types:\n  A:\n    properties:\n      n: number\n    example: !include examples/a.json\n`, { 'examples/a.json': json })
assert.deepEqual(exampled('{ "n": 1 }'), [])
assert.match(exampled('{ "n": "x" }')[0].message, /must be a number/)
assert.match(exampled('{ "n": ')[0].message, /not valid JSON/)
assert.deepEqual(errs(`${head}traits:\n  paged: !include traits/p.raml\n/a:\n  get:\n    is: [ paged ]\n`, { 'traits/p.raml': '#%RAML 1.0 Trait\nqueryParameters:\n  page?: integer\n' }), [])
assert.ok(runRamlChecks(parseRaml(inc, { 'types/order.raml': '#%RAML 1.0 DataType\nproperties:\n  id: string\n' }), [{ label: 'x', rule: { type: 'included', file: 'types/order.raml' } }])[0].pass)

// A fragment may bring in its own library
const fragUses = { 'types/order.raml': '#%RAML 1.0 DataType\nuses:\n  lib: ../libs/l.raml\nproperties:\n  total: lib.Money\n', 'libs/l.raml': '#%RAML 1.0 Library\ntypes:\n  Money:\n    properties:\n      amount: number\n' }
assert.deepEqual(errs(inc, fragUses), [])
has(inc, { ...fragUses, 'types/order.raml': fragUses['types/order.raml'].replace('lib.Money', 'lib.Nope') }, /“lib.Nope” is not declared/)
// A fragment can name a type from the file that includes it, as in AMF
assert.deepEqual(errs(`${head}types:\n  Money:\n    properties:\n      a: number\n  Order: !include o.raml\n`, { 'o.raml': '#%RAML 1.0 DataType\nproperties:\n  t: Money\n' }), [])

// Public methods, exact scopes and scheme values
const sec = parseRaml(`${head}securitySchemes:\n  o:\n    type: OAuth 2.0\n    settings:\n      accessTokenUri: https://a/token\n      authorizationGrants: [ client_credentials ]\nsecuredBy: [ null, o ]\n/open:\n  get:\n/closed:\n  get:\n    securedBy: [ o: { scopes: [ r, w ] } ]\n`)
const guard = (r) => runRamlChecks(sec, [{ label: 'x', rule: r }])[0].pass
assert.ok(guard({ type: 'public', path: '/open', method: 'get' }))
assert.equal(guard({ type: 'public', path: '/closed', method: 'get' }), false)
assert.equal(guard({ type: 'secured', path: '/open', method: 'get', scheme: 'o', required: true }), false)
assert.ok(guard({ type: 'secured', path: '/closed', method: 'get', scheme: 'o', required: true }))
assert.ok(guard({ type: 'secured', path: '/closed', method: 'get', scheme: 'o', scopes: ['r'] }))
assert.equal(guard({ type: 'secured', path: '/closed', method: 'get', scheme: 'o', scopes: ['r'], onlyScopes: true }), false)
assert.ok(guard({ type: 'scheme', name: 'o', values: { 'settings.accessTokenUri': 'https://a/token' } }))
assert.equal(guard({ type: 'scheme', name: 'o', values: { 'settings.accessTokenUri': 'https://b/token' } }), false)

// Types compare exactly and follow an alias, but never a subtype
const typed = parseRaml(head + 'types:\n  Id:\n    type: string\n    minLength: 2\n  Ids:\n    type: Id[]\n  Base:\n    properties:\n      a: string\n  Sub:\n    type: Base\n    properties:\n      b: string\n  Holder:\n    properties:\n      id: Id\n      sub: Sub\n      x:\n        type: string\n        xml:\n          attribute: true\n      y: string\n/h:\n  get:\n    responses:\n      200:\n        body:\n          type: Ids\n')
const typeRule = (r) => runRamlChecks(typed, [{ label: 'x', rule: r }])[0].pass
const holder = (prop, want) => typeRule({ type: 'prop', typeName: 'Holder', prop, want })
assert.ok(holder('id', { type: 'string', minLength: 2 }))
assert.ok(holder('id', { type: 'Id' }))
assert.ok(holder('sub', { type: 'Sub' }))
assert.equal(holder('sub', { type: 'Base' }), false)
assert.equal(holder('id', { type: 'str' }), false)
assert.ok(typeRule({ type: 'response', path: '/h', method: 'get', status: '200', typeIs: 'Id[]' }))
assert.ok(typeRule({ type: 'response', path: '/h', method: 'get', status: '200', typeIs: 'Ids' }))
assert.equal(typeRule({ type: 'response', path: '/h', method: 'get', status: '200', typeIs: 'Id' }), false)
// A pattern that is missing passes nothing, is keeps the case, holds looks inside a facet
assert.equal(holder('y', { pattern: { accepts: ['a'] } }), false)
assert.ok(typeRule({ type: 'root', key: 'title', want: { is: 'T' } }))
assert.equal(typeRule({ type: 'root', key: 'title', want: { is: 't' } }), false)
assert.ok(holder('x', { xml: { holds: { attribute: true } } }))
assert.equal(holder('y', { xml: { holds: { attribute: true } } }), false)

// Sample-based patterns, own examples, and what must come from a resource type
const rules = parseRaml(`${head}types:\n  R:\n    type: string\n    pattern: ^[A-Z]{2}$\n    example: AB\nresourceTypes:\n  c:\n    get:\n      responses:\n        200:\n          description: x\n/a:\n  type: c\n  get:\n    responses:\n      200:\n        body:\n          type: R\n/b:\n  type: c\n`)
const says2 = (r) => runRamlChecks(rules, [{ label: 'x', rule: r }])[0].pass
assert.ok(says2({ type: 'typeDecl', name: 'R', want: { pattern: { accepts: ['AB'], rejects: ['A', 'ab', 'ABC'] } } }))
assert.equal(says2({ type: 'typeDecl', name: 'R', want: { pattern: { accepts: ['A'] } } }), false)
assert.ok(says2({ type: 'response', path: '/a', method: 'get', status: '200', example: true }))
assert.equal(says2({ type: 'response', path: '/a', method: 'get', status: '200', example: 'own' }), false)
assert.ok(says2({ type: 'typed', path: '/b', resourceType: 'c', provides: ['get.responses.200'] }))
assert.equal(says2({ type: 'typed', path: '/a', resourceType: 'c', provides: ['get.responses.200'] }), false, 'written by hand')

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

// Hand-written answers from scripts/raml-cases: each is the model answer with some text swapped.
// wrong: must fail the check whose label holds `fails`. right: a different correct answer, which must pass everything.
const caseDir = resolve('scripts/raml-cases')
const cases = []
for (const file of readdirSync(caseDir)) cases.push(...(await import(pathToFileURL(join(caseDir, file)).href)).default)
let wrongCases = 0
let rightCases = 0

function runCase(p, checks, answer, what) {
  const texts = { 'api.raml': p.referenceRaml, ...p.referenceFiles }
  for (const [from, to, file = 'api.raml'] of answer.swap) {
    if (!texts[file]?.includes(from)) fail.push(`${p.id}: ${what}: “${from}” is not in ${file}`)
    texts[file] = texts[file]?.replace(from, () => to)
  }
  const { 'api.raml': main, ...files } = texts
  return runRamlChecks(parseRaml(main, files), checks)
}
for (const file of files.sort()) {
  const p = (await import(pathToFileURL(join(root, file)).href)).default
  const checks = ramlChecks(p)
  count++
  const reference = parseRaml(p.referenceRaml, p.referenceFiles)
  for (const e of reference.errors) fail.push(`${p.id}: reference line ${e.line}: ${e.message}`)
  for (const r of runRamlChecks(reference, checks)) if (!r.pass) fail.push(`${p.id}: reference fails: ${r.label}`)
  // The shared valid check is the only one a near-empty file may pass.
  runRamlChecks(empty, checks).slice(1).forEach((r) => r.pass && fail.push(`${p.id}: passes on an empty file: ${r.label}`))
  const starter = runRamlChecks(parseRaml(p.starter, p.files), checks)
  if (starter.every((r) => r.pass)) fail.push(`${p.id}: the starter already passes`)
  checks.forEach((c) => {
    const hint = ramlHint(empty, c.rule)
    if (hint.length < 8 || /undefined|\[object/.test(hint)) fail.push(`${p.id}: bad hint: ${hint}`)
  })
  for (const key of ['description', 'solution', 'keyPoints', 'followUps']) if (!p[key]?.length) fail.push(`${p.id}: no ${key}`)
  for (const c of cases.filter((x) => x.id === p.id)) {
    for (const answer of c.wrong ?? []) {
      wrongCases++
      const failed = runCase(p, checks, answer, 'wrong').filter((r) => !r.pass).map((r) => r.label)
      if (!failed.some((l) => l.includes(answer.fails))) fail.push(`${p.id}: expected “${answer.fails}” to fail, failed: ${failed.join(' | ') || 'nothing'}`)
    }
    for (const answer of c.right ?? []) {
      rightCases++
      const failed = runCase(p, checks, answer, 'right').filter((r) => !r.pass).map((r) => r.label)
      if (failed.length) fail.push(`${p.id}: a correct answer failed: ${failed.join(' | ')}`)
    }
  }
}
assert.deepEqual(fail, [])
console.log(`All RAML checks pass (${count} problems, ${wrongCases} wrong answers fail, ${rightCases} other correct answers pass).`)
