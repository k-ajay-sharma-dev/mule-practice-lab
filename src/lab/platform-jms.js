// The ActiveMQ brokers of the Platform Lab: Apache ActiveMQ Classic 5.18 (harbor-amq, a shared store master/slave
// pair) and Apache ActiveMQ Artemis 2.x (harbor-artemis). Queues, topics, durable and shared subscriptions, prefetch,
// acknowledgement modes, local transactions, the redelivery policy and dead letter queues, message expiry, memory and
// store usage with producer flow control, broker restarts and failover. Pure and import free. Lives in state.jms.
//
// Real defaults this file uses (activemq.apache.org, checked November 2026):
// Classic: RedeliveryPolicy maximumRedeliveries 6 and initialRedeliveryDelay 1000 ms, a value of -1 means no limit;
// the shared dead letter queue ActiveMQ.DLQ; the DLQ takes persistent messages only (processNonPersistent false) and
// expired messages (processExpired true); prefetch 1000 for queues, 32766 for topics, 100 for durable topics;
// destinations are created on first use; producer flow control blocks a producer when a limit is reached, and
// sendFailIfNoSpace makes the send fail with a ResourceAllocationException instead; a restart loses NON_PERSISTENT
// messages; in a shared store master/slave pair the slave takes the store lock when the master goes and only the
// master accepts connections; the failover: transport reconnects on its own.
// Artemis: address settings max-delivery-attempts 10, redelivery-delay 0, dead-letter-address DLQ and expiry-address
// ExpiryQueue in the default broker.xml; consumerWindowSize 1 MiB; max-disk-usage 90; ANYCAST addresses are queues and
// MULTICAST addresses are topics, each subscription is a queue under the address; JMS 2.0 shared subscriptions;
// address settings and security settings reload while the broker runs.
// Lab-made values are marked where they appear.

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB
const MINUTE = 60000

export const CLASSIC = 'classic'
export const ARTEMIS = 'artemis'
export const AMQ = 'harbor-amq'
export const ARTEMIS_BROKER = 'harbor-artemis'
export const AMQ_URL = 'tcp://amq.harbor.lab:61616'
export const AMQ_FAILOVER = 'failover:(tcp://amq1.harbor.lab:61616,tcp://amq2.harbor.lab:61616)?randomize=false'
export const ARTEMIS_URL = 'tcp://artemis.harbor.lab:61616'

export const CLASSIC_DEFAULTS = { maximumRedeliveries: 6, initialRedeliveryDelay: 1000, queuePrefetch: 1000, topicPrefetch: 32766, durableTopicPrefetch: 100, deadLetterQueue: 'ActiveMQ.DLQ' }
export const ARTEMIS_DEFAULTS = { maxDeliveryAttempts: 10, redeliveryDelay: 0, consumerWindowSize: MB, maxDiskUsage: 90, deadLetterAddress: 'DLQ', expiryAddress: 'ExpiryQueue' }
// lab-made: a failing message is tried this many times in one lab minute before the consumer counts as stuck
export const TRIES_PER_RUN = 12
// lab-made: a message has this many bytes of headers on top of its body
const OVERHEAD = 400
// lab-made: a persistent message stays in memory up to this many bytes per destination; the rest is on disk only
const CURSOR = 1 * MB

const fail = (muleType, text, extra = {}) => ({ ok: false, muleType, text, ...extra })
const clean = (v) => String(v ?? '').trim()
const hex = (text) => {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0')
}
const uuid = (seed) => `${hex(seed)}-${hex(`${seed}b`).slice(0, 4)}-11f1-${hex(`${seed}c`).slice(0, 4)}-${hex(`${seed}d`)}${hex(`${seed}e`).slice(0, 4)}`
export const sizeText = (n) => (n < KB ? `${n} B` : n < MB ? `${(n / KB).toFixed(1)} KB` : n < GB ? `${(n / MB).toFixed(1)} MB` : `${(n / GB).toFixed(2)} GB`)

// ---------- the brokers ----------

const queue = (name, now) => ({ name, created: now, messages: [], enqueued: 0, dequeued: 0, expired: 0 })
const topic = (name, now) => ({ name, created: now, enqueued: 0, dequeued: 0 })

export function classicBroker(now = 0, extra = {}) {
  const queues = {}
  for (const q of ['ORDERS.IN', 'ORDERS.REPLY', 'ORDERS.DLQ', 'ActiveMQ.DLQ']) queues[q] = queue(q, now)
  return {
    name: AMQ,
    kind: CLASSIC,
    version: '5.18.6',
    epoch: 1764230400000,
    seq: 0,
    // amq.harbor.lab is a DNS alias of amq1 (lab-made). Both share one KahaDB store on the NAS; the one holding the lock is master.
    nodes: [
      { name: 'amq1', host: 'amq1.harbor.lab', aliases: ['amq.harbor.lab'], port: 61616, web: 8161, role: 'master', up: true, since: now, downUntil: null },
      { name: 'amq2', host: 'amq2.harbor.lab', aliases: [], port: 61616, web: 8161, role: 'slave', up: true, since: now, downUntil: null },
    ],
    // activemq.xml values the lab reads. memoryLimit and storeLimit are lab-made sizes, smaller than a real broker has.
    config: {
      memoryLimit: 64 * MB,
      storeLimit: 1 * GB,
      tempLimit: 512 * MB,
      sendFailIfNoSpace: false,
      processNonPersistent: false,
      processExpired: true,
      dlqExpiration: 0,
      // policyEntry queue="ORDERS.>": a sharedDeadLetterStrategy with ORDERS.DLQ as its dead letter queue
      policies: [{ match: 'ORDERS.>', deadLetterQueue: 'ORDERS.DLQ', memoryLimit: 0 }],
      schedulerSupport: false,
    },
    pending: null,
    users: {
      admin: { password: 'admin-lab', groups: ['admins'] },
      'mule-orders': { password: 'orders-lab-1', groups: ['orders'] },
      'mule-billing': { password: 'billing-lab-1', groups: ['billing'] },
      'mule-parcel': { password: 'parcel-lab-1', groups: ['parcel'] },
      'mule-warehouse': { password: 'warehouse-lab-1', groups: ['warehouse'] },
      'mule-stock': { password: 'stock-lab-1', groups: ['stock'] },
    },
    // authorizationEntry: read, write and admin name the groups
    auth: [
      { type: 'queue', match: '>', read: 'admins', write: 'admins', admin: 'admins' },
      { type: 'topic', match: '>', read: 'admins', write: 'admins', admin: 'admins' },
      { type: 'queue', match: 'ORDERS.>', read: 'orders', write: 'orders', admin: 'orders' },
      { type: 'queue', match: 'ActiveMQ.DLQ', read: 'orders,billing,parcel', write: 'orders,billing,parcel', admin: 'orders,billing,parcel' },
      { type: 'queue', match: 'INVOICES.>', read: 'billing', write: 'billing', admin: 'billing' },
      { type: 'queue', match: 'PARCEL.>', read: 'parcel', write: 'parcel', admin: 'parcel' },
      { type: 'topic', match: 'STOCK.>', read: 'warehouse', write: 'stock', admin: 'warehouse,stock' },
    ],
    queues,
    topics: { 'STOCK.EVENTS': topic('STOCK.EVENTS', now), 'ActiveMQ.Advisory.Connection': topic('ActiveMQ.Advisory.Connection', now) },
    subs: [],
    consumers: [],
    conns: [],
    faults: {},
    refused: [],
    history: [{ t: now, text: 'Broker harbor-amq started on amq1. amq2 waits for the lock on the shared store.' }],
    ...extra,
  }
}

