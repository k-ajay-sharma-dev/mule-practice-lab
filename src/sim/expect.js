// Checks a simulator result against what a test expects. Each expectation becomes one line the learner reads:
// { ok, text } where text says what was wanted and, when it failed, what happened instead.
//
// expect = {
//   status: 201,                         the HTTP status sent back
//   body: {...} | bodyHas: {...},        the response body, exactly or containing these keys (see values.contains)
//   bodyLacks: {...},                    the body must not contain this (an error answer must not say COMPLETED)
//   payloadHas: {...},                   the final payload of a flow that is not an HTTP flow
//   error: 'HTTP:TIMEOUT' | noError,     the error the flow ended with, or none
//   logs: [{ level, has }],              a log line at that level (or one of a list of levels) whose text contains `has`
//   noLogs: [{ level }],                 no log line at that level
//   calls: [{ method, path, has, count | min | max }],   HTTP calls made to an endpoint (has: the request body holds this)
//   db: { table: { count, has: [rows], lacks: [rows] } },   table contents after the run
//   sent: [{ destination, count, has }], notSent: ['queue'],
//   emails: [{ to, subject, has, count }], noEmails: true,   has looks in the content (an object is read as JSON)
//   stored: [{ key, value | has, store? }], notStored: ['key'],   Object Store contents after the run
//   files: { '/path': { exists, has, count } },   a * in the path matches any name: '/archive/orders-*.csv'
//   connector: [{ type: 'email-move', operation?, settings: { targetFolder: 'Processed' }, has, count | min | max }],
//                                        connector calls (Salesforce, SAP, Workday, S3, email folders and the like)
//   ack: 'acked' | 'returned' | 'not-acked',   what became of the message that started the flow,
//        or a list (['acked', 'acked']) with one outcome per trigger message in order
//   maxMs: 1500,                         the first flow answered within this many simulated milliseconds
// }
import { contains, deepEqual, brief } from './values.js'
import { matchPath } from './http.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The rest that went somewhere else, so a wrong address or queue name shows in the message:
// '; 1 email went to "payload.email" instead'
function elsewhere(items, place, noun) {
  if (!items.length) return ''
  const counts = new Map()
  for (const item of items) {
    const where = String(place(item) ?? '').trim() || '(nowhere)'
    counts.set(where, (counts.get(where) ?? 0) + 1)
  }
  const parts = [...counts].slice(0, 3).map(([where, n]) => `${plural(n, noun)} went to "${where}"`)
  return `; ${parts.join(', ')}${counts.size > 3 ? ', and more' : ''} instead`
}

