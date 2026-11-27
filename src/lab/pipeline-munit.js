// MUnit in the release pipeline. orders-papi is a small Mule project: flows in src/main/mule, MUnit suites in
// src/test/munit, a DataWeave file, the munit-maven-plugin block of the POM and the workflow lines that run Maven.
// The learner edits those files as text. This module reads them back the way the plugin would, runs every test
// against a fixed model of the flows, measures coverage and applies the coverage gate. Pure and import free.
// Lab simplifications are marked "lab:" in the comments.

export const MUNIT_VERSION = '3.1.0'
const RUNTIME = '4.6.0'
export const MUNIT_DOCS = {
  coverage: 'https://docs.mulesoft.com/munit/latest/coverage-maven-concept',
  plugin: 'https://docs.mulesoft.com/munit/latest/munit-maven-plugin',
  mock: 'https://docs.mulesoft.com/munit/latest/mock-event-processor',
  spy: 'https://docs.mulesoft.com/munit/latest/spy-event-processor',
  assertThat: 'https://docs.mulesoft.com/munit/latest/assert-that-event-processor',
}

// Paths of the files the learner can edit, in the order the file list shows them.
export const WORKFLOW = '.github/workflows/release.yml'
export const POM = 'pom.xml'
export const DWL = 'src/main/resources/dw/map-erp-order.dwl'
export const suitePath = (file) => `src/test/munit/${file.replace(/\.xml$/, '')}-test-suite.xml`
export const flowPath = (file) => `src/main/mule/${file}`