export function artemisBroker(now = 0, extra = {}) {
  const queues = {}
  for (const q of ['DLQ', 'ExpiryQueue', 'WAREHOUSE.TASKS']) queues[q] = queue(q, now)
  return {
    name: ARTEMIS_BROKER,
    kind: ARTEMIS,
    version: '2.37.0',
    epoch: 1764230400000,
    seq: 0,
    nodes: [{ name: 'artemis1', host: 'artemis.harbor.lab', aliases: [], port: 61616, web: 8161, role: 'live', up: true, since: now, downUntil: null }],
    config: {
      // disk size of the journal volume, lab-made
      storeLimit: 2 * GB,
      memoryLimit: 512 * MB,
      maxDiskUsage: 90,
      addressSettings: [{ match: '#', deadLetterAddress: 'DLQ', expiryAddress: 'ExpiryQueue', maxDeliveryAttempts: 10, redeliveryDelay: 0, addressFullPolicy: 'PAGE', autoCreateQueues: true, autoCreateAddresses: true }],
    },
    pending: null,
    users: {
      admin: { password: 'admin-lab', groups: ['amq'] },
      'mule-warehouse': { password: 'warehouse-lab-1', groups: ['warehouse'] },
      'mule-stock': { password: 'stock-lab-1', groups: ['stock'] },
    },
    // security-settings: read is consume and browse, write is send, admin is createAddress and create or delete queues
    auth: [
      { type: 'any', match: '#', read: 'amq', write: 'amq', admin: 'amq' },
      { type: 'any', match: 'STOCK.#', read: 'warehouse', write: 'stock', admin: 'warehouse,stock' },
      { type: 'any', match: 'WAREHOUSE.#', read: 'warehouse', write: 'warehouse', admin: 'warehouse' },
    ],
    queues,
    topics: { 'STOCK.EVENTS': topic('STOCK.EVENTS', now) },
    subs: [],
    consumers: [],
    conns: [],
    faults: {},
    refused: [],
    history: [{ t: now, text: 'Broker harbor-artemis started. AMQ221007: Server is now live.' }],
    ...extra,
  }
}

export const defaultJms = (now = 0) => ({ created: now, brokers: { [AMQ]: classicBroker(now), [ARTEMIS_BROKER]: artemisBroker(now) } })

// A console saved while this module was a placeholder has state.jms without brokers. The tick, ctx.jms and the web
// console actions write the default brokers into their draft.
export function upgradeJms(s) {
  if (s?.jms && !s.jms.brokers) s.jms.brokers = defaultJms(s.jms.created ?? s.clock ?? 0).brokers
  return s
}
export const brokersOf = (s) => Object.values(s?.jms?.brokers ?? {})
export const brokerOf = (s, name) => s?.jms?.brokers?.[name]
export const masterOf = (b) => b.nodes.find((n) => n.up && (n.role === 'master' || n.role === 'live'))
export const liveConns = (b) => b.conns.filter((c) => !c.broken)
const note = (s, b, text) => {
  b.history.push({ t: s.clock ?? 0, text })
  if (b.history.length > 40) b.history.splice(0, b.history.length - 40)
}
const refuse = (s, b, app, text) => {
  b.refused.push({ t: s.clock ?? 0, app: app?.name ?? '', env: app?.env ?? '', text })
  if (b.refused.length > 30) b.refused.splice(0, b.refused.length - 30)
}

// ---------- destinations, wildcards and rights ----------

// Classic: '.' separates, '*' is one part, '>' is the rest. Artemis: '*' is one word, '#' is any number of words.
export function matches(kind, pattern, name) {
  const p = pattern.split('.')
  const n = name.split('.')
  const many = kind === CLASSIC ? '>' : '#'
  const walk = (i, j) => {
    if (i === p.length) return j === n.length
    if (p[i] === many) return kind === CLASSIC ? j < n.length : walk(i + 1, j) || (j < n.length && walk(i, j + 1))
    if (j === n.length) return false
    return (p[i] === '*' || p[i] === n[j]) && walk(i + 1, j + 1)
  }
  return walk(0, 0)
}
const groupsOf = (b, user) => b.users[user]?.groups ?? []
export function allowed(b, user, type, name, op) {
  if (name.startsWith('ActiveMQ.Advisory.') || name.startsWith('activemq.')) return true
  const mine = groupsOf(b, user)
  return b.auth.some((e) => (e.type === 'any' || e.type === type) && matches(b.kind, e.match, name) && String(e[op] ?? '').split(',').map((g) => g.trim()).some((g) => mine.includes(g)))
}
const ARTEMIS_PERM = { read: 'CONSUME', write: 'SEND', admin: 'CREATE_ADDRESS' }
const deniedText = (b, user, type, name, op) =>
  b.kind === CLASSIC ? `User ${user} is not authorized to ${op === 'read' ? 'read from' : op === 'write' ? 'write to' : 'create'}: ${type}://${name}` : `AMQ229032: User: ${user} does not have permission='${ARTEMIS_PERM[op]}' on address ${name}`

// the policyEntry (Classic) or address-setting (Artemis) that applies to a destination: the most exact match wins
export function policyOf(b, name) {
  if (b.kind === CLASSIC) {
    const list = (b.config.policies ?? []).filter((p) => matches(CLASSIC, p.match, name))
    return list.sort((x, y) => y.match.length - x.match.length)[0] ?? {}
  }
  const list = (b.config.addressSettings ?? []).filter((p) => matches(ARTEMIS, p.match, name))
  return list.sort((x, y) => (x.match === '#' ? 1 : 0) - (y.match === '#' ? 1 : 0) || y.match.length - x.match.length)[0] ?? {}
}
export const dlqNameOf = (b, name) => (b.kind === CLASSIC ? policyOf(b, name).deadLetterQueue || CLASSIC_DEFAULTS.deadLetterQueue : (policyOf(b, name).deadLetterAddress ?? ''))
export const expiryNameOf = (b, name) => (b.kind === ARTEMIS ? (policyOf(b, name).expiryAddress ?? '') : dlqNameOf(b, name))
export const maxDeliveryOf = (b, name) => (b.kind === ARTEMIS ? (policyOf(b, name).maxDeliveryAttempts ?? ARTEMIS_DEFAULTS.maxDeliveryAttempts) : null)
export function isDlq(b, name) {
  if (b.kind === CLASSIC) return name === CLASSIC_DEFAULTS.deadLetterQueue || (b.config.policies ?? []).some((p) => p.deadLetterQueue === name)
  return (b.config.addressSettings ?? []).some((p) => p.deadLetterAddress === name || p.expiryAddress === name)
}

// The name a subscription has as a queue. Artemis shows each one in the Queues tab under its MULTICAST address.
export function subQueueName(b, sub) {
  if (sub.shared) return sub.name
  if (sub.durable) return b.kind === ARTEMIS ? `${sub.clientId}.${sub.name}` : `${sub.clientId}:${sub.name}`
  return b.kind === ARTEMIS ? uuid(sub.key) : sub.key
}

const boxOf = (b, id) => (id.startsWith('q:') ? b.queues[id.slice(2)] : b.subs.find((x) => `s:${x.key}` === id))
const boxIds = (b) => [...Object.keys(b.queues).map((n) => `q:${n}`), ...b.subs.map((x) => `s:${x.key}`)]
export const consumersOf = (b, id) => b.consumers.filter((c) => c.box === id)
const bytesOf = (list) => list.reduce((n, m) => n + m.size, 0)

// Memory and store usage, as the Home page of Classic shows them. Store: persistent messages in the shared store.
// Memory (lab-made rule): non persistent messages, plus up to 1 MB of persistent messages per destination.
export function usageOf(b) {
  let store = 0
  let memory = 0
  for (const id of boxIds(b)) {
    const list = boxOf(b, id).messages
    const persistent = bytesOf(list.filter((m) => m.persistent))
    store += persistent
    memory += bytesOf(list.filter((m) => !m.persistent)) + Math.min(persistent, CURSOR)
  }
  const pct = (n, of) => Math.min(100, Math.floor((n * 100) / of))
  return { store, storeLimit: b.config.storeLimit, storePct: pct(store, b.config.storeLimit), memory, memoryLimit: b.config.memoryLimit, memoryPct: pct(memory, b.config.memoryLimit), temp: 0, tempLimit: b.config.tempLimit ?? 0, tempPct: 0 }
}
const destMemory = (q) => bytesOf(q.messages.filter((m) => !m.persistent)) + Math.min(bytesOf(q.messages.filter((m) => m.persistent)), CURSOR)

