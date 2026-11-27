// Azure Service Bus of the Platform Lab: a Standard namespace with queues, topics, subscriptions with SQL filters,
// sessions, duplicate detection, PeekLock and ReceiveAndDelete, settlement, dead lettering and shared access policies.
// Pure and import free. Lives in state.serviceBus. The portal actions take the whole lab state and return a new one.
// ctx.serviceBus (serviceBusCtx) changes the draft state the engine passes, like ctx.kafka does.
//
// Facts from learn.microsoft.com/azure/service-bus-messaging (message-transfers-locks-settlement, message-sessions,
// service-bus-dead-letter-queues, duplicate-detection, service-bus-quotas, topic-filters), checked November 2026:
// the lock duration goes up to 5 minutes; max delivery count defaults to 10, and a message whose delivery count passes
// it moves to the dead letter queue with DeadLetterReason MaxDeliveryCountExceeded; an expired message moves there
// with TTLExpiredException when dead lettering on expiration is on; sessions and duplicate detection are set when the
// entity is created and cannot change later; the duplicate detection window defaults to 10 minutes and goes up to
// 7 days; Standard tier entities are 1, 2, 3, 4 or 5 GB and a message is at most 256 KB; a session receiver locks one
// session at a time and gets its messages in order; the Manage claim includes Send and Listen.
// Lab choices are marked "lab" in the comments.

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
export const SB_TIME = { SECOND, MINUTE, DAY }

export const DEFAULT_LOCK = 30 * SECOND
export const MAX_LOCK = 5 * MINUTE
export const DEFAULT_MAX_DELIVERY = 10
// the portal offers 14 days for a new entity on Standard
export const DEFAULT_TTL = 14 * DAY
export const DEFAULT_DUP_WINDOW = 10 * MINUTE
export const MAX_DUP_WINDOW = 7 * DAY
export const SIZES_MB = [1024, 2048, 3072, 4096, 5120]
export const MAX_MESSAGE = 256 * 1024
export const CLAIMS = ['Manage', 'Send', 'Listen']
export const DLQ = '$DeadLetterQueue'
export const NAMESPACE = 'harbor-bus'
export const hostOf = (ns) => `${ns}.servicebus.windows.net`

// ---------- errors ----------

// The reasons are the ServiceBusFailureReason names of the Azure SDK. The Mule error types are lab made: the
// MuleSoft Azure Service Bus connector has its own error namespace, and the lab does not claim its exact names.
const MULE = {
  UnauthorizedAccess: 'AZURE-SERVICE-BUS:UNAUTHORIZED',
  MessagingEntityNotFound: 'AZURE-SERVICE-BUS:ENTITY_NOT_FOUND',
  MessageLockLost: 'AZURE-SERVICE-BUS:MESSAGE_LOCK_LOST',
  SessionLockLost: 'AZURE-SERVICE-BUS:SESSION_LOCK_LOST',
  SessionCannotBeLocked: 'AZURE-SERVICE-BUS:SESSION_CANNOT_BE_LOCKED',
  QuotaExceeded: 'AZURE-SERVICE-BUS:QUOTA_EXCEEDED',
  MessageSizeExceeded: 'AZURE-SERVICE-BUS:MESSAGE_SIZE_EXCEEDED',
  ServiceTimeout: 'AZURE-SERVICE-BUS:TIMEOUT',
  InvalidOperation: 'AZURE-SERVICE-BUS:INVALID_OPERATION',
  InvalidConnectionString: 'AZURE-SERVICE-BUS:CONNECTIVITY',
}
// lab: a fixed tracking ID, so the engine stays pure
const track = () => `TrackingId:5c3a1f00-lab, SystemTracker:${NAMESPACE}, Timestamp:lab`
const fail = (reason, text) => ({ ok: false, reason, text: `${text} (${reason})`, muleType: MULE[reason] ?? 'AZURE-SERVICE-BUS:UNKNOWN' })
export const ERR = {
  claim: (ns, path, claim) => fail('UnauthorizedAccess', `Unauthorized access. '${claim}' claim(s) are required to perform this operation. Resource: 'sb://${hostOf(ns)}/${path}'. ${track()}`),
  signature: () => fail('UnauthorizedAccess', `InvalidSignature: The token has an invalid signature. ${track()}`),
  notFound: (ns, path) => fail('MessagingEntityNotFound', `The messaging entity 'sb://${hostOf(ns)}/${path}' could not be found. To know more visit https://aka.ms/sbResourceMgrExceptions. ${track()}`),
  noNamespace: (host) => fail('MessagingEntityNotFound', `No such host is known. (${host}:5671)`),
  lockLost: () => fail('MessageLockLost', 'The lock supplied is invalid. Either the lock expired, or the message has already been removed from the queue, or was received by a different receiver instance.'),
  sessionLost: (id) => fail('SessionLockLost', `The session lock has expired on the MessageSession. Accept a new MessageSession. Session '${id}'.`),
  sessionLocked: (id) => fail('SessionCannotBeLocked', `The requested session '${id}' cannot be accepted. It may be locked by another receiver. ${track()}`),
  noSession: () => fail('ServiceTimeout', 'The operation did not complete within the allocated time 00:01:00 for object session. No unlocked session is available.'),
  quota: (ns, path, size, max) => fail('QuotaExceeded', `The maximum entity size has been reached or exceeded for Queue: '${ns.toUpperCase()}:QUEUE:${path.toUpperCase()}'. Size of entity in bytes:${size}, Max entity size in bytes:${max}. ${track()}`),
  tooBig: (size) => fail('MessageSizeExceeded', `The received message (delivery-id:0, size:${size} bytes) exceeds the limit (${MAX_MESSAGE} bytes) currently allowed on the link.`),
  needsSessionId: () => fail('InvalidOperation', 'The SessionId was not set on a message, and it cannot be sent to the entity. Entities that have session support enabled can only receive messages that have the SessionId set to a valid value.'),
  needsSessionReceiver: () => fail('InvalidOperation', 'It is not possible for an entity that requires sessions to create a non-sessionful message receiver.'),
  noSessions: () => fail('InvalidOperation', 'It is not possible for an entity that does not require sessions to create a session receiver.'),
  topicReceive: (path) => fail('InvalidOperation', `Cannot receive from the topic '${path}'. Receive from one of its subscriptions: ${path}/subscriptions/<name>.`),
  connection: (why) => fail('InvalidConnectionString', `The connection string is not valid: ${why}. Expected Endpoint=sb://<namespace>.servicebus.windows.net/;SharedAccessKeyName=<policy>;SharedAccessKey=<key>`),
}