// A stable doc:id for each processor, shaped like the UUIDs Studio writes.
function hex(seed, salt) {
  let h = (2166136261 ^ salt) >>> 0
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h.toString(16).padStart(8, '0')
}
const docId = (seed) => {
  const s = [1, 2, 3, 4].map((n) => hex(seed, n)).join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`
}
const p = (kind, name, extra = {}) => ({ kind, name, id: docId(`${kind}|${name}`), ...extra })

const CONNECTORS = new Set(['http:request', 'db:insert', 'db:select', 'anypoint-mq:publish'])
const DB_FAULT = 'Cannot get connection for URL jdbc:sqlserver://orders-db.brightmart.internal:1433;databaseName=orders: The TCP/IP connection to the host orders-db.brightmart.internal, port 1433 has failed.'
const db = (kind, name) => p(kind, name, { config: 'Orders_DB_config', reach: 'internal', host: 'orders-db.brightmart.internal:1433', errorType: 'DB:CONNECTIVITY', fault: DB_FAULT })
const mq = (name, destination) => p('anypoint-mq:publish', name, { config: 'Anypoint_MQ_config', reach: 'cloud', host: 'mq-us-east-1.anypoint.mulesoft.com', destination })

export const ERP_URL = 'http://erp.brightmart.internal:8081/api/orders/1001'
export const ERP_REQUEST = p('http:request', 'Get order from ERP', {
  id: '5c1e9a7d-2b4f-4e8a-9d31-7f0c6b2a8e14',
  config: 'ERP_HTTP_Request_config',
  method: 'GET',
  path: '/api/orders/{orderId}',
  reach: 'internal',
  host: 'erp.brightmart.internal:8081',
  errorType: 'HTTP:CONNECTIVITY',
  // lab: the runner has no route or DNS entry for the internal host. The exact wording varies with the JDK.
  fault: `HTTP GET on resource '${ERP_URL}' failed: erp.brightmart.internal: Name or service not known.`,
})

// The application: which processors each flow runs, in order, and its error handler. lab: every error handler is an
// on-error-propagate that catches any error, so the test still sees the error after the handler ran.
export const APP = [
  {
    file: 'orders.xml',
    flows: [
      {
        name: 'get-order-flow',
        steps: [p('logger', 'Log get order request'), p('set-variable', 'Set orderId'), ERP_REQUEST, p('ee:transform', 'Map ERP order', { resource: 'dw/map-erp-order.dwl' }), p('set-variable', 'Set httpStatus 200'), p('logger', 'Log order mapped')],
        handler: [p('ee:transform', 'Build 503 response'), p('logger', 'Log ERP unavailable')],
      },
      {
        name: 'create-order-flow',
        steps: [p('logger', 'Log create order request'), p('ee:transform', 'Validate order'), p('set-variable', 'Set new orderId'), db('db:insert', 'Insert order'), mq('Publish order created', 'brightmart-orders-created'), p('ee:transform', 'Build 201 response'), p('logger', 'Log order created')],
        handler: [p('ee:transform', 'Build 500 response'), p('logger', 'Log order not stored')],
      },
      {
        name: 'list-orders-flow',
        steps: [p('logger', 'Log list orders request'), db('db:select', 'Select open orders'), p('ee:transform', 'Map orders'), p('logger', 'Log orders listed')],
        handler: [],
      },
    ],
  },
  {
    file: 'returns.xml',
    flows: [
      {
        name: 'create-return-flow',
        steps: [p('logger', 'Log return request'), p('ee:transform', 'Validate return'), p('set-variable', 'Set returnId'), p('set-variable', 'Set return orderId'), db('db:insert', 'Insert return'), mq('Publish return received', 'brightmart-returns-received'), p('ee:transform', 'Build return response'), p('logger', 'Log return created')],
        handler: [p('ee:transform', 'Build 400 return response'), p('logger', 'Log rejected return')],
      },
    ],
  },
  {
    file: 'api.xml',
    flows: [
      {
        name: 'orders-papi-main',
        steps: [p('apikit:router', 'APIkit Router')],
        handler: ['BAD_REQUEST', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'NOT_ACCEPTABLE', 'UNSUPPORTED_MEDIA_TYPE'].map((t) => p('ee:transform', `APIKIT:${t} response`)),
      },
    ],
  },
]
const ALL_FLOWS = APP.flatMap((f) => f.flows.map((flow) => ({ ...flow, file: f.file })))
const findFlow = (name) => ALL_FLOWS.find((f) => f.name === name)
export const connectorsOf = (flowName) => (findFlow(flowName)?.steps ?? []).filter((s) => CONNECTORS.has(s.kind))

// ---------- the DataWeave line the get order test checks ----------

// lab: the lab does not run DataWeave. It reads the total line of map-erp-order.dwl and evaluates it when it uses only
// payload.amount, numbers, + - * / and parentheses. DataWeave numbers are decimals, so the result is rounded.
function evaluate(expr, amount) {
  const tokens = expr.match(/payload\.amount|\d+(?:\.\d+)?|[-+*/()]|\S+/g) ?? []
  let i = 0
  const primary = () => {
    const t = tokens[i++]
    if (t === '(') {
      const v = sum()
      if (tokens[i++] !== ')') throw new Error('paren')
      return v
    }
    if (t === '-') return -primary()
    if (t === 'payload.amount') {
      if (typeof amount !== 'number') throw new Error('null amount')
      return amount
    }
    if (/^\d/.test(t ?? '')) return Number(t)
    throw new Error('token')
  }
  const product = () => {
    let v = primary()
    while (tokens[i] === '*' || tokens[i] === '/') v = tokens[i++] === '*' ? v * primary() : v / primary()
    return v
  }
  const sum = () => {
    let v = product()
    while (tokens[i] === '+' || tokens[i] === '-') v = tokens[i++] === '+' ? v + product() : v - product()
    return v
  }
  const v = sum()
  if (i !== tokens.length) throw new Error('trailing')
  return Math.round(v * 1e6) / 1e6
}

// The total the mapping produces for an ERP amount, or null when the lab cannot read the line.
export function totalFrom(dwl, amount) {
  const m = String(dwl ?? '').match(/^\s*total\s*:\s*(.+?)\s*,?\s*(?:\/\/.*)?$/m)
  if (!m) return null
  try {
    return evaluate(m[1], amount)
  } catch {
    return null
  }
}

// ---------- reading the files ----------

const decode = (v) => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const attrs = (s) => Object.fromEntries([...String(s ?? '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], decode(m[2])]))
const unwrap = (v) => {
  const inner = String(v ?? '').trim().replace(/^#\[\s*([\s\S]*?)\s*\]$/, '$1')
  const q = inner.match(/^'(.*)'$|^"(.*)"$/)
  return q ? (q[1] ?? q[2]) : inner
}
const stripXmlComments = (t) => String(t ?? '').replace(/<!--[\s\S]*?-->/g, '')

function literal(raw) {
  const s = String(raw ?? '').trim()
  const q = s.match(/^'(.*)'$|^"(.*)"$/)
  if (q) return { ok: true, value: q[1] ?? q[2] }
  if (s === 'true' || s === 'false') return { ok: true, value: s === 'true' }
  if (s === 'null') return { ok: true, value: null }
  if (/^-?\d+(\.\d+)?$/.test(s)) return { ok: true, value: Number(s) }
  return { ok: false }
}

// lab: then-return payloads are read as flat DataWeave object literals, such as #[{orderId: '1001', amount: 100.00}].
export function parseObject(raw) {
  const s = unwrap(raw).trim()
  if (!s.startsWith('{') || !s.endsWith('}')) return null
  const body = s.slice(1, -1).trim()
  if (!body) return {}
  const out = {}
  for (const part of body.split(/,(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)) {
    const m = part.match(/^\s*['"]?([\w-]+)['"]?\s*:\s*(.+?)\s*$/)
    if (!m) return null
    const v = literal(m[2])
    out[m[1]] = v.ok ? v.value : m[2]
  }
  return out
}

function parseTest(head, body) {
  const a = attrs(head)
  const mocks = [...body.matchAll(/<munit-tools:mock-when\b([^>]*?)(?:\/>|>([\s\S]*?)<\/munit-tools:mock-when>)/g)].map((m) => {
    const inner = m[2] ?? ''
    const payload = inner.match(/<munit-tools:payload\b([^>]*?)\/?>/)
    const error = inner.match(/<munit-tools:error\b([^>]*?)\/?>/)
    return {
      processor: attrs(m[1]).processor ?? '',
      where: [...inner.matchAll(/<munit-tools:with-attribute\b([^>]*?)\/?>/g)].map((w) => {
        const wa = attrs(w[1])
        return { name: wa.attributeName ?? '', value: unwrap(wa.whereValue) }
      }),
      payload: payload ? attrs(payload[1]).value : undefined,
      error: error ? attrs(error[1]).typeId : undefined,
    }
  })
  return {
    name: a.name ?? '(no name)',
    description: a.description ?? '',
    ignore: a.ignore === 'true',
    expectedErrorType: a.expectedErrorType,
    mocks,
    spies: [...body.matchAll(/<munit-tools:spy\b([^>]*)>/g)].map((m) => attrs(m[1]).processor),
    flowRefs: [...body.matchAll(/<flow-ref\b([^>]*?)\/?>/g)].map((m) => attrs(m[1]).name),
    asserts: [...body.matchAll(/<munit-tools:assert-that\b([^>]*?)\/?>/g)].map((m) => attrs(m[1])),
  }
}

// Reads one suite. A broken file gives the kind of SAX error Mule prints, and no tests.
export function parseSuite(text) {
  const clean = stripXmlComments(text)
  const opens = (clean.match(/<munit:test\b/g) ?? []).length
  const found = [...clean.matchAll(/<munit:test\b([^>]*)>([\s\S]*?)<\/munit:test>/g)]
  if (!/<mule\b/.test(clean) || !/<\/mule>\s*$/.test(clean)) return { error: 'The markup in the document following the root element must be well-formed: the file must start with <mule> and end with </mule>.', tests: [] }
  if (found.length !== opens) return { error: 'The element type "munit:test" must be terminated by the matching end-tag "</munit:test>".', tests: [] }
  return { tests: found.map((m) => parseTest(m[1], m[2])) }
}

export const suitePaths = (munit) => Object.keys(munit?.files ?? {}).filter((k) => k.startsWith('src/test/munit/')).sort()

// Every test in the project, with the suite it is in.
export function suiteTests(munit) {
  return suitePaths(munit).flatMap((path) => parseSuite(munit.files[path]).tests.map((t) => ({ ...t, suite: path.split('/').pop() })))
}

const runLine = (text, test) => {
  const lines = String(text ?? '').split('\n').map((l) => l.match(/^\s*run:\s*(.+?)\s*$/)?.[1]).filter(Boolean)
  return lines.map((l) => l.replace(/\s+#.*$/, '').trim()).find(test)
}
const SKIP = /(^|\s)-D(skipMunitTests|skipTests|maven\.test\.skip)(=true)?(?=\s|$)/

// The Maven commands the workflow runs for tests and for publishing, and whether each one skips MUnit.
export function workflowCommands(munit) {
  const text = munit?.files?.[WORKFLOW]
  const test = runLine(text, (l) => /^mvn\b/.test(l) && /\b(test|verify)\b/.test(l) && !/\bdeploy\b/.test(l)) ?? 'mvn test'
  const publish = runLine(text, (l) => /^mvn\b/.test(l) && /\bdeploy\b/.test(l)) ?? 'mvn clean deploy'
  const skipTest = SKIP.test(test)
  const skipPublish = SKIP.test(publish)
  return { test, publish, skipTest, skipPublish, anySkip: skipTest || skipPublish }
}

// The coverage block of the munit-maven-plugin. Values the POM leaves out take the plugin defaults: runCoverage and
// failBuild false, and -1 for a required level, which sets no requirement.
export function coverageSettings(munit) {
  const pom = stripXmlComments(munit?.files?.[POM])
  const plugin = /<artifactId>\s*munit-maven-plugin\s*<\/artifactId>/.test(pom)
  const block = pom.match(/<coverage>([\s\S]*?)<\/coverage>/)?.[1] ?? ''
  const tag = (name) => block.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))?.[1]
  const level = (name) => {
    const v = Number(tag(name))
    return tag(name) === undefined || Number.isNaN(v) ? -1 : v
  }
  const list = (name) => [...block.matchAll(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, 'g'))].map((m) => m[1])
  return {
    plugin,
    runCoverage: tag('runCoverage') === 'true',
    failBuild: tag('failBuild') === 'true',
    requiredApplicationCoverage: level('requiredApplicationCoverage'),
    requiredResourceCoverage: level('requiredResourceCoverage'),
    requiredFlowCoverage: level('requiredFlowCoverage'),
    ignoreFlows: list('ignoreFlow'),
    ignoreFiles: list('ignoreFile'),
  }
}

// ---------- running the tests ----------

const where = (w, step) => (w.name === 'doc:name' ? step.name : w.name === 'doc:id' ? step.id : w.name === 'config-ref' ? step.config : undefined) === w.value
export const mockMatches = (mock, step) => mock.processor === step.kind && mock.where.every((w) => where(w, step))

// What each flow leaves in the payload. lab: fixed values, except the total, which comes from the DataWeave file.
function resultOf(flow, outputs, files) {
  if (flow.name === 'get-order-flow') {
    const erp = outputs[ERP_REQUEST.name] ?? {}
    const total = totalFrom(files[DWL], typeof erp.amount === 'number' ? erp.amount : undefined)
    if (total === null) return { error: { type: 'MULE:EXPRESSION', message: '"Unable to evaluate the total line of dw/map-erp-order.dwl" evaluating expression: dw/map-erp-order.dwl' } }
    return { payload: { orderId: erp.orderId, status: erp.status, total, currency: 'USD' } }
  }
  if (flow.name === 'create-order-flow') return { payload: { status: 'CREATED', orderId: 'ORD-1001' } }
  if (flow.name === 'list-orders-flow') return { payload: { count: 2 } }
  if (flow.name === 'create-return-flow') return { payload: { status: 'RECEIVED', returnId: 'RET-1001' } }
  return { payload: {} }
}

const describe = (v) => (v === null || v === undefined ? 'null' : typeof v === 'string' ? `"${v}"` : `<${v}>`)

function checkAssert(a, payload) {
  const expr = unwrap(a.expression)
  const path = expr.match(/^payload((?:\.[\w-]+)*)$/)
  const lead = (a.message ?? 'The value is not as expected').replace(/\.?\s*$/, '.')
  if (!path) return `java.lang.AssertionError: The lab reads expressions of the form #[payload.field]. It cannot read ${a.expression ?? '(no expression)'}.`
  const actual = path[1].split('.').filter(Boolean).reduce((v, k) => (v == null ? undefined : v[k]), payload)
  const m = unwrap(a.is).match(/^MunitTools::(\w+)\(\s*([\s\S]*?)\s*\)$/)
  if (!m) return `java.lang.AssertionError: The lab reads the matchers equalTo, notNullValue and nullValue. It cannot read ${a.is ?? '(no is attribute)'}.`
  if (m[1] === 'notNullValue') return actual == null ? `java.lang.AssertionError: ${lead} Expected: not null but: was null` : null
  if (m[1] === 'nullValue') return actual != null ? `java.lang.AssertionError: ${lead} Expected: null but: was ${describe(actual)}` : null
  if (m[1] === 'equalTo') {
    const want = literal(m[2])
    if (!want.ok) return `java.lang.AssertionError: The lab reads numbers, quoted strings, true, false and null inside equalTo. It cannot read ${m[2]}.`
    return actual === want.value ? null : `java.lang.AssertionError: ${lead} Expected: ${describe(want.value)} but: was ${describe(actual)}`
  }
  return `java.lang.AssertionError: The lab reads the matchers equalTo, notNullValue and nullValue. It cannot read MunitTools::${m[1]}.`
}