// Why a send to this destination is held by producer flow control now, or null
// `pending` is what an open transaction has sent and not committed yet: the broker already holds it, so it counts
function blockedBy(b, type, name, persistent, pending = []) {
  const u = usageOf(b)
  if (pending.length) {
    const pct = (n, of) => Math.min(100, Math.floor((n * 100) / of))
    const store = bytesOf(pending.filter((m) => m.persistent))
    const memory = bytesOf(pending.filter((m) => !m.persistent)) + Math.min(store, CURSOR)
    u.storePct = pct(u.store + store, b.config.storeLimit)
    u.memoryPct = pct(u.memory + memory, b.config.memoryLimit)
  }
  if (b.kind === ARTEMIS) return persistent && u.storePct >= (b.config.maxDiskUsage ?? 90) ? 'disk' : null
  if (persistent && u.storePct >= 100) return 'store'
  if (u.memoryPct >= 100) return 'memory'
  const limit = policyOf(b, name).memoryLimit
  if (type === 'queue' && limit > 0 && b.queues[name] && destMemory(b.queues[name]) >= limit) return 'destination'
  return null
}
function blockedText(b, why, type, name, producer) {
  if (why === 'disk') return `AMQ222212: Disk Full! Blocking message production on address '${name}'. Clients will report blocked.`
  if (why === 'store') return `Persistent store is Full, 100% of ${b.config.storeLimit}. Stopping producer (${producer}) to prevent flooding ${type}://${name}. See http://activemq.apache.org/producer-flow-control.html for more info (blocking for: 30s)`
  return `Usage Manager Memory Limit reached on ${type}://${name}. Stopping producer (${producer}) to prevent flooding ${type}://${name}. See http://activemq.apache.org/producer-flow-control.html for more info`
}

// ---------- connection URLs ----------

// tcp://host:61616?x=y, failover:(tcp://a:61616,tcp://b:61616)?randomize=false, or the Artemis list (tcp://a,tcp://b)?ha=true
export function parseUrl(url) {
  const u = clean(url)
  let failover = false
  let list = u
  let query = ''
  let m = u.match(/^failover:\((.*)\)(?:\?(.*))?$/i)
  if (m) [failover, list, query] = [true, m[1], m[2] ?? '']
  else if ((m = u.match(/^\((.*)\)(?:\?(.*))?$/))) [list, query] = [m[1], m[2] ?? '']
  else if (u.includes('?')) [list, query] = [u.slice(0, u.indexOf('?')), u.slice(u.indexOf('?') + 1)]
  const params = {}
  const add = (q) => {
    for (const kv of String(q ?? '').split('&')) {
      const [k, v = ''] = kv.split('=')
      if (k) params[k.trim()] = v.trim()
    }
  }
  add(query)
  if (!failover && /^\(/.test(u) && params.ha === 'true') failover = true
  const hosts = list
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [base, q] = x.split('?')
      add(q)
      const hm = base.match(/^(tcp|nio|ssl|amqp):\/\/([^:/?]+)(?::(\d+))?\/?$/i)
      return hm ? { scheme: hm[1].toLowerCase(), host: hm[2].toLowerCase(), port: Number(hm[3] ?? 61616) } : { bad: x }
    })
  return { url: u, failover, hosts, params, randomize: failover && params.randomize !== 'false' }
}
const nodeAt = (b, h) => b.nodes.find((n) => (n.host === h.host || n.aliases.includes(h.host)) && n.port === h.port)
const brokerAt = (s, u) => brokersOf(s).find((b) => u.hosts.some((h) => !h.bad && nodeAt(b, h)))
// the prefetch of a Classic consumer, or the window of an Artemis consumer in bytes
function prefetchOf(b, params, kind, durable) {
  const n = (k) => (params[k] !== undefined && params[k] !== '' && Number.isFinite(Number(params[k])) ? Number(params[k]) : undefined)
  if (b.kind === ARTEMIS) return { window: n('consumerWindowSize') ?? ARTEMIS_DEFAULTS.consumerWindowSize }
  if (kind === 'queue') return { prefetch: n('jms.prefetchPolicy.queuePrefetch') ?? n('jms.prefetchPolicy.all') ?? CLASSIC_DEFAULTS.queuePrefetch }
  if (durable) return { prefetch: n('jms.prefetchPolicy.durableTopicPrefetch') ?? n('jms.prefetchPolicy.all') ?? CLASSIC_DEFAULTS.durableTopicPrefetch }
  return { prefetch: n('jms.prefetchPolicy.topicPrefetch') ?? n('jms.prefetchPolicy.all') ?? CLASSIC_DEFAULTS.topicPrefetch }
}

// The connection settings a Mule app has in its properties: jms.url, jms.user, jms.password, jms.clientId,
// jms.reconnect (forever or none: the reconnection strategy of the JMS config), jms.maxRedelivery (maxRedelivery of the
// ActiveMQ factory configuration) and jms.specification (JMS_1_1 or JMS_2_0).
export function connOf(props, replica = 1) {
  const max = clean(props['jms.maxRedelivery'])
  return {
    url: clean(props['jms.url']),
    user: clean(props['jms.user']),
    password: clean(props['jms.password']),
    clientId: clean(props['jms.clientId']),
    replica,
    reconnect: /^(forever|true|reconnect-forever)$/i.test(clean(props['jms.reconnect'])),
    maxRedelivery: max !== '' && Number.isInteger(Number(max)) ? Number(max) : null,
    spec: clean(props['jms.specification']) || 'JMS_1_1',
  }
}

// ---------- connections ----------

function refusedText(b, u, why) {
  if (b?.kind === ARTEMIS) return 'AMQ219007: Cannot connect to server(s). Tried with all available servers.'
  if (u.failover) return `Failover transport: no broker of ${u.url} accepts connections. The transport keeps trying, and the call gave up after 30 s (lab).`
  return `Could not connect to broker URL: ${u.url}. Reason: java.net.ConnectException: ${why ?? 'Connection refused'}`
}

function open(s, app, cfg, source) {
  const u = parseUrl(cfg.url)
  if (!u.hosts.length || u.hosts.some((h) => h.bad)) return fail('JMS:CONNECTIVITY', `Could not create Transport. Reason: java.io.IOException: Transport scheme NOT recognized: [${cfg.url || '(empty)'}]`)
  const b = brokerAt(s, u)
  if (!b) return fail('JMS:CONNECTIVITY', `Could not connect to broker URL: ${u.url}. Reason: java.net.UnknownHostException: ${u.hosts[0].host}`)
  const key = `${app?.env ?? 'lab'}|${app?.name ?? 'console'}|${cfg.replica ?? 1}`
  for (const other of brokersOf(s)) {
    if (other === b) continue
    const old = other.conns.find((c) => c.key === key)
    if (old) closeConn(s, other, old)
  }
  let c = b.conns.find((x) => x.key === key)
  const started = app?.started ?? 0
  if (c && (c.started !== started || c.url !== u.url || c.user !== cfg.user || c.pw !== hex(cfg.password ?? '') || c.clientId !== (cfg.clientId || ''))) {
    closeConn(s, b, c)
    c = null
  }
  if (c && !c.broken) {
    Object.assign(c, { last: s.clock, maxRedelivery: cfg.maxRedelivery, spec: cfg.spec ?? 'JMS_1_1', reconnect: Boolean(cfg.reconnect) })
    return { ok: true, b, c }
  }
  if (c?.broken) {
    // Without the failover transport and without a reconnection strategy, a Mule listener stops when its connection
    // is lost and stays stopped until the app restarts. An operation gets a new connection on its next call.
    if (source && !c.failover && !cfg.reconnect) return fail('JMS:CONNECTIVITY', `The JMS listener stopped at ${c.brokenText}. No reconnection strategy is set, so it stays stopped until the application restarts.`, { dead: true })
    b.conns = b.conns.filter((x) => x !== c)
    c = null
  }
  const hosts = u.failover ? u.hosts : u.hosts.slice(0, 1)
  const node = hosts.map((h) => nodeAt(b, h)).find((n) => n && n.up && (n.role === 'master' || n.role === 'live'))
  if (!node) {
    const why = hosts.map((h) => nodeAt(b, h)).find(Boolean)?.up ? 'Connection refused (the broker on this host is a slave and waits for the store lock)' : 'Connection refused'
    const text = refusedText(b, u, why)
    refuse(s, b, app, text)
    return fail('JMS:CONNECTIVITY', text)
  }
  const user = b.users[cfg.user]
  if (!user || user.password !== cfg.password) {
    const text = b.kind === CLASSIC ? `User name [${cfg.user}] or password is invalid.` : `AMQ229031: Unable to validate user from /10.40.8.${(hex(key).charCodeAt(0) % 200) + 20}. Username: ${cfg.user}; SSL certificate subject DN: unavailable`
    refuse(s, b, app, text)
    return fail('JMS:SECURITY', text)
  }
  if (cfg.clientId) {
    const taken = b.conns.find((x) => !x.broken && x.key !== key && x.clientId === cfg.clientId)
    if (taken) {
      const text = b.kind === CLASSIC ? `javax.jms.InvalidClientIDException: Broker: ${b.name} - Client: ${cfg.clientId} already connected from ${taken.remote}` : `javax.jms.InvalidClientIDException: clientID=${cfg.clientId} was already set into another connection`
      refuse(s, b, app, text)
      return fail('JMS:CONNECTIVITY', text, { clientIdInUse: true })
    }
  }
  b.seq += 1
  const port = 40000 + (b.seq % 20000)
  c = {
    key,
    id: b.kind === CLASSIC ? `ID:${(app?.name ?? 'console').slice(0, 20)}-r${cfg.replica ?? 1}-${port}-${b.epoch}-0:${b.seq}` : uuid(`${key}:${b.seq}`),
    app: app?.name ?? 'console',
    env: app?.env ?? 'lab',
    replica: cfg.replica ?? 1,
    clientId: cfg.clientId || '',
    user: cfg.user,
    pw: hex(cfg.password ?? ''),
    url: u.url,
    node: node.name,
    remote: `tcp://10.40.8.${(Number.parseInt(hex(key).slice(0, 2), 16) % 200) + 20}:${port}`,
    t: s.clock,
    last: s.clock,
    started,
    failover: u.failover,
    reconnect: Boolean(cfg.reconnect),
    params: u.params,
    spec: cfg.spec ?? 'JMS_1_1',
    maxRedelivery: cfg.maxRedelivery,
    broken: false,
  }
  b.conns.push(c)
  if (b.topics['ActiveMQ.Advisory.Connection']) b.topics['ActiveMQ.Advisory.Connection'].enqueued++
  return { ok: true, b, c }
}

