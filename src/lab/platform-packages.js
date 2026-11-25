// The sample Mule applications of the Anypoint console. Each one is invented for the lab and behaves from its settings:
// boot() says why it cannot start, jobs run a scheduled flow, handle() answers an HTTP request, consume() takes a message.
import { parseRaml } from '../raml/parse.js'

const line = (level, text, logger = 'org.mule.runtime.core.internal.processor.LoggerMessageProcessor') => ({ level, text, logger })
export const info = (text, logger) => line('INFO', text, logger)
export const warn = (text, logger) => line('WARN', text, logger)

const STARS = '*'.repeat(80)
// The shape of the error block Mule 4 writes to the log
export const muleError = ({ message, type, flow, file, at, name, dsl }) =>
  line(
    'ERROR',
    [
      '',
      STARS,
      `Message               : ${message}`,
      `Element               : ${flow}/processors/${at} @ ${file}:${file}.xml:${18 + at * 6} (${name})`,
      `Element DSL           : ${dsl}`,
      `Error type            : ${type}`,
      `FlowStack             : at ${flow}(${flow}/processors/${at} @ ${file}:${file}.xml:${18 + at * 6} (${name}))`,
      '  (set debug level logging or -Dmule.verbose.exceptions=true for everything)',
      STARS,
    ].join('\n'),
    'org.mule.runtime.core.internal.exception.OnErrorPropagateHandler',
  )

const fail = (error, ms, extra = {}) => ({ ok: false, ms, errorType: error.type, log: [info(`Starting ${error.flow}`), muleError(error)], ...extra })
const missing = (props, names) => names.filter((n) => !String(props[n] ?? '').trim())
const needs =
  (...names) =>
  ({ props }) => {
    const gone = missing(props, names)
    return gone.length ? `Couldn't find configuration property value for key \${${gone[0]}} from properties provider "Environment properties"` : null
  }

const MINUTE = 60000
const fixed = (flow, value, unit = 'minutes', extra = {}) => ({ flow, type: 'fixed', value, unit, enabled: true, ...extra })
const cron = (flow, value, tz = 'UTC', extra = {}) => ({ flow, type: 'cron', value, tz, enabled: true, ...extra })

const example = (body) => {
  const json = body?.['application/json'] ?? body // with a default mediaType the body holds the type itself
  const value = json?.example ?? Object.values(json?.examples ?? {})[0]
  return typeof value === 'string' ? value.trim() : value === undefined ? '' : JSON.stringify(value, null, 2)
}

// Finds the resource and method of a RAML spec for a request, the way the APIkit router does
export function routeOf(raml, method, path) {
  const resources = parseRaml(raml).model?.resources ?? []
  const parts = path.split('?')[0].split('/').filter(Boolean)
  const found = resources.filter((r) => {
    const want = r.path.split('/').filter(Boolean)
    return want.length === parts.length && want.every((w, i) => w.startsWith('{') || w === parts[i])
  })
  // a fixed segment wins over a URI parameter
  const resource = found.sort((a, b) => a.path.split('{').length - b.path.split('{').length)[0]
  if (!resource) return { status: 404, error: 'APIKIT:NOT_FOUND' }
  const op = resource.methods[method.toLowerCase()]
  if (op === undefined) return { status: 405, error: 'APIKIT:METHOD_NOT_ALLOWED', resource }
  const codes = Object.keys(op?.responses ?? {})
  const code = codes.find((c) => c.startsWith('2')) ?? '200'
  return { status: Number(code), resource, op, body: example(op?.responses?.[code]?.body), flow: `${method.toLowerCase()}:${resource.path.replace(/\//g, '\\').replace(/\{(\w+)\}/g, '($1)')}` }
}

// a small record, so a POST to an API built from your RAML can be checked against the body it declares
export function badBody(op, body) {
  if (!op?.body) return null
  if (!body?.trim()) return 'The request body is empty'
  try {
    JSON.parse(body)
    return null
  } catch {
    return 'The request body is not valid JSON'
  }
}

