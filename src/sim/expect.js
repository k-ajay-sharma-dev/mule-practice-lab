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
//   calls: [{ method, path, count | min | max }],   HTTP calls made to an endpoint
//   db: { table: { count, has: [rows], lacks: [rows] } },   table contents after the run
//   sent: [{ destination, count, has }], notSent: ['queue'],
//   emails: [{ to, subject, count }], noEmails: true,
//   files: { '/path': { exists, has } },
//   ack: 'acked' | 'returned' | 'not-acked',   what became of the message that started the flow
//   maxMs: 1500,                         the first flow answered within this many simulated milliseconds
// }
import { contains, deepEqual, brief } from './values.js'
import { matchPath } from './http.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

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
    const n = result.effects.http.filter((c) => (!want.method || c.method === want.method) && matchPath(want.path, c.path)).length
    const name = `${want.method ? `${want.method} ` : ''}${want.path}`
    if (want.count !== undefined) add(n === want.count, `${name} is called ${plural(want.count, 'time')}`, n)
    else if (want.max !== undefined) add(n <= want.max, `${name} is called at most ${plural(want.max, 'time')}`, n)
    else add(n >= (want.min ?? 1), `${name} is called`, 'not called')
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
    add(want.count !== undefined ? matching.length === want.count : matching.length > 0, text, plural(matching.length, 'message'))
  }
  for (const dest of expect.notSent ?? []) {
    const n = result.effects.sent.filter((m) => m.destination.toLowerCase() === dest.toLowerCase()).length
    add(n === 0, `Nothing is sent to ${dest}`, plural(n, 'message'))
  }

  for (const want of expect.emails ?? []) {
    const n = result.effects.emails.filter((e) => (!want.to || contains(e.to, `~${want.to}`)) && (!want.subject || contains(e.subject, `~${want.subject}`)) && (!want.has || contains(String(e.content), `~${want.has}`))).length
    add(want.count !== undefined ? n === want.count : n > 0, `${want.count !== undefined ? plural(want.count, 'email') : 'An email'}${want.to ? ` to ${want.to}` : ''}${want.subject ? ` about "${want.subject}"` : ''}`, plural(n, 'email'))
  }
  if (expect.noEmails) add(result.effects.emails.length === 0, 'No email is sent', plural(result.effects.emails.length, 'email'))

  for (const [path, want] of Object.entries(expect.files ?? {})) {
    const exists = path in (result.effects.files ?? {})
    if (want.exists !== undefined) add(exists === want.exists, want.exists ? `${path} exists` : `${path} is gone`, exists ? 'it is there' : 'it is not there')
    if (want.has) add(exists && String(result.effects.files[path]).includes(want.has), `${path} contains "${want.has}"`, exists ? brief(result.effects.files[path]) : 'no file')
  }

  if (expect.ack) {
    const outcome = result.effects.acks.find((a) => a.op === 'outcome')?.outcome ?? 'none'
    const words = { acked: 'The message is acknowledged', returned: 'The message goes back to the queue for redelivery', 'not-acked': 'The message is left unacknowledged' }
    add(outcome === expect.ack, words[expect.ack] ?? `Message outcome ${expect.ack}`, outcome)
  }

  if (expect.maxMs !== undefined) {
    const first = result.runs[0]
    const ms = first ? (first.end ?? result.elapsedMs) - first.start : result.elapsedMs
    add(ms <= expect.maxMs, `It answers within ${expect.maxMs} ms`, `${ms} ms`)
  }
  return out
}

const lowerKeys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])) : o)
