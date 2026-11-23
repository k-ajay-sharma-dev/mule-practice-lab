// What each processor does to the message, and the event each source starts a flow with.
// A behaviour gets { node, c (its settings), event (a copy the behaviour may change), run, flow, label } and returns
// { event, text } where text says in one line what happened, for the trace.
import { COMPONENTS } from '../flow/catalog.js'
import { read, render } from './dw/index.js'
import { MuleError, SimUnsupported, SqlError } from './errors.js'
import { matchPath, reasonPhrase, statusErrorType } from './http.js'
import { schemaProblems } from './schema.js'
import { runSql, tableNamesIn } from './sql.js'
import { brief, copy, isObject } from './values.js'

const BASE_URL = 'http://localhost:8081'

// ---------- sources ----------

let messageCounter = 0
const correlation = () => `c0ffee00-${String(++messageCounter).padStart(4, '0')}`

export function sourceEvent(source, t, run) {
  const vars = {}
  const corr = t.correlationId ?? t.headers?.['x-correlation-id'] ?? correlation()
  switch (t.kind) {
    case 'http': {
      const method = String(t.method ?? 'GET').toUpperCase()
      const body = t.body
      const payload = copy(body)
      return {
        payload,
        // the bytes as sent (rawBody when the test gives them), for payload.^raw and signature checks
        raw: body !== undefined && typeof body !== 'string' ? { of: payload, text: t.rawBody ?? JSON.stringify(body) } : undefined,
        mime: body === undefined ? 'application/java' : typeof body === 'string' ? t.mime ?? 'text/plain' : t.mime ?? 'application/json',
        attributes: {
          method,
          requestPath: String(t.path).split('?')[0],
          rawRequestPath: t.path,
          listenerPath: source.config?.path,
          relativePath: String(t.path).split('?')[0],
          queryParams: t.queryParams ?? {},
          uriParams: t.uriParams ?? {},
          headers: Object.fromEntries(Object.entries({ 'content-type': 'application/json', ...(t.headers ?? {}) }).map(([k, v]) => [k.toLowerCase(), v])),
          remoteAddress: '/10.0.4.21:51234',
          scheme: 'http',
          version: 'HTTP/1.1',
        },
        vars,
        correlationId: corr,
        authentication: t.authentication ? copy(t.authentication) : undefined,
      }
    }
    case 'schedule':
      return { payload: null, mime: 'application/java', attributes: {}, vars, correlationId: corr }
    case 'file': {
      const name = String(t.path ?? '').split('/').pop()
      const content = t.content ?? run.files[t.path]
      // Mule reads the file when the flow first touches it, so a malformed file fails inside the flow (where its
      // error handler can move it), not before the flow starts: here it stays text the flow cannot read as data
      let payload
      try {
        payload = parseContent(content, mimeFor(t.path, t.mime))
      } catch (e) {
        if (!(e instanceof MuleError)) throw e
        payload = content
      }
      return {
        payload,
        raw: typeof content === 'string' && payload !== null && typeof payload === 'object' ? { of: payload, text: content } : undefined,
        mime: mimeFor(t.path, t.mime),
        attributes: { fileName: name, path: t.path, directory: String(t.path).replace(/\/[^/]*$/, ''), size: String(typeof content === 'string' ? content : JSON.stringify(content ?? '')).length, timestamp: '2026-11-13T09:58:00Z' },
        vars,
        correlationId: corr,
      }
    }
    case 'mq':
    case 'jms':
    case 'vm':
    case 'kafka':
    case 'sqs': {
      const id = t.messageId ?? `msg-${String(++messageCounter).padStart(4, '0')}`
      const attrs = {
        mq: { messageId: id, ackToken: `ack-${id}`, deliveryCount: t.deliveryCount ?? 1, destination: t.destination, properties: t.properties ?? {}, headers: { messageId: id } },
        jms: { headers: { messageId: `ID:${id}`, destination: t.destination, redelivered: (t.deliveryCount ?? 1) > 1, correlationId: corr }, properties: { userProperties: t.properties ?? {}, jmsxProperties: { JMSXDeliveryCount: t.deliveryCount ?? 1 } }, ackId: `ack-${id}` },
        vm: { queueName: t.destination, timestamp: '2026-11-13T10:00:00Z' },
        kafka: { topic: t.destination, partition: t.partition ?? 0, offset: t.offset ?? 1042, key: t.key ?? null, headers: t.properties ?? {}, consumerCommitKey: `commit-${id}` },
        sqs: { messageId: id, receiptHandle: `rh-${id}`, messageAttributes: t.properties ?? {} },
      }[t.kind]
      const payload = copy(t.payload)
      const raw = payload !== null && typeof payload === 'object' ? { of: payload, text: t.raw ?? JSON.stringify(t.payload) } : undefined
      return { payload, raw, mime: t.mime ?? (typeof t.payload === 'string' ? 'text/plain' : 'application/json'), attributes: attrs, vars, correlationId: t.correlationId ?? corr }
    }
    default:
      return { payload: copy(t.payload ?? null), mime: t.mime ?? 'application/json', attributes: copy(t.attributes ?? {}), vars, correlationId: corr }
  }
}