// A consumer leaves: the messages it holds go back to its queue. A delivered message that was not acknowledged comes
// again with JMSRedelivered true and one more delivery; a message that was only prefetched comes back as it was.
function dropConsumer(b, k) {
  const box = boxOf(b, k.box)
  for (const m of box?.messages ?? []) {
    if (m.held !== k.key) continue
    if (m.delivered) {
      m.redeliveries += 1
      m.redelivered = true
    }
    m.held = null
    m.delivered = false
  }
  freeGroups(b, (g, key) => key === k.key)
  b.consumers = b.consumers.filter((x) => x !== k)
}
function settleSubs(s, b) {
  for (const sub of [...b.subs]) {
    if (consumersOf(b, `s:${sub.key}`).length) continue
    if (!sub.durable) b.subs = b.subs.filter((x) => x !== sub)
    else sub.offlineSince ??= s.clock
  }
}
function closeConn(s, b, c) {
  for (const k of b.consumers.filter((x) => x.conn === c.key)) dropConsumer(b, k)
  b.conns = b.conns.filter((x) => x !== c)
  settleSubs(s, b)
}
const boxDispatch = (b) => {
  for (const id of boxIds(b)) dispatch(b, id)
}

// ---------- nodes: restart and failover ----------

function resetStats(b) {
  for (const q of Object.values(b.queues)) Object.assign(q, { enqueued: 0, dequeued: 0, expired: 0 })
  for (const t of Object.values(b.topics)) Object.assign(t, { enqueued: 0, dequeued: 0 })
  for (const sub of b.subs) Object.assign(sub, { enqueued: 0, dequeued: 0 })
}
// The node that serves stops: connections on it break, consumers go, and messages kept in memory only are lost
function stopServing(s, b, n, why) {
  for (const c of b.conns.filter((x) => x.node === n.name && !x.broken)) {
    for (const k of b.consumers.filter((x) => x.conn === c.key)) dropConsumer(b, k)
    c.broken = true
    c.brokenAt = s.clock
    c.brokenText = `${new Date(s.clock).toISOString().slice(11, 16)} (${b.kind === CLASSIC ? 'java.io.EOFException: Transport connection to the broker was lost' : 'AMQ219016: Connection failure detected'})`
  }
  b.subs = b.subs.filter((x) => x.durable)
  let lost = 0
  for (const id of boxIds(b)) {
    const box = boxOf(b, id)
    const keep = box.messages.filter((m) => m.persistent)
    lost += box.messages.length - keep.length
    box.messages = keep
  }
  for (const sub of b.subs) sub.offlineSince ??= s.clock
  note(s, b, `${n.name} stopped (${why}). ${lost} NON_PERSISTENT message${lost === 1 ? '' : 's'} lost.`)
  b.lostNonPersistent = (b.lostNonPersistent ?? 0) + lost
}
function takeOver(s, b, n) {
  n.role = b.kind === CLASSIC ? 'master' : 'live'
  n.since = s.clock
  if (b.pending) {
    b.config = { ...b.config, ...b.pending }
    b.pending = null
    note(s, b, `${n.name} read the changed configuration.`)
  }
  resetStats(b)
  note(s, b, b.kind === CLASSIC ? `${n.name} got the lock on the shared KahaDB store and is master now.` : `${n.name}: AMQ221007: Server is now live.`)
}
function startNode(s, b, n) {
  n.up = true
  n.downUntil = null
  n.since = s.clock
  if (masterOf(b)) {
    n.role = 'slave'
    note(s, b, `${n.name} started and waits for the lock on the shared store (slave).`)
  } else takeOver(s, b, n)
}

// Lab action: restart a node, as for patching. A master that stops hands over to the slave at once. The node is
// back after `minutes`, as a slave if the other node is master by then.
export function restartNode(state, name, nodeName, minutes = 1) {
  return act(state, name, (b, s) => {
    const n = nodeName ? b.nodes.find((x) => x.name === nodeName) : masterOf(b)
    if (!n) return { ok: false, text: 'There is no such node.' }
    if (!n.up) return { ok: false, text: `${n.name} is already stopped.` }
    const serving = n === masterOf(b)
    if (serving) stopServing(s, b, n, 'restart')
    else note(s, b, `${n.name} stopped (restart).`)
    n.up = false
    n.downUntil = s.clock + Math.max(1, minutes) * MINUTE
    if (b.kind === CLASSIC) n.role = 'slave'
    const standby = b.nodes.find((x) => x !== n && x.up)
    if (serving && standby) takeOver(s, b, standby)
    b.restarts = (b.restarts ?? 0) + 1
    b.lastRestart = { t: s.clock, node: n.name }
    return { ok: true, text: `${n.name} restarts. It is back in ${Math.max(1, minutes)} minute${minutes > 1 ? 's' : ''}.` }
  })
}
export const restartBroker = (state, name, minutes = 1) => restartNode(state, name, null, minutes)

// ---------- messages ----------

function newMessage(s, b, c, type, name, body, o) {
  b.seq += 1
  const ttl = Number(o.ttl) > 0 ? Number(o.ttl) : 0
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    id: b.kind === CLASSIC ? `ID:${c?.id?.slice(3, 30) ?? 'amq-console-8161'}-1:1:1:${b.seq}` : `ID:${uuid(`${b.name}:${b.seq}`)}`,
    body: text,
    size: Number(o.size) > 0 ? Number(o.size) : text.length + OVERHEAD,
    correlationId: clean(o.correlationId),
    persistent: o.persistent !== false,
    priority: Number.isInteger(Number(o.priority)) ? Math.max(0, Math.min(9, Number(o.priority))) : 4,
    ts: s.clock,
    exp: ttl ? s.clock + ttl : 0,
    props: { ...(o.props ?? {}) },
    type: clean(o.type),
    replyTo: clean(o.replyTo),
    dest: `${type}://${name}`,
    producer: c?.app ?? 'web console',
    redeliveries: 0,
    redelivered: false,
    held: null,
    delivered: false,
  }
}

function ensureQueue(s, b, name) {
  b.queues[name] ??= queue(name, s.clock)
  return b.queues[name]
}
// A message reaches its destination: a queue keeps it; a topic copies it to every subscription that exists now.
// With no subscription the message is gone.
function deliver(s, b, type, name, m) {
  if (type === 'queue') {
    const q = ensureQueue(s, b, name)
    q.messages.push(m)
    q.enqueued++
    dispatch(b, `q:${name}`)
    return
  }
  const t = (b.topics[name] ??= topic(name, s.clock))
  t.enqueued++
  for (const sub of b.subs.filter((x) => x.topic === name)) {
    sub.messages.push({ ...structuredClone(m), held: null, delivered: false })
    sub.enqueued++
    dispatch(b, `s:${sub.key}`)
  }
}