// ---------- seed ----------

const hash = (text) => {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
// Lab keys: 43 characters and "=", the shape of a real key, made from a hash of the name. Not a real secret.
export const keyOf = (ns, policy, which, round = 0) => {
  let out = ''
  let h = hash(`${ns}:${policy}:${which}:${round}`)
  for (let i = 0; i < 43; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
    out += B64[h % 64]
  }
  return `${out}=`
}
const guid = (n) => {
  const h = (k) => hash(`${n}:${k}`).toString(16).padStart(8, '0')
  return `${h(1)}-${h(2).slice(0, 4)}-4${h(3).slice(0, 3)}-a${h(4).slice(0, 3)}-${h(5)}${h(6).slice(0, 4)}`
}

export function newEntity(name, f = {}, now = 0) {
  return {
    name,
    status: 'Active',
    created: now,
    updated: now,
    lockMs: f.lockMs ?? DEFAULT_LOCK,
    maxDelivery: f.maxDelivery ?? DEFAULT_MAX_DELIVERY,
    ttlMs: f.ttlMs ?? DEFAULT_TTL,
    dlOnExpire: Boolean(f.dlOnExpire),
    sessions: Boolean(f.sessions),
    dupDetect: Boolean(f.dupDetect),
    dupWindowMs: f.dupDetect ? (f.dupWindowMs ?? DEFAULT_DUP_WINDOW) : DEFAULT_DUP_WINDOW,
    maxSizeMb: f.maxSizeMb ?? 1024,
    messages: [],
    dlq: [],
    seenIds: {},
    sessionLocks: {},
    resent: [],
  }
}
const newPolicy = (ns, name, claims) => ({ name, claims, round: { primary: 0, secondary: 0 } })
const newSubscription = (name, f = {}, now = 0) => ({ ...newEntity(name, f, now), rules: f.rules ?? [{ name: '$Default', sql: '1=1' }] })

export function newNamespace(name, now = 0, extra = {}) {
  return {
    name,
    tier: 'Standard',
    location: 'East US',
    resourceGroup: 'harbor-integration-rg',
    subscription: 'Harbor Lab',
    created: now,
    seq: 0,
    policies: [newPolicy(name, 'RootManageSharedAccessKey', ['Manage', 'Send', 'Listen'])],
    queues: {},
    topics: {},
    requests: [],
    log: [],
    ...extra,
  }
}

export function defaultServiceBus(now = 0) {
  const ns = newNamespace(NAMESPACE, now)
  ns.policies.push(newPolicy(NAMESPACE, 'app-send', ['Send']), newPolicy(NAMESPACE, 'app-listen', ['Listen']))
  ns.queues.orders = newEntity('orders', { dlOnExpire: true }, now)
  ns.queues.invoices = newEntity('invoices', { sessions: true }, now)
  ns.queues.payments = newEntity('payments', { dupDetect: true }, now)
  ns.topics['store-events'] = {
    ...newEntity('store-events', {}, now),
    subscriptions: {
      warehouse: newSubscription('warehouse', { rules: [{ name: 'stock-events', sql: "eventType IN ('OrderPlaced', 'OrderCancelled') AND region = 'north'" }] }, now),
      analytics: newSubscription('analytics', {}, now),
    },
  }
  const sb = { namespaces: { [NAMESPACE]: ns } }
  // a few sample orders, so the Explorer has something to peek at
  for (const [i, store] of ['S-10', 'S-12'].entries())
    enqueue(sb, ns, ns.queues.orders, { body: JSON.stringify({ orderId: `O-${5101 + i}`, store, total: 18.5 + i * 7 }), contentType: 'application/json', properties: { source: 'pos' } }, now)
  return sb
}

// ---------- reading ----------

// A console saved while this module was a placeholder has state.serviceBus without namespaces. The tick, ctx.serviceBus
// and the portal actions write the default namespace into their draft.
export function upgradeServiceBus(s) {
  if (s?.serviceBus && !s.serviceBus.namespaces) Object.assign(s.serviceBus, defaultServiceBus(s.serviceBus.created ?? s.clock ?? 0))
  return s
}
export const namespacesOf = (s) => Object.values(s?.serviceBus?.namespaces ?? {})
export const namespaceOf = (s, ns) => s?.serviceBus?.namespaces?.[ns]
const lower = (x) => String(x ?? '').toLowerCase()
const pick = (obj, name) => Object.values(obj ?? {}).find((e) => lower(e.name) === lower(name))

// "orders", "orders/$DeadLetterQueue", "store-events", "store-events/subscriptions/warehouse[/$DeadLetterQueue]"
export function resolve(ns, path) {
  const parts = String(path ?? '').replace(/^\/+|\/+$/g, '').split('/')
  const dead = parts.at(-1) === DLQ
  if (dead) parts.pop()
  if (parts.length === 1) {
    const q = pick(ns.queues, parts[0])
    if (q) return { kind: 'queue', entity: q, dead, path: q.name }
    const t = pick(ns.topics, parts[0])
    if (t && !dead) return { kind: 'topic', entity: t, dead, path: t.name }
    return null
  }
  if (parts.length === 3 && lower(parts[1]) === 'subscriptions') {
    const t = pick(ns.topics, parts[0])
    const sub = t && pick(t.subscriptions, parts[2])
    if (sub) return { kind: 'subscription', entity: sub, topic: t, dead, path: `${t.name}/subscriptions/${sub.name}` }
  }
  return null
}

const locked = (m, now) => (m.lockedUntil ?? 0) > now
const sizeOf = (m) => String(m.body ?? '').length + JSON.stringify(m.properties ?? {}).length + 64
export function countsOf(e) {
  const live = e.messages ?? []
  return {
    active: live.filter((m) => m.state !== 'Scheduled').length,
    deadLetter: (e.dlq ?? []).length,
    scheduled: live.filter((m) => m.state === 'Scheduled').length,
    // lab: nothing forwards between entities, so the transfer queues stay empty
    transfer: 0,
    transferDeadLetter: 0,
    deferred: live.filter((m) => m.state === 'Deferred').length,
    sizeBytes: [...live, ...(e.dlq ?? [])].reduce((n, m) => n + sizeOf(m), 0),
  }
}
// the subscriptions of a topic hold the messages; the topic shows their sum, as the portal does
export function topicCounts(t) {
  const all = Object.values(t.subscriptions ?? {}).map(countsOf)
  return all.reduce((a, c) => ({ active: a.active + c.active, deadLetter: a.deadLetter + c.deadLetter, scheduled: a.scheduled + c.scheduled, transfer: 0, transferDeadLetter: 0, deferred: a.deferred + c.deferred, sizeBytes: a.sizeBytes + c.sizeBytes }), { active: 0, deadLetter: 0, scheduled: 0, transfer: 0, transferDeadLetter: 0, deferred: 0, sizeBytes: 0 })
}

export function durationText(ms) {
  if (ms >= DAY && ms % DAY === 0) return `${ms / DAY} day${ms === DAY ? '' : 's'}`
  const parts = []
  let left = ms
  for (const [unit, size] of [['hour', 3600000], ['minute', MINUTE], ['second', SECOND]]) {
    const n = Math.floor(left / size)
    if (n) parts.push(`${n} ${unit}${n === 1 ? '' : 's'}`)
    left -= n * size
  }
  return parts.join(' ') || `${ms} ms`
}

// ---------- housekeeping ----------

const keep = (list, item, n) => {
  list.push(item)
  if (list.length > n) list.splice(0, list.length - n)
}
const request = (ns, now, op, path, r, who) => keep(ns.requests, { t: now, op, path, ok: r.ok, reason: r.ok ? null : r.reason, who: who ?? null }, 120)
const deadLetter = (e, m, now, reason, description) => {
  const { lockedUntil, lockToken, owner, ...rest } = m
  e.messages = e.messages.filter((x) => x !== m)
  keep(e.dlq, { ...rest, state: 'Active', deadLetterReason: reason, deadLetterErrorDescription: description, deadLetterSource: e.name, deadLettered: now }, 500)
}

// Locks that ran out, expired messages, scheduled messages that are due, session locks and the duplicate window
export function tidy(e, now) {
  for (const m of [...e.messages]) {
    if (m.lockedUntil && m.lockedUntil <= now) {
      delete m.lockedUntil
      delete m.lockToken
      delete m.owner
      // the delivery count went up when the message was delivered; a lock that ran out at the limit dead letters it
      if (m.deliveryCount >= e.maxDelivery) {
        deadLetter(e, m, now, 'MaxDeliveryCountExceeded', `Message could not be consumed after ${e.maxDelivery} delivery attempts.`)
        continue
      }
    }
    if (m.state === 'Scheduled' && m.scheduledFor <= now) {
      m.state = 'Active'
      m.enqueued = m.scheduledFor
    }
    if (m.state !== 'Scheduled' && !locked(m, now) && m.enqueued + e.ttlMs <= now) {
      if (e.dlOnExpire) deadLetter(e, m, now, 'TTLExpiredException', 'The message expired and was dead lettered.')
      else e.messages = e.messages.filter((x) => x !== m)
    }
  }
  for (const [id, l] of Object.entries(e.sessionLocks ?? {})) if (l.lockedUntil <= now) delete e.sessionLocks[id]
  for (const [id, t] of Object.entries(e.seenIds ?? {})) if (t + e.dupWindowMs <= now) delete e.seenIds[id]
}
const entitiesOf = (ns) => [...Object.values(ns.queues), ...Object.values(ns.topics).flatMap((t) => Object.values(t.subscriptions ?? {}))]

export function serviceBusTick(s) {
  upgradeServiceBus(s)
  for (const ns of namespacesOf(s)) for (const e of entitiesOf(ns)) tidy(e, s.clock ?? 0)
  return s
}

// ---------- SQL filters ----------

// A small SQL filter language: comparisons (= <> != > < >= <=), AND, OR, NOT, IN (...), LIKE with % and _,
// IS [NOT] NULL, EXISTS(name), parentheses, 'strings', numbers, TRUE, FALSE, 1=1. Names are application properties;
// sys.MessageId, sys.CorrelationId, sys.SessionId, sys.ContentType, sys.Label and sys.Subject are system properties.
const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^']|'')*)'|(<>|!=|>=|<=|=|>|<|\(|\)|,)|([A-Za-z_$][\w.$]*))/y
function tokens(text) {
  const out = []
  TOKEN.lastIndex = 0
  const src = String(text)
  while (TOKEN.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break
    const at = TOKEN.lastIndex
    const m = TOKEN.exec(src)
    if (!m) throw new Error(`Syntax error near position ${at}: '${src.slice(at, at + 10)}'`)
    if (m[1] !== undefined) out.push({ k: 'num', v: Number(m[1]) })
    else if (m[2] !== undefined) out.push({ k: 'str', v: m[2].replace(/''/g, "'") })
    else if (m[3] !== undefined) out.push({ k: 'op', v: m[3] })
    else out.push({ k: 'id', v: m[4], u: m[4].toUpperCase() })
  }
  return out
}
function parse(text) {
  const t = tokens(text)
  let i = 0
  const peek = () => t[i]
  const isWord = (w) => t[i]?.k === 'id' && t[i].u === w
  const isOp = (o) => t[i]?.k === 'op' && t[i].v === o
  const need = (o) => {
    if (!isOp(o)) throw new Error(`Expected '${o}'`)
    i++
  }
  const value = () => {
    const x = t[i++]
    if (!x) throw new Error('Unexpected end of the filter')
    if (x.k === 'num' || x.k === 'str') return { lit: x.v }
    if (x.k === 'id' && x.u === 'NULL') return { lit: null }
    if (x.k === 'id' && (x.u === 'TRUE' || x.u === 'FALSE')) return { lit: x.u === 'TRUE' }
    if (x.k === 'id') return { name: x.v }
    if (x.k === 'op' && x.v === '(') {
      const e = or()
      need(')')
      return { group: e }
    }
    throw new Error(`Unexpected '${x.v}'`)
  }
  const compare = () => {
    if (isWord('NOT')) {
      i++
      return { not: compare() }
    }
    if (isWord('EXISTS')) {
      i++
      need('(')
      const n = t[i++]
      need(')')
      return { exists: n?.v }
    }
    const left = value()
    if (left.group) return left.group
    if (isWord('IS')) {
      i++
      const neg = isWord('NOT') && Boolean(++i)
      if (!isWord('NULL')) throw new Error('Expected NULL after IS')
      i++
      return { isNull: left, neg }
    }
    const neg = isWord('NOT') && Boolean(++i)
    if (isWord('IN')) {
      i++
      need('(')
      const list = [value()]
      while (isOp(',')) (i++, list.push(value()))
      need(')')
      return { in: left, list, neg }
    }
    if (isWord('LIKE')) {
      i++
      return { like: left, pattern: value(), neg }
    }
    const op = peek()
    if (op?.k !== 'op' || !['=', '<>', '!=', '>', '<', '>=', '<='].includes(op.v)) throw new Error('Expected a comparison such as = or IN')
    i++
    return { cmp: op.v, left, right: value() }
  }
  const and = () => {
    let e = compare()
    while (isWord('AND')) (i++, (e = { and: [e, compare()] }))
    return e
  }
  const or = () => {
    let e = and()
    while (isWord('OR')) (i++, (e = { or: [e, and()] }))
    return e
  }
  const tree = or()
  if (i < t.length) throw new Error(`Unexpected '${t[i].v}'`)
  return tree
}
export function filterError(sql) {
  if (!String(sql ?? '').trim()) return 'The SQL expression is empty.'
  try {
    parse(sql)
    return null
  } catch (e) {
    return `The SQL expression is not valid: ${e.message}.`
  }
}
const SYS = { messageid: 'messageId', correlationid: 'correlationId', sessionid: 'sessionId', contenttype: 'contentType', label: 'subject', subject: 'subject', to: 'to', replyto: 'replyTo' }
function lookup(m, name) {
  const n = String(name)
  if (/^sys\./i.test(n)) return m[SYS[n.slice(4).toLowerCase()]] ?? null
  const key = /^user\./i.test(n) ? n.slice(5) : n
  const props = m.properties ?? {}
  const hit = Object.keys(props).find((k) => lower(k) === lower(key))
  return hit === undefined ? null : props[hit]
}
function evaluate(e, m) {
  const v = (x) => (x.lit !== undefined ? x.lit : x.name !== undefined ? lookup(m, x.name) : evaluate(x.group, m))
  if (e.and) return evaluate(e.and[0], m) && evaluate(e.and[1], m)
  if (e.or) return evaluate(e.or[0], m) || evaluate(e.or[1], m)
  if (e.not) return !evaluate(e.not, m)
  if (e.exists !== undefined) return lookup(m, e.exists) !== null
  if (e.isNull) return (v(e.isNull) === null) !== e.neg
  if (e.in) {
    const x = v(e.in)
    return x !== null && e.list.some((y) => String(v(y)) === String(x)) !== e.neg
  }
  if (e.like) {
    const x = v(e.like)
    if (x === null) return false
    const re = new RegExp(`^${String(v(e.pattern)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
    return re.test(String(x)) !== e.neg
  }
  if (e.cmp) {
    const [a, b] = [v(e.left), v(e.right)]
    if (a === null || b === null) return false
    const num = typeof a === 'number' || typeof b === 'number'
    const [x, y] = num ? [Number(a), Number(b)] : [String(a), String(b)]
    return { '=': x === y, '<>': x !== y, '!=': x !== y, '>': x > y, '<': x < y, '>=': x >= y, '<=': x <= y }[e.cmp]
  }
  return Boolean(v(e))
}
export function matches(sql, m) {
  try {
    return evaluate(parse(sql), m)
  } catch {
    return false
  }
}

// ---------- sending and receiving (on a draft) ----------

// Puts a message on a queue or topic. Returns { ok, sequenceNumber, duplicate } or an error.
function enqueue(sb, ns, e, msg, now, kind = 'queue', topic) {
  const body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body ?? '')
  const size = body.length + JSON.stringify(msg.properties ?? {}).length
  if (size > MAX_MESSAGE) return ERR.tooBig(size)
  const target = kind === 'topic' ? Object.values(e.subscriptions ?? {}) : [e]
  if (kind === 'queue' && e.sessions && !String(msg.sessionId ?? '').trim()) return ERR.needsSessionId()
  const total = kind === 'topic' ? topicCounts(e).sizeBytes : countsOf(e).sizeBytes
  if (total + size > e.maxSizeMb * 1048576) return ERR.quota(ns.name, e.name, total, e.maxSizeMb * 1048576)
  const seq = ++ns.seq
  const messageId = String(msg.messageId ?? '').trim() || guid(`${ns.name}:${seq}`)
  if (e.dupDetect) {
    tidy(e, now)
    // a duplicate inside the window is accepted and dropped by the broker
    if (e.seenIds[messageId] !== undefined) return { ok: true, sequenceNumber: null, duplicate: true, messageId }
    e.seenIds[messageId] = now
  }
  const scheduled = msg.scheduledEnqueueTime && msg.scheduledEnqueueTime > now
  const m = {
    seq,
    messageId,
    body,
    contentType: msg.contentType ?? null,
    correlationId: msg.correlationId ?? null,
    sessionId: String(msg.sessionId ?? '').trim() || null,
    subject: msg.subject ?? null,
    properties: { ...(msg.properties ?? {}) },
    enqueued: scheduled ? msg.scheduledEnqueueTime : now,
    deliveryCount: 0,
    state: scheduled ? 'Scheduled' : 'Active',
    ...(scheduled && { scheduledFor: msg.scheduledEnqueueTime }),
  }
  for (const t of target) {
    if (kind === 'topic' && !(t.rules ?? []).some((r) => matches(r.sql, m))) continue
    if (kind === 'topic' && t.sessions && !m.sessionId) continue // lab: the real broker dead letters it on the subscription
    keep(t.messages, structuredClone(m), 2000)
  }
  return { ok: true, sequenceNumber: seq, messageId, duplicate: false }
}

const lockToken = (e, seq) => guid(`lock:${e.name}:${seq}:${(e.locks = (e.locks ?? 0) + 1)}`)
const view = (m) => structuredClone(m)

// The messages a receiver may take now: active, not locked, not deferred; one session only for a session receiver
function takeable(e, now, sessionId) {
  return e.messages.filter((m) => m.state === 'Active' && !locked(m, now) && (sessionId ? m.sessionId === sessionId : true))
}

function receiveFrom(e, now, { mode = 'PeekLock', max = 1, receiver = 'receiver', sessionId, dead = false } = {}) {
  tidy(e, now)
  if (dead) {
    const list = e.dlq.filter((m) => !locked(m, now)).slice(0, max)
    for (const m of list) {
      m.deliveryCount++
      if (mode === 'ReceiveAndDelete') e.dlq = e.dlq.filter((x) => x !== m)
      else Object.assign(m, { lockedUntil: now + e.lockMs, lockToken: lockToken(e, m.seq), owner: receiver })
    }
    return { ok: true, messages: list.map(view) }
  }
  if (e.sessions && !sessionId) return ERR.needsSessionReceiver()
  if (!e.sessions && sessionId) return ERR.noSessions()
  if (sessionId) {
    const l = e.sessionLocks[sessionId]
    if (!l || l.owner !== receiver || l.lockedUntil <= now) return ERR.sessionLost(sessionId)
  }
  const list = takeable(e, now, sessionId).slice(0, max)
  for (const m of list) {
    m.deliveryCount++
    if (mode === 'ReceiveAndDelete') e.messages = e.messages.filter((x) => x !== m)
    else Object.assign(m, { lockedUntil: sessionId ? e.sessionLocks[sessionId].lockedUntil : now + e.lockMs, lockToken: lockToken(e, m.seq), owner: receiver })
  }
  return { ok: true, messages: list.map(view) }
}

function acceptSessionOn(e, now, { receiver = 'receiver', sessionId } = {}) {
  tidy(e, now)
  if (!e.sessions) return ERR.noSessions()
  const free = (id) => !e.sessionLocks[id] || e.sessionLocks[id].owner === receiver
  let id = sessionId
  if (id) {
    if (!free(id)) return ERR.sessionLocked(id)
  } else {
    id = takeable(e, now).map((m) => m.sessionId).find((x) => x && free(x))
    if (!id) return ERR.noSession()
  }
  e.sessionLocks[id] = { owner: receiver, lockedUntil: now + e.lockMs, since: e.sessionLocks[id]?.since ?? now }
  return { ok: true, sessionId: id, lockedUntil: now + e.lockMs }
}

// Closing a session receiver: the session lock ends and messages it held and did not settle are free again
function releaseSessionOn(e, now, sessionId, receiver) {
  const l = e.sessionLocks[sessionId]
  if (l && l.owner === receiver) delete e.sessionLocks[sessionId]
  for (const m of e.messages) if (m.sessionId === sessionId && m.owner === receiver) for (const k of ['lockedUntil', 'lockToken', 'owner']) delete m[k]
  tidy(e, now)
  return { ok: true }
}

// complete, abandon, deadLetter, defer and renewLock. `at` is when the call happens (now plus the time the flow
// took), so a flow that runs past the lock gets MessageLockLost, as in Azure.
function settleOn(e, now, token, action, { at = now, reason, description, dead = false } = {}) {
  const list = dead ? e.dlq : e.messages
  const m = list.find((x) => x.lockToken === token)
  if (!m || (m.lockedUntil ?? 0) <= at) return m?.sessionId && !dead ? ERR.sessionLost(m.sessionId) : ERR.lockLost()
  if (m.sessionId && !dead) {
    const l = e.sessionLocks[m.sessionId]
    if (!l || l.lockedUntil <= at) return ERR.sessionLost(m.sessionId)
  }
  const unlock = () => ['lockedUntil', 'lockToken', 'owner'].forEach((k) => delete m[k])
  if (action === 'complete') {
    if (dead) e.dlq = e.dlq.filter((x) => x !== m)
    else e.messages = e.messages.filter((x) => x !== m)
  } else if (action === 'abandon') {
    unlock()
    if (!dead && m.deliveryCount >= e.maxDelivery) deadLetter(e, m, at, 'MaxDeliveryCountExceeded', `Message could not be consumed after ${e.maxDelivery} delivery attempts.`)
  } else if (action === 'deadLetter') {
    if (dead) return fail('InvalidOperation', 'A message in the dead letter queue cannot be dead lettered again.')
    deadLetter(e, m, at, reason || 'DeadLetteredByReceiver', description || '')
  } else if (action === 'defer') {
    unlock()
    m.state = 'Deferred'
  } else if (action === 'renewLock') {
    m.lockedUntil = at + e.lockMs
    if (m.sessionId && !dead) e.sessionLocks[m.sessionId].lockedUntil = m.lockedUntil
    return { ok: true, lockedUntil: m.lockedUntil }
  } else return fail('InvalidOperation', `Unknown settlement ${action}.`)
  return { ok: true }
}

// ---------- connection strings and claims ----------

export function connectionString(s, ns, policy, which = 'primary') {
  const n = namespaceOf(s, ns)
  const p = n?.policies.find((x) => x.name === policy)
  if (!p) return ''
  return `Endpoint=sb://${hostOf(ns)}/;SharedAccessKeyName=${policy};SharedAccessKey=${keyOf(ns, policy, which, p.round[which])}`
}
export const keysOf = (ns, p, scope = '') => ({ primary: keyOf(ns, `${scope}${p.name}`, 'primary', p.round.primary), secondary: keyOf(ns, `${scope}${p.name}`, 'secondary', p.round.secondary) })
// A policy on one queue or topic (Settings, Shared access policies of the entity). Its connection string carries
// EntityPath, and its keys work for that entity only. Old saves have no entity policies: `policies` may be missing.
export const entityPoliciesOf = (e) => e?.policies ?? []
const scopeOf = (path) => `${String(path).toLowerCase()}/`
export function entityConnectionString(s, ns, path, policy, which = 'primary') {
  const n = namespaceOf(s, ns)
  const r = n && resolve(n, path)
  const p = r && entityPoliciesOf(r.entity).find((x) => x.name === policy)
  if (!p) return ''
  return `Endpoint=sb://${hostOf(ns)}/;SharedAccessKeyName=${policy};SharedAccessKey=${keysOf(ns, p, scopeOf(r.path))[which]};EntityPath=${r.path}`
}

export function parseConnectionString(text) {
  const parts = {}
  for (const piece of String(text ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const at = piece.indexOf('=')
    if (at < 1) return ERR.connection(`'${piece}' is not a key=value pair`)
    parts[piece.slice(0, at).toLowerCase()] = piece.slice(at + 1)
  }
  const m = /^sb:\/\/([^/]+?)\/?$/.exec(parts.endpoint ?? '')
  if (!m) return ERR.connection('Endpoint is missing or is not sb://<host>/')
  if (!parts.sharedaccesskeyname || !parts.sharedaccesskey) return ERR.connection('SharedAccessKeyName and SharedAccessKey are required')
  return { ok: true, host: m[1].toLowerCase(), namespace: m[1].toLowerCase().split('.')[0], keyName: parts.sharedaccesskeyname, key: parts.sharedaccesskey, entityPath: parts.entitypath ?? null }
}

// Checks the connection string and the claim, and finds the entity. Returns { ns, r } or an error.
function access(s, conn, path, claim) {
  const c = parseConnectionString(conn)
  if (!c.ok) return c
  const ns = namespacesOf(s).find((n) => hostOf(n.name) === c.host)
  if (!ns) return ERR.noNamespace(c.host)
  const target = path || c.entityPath
  // a namespace policy, or a policy of the entity named in EntityPath, which reaches that entity only
  const scoped = !ns.policies.some((x) => x.name === c.keyName) && c.entityPath ? resolve(ns, c.entityPath) : null
  const p = scoped ? entityPoliciesOf(scoped.entity).find((x) => x.name === c.keyName) : ns.policies.find((x) => x.name === c.keyName)
  const keys = p && keysOf(ns.name, p, scoped ? scopeOf(scoped.path) : '')
  if (!p || (c.key !== keys.primary && c.key !== keys.secondary)) return ERR.signature()
  // lab wording: Azure refuses a token of one entity on another one as unauthorized
  const reached = scoped && resolve(ns, target)?.path.toLowerCase()
  // a topic policy reaches the subscriptions of the topic too
  if (scoped && reached !== scoped.path.toLowerCase() && !String(reached).startsWith(scopeOf(scoped.path))) return { ...ERR.claim(ns.name, target ?? '', claim), ns }
  const has = p.claims.includes('Manage') || p.claims.includes(claim)
  if (!has) return { ...ERR.claim(ns.name, target ?? '', claim), ns }
  const r = resolve(ns, target)
  if (!r) return { ...ERR.notFound(ns.name, target ?? ''), ns }
  return { ok: true, ns, r }
}

// The API packages get as ctx.serviceBus. `conn` is a SAS connection string; `path` an entity path such as
// "orders", "orders/$DeadLetterQueue" or "store-events/subscriptions/warehouse".
export function serviceBusCtx(s, app) {
  const who = app?.name ?? null
  const run = (op, conn, path, claim, fn) => {
    if (!s.serviceBus) return ERR.noNamespace(parseConnectionString(conn).host ?? 'unknown')
    upgradeServiceBus(s)
    const a = access(s, conn, path, claim)
    if (!a.ok) {
      if (a.ns) {
        const { ns, ...err } = a
        request(ns, s.clock ?? 0, op, path, err, who)
        return err
      }
      return a
    }
    const r = fn(a.r, a.ns, s.clock ?? 0)
    request(a.ns, s.clock ?? 0, op, a.r.path + (a.r.dead ? `/${DLQ}` : ''), r, who)
    return r
  }
  const queueLike = (r) => (r.kind === 'topic' ? ERR.topicReceive(r.path) : null)
  // action: complete, abandon, deadLetter, defer, renewLock. opts: { elapsedMs, reason, description }
  const settle = (conn, path, token, action, opts = {}) =>
    run(action[0].toUpperCase() + action.slice(1), conn, path, 'Listen', (r, ns, now) => queueLike(r) ?? settleOn(r.entity, now, token, action, { ...opts, at: now + (opts.elapsedMs ?? 0), dead: r.dead }))
  return {
    parse: parseConnectionString,
    // what a sender or receiver link checks when it opens: the key and the claim on the entity, nothing sent
    check: (conn, path, claim) => run(`Open ${claim} link`, conn, path, claim, (r) => ({ ok: true, path: r.path, kind: r.kind })),
    // one message or a list; { body, messageId, sessionId, correlationId, contentType, subject, properties, scheduledEnqueueTime }
    send: (conn, path, messages) =>
      run('Send', conn, path, 'Send', (r, ns, now) => {
        if (r.dead) return fail('InvalidOperation', 'Messages cannot be sent to a dead letter queue.')
        const out = []
        for (const m of [].concat(messages)) {
          const x = enqueue(s.serviceBus, ns, r.entity, m, now, r.kind)
          if (!x.ok) return x
          out.push(x)
        }
        // one message gives its own result: { ok, sequenceNumber, messageId, duplicate }
        return Array.isArray(messages) ? { ok: true, results: out, sequenceNumbers: out.map((x) => x.sequenceNumber) } : out[0]
      }),
    // { mode: 'PeekLock' | 'ReceiveAndDelete', max, receiver, sessionId }
    receive: (conn, path, opts = {}) => run('Receive', conn, path, 'Listen', (r, ns, now) => queueLike(r) ?? receiveFrom(r.entity, now, { ...opts, dead: r.dead })),
    peek: (conn, path, opts = {}) =>
      run('Peek', conn, path, 'Listen', (r) => {
        if (r.kind === 'topic') return ERR.topicReceive(r.path)
        const list = r.dead ? r.entity.dlq : r.entity.messages
        return { ok: true, messages: list.filter((m) => m.seq >= (opts.fromSeq ?? 0)).slice(0, opts.max ?? 32).map(view) }
      }),
    acceptSession: (conn, path, opts = {}) => run('AcceptSession', conn, path, 'Listen', (r, ns, now) => queueLike(r) ?? acceptSessionOn(r.entity, now, opts)),
    releaseSession: (conn, path, sessionId, receiver = 'receiver') => run('CloseSession', conn, path, 'Listen', (r, ns, now) => queueLike(r) ?? releaseSessionOn(r.entity, now, sessionId, receiver)),
    settle,
    complete: (conn, path, token, opts) => settle(conn, path, token, 'complete', opts),
    abandon: (conn, path, token, opts) => settle(conn, path, token, 'abandon', opts),
    deadLetter: (conn, path, token, opts) => settle(conn, path, token, 'deadLetter', opts),
    defer: (conn, path, token, opts) => settle(conn, path, token, 'defer', opts),
    renewLock: (conn, path, token, opts) => settle(conn, path, token, 'renewLock', opts),
    // a deferred message is received again by its sequence number
    receiveDeferred: (conn, path, seq, receiver = 'receiver') =>
      run('ReceiveDeferred', conn, path, 'Listen', (r, ns, now) => {
        const m = r.entity.messages.find((x) => x.seq === seq && x.state === 'Deferred')
        if (!m) return fail('MessageNotFound', `Failed to lock one or more specified messages. The message with sequence number ${seq} was not found.`)
        m.state = 'Active'
        m.deliveryCount++
        Object.assign(m, { lockedUntil: now + r.entity.lockMs, lockToken: lockToken(r.entity, m.seq), owner: receiver })
        return { ok: true, messages: [view(m)] }
      }),
  }
}

// ---------- portal actions: each takes the whole lab state and returns a new one ----------

const edit = (state, ns, fn) => {
  const s = upgradeServiceBus(structuredClone(state))
  const n = namespaceOf(s, ns)
  if (!n) return s
  fn(n, s.clock ?? 0, s)
  return s
}
const logOp = (n, now, op, text, ok = true) => keep(n.log, { t: now, op, text, ok, who: 'you@harbor.lab' }, 80)

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,258}[A-Za-z0-9_]$|^[A-Za-z0-9]$/
const SUB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,48}[A-Za-z0-9_]$|^[A-Za-z0-9]$/
// The errors of a create or edit form. f: { name, lockMs, maxDelivery, ttlMs, dupWindowMs, maxSizeMb, ... }
export function entityErrors(s, ns, f, { kind = 'queue', topic, editing = false } = {}) {
  const n = namespaceOf(s, ns)
  const e = []
  if (!editing) {
    if (!(kind === 'subscription' ? SUB_NAME : NAME).test(f.name ?? ''))
      e.push(kind === 'subscription' ? 'The name has 1 to 50 characters: letters, numbers, periods, hyphens and underscores, and starts and ends with a letter or number.' : 'The name has 1 to 260 characters: letters, numbers, periods, hyphens and underscores, and starts and ends with a letter or number.')
    else if (kind === 'subscription' ? pick(pick(n?.topics, topic)?.subscriptions, f.name) : pick(n?.queues, f.name) || pick(n?.topics, f.name)) e.push(`The messaging entity '${f.name}' already exists.`)
  }
  if (kind !== 'topic') {
    if (!(f.lockMs >= 5 * SECOND && f.lockMs <= MAX_LOCK)) e.push('Lock duration is from 5 seconds to 5 minutes.')
    if (!Number.isInteger(f.maxDelivery) || f.maxDelivery < 1 || f.maxDelivery > 2000) e.push('Max delivery count is a whole number from 1 to 2000.')
  }
  if (!(f.ttlMs >= SECOND)) e.push('Message time to live is at least 1 second.')
  if (f.dupDetect && !(f.dupWindowMs >= 20 * SECOND && f.dupWindowMs <= MAX_DUP_WINDOW)) e.push('The duplicate detection window is from 20 seconds to 7 days.')
  if (kind !== 'subscription' && !SIZES_MB.includes(Number(f.maxSizeMb))) e.push('Max size is 1, 2, 3, 4 or 5 GB on the Standard tier.')
  return e
}

export const createQueue = (state, ns, f) =>
  edit(state, ns, (n, now) => {
    if (entityErrors(state, ns, f).length) return
    n.queues[f.name] = newEntity(f.name, f, now)
    logOp(n, now, 'Create or Update Queue', f.name)
  })
export const createTopic = (state, ns, f) =>
  edit(state, ns, (n, now) => {
    if (entityErrors(state, ns, f, { kind: 'topic' }).length) return
    n.topics[f.name] = { ...newEntity(f.name, f, now), subscriptions: {} }
    logOp(n, now, 'Create or Update Topic', f.name)
  })
export const createSubscription = (state, ns, topic, f) =>
  edit(state, ns, (n, now) => {
    const t = pick(n.topics, topic)
    if (!t || entityErrors(state, ns, f, { kind: 'subscription', topic }).length) return
    t.subscriptions[f.name] = newSubscription(f.name, { ...f, rules: f.sql ? [{ name: f.ruleName || 'filter', sql: f.sql }] : undefined }, now)
    logOp(n, now, 'Create or Update Subscription', `${t.name}/${f.name}`)
  })

// Sessions, duplicate detection and the entity kind cannot change after create, as in Azure
const MUTABLE = ['lockMs', 'maxDelivery', 'ttlMs', 'dlOnExpire', 'maxSizeMb', 'dupWindowMs', 'status']
export const updateEntity = (state, ns, path, patch) =>
  edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (!r) return
    for (const k of MUTABLE) if (k in patch && (k !== 'dupWindowMs' || r.entity.dupDetect)) r.entity[k] = patch[k]
    r.entity.updated = now
    logOp(n, now, `Create or Update ${r.kind === 'queue' ? 'Queue' : r.kind === 'topic' ? 'Topic' : 'Subscription'}`, r.path)
  })