function runTest(test, files) {
  if (test.ignore) return { status: 'skipped', executed: [], real: [] }
  const flowName = test.flowRefs[0]
  if (!flowName) {
    // a test without a flow reference runs nothing and passes, unless it waits for an error
    return test.expectedErrorType ? { status: 'failed', message: `java.lang.AssertionError: The test expected an error of type ${test.expectedErrorType}, but no error was raised.`, executed: [], real: [] } : { status: 'passed', executed: [], real: [] }
  }
  const flow = findFlow(flowName)
  if (!flow) return { status: 'error', message: `MULE:ROUTING: Flow '${flowName}' does not exist. The flow-ref cannot be resolved.`, executed: [], real: [] }
  const executed = []
  const outputs = {}
  const real = []
  let error = null
  let unmocked = null
  for (const step of flow.steps) {
    executed.push(step.id)
    if (!CONNECTORS.has(step.kind)) continue
    const mock = test.mocks.find((m) => mockMatches(m, step))
    if (mock?.error) {
      error = { type: mock.error, message: 'An error raised by mock-when.' }
      break
    }
    if (mock) {
      outputs[step.name] = parseObject(mock.payload) ?? {}
      continue
    }
    if (step.reach === 'internal') {
      // lab: no mock, so the test calls the real system, and the runner has no route to Brightmart's network
      error = { type: step.errorType, message: step.fault }
      unmocked = step
      break
    }
    real.push(step)
  }
  let payload = {}
  if (!error) {
    const result = resultOf(flow, outputs, files)
    if (result.error) error = result.error
    else payload = result.payload
  }
  if (error) executed.push(...flow.handler.map((s) => s.id))
  const base = { executed, real, flow: flow.name, unmocked }
  if (error) {
    if (test.expectedErrorType === error.type) return { ...base, status: 'passed' }
    if (test.expectedErrorType) return { ...base, status: 'failed', message: `java.lang.AssertionError: Expected error type ${test.expectedErrorType} but was ${error.type}.` }
    return { ...base, status: 'error', message: `${error.type}: ${error.message}`, errorType: error.type }
  }
  if (test.expectedErrorType) return { ...base, status: 'failed', message: `java.lang.AssertionError: The test expected an error of type ${test.expectedErrorType}, but no error was raised.` }
  for (const a of test.asserts) {
    const failed = checkAssert(a, payload)
    if (failed) return { ...base, status: 'failed', message: failed }
  }
  return { ...base, status: 'passed' }
}