// The broker gives free messages to the consumers of a queue in turn, each up to its prefetch (Classic) or its
// window in bytes (Artemis). A consumer that holds its prefetch gets no more until it acknowledges.
function dispatch(b, id) {
  const box = boxOf(b, id)
  const list = consumersOf(b, id).sort((x, y) => x.t - y.t)
  if (!box || !list.length) return
  const held = new Map(list.map((k) => [k.key, box.messages.filter((m) => m.held === k.key)]))
  const room = (k, m) => {
    const mine = held.get(k.key)
    if (b.kind === ARTEMIS) return mine.length === 0 || (k.window > 0 && bytesOf(mine) + m.size <= k.window)
    return mine.length < Math.max(1, k.prefetch)
  }
  // the turn is kept on the queue, so messages that arrive one by one still go round the consumers
  let turn = (box.rr ?? 0) % list.length
  for (const m of box.messages) {
    if (m.held) continue
    // message groups: the first consumer that gets a JMSXGroupID owns the group, and only it gets the group's messages
    const group = m.props?.JMSXGroupID ? `${id}|${m.props.JMSXGroupID}` : null
    const owner = group ? list.find((k) => k.key === b.groups?.[group]) : null
    if (owner) {
      if (room(owner, m)) {
        m.held = owner.key
        held.get(owner.key).push(m)
      }
      continue // a full owner holds back only its own group
    }
    let given = false
    for (let i = 0; i < list.length && !given; i++) {
      const k = list[(turn + i) % list.length]
      if (room(k, m)) {
        m.held = k.key
        held.get(k.key).push(m)
        turn = (turn + i + 1) % list.length
        given = true
        if (group) claimGroup(b, group, k.key)
      }
    }
    if (!given) break
  }
  box.rr = turn
}
// lab-made bound: a broker keeps the owners of the 500 newest groups
const MAX_GROUPS = 500
function claimGroup(b, group, key) {
  b.groups ??= {}
  b.groups[group] = key
  const names = Object.keys(b.groups)
  if (names.length > MAX_GROUPS) for (const g of names.slice(0, names.length - MAX_GROUPS)) delete b.groups[g]
}
// a consumer that leaves frees its groups; the next message of the group picks a new owner
const freeGroups = (b, test) => {
  for (const [g, key] of Object.entries(b.groups ?? {})) if (test(g, key)) delete b.groups[g]
}

const viewOf = (m, k) => ({
  id: m.id,
  ackId: k.key,
  body: m.body,
  correlationId: m.correlationId,
  deliveryMode: m.persistent ? 'PERSISTENT' : 'NON_PERSISTENT',
  priority: m.priority,
  redelivered: m.redelivered,
  deliveryCount: m.redeliveries + 1,
  timestamp: m.ts,
  expiration: m.exp,
  properties: { ...m.props },
  type: m.type,
  replyTo: m.replyTo,
  destination: m.dest,
  size: m.size,
})

// the messages this consumer holds and has not handed to the app yet, in order
function take(b, k, max) {
  dispatch(b, k.box)
  const box = boxOf(b, k.box)
  const out = (box?.messages ?? []).filter((m) => m.held === k.key && !m.delivered).slice(0, max)
  for (const m of out) m.delivered = true
  k.deliveredCount = (k.deliveredCount ?? 0) + out.length
  return out
}
// Acknowledges the messages `ids`, or like Session.acknowledge() every delivered message of the session
function ackMsgs(b, k, ids) {
  const box = boxOf(b, k.box)
  if (!box) return 0
  const gone = box.messages.filter((m) => m.held === k.key && m.delivered && (!ids || ids.includes(m.id)))
  box.messages = box.messages.filter((m) => !gone.includes(m))
  box.dequeued += gone.length
  // JMSXGroupSeq -1 closes the group, so its next message may go to another consumer
  for (const m of gone) if (m.props?.JMSXGroupID && Number(m.props.JMSXGroupSeq) === -1 && b.groups) delete b.groups[`${k.box}|${m.props.JMSXGroupID}`]
  if (k.box.startsWith('s:') && b.topics[box.topic]) b.topics[box.topic].dequeued += gone.length
  k.acked = (k.acked ?? 0) + gone.length
  dispatch(b, k.box)
  return gone.length
}

const limitOf = (b, c, name) => {
  if (b.kind === ARTEMIS) return maxDeliveryOf(b, name)
  const p = Number(c?.params?.['jms.redeliveryPolicy.maximumRedeliveries'])
  if (c?.params?.['jms.redeliveryPolicy.maximumRedeliveries'] !== undefined && Number.isInteger(p)) return p
  return c?.maxRedelivery ?? CLASSIC_DEFAULTS.maximumRedeliveries
}
const boxName = (b, id) => (id.startsWith('q:') ? id.slice(2) : boxOf(b, id)?.topic)

// A message leaves for the dead letter queue (or Artemis' expiry address). Classic keeps only persistent messages
// there unless processNonPersistent is on.
function deadLetter(s, b, id, m, cause, expired = false) {
  const box = boxOf(b, id)
  box.messages = box.messages.filter((x) => x !== m)
  const from = boxName(b, id)
  const target = expired ? expiryNameOf(b, from) : dlqNameOf(b, from)
  if (b.kind === CLASSIC && !m.persistent && !b.config.processNonPersistent) {
    note(s, b, `A NON_PERSISTENT message from ${m.dest} was dropped, not sent to ${target}.`)
    return 'dropped'
  }
  if (!target || target === from) return 'dropped'
  const q = ensureQueue(s, b, target)
  const exp = b.kind === CLASSIC && b.config.dlqExpiration > 0 ? s.clock + b.config.dlqExpiration : 0
  const props = b.kind === CLASSIC ? { ...m.props, dlqDeliveryFailureCause: cause } : { ...m.props, _AMQ_ORIG_ADDRESS: from, _AMQ_ORIG_QUEUE: id.startsWith('q:') ? from : subQueueName(b, box) }
  q.messages.push({ ...m, held: null, delivered: false, exp, origin: m.origin ?? m.dest, props })
  q.enqueued++
  return target
}

// Session.recover() or a rollback: the messages come again with one more delivery. Past the redelivery limit they go
// to the dead letter queue: Classic counts on the client (RedeliveryPolicy), Artemis on the broker (max-delivery-attempts).
function recoverMsgs(s, b, k, ids, c) {
  const box = boxOf(b, k.box)
  if (!box) return []
  const name = boxName(b, k.box)
  const limit = limitOf(b, c, name)
  const out = []
  for (const m of box.messages.filter((x) => x.held === k.key && x.delivered && (!ids || ids.includes(x.id)))) {
    m.redeliveries += 1
    m.redelivered = true
    m.delivered = false
    const over = b.kind === CLASSIC ? limit !== -1 && m.redeliveries > limit : limit !== -1 && m.redeliveries >= limit
    if (over) {
      const cause =
        b.kind === CLASSIC
          ? `java.lang.Throwable: Delivery[${m.redeliveries}] exceeds redelivery policy limit:RedeliveryPolicy {destination = null, collisionAvoidanceFactor = 0.15, maximumRedeliveries = ${limit}, maximumRedeliveryDelay = -1, initialRedeliveryDelay = 1000, useCollisionAvoidance = false, useExponentialBackOff = false, backOffMultiplier = 5.0, redeliveryDelay = 1000, preDispatchCheck = true}`
          : `max-delivery-attempts ${limit} reached`
      out.push({ id: m.id, outcome: 'dlq', to: deadLetter(s, b, k.box, m, cause) })
    } else out.push({ id: m.id, outcome: 'redelivery', deliveryCount: m.redeliveries + 1 })
  }
  dispatch(b, k.box)
  return out
}

function expire(s, b) {
  for (const id of boxIds(b)) {
    const box = boxOf(b, id)
    const gone = box.messages.filter((x) => x.exp && x.exp <= s.clock && !x.delivered)
    if (!gone.length) continue
    box.expired = (box.expired ?? 0) + gone.length
    // a message that expires in a DLQ is gone; Classic sends only persistent expired messages to its DLQ
    const inDlq = id.startsWith('q:') && isDlq(b, id.slice(2))
    for (const m of gone) {
      m.held = null
      if (inDlq || (b.kind === CLASSIC && (!m.persistent || !b.config.processExpired))) box.messages = box.messages.filter((x) => x !== m)
      else deadLetter(s, b, id, m, 'Message expired', true)
    }
  }
}