// ---------- content and mime types ----------

export function mimeFor(path, given) {
  if (given && given !== '(auto)') return given
  const ext = String(path ?? '').split('.').pop().toLowerCase()
  return { json: 'application/json', csv: 'application/csv', xml: 'application/xml', txt: 'text/plain' }[ext] ?? 'text/plain'
}

// A file's text read the way Mule would read it with that mime type. Values a scenario gives as objects stay as they are.
export function parseContent(content, mime) {
  if (typeof content !== 'string') return copy(content)
  if (mime === 'application/json') {
    try {
      return JSON.parse(content)
    } catch {
      throw new MuleError('MULE:EXPRESSION', 'Unexpected character in the JSON content.')
    }
  }
  if (mime === 'application/csv') {
    const lines = content.split(/\r?\n/).filter((l) => l.trim())
    if (!lines.length) return []
    const head = lines[0].split(',').map((h) => h.trim())
    return lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i] ?? `column_${i}`, v.trim()])))
  }
  if (mime === 'application/xml') {
    try {
      return read(content, 'application/xml')
    } catch (e) {
      if (e instanceof SimUnsupported) throw e
      throw new MuleError('MULE:EXPRESSION', `The XML content is not well formed: ${e.message}`)
    }
  }
  return content
}

const outMime = (text) => {
  const m = String(text ?? '').match(/^#\[\s*output\s+([\w/+.-]+)/)
  return m ? m[1] : null
}
const valueMime = (value, text) => outMime(text) ?? (typeof value === 'string' ? 'text/plain' : value === null || value === undefined ? 'application/java' : 'application/java')

// The text that goes over the wire for a payload.
function wire(event) {
  if (typeof event.payload === 'string') return event.payload
  try {
    const options = event.writer && event.writer.of === event.payload ? event.writer.options : {}
    return render(event.payload, event.mime && event.mime !== 'application/java' ? event.mime : 'application/json', options)
  } catch {
    return JSON.stringify(event.payload)
  }
}

// ---------- shared helpers ----------

// A named value for :name in SQL or {name} in a path. Mule takes these from the Input Parameters and URI Parameters
// settings, which the designer does not show; the simulator looks the name up in vars, then the payload, then the
// request's URI and query parameters.
function lookup(event, name) {
  if (event.vars && name in event.vars) return event.vars[name]
  if (isObject(event.payload) && name in event.payload) return event.payload[name]
  if (event.attributes?.uriParams && name in event.attributes.uriParams) return event.attributes.uriParams[name]
  if (event.attributes?.queryParams && name in event.attributes.queryParams) return event.attributes.queryParams[name]
  // snake_case column names often take camelCase values: :order_id from orderId
  const camel = name.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())
  if (camel !== name) return lookup(event, camel)
  return undefined
}

// The values for the :name placeholders of a statement. In a bulk operation each record is looked at first.
// The values for the :names in the SQL. With Input parameters set (#[{ id: vars.orderId }]) only those are used, as
// in Mule. Without them the simulator is lenient and looks each name up in the record, vars, payload and URI/query.
function paramsFor(sql, event, record, given) {
  const names = [...String(sql).replace(/'[^']*'/g, "''").matchAll(/(?<![:\w]):([A-Za-z_]\w*)/g)].map((m) => m[1])
  const params = {}
  if (isObject(given)) {
    for (const n of names) if (given[n] !== undefined) params[n] = given[n]
    return params
  }
  for (const n of names) {
    const camel = n.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())
    let v = isObject(record) ? (record[n] ?? record[camel]) : undefined
    if (v === undefined) v = lookup(event, n)
    if (v !== undefined) params[n] = v
  }
  return params
}

// Success status codes as Mule writes them: "200..299,404,422"
function inCodes(status, codes) {
  return codes.split(',').some((part) => {
    const [a, b] = part.trim().split('..').map(Number)
    return b === undefined || Number.isNaN(b) ? status === a : status >= a && status <= b
  })
}

function systemFault(run, kind, name) {
  const s = run.scenario.systems?.[kind]
  if (!s) return null
  if (s.fault && (!s.faultOn || s.faultOn === name)) return s.fault
  return s.faults?.[name] ?? null
}

const NS = { file: 'FILE', sftp: 'SFTP', ftp: 'FTP', s3: 'S3', azure: 'AZURE-STORAGE' }

// ---------- behaviours ----------