export const deleteEntity = (state, ns, path) =>
  edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (!r) return
    if (r.kind === 'queue') delete n.queues[r.entity.name]
    else if (r.kind === 'topic') delete n.topics[r.entity.name]
    else delete r.topic.subscriptions[r.entity.name]
    logOp(n, now, `Delete ${r.kind}`, r.path)
  })

export const setRule = (state, ns, path, rule, sql) =>
  edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (r?.kind !== 'subscription' || filterError(sql)) return
    const x = r.entity.rules.find((y) => y.name === rule)
    if (x) x.sql = sql
    else r.entity.rules.push({ name: rule, sql })
    logOp(n, now, 'Create or Update Rule', `${r.path}/rules/${rule}`)
  })
export const deleteRule = (state, ns, path, rule) =>
  edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (r?.kind !== 'subscription') return
    r.entity.rules = r.entity.rules.filter((y) => y.name !== rule)
    logOp(n, now, 'Delete Rule', `${r.path}/rules/${rule}`)
  })

export function policyErrors(s, ns, name, claims) {
  const e = []
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(name ?? '')) e.push('The policy name has 1 to 256 characters: letters, numbers, periods, hyphens and underscores.')
  else if (namespaceOf(s, ns)?.policies.some((p) => lower(p.name) === lower(name))) e.push(`A policy named ${name} exists already.`)
  if (!claims.length) e.push('Select at least one claim.')
  if (claims.includes('Manage') && !(claims.includes('Send') && claims.includes('Listen'))) e.push('Manage requires Send and Listen.')
  return e
}
export const addPolicy = (state, ns, name, claims) =>
  edit(state, ns, (n, now) => {
    if (policyErrors(state, ns, name, claims).length) return
    n.policies.push(newPolicy(ns, name, CLAIMS.filter((c) => claims.includes(c))))
    logOp(n, now, 'Create or Update Authorization Rule', name)
  })