export function checkExpectations(result, expect = {}) {
  const out = []
  const add = (ok, text, got) => out.push({ ok, text: ok || got === undefined ? text : `${text} (got ${got})` })
  const res = result.response

  if (result.missing) return [{ ok: false, text: result.missing }]
  if (result.limit) return [{ ok: false, text: result.limit, limit: true }]

  if (expect.status !== undefined) add(res?.status === expect.status, `The answer has status ${expect.status}`, res ? `${res.status}${res.error ? `, ${res.error.type}` : ''}` : 'no answer')
  if (expect.body !== undefined) add(res && deepEqual(res.body, expect.body), `The body is ${brief(expect.body)}`, res ? brief(res.body) : 'no answer')
  if (expect.bodyHas !== undefined) add(res && contains(res.body, expect.bodyHas), `The body has ${brief(expect.bodyHas)}`, res ? brief(res.body) : 'no answer')
  if (expect.bodyLacks !== undefined) add(res && !contains(res.body, expect.bodyLacks), `The body does not have ${brief(expect.bodyLacks)}`, res ? brief(res.body) : 'no answer')
  if (expect.payloadHas !== undefined) add(contains(result.payload, expect.payloadHas), `The flow ends with a payload that has ${brief(expect.payloadHas)}`, brief(result.payload))
  if (expect.error !== undefined) add(result.error?.type === expect.error, `The flow ends with the error ${expect.error}`, result.error ? result.error.type : 'no error')
  if (expect.noError) add(!result.error, 'The flow ends without an error', result.error?.type)

  for (const want of expect.logs ?? []) {
    const levelsOk = [].concat(want.level ?? [])
    const hit = result.logs.some((l) => l.source === 'logger' && (!levelsOk.length || levelsOk.includes(l.level)) && (!want.has || l.message.toLowerCase().includes(String(want.has).toLowerCase())))
    const levels = [...new Set(result.logs.filter((l) => l.source === 'logger').map((l) => l.level))]
    add(hit, `A ${levelsOk.join(' or ')} log line${want.has ? ` that says "${want.has}"` : ''}`.replace('  ', ' '), levels.length ? `logged at ${levels.join(', ')}` : 'no log lines')
  }
  for (const not of expect.noLogs ?? []) {
    const n = result.logs.filter((l) => l.source === 'logger' && (!not.level || l.level === not.level)).length
    add(n === 0, `No ${not.level ?? ''} log line`.replace('  ', ' '), plural(n, 'line'))
  }

  for (const want of expect.calls ?? []) {
    const n = result.effects.http.filter((c) => (!want.method || c.method === want.method) && matchPath(want.path, c.path) && (want.has === undefined || contains(c.body, want.has))).length
    const name = `${want.method ? `${want.method} ` : ''}${want.path}${want.has !== undefined ? ` with ${brief(want.has)}` : ''}`
    if (want.count !== undefined) add(n === want.count, `${name} is called ${plural(want.count, 'time')}`, n)
    else if (want.max !== undefined) add(n <= want.max, `${name} is called at most ${plural(want.max, 'time')}`, n)
    else add(n >= (want.min ?? 1), `${name} is called`, 'not called')
  }

  for (const want of expect.connector ?? []) {
    const calls = (result.effects.calls ?? []).filter(
      (c) => c.type === want.type && (!want.operation || String(c.operation).toLowerCase() === String(want.operation).toLowerCase()) && (want.settings === undefined || contains(c.settings, want.settings)) && (want.has === undefined || contains(c.payload, want.has)),
    )
    const n = calls.length
    const name = `${want.type}${want.operation ? ` ${want.operation}` : ''}${want.settings ? ` with ${brief(want.settings)}` : ''}${want.has ? ` sending ${brief(want.has)}` : ''}`
    if (want.count !== undefined) add(n === want.count, `${name} runs ${plural(want.count, 'time')}`, n)
    else if (want.max !== undefined) add(n <= want.max, `${name} runs at most ${plural(want.max, 'time')}`, n)
    else add(n >= (want.min ?? 1), `${name} runs`, 'it does not')
  }

  for (const [table, want] of Object.entries(expect.db ?? {})) {
    const rows = Object.entries(result.effects.tables ?? {}).find(([k]) => k.toLowerCase() === table.toLowerCase())?.[1]?.rows ?? []
    if (want.count !== undefined) add(rows.length === want.count, `Table ${table} holds ${plural(want.count, 'row')}`, rows.length)
    for (const row of [].concat(want.has ?? [])) add(rows.some((r) => contains(lowerKeys(r), lowerKeys(row))), `Table ${table} has a row with ${brief(row)}`, `${plural(rows.length, 'row')}`)
    for (const row of [].concat(want.lacks ?? [])) add(!rows.some((r) => contains(lowerKeys(r), lowerKeys(row))), `Table ${table} has no row with ${brief(row)}`, 'there is one')
  }

  for (const want of expect.sent ?? []) {
    const msgs = result.effects.sent.filter((m) => m.destination.toLowerCase() === String(want.destination).toLowerCase())
    const matching = want.has ? msgs.filter((m) => contains(m.payload, want.has)) : msgs
    const text = `${want.count !== undefined ? plural(want.count, 'message') : 'A message'} sent to ${want.destination}${want.has ? ` with ${brief(want.has)}` : ''}`
    const others = result.effects.sent.filter((m) => !msgs.includes(m))
    add(want.count !== undefined ? matching.length === want.count : matching.length > 0, text, plural(matching.length, 'message') + elsewhere(others, (m) => m.destination, 'message'))
  }
  for (const dest of expect.notSent ?? []) {
    const n = result.effects.sent.filter((m) => m.destination.toLowerCase() === dest.toLowerCase()).length
    add(n === 0, `Nothing is sent to ${dest}`, plural(n, 'message'))
  }

  for (const want of expect.emails ?? []) {
    const n = result.effects.emails.filter((e) => (!want.to || contains(e.to, `~${want.to}`)) && (!want.subject || contains(e.subject, `~${want.subject}`)) && (!want.has || contains(textOf(e.content), `~${want.has}`))).length
    const others = want.to ? result.effects.emails.filter((e) => !contains(e.to, `~${want.to}`)) : []
    add(want.count !== undefined ? n === want.count : n > 0, `${want.count !== undefined ? plural(want.count, 'email') : 'An email'}${want.to ? ` to ${want.to}` : ''}${want.subject ? ` about "${want.subject}"` : ''}`, plural(n, 'email') + elsewhere(others, (e) => e.to, 'email'))
  }
  // Object Store keys are looked up in every store unless the test names one, since the store name is the learner's
  for (const want of expect.stored ?? []) {
    const found = storedValues(result, want.key, want.store)
    const ok = found.some((v) => (want.value === undefined || deepEqual(v, want.value)) && (want.has === undefined || contains(v, want.has)))
    const what = want.value !== undefined ? ` = ${brief(want.value)}` : want.has !== undefined ? ` with ${brief(want.has)}` : ''
    add(ok, `The Object Store holds ${want.key}${what}`, found.length ? brief(found[0]) : 'no such key')
  }
  for (const key of expect.notStored ?? []) {
    const found = storedValues(result, key)
    add(found.length === 0, `The Object Store does not hold ${key}`, brief(found[0]))
  }

  if (expect.noEmails) add(result.effects.emails.length === 0, 'No email is sent', plural(result.effects.emails.length, 'email'))

  // a path with * (any characters) or ? (one character) matches any file there, for names made of a uuid or a
  // timestamp: '/archive/orders-*.csv'
  for (const [path, want] of Object.entries(expect.files ?? {})) {
    const all = result.effects.files ?? {}
    const pattern = /[*?]/.test(path) ? new RegExp(`^${path.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`, 'i') : null
    const hits = pattern ? Object.keys(all).filter((p) => pattern.test(p)) : path in all ? [path] : []
    const exists = hits.length > 0
    if (want.exists !== undefined) add(exists === want.exists, want.exists ? `${path} exists` : `${path} is gone`, exists ? 'it is there' : 'it is not there')
    if (want.count !== undefined) add(hits.length === want.count, `${plural(want.count, 'file')} match ${path}`, hits.length)
    if (want.has) add(hits.some((p) => textOf(all[p]).includes(want.has)), `${path} contains "${want.has}"`, exists ? brief(all[hits[0]]) : 'no file')
  }

  // ack: one outcome for the message that started the flow, or a list with one outcome per trigger message
  if (expect.ack) {
    const outcomes = result.effects.acks.filter((a) => a.op === 'outcome').map((a) => a.outcome)
    const words = { acked: 'is acknowledged', returned: 'goes back to the queue for redelivery', 'not-acked': 'is left unacknowledged' }
    const wants = [].concat(expect.ack)
    wants.forEach((want, i) => {
      const got = outcomes[i] ?? 'none'
      const who = wants.length > 1 ? `Message ${i + 1}` : 'The message'
      add(got === want, `${who} ${words[want] ?? `has the outcome ${want}`}`, got)
    })
  }

  if (expect.maxMs !== undefined) {
    const first = result.runs[0]
    const ms = first ? (first.end ?? result.elapsedMs) - first.start : result.elapsedMs
    add(ms <= expect.maxMs, `It answers within ${expect.maxMs} ms`, `${ms} ms`)
  }
  return out
}

function storedValues(result, key, store) {
  const stores = Object.entries(result.effects.objectStore ?? {}).filter(([name]) => !name.startsWith('_idempotent') && (!store || name === store))
  return stores.filter(([, s]) => s && Object.prototype.hasOwnProperty.call(s, key)).map(([, s]) => asText(s[key]))
}

// A DataWeave date, time or period kept in the store compares as its text, such as 2026-11-13T09:45:00Z
function asText(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
  const proto = Object.getPrototypeOf(v)
  if (proto === Object.prototype || proto === null) return v
  return typeof v.toString === 'function' && v.toString !== Object.prototype.toString ? v.toString() : v
}

const textOf = (v) => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v))

const lowerKeys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])) : o)
