// The systems a flow problem's reference design talks to: HTTP endpoints, database tables, queues, folders and so on.
// On a real project these are handed to you as API contracts and schemas, so the scenario lists them. Only the name
// of each system is shown (a path, a table, a queue), never how the reference uses it: no SQL, no settings.
import { COMPONENTS } from './catalog.js'

const OUTBOUND = new Set(['connectors', 'database', 'messaging', 'files', 'enterprise'])

// a value computed at run time is not a name you could have known
const isKnown = (v) => typeof v === 'string' && v.trim() !== '' && !v.includes('#[') && !v.includes('${')
// Reading a learner's design, a path built at run time still counts: #["/accounts/" ++ vars.id] calls /accounts/{id}.
let known = isKnown
const filled = (v) => typeof v === 'string' && v.trim() !== ''

// Each table a statement touches, with what it does there: read, insert, update or delete. In
// INSERT INTO a SELECT ... FROM b, a gets an insert and b a read. TRUNCATE counts as a delete.
function tablesIn(sql = '') {
  // "call" as a word of its own: a table named RECALL is not a procedure call
  const procedure = sql.match(/(?:^|[{\s])call\s+([\w.]+)/i)
  if (procedure) return [{ kind: 'Stored procedure', name: procedure[1], op: 'call' }]
  const verb = sql.trim().replace(/^\{/, '').trim().split(/\s+/)[0]?.toLowerCase()
  let firstFrom = true
  // not ":from", a named parameter, and not the words after FOR UPDATE and the like
  return [...sql.matchAll(/(?<![:\w])(from|join|into|update|truncate\s+table|truncate)\s+([A-Za-z_][\w.]*)/gi)]
    .filter((m) => !/^(select|set|values|dual|and|or|skip|nowait|of|only|lateral|where|table)$/i.test(m[2]))
    .map((m) => {
      const word = m[1].toLowerCase()
      let op = 'read'
      if (word === 'into') op = verb === 'merge' ? 'update' : 'insert'
      else if (word === 'update') op = 'update'
      else if (word.startsWith('truncate')) op = 'delete'
      else if (word === 'from' && verb === 'delete' && firstFrom) op = 'delete'
      if (word === 'from') firstFrom = false
      return { kind: 'Database table', name: m[2], op }
    })
}

const soqlObject = (soql = '') => soql.match(/\bfrom\s+(\w+)/i)?.[1]

// What a step does to the system it names, from the end of its type: mq-publish sends, mq-subscriber receives.
// Steps that do the same thing another way share a word, so Salesforce Create and Upsert both write.
const OPS = [
  [/publish-consume$/, 'send and receive'],
  [/(publish|send|bulk-publish|publish-platform-event)$/, 'send'],
  [/(subscriber|listener|listener-pop3|consume|receive|replay-channel|replay-topic|modified-objects|list-imap)$/, 'receive'],
  [/(read|get|list|list-blobs|download-blob|query|query-all|query-xml-stream|retrieve-idoc|get-function)$/, 'read'],
  [/(write|put|upload-blob|create|upsert|update|copy|create-directory|create-job-v2|create-query-job-v2)$/, 'write'],
  [/(move|rename)$/, 'move'],
  [/(delete|delete-blob)$/, 'delete'],
]
const opOf = (type) => OPS.find(([re]) => re.test(type))?.[1] ?? 'call'
const POLLED = new Set(['db', 'file', 'sftp', 'ftp'])

// Queues and topics. One that a design both sends to and receives from is a hand-off between its own flows: its
// name and its kind (VM, Anypoint MQ, JMS) are the designer's choice, so it is not a system the scenario hands you.
const CHANNELS = new Set(['VM queue', 'Anypoint MQ destination', 'JMS queue', 'JMS topic', 'Kafka topic', 'Amazon SQS queue'])
// #['auditQueue'] names the same queue as auditQueue
const channelKey = (name) => {
  const text = String(name).trim()
  const literal = text.match(/^#\[\s*(['"])((?:(?!\1).)*)\1\s*\]$/s)
  return (literal ? literal[2] : text).trim().toLowerCase()
}

// what one step calls, as zero or more { kind, name, op }. HTTP Listener and Scheduler are left to systemsIn.
function targetsOf(type, c = {}) {
  const def = COMPONENTS[type]
  if (!def || type === 'http-listener' || type === 'scheduler') return []
  if (!OUTBOUND.has(def.group) && def.kind !== 'source') return []
  const [family] = type.split('-')
  // a source that polls a table, a folder or a mailbox reads it, as a Scheduler with a Select or a List would
  const op = def.kind === 'source' && POLLED.has(family) ? 'read' : opOf(type)
  const one = (kind, name) => (known(name) ? [{ kind, name, op }] : [])

  if (type === 'http-request') {
    const method = String(c.method || 'GET').toUpperCase()
    return known(c.path) ? [{ kind: 'HTTP API', name: `${method} ${c.path}`, op: method }] : []
  }
  if (type === 'db-listener') return one('Database table', c.table)
  if (family === 'db') return tablesIn(c.sql)
  if (family === 'sf') {
    if (c.platformEventName) return one('Salesforce platform event', c.platformEventName)
    if (type === 'sf-replay-channel') return one('Salesforce channel', c.streamingChannel)
    if (type === 'sf-replay-topic') return one('Salesforce channel', c.topic)
    return one('Salesforce object', c.objectType || soqlObject(c.soql || c.query))
  }
  if (family === 'mq') return one('Anypoint MQ destination', c.destination)
  if (family === 'jms') {
    const kind = c.destinationType === 'TOPIC' ? 'JMS topic' : 'JMS queue'
    // the request goes to the destination; the reply comes back on a reply queue of its own
    if (type === 'jms-publish-consume') return known(c.destination) ? [{ kind, name: c.destination, op: 'send' }] : []
    return one(kind, c.destination)
  }
  if (family === 'vm') return one('VM queue', c.queueName)
  if (family === 'kafka') return one('Kafka topic', c.topic)
  if (family === 'sqs') return one('Amazon SQS queue', known(c.queueUrl) ? c.queueUrl.split('/').pop() : null)
  if (family === 's3') return one('Amazon S3 bucket', c.bucket)
  if (family === 'azure') return one('Azure Blob container', c.container || c.containerName)
  if (family === 'file' || family === 'sftp' || family === 'ftp') {
    const where = { file: 'Folder or file', sftp: 'SFTP folder or file', ftp: 'FTP folder or file' }[family]
    return [c.directory, c.path, c.directoryPath, c.sourcePath, c.targetPath].filter(known).map((name) => ({ kind: where, name, op }))
  }
  if (type === 'email-send') return [{ kind: 'Email', name: known(c.toAddresses) ? `send to ${c.toAddresses}` : 'send (SMTP)', op }]
  if (family === 'email') return one('Mailbox folder', c.folder || c.mailboxFolder || c.targetFolder)
  if (type === 'wsc-consume') return one('SOAP operation', c.operation)
  if (family === 'sap') return one('SAP function or IDoc', c.key)
  if (family === 'wd') return one(`Workday ${def.label.replace(/^Workday\s*/i, '')}`, c.operation)
  return []
}

// onError: the step runs only when something failed, inside an error handler. Marking a row FAILED there is a
// different use from marking it SENT on the main path.
function walk(nodes, found, onError = false) {
  for (const n of nodes || []) {
    const inHandler = onError || COMPONENTS[n.type]?.kind === 'handler'
    found.push(...targetsOf(n.type, n.config).map((t) => ({ ...t, onError: inHandler })))
    walk(n.steps, found, inHandler)
    for (const r of n.routes || []) walk(r.steps, found, inHandler)
    walk(n.otherwise, found, inHandler)
    walk(n.errorHandlers, found, true)
  }
  return found
}

export const ENDPOINT = 'Endpoint your app exposes'

const distinct = (list, key) => {
  const seen = new Set()
  return list.filter((s) => {
    const k = key(s)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function endpointOf(source) {
  if (source?.type !== 'http-listener' || !known(source.config?.path)) return null
  const method = String(source.config.allowedMethods ?? '').trim()
  return { kind: ENDPOINT, name: `${method ? `${method} ` : ''}${source.config.path}`, op: 'expose', methods: method.toUpperCase(), onError: false }
}

// APIkit runs a flow named get:\orders:orders-api-config for GET /orders, with no source and no Flow Reference.
function apikitEndpoint(flowName = '') {
  const m = flowName.match(/^(get|post|put|patch|delete|head|options):\\([^:]*)/i)
  return m ? { kind: ENDPOINT, name: `${m[1].toUpperCase()} /${m[2].replace(/\\/g, '/').replace(/^\/+/, '')}`, op: 'expose', methods: m[1].toUpperCase(), onError: false } : null
}

const SCHEDULE = { kind: 'Schedule', name: 'Scheduler', op: 'run', onError: false }

// The queues a design hands work over on: sent to by one of its flows and received by another (see CHANNELS).
function internalChannels(design) {
  const sent = new Set()
  const received = new Set()
  for (const f of design.flows ?? []) {
    for (const u of walk([f.source].filter(Boolean), [])) if (CHANNELS.has(u.kind)) received.add(channelKey(u.name))
    for (const u of walk([...(f.steps ?? []), ...(f.errorHandlers ?? [])], [])) if (CHANNELS.has(u.kind) && u.op === 'send') sent.add(channelKey(u.name))
  }
  return new Set([...sent].filter((k) => received.has(k)))
}

// What starts a flow: its own source, or for a flow with none, the flows that call it with Flow Reference
// (followed back to their sources). A shared sub-flow called by three endpoints is started by all three. A flow that
// receives from one of the design's own hand-off queues is started by whatever starts the flows that send to it.
function triggersOf(design) {
  const own = new Map()
  const callers = new Map()
  const internal = internalChannels(design)
  const senders = new Map()
  const handedBy = new Map()
  for (const f of design.flows) {
    for (const u of walk([...(f.steps ?? []), ...(f.errorHandlers ?? [])], []))
      if (CHANNELS.has(u.kind) && u.op === 'send' && internal.has(channelKey(u.name))) senders.set(channelKey(u.name), [...(senders.get(channelKey(u.name)) ?? []), f.name])
  }
  const refsIn = (nodes, out = []) => {
    for (const n of nodes || []) {
      if (n.type === 'flow-ref' && n.config?.name) out.push(n.config.name)
      refsIn(n.steps, out)
      for (const r of n.routes || []) refsIn(r.steps, out)
      refsIn(n.otherwise, out)
      refsIn(n.errorHandlers, out)
    }
    return out
  }
  for (const f of design.flows) {
    const s = f.source
    const start = s?.type === 'scheduler' ? SCHEDULE : endpointOf(s) ?? (s ? walk([s], [])[0] : null) ?? apikitEndpoint(f.name)
    const handOff = start && CHANNELS.has(start.kind) && internal.has(channelKey(start.name))
    // A hand-off flow also keeps its own queue as a lane, so two workers behind one endpoint stay apart.
    own.set(f.name, start ? [handOff ? { ...start, lane: true } : start] : [])
    if (handOff) handedBy.set(f.name, { lane: channelKey(start.name), from: senders.get(channelKey(start.name)) ?? [] })
    for (const name of [...refsIn(f.steps), ...refsIn(f.errorHandlers)]) callers.set(name, [...(callers.get(name) ?? []), f.name])
  }
  // Flows may call each other in a loop (a worker that requeues to itself), so a result found part-way round a loop
  // is not kept: only the full answer for the flow asked about is.
  // A start reached through a hand-off queue is marked with that queue (through), so a check can set it aside while
  // the design keeps the queue and the lane already tells the flows apart.
  const memo = new Map()
  const collect = (name, seen) => {
    if (seen.has(name)) return []
    seen.add(name)
    const handed = handedBy.get(name)
    const passed = handed ? handed.from.flatMap((c) => collect(c, seen)).map((t) => (t.through ? t : { ...t, through: handed.lane })) : []
    return [...(own.get(name) ?? []), ...(callers.get(name) ?? []).flatMap((c) => collect(c, seen)), ...passed]
  }
  return (name) => {
    if (!memo.has(name)) memo.set(name, distinct(collect(name, new Set()), (t) => `${t.kind}\n${t.name}\n${t.op}\n${t.through ?? ''}`))
    return memo.get(name)
  }
}

// Every use of a system in a design, as { kind, name, op, onError, via }, in the order the design first makes
// it: first the HTTP endpoints the app exposes, then what each flow receives from and calls. via is what starts
// the flow that makes the call, so a step two workers both need is wanted in each; a use reached from three
// endpoints appears three times.
function usesIn(design) {
  if (!design?.flows) return []
  const found = []
  for (const f of design.flows) {
    const endpoint = endpointOf(f.source)
    if (endpoint) found.push({ ...endpoint, via: null })
  }
  const triggers = triggersOf(design)
  for (const f of design.flows) {
    const own = []
    walk(f.source && f.source.type !== 'http-listener' ? [f.source] : [], own)
    const calls = []
    walk(f.steps, calls)
    walk(f.errorHandlers, calls, true)
    const via = triggers(f.name)
    found.push(...own.map((u) => ({ ...u, via: null })))
    for (const u of calls) {
      if (via.length) found.push(...via.map((t) => ({ ...u, via: t })))
      else found.push({ ...u, via: null })
    }
  }
  const internal = internalChannels(design)
  return distinct(found, (s) => `${s.kind}\n${s.name}\n${s.op}\n${s.onError}\n${s.via ? `${s.via.kind} ${s.via.name} ${s.via.through ?? ''}` : ''}`).map((s) =>
    CHANNELS.has(s.kind) && internal.has(channelKey(s.name)) ? { ...s, internal: true } : s,
  )
}

// Every distinct system in a design, in the order the design first uses it. This is the list a scenario shows:
// names only, not what the reference does with them. A hand-off queue between the design's own flows is left out:
// what it is called, and whether it is VM or Anypoint MQ, is up to the designer.
export const systemsIn = (design) =>
  distinct(
    usesIn(design).filter((s) => !s.internal),
    (s) => `${s.kind}\n${s.name}`,
  ).map(({ kind, name }) => ({ kind, name }))

// Each read, write, send and call the reference makes, for the shared check: a design that reads a table it
// should also update is not done.
// A hand-off queue stays in, marked internal: it is wanted only while the design keeps that queue's name.
export const systemUsesIn = (design) => usesIn(design)

// In plain words, for a hint: "update notification_status (database table)".
const VERBS = { read: 'read', insert: 'insert into', update: 'update', delete: 'delete from', call: 'call', send: 'send to', receive: 'receive from', write: 'write to', move: 'move', expose: 'expose', 'send and receive': 'send to and receive from' }
const startText = (t) => {
  if (t.kind === ENDPOINT) return `the flow for ${t.name}`
  if (t.kind === 'Schedule') return 'the scheduled flow'
  return `the flow that receives from ${t.name}`
}
export const useText = (s) => {
  const when = `${s.onError ? ' in an error handler' : ''}${s.via ? `, in ${startText(s.via)}` : ''}`
  if (s.kind === 'HTTP API') return `call ${s.name}${when}`
  if (s.kind === ENDPOINT) return `expose ${s.name}`
  return `${VERBS[s.op] ?? s.op} ${s.name} (${s.kind.toLowerCase()})${when}`
}

// The path of an HTTP system, without the method in front: "GET /api/orders" is /api/orders.
const pathOf = (name) => String(name).replace(/^[A-Z][A-Z, ]*\s+(?=[/#"'$])/, '').trim().toLowerCase()

// A design path reaches a listed path when the fixed parts of the listed one appear in it, in order. So
// /accounts/{id} is reached by /accounts/{accountId} and by #["/accounts/" ++ vars.id], and a query string is
// left aside.
function reaches(designPath, listedPath) {
  const pieces = pathOf(listedPath).split('?')[0].split(/\{[^}]*\}/).map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean)
  let from = 0
  const have = pathOf(designPath)
  for (const piece of pieces) {
    const at = have.indexOf(piece, from)
    if (at < 0) return false
    from = at + piece.length
  }
  return true
}

// Same system, and the same thing done to it when the wanted use says what (an older list holds names only).
// An endpoint's methods are not compared: an empty Allowed methods accepts every method.
// Marking a row done and deleting it are two ways to finish with it.
const SAME_OP = { update: ['update', 'delete'], delete: ['update', 'delete'] }

function sameSystem(have, want) {
  if (have.kind !== want.kind) return false
  if (want.op && want.kind !== ENDPOINT && have.op !== want.op && !SAME_OP[want.op]?.includes(have.op)) return false
  if (want.onError !== undefined && have.onError !== want.onError) return false
  // an endpoint with no Allowed methods accepts every method
  if (want.kind === ENDPOINT && want.methods && have.methods) {
    const allowed = have.methods.split(/[,\s]+/)
    if (!want.methods.split(/[,\s]+/).every((m) => allowed.includes(m))) return false
  }
  if (want.kind === 'Email') return true
  if (want.kind === 'HTTP API' || want.kind === ENDPOINT) return reaches(have.name, want.name)
  if (FOLDERS.has(want.kind)) return inFolder(have.name, want.name)
  if (want.kind === 'Database table') return namesMatch(withoutSchema(have.name), withoutSchema(want.name))
  return namesMatch(have.name, want.name)
}

// crm.customers is the customers table in the crm schema
const withoutSchema = (name) => String(name).replace(/^[\w$]+\./, '')

// A file inside a listed folder is in that folder: /outbound/payments/run-1.csv and
// #["/outbound/payments/" ++ vars.fileName] are both in /outbound/payments.
const FOLDERS = new Set(['Folder or file', 'SFTP folder or file', 'FTP folder or file'])
function inFolder(have, want) {
  if (namesMatch(have, want)) return true
  const folder = want.trim().toLowerCase().replace(/\/+$/, '')
  const literal = have.trim().match(/^#\[\s*(['"])((?:(?!\1).)*)\1/s)
  const path = (have.includes('#[') ? (literal?.[2] ?? '') : have).trim().toLowerCase()
  return folder !== '' && path.startsWith(`${folder}/`)
}

// Starts that poll (a Scheduler, a table or folder listener) are one kind of start: a design may poll a table with
// a Scheduler and a Select where the reference used a table listener.
const POLLING = new Set(['Schedule', 'Database table', ...FOLDERS])
const sameTrigger = (have, want) => sameSystem(have, want) || (POLLING.has(want.kind) && POLLING.has(have.kind))

// A name written as a DataWeave string, #['auditQueue'] or #[ "auditQueue" ], is that name. A name built at run time
// counts when the listed name is written inside it, as in #["orders-" ++ vars.region] for orders-eu.
function namesMatch(have, want) {
  const listed = want.trim().toLowerCase()
  const text = have.trim()
  const literal = text.match(/^#\[\s*(['"])((?:(?!\1).)*)\1\s*\]$/s)
  const name = (literal ? literal[2] : text).trim().toLowerCase()
  if (name === listed) return true
  if (literal || !text.includes('#[')) return false
  const pieces = [...text.matchAll(/(['"])(.*?)\1/g)].map((m) => m[2].toLowerCase()).filter(Boolean)
  return pieces.length > 0 && listed.startsWith(pieces[0]) && pieces.every((p) => listed.includes(p))
}

// The wanted uses a design never makes. Run-time paths in the design count (see reaches).
export function missingSystems(wanted, design) {
  known = filled
  let have
  try {
    have = usesIn(design)
  } finally {
    known = isKnown
  }
  // A hand-off queue both the reference and the design keep: the flows behind it are told apart by its lane, so the
  // starts they inherit through it are set aside on both sides. A renamed queue is checked by those starts instead.
  const laneKeys = (uses) => new Set(uses.filter((s) => s.via?.lane).map((s) => channelKey(s.via.name)))
  const theirs = laneKeys(wanted)
  const kept = new Set([...laneKeys(have)].filter((k) => theirs.has(k)))
  have = have.filter((s) => !kept.has(s.via?.through))
  wanted = wanted.filter((s) => !kept.has(s.via?.through))
  // via: the call must be made in a flow started the same way (a flow it calls counts)
  const sameStart = (s, want) => !want.via || (s.via && sameTrigger(s.via, want.via))
  // A lane counts only when the design keeps that hand-off queue; a renamed queue is checked by what starts it.
  const lanes = new Set(have.filter((s) => s.via?.lane).map((s) => channelKey(s.via.name)))
  const sameLane = (s, want) => (s.via?.lane ? channelKey(s.via.name) === channelKey(want.via.name) : false)
  const channels = new Set(have.filter((s) => CHANNELS.has(s.kind)).map((s) => channelKey(s.name)))
  return wanted.filter((want) => {
    if (want.internal) {
      // a hand-off queue may be VM, Anypoint MQ or JMS: the name and the direction are what count
      if (!channels.has(channelKey(want.name))) return false
      return !have.some((s) => CHANNELS.has(s.kind) && channelKey(s.name) === channelKey(want.name) && s.op === want.op && (want.onError === undefined || s.onError === want.onError) && sameStart(s, want))
    }
    if (want.via?.lane) return lanes.has(channelKey(want.via.name)) && !have.some((s) => sameSystem(s, want) && sameLane(s, want))
    return !have.some((s) => sameSystem(s, want) && sameStart(s, want))
  })
}
