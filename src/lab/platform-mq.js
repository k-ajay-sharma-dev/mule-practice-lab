// Anypoint MQ of the Platform Lab: queue settings, FIFO message groups, message exchanges, the message browser lock,
// client apps and the move back from a dead letter queue. Pure: every action takes a state and returns a new one.
// It does not import platform.js, so the engine can import it. Sending still goes through sendMessage of platform.js,
// which puts the message and lets the consumers take it; tagSent() adds the properties and group after that.
//
// Facts from docs.mulesoft.com/mq/mq-queues and mq-exchanges (checked November 2026):
// standard queues deliver at least once with no order; FIFO queues keep the order inside a message group and deliver
// exactly once; the largest message TTL is two weeks; the largest acknowledgement timeout (lock TTL) is 12 hours;
// a dead letter queue has the type of its source queue, and "Delivery attempts before reroute" goes from 1 to 1000,
// 10 if not set; the message browser gets 1 to 500 messages, 10 at most for a FIFO queue; returning a message from the
// browser is a NACK and counts as a failed delivery; leaving the browser page returns the messages; standard queues
// bind to a standard exchange and FIFO queues to a FIFO exchange, 450 bindings at most.

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const MAX_TTL = 14 * DAY
export const MAX_LOCK_TTL = 12 * HOUR
// The docs give no defaults. These are the values the console offers in a new queue (lab choice).
export const DEFAULT_TTL = 7 * DAY
export const DEFAULT_LOCK_TTL = 2 * MINUTE
export const DEFAULT_ATTEMPTS = 10
export const MAX_ATTEMPTS = 1000
export const MAX_BINDINGS = 450
export const BROWSE_MAX = 500
export const BROWSE_MAX_FIFO = 10
export const DEFAULT_GROUP = 'default'

export const STANDARD = 'Standard queue'
export const FIFO = 'FIFO queue'
export const TIME_UNITS = { seconds: SECOND, minutes: MINUTE, hours: HOUR, days: DAY }

const edit = (state, fn) => {
  const s = structuredClone(state)
  fn(s)
  return s
}
const queueOf = (s, name) => s.queues.find((q) => q.name === name)

// ---------- reading a queue ----------

export const isFifo = (q) => /fifo/i.test(q?.type ?? '')
export const ttlOf = (q) => q.ttl ?? DEFAULT_TTL
export const lockTtlOf = (q) => q.lockTtl ?? DEFAULT_LOCK_TTL
export const attemptsOf = (q) => q.attempts ?? DEFAULT_ATTEMPTS
// a queue is a dead letter queue when another queue sends its failed messages there
export const sourcesOf = (s, name) => s.queues.filter((q) => q.dlq === name).map((q) => q.name)
export const isDlq = (s, name) => sourcesOf(s, name).length > 0
export const groupOf = (m) => m.group ?? DEFAULT_GROUP
const locked = (m, now) => (m.lockedUntil ?? 0) > now
const expired = (q, m, now) => m.t + ttlOf(q) <= now
// in flight: taken by a client (here, the message browser) and not acknowledged yet. Ready: waiting for a consumer.
export const inFlight = (q, now) => q.messages.filter((m) => locked(m, now) && !expired(q, m, now))
export const ready = (q, now) => q.messages.filter((m) => !locked(m, now) && !expired(q, m, now))

export function durationText(ms) {
  for (const [unit, size] of [['days', DAY], ['hours', HOUR], ['minutes', MINUTE], ['seconds', SECOND]]) {
    if (ms >= size && ms % size === 0) {
      const n = ms / size
      return `${n} ${n === 1 ? unit.slice(0, -1) : unit}`
    }
  }
  return `${ms} ms`
}

// ---------- create and change ----------

const NAME = /^[A-Za-z0-9._\-:/]{1,127}$/
const nameTaken = (s, name) => s.queues.some((q) => q.name === name) || (s.exchanges ?? []).some((x) => x.name === name)