const pct = (covered, total) => (total === 0 ? 100 : Math.round((covered / total) * 10000) / 100)
export const fmt = (n) => `${n.toFixed(2)}%`
const fmtLevel = (n) => `${Number(n).toFixed(1)}%`

// Coverage counts the processors that ran in at least one test, against all processors of the flows that count.
function coverageOf(results, settings) {
  const ran = new Set(results.flatMap((r) => r.executed))
  const resources = APP.filter((f) => !settings.ignoreFiles.includes(f.file)).map((f) => {
    const flows = f.flows
      .filter((flow) => !settings.ignoreFlows.includes(flow.name))
      .map((flow) => {
        const all = [...flow.steps, ...flow.handler]
        const covered = all.filter((s) => ran.has(s.id)).length
        return { name: flow.name, covered, total: all.length, percent: pct(covered, all.length) }
      })
    const covered = flows.reduce((n, fl) => n + fl.covered, 0)
    const total = flows.reduce((n, fl) => n + fl.total, 0)
    return { file: f.file, flows, covered, total, percent: pct(covered, total) }
  })
  const covered = resources.reduce((n, r) => n + r.covered, 0)
  const total = resources.reduce((n, r) => n + r.total, 0)
  return { resources, covered, total, percent: pct(covered, total), flowCount: resources.reduce((n, r) => n + r.flows.length, 0) }
}

// Runs every suite: test results, per suite counts and coverage.
export function runSuites(munit) {
  const settings = coverageSettings(munit)
  const suites = suitePaths(munit).map((path) => {
    const parsed = parseSuite(munit.files[path])
    const file = path.split('/').pop()
    const tests = parsed.tests.map((t) => ({ name: t.name, suite: file, ...runTest(t, munit.files) }))
    return { file, error: parsed.error, tests }
  })
  const results = suites.flatMap((s) => s.tests)
  const count = (status) => results.filter((r) => r.status === status).length
  return {
    settings,
    suites,
    results,
    totals: { tests: results.length, passed: count('passed'), failures: count('failed'), errors: count('error'), skipped: count('skipped') },
    coverage: coverageOf(results, settings),
  }
}