// An application scaffolded from a RAML specification in Studio
export const API_PACKAGE = {
  id: 'api',
  note: 'An APIkit application made from your specification.',
  boot: needs('db.host'),
  handle({ app, props }, req) {
    const route = routeOf(app.raml, req.method, req.path)
    if (route.error) return { status: route.status, ms: 12, error: route.error, flow: `${app.project}-main`, body: JSON.stringify({ message: route.status === 404 ? 'Resource not found' : 'Method not allowed' }) }
    const wrong = badBody(route.op, req.body)
    if (wrong) return { status: 400, ms: 15, error: 'APIKIT:BAD_REQUEST', flow: route.flow, body: JSON.stringify({ message: 'Bad request' }) }
    if (props['db.host'] !== 'orders-db.harbor.lab') {
      const error = { message: `Cannot get connection for URL jdbc:sqlserver://${props['db.host']}:1433: The TCP/IP connection to the host has failed.`, type: 'DB:CONNECTIVITY', flow: route.flow, file: app.project, at: 1, name: 'Select orders', dsl: '<db:select doc:name="Select orders" config-ref="Database_Config">' }
      return { status: 500, ms: 10020, error: error.type, flow: route.flow, log: [muleError(error)], body: JSON.stringify({ message: 'Internal server error' }) }
    }
    const last = req.path.split('?')[0].split('/').filter(Boolean).at(-1)
    if (route.resource.path.endsWith('}') && req.method === 'GET' && /^(999|unknown|0)$/.test(last)) return { status: 404, ms: 40, error: 'ORDERS:NOT_FOUND', flow: route.flow, body: JSON.stringify({ message: 'Not found' }) }
    return { status: route.status, ms: 85, flow: route.flow, log: [info(`${req.method} ${req.path} answered ${route.status}`)], body: route.body }
  },
}

const FULL = { total: 500, bad: 7 }