// The errors of a Create Queue form, or [] when it can be saved. `f`: { name, fifo, ttl, lockTtl, encrypted, dlq, attempts }
export function queueErrors(s, f, editing = false) {
  const e = []
  if (!editing) {
    if (!NAME.test(f.name ?? '')) e.push('The ID has 1 to 127 characters: letters, digits, dots, colons, slashes, hyphens and underscores.')
    else if (nameTaken(s, f.name)) e.push(`A destination named ${f.name} exists already.`)
  }
  if (!(f.ttl > 0) || f.ttl > MAX_TTL) e.push('Message TTL is above 0 and at most 14 days.')
  if (!(f.lockTtl > 0) || f.lockTtl > MAX_LOCK_TTL) e.push('Default Acknowledgment Timeout is above 0 and at most 12 hours.')
  if (f.dlq) {
    const d = queueOf(s, f.dlq)
    if (!d) e.push(`The dead letter queue ${f.dlq} does not exist.`)
    else if (isFifo(d) !== Boolean(f.fifo)) e.push('A dead letter queue has the same type as its source queue.')
    if (f.dlq === f.name) e.push('A queue cannot be its own dead letter queue.')
    if (!Number.isInteger(f.attempts) || f.attempts < 1 || f.attempts > MAX_ATTEMPTS) e.push('Delivery attempts before reroute is a whole number from 1 to 1000.')
  }
  return e
}

export const createQueue = (state, f) =>
  edit(state, (s) => {
    s.queues.push({
      name: f.name,
      type: f.fifo ? FIFO : STANDARD,
      dlq: f.dlq ?? '',
      attempts: f.dlq ? f.attempts : DEFAULT_ATTEMPTS,
      ttl: f.ttl ?? DEFAULT_TTL,
      lockTtl: f.lockTtl ?? DEFAULT_LOCK_TTL,
      encrypted: Boolean(f.encrypted),
      messages: [],
    })
  })

// TTL, lock TTL, encryption and the dead letter queue of a queue. The type cannot change after create.
export const setQueue = (state, name, patch) =>
  edit(state, (s) => {
    const q = queueOf(s, name)
    if (!q) return
    for (const k of ['ttl', 'lockTtl', 'encrypted', 'dlq', 'attempts']) if (k in patch) q[k] = patch[k]
  })
export const setTtl = (state, name, ttl, lockTtl) => setQueue(state, name, { ...(ttl !== undefined && { ttl }), ...(lockTtl !== undefined && { lockTtl }) })

// The queue goes, and with it its bindings and the dead letter links that point to it
export const deleteQueue = (state, name) =>
  edit(state, (s) => {
    s.queues = s.queues.filter((q) => q.name !== name)
    for (const q of s.queues) if (q.dlq === name) q.dlq = ''
    for (const x of s.exchanges ?? []) x.bindings = x.bindings.filter((b) => b !== name)
  })

// ---------- message exchanges ----------

export const exchangesOf = (s) => s.exchanges ?? []
export const exchangeOf = (s, name) => exchangesOf(s).find((x) => x.name === name)

export function exchangeErrors(s, f) {
  const e = []
  if (!NAME.test(f.name ?? '')) e.push('The ID has 1 to 127 characters: letters, digits, dots, colons, slashes, hyphens and underscores.')
  else if (nameTaken(s, f.name)) e.push(`A destination named ${f.name} exists already.`)
  return e.concat(bindingErrors(s, f, f.bindings ?? []))
}
export function bindingErrors(s, x, bindings) {
  const e = []
  if (bindings.length > MAX_BINDINGS) e.push('A message exchange has at most 450 bindings.')
  for (const b of bindings) {
    const q = queueOf(s, b)
    if (!q) e.push(`The queue ${b} does not exist.`)
    else if (isFifo(q) !== Boolean(x.fifo)) e.push(x.fifo ? `${b} is a standard queue. A FIFO exchange binds FIFO queues only.` : `${b} is a FIFO queue. It binds to a FIFO exchange only.`)
  }
  return e
}

export const createExchange = (state, f) =>
  edit(state, (s) => {
    s.exchanges = [...exchangesOf(s), { name: f.name, fifo: Boolean(f.fifo), encrypted: Boolean(f.encrypted), bindings: [...new Set(f.bindings ?? [])] }]
  })