// ---------- the job output ----------

const line = (level, text, basis = 'assumed') => ({ level, text, basis })
const issue = (severity, title, cause, fix, extra = {}) => ({ severity, title, cause, fix, basis: 'docs', ...extra })
const RULE = '==============================================================================='

function coverageMisses(coverage, s) {
  const misses = []
  if (s.requiredApplicationCoverage >= 0 && coverage.percent < s.requiredApplicationCoverage) misses.push(`Application coverage is below defined limit. Required: ${fmtLevel(s.requiredApplicationCoverage)} - Current: ${fmt(coverage.percent)}`)
  for (const r of coverage.resources) {
    if (s.requiredResourceCoverage >= 0 && r.percent < s.requiredResourceCoverage) misses.push(`Resource: ${r.file} coverage is below defined limit. Required: ${fmtLevel(s.requiredResourceCoverage)} - Current: ${fmt(r.percent)}`)
    for (const f of r.flows) {
      if (s.requiredFlowCoverage >= 0 && f.percent < s.requiredFlowCoverage) misses.push(`Flow: ${r.file} -> ${f.name} coverage is below defined limit. Required: ${fmtLevel(s.requiredFlowCoverage)} - Current: ${fmt(f.percent)}`)
    }
  }
  return misses
}

function skipped(phase) {
  return {
    logs: [line('INFO', 'Run of munit-maven-plugin skipped. Property [skipMunitTests] was set to true.'), line('INFO', 'BUILD SUCCESS')],
    issues: [
      issue(
        'warning',
        'MUnit tests were skipped',
        `The ${phase} command passes -DskipMunitTests, so MUnit ran no test and the coverage gate was never checked. The job is green because nothing was tested, not because the tests pass.`,
        'Delete -DskipMunitTests from the workflow and fix what the tests or the coverage gate report. A skip flag in a release workflow is a smell: it hides the problem from everyone who reads a green run.',
        { docs: MUNIT_DOCS.plugin, code: 'munit-skipped' },
      ),
    ],
  }
}