// ---------- what an app does: publish, consume, ack, recover, transactions, the listener ----------

function publishOn(s, app, cfg, type, name, body, o, tx) {
  const r = tx ? { ok: true, b: tx.b, c: tx.c } : open(s, app, cfg, false)
  if (!r.ok) return r
  const { b, c } = r
  if (!masterOf(b)) return fail('JMS:CONNECTIVITY', refusedText(b, parseUrl(cfg.url)))
  if (!allowed(b, c.user, type, name, 'write')) return fail('JMS:SECURITY', deniedText(b, c.user, type, name, 'write'))
  const exists = type === 'queue' ? b.queues[name] : b.topics[name]
  if (!exists) {
    if (o.lookupDestination === 'ALWAYS') return fail('JMS:DESTINATION_NOT_FOUND', `Failed to look up destination ${name}: no ${type} of that name is bound (lab wording)`)
    if (b.kind === ARTEMIS && policyOf(b, name).autoCreateAddresses === false) return fail('JMS:DESTINATION_NOT_FOUND', `AMQ229017: Queue ${name} does not exist`)
    if (!allowed(b, c.user, type, name, 'admin')) return fail('JMS:SECURITY', deniedText(b, c.user, type, name, 'admin'))
  }
  const persistent = o.persistent !== false
  const why = blockedBy(b, type, name, persistent, tx ? tx.out.map(([, , m]) => m) : [])
  if (why) {
    const text = blockedText(b, why, type, name, `${c.id}:1:1`)
    if (b.kind === CLASSIC && b.config.sendFailIfNoSpace) return fail('JMS:PUBLISHING', `javax.jms.ResourceAllocationException: ${text}`)
    return fail(null, text, { blocked: true })
  }
  // lab-made: a destination that refuses every n-th send, a stand in for a memory limit reached at peak minutes
  const fault = b.faults?.[`${type}://${name}`]
  if (fault) {
    fault.n = (fault.n ?? 0) + 1
    if (fault.n % fault.every === 0) return fail('JMS:PUBLISHING', `javax.jms.ResourceAllocationException: ${blockedText(b, 'memory', type, name, `${c.id}:1:1`)}`)
  }
  const m = newMessage(s, b, c, type, name, body, o)
  if (tx) tx.out.push([type, name, m])
  else deliver(s, b, type, name, m)
  return { ok: true, messageId: m.id }
}

// Opens the connection and the consumer of a queue or a topic subscription
function attach(s, app, cfg, name, o, source) {
  const r = open(s, app, cfg, source)
  if (!r.ok) return r
  const { b, c } = r
  const kind = o.type === 'topic' ? 'topic' : 'queue'
  if (!allowed(b, c.user, kind, name, 'read')) return fail('JMS:SECURITY', deniedText(b, c.user, kind, name, 'read'))
  let id
  let durable = false
  if (kind === 'queue') {
    if (!b.queues[name]) {
      if (b.kind === ARTEMIS && policyOf(b, name).autoCreateQueues === false) return fail('JMS:DESTINATION_NOT_FOUND', `AMQ229017: Queue ${name} does not exist`)
      if (!allowed(b, c.user, kind, name, 'admin')) return fail('JMS:SECURITY', deniedText(b, c.user, kind, name, 'admin'))
      ensureQueue(s, b, name)
    }
    id = `q:${name}`
  } else {
    b.topics[name] ??= topic(name, s.clock)
    const subName = clean(o.subscriptionName)
    let key
    if (o.shared) {
      if (b.kind === CLASSIC) return fail('JMS:CONSUMING', `javax.jms.JMSException: Shared subscriptions are not supported by ActiveMQ Classic ${b.version} (lab wording). Use a virtual topic or a queue.`)
      if (c.spec !== 'JMS_2_0') return fail('JMS:CONSUMING', 'A shared topic consumer needs specification="JMS_2_0" on the JMS connection (lab wording).')
      if (!subName) return fail('JMS:CONSUMING', 'A shared subscription needs a subscription name.')
      durable = Boolean(o.durable)
      key = `${durable ? 'shared' : 'shared-nd'}:${subName}`
    } else if (o.durable) {
      if (!c.clientId)
        return fail('JMS:CONSUMING', b.kind === CLASSIC ? 'javax.jms.JMSException: You cannot create a durable subscriber without specifying a unique clientID on a Connection' : 'javax.jms.IllegalStateException: Cannot create a durable subscription without a client ID (lab wording)')
      if (!subName) return fail('JMS:CONSUMING', 'A durable subscription needs a subscription name.')
      durable = true
      key = `${c.clientId}:${subName}`
      const busy = b.consumers.find((k) => k.box === `s:${key}` && k.conn !== c.key)
      if (busy)
        return fail('JMS:CONSUMING', b.kind === CLASSIC ? `javax.jms.JMSException: Durable consumer is in use for client: ${c.clientId} and subscriptionName: ${subName}` : 'javax.jms.IllegalStateException: Cannot create a subscriber on the durable subscription since it already has subscriber(s)')
    } else key = `nd:${c.id}:${name}:${o.consumer ?? 1}`
    let sub = b.subs.find((x) => x.key === key)
    // a durable subscription that is opened on another topic is deleted and made again
    if (sub && sub.topic !== name) {
      b.subs = b.subs.filter((x) => x !== sub)
      sub = null
    }
    if (!sub) {
      sub = { key, topic: name, clientId: o.shared ? '' : c.clientId, name: subName, durable, shared: Boolean(o.shared), messages: [], enqueued: 0, dequeued: 0, created: s.clock, offlineSince: null, catchUps: [] }
      b.subs.push(sub)
      // the subscriptions ever made, kept for the lab steps after one is deleted
      if (durable) b.made = [...(b.made ?? []), { t: s.clock, key, clientId: sub.clientId, shared: sub.shared }].slice(-20)
    } else if (sub.offlineSince != null) {
      const up = { from: sub.offlineSince, to: s.clock, pending: sub.messages.length, key }
      sub.catchUps = [...(sub.catchUps ?? []), up].slice(-10)
      b.catchUps = [...(b.catchUps ?? []), up].slice(-20)
      sub.offlineSince = null
    }
    id = `s:${key}`
  }
  const kkey = `${c.key}|${id}|${o.consumer ?? 1}`
  let k = b.consumers.find((x) => x.key === kkey)
  if (!k) {
    k = { key: kkey, conn: c.key, app: c.app, replica: c.replica, box: id, t: s.clock, ...prefetchOf(b, c.params, kind, durable), deliveredCount: 0, acked: 0 }
    b.consumers.push(k)
  }
  return { ok: true, b, c, k }
}

function consumeOn(s, app, cfg, name, o, tx) {
  const r = attach(s, app, cfg, name, o, false)
  if (!r.ok) return r
  const { b, c, k } = r
  if (!masterOf(b)) return fail('JMS:CONNECTIVITY', refusedText(b, parseUrl(cfg.url)))
  const got = take(b, k, Math.max(1, o.max ?? 1))
  if (!got.length && o.timeout) return fail('JMS:TIMEOUT', `Failed to retrieve a Message. Operation timed out after ${o.timeout} milliseconds (lab wording)`)
  const ackMode = String(o.ackMode ?? 'AUTO').toUpperCase()
  const messages = got.map((m) => viewOf(m, k))
  if (tx) tx.taken.push([k, got.map((m) => m.id)])
  else if (ackMode !== 'MANUAL') ackMsgs(b, k, got.map((m) => m.id))
  return { ok: true, messages, consumer: k.key, connection: c.id }
}

function consumerById(s, ackId) {
  for (const b of brokersOf(s)) {
    const k = b.consumers.find((x) => x.key === ackId)
    if (k) return { b, k, c: b.conns.find((x) => x.key === k.conn) }
  }
  return null
}
const closedText = (s, cfg) => {
  const b = brokerAt(s, parseUrl(cfg?.url))
  return b?.kind === ARTEMIS ? 'AMQ219019: Session is closed' : 'javax.jms.IllegalStateException: The Session is closed'
}