export const bindQueue = (state, exchange, queue) =>
  edit(state, (s) => {
    const x = exchangeOf(s, exchange)
    if (x && !x.bindings.includes(queue) && queueOf(s, queue) && !bindingErrors(s, x, [...x.bindings, queue]).length) x.bindings.push(queue)
  })
export const unbindQueue = (state, exchange, queue) =>
  edit(state, (s) => {
    const x = exchangeOf(s, exchange)
    if (x) x.bindings = x.bindings.filter((b) => b !== queue)
  })
export const deleteExchange = (state, name) =>
  edit(state, (s) => {
    s.exchanges = exchangesOf(s).filter((x) => x.name !== name)
  })
// The queues a message published to this exchange is copied to. With no binding the message is accepted and lost.
export const targetsOf = (s, exchange) => (exchangeOf(s, exchange)?.bindings ?? []).filter((b) => queueOf(s, b))
export const exchangesFor = (s, queue) => exchangesOf(s).filter((x) => x.bindings.includes(queue)).map((x) => x.name)

// ---------- sending ----------

// IDs of every message in the queues, to find the ones a send has added
export const messageIds = (s) => new Set(s.queues.flatMap((q) => q.messages.map((m) => m.id)))

// After sendMessage(before, ...) of platform.js gave `after`: adds properties, the message group of a FIFO queue
// and the exchange it came through to the messages that are new in `after`. A consumer may have taken them already.
export function tagSent(before, after, { props = {}, group = '', exchange = '' } = {}) {
  const old = messageIds(before)
  return edit(after, (s) => {
    for (const q of s.queues)
      for (const m of q.messages) {
        if (old.has(m.id)) continue
        if (Object.keys(props).length) m.props = { ...props }
        if (isFifo(q) || group) m.group = group.trim() || DEFAULT_GROUP
        if (exchange) m.exchange = exchange
      }
  })
}

// ---------- message browser ----------

// Get messages: up to `count` ready messages, oldest first. Each is locked for the lock TTL of the queue, so no
// consumer and no second Get sees it until the lock ends or the messages are returned. Every fetch is a delivery.
// A message whose TTL has passed is gone. Returns { state, ids }.
export function browse(state, name, count = 10) {
  let ids = []
  const next = edit(state, (s) => {
    const q = queueOf(s, name)
    if (!q) return
    q.messages = q.messages.filter((m) => !expired(q, m, s.clock))
    const max = Math.min(count, isFifo(q) ? BROWSE_MAX_FIFO : BROWSE_MAX)
    const take = deliverable(q, q.messages, s.clock).slice(0, max)
    for (const m of take) {
      m.lockedUntil = s.clock + lockTtlOf(q)
      m.deliveries = (m.deliveries ?? 0) + 1
    }
    ids = take.map((m) => m.id)
  })
  return { state: next, ids }
}

// Return messages (a NACK): the lock ends now and the messages are ready again. The delivery stays counted.
export const release = (state, name, ids) =>
  edit(state, (s) => {
    const q = queueOf(s, name)
    for (const m of q?.messages ?? []) if (!ids || ids.includes(m.id)) delete m.lockedUntil
  })

// Delete one message from the browser (an ACK). It is gone for good.
export const ackMessage = (state, name, id) =>
  edit(state, (s) => {
    const q = queueOf(s, name)
    if (q) q.messages = q.messages.filter((m) => m.id !== id)
  })

// ---------- dead letter queue ----------

// Lab tool: the real console has no button for this. Teams use a replay flow or the Anypoint MQ Broker API.
// Moves the messages `ids` (all when not given) of a dead letter queue to `to`, with a delivery count of 0.
export const moveBack = (state, dlq, to, ids) =>
  edit(state, (s) => {
    const from = queueOf(s, dlq)
    const target = queueOf(s, to)
    if (!from || !target || from === target) return
    const moving = from.messages.filter((m) => !ids || ids.includes(m.id))
    from.messages = from.messages.filter((m) => !moving.includes(m))
    for (const m of moving) {
      const { lockedUntil, from: _source, ...rest } = m
      target.messages.push({ ...rest, deliveries: 0, t: s.clock, redriven: (m.redriven ?? 0) + 1 })
    }
  })