// The output of the MUnit job, or of the test phase inside mvn clean deploy (`phase` is 'test' or 'publish').
export function munitStage(munit, phase = 'test') {
  const cmd = workflowCommands(munit)
  if (phase === 'test' ? cmd.skipTest : cmd.skipPublish) return skipped(phase === 'test' ? 'test' : 'publish')
  const run = runSuites(munit)
  const { settings, suites, totals, coverage, results } = run
  if (!settings.plugin) {
    return {
      logs: [line('INFO', 'No munit-maven-plugin in the POM, so the test phase ran no MUnit test.'), line('INFO', 'BUILD SUCCESS')],
      issues: [issue('warning', 'MUnit did not run', 'The POM has no munit-maven-plugin, so mvn test finds nothing to run and the job passes without any test.', 'Add the munit-maven-plugin with the test and coverage-report goals.', { docs: MUNIT_DOCS.plugin, code: 'munit-no-plugin' })],
    }
  }
  const broken = suites.find((s) => s.error)
  if (broken) {
    return {
      logs: [line('ERROR', `org.xml.sax.SAXParseException; systemId: file:src/test/munit/${broken.file}; ${broken.error}`)],
      issues: [issue('failure', 'A test suite could not be read', `${broken.file}: ${broken.error} MUnit cannot run a suite that is not valid XML.`, 'Fix the XML, or press Revert file in MUnit tests to get the file back as it was.', { basis: 'assumed', code: 'munit-parse' })],
    }
  }
  const logs = [line('INFO', `--- munit-maven-plugin:${MUNIT_VERSION}:test (test) @ orders-papi ---`, 'assumed')]
  for (const s of suites) {
    logs.push(line('INFO', `Running ${s.file}`))
    for (const t of s.tests) {
      const level = t.status === 'passed' || t.status === 'skipped' ? 'INFO' : 'ERROR'
      logs.push(line(level, `  ${t.name} ${t.status === 'passed' ? 'SUCCESS' : t.status === 'skipped' ? 'IGNORED' : t.status === 'failed' ? 'FAILURE' : 'ERROR'}${t.message ? `: ${t.message}` : ''}`))
    }
    const c = (st) => s.tests.filter((t) => t.status === st).length
    logs.push(line('INFO', ` >> ${s.file} test result: Tests: ${s.tests.length}, Errors: ${c('error')}, Failures: ${c('failed')}, Skipped: ${c('skipped')}`))
  }
  logs.push(
    line('INFO', RULE),
    line('INFO', `MUnit Run Summary - Product: MULE_EE, Version: ${RUNTIME}`),
    line('INFO', ` > Tests: ${totals.tests}  > Errors: ${totals.errors}  > Failures: ${totals.failures}  > Skipped: ${totals.skipped}`),
    line('INFO', RULE),
  )
  const report = { totals, tests: results.map(({ name, suite, status, message }) => ({ name, suite, status, message: message ?? '' })), coverage: settings.runCoverage ? coverage : null, settings }
  const issues = []
  const realCalls = [...new Set(results.flatMap((r) => r.real.map((s) => s.name)))]
  for (const name of realCalls) {
    const step = ALL_FLOWS.flatMap((f) => f.steps).find((s) => s.name === name)
    issues.push(
      issue('warning', 'A test called a real system', `${name} (${step.kind}) has no mock in a test. Anypoint MQ is reachable from the runner, so the test published a real message to ${step.destination}.`, `Add a mock-when for ${name}, matched on its doc:id or doc:name. A test that writes to a real queue changes data that other people and systems use.`, { basis: 'assumed', docs: MUNIT_DOCS.mock, code: 'munit-real-call' }),
    )
  }
  if (totals.tests === 0) {
    return { logs, report, issues: [issue('failure', 'No MUnit tests ran', 'By default MUnit fails the Maven build if it finds no test suites or if no tests run.', 'Add MUnit tests to src/test/munit.', { docs: MUNIT_DOCS.plugin, code: 'munit-none' })] }
  }
  if (totals.errors > 0) {
    const errored = results.filter((r) => r.status === 'error')
    const unmocked = errored.find((r) => r.unmocked)?.unmocked
    const types = [...new Set(errored.map((r) => r.errorType).filter(Boolean))]
    const cause = unmocked
      ? `${errored.length} of ${totals.tests} tests ended with an error, not a failed assertion. ${errored[0].name} raised ${unmocked.errorType}: the test has no mock for "${unmocked.name}" (${unmocked.kind}, doc:id ${unmocked.id}), so it called the real system at ${unmocked.host}. The runner has no route to that host. On a laptop on the VPN the same call can succeed, which is why it passed there.`
      : `${errored.length} of ${totals.tests} tests ended with an error: ${errored[0].name}: ${errored[0].message}`
    const fix = unmocked
      ? `Add a mock-when on processor="${unmocked.kind}" with a with-attribute on doc:name "${unmocked.name}" or doc:id ${unmocked.id}, and a then-return payload. A unit test must not depend on a system the runner may not reach.`
      : 'Read the error in the MUnit report and fix its cause.'
    issues.push(issue('failure', 'MUnit tests ended with errors', cause, fix, { docs: unmocked ? MUNIT_DOCS.mock : MUNIT_DOCS.plugin, code: 'munit-errors', errorTypes: types, basis: unmocked ? 'docs' : 'assumed' }))
  }
  if (totals.failures > 0) {
    const failed = results.filter((r) => r.status === 'failed')
    issues.push(
      issue('failure', 'MUnit tests failed', `${failed.length} of ${totals.tests} tests failed an assertion. ${failed[0].name}: ${failed[0].message}`, 'Read Expected and was in the message. Decide which side is wrong. When the test states the business rule, fix the code, not the test.', { docs: MUNIT_DOCS.assertThat, code: 'munit-failures', basis: 'assumed' }),
    )
  }
  if (issues.some((i) => i.severity === 'failure')) {
    logs.push(line('ERROR', 'There are test failures or errors. BUILD FAILURE'))
    return { logs, report, issues }
  }
  if (!settings.runCoverage) {
    logs.push(line('INFO', 'runCoverage is not true, so coverage was not measured and no gate applies.', 'docs'), line('INFO', 'BUILD SUCCESS'))
    return { logs, report, issues }
  }
  logs.push(
    line('INFO', RULE),
    line('INFO', 'MUnit Coverage Summary'),
    line('INFO', ` * Resources: ${coverage.resources.length} - Flows: ${coverage.flowCount} - Processors: ${coverage.total}`),
    line('INFO', ` * Application Coverage: ${fmt(coverage.percent)}`, 'docs'),
    ...coverage.resources.map((r) => line('INFO', `   ${r.file}: ${fmt(r.percent)} (${r.flows.map((f) => `${f.name} ${fmt(f.percent)}`).join(', ')})`)),
    line('INFO', RULE),
  )
  const misses = coverageMisses(coverage, settings)
  if (misses.length === 0) {
    logs.push(line('INFO', 'BUILD SUCCESS'))
    return { logs, report, issues }
  }
  logs.push(...misses.map((m) => line(settings.failBuild ? 'ERROR' : 'WARN', m, 'docs')))
  const untested = coverage.resources.flatMap((r) => r.flows.filter((f) => f.covered === 0).map((f) => f.name))
  // the gate can fail on the application level, or only on a resource or flow level
  const appLow = settings.requiredApplicationCoverage >= 0 && coverage.percent < settings.requiredApplicationCoverage
  const others = misses.length - (appLow ? 1 : 0)
  const levels = [appLow ? `application coverage is ${fmt(coverage.percent)} and the gate requires ${settings.requiredApplicationCoverage}%` : `application coverage is ${fmt(coverage.percent)}`, others ? `${others} resource or flow level${others === 1 ? ' is' : 's are'} below the limit` : ''].filter(Boolean).join(', and ')
  const cause = `All ${totals.tests} tests pass, but ${levels}.${untested.length ? ` No test runs ${untested.join(', ')}.` : ''}`
  if (!settings.failBuild) {
    logs.push(line('INFO', 'BUILD SUCCESS'))
    return { logs, report, issues: [...issues, issue('warning', 'Coverage is below the required level', `${cause} failBuild is not true, so the build continues.`, 'Write tests for the flows the report lists, then set failBuild to true.', { docs: MUNIT_DOCS.coverage, code: 'munit-coverage' })] }
  }
  logs.push(line('ERROR', 'BUILD FAILURE'))
  return {
    logs,
    report,
    issues: [
      ...issues,
      issue('failure', 'Coverage gate failed', `${cause} failBuild is true, so MUnit fails the build.`, 'Write tests for the flows the coverage report lists: press Create test for this flow in MUnit tests and add an assertion. Lowering the levels, ignoring the flow or setting failBuild to false hides the gap.', { docs: MUNIT_DOCS.coverage, code: 'munit-coverage' }),
    ],
  }
}