export const setPolicyClaims = (state, ns, name, claims) =>
  edit(state, ns, (n, now) => {
    const p = n.policies.find((x) => x.name === name)
    if (!p || p.name === 'RootManageSharedAccessKey' || !claims.length) return
    p.claims = CLAIMS.filter((c) => claims.includes(c) || (claims.includes('Manage') && c !== 'Manage'))
    logOp(n, now, 'Create or Update Authorization Rule', name)
  })
export const removePolicy = (state, ns, name) =>
  edit(state, ns, (n, now) => {
    if (name === 'RootManageSharedAccessKey') return
    n.policies = n.policies.filter((p) => p.name !== name)
    logOp(n, now, 'Delete Authorization Rule', name)
  })
// Shared access policies of one queue or topic
export function entityPolicyErrors(s, ns, path, name, claims) {
  const n = namespaceOf(s, ns)
  const r = n && resolve(n, path)
  const e = []
  if (!r || r.kind === 'subscription') return ['Shared access policies belong to a queue or a topic.']
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(name ?? '')) e.push('The policy name has 1 to 256 characters: letters, numbers, periods, hyphens and underscores.')
  else if (entityPoliciesOf(r.entity).some((p) => lower(p.name) === lower(name))) e.push(`A policy named ${name} exists already.`)
  if (!claims.length) e.push('Select at least one claim.')
  if (claims.includes('Manage') && !(claims.includes('Send') && claims.includes('Listen'))) e.push('Manage requires Send and Listen.')
  return e
}
export const addEntityPolicy = (state, ns, path, name, claims) =>
  edit(state, ns, (n, now) => {
    if (entityPolicyErrors(state, ns, path, name, claims).length) return
    const r = resolve(n, path)
    r.entity.policies = [...entityPoliciesOf(r.entity), newPolicy(ns, name, CLAIMS.filter((c) => claims.includes(c)))]
    logOp(n, now, 'Create or Update Authorization Rule', `${r.path}/${name}`)
  })