// ---------- delivery rules the engine can use ----------

// The messages a consumer may take now, in queue order. A locked message is in flight and is skipped. In a FIFO
// queue a message group waits while an earlier message of that group is in flight, so the order in a group holds.
// The docs allow up to 10 in flight per group; the lab delivers one message of a group at a time (lab choice).
export function deliverable(q, messages = q.messages, now = 0) {
  const live = messages.filter((m) => !expired(q, m, now))
  if (!isFifo(q)) return live.filter((m) => !locked(m, now))
  const busy = new Set()
  const out = []
  for (const m of live) {
    const g = groupOf(m)
    if (busy.has(g)) continue
    if (locked(m, now)) busy.add(g)
    else out.push(m)
  }
  return out
}

// Messages past their TTL leave the queue. The engine can call this once a minute.
export function expire(s) {
  for (const q of s.queues) q.messages = q.messages.filter((m) => !expired(q, m, s.clock))
}

// ---------- client apps ----------

const hex = (text) => {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0')
}
// Lab IDs. Real client IDs and secrets are longer random strings.
export const clientIdOf = (env, name) => `${hex(`${env}:${name}`)}${hex(`${name}:${env}:id`).slice(0, 8)}`
export const clientSecretOf = (env, name, round = 0) => `${hex(`${name}:${env}:secret:${round}`)}${hex(`${round}:${name}`)}`

// A client app per environment. The lab adds one for each Mule application that names a queue or exchange in its
// properties, and the ones made on the page are kept in s.mqClients.
export function clientApps(s, env) {
  const made = (s.mqClients ?? []).filter((c) => c.env === env)
  const fromApps = s.apps.filter((a) => a.env === env && destinationsOf(s, a).length > 0 && !made.some((c) => c.name === a.name)).map((a) => ({ name: a.name, env, round: 0, auto: true }))
  return [...fromApps, ...made].map((c) => ({ ...c, clientId: clientIdOf(env, c.name), clientSecret: clientSecretOf(env, c.name, c.round ?? 0) }))
}
export const addClientApp = (state, env, name) =>
  edit(state, (s) => {
    if (!name.trim() || clientApps(s, env).some((c) => c.name === name.trim())) return
    s.mqClients = [...(s.mqClients ?? []), { name: name.trim(), env, round: 0 }]
  })
// A new secret. Every app that has the old one loses access until it gets the new one.
export const regenerateSecret = (state, env, name) =>
  edit(state, (s) => {
    s.mqClients = s.mqClients ?? []
    const c = s.mqClients.find((x) => x.env === env && x.name === name)
    if (c) c.round = (c.round ?? 0) + 1
    else s.mqClients.push({ name, env, round: 1 })
  })
export const deleteClientApp = (state, env, name) =>
  edit(state, (s) => {
    s.mqClients = (s.mqClients ?? []).filter((c) => !(c.env === env && c.name === name))
  })

// The queues and exchanges an application names in its properties, with the property key
export function destinationsOf(s, app) {
  const names = new Set([...s.queues.map((q) => q.name), ...exchangesOf(s).map((x) => x.name)])
  return Object.entries({ ...app.props, ...app.secrets }).filter(([, v]) => names.has(String(v).trim())).map(([key, v]) => ({ key, name: String(v).trim() }))
}

// ---------- usage ----------

// Messages taken by consumers in each hour of the last day, from the events of the engine. `env` limits it.
export function usage(s, env, hours = 24) {
  const end = Math.floor(s.clock / HOUR) * HOUR + HOUR
  const start = end - hours * HOUR
  const ok = new Array(hours).fill(0)
  const failed = new Array(hours).fill(0)
  for (const e of s.events) {
    if (e.k !== 'msg' || (env && e.env !== env) || e.t < start || e.t >= end) continue
    const i = Math.floor((e.t - start) / HOUR)
    if (e.s === 'ok') ok[i]++
    else failed[i]++
  }
  return { start, ok, failed }
}