function txOf(b, c) {
  return { b, c, out: [], taken: [] }
}
function commit(s, tx) {
  for (const [type, name, m] of tx.out) deliver(s, tx.b, type, name, m)
  for (const [k, ids] of tx.taken) ackMsgs(tx.b, k, ids)
}
function rollback(s, tx) {
  const out = []
  for (const [k, ids] of tx.taken) out.push(...recoverMsgs(s, tx.b, k, ids, tx.c))
  return out
}

// The Mule JMS listener. o: { type, ackMode (AUTO, IMMEDIATE, MANUAL, DUPS_OK), transactionalAction (NONE or
// ALWAYS_BEGIN), max (messages this lab minute), consumer (index of the consumer), durable, shared, subscriptionName }.
// handler(message, { publish }) returns { ok, ack }. With ALWAYS_BEGIN each message runs in a local JMS transaction:
// publishes on the same connection join it, success commits, an error rolls back and the message comes again.
// Without a transaction AUTO acknowledges after the flow succeeds and recovers the session after an error.
function listenOn(s, app, cfg, name, o, handler) {
  const r = attach(s, app, cfg, name, o, true)
  if (!r.ok) return r
  const { b, c, k } = r
  const mode = String(o.ackMode ?? 'AUTO').toUpperCase()
  const transacted = String(o.transactionalAction ?? 'NONE').toUpperCase() === 'ALWAYS_BEGIN'
  const results = []
  const tries = {}
  let stuck = null
  const max = o.max ?? 100
  const call = (view, api) => {
    try {
      return handler(view, api) ?? { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }
  for (let n = 0; n < max; ) {
    const [m] = take(b, k, 1)
    if (!m) break
    tries[m.id] = (tries[m.id] ?? 0) + 1
    const view = viewOf(m, k)
    if (transacted) {
      const tx = txOf(b, c)
      tx.taken.push([k, [m.id]])
      const res = call(view, { publish: (dest, body, po = {}) => publishOn(s, app, cfg, po.type === 'topic' ? 'topic' : 'queue', dest, body, po, tx) })
      if (res.ok) {
        commit(s, tx)
        results.push({ id: m.id, ok: true, outcome: 'committed', deliveryCount: view.deliveryCount, result: res })
        n++
        continue
      }
      const [back] = rollback(s, tx)
      results.push({ id: m.id, ok: false, outcome: back?.outcome === 'dlq' ? 'dlq' : 'rolled back', to: back?.to, deliveryCount: view.deliveryCount, result: res })
      if (back?.outcome === 'dlq') n++
      else if (tries[m.id] >= TRIES_PER_RUN) {
        stuck = m.id
        break
      }
      continue
    }
    if (mode === 'IMMEDIATE') ackMsgs(b, k, [m.id])
    const res = call(view, { publish: (dest, body, po = {}) => publishOn(s, app, cfg, po.type === 'topic' ? 'topic' : 'queue', dest, body, po) })
    if (res.ok) {
      if (mode === 'AUTO') ackMsgs(b, k, null)
      else if (mode === 'MANUAL' && res.ack) ackMsgs(b, k, null)
      results.push({ id: m.id, ok: true, outcome: mode === 'MANUAL' && !res.ack ? 'unacknowledged' : 'acknowledged', deliveryCount: view.deliveryCount, result: res })
      n++
      continue
    }
    if (mode === 'IMMEDIATE') {
      results.push({ id: m.id, ok: false, outcome: 'lost', deliveryCount: view.deliveryCount, result: res })
      n++
      continue
    }
    if (mode === 'MANUAL') {
      results.push({ id: m.id, ok: false, outcome: 'unacknowledged', deliveryCount: view.deliveryCount, result: res })
      n++
      continue
    }
    // AUTO and DUPS_OK: the session is recovered, and every message it delivered without an ack comes again
    const back = recoverMsgs(s, b, k, null, c)
    const mine = back.find((x) => x.id === m.id)
    results.push({ id: m.id, ok: false, outcome: mine?.outcome === 'dlq' ? 'dlq' : 'redelivery', to: mine?.to, deliveryCount: view.deliveryCount, again: back.filter((x) => x.id !== m.id).map((x) => x.id), result: res })
    if (mine?.outcome === 'dlq') n++
    else if (tries[m.id] >= TRIES_PER_RUN) {
      stuck = m.id
      break
    }
  }
  if (mode === 'DUPS_OK' && !transacted) ackMsgs(b, k, null)
  return { ok: true, results, stuck, consumer: k.key, connection: c.id, node: c.node }
}

// The context an app gets as ctx.jms. Every call takes the connection settings of connOf(props, replica) first.
export function jmsCtx(s, app) {
  upgradeJms(s)
  return {
    publish: (cfg, dest, body, o = {}) => publishOn(s, app, cfg, o.type === 'topic' ? 'topic' : 'queue', dest, body, o),
    consume: (cfg, dest, o = {}) => consumeOn(s, app, cfg, dest, o),
    listen: (cfg, dest, o, handler) => listenOn(s, app, cfg, dest, o ?? {}, handler),
    ack(cfg, ackId) {
      const f = consumerById(s, ackId)
      if (!f || !f.c || f.c.broken) return fail('JMS:ACK', closedText(s, cfg))
      return { ok: true, acknowledged: ackMsgs(f.b, f.k, null) }
    },
    recover(cfg, ackId) {
      const f = consumerById(s, ackId)
      if (!f || !f.c || f.c.broken) return fail('JMS:ACK', closedText(s, cfg))
      return { ok: true, results: recoverMsgs(s, f.b, f.k, null, f.c) }
    },
    // fn(tx) with tx.publish(dest, body, o) and tx.consume(dest, o); fn returns { ok }. Success commits, else rollback.
    transaction(cfg, fn) {
      const r = open(s, app, cfg, false)
      if (!r.ok) return r
      const tx = txOf(r.b, r.c)
      let value
      try {
        value = fn({
          publish: (dest, body, o = {}) => publishOn(s, app, cfg, o.type === 'topic' ? 'topic' : 'queue', dest, body, o, tx),
          consume: (dest, o = {}) => consumeOn(s, app, cfg, dest, o, tx),
        }) ?? { ok: true }
      } catch (e) {
        value = { ok: false, error: String(e?.message ?? e) }
      }
      if (value.ok) {
        commit(s, tx)
        return { ok: true, committed: true, value }
      }
      return { ok: false, committed: false, rolledBack: true, results: rollback(s, tx), value, muleType: value.muleType, text: value.text ?? value.error }
    },
    // queue statistics, the way a monitor reads them over Jolokia: QueueSize, ConsumerCount, EnqueueCount, DequeueCount
    stats(cfg, name) {
      const b = brokerAt(s, parseUrl(cfg.url))
      if (!b || !masterOf(b)) return fail('JMS:CONNECTIVITY', refusedText(b, parseUrl(cfg.url)))
      const q = b.queues[name]
      if (!q) return fail('JMS:DESTINATION_NOT_FOUND', `No queue named ${name} on ${b.name}`)
      return { ok: true, QueueSize: q.messages.length, ConsumerCount: consumersOf(b, `q:${name}`).length, EnqueueCount: q.enqueued, DequeueCount: q.dequeued, bytes: bytesOf(q.messages), storePercentUsage: usageOf(b).storePct }
    },
    close(cfg) {
      const key = `${app?.env ?? 'lab'}|${app?.name ?? 'console'}|${cfg.replica ?? 1}`
      for (const b of brokersOf(s)) for (const c of b.conns.filter((x) => x.key === key)) closeConn(s, b, c)
      return { ok: true }
    },
  }
}

// Runs once a lab minute while state.jms exists: nodes come back, connections of stopped apps close, messages expire
export function jmsTick(s) {
  upgradeJms(s)
  for (const b of brokersOf(s)) {
    b.subs ??= []
    b.consumers ??= []
    b.conns ??= []
    for (const n of b.nodes) if (!n.up && n.downUntil != null && n.downUntil <= s.clock) startNode(s, b, n)
    if (!masterOf(b)) {
      const n = b.nodes.find((x) => x.up)
      if (n) takeOver(s, b, n)
    }
    for (const c of [...b.conns]) {
      const a = (s.apps ?? []).find((x) => x.name === c.app && x.env === c.env)
      if (c.app === 'console') continue
      if (!a || a.status !== 'Running' || c.replica > (a.replicas ?? 1) || (a.started ?? 0) !== c.started) closeConn(s, b, c)
      // lab-made: a connection not used for 5 minutes is closed by its app
      else if (!c.broken && s.clock - c.last > 5 * MINUTE) closeConn(s, b, c)
    }
    settleSubs(s, b)
    expire(s, b)
    boxDispatch(b)
  }
  return s
}

// ---------- the web console: each action takes the lab state and returns { state, ok, text } ----------

function act(state, name, fn) {
  const s = upgradeJms(structuredClone(state))
  const b = brokerOf(s, name)
  if (!b) return { state, ok: false, text: `There is no broker named ${name}.` }
  const r = fn(b, s) ?? { ok: true }
  return r.ok === false ? { ...r, state } : { ok: true, ...r, state: s }
}

// Send page: f { dest, type, body, correlationId, persistent, priority, ttl, props, count, replyTo, msgType, size }
export const sendTo = (state, name, f) =>
  act(state, name, (b, s) => {
    const dest = clean(f.dest)
    const type = f.type === 'topic' ? 'topic' : 'queue'
    if (!dest) return { ok: false, text: 'Enter a destination.' }
    if (!masterOf(b)) return { ok: false, text: 'The broker is not running.' }
    const persistent = f.persistent !== false
    const why = blockedBy(b, type, dest, persistent)
    if (why) return { ok: false, text: blockedText(b, why, type, dest, 'ID:web-console:1:1') }
    const count = Math.max(1, Math.min(500, Number(f.count) || 1))
    for (let i = 0; i < count; i++) deliver(s, b, type, dest, newMessage(s, b, null, type, dest, f.body ?? '', { ...f, type: f.msgType, persistent }))
    return { ok: true, text: `Sent ${count} message${count > 1 ? 's' : ''} to ${type}://${dest}.` }
  })

export const purgeQueue = (state, name, q) =>
  act(state, name, (b) => {
    const box = b.queues[q]
    if (!box) return { ok: false, text: `No queue ${q}.` }
    const before = box.messages.length
    box.messages = box.messages.filter((m) => m.delivered)
    box.dequeued += before - box.messages.length
    return { ok: true, text: `Purged ${before - box.messages.length} messages from ${q}.` }
  })

export const deleteMessage = (state, name, q, id) =>
  act(state, name, (b) => {
    const box = b.queues[q]
    if (!box?.messages.some((m) => m.id === id && !m.delivered)) return { ok: false, text: 'The message is not in the queue, or a consumer has it.' }
    box.messages = box.messages.filter((m) => m.id !== id)
    box.dequeued++
    return { ok: true, text: `Deleted ${id}.` }
  })

// Move (Classic message page, Artemis "Move message"): the message goes to another queue with a delivery count of 0
export const moveMessage = (state, name, from, id, to) =>
  act(state, name, (b, s) => {
    const box = b.queues[from]
    const m = box?.messages.find((x) => x.id === id && !x.delivered)
    if (!m) return { ok: false, text: 'The message is not in the queue, or a consumer has it.' }
    if (!clean(to) || to === from) return { ok: false, text: 'Choose another queue.' }
    box.messages = box.messages.filter((x) => x !== m)
    box.dequeued++
    deliver(s, b, 'queue', to, { ...m, held: null, delivered: false, redeliveries: 0, redelivered: false, exp: 0 })
    return { ok: true, text: `Moved ${id} to ${to}.` }
  })
// Retry (Classic, a message in a DLQ): back to the destination it came from
export const retryMessage = (state, name, q, id) => {
  const m = brokerOf(state, name)?.queues[q]?.messages.find((x) => x.id === id)
  const origin = m?.origin?.startsWith('queue://') ? m.origin.slice(8) : ''
  if (!origin) return { state, ok: false, text: 'This message has no queue to go back to.' }
  return moveMessage(state, name, q, id, origin)
}
// lab helper: move every message of a queue (Artemis "Retry messages" on a DLQ does this)
export const moveAll = (state, name, from, to) =>
  act(state, name, (b, s) => {
    const box = b.queues[from]
    if (!box || !clean(to) || to === from) return { ok: false, text: 'Choose another queue.' }
    const list = box.messages.filter((m) => !m.delivered)
    box.messages = box.messages.filter((m) => m.delivered)
    box.dequeued += list.length
    for (const m of list) deliver(s, b, 'queue', to === '(origin)' ? m.origin?.slice(8) || from : to, { ...m, held: null, delivered: false, redeliveries: 0, redelivered: false, exp: 0 })
    return { ok: true, text: `Moved ${list.length} messages.` }
  })

const NAME = /^[A-Za-z0-9._\-:]{1,200}$/
export const createDestination = (state, name, type, dest) =>
  act(state, name, (b, s) => {
    if (!NAME.test(clean(dest))) return { ok: false, text: 'A name has letters, digits, dots, dashes, colons and underscores.' }
    if (type === 'topic') b.topics[dest] ??= topic(dest, s.clock)
    else ensureQueue(s, b, dest)
    return { ok: true, text: `Created ${type}://${dest}.` }
  })
export const deleteDestination = (state, name, type, dest) =>
  act(state, name, (b, s) => {
    if (type === 'topic') {
      delete b.topics[dest]
      for (const sub of b.subs.filter((x) => x.topic === dest)) for (const k of consumersOf(b, `s:${sub.key}`)) dropConsumer(b, k)
      b.subs = b.subs.filter((x) => x.topic !== dest)
    } else {
      for (const k of consumersOf(b, `q:${dest}`)) dropConsumer(b, k)
      delete b.queues[dest]
    }
    settleSubs(s, b)
    return { ok: true, text: `Deleted ${type}://${dest}.` }
  })
// Delete an offline durable subscription (Classic Subscribers page, Artemis delete of the subscription queue)
export const deleteSubscription = (state, name, key) =>
  act(state, name, (b) => {
    const sub = b.subs.find((x) => x.key === key)
    if (!sub) return { ok: false, text: 'No such subscription.' }
    const n = consumersOf(b, `s:${key}`).length
    if (n) return { ok: false, text: b.kind === CLASSIC ? `javax.jms.JMSException: Durable consumer is in use for client: ${sub.clientId} and subscriptionName: ${sub.name}` : `AMQ229025: Cannot delete queue ${subQueueName(b, sub)} on binding ${sub.topic} - it has consumers = ${n}` }
    b.subs = b.subs.filter((x) => x !== sub)
    return { ok: true, text: `Deleted the subscription ${subQueueName(b, sub)}.` }
  })

// Broker configuration. Classic reads activemq.xml at start, so a change waits for the next restart. Artemis reloads
// address settings while it runs; other values wait for a restart.
export const setConfig = (state, name, patch) =>
  act(state, name, (b) => {
    if (b.kind === ARTEMIS && 'addressSettings' in patch) {
      b.config.addressSettings = patch.addressSettings
      const { addressSettings, ...rest } = patch
      if (Object.keys(rest).length) b.pending = { ...(b.pending ?? {}), ...rest }
      return { ok: true, text: 'AMQ221056: Reloading configuration: address settings.' }
    }
    b.pending = { ...(b.pending ?? {}), ...patch }
    return { ok: true, text: 'Saved. The broker reads the file when it starts, so restart it to apply the change.' }
  })
export const configOf = (b) => ({ ...b.config, ...(b.pending ?? {}) })

// ---------- what the console pages show ----------

export const pendingOf = (q) => q.messages.length
export const inFlightOf = (q) => q.messages.filter((m) => m.held).length
export const queueBytes = (q) => bytesOf(q.messages)
export const messageView = (m) => viewOf(m, { key: m.held ?? '' })
export const subsOf = (b, topicName) => b.subs.filter((x) => !topicName || x.topic === topicName)
export const subActive = (b, sub) => consumersOf(b, `s:${sub.key}`).length > 0
export const connOfConsumer = (b, k) => b.conns.find((c) => c.key === k.conn)
export const heldBy = (b, k) => (boxOf(b, k.box)?.messages ?? []).filter((m) => m.held === k.key)
export const boxOfConsumer = (b, k) => boxOf(b, k.box)
// the apps of the console whose jms.url points at this broker
export const appsOn = (s, b) => (s.apps ?? []).filter((a) => brokerAt(s, parseUrl({ ...a.props, ...a.secrets }['jms.url'])) === b)