export const removeEntityPolicy = (state, ns, path, name) =>
  edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (!r) return
    r.entity.policies = entityPoliciesOf(r.entity).filter((p) => p.name !== name)
    logOp(n, now, 'Delete Authorization Rule', `${r.path}/${name}`)
  })
export const regenerateEntityKey = (state, ns, path, name, which) =>
  edit(state, ns, (n, now) => {
    const p = entityPoliciesOf(resolve(n, path)?.entity).find((x) => x.name === name)
    if (!p) return
    p.round[which]++
    logOp(n, now, 'Regenerate Keys', `${path}/${name} ${which} key`)
  })

// A new key. Every app that has the old one gets InvalidSignature until it gets the new one.
export const regenerateKey = (state, ns, name, which) =>
  edit(state, ns, (n, now) => {
    const p = n.policies.find((x) => x.name === name)
    if (!p) return
    p.round[which]++
    logOp(n, now, 'Regenerate Keys', `${name} ${which} key`)
  })

// ---------- Service Bus Explorer (the portal user, who has the Data Owner role in the lab) ----------

export function peekMessages(state, ns, path, { dead = false, fromSeq = 0, max = 32 } = {}) {
  const n = namespaceOf(state, ns)
  const r = n && resolve(n, path)
  if (!r || r.kind === 'topic') return []
  return (dead ? r.entity.dlq : r.entity.messages).filter((m) => m.seq >= fromSeq).slice(0, max)
}