// ---------- the files, and editing them ----------

const SUITE_HEAD = (name) => `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
  xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
  xmlns:munit="http://www.mulesoft.org/schema/mule/munit"
  xmlns:munit-tools="http://www.mulesoft.org/schema/mule/munit-tools">

  <munit:config name="${name}"/>
`

const mockXml = (step, by = 'doc:id', thenReturn) => `      <munit-tools:mock-when doc:name="Mock ${step.name}" processor="${step.kind}">
        <munit-tools:with-attributes>
          <munit-tools:with-attribute attributeName="${by}" whereValue="${by === 'doc:id' ? step.id : step.name}"/>
        </munit-tools:with-attributes>
        <munit-tools:then-return>
          ${thenReturn}
        </munit-tools:then-return>
      </munit-tools:mock-when>`

const SAMPLE_PAYLOADS = {
  'db:insert': '#[{affectedRows: 1}]',
  'db:select': "#[{id: 'ORD-1001'}]",
  'anypoint-mq:publish': "#[{messageId: 'msg-1'}]",
}
const payloadXml = (step) => `<munit-tools:payload value="${SAMPLE_PAYLOADS[step.kind] ?? '#[{}]'}" mediaType="application/json"/>`

// The test Studio would start you with for a flow, with a mock for each connector. The assertion is left for you.
function newTestXml(flowName, testName, assertion) {
  const mocks = connectorsOf(flowName).map((s) => mockXml(s, 'doc:id', payloadXml(s)))
  const validation = assertion
    ? `      ${assertion}`
    : `      <!-- Add an assertion. A test without one still counts as coverage. For example: -->
      <!-- <munit-tools:assert-that expression="#[payload.status]" is="#[MunitTools::equalTo('RECEIVED')]"/> -->`
  return `  <munit:test name="${testName}" description="Test for ${flowName}">
    <munit:behavior>
${mocks.join('\n')}
    </munit:behavior>
    <munit:execution>
      <flow-ref doc:name="Flow-ref to ${flowName}" name="${flowName}"/>
    </munit:execution>
    <munit:validation>
${validation}
    </munit:validation>
  </munit:test>
`
}

const ERP_MOCK = mockXml(ERP_REQUEST, 'doc:name', `<munit-tools:payload value="#[{orderId: '1001', status: 'OPEN', amount: 100.00}]" mediaType="application/json"/>`)

function ordersSuite({ erpMock }) {
  const behavior = erpMock ? ERP_MOCK : '      <!-- Dana: runs against the dev ERP. Works on the VPN. -->'
  return `${SUITE_HEAD('orders-test-suite.xml')}
  <munit:test name="get-order-returns-mapped-order" description="Maps the ERP order and adds 7.5 percent tax">
    <munit:behavior>
${behavior}
    </munit:behavior>
    <munit:execution>
      <flow-ref doc:name="Flow-ref to get-order-flow" name="get-order-flow"/>
    </munit:execution>
    <munit:validation>
      <munit-tools:assert-that doc:name="Total includes tax" expression="#[payload.total]" is="#[MunitTools::equalTo(107.5)]" message="The response payload is not as expected"/>
    </munit:validation>
  </munit:test>

  <munit:test name="get-order-erp-down" description="ERP unreachable takes the 503 path" expectedErrorType="HTTP:CONNECTIVITY">
    <munit:behavior>
${mockXml(ERP_REQUEST, 'doc:name', '<munit-tools:error typeId="HTTP:CONNECTIVITY"/>')}
    </munit:behavior>
    <munit:execution>
      <flow-ref doc:name="Flow-ref to get-order-flow" name="get-order-flow"/>
    </munit:execution>
  </munit:test>

${newTestXml('create-order-flow', 'create-order-stores-and-publishes', `<munit-tools:assert-that expression="#[payload.status]" is="#[MunitTools::equalTo('CREATED')]"/>`)}
${newTestXml('list-orders-flow', 'list-orders-returns-rows', '<munit-tools:assert-that expression="#[payload.count]" is="#[MunitTools::notNullValue()]"/>')}</mule>
`
}

const returnsSuite = () => `${SUITE_HEAD('returns-test-suite.xml')}
${newTestXml('create-return-flow', 'create-return-is-received', `<munit-tools:assert-that expression="#[payload.status]" is="#[MunitTools::equalTo('RECEIVED')]"/>`)}</mule>
`

const workflow = (skip) => `# .github/workflows/release.yml: the two jobs that run Maven
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - name: MUnit tests and coverage
        run: mvn -B clean test${skip ? ' -DskipMunitTests' : ''}
  publish:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Publish to Exchange
        run: mvn -B -s .maven/settings.xml clean deploy${skip ? ' -DskipMunitTests' : ''}
`

const pom = () => `<!-- pom.xml: the MUnit plugin. The other plugins are left out. -->
<properties>
  <munit.version>${MUNIT_VERSION}</munit.version>
</properties>

<plugin>
  <groupId>com.mulesoft.munit.tools</groupId>
  <artifactId>munit-maven-plugin</artifactId>
  <version>\${munit.version}</version>
  <executions>
    <execution>
      <id>test</id>
      <phase>test</phase>
      <goals>
        <goal>test</goal>
        <goal>coverage-report</goal>
      </goals>
    </execution>
  </executions>
  <configuration>
    <coverage>
      <runCoverage>true</runCoverage>
      <failBuild>true</failBuild>
      <requiredApplicationCoverage>80</requiredApplicationCoverage>
      <requiredResourceCoverage>60</requiredResourceCoverage>
      <requiredFlowCoverage>60</requiredFlowCoverage>
      <ignoreFiles>
        <ignoreFile>api.xml</ignoreFile>
      </ignoreFiles>
      <formats>
        <format>console</format>
        <format>html</format>
      </formats>
    </coverage>
  </configuration>
</plugin>
`