export const PACKAGES = {
  api: API_PACKAGE,

  'orders-nightly-load': {
    note: 'Copies the orders of the day from SQL Server to the warehouse every night.',
    boot: needs('db.host', 'db.port', 'db.user', 'db.password'),
    schedules: [cron('nightly-load-flow', '0 0 2 * * ?')],
    run: {
      'nightly-load-flow': ({ props }) => {
        const at = { flow: 'nightly-load-flow', file: 'nightly-load', at: 1, name: 'Select orders', dsl: '<db:select doc:name="Select orders" config-ref="SqlServer_Config">' }
        if (props['db.host'] !== 'sql01.harbor.lab' || props['db.port'] !== '1433')
          return fail({ ...at, type: 'DB:CONNECTIVITY', message: `The TCP/IP connection to the host ${props['db.host']}, port ${props['db.port']} has failed. Error: "Connection refused. Verify the connection properties. Make sure that an instance of SQL Server is running on the host and accepting TCP/IP connections at the port."` }, 10400)
        if (props['db.password'] !== 'Nightly-2026') return fail({ ...at, type: 'DB:CONNECTIVITY', message: `Login failed for user '${props['db.user']}'.` }, 900)
        return { ok: true, ms: 42000, log: [info('Starting nightly-load-flow'), info('Read 1250 orders from SQL Server'), info('Loaded 1250 orders into the warehouse. Job finished.')] }
      },
    },
  },

  'stock-file-poll': {
    note: 'Reads stock files from SFTP every 15 minutes.',
    boot: needs('sftp.host', 'sftp.password'),
    schedules: [fixed('stock-file-flow', 15)],
    run: { 'stock-file-flow': () => ({ ok: true, ms: 6000, log: [info('Starting stock-file-flow'), info('Picked up 1 file from /outbound/stock. Moved to /archive.'), info('Job finished.')] }) },
  },

  'price-sync': {
    note: 'Recalculates prices. disallowConcurrentExecution is true on its scheduler.',
    boot: needs('pricing.url'),
    schedules: [fixed('price-sync-flow', 10, 'minutes', { noOverlap: true })],
    run: { 'price-sync-flow': ({ app }) => ({ ok: true, ms: (app.vCores >= 1 ? 7 : 14) * MINUTE, log: [info('Starting price-sync-flow'), info(`Recalculated 48000 prices in ${app.vCores >= 1 ? 7 : 14} minutes. Job finished.`)] }) },
  },

  'invoice-batch': {
    note: 'A batch job: loads invoices from a CSV file, 100 records per block.',
    boot: needs('batch.maxFailedRecords', 'reject.queue'),
    schedules: [cron('invoice-batch-flow', '0 30 1 * * ?')],
    run: {
      'invoice-batch-flow': ({ props }) => {
        const max = Number(props['batch.maxFailedRecords'])
        const logger = 'com.mulesoft.mule.runtime.module.batch.engine.DefaultBatchEngine'
        const open = [info('Starting invoice-batch-flow'), info(`Created instance 'a91f' for batch job 'invoice-batch'`, logger), info(`Starting loading phase for instance 'a91f' of job 'invoice-batch'`, logger), info(`Finished loading phase for instance a91f of job invoice-batch. ${FULL.total} records were loaded`, logger)]
        const found = line('ERROR', `Found error processing record on step 'upsert-invoice' for job instance 'a91f' of job 'invoice-batch'.\nThis is the first record to show this exception on this step for this job instance. Subsequent records with the same failures will not be logged for performance and log readability reasons:\nError type            : EXPRESSION\nMessage               : "Cannot coerce String (12/13/2026) to Date, caused by: Text '12/13/2026' could not be parsed"`, 'com.mulesoft.mule.runtime.module.batch.internal.engine.threading.BatchRecordWork')
        if (max !== -1 && max < FULL.bad)
          return {
            ok: false,
            ms: 5200,
            errorType: 'EXPRESSION',
            log: [...open, found, warn(`instance 'a91f' of job 'invoice-batch' has reached the max allowed number of failed records. Record will be added to failed list and the instance will be removed from execution pool.`, logger), info(`Finished execution for instance 'a91f' of job 'invoice-batch'. Total Records processed: 100. Successful records: 98. Failed Records: 2`, logger)],
            batch: { total: FULL.total, processed: 100, ok: 98, failed: 2 },
          }
        return {
          ok: true,
          ms: 21000,
          errors: FULL.bad,
          log: [...open, found, info(`Finished execution for instance 'a91f' of job 'invoice-batch'. Total Records processed: 500. Successful records: 493. Failed Records: 7`, logger)],
          batch: { total: FULL.total, processed: 500, ok: 493, failed: 7 },
          send: { queue: props['reject.queue'], bodies: Array.from({ length: FULL.bad }, (_, i) => JSON.stringify({ invoice: `INV-${410 + i * 13}`, dueDate: `${12}/${13 + i}/2026`, error: 'Cannot coerce String to Date' })) },
        }
      },
    },
  },

  'vendor-sftp-upload': {
    note: 'Sends purchase orders to a vendor over SFTP every hour.',
    boot: needs('sftp.host', 'sftp.user', 'sftp.password'),
    schedules: [cron('vendor-upload-flow', '0 0 * * * ?')],
    run: {
      'vendor-upload-flow': ({ props }) =>
        props['sftp.password'] === 'Vendor-New-11'
          ? { ok: true, ms: 8000, log: [info('Starting vendor-upload-flow'), info('Wrote PO_20261103.csv to /inbound. Job finished.')] }
          : fail({ flow: 'vendor-upload-flow', file: 'vendor-upload', at: 2, name: 'Write file', dsl: '<sftp:write doc:name="Write file" config-ref="SFTP_Config" path="/inbound">', type: 'SFTP:INVALID_CREDENTIALS', message: `Error during login to ${props['sftp.user']}@${props['sftp.host']}: Authentication failed for user ${props['sftp.user']}` }, 1200),
    },
  },

  'customer-export': {
    note: 'Writes a customer file to Azure Blob storage every night.',
    boot: needs('blob.account', 'blob.container'),
    schedules: [cron('customer-export-flow', '0 0 3 * * ?')],
    run: {
      'customer-export-flow': ({ props }) =>
        props['blob.container'] === 'customer-export'
          ? { ok: true, ms: 15000, log: [info('Starting customer-export-flow'), info(`Uploaded customers_20261104.json to container ${props['blob.container']}. Job finished.`)] }
          : fail({ flow: 'customer-export-flow', file: 'customer-export', at: 3, name: 'Upload blob', dsl: '<http:request method="PUT" doc:name="Upload blob" config-ref="Blob_Config">', type: 'HTTP:NOT_FOUND', message: `HTTP PUT on resource 'https://${props['blob.account']}.blob.lab/${props['blob.container']}/customers.json' failed: not found (404). ContainerNotFound: The specified container does not exist.` }, 2300),
    },
  },

  'order-events-consumer': {
    note: 'Takes orders from a queue and sends them to the ERP. The replay flow moves the dead letters back to the queue.',
    boot: needs('erp.baseUrl', 'queue.name', 'dlq.name'),
    schedules: [fixed('replay-dlq-flow', 1, 'days', { enabled: false })],
    consumes: 'queue.name',
    consume: ({ props }, message) =>
      props['erp.baseUrl'] === 'https://erp.harbor.lab/v2'
        ? { ok: true, log: [info(`Order ${message.body.match(/O-\d+/)?.[0]} created in the ERP`)] }
        : { ok: false, errorType: 'HTTP:NOT_FOUND', error: { flow: 'order-events-flow', file: 'order-events', at: 2, name: 'Create ERP order', dsl: '<http:request method="POST" doc:name="Create ERP order" config-ref="ERP_Config" path="/orders">', type: 'HTTP:NOT_FOUND', message: `HTTP POST on resource '${props['erp.baseUrl']}/orders' failed: not found (404). Version v1 was retired, use v2.` } },
    run: {
      'replay-dlq-flow': ({ props }) => ({ ok: true, ms: 3000, log: [info('Starting replay-dlq-flow'), info(`Moved the messages of ${props['dlq.name']} back to ${props['queue.name']}`)], move: { from: props['dlq.name'], to: props['queue.name'] } }),
    },
  },

  'catalog-file-load': {
    note: 'Loads a 1.4 GB catalogue file from Azure File Share every night.',
    boot: needs('file.path', 'read.strategy'),
    schedules: [cron('catalog-load-flow', '0 15 4 * * ?')],
    run: {
      'catalog-load-flow': ({ props, app }) => {
        const heap = { 0.1: 480, 0.2: 1024, 0.5: 1331, 1: 2048 }[app.vCores] ?? 4096
        if (props['read.strategy'] === 'streaming') return { ok: true, ms: 190000, heap: 61, log: [info('Starting catalog-load-flow'), info('Loaded 2100000 rows with a repeatable file store stream. Job finished.')] }
        if (heap > 1800) return { ok: true, ms: 160000, heap: 88, log: [info('Starting catalog-load-flow'), info('Loaded 2100000 rows. Job finished.')] }
        return {
          ok: false,
          ms: 64000,
          heap: 100,
          errorType: 'MULE:UNKNOWN',
          restart: true,
          log: [info('Starting catalog-load-flow'), warn('Memory pool G1 Old Gen is at 97 percent after GC', 'com.mulesoft.agent.services.gc'), line('ERROR', `Exception in thread "[MuleRuntime].uber.11: [catalog-file-load].catalog-load-flow" java.lang.OutOfMemoryError: Java heap space\n\tat java.base/java.util.Arrays.copyOf(Arrays.java:3537)\n\tat org.mule.weave.v2.module.reader.SourceReader.readAll`, 'java.lang.Thread')],
        }
      },
    },
  },

  'store-report': {
    note: 'Emails the store report. The business day starts at 06:00 in Kolkata.',
    boot: needs('smtp.host'),
    schedules: [cron('store-report-flow', '0 0 6 * * ?')],
    run: { 'store-report-flow': () => ({ ok: true, ms: 9000, log: [info('Starting store-report-flow'), info('Report sent to 14 recipients. Job finished.')] }) },
  },

  'shipments-eapi': {
    note: 'An API that reads shipments from a partner system.',
    boot: needs('partner.url'),
    handle({ props }, req) {
      if (!/^\/api\/shipments(\/\w+)?$/.test(`/api${req.path}`.split('?')[0])) return { status: 404, ms: 10, error: 'APIKIT:NOT_FOUND', flow: 'shipments-main', body: '{"message":"Resource not found"}' }
      if (props['partner.url'] !== 'https://partner.harbor.lab/shipments') {
        const error = { flow: 'get:\\shipments', file: 'shipments-eapi', at: 1, name: 'Call partner', dsl: '<http:request method="GET" doc:name="Call partner" config-ref="Partner_Config">', type: 'HTTP:CONNECTIVITY', message: `HTTP GET on resource '${props['partner.url']}' failed: Connection refused.` }
        return { status: 500, ms: 3100, error: error.type, flow: error.flow, log: [muleError(error)], body: '{"message":"Internal server error"}' }
      }
      return { status: 200, ms: 140, flow: 'get:\\shipments', body: '[{"id":"S-1","status":"IN_TRANSIT"}]' }
    },
  },

  'search-eapi': {
    note: 'A product search API that uses a lot of CPU per request.',
    boot: needs('index.name'),
    cpu: 1,
    handle({ app, perMinute }) {
      const load = perMinute / (app.replicas * app.vCores * 60)
      const ms = Math.round(load <= 1 ? 180 : 180 + (load - 1) * 1400)
      return { status: 200, ms, flow: 'get:\\search', body: '[{"sku":"H-100"}]' }
    },
  },
}

export const packageOf = (id) => PACKAGES[id]