// Returns { state, result }
export function explorerSend(state, ns, path, msg) {
  let result = null
  const s = edit(state, ns, (n, now, draft) => {
    const r = resolve(n, path)
    if (!r) return void (result = ERR.notFound(ns, path))
    result = enqueue(draft.serviceBus, n, r.entity, msg, now, r.kind)
    request(n, now, 'Send', r.path, result, 'Service Bus Explorer')
  })
  return { state: s, result }
}
export function explorerReceive(state, ns, path, { dead = false, mode = 'PeekLock', max = 1, sessionId } = {}) {
  let result = null
  const s = edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (!r) return void (result = ERR.notFound(ns, path))
    if (r.kind === 'topic') return void (result = ERR.topicReceive(r.path))
    const receiver = 'Service Bus Explorer'
    if (r.entity.sessions && !dead) {
      const a = acceptSessionOn(r.entity, now, { receiver, sessionId })
      if (!a.ok) return void (result = a)
      result = receiveFrom(r.entity, now, { mode, max, receiver, sessionId: a.sessionId })
      if (mode === 'ReceiveAndDelete') releaseSessionOn(r.entity, now, a.sessionId, receiver)
    } else result = receiveFrom(r.entity, now, { mode, max, receiver, dead })
    request(n, now, 'Receive', r.path + (dead ? `/${DLQ}` : ''), result, receiver)
  })
  return { state: s, result }
}
export function explorerSettle(state, ns, path, token, action, { dead = false, reason, description } = {}) {
  let result = null
  const s = edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (!r) return void (result = ERR.notFound(ns, path))
    result = settleOn(r.entity, now, token, action, { dead, reason, description })
    const m = [...r.entity.messages, ...r.entity.dlq].find((x) => x.lockToken === token)
    if (r.entity.sessions && !dead && action !== 'renewLock' && (result.ok || !m)) {
      const sid = Object.entries(r.entity.sessionLocks).find(([, l]) => l.owner === 'Service Bus Explorer')?.[0]
      if (sid && !r.entity.messages.some((x) => x.sessionId === sid && x.owner === 'Service Bus Explorer')) releaseSessionOn(r.entity, now, sid, 'Service Bus Explorer')
    }
    request(n, now, action[0].toUpperCase() + action.slice(1), r.path + (dead ? `/${DLQ}` : ''), result, 'Service Bus Explorer')
  })
  return { state: s, result }
}