const dwl = (bug) => `%dw 2.0
output application/json
---
{
  orderId: payload.orderId,
  status: payload.status,
  // Brightmart adds 7.5 percent sales tax to the ERP amount
  total: ${bug ? 'payload.amount + 0.075' : 'payload.amount * 1.075'},
  currency: "USD"
}
`

// Each template is one state of the project. 'sample' is healthy; the labs start from 'gate' and 'mock'.
const TEMPLATES = {
  sample: { skip: false, erpMock: true, bug: false, returnsTests: true, notes: {} },
  gate: {
    skip: true,
    erpMock: true,
    bug: false,
    returnsTests: false,
    notes: {
      [WORKFLOW]: 'Last commit: 9d41c07 "ci: skip munit so the release goes out" by Sam Ortega, yesterday.',
      [flowPath('returns.xml')]: 'Last commit: 4be2a18 "feat: POST /returns" by Lee Navarro, 2 days ago. The commit added no test suite.',
    },
  },
  mock: {
    skip: false,
    erpMock: false,
    bug: true,
    returnsTests: true,
    notes: {
      [suitePath('orders.xml')]: 'Last commit: 71c3e90 "test: get order maps the ERP order" by Dana Ruiz, last week. It passed on her laptop over the VPN.',
      [DWL]: 'Last commit: c08f5ab "refactor: tidy the ERP mapping" by Lee Navarro, 3 days ago.',
    },
  },
}
export const templateNote = (munit, path) => TEMPLATES[munit?.template]?.notes[path] ?? ''

function templateFiles(id) {
  const t = TEMPLATES[id] ?? TEMPLATES.sample
  const files = {
    [WORKFLOW]: workflow(t.skip),
    [POM]: pom(),
    [DWL]: dwl(t.bug),
    [suitePath('orders.xml')]: ordersSuite({ erpMock: t.erpMock }),
  }
  if (t.returnsTests) files[suitePath('returns.xml')] = returnsSuite()
  return files
}

// The project the screen and the labs work on: { template, files: { path: text } }.
export const munitProject = (id = 'sample') => ({ template: TEMPLATES[id] ? id : 'sample', files: templateFiles(id) })

export const setFile = (munit, path, text) => ({ ...munit, files: { ...munit.files, [path]: text } })

// Puts one file back as the template had it. A suite the template does not have is removed.
export function revertFile(munit, path) {
  const original = templateFiles(munit.template)[path]
  const files = { ...munit.files }
  if (original === undefined) delete files[path]
  else files[path] = original
  return { ...munit, files }
}

// Adds a test for a flow to the suite named after the flow's file, and creates the suite when it is missing.
export function createTestFor(munit, flowName) {
  const flow = findFlow(flowName)
  if (!flow) return munit
  const path = suitePath(flow.file)
  const taken = new Set(suiteTests(munit).map((t) => t.name))
  let name = `${flowName}-test`
  for (let n = 2; taken.has(name); n++) name = `${flowName}-test-${n}`
  const current = munit.files[path] ?? `${SUITE_HEAD(path.split('/').pop())}\n</mule>\n`
  const at = current.lastIndexOf('</mule>')
  const text = at < 0 ? `${current}\n${newTestXml(flowName, name)}` : `${current.slice(0, at)}${newTestXml(flowName, name)}${current.slice(at)}`
  return setFile(munit, path, text)
}

// The XML of one Mule configuration file, written from the model, so the learner can read doc:name and doc:id.
export function flowXml(file) {
  const res = APP.find((f) => f.file === file)
  if (!res) return ''
  const proc = (s, pad) => {
    const base = `${pad}<${s.kind} doc:name="${s.name}" doc:id="${s.id}"`
    if (s.kind === 'http:request') return `${base} config-ref="${s.config}" method="${s.method}" path="${s.path}"/>`
    if (s.kind === 'ee:transform' && s.resource) return `${base}>\n${pad}  <ee:message>\n${pad}    <ee:set-payload resource="${s.resource}"/>\n${pad}  </ee:message>\n${pad}</ee:transform>`
    if (s.kind === 'anypoint-mq:publish') return `${base} config-ref="${s.config}" destination="${s.destination}"/>`
    if (s.config) return `${base} config-ref="${s.config}"/>`
    return `${base}/>`
  }
  const flows = res.flows.map((f) => {
    const handler = f.handler.length ? `\n    <error-handler>\n      <on-error-propagate type="ANY">\n${f.handler.map((s) => proc(s, '        ')).join('\n')}\n      </on-error-propagate>\n    </error-handler>` : ''
    return `  <flow name="${f.name}">\n${f.steps.map((s) => proc(s, '    ')).join('\n')}${handler}\n  </flow>`
  })
  return `<!-- ${flowPath(file)}: read only in the lab -->\n<mule>\n${flows.join('\n\n')}\n</mule>`
}

// How many tests reference each flow, for the file list.
export function testsByFlow(munit) {
  const counts = {}
  for (const t of suiteTests(munit)) for (const f of t.flowRefs) counts[f] = (counts[f] ?? 0) + 1
  return counts
}