export const BEHAVIOURS = {
  logger({ c, event, run, flow }) {
    const message = run.value(c.message ?? '#[payload]', event, flow)
    const text = typeof message === 'string' ? message : brief(message, 400)
    run.log(c.level || 'INFO', text, flow.name)
    run.tick(1)
    return { event, text: `${c.level || 'INFO'}: ${text}`, extra: { log: { level: c.level || 'INFO', message: text } } }
  },

  'set-payload'({ c, event, run, flow }) {
    const value = run.value(c.value, event, flow)
    run.tick(1)
    return { event: { ...event, payload: value, mime: valueMime(value, c.value) }, text: `Set Payload: payload is now ${brief(value)}` }
  },

  'set-variable'({ c, event, run, flow }) {
    const name = String(c.variableName || '').trim()
    if (!name) throw new MuleError('MULE:EXPRESSION', 'Set Variable has no variable name.')
    const value = run.value(c.value, event, flow)
    event.vars[name] = value
    run.tick(1)
    return { event, text: `vars.${name} = ${brief(value)}` }
  },

  transform({ c, event, run, flow }) {
    const { value, mime, options } = run.script(c.script ?? '', event, flow)
    run.tick(2)
    if (c.target === 'variable') {
      const name = String(c.variableName || '').trim() || 'result'
      event.vars[name] = value
      return { event, text: `Transform Message writes vars.${name} = ${brief(value)}` }
    }
    // the output directive's writer options (separator, header, indent...) stay with this payload until it changes
    const writer = options && Object.keys(options).length ? { of: value, options } : undefined
    return { event: { ...event, payload: value, mime, writer }, text: `Transform Message: payload is now ${brief(value)}` }
  },

  // Parse Template: the template file (systems.templates, by location or file name) with each #[...] filled in
  'parse-template'({ c, event, run, flow }) {
    const templates = run.scenario.systems?.templates ?? {}
    const location = String(c.location ?? '')
    const name = location.replace(/^.*[\\/]/, '')
    const template = templates[location] ?? templates[name] ?? run.files[location]
    run.tick(2)
    if (typeof template !== 'string') return { event, text: `Parse Template: the scenario has no template ${location}, so the payload is unchanged` }
    const text = String(run.value(template, event, flow) ?? '')
    const mime = /\.html?$/i.test(location) ? 'text/html' : 'text/plain'
    return { event: { ...event, payload: text, mime }, text: `Parse Template filled ${location}: ${brief(text)}` }
  },

  'raise-error'({ c, event, run, flow }) {
    const type = String(c.type || 'APP:ERROR').trim().toUpperCase()
    const description = run.value(c.description, event, flow)
    throw new MuleError(type.includes(':') ? type : `APP:${type}`, description ? String(description) : `An error of type ${type} was raised.`)
  },

  validation({ c, event, run, flow }) {
    const fail = (type, text) => {
      throw new MuleError(type, c.message ? String(run.value(c.message, event, flow)) : text)
    }
    // JSON module Validate schema: the payload against the schema the scenario gives (the project's schema file)
    if (c.check === 'json-schema' && !/^\s*#\[[\s\S]*(==|!=|>|<|\bis\b|\bmatches\b|\bcontains\b)/.test(String(c.expression ?? ''))) {
      const schemas = run.scenario.systems?.schemas ?? {}
      const name = String(c.expression ?? '').replace(/^.*[\\/]/, '')
      const schema = schemas[c.expression] ?? schemas[name] ?? (Object.keys(schemas).length === 1 ? Object.values(schemas)[0] : null)
      run.tick(2)
      if (!schema) return { event, text: 'Validate schema: the scenario gives no schema, so the payload is taken as valid' }
      let content = event.payload
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content)
        } catch {
          fail('JSON:SCHEMA_NOT_HONOURED', 'The payload is not valid JSON.')
        }
      }
      const problems = schemaProblems(content, schema)
      if (problems.length) {
        throw new MuleError('JSON:SCHEMA_NOT_HONOURED', c.message ? String(run.value(c.message, event, flow)) : `Input does not comply with schema: ${problems.join('; ')}`, { problems })
      }
      return { event, text: 'Validate schema: the payload honours the schema' }
    }
    const v = run.value(c.expression, event, flow)
    switch (c.check) {
      case 'is-not-null':
        if (v === null || v === undefined) fail('VALIDATION:NULL', 'The value is null.')
        break
      case 'is-not-blank-string':
        if (v === null || v === undefined || String(v).trim() === '') fail('VALIDATION:BLANK_STRING', 'The string is blank.')
        break
      case 'is-not-empty-collection':
        if (!Array.isArray(v) || !v.length) fail('VALIDATION:EMPTY_COLLECTION', 'The collection is empty.')
        break
      case 'is-email':
        if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('VALIDATION:INVALID_EMAIL', `${v} is not a valid email address.`)
        break
      case 'matches-regex':
      case 'json-schema':
        if (typeof v !== 'boolean') throw new SimUnsupported(`the ${c.check} check unless its expression returns true or false`)
        if (!v) fail(c.check === 'json-schema' ? 'JSON:SCHEMA_NOT_HONOURED' : 'VALIDATION:MISMATCH', 'The value does not match.')
        break
      default:
        if (v !== true && v !== 'true') fail('VALIDATION:INVALID_BOOLEAN', 'The condition is false.')
    }
    run.tick(1)
    return { event, text: 'Validation passed' }
  },

  idempotent({ c, event, run, flow }) {
    const id = String(run.value(c.idExpression || '#[correlationId]', event, flow))
    const store = (run.stores[c.objectStore || '_idempotent'] ??= {})
    if (id in store) throw new MuleError('MULE:DUPLICATE_MESSAGE', `Duplicated message: ${id}`)
    store[id] = true
    run.tick(2)
    return { event, text: `Idempotent Message Validator: ${id} is new, so the message goes on` }
  },

  'os-store'({ c, event, run, flow }) {
    const key = String(run.value(c.key, event, flow))
    const value = run.value(c.value || '#[payload]', event, flow)
    ;(run.stores[c.objectStore || '_default'] ??= {})[key] = copy(value)
    run.tick(2)
    return { event, text: `Object Store ${c.objectStore || '(default)'}: stored ${key}` }
  },

  'os-retrieve'({ c, event, run, flow }) {
    const key = String(run.value(c.key, event, flow))
    const store = run.stores[c.objectStore || '_default'] ?? {}
    run.tick(2)
    if (key in store) return { event: { ...event, payload: copy(store[key]), mime: 'application/java' }, text: `Object Store: found ${key}` }
    if (c.defaultValue !== undefined && c.defaultValue !== '') {
      const v = run.value(c.defaultValue, event, flow)
      return { event: { ...event, payload: v, mime: 'application/java' }, text: `Object Store: no ${key}, so the default value is used` }
    }
    throw new MuleError('OS:KEY_NOT_FOUND', `The key '${key}' does not exist in the object store.`)
  },

  'os-remove'({ c, event, run, flow }) {
    const key = String(run.value(c.key, event, flow))
    const store = run.stores[c.objectStore || '_default'] ?? {}
    if (!(key in store)) throw new MuleError('OS:KEY_NOT_FOUND', `The key '${key}' does not exist in the object store.`)
    delete store[key]
    run.tick(2)
    return { event, text: `Object Store: removed ${key}` }
  },

  'http-request'({ c, event, run, flow }) {
    const method = String(c.method || 'GET').toUpperCase()
    let path = String(run.value(c.path || '/', event, flow) ?? '/')
    path = path.replace(/\{(\w+)\}/g, (all, name) => {
      const v = lookup(event, name)
      return v === undefined ? all : encodeURIComponent(String(v))
    })
    const url = `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
    const sendsBody = !['GET', 'DELETE'].includes(method)
    const request = { method, path, body: sendsBody ? copy(event.payload) : undefined, headers: { 'x-correlation-id': event.correlationId } }
    const endpoints = run.scenario.systems?.http ?? []
    const ep = endpoints.find((e) => (!e.method || e.method.toUpperCase() === method) && matchPath(e.path, path))
    const key = ep ? `${ep.method || '*'} ${ep.path}` : `${method} ${path}`
    const n = (run.httpCalls[key] = (run.httpCalls[key] ?? 0) + 1)
    let answer
    if (!ep) {
      const samePath = endpoints.find((e) => matchPath(e.path, path))
      answer = samePath ? { status: 405, body: { message: `Method ${method} is not allowed` } } : { status: 404, body: { message: `Not found: ${path}` } }
    } else {
      const list = Array.isArray(ep.responses) ? ep.responses : null
      const r = list ? list[Math.min(n - 1, list.length - 1)] : typeof ep.respond === 'function' ? ep.respond({ ...request, params: matchPath(ep.path, path) }) : (ep.respond ?? { status: 200, body: null })
      answer = { latencyMs: ep.latencyMs ?? 80, ...r }
    }
    const timeout = Number(c.responseTimeout) > 0 ? Number(c.responseTimeout) : 10000
    const latency = answer.latencyMs ?? 80
    run.effects.http.push({ method, path, body: request.body, status: answer.fault ? answer.fault : latency > timeout ? 'TIMEOUT' : answer.status, t: run.t })
    if (answer.fault === 'CONNECTIVITY') {
      run.tick(Math.min(latency, 50))
      throw new MuleError('HTTP:CONNECTIVITY', `HTTP ${method} on resource '${url}' failed: Connection refused.`)
    }
    if (latency > timeout) {
      run.tick(timeout)
      throw new MuleError('HTTP:TIMEOUT', `HTTP ${method} on resource '${url}' failed: Timeout exceeded (${timeout} ms).`)
    }
    run.tick(latency)
    const status = answer.status ?? 200
    const body = copy(answer.body ?? null)
    const headers = answer.headers ?? { 'content-type': 'application/json' }
    const codes = String(c.successStatusCodes ?? '').trim()
    if (codes ? !inCodes(status, codes) : status >= 400) {
      // a status outside the success codes is an error; a 2xx or 3xx one is HTTP:RESPONSE_VALIDATION as in Mule
      const type = status >= 400 ? statusErrorType(status) : 'HTTP:RESPONSE_VALIDATION'
      throw new MuleError(type, `HTTP ${method} on resource '${url}' failed: ${reasonPhrase(status).toLowerCase() || 'error'} (${status}).`, {
        errorMessage: { payload: body, attributes: { statusCode: status, reasonPhrase: reasonPhrase(status), headers } },
      })
    }
    // the request's answer replaces the payload and the attributes: the incoming request's attributes are gone now
    return {
      event: { ...event, payload: body, mime: typeof body === 'string' ? 'text/plain' : 'application/json', attributes: { statusCode: status, reasonPhrase: reasonPhrase(status), headers } },
      text: `${method} ${path} answered ${status} in ${latency} ms`,
    }
  },

  ...Object.fromEntries(['db-select', 'db-insert', 'db-update', 'db-delete', 'db-stored-procedure'].map((type) => [type, dbOp])),
  'db-bulk-insert': dbBulk,
  'db-bulk-update': dbBulk,

  'email-send'({ c, event, run, flow }) {
    const fault = systemFault(run, 'email', 'send')
    if (fault) throw new MuleError('EMAIL:CONNECTIVITY', 'Could not connect to the mail server.')
    const mail = {
      to: String(run.value(c.toAddresses, event, flow) ?? ''),
      subject: String(run.value(c.subject, event, flow) ?? ''),
      content: run.value(c.content || '#[payload]', event, flow),
      contentType: c.contentType || 'text/plain',
      attachments: c.attachments ? run.value(c.attachments, event, flow) : undefined,
    }
    run.effects.emails.push(mail)
    run.tick(150)
    return { event, text: `Email "${mail.subject}" sent to ${mail.to}` }
  },
}

// An SQL failure becomes DB:QUERY_EXECUTION with the text the database itself would give, so a handler that looks
// for ORA-00001 or "duplicate key" in error.description matches as it would in Mule.
function sqlFailure(e, c) {
  if (!(e instanceof SqlError)) return e
  const msg = e.message
  const dup = msg.match(/^Duplicate key: table "([^"]+)"/)
  const vendor = String(c.database ?? '')
  if (dup) {
    const t = dup[1]
    const text = /oracle/i.test(vendor)
      ? `ORA-00001: unique constraint (${t.toUpperCase()}_PK) violated`
      : /sql server|mssql/i.test(vendor)
        ? `Violation of PRIMARY KEY constraint 'PK_${t}'. Cannot insert duplicate key in object 'dbo.${t}'.`
        : /mysql/i.test(vendor)
          ? `Duplicate entry for key '${t}.PRIMARY'`
          : `ERROR: duplicate key value violates unique constraint "${t}_pkey"`
    return new MuleError('DB:QUERY_EXECUTION', `${text} (${msg})`)
  }
  return new MuleError('DB:QUERY_EXECUTION', msg)
}

function runSqlAsMule(sql, params, db, c) {
  try {
    return runSql(sql, params, db)
  } catch (e) {
    throw sqlFailure(e, c)
  }
}

// A database result replaces the payload, unless the operation has a Target variable: then it goes into that
// variable and the payload and attributes stay as they were.
function dbResult(event, c, payload, text) {
  const target = String(c.target ?? '').trim()
  if (target) return { event: { ...event, vars: { ...event.vars, [target]: payload } }, text: `${text}, kept in vars.${target}` }
  return { event: { ...event, payload, mime: 'application/java', attributes: {} }, text }
}

// systems.db.failWhen: [{ match: 'DELETE FROM holds', fault: 'QUERY_EXECUTION' | 'CONNECTIVITY', description }]
// makes the statements whose SQL contains `match` fail while the others work.
function statementFault(run, sql) {
  for (const f of run.scenario.systems?.db?.failWhen ?? []) {
    if (!String(sql).toLowerCase().includes(String(f.match ?? '').toLowerCase())) continue
    const kind = String(f.fault ?? 'QUERY_EXECUTION').replace(/^DB:/, '')
    throw new MuleError(`DB:${kind}`, f.description ?? (kind === 'CONNECTIVITY' ? 'The connection to the database was lost.' : `The statement failed: ${sql.slice(0, 60)}`))
  }
}

// Oracle reports an unquoted column name or alias in upper case, so a row from Oracle has keys like CUST_ID.
// A quoted alias ("custId") keeps its case. The step's database setting or systems.db.vendor names the vendor.
function isOracle(c, run) {
  return /oracle/i.test(String(c.database ?? '')) || /oracle/i.test(String(run.scenario.systems?.db?.vendor ?? ''))
}

function oracleKeys(row, sql) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const out = {}
  for (const [k, v] of Object.entries(row)) out[sql.includes(`"${k}"`) ? k : k.toUpperCase()] = v
  return out
}

function dbOp({ node, c, event, run, flow }) {
  const fault = systemFault(run, 'db', 'connect')
  if (fault) throw new MuleError('DB:CONNECTIVITY', 'Could not get a connection from the pool: the database does not answer.')
  const sql = String(c.sql ?? '')
  const given = String(c.inputParameters ?? '').trim() ? run.value(c.inputParameters, event, flow) : undefined
  const params = paramsFor(sql, event, undefined, given)
  // recorded before it runs, so a transaction knows the database was the first resource it touched
  const effect = { type: node.type, sql, params, tables: tableNamesIn(sql), t: run.t }
  run.effects.db.push(effect)
  statementFault(run, sql)
  const out = runSqlAsMule(sql, params, run.db, c)
  effect.result = out.kind === 'select' ? `${out.rows.length} rows` : out.affectedRows
  run.tick(run.scenario.systems?.db?.latencyMs ?? 8)
  if (out.kind === 'select') {
    let rows = c.maxRows ? out.rows.slice(0, Number(c.maxRows)) : out.rows
    if (isOracle(c, run)) rows = rows.map((r) => oracleKeys(r, sql))
    return dbResult(event, c, rows, `${COMPONENTS[node.type].label}: ${rows.length} row(s) from ${tableNamesIn(sql).join(', ')}`)
  }
  if (out.kind === 'procedure') return dbResult(event, c, copy(out.result ?? {}), 'Stored procedure ran')
  const payload = { affectedRows: out.affectedRows, generatedKeys: out.generatedKeys ?? {} }
  return dbResult(event, c, payload, `${COMPONENTS[node.type].label}: ${out.affectedRows} row(s) in ${tableNamesIn(sql).join(', ')}`)
}

function dbBulk({ node, c, event, run, flow }) {
  const fault = systemFault(run, 'db', 'connect')
  if (fault) throw new MuleError('DB:CONNECTIVITY', 'Could not get a connection from the pool: the database does not answer.')
  const items = Array.isArray(event.payload) ? event.payload : null
  if (!items) throw new MuleError('DB:BAD_SQL_SYNTAX', 'Bulk operations need a list of records as the payload.')
  const sql = String(c.sql ?? '')
  const effect = { type: node.type, sql, params: { records: items.length }, tables: tableNamesIn(sql), t: run.t }
  run.effects.db.push(effect)
  statementFault(run, sql)
  const counts = items.map((item) => runSqlAsMule(sql, paramsFor(sql, event, item), run.db, c).affectedRows ?? 0)
  effect.result = counts.reduce((a, b) => a + b, 0)
  run.tick(run.scenario.systems?.db?.latencyMs ?? 15)
  return dbResult(event, c, counts, `${COMPONENTS[node.type].label}: ${items.length} record(s), ${counts.reduce((a, b) => a + b, 0)} row(s) changed`)
}

// ---------- messaging ----------

const PUBLISH = {
  'mq-publish': ['mq', 'destination', 'ANYPOINT-MQ'],
  'vm-publish': ['vm', 'queueName', 'VM'],
  'jms-publish': ['jms', 'destination', 'JMS'],
  'kafka-publish': ['kafka', 'topic', 'KAFKA'],
  'sqs-send': ['sqs', 'queueUrl', 'SQS'],
}
for (const [type, [kind, field, ns]] of Object.entries(PUBLISH)) {
  BEHAVIOURS[type] = ({ c, event, run, flow }) => {
    const destination = String(run.value(c[field], event, flow) ?? '')
    const q = run.scenario.systems?.queues?.[destination]
    if (q?.fault) throw new MuleError(`${ns}:CONNECTIVITY`, `Could not publish to ${destination}: the broker does not answer.`)
    const msg = {
      kind,
      destination,
      payload: copy(type === 'sqs-send' && c.body ? run.value(c.body, event, flow) : event.payload),
      mime: event.mime,
      properties: {},
      key: c.key ? run.value(c.key, event, flow) : undefined,
      topic: type === 'jms-publish' && c.destinationType === 'TOPIC',
    }
    run.effects.sent.push({ ...msg, t: run.t, flow: flow.name })
    run.tick(kind === 'vm' ? 1 : 20)
    // an Anypoint MQ exchange copies the message to every queue bound to it (systems.exchanges in the scenario)
    const bound = kind === 'mq' ? run.scenario.systems?.exchanges?.[destination] : null
    const targets = Array.isArray(bound) ? bound : [destination]
    const heard = targets.filter((q) => run.design.flows.some((f) => f.source && sourceListensOn(f.source, kind, q)))
    for (const q of heard) run.pending.push({ ...msg, destination: q, payload: copy(msg.payload) })
    const listened = heard.length > 0
    const via = Array.isArray(bound) ? ` (the exchange copies it to ${bound.join(', ')})` : ''
    return { event, text: `Message published to ${destination}${via}${listened ? ' (a flow of this design will receive it)' : ''}` }
  }
}

const LISTEN_FIELD = { 'vm-listener': ['vm', 'queueName'], 'mq-subscriber': ['mq', 'destination'], 'jms-listener': ['jms', 'destination'], 'kafka-listener': ['kafka', 'topic'], 'kafka-batch-listener': ['kafka', 'topic'], 'sqs-receive': ['sqs', 'queueUrl'] }
function sourceListensOn(source, kind, destination) {
  const k = LISTEN_FIELD[source.type]
  return k && k[0] === kind && String(source.config?.[k[1]] ?? '').toLowerCase() === destination.toLowerCase()
}

for (const [type, op] of [['mq-ack', 'ack'], ['mq-nack', 'nack'], ['jms-ack', 'ack'], ['jms-recover-session', 'nack'], ['kafka-commit', 'ack'], ['sqs-delete', 'ack']]) {
  BEHAVIOURS[type] = ({ event, run }) => {
    run.effects.acks.push({ op, by: type, t: run.t })
    run.tick(5)
    return { event, text: op === 'ack' ? 'The message is acknowledged: the broker removes it' : 'The message is returned to the broker for redelivery' }
  }
}

// ---------- files ----------

// A file's attributes as the File, FTP and SFTP connectors give them. The time a file was last changed comes from
// systems.fileTimes in the scenario, or the moment the flow wrote it; files the scenario lists without a time were
// last changed an hour before the run starts.
const SIM_START = Date.parse('2026-11-13T10:00:00Z')
function fileAttributes(run, p) {
  const changed = run.scenario.systems?.fileTimes?.[p] ?? run.fileTimes?.[p] ?? new Date(SIM_START - 3600000).toISOString()
  const at = String(changed).replace(/Z$/, '')
  return { fileName: p.split('/').pop(), path: p, size: wireText(run.files[p]).length, timestamp: at, lastModifiedTime: at, creationTime: at, directory: false, regularFile: true }
}
const wireText = (v) => (typeof v === 'string' ? v : v instanceof Uint8Array ? String.fromCharCode(...v) : JSON.stringify(v ?? ''))

for (const prefix of ['file', 'sftp', 'ftp']) {
  const ns = NS[prefix]
  BEHAVIOURS[`${prefix}-read`] = ({ c, event, run, flow }) => {
    const path = String(run.value(c.path, event, flow))
    if (!(path in run.files)) throw new MuleError(`${ns}:ILLEGAL_PATH`, `Path '${path}' doesn't exist`)
    const mime = mimeFor(path, c.outputMimeType)
    run.tick(prefix === 'file' ? 3 : 40)
    return { event: { ...event, payload: parseContent(run.files[path], mime), mime, attributes: fileAttributes(run, path) }, text: `Read ${path}` }
  }
  BEHAVIOURS[`${prefix}-write`] = ({ c, event, run, flow }) => {
    const path = String(run.value(c.path, event, flow))
    if (systemFault(run, 'files', prefix)) throw new MuleError(`${ns}:CONNECTIVITY`, `Could not connect to the ${prefix.toUpperCase()} server.`)
    const mode = c.mode || 'OVERWRITE'
    if (mode === 'CREATE_NEW' && path in run.files) throw new MuleError(`${ns}:FILE_ALREADY_EXISTS`, `File '${path}' already exists`)
    const text = wire(event)
    run.files[path] = mode === 'APPEND' && path in run.files ? `${run.files[path]}${text}` : text
    run.tick(prefix === 'file' ? 3 : 60)
    ;(run.fileTimes ??= {})[path] = new Date(SIM_START + run.t).toISOString()
    return { event, text: `${mode === 'APPEND' ? 'Appended to' : 'Wrote'} ${path}` }
  }
  BEHAVIOURS[`${prefix}-move`] = ({ c, event, run, flow }) => {
    const from = String(run.value(c.sourcePath, event, flow))
    let to = String(run.value(c.targetPath, event, flow))
    if (!(from in run.files)) throw new MuleError(`${ns}:ILLEGAL_PATH`, `Path '${from}' doesn't exist`)
    const name = c.renameTo ? String(run.value(c.renameTo, event, flow)) : from.split('/').pop()
    to = `${to.replace(/\/$/, '')}/${name}`
    run.files[to] = run.files[from]
    delete run.files[from]
    run.tick(5)
    return { event, text: `Moved ${from} to ${to}` }
  }
  BEHAVIOURS[`${prefix}-rename`] = ({ c, event, run, flow }) => {
    const from = String(run.value(c.path, event, flow))
    if (!(from in run.files)) throw new MuleError(`${ns}:ILLEGAL_PATH`, `Path '${from}' doesn't exist`)
    const to = `${from.replace(/\/[^/]*$/, '')}/${run.value(c.to, event, flow)}`
    run.files[to] = run.files[from]
    delete run.files[from]
    run.tick(5)
    return { event, text: `Renamed ${from} to ${to}` }
  }
  BEHAVIOURS[`${prefix}-delete`] = ({ c, event, run, flow }) => {
    const path = String(run.value(c.path, event, flow))
    if (!(path in run.files)) throw new MuleError(`${ns}:ILLEGAL_PATH`, `Path '${path}' doesn't exist`)
    delete run.files[path]
    run.tick(5)
    return { event, text: `Deleted ${path}` }
  }
  BEHAVIOURS[`${prefix}-copy`] = ({ c, event, run, flow }) => {
    const from = String(run.value(c.sourcePath, event, flow))
    if (!(from in run.files)) throw new MuleError(`${ns}:ILLEGAL_PATH`, `Path '${from}' doesn't exist`)
    const to = `${String(run.value(c.targetPath, event, flow)).replace(/\/$/, '')}/${c.renameTo ? run.value(c.renameTo, event, flow) : from.split('/').pop()}`
    if (to in run.files && c.overwrite !== 'true') throw new MuleError(`${ns}:FILE_ALREADY_EXISTS`, `File '${to}' already exists`)
    run.files[to] = run.files[from]
    run.tick(5)
    return { event, text: `Copied ${from} to ${to}` }
  }
  BEHAVIOURS[`${prefix}-list`] = ({ c, event, run, flow }) => {
    const dir = String(run.value(c.directoryPath, event, flow)).replace(/\/$/, '')
    const pattern = new RegExp(`^${String(c.matcher || '*').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
    const found = Object.keys(run.files).filter((p) => p.replace(/\/[^/]*$/, '') === dir && pattern.test(p.split('/').pop()))
    run.tick(10)
    return { event: { ...event, payload: found.map((p) => ({ payload: run.files[p], attributes: fileAttributes(run, p) })), mime: 'application/java' }, text: `Listed ${found.length} file(s) in ${dir}` }
  }
  BEHAVIOURS[`${prefix}-create-directory`] = ({ event, run }) => {
    run.tick(3)
    return { event, text: 'Directory created' }
  }
}

// ---------- other systems: Salesforce, SAP, Workday, SOAP, S3, Azure ----------

// These answer from scenario.systems.calls[type] when the problem gives one: { payload } or { fault: { type, description } },
// or a list of those for each call in turn. Without one they answer with a plain success so the flow can go on.
const GENERIC_DEFAULTS = {
  'sf-upsert': (e) => ({ successful: true, items: asItems(e.payload).map((_, i) => ({ id: `001RS00000${String(i + 1).padStart(5, '0')}`, successful: true })) }),
  'sf-create': (e) => ({ successful: true, items: asItems(e.payload).map((_, i) => ({ id: `001RS00000${String(i + 1).padStart(5, '0')}`, successful: true })) }),
  'sf-update': (e) => ({ successful: true, items: asItems(e.payload).map(() => ({ successful: true })) }),
  'sf-query': () => [],
  'sf-query-all': () => [],
  's3-put': () => ({ eTag: '"9b2cf535f27731c974343645a3985328"' }),
  'azure-upload-blob': () => ({ eTag: '0x8DCB1A2F3C4D5E6' }),
}
const asItems = (p) => (Array.isArray(p) ? p : [p])

export function genericCall({ node, c, event, run, flow, label }) {
  const answers = run.scenario.systems?.calls?.[node.type] ?? run.scenario.systems?.calls?.[c.operation]
  const n = (run.httpCalls[`call:${node.type}`] = (run.httpCalls[`call:${node.type}`] ?? 0) + 1)
  const answer = Array.isArray(answers) ? answers[Math.min(n - 1, answers.length - 1)] : answers
  // the settings as they were at the call, with expressions worked out, so a test can check the folder or object used
  const settings = {}
  for (const [k, v] of Object.entries(c ?? {})) {
    try {
      settings[k] = run.value(v, event, flow)
    } catch {
      settings[k] = v
    }
  }
  run.effects.calls.push({ type: node.type, operation: c.operation ?? c.objectType ?? c.soql ?? '', settings, payload: copy(event.payload), t: run.t })
  run.tick(answer?.latencyMs ?? 120)
  if (answer?.fault) throw new MuleError(answer.fault.type, answer.fault.description ?? `${label} failed.`)
  const payload = answer && 'payload' in answer ? copy(answer.payload) : GENERIC_DEFAULTS[node.type]?.(event) ?? copy(event.payload)
  const out = { ...event, payload, mime: 'application/java', ...(answer && 'attributes' in answer ? { attributes: copy(answer.attributes) } : {}) }
  if (c.target) return { event: { ...event, vars: { ...event.vars, [c.target]: payload } }, text: `${label}: the answer is kept in vars.${c.target}` }
  return { event: out, text: `${label}: ${answers ? 'answered' : 'answered with a plain success (the scenario gives no data for it)'} ${brief(payload)}` }
}

for (const [type, def] of Object.entries(COMPONENTS)) {
  if (BEHAVIOURS[type] || def.kind !== 'processor') continue
  if (['enterprise', 'connectors', 'files', 'modules', 'messaging'].includes(def.group)) BEHAVIOURS[type] = genericCall
}
