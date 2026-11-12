// Runs the good answer of every Logging Lab write exercise on the DataWeave runner, to prove each is valid
// DataWeave 2.0. Needs the runner: npm run runner (http://localhost:8787), or RUNNER_URL.
// Mule-only names (vars, error, correlationId, app, flow) are given test values as DataWeave variables.
import { EXERCISES } from '../src/logging/exercises.js'

const RUNNER = process.env.RUNNER_URL ?? 'http://localhost:8787'
const VARS = {
  orderId: 10045, startMs: 0, attempt: 2, customerId: 'C-2231', userId: 'U-118', fileName: 'prices.csv', mqMessageId: 'msg-7781',
  messageId: 'msg-7781', deliveryCount: 3, invoiceId: 'INV-5521', employeeId: 'E-3301', recordCount: 120, sku: 'SKU-118',
  shipmentId: 'SH-9001', jobId: 'job-31', accountId: 'A-1001', paymentId: 'pay_881', partnerId: 'P-77', tenantId: 't-9',
}
const ERROR = { errorType: 'HTTP:TIMEOUT', description: 'Read timed out', detailedDescription: 'Read timed out after 5000 ms' }
const PAYLOAD = {
  orderId: 10045, sapDocNo: '4500017', paymentId: 'pay_881', amount: 12.5, status: 'OK', items: [{ sku: 'SKU-118' }],
  batchJobInstanceId: 'b1', totalRecords: 10, successfulRecords: 9, failedRecords: 1, elapsedTimeInMillis: 812,
  id: 'X-1', success: true, items_count: 1, customer: { id: 'C-2231', email: 'ann@example.com' },
}

const ATTRIBUTES = {
  method: 'POST', requestPath: '/orders', queryParams: { page: '1' }, statusCode: 201, fileName: 'prices.csv', size: 48213,
  headers: { 'x-correlation-id': '7f3c2a' },
}

// any other vars.x or payload.x the models use get a placeholder, so a missing test value is not reported as
// invalid DataWeave
const used = (message, name) => [...message.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, 'g'))].map((m) => m[1])
function varsFor(message) {
  return Object.fromEntries(used(message, 'vars').map((k) => [k, VARS[k] ?? `test-${k}`]))
}
function payloadFor(message) {
  return { ...Object.fromEntries(used(message, 'payload').map((k) => [k, `test-${k}`])), ...PAYLOAD }
}

let failed = 0
for (const e of EXERCISES.filter((x) => x.kind === 'write')) {
  let body = e.model.message.trim().replace(/^#\[/, '').replace(/\]$/, '')
  let header = 'output text/plain'
  const own = body.match(/^\s*(output[^\n]*?)\s*---\s*([\s\S]*)$/)
  if (own) [, header, body] = own
  const script = [
    '%dw 2.0',
    header,
    `var vars = ${JSON.stringify(varsFor(e.model.message))}`,
    'var correlationId = "7f3c2a"',
    `var error = ${JSON.stringify(ERROR)}`,
    `var attributes = ${JSON.stringify(ATTRIBUTES)}`,
    'var app = { name: "orders-papi" }',
    'var flow = { name: "post-orders" }',
    '---',
    body,
  ].join('\n')
  const res = await fetch(`${RUNNER}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ script, inputs: [{ name: 'payload', mime: 'application/json', content: JSON.stringify(payloadFor(e.model.message)) }] }),
  })
  const r = await res.json()
  if (!r.ok) {
    failed++
    console.error(`${e.id}: not valid DataWeave\n  ${e.model.message}\n  ${String(r.error).split('\n').slice(0, 4).join('\n  ')}`)
  }
}
if (failed) process.exit(1)
console.log('Every Logging Lab good answer runs as DataWeave.')