// Re-send selected messages from the dead letter queue: each is sent again to its entity with its body, IDs and
// properties, and leaves the dead letter queue (lab: the portal sends a copy; the lab also removes the original,
// as a team does after a re-send). A queue with duplicate detection drops a message ID it saw inside the window.
export function resendDeadLetters(state, ns, path, seqs) {
  let result = { ok: true, sent: 0, duplicates: 0 }
  const s = edit(state, ns, (n, now, draft) => {
    const r = resolve(n, path)
    if (!r || r.kind === 'topic') return void (result = ERR.notFound(ns, path))
    const e = r.entity
    tidy(e, now)
    const moving = e.dlq.filter((m) => (!seqs || seqs.includes(m.seq)) && !locked(m, now))
    for (const m of moving) {
      e.dlq = e.dlq.filter((x) => x !== m)
      // a subscription gets the copy directly; the lab sends it to the entity itself, not to the topic
      const x = enqueue(draft.serviceBus, n, e, { body: m.body, messageId: m.messageId, sessionId: m.sessionId, correlationId: m.correlationId, contentType: m.contentType, subject: m.subject, properties: m.properties }, now, 'queue')
      if (!x.ok) {
        e.dlq.push(m)
        result = x
        return
      }
      if (x.duplicate) result.duplicates++
      else {
        result.sent++
        keep(e.resent, { messageId: m.messageId, seq: x.sequenceNumber, t: now }, 200)
      }
    }
    request(n, now, 'Resend', `${r.path}/${DLQ}`, { ok: true }, 'Service Bus Explorer')
    logOp(n, now, 'Re-send messages', `${result.sent} from ${r.path}/${DLQ}`)
  })
  return { state: s, result }
}
export const purgeDeadLetters = (state, ns, path, seqs) =>
  edit(state, ns, (n, now) => {
    const r = resolve(n, path)
    if (!r || r.kind === 'topic') return
    r.entity.dlq = r.entity.dlq.filter((m) => seqs && !seqs.includes(m.seq))
    logOp(n, now, 'Purge messages', `${r.path}/${DLQ}`)
  })
