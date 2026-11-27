// Apache Kafka for the Platform Lab: clusters of brokers, topics with partitions and replicas, consumer groups with
// committed offsets, and a small Schema Registry. Pure like the rest of the lab: a UI action takes a state and returns a
// new one, and the ctx API that packages use (kafkaCtx) changes the draft state the engine hands it.
//
// Facts from the Apache Kafka documentation (4.4): min.insync.replicas default 1, and with acks=all a write to a
// partition with fewer in-sync replicas fails with NotEnoughReplicas; producer acks default all; consumer
// auto.offset.reset default latest (none throws when the group has no offset); retention.ms default 604800000;
// cleanup.policy default delete, compact keeps the latest value per key; max.message.bytes default 1048588;
// max.poll.records default 500; each partition goes to one member of a group and a member that joins or leaves
// starts a rebalance. A keyed record goes to the partition of a murmur2 hash of its key.
// Facts from the MuleSoft Apache Kafka Connector reference: Message Listener and Batch Message Listener sources;
// acknowledgement modes AUTO (commit when the flow succeeds), MANUAL (the flow calls Commit), IMMEDIATE and DUPS_OK;
// consumer Default auto offset reset EARLIEST, LATEST (default) or ERROR; producer Acknowledge Mode NONE (default),
// LEADER_ONLY or ALL; error types such as KAFKA:CONNECTIVITY, KAFKA:INVALID_OFFSET and KAFKA:INPUT_TOO_LARGE.
// Everything marked "lab-made" below is a simplification of the lab and not how a real cluster behaves.

const MINUTE = 60000
const MAX_KEEP = 300 // lab-made: a partition keeps its last 300 records, so a saved console stays small
const ACTIVE_SEGMENT = MINUTE // lab-made: compaction leaves the records of the current lab minute alone
const enc = new TextEncoder()
const bytes = (x) => (x === null || x === undefined ? 0 : enc.encode(x).length)
const text = (v) => (v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v))

export const TOPIC_DEFAULTS = {
  'cleanup.policy': 'delete',
  'retention.ms': '604800000',
  'retention.bytes': '-1',
  'min.insync.replicas': '1',
  'max.message.bytes': '1048588',
  'delete.retention.ms': '86400000',
  'unclean.leader.election.enable': 'false',
  'segment.ms': '604800000',
}
export const CONFIG_HELP = {
  'cleanup.policy': 'delete removes old records by time or size. compact keeps the latest record of each key.',
  'retention.ms': 'How long a record is kept before it is deleted. -1 keeps records forever.',
  'retention.bytes': 'The largest size of a partition before old records are deleted. -1 has no limit.',
  'min.insync.replicas': 'With acks=all, a write needs at least this many in-sync replicas, the leader included.',
  'max.message.bytes': 'The largest record batch the broker accepts for this topic.',
  'delete.retention.ms': 'How long a tombstone (a record with a null value) stays in a compacted topic.',
  'unclean.leader.election.enable': 'Lets a replica that is not in sync become the leader. It can lose data.',
  'segment.ms': 'How often the broker rolls a new log segment.',
}
const NUMERIC = ['retention.ms', 'retention.bytes', 'min.insync.replicas', 'max.message.bytes', 'delete.retention.ms', 'segment.ms']

// ---------- errors ----------

const fail = (error, message, muleType) => ({ ok: false, error, text: message, muleType })
// The Mule error type next to each Kafka error is lab-made where the connector reference does not name one
const ERR = {
  noCluster: (name) => fail('BROKER_NOT_AVAILABLE', `org.apache.kafka.common.KafkaException: Failed to construct kafka consumer. No resolvable bootstrap urls given in bootstrap.servers (${name}:9092).`, 'KAFKA:CONNECTIVITY'),
  down: (c) => fail('BROKER_NOT_AVAILABLE', `Connection to node -1 (${c.brokers[0]?.host ?? 'broker'}) could not be established. Broker may not be available.`, 'KAFKA:CONNECTIVITY'),
  topic: (topic) => fail('UNKNOWN_TOPIC_OR_PARTITION', `org.apache.kafka.common.errors.TimeoutException: Topic ${topic} not present in metadata after 60000 ms.`, 'KAFKA:TIMEOUT'),
  consumerTopic: (topic) => fail('UNKNOWN_TOPIC_OR_PARTITION', `Error while fetching metadata with correlation id 2 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`, 'KAFKA:NOT_FOUND'),
  partition: (topic, p) => fail('UNKNOWN_TOPIC_OR_PARTITION', `org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition. (${topic}-${p})`, 'KAFKA:INVALID_TOPIC_PARTITION'),
  leader: (topic, p) => fail('LEADER_NOT_AVAILABLE', `org.apache.kafka.common.errors.TimeoutException: Expiring 1 record(s) for ${topic}-${p}: 120000 ms has passed since batch creation. The partition has no leader.`, 'KAFKA:TIMEOUT'),
  replicas: (topic, p, isr, min) => fail('NOT_ENOUGH_REPLICAS', `org.apache.kafka.common.errors.NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas than required. (${topic}-${p}: ISR ${isr}, min.insync.replicas ${min})`, 'KAFKA:RETRY_EXHAUSTED'),
  large: (size, max) => fail('MESSAGE_TOO_LARGE', `org.apache.kafka.common.errors.RecordTooLargeException: The request included a message larger than the max message size the server will accept. (${size} bytes, max.message.bytes ${max})`, 'KAFKA:INPUT_TOO_LARGE'),
  noKey: (topic) => fail('INVALID_RECORD', `org.apache.kafka.common.InvalidRecordException: Compacted topic cannot accept message without key in topic partition ${topic}.`, 'KAFKA:INVALID_INPUT'),
  range: (topic, p, pos) => fail('OFFSET_OUT_OF_RANGE', `org.apache.kafka.clients.consumer.OffsetOutOfRangeException: Fetch position FetchPosition{offset=${pos}} is out of range for partition ${topic}-${p}`, 'KAFKA:INVALID_OFFSET'),
  noOffset: (topic, p) => fail('NO_OFFSET', `org.apache.kafka.clients.consumer.NoOffsetForPartitionException: Undefined offset with no reset policy for partitions: [${topic}-${p}]`, 'KAFKA:INVALID_OFFSET'),
  group: (gid) => fail('GROUP_ID_NOT_FOUND', `The group ${gid} does not exist.`, 'KAFKA:NOT_FOUND'),
  commit: () => fail('COMMIT_FAILED', 'org.apache.kafka.clients.consumer.CommitFailedException: Commit cannot be completed since the group has already rebalanced and assigned the partitions to another member.', 'KAFKA:RETRY_EXHAUSTED'),
  topicAuth: (topic) => fail('TOPIC_AUTHORIZATION_FAILED', `org.apache.kafka.common.errors.TopicAuthorizationException: Not authorized to access topics: [${topic}]`, 'KAFKA:NOT_AUTHORIZED'),
  groupAuth: (gid) => fail('GROUP_AUTHORIZATION_FAILED', `org.apache.kafka.common.errors.GroupAuthorizationException: Not authorized to access group: ${gid}`, 'KAFKA:NOT_AUTHORIZED'),
  sasl: () => fail('SASL_AUTHENTICATION_FAILED', 'org.apache.kafka.common.errors.SaslAuthenticationException: Authentication failed during authentication due to invalid credentials with SASL mechanism SCRAM-SHA-512', 'KAFKA:CONNECTIVITY'),
}

// ---------- authentication and ACLs ----------

// A cluster with `authorizer` on runs the StandardAuthorizer with allow.everyone.if.no.acl.found=false: a principal may
// do only what an ALLOW ACL gives it, and a DENY wins. A cluster with `scram` users checks SASL/SCRAM-SHA-512 logins.
// The console (the Kafka UI) acts as a super user. lab-made: the lab keeps the SCRAM passwords in plain text; a real
// broker stores salted hashes.
export const ACL_RESOURCES = ['TOPIC', 'GROUP', 'CLUSTER', 'TRANSACTIONAL_ID']
export const ACL_OPERATIONS = ['ALL', 'READ', 'WRITE', 'CREATE', 'DELETE', 'ALTER', 'DESCRIBE', 'DESCRIBE_CONFIGS', 'ALTER_CONFIGS', 'IDEMPOTENT_WRITE']
export const ACL_PATTERNS = ['LITERAL', 'PREFIXED']
// READ, WRITE, DELETE and ALTER on a resource imply DESCRIBE on it (Kafka authorization docs)
const IMPLY_DESCRIBE = ['READ', 'WRITE', 'DELETE', 'ALTER']
function aclMatches(a, principal, resource, name, op) {
  if ((a.principal !== principal && a.principal !== 'User:*') || a.resource !== resource) return false
  const named = a.pattern === 'PREFIXED' ? String(name).startsWith(a.name) : a.name === '*' || a.name === name
  if (!named || (a.host && a.host !== '*')) return false
  return a.operation === 'ALL' || a.operation === op || (op === 'DESCRIBE' && IMPLY_DESCRIBE.includes(a.operation))
}
// `principal` null is the console
export function authorized(c, principal, resource, name, op) {
  if (!c.authorizer || principal === null) return true
  const list = (c.acls ?? []).filter((a) => aclMatches(a, principal, resource, name, op))
  return !list.some((a) => a.permission === 'DENY') && list.some((a) => a.permission === 'ALLOW')
}
// The principal of an app call: { ok, principal } or a SASL error. `auth` is { user, password } from the app.
function principalOf(c, auth) {
  if (!c.authorizer && !c.scram) return { ok: true, principal: null }
  const user = String(auth?.user ?? '').trim()
  if (c.scram) {
    if (!user || c.scram[user] === undefined || c.scram[user] !== String(auth?.password ?? '')) return ERR.sasl()
  }
  return { ok: true, principal: user ? `User:${user}` : 'User:ANONYMOUS' }
}

// ---------- state ----------

export const newKafka = (extra = {}) => ({ clusters: {}, ...extra })

export function newCluster(name, brokerCount = 3, extra = {}) {
  return {
    name,
    version: '3.9.0',
    brokers: Array.from({ length: brokerCount }, (_, i) => ({ id: i + 1, host: `kafka-${i + 1}.${name}.lab:9092`, up: true })),
    config: { 'auto.create.topics.enable': 'false', 'num.partitions': '1', 'default.replication.factor': '1' },
    topics: {},
    groups: {},
    acls: [],
    schemaRegistry: { compatibility: 'BACKWARD', nextId: 1, subjects: {} },
    ...extra,
  }
}

const clusterOf = (s, name) => s.kafka?.clusters?.[name]
const newGroup = () => ({ members: [], offsets: {}, positions: {}, topics: [], state: 'Empty', generation: 0, history: [] })
const num = (t, key) => Number(t.config[key] ?? TOPIC_DEFAULTS[key])
export const startOf = (p) => p.logStart ?? 0
export const endOf = (p) => p.nextOffset ?? 0

// The controller places replicas on brokers that are up. lab-made: with too few up, it uses every broker.
const placeIds = (c, rf) => {
  const live = c.brokers.filter((b) => b.up).map((b) => b.id)
  return live.length >= rf ? live : c.brokers.map((b) => b.id)
}
function placeTopic(c, name, partitions, rf, config = {}, now = 0) {
  const ids = placeIds(c, rf)
  c.topics[name] = {
    created: now,
    rr: 0,
    config: { ...config },
    partitions: Array.from({ length: partitions }, (_, p) => {
      const replicas = Array.from({ length: rf }, (_, k) => ids[(p + k) % ids.length])
      return { id: p, leader: replicas[0], replicas, isr: [...replicas], logStart: 0, nextOffset: 0, messages: [] }
    }),
  }
  heal(c)
  return c.topics[name]
}

// Leaders and in-sync replicas follow the brokers that are up. A clean election picks a leader from the ISR.
// lab-made: a broker that comes back is in sync again at once; a real one first fetches what it missed.
function heal(c) {
  const up = new Set(c.brokers.filter((b) => b.up).map((b) => b.id))
  for (const t of Object.values(c.topics))
    for (const p of t.partitions) {
      p.isr = p.replicas.filter((id) => up.has(id))
      if (!p.isr.includes(p.leader)) p.leader = p.isr[0] ?? -1
    }
}

// Retention and compaction. lab-made: the broker removes single records here; a real one removes whole segments.
function tidy(c, now) {
  for (const t of Object.values(c.topics)) {
    const policy = String(t.config['cleanup.policy'] ?? TOPIC_DEFAULTS['cleanup.policy'])
    const keep = num(t, 'retention.ms')
    for (const p of t.partitions) {
      if (policy.includes('delete') && keep >= 0) p.messages = p.messages.filter((m) => m.t >= now - keep)
      if (policy.includes('compact')) {
        const last = new Map()
        for (const m of p.messages) if (m.t < now - ACTIVE_SEGMENT) last.set(m.key, m.offset)
        const tomb = num(t, 'delete.retention.ms')
        p.messages = p.messages.filter((m) => m.t >= now - ACTIVE_SEGMENT || (last.get(m.key) === m.offset && !(m.value === null && m.t < now - tomb)))
      }
      if (p.messages.length > MAX_KEEP) p.messages.splice(0, p.messages.length - MAX_KEEP)
      // the log start moves when old records go; a compacted topic keeps its start
      if (!policy.includes('compact')) p.logStart = Math.max(startOf(p), p.messages[0]?.offset ?? endOf(p))
    }
  }
}

// A member stays in its group while its application runs. A replica that stops or a server that leaves takes its
// member out, and the group waits for the next poll to rebalance.
function wanted(s, m) {
  const app = (s.apps ?? []).find((a) => a.name === m.app && a.env === m.env)
  if (!app || app.status !== 'Running') return false
  // a member belongs to one start of the app: after a stop and start (or a redeploy) its consumers join again
  if ((m.started ?? null) !== (app.started ?? null)) return false
  if (m.node) return app.nodes?.[m.node] === 'Started'
  return m.slot < (app.replicas ?? 1) * (m.consumers ?? 1)
}
function syncGroups(s, c) {
  for (const g of Object.values(c.groups)) {
    const before = g.members.length
    g.members = g.members.filter((m) => !m.app || wanted(s, m))
    if (g.members.length !== before) {
      g.state = g.members.length ? 'PreparingRebalance' : 'Empty'
      g.positions = {}
      for (const m of g.members) m.partitions = []
      note(s, g, g.members.length ? 'A member left. The group rebalances at the next poll.' : 'The last member left. The group is empty.')
    }
  }
}
const note = (s, g, why) => {
  g.history.push({ t: s.clock ?? 0, generation: g.generation, why })
  if (g.history.length > 20) g.history.shift()
}

// The range assignor, the first strategy of the Java client: partitions of each topic in order, members in order
function rebalance(s, c, g, why) {
  for (const m of g.members) m.partitions = []
  const members = [...g.members].sort((a, b) => a.client.localeCompare(b.client))
  for (const name of g.topics) {
    const t = c.topics[name]
    if (!t || !members.length) continue
    const n = t.partitions.length
    const per = Math.floor(n / members.length)
    const extra = n % members.length
    let next = 0
    members.forEach((m, i) => {
      const count = per + (i < extra ? 1 : 0)
      for (let k = 0; k < count; k++) m.partitions.push({ topic: name, partition: next++ })
    })
  }
  g.generation++
  g.state = g.members.length ? 'Stable' : 'Empty'
  // after a rebalance each member starts from the committed offsets, so records read and not committed come again
  g.positions = {}
  note(s, g, why)
}

export function kafkaTick(s) {
  for (const c of Object.values(s.kafka?.clusters ?? {})) {
    heal(c)
    tidy(c, s.clock ?? 0)
    syncGroups(s, c)
  }
}

// ---------- producing ----------

// The default partitioner of the Java client hashes the key with murmur2
export function murmur2(data) {
  const m = 0x5bd1e995
  let h = 0x9747b28c ^ data.length
  const len4 = data.length >> 2
  for (let i = 0; i < len4; i++) {
    const i4 = i * 4
    let k = (data[i4] & 0xff) | ((data[i4 + 1] & 0xff) << 8) | ((data[i4 + 2] & 0xff) << 16) | ((data[i4 + 3] & 0xff) << 24)
    k = Math.imul(k, m)
    k ^= k >>> 24
    k = Math.imul(k, m)
    h = Math.imul(h, m)
    h ^= k
  }
  const tail = data.length & ~3
  switch (data.length % 4) {
    case 3:
      h ^= (data[tail + 2] & 0xff) << 16
    // falls through
    case 2:
      h ^= (data[tail + 1] & 0xff) << 8
    // falls through
    case 1:
      h ^= data[tail] & 0xff
      h = Math.imul(h, m)
  }
  h ^= h >>> 13
  h = Math.imul(h, m)
  h ^= h >>> 15
  return h | 0
}
export const partitionFor = (key, count) => (murmur2(enc.encode(key)) & 0x7fffffff) % count

const ACKS = { all: 'all', '-1': 'all', ALL: 'all', 1: '1', LEADER_ONLY: '1', 0: '0', NONE: '0' }

function produceOn(s, c, topic, record = {}, principal = null) {
  heal(c)
  tidy(c, s.clock ?? 0)
  if (!c.brokers.some((b) => b.up)) return ERR.down(c)
  if (!authorized(c, principal, 'TOPIC', topic, 'WRITE')) return ERR.topicAuth(topic)
  let t = c.topics[topic]
  if (!t) {
    if (c.config['auto.create.topics.enable'] !== 'true') return ERR.topic(topic)
    t = placeTopic(c, topic, Number(c.config['num.partitions']), Math.min(Number(c.config['default.replication.factor']), c.brokers.length), {}, s.clock)
  }
  const key = text(record.key)
  const value = text(record.value)
  const headers = { ...(record.headers ?? {}) }
  const policy = String(t.config['cleanup.policy'] ?? TOPIC_DEFAULTS['cleanup.policy'])
  if (policy.includes('compact') && key === null) return ERR.noKey(topic)
  const size = bytes(key) + bytes(value) + bytes(JSON.stringify(headers)) + 70 // 70 bytes of batch header, a lab-made figure
  if (size > num(t, 'max.message.bytes')) return ERR.large(size, num(t, 'max.message.bytes'))
  let p
  if (record.partition !== undefined && record.partition !== null && record.partition !== '') {
    p = t.partitions[Number(record.partition)]
    if (!p) return ERR.partition(topic, record.partition)
  } else if (key !== null) p = t.partitions[partitionFor(key, t.partitions.length)]
  else {
    // lab-made: a record with no key goes round robin over the partitions that have a leader. The Java client uses
    // a sticky partitioner that fills one batch before it moves on.
    const live = t.partitions.filter((x) => x.leader !== -1)
    if (!live.length) return ERR.leader(topic, t.partitions[0].id)
    t.rr = (t.rr ?? 0) + 1
    p = live[(t.rr - 1) % live.length]
  }
  if (p.leader === -1) return ERR.leader(topic, p.id)
  const acks = ACKS[record.acks ?? 'all'] ?? 'all'
  if (acks === 'all' && p.isr.length < num(t, 'min.insync.replicas')) return ERR.replicas(topic, p.id, p.isr.length, num(t, 'min.insync.replicas'))
  const offset = endOf(p)
  p.messages.push({ offset, key, value, headers, t: s.clock ?? 0, size })
  p.nextOffset = offset + 1
  if (p.messages.length > MAX_KEEP) {
    p.messages.splice(0, p.messages.length - MAX_KEEP)
    p.logStart = p.messages[0].offset
  }
  return { ok: true, topic, partition: p.id, offset, timestamp: s.clock ?? 0, size }
}

// ---------- consuming ----------

const RESETS = { earliest: 'earliest', latest: 'latest', none: 'none', error: 'none' }
const ownerOf = (g, topic, partition) => g.members.find((m) => m.partitions.some((x) => x.topic === topic && x.partition === partition))

function pollOn(s, c, topic, gid, max, opts, app, node, principal = null) {
  heal(c)
  tidy(c, s.clock ?? 0)
  syncGroups(s, c)
  if (!c.brokers.some((b) => b.up)) return ERR.down(c)
  // the consumer joins its group first, then fetches: each needs READ
  if (!authorized(c, principal, 'GROUP', gid, 'READ')) return ERR.groupAuth(gid)
  if (!authorized(c, principal, 'TOPIC', topic, 'READ')) return ERR.topicAuth(topic)
  const t = c.topics[topic]
  if (!t) return ERR.consumerTopic(topic)
  const g = (c.groups[gid] ??= newGroup())
  let changed = false
  if (!g.topics.includes(topic)) {
    g.topics.push(topic)
    changed = true
  }
  // the members of this caller: one per replica (or per server) and per parallel consumer
  const consumers = Math.max(1, Number(opts.consumers ?? 1))
  const mine = []
  const slots = node ? consumers : (app?.replicas ?? 1) * consumers
  for (let slot = 0; slot < slots; slot++) {
    const client = app ? (node ? `${app.name}@${node}-${slot + 1}` : `${app.name}-replica-${Math.floor(slot / consumers) + 1}${consumers > 1 ? `-${(slot % consumers) + 1}` : ''}`) : `console-consumer-${slot + 1}`
    let m = g.members.find((x) => x.client === client)
    if (!m) {
      m = { client, app: app?.name, env: app?.env, node, slot, consumers, ...(app?.started !== undefined && { started: app.started }), host: node ? `/${node}` : `/10.0.${(slot % 200) + 1}.${(app?.name.length ?? 1) + 10}`, partitions: [], joined: s.clock ?? 0 }
      g.members.push(m)
      changed = true
    }
    mine.push(m)
  }
  // fewer consumers per replica than before: the members this caller no longer runs leave, or they would keep
  // partitions that nobody reads
  const before = g.members.length
  g.members = g.members.filter((x) => mine.includes(x) || x.app !== app?.name || x.env !== app?.env || (x.node ?? null) !== (node ?? null))
  const left = g.members.length !== before
  let rebalanced = false
  if (changed || left || g.state !== 'Stable') {
    rebalance(s, c, g, changed ? `${mine[0].client} joined.` : left ? `${before - g.members.length} member(s) of ${app?.name ?? 'the console'} left.` : 'Members joined again after a member left.')
    rebalanced = true
  }
  const reset = RESETS[String(opts.autoOffsetReset ?? g.autoOffsetReset ?? 'latest').toLowerCase()] ?? 'latest'
  const records = []
  const notes = []
  const assigned = mine.flatMap((m) => m.partitions.filter((x) => x.topic === topic).map((x) => ({ ...x, member: m.client })))
  g.positions[topic] ??= {}
  const pos = g.positions[topic]
  for (const a of assigned) {
    const p = t.partitions[a.partition]
    if (!p) continue
    if (p.leader === -1) {
      notes.push(`${topic}-${p.id} has no leader. The consumer waits.`)
      continue
    }
    let at = pos[p.id]
    if (at === undefined) {
      const committed = g.offsets[topic]?.[p.id]
      if (committed !== undefined) at = committed
      else if (reset === 'none') return ERR.noOffset(topic, p.id)
      else {
        at = reset === 'earliest' ? startOf(p) : endOf(p)
        notes.push(`Resetting offset for partition ${topic}-${p.id} to position FetchPosition{offset=${at}}.`)
      }
    }
    if (at < startOf(p) || at > endOf(p)) {
      if (reset === 'none') return ERR.range(topic, p.id, at)
      const to = reset === 'earliest' ? startOf(p) : endOf(p)
      notes.push(`Fetch position FetchPosition{offset=${at}} is out of range for partition ${topic}-${p.id}, resetting offset to ${to}.`)
      at = to
    }
    for (const m of p.messages) {
      if (records.length >= max) break
      if (m.offset < at) continue
      records.push({ topic, partition: p.id, offset: m.offset, key: m.key, value: m.value, headers: { ...m.headers }, timestamp: m.t, member: a.member })
      at = m.offset + 1
    }
    if (records.length < max) at = Math.max(at, endOf(p)) // a compacted log can have gaps at the end
    pos[p.id] = at
    if (opts.commit) (g.offsets[topic] ??= {})[p.id] = at
  }
  return { ok: true, records, assigned, rebalanced, generation: g.generation, members: mine.map((m) => m.client), notes }
}

function commitOn(s, c, topic, gid, partition, offset, app, principal = null) {
  if (!c.brokers.some((b) => b.up)) return ERR.down(c)
  if (!authorized(c, principal, 'GROUP', gid, 'READ')) return ERR.groupAuth(gid)
  const t = c.topics[topic]
  if (!t) return ERR.consumerTopic(topic)
  if (!t.partitions[partition]) return ERR.partition(topic, partition)
  const g = c.groups[gid]
  if (!g) return ERR.group(gid)
  syncGroups(s, c)
  // a member may commit only the partitions the group gave it
  const owner = ownerOf(g, topic, Number(partition))
  if (app && g.members.length && (!owner || owner.app !== app.name || owner.env !== app.env)) return ERR.commit()
  ;(g.offsets[topic] ??= {})[partition] = Number(offset)
  return { ok: true, topic, partition: Number(partition), offset: Number(offset) }
}

// Lag of each partition: the end offset less the committed one. A partition with no committed offset has no lag yet.
export function lagOf(c, topic, gid) {
  const t = c?.topics[topic]
  const g = c?.groups[gid]
  if (!t) return ERR.consumerTopic(topic)
  if (!g) return ERR.group(gid)
  const partitions = t.partitions.map((p) => {
    const committed = g.offsets[topic]?.[p.id] ?? null
    return { partition: p.id, committed, start: startOf(p), end: endOf(p), lag: committed === null ? null : Math.max(0, endOf(p) - committed), member: ownerOf(g, topic, p.id)?.client ?? null }
  })
  return { ok: true, partitions, total: partitions.reduce((n, p) => n + (p.lag ?? 0), 0) }
}

// The API packages get as ctx.kafka. Every call changes the draft state the engine passed.
export function kafkaCtx(s, app, node) {
  const on = (cluster, fn) => {
    const c = clusterOf(s, cluster)
    return c ? fn(c) : ERR.noCluster(cluster)
  }
  // `auth` is { user, password }: the SASL login of the app, needed on a cluster with SCRAM users or ACLs
  const as = (cluster, auth, fn) =>
    on(cluster, (c) => {
      const p = principalOf(c, auth)
      return p.ok ? fn(c, p.principal) : p
    })
  const commit = (cluster, topic, groupId, partition, offset, auth) => as(cluster, auth, (c, who) => commitOn(s, c, topic, groupId, partition, offset, app, who))
  return {
    produce: (cluster, topic, record = {}) => as(cluster, record.auth, (c, who) => produceOn(s, c, topic, record, who)),
    poll: (cluster, topic, groupId, max = 500, opts = {}) => as(cluster, opts.auth, (c, who) => pollOn(s, c, topic, groupId, max, opts, app, node, who)),
    // the metadata of a topic, as a health check reads it: needs DESCRIBE, which READ and WRITE imply
    describe: (cluster, topic, opts = {}) =>
      as(cluster, opts.auth, (c, who) => {
        if (!c.brokers.some((b) => b.up)) return ERR.down(c)
        if (!authorized(c, who, 'TOPIC', topic, 'DESCRIBE')) return ERR.topicAuth(topic)
        const t = c.topics[topic]
        if (!t) return ERR.consumerTopic(topic)
        heal(c)
        return { ok: true, topic, partitions: t.partitions.length, replicationFactor: t.partitions[0]?.replicas.length ?? 0, leaders: t.partitions.filter((p) => p.leader !== -1).length, minIsr: num(t, 'min.insync.replicas') }
      }),
    // `offset` is the next offset to read, as in Kafka: the offset of the last record handled plus one
    commit,
    // commits the records of one poll: per partition, the last offset plus one
    commitRecords(cluster, groupId, records, auth) {
      const last = {}
      for (const r of records) last[`${r.topic}\u0000${r.partition}`] = Math.max(last[`${r.topic}\u0000${r.partition}`] ?? -1, r.offset)
      for (const [k, o] of Object.entries(last)) {
        const [topic, partition] = k.split('\u0000')
        const r = commit(cluster, topic, groupId, Number(partition), o + 1, auth)
        if (!r.ok) return r
      }
      return { ok: true }
    },
    // like consumer.close(): the members of this caller leave the group, which rebalances at the next poll
    close: (cluster, groupId) =>
      on(cluster, (c) => {
        const g = c.groups[groupId]
        if (!g) return ERR.group(groupId)
        const before = g.members.length
        g.members = g.members.filter((m) => (app ? !(m.app === app.name && m.env === app.env && (!node || m.node === node)) : m.app))
        if (g.members.length !== before) {
          g.state = g.members.length ? 'PreparingRebalance' : 'Empty'
          g.positions = {}
          for (const m of g.members) m.partitions = []
          note(s, g, 'A member left the group.')
        }
        return { ok: true }
      }),
    lag: (cluster, topic, groupId) =>
      on(cluster, (c) => {
        tidy(c, s.clock ?? 0)
        return lagOf(c, topic, groupId)
      }),
  }
}

// ---------- UI actions: each takes the whole lab state and returns { state, ok, error, text } ----------

function act(state, cluster, fn) {
  const s = structuredClone(state)
  const c = clusterOf(s, cluster)
  if (!c) return { state, ...ERR.noCluster(cluster) }
  heal(c)
  tidy(c, s.clock ?? 0)
  syncGroups(s, c)
  const r = fn(c, s) ?? { ok: true }
  return r.ok ? { ...r, state: s } : { ...r, state }
}

const TOPIC_NAME = /^[a-zA-Z0-9._-]{1,249}$/
export const createTopic = (state, cluster, { name, partitions, replicationFactor, config = {} }) =>
  act(state, cluster, (c, s) => {
    if (!TOPIC_NAME.test(name ?? '') || name === '.' || name === '..') return fail('INVALID_TOPIC_EXCEPTION', `Topic name "${name}" is illegal. It can contain only letters, digits, '.', '_' and '-', with 249 characters at most.`)
    if (c.topics[name]) return fail('TOPIC_ALREADY_EXISTS', `Topic '${name}' already exists.`)
    if (!(Number(partitions) >= 1)) return fail('INVALID_PARTITIONS', 'Number of partitions must be larger than 0.')
    const rf = Number(replicationFactor)
    if (!(rf >= 1)) return fail('INVALID_REPLICATION_FACTOR', 'Replication factor must be larger than 0.')
    const up = c.brokers.filter((b) => b.up).length
    if (rf > up) return fail('INVALID_REPLICATION_FACTOR', `Unable to replicate the partition ${rf} time(s): The target replication factor of ${rf} cannot be reached because only ${up} broker(s) are registered.`)
    const bad = Object.keys(config).find((k) => !(k in TOPIC_DEFAULTS))
    if (bad) return fail('INVALID_CONFIG', `Unknown topic config name: ${bad}`)
    placeTopic(c, name, Number(partitions), rf, config, s.clock)
  })

export const deleteTopic = (state, cluster, topic) =>
  act(state, cluster, (c) => {
    if (!c.topics[topic]) return ERR.consumerTopic(topic)
    delete c.topics[topic]
    // the group coordinator removes the committed offsets of a deleted topic
    for (const g of Object.values(c.groups)) {
      if (!g.topics.includes(topic)) continue
      delete g.offsets[topic]
      delete g.positions[topic]
      for (const m of g.members) m.partitions = m.partitions.filter((x) => x.topic !== topic)
      if (g.members.length) g.state = 'PreparingRebalance'
    }
  })

// Partitions can only grow. Keys then hash to other partitions, so the order of one key can break.
export const addPartitions = (state, cluster, topic, count) =>
  act(state, cluster, (c) => {
    const t = c.topics[topic]
    if (!t) return ERR.consumerTopic(topic)
    const n = Number(count)
    if (!(n > t.partitions.length)) return fail('INVALID_PARTITIONS', `Topic currently has ${t.partitions.length} partitions, which is higher than the requested ${n}.`)
    const rf = t.partitions[0].replicas.length
    const ids = placeIds(c, rf)
    for (let p = t.partitions.length; p < n; p++) {
      const replicas = Array.from({ length: rf }, (_, k) => ids[(p + k) % ids.length])
      t.partitions.push({ id: p, leader: replicas[0], replicas, isr: [...replicas], logStart: 0, nextOffset: 0, messages: [] })
    }
    heal(c)
    for (const g of Object.values(c.groups)) if (g.topics.includes(topic) && g.members.length) g.state = 'PreparingRebalance'
  })

export const setTopicConfig = (state, cluster, topic, key, value) =>
  act(state, cluster, (c) => {
    const t = c.topics[topic]
    if (!t) return ERR.consumerTopic(topic)
    if (!(key in TOPIC_DEFAULTS)) return fail('INVALID_CONFIG', `Unknown topic config name: ${key}`)
    const v = String(value).trim()
    if (NUMERIC.includes(key) && !/^-?\d+$/.test(v)) return fail('INVALID_CONFIG', `Invalid value ${v} for configuration ${key}: Not a number of type LONG`)
    if (key === 'min.insync.replicas' && Number(v) < 1) return fail('INVALID_CONFIG', `Invalid value ${v} for configuration min.insync.replicas: Value must be at least 1`)
    if (key === 'cleanup.policy' && !['delete', 'compact', 'compact,delete', 'delete,compact'].includes(v)) return fail('INVALID_CONFIG', `Invalid value ${v} for configuration cleanup.policy: String must be one of: compact, delete`)
    if (key === 'unclean.leader.election.enable' && !['true', 'false'].includes(v)) return fail('INVALID_CONFIG', `Invalid value ${v} for configuration unclean.leader.election.enable: Expected value to be either true or false`)
    if (v === TOPIC_DEFAULTS[key]) delete t.config[key]
    else t.config[key] = v
  })

export const produceMessage = (state, cluster, topic, record) => {
  let result
  const next = act(state, cluster, (c, s) => (result = produceOn(s, c, topic, record)))
  return { ...result, ...next }
}

// Like kafka-delete-records: the log start moves to `offset` and the records before it are gone
export const deleteRecords = (state, cluster, topic, partition, offset) =>
  act(state, cluster, (c) => {
    const p = c.topics[topic]?.partitions[Number(partition)]
    if (!p) return ERR.partition(topic, partition)
    const o = Number(offset)
    if (!(o >= 0) || o > endOf(p)) return fail('OFFSET_OUT_OF_RANGE', `The requested offset ${o} is not within the range of offsets ${startOf(p)} to ${endOf(p)}.`)
    p.messages = p.messages.filter((m) => m.offset >= o)
    p.logStart = Math.max(startOf(p), o)
  })

// Like kafka-consumer-groups --reset-offsets: only while the group has no active member.
// `to` is 'earliest', 'latest' or { offset }. `partition` limits it to one partition.
export const resetOffsets = (state, cluster, groupId, topic, to, partition) =>
  act(state, cluster, (c) => {
    const g = c.groups[groupId]
    if (!g) return ERR.group(groupId)
    if (g.members.length) return fail('GROUP_NOT_INACTIVE', `Assignments can only be reset if the group '${groupId}' is inactive, but the current state is ${g.state}.`)
    const t = c.topics[topic]
    if (!t) return ERR.consumerTopic(topic)
    const parts = partition === undefined || partition === null || partition === '' ? t.partitions : [t.partitions[Number(partition)]].filter(Boolean)
    if (!parts.length) return ERR.partition(topic, partition)
    g.offsets[topic] ??= {}
    for (const p of parts) {
      // an offset outside the log is moved to the nearest end, as the tool does
      const want = to === 'earliest' ? startOf(p) : to === 'latest' ? endOf(p) : Number(to?.offset)
      if (!Number.isFinite(want)) return fail('INVALID_OFFSET', 'Give an offset as a whole number.')
      g.offsets[topic][p.id] = Math.min(endOf(p), Math.max(startOf(p), want))
    }
    if (!g.topics.includes(topic)) g.topics.push(topic)
    g.positions = {}
  })

export const deleteGroup = (state, cluster, groupId) =>
  act(state, cluster, (c) => {
    const g = c.groups[groupId]
    if (!g) return ERR.group(groupId)
    if (g.members.length) return fail('NON_EMPTY_GROUP', `Deletion of group ${groupId} failed: The group is not empty.`)
    delete c.groups[groupId]
  })

export const stopBroker = (state, cluster, id) =>
  act(state, cluster, (c) => {
    const b = c.brokers.find((x) => x.id === Number(id))
    if (!b) return fail('BROKER_NOT_FOUND', `There is no broker ${id}.`)
    b.up = false
    heal(c)
  })
export const startBroker = (state, cluster, id) =>
  act(state, cluster, (c) => {
    const b = c.brokers.find((x) => x.id === Number(id))
    if (!b) return fail('BROKER_NOT_FOUND', `There is no broker ${id}.`)
    b.up = true
    heal(c)
  })

// Like kafka-acls --add. `acl`: { principal, resource, name, pattern, operation, permission, host }
export function aclErrors(c, acl) {
  const e = []
  if (!/^User:[A-Za-z0-9._@*-]+$/.test(String(acl.principal ?? '').trim())) e.push('The principal is User: and a name, for example User:orders-producer.')
  if (!ACL_RESOURCES.includes(acl.resource)) e.push(`The resource type is one of ${ACL_RESOURCES.join(', ')}.`)
  if (!String(acl.name ?? '').trim()) e.push('Give the resource name, or * for every resource of that type.')
  if (!ACL_PATTERNS.includes(acl.pattern)) e.push('The pattern type is LITERAL or PREFIXED.')
  if (!ACL_OPERATIONS.includes(acl.operation)) e.push(`The operation is one of ${ACL_OPERATIONS.join(', ')}.`)
  if (!['ALLOW', 'DENY'].includes(acl.permission)) e.push('The permission is ALLOW or DENY.')
  if (!e.length && (c?.acls ?? []).some((a) => ['principal', 'resource', 'name', 'pattern', 'operation', 'permission'].every((k) => a[k] === String(acl[k]).trim()))) e.push('This ACL exists already.')
  return e
}
export const addAcl = (state, cluster, acl) =>
  act(state, cluster, (c) => {
    const e = aclErrors(c, acl)
    if (e.length) return fail('INVALID_REQUEST', e.join(' '))
    c.acls = [...(c.acls ?? []), { principal: acl.principal.trim(), resource: acl.resource, name: acl.name.trim(), pattern: acl.pattern, operation: acl.operation, permission: acl.permission, host: String(acl.host ?? '*').trim() || '*' }]
  })
export const removeAcl = (state, cluster, index) =>
  act(state, cluster, (c) => {
    if (!c.acls?.[index]) return fail('INVALID_REQUEST', 'There is no such ACL.')
    c.acls = c.acls.filter((_, i) => i !== Number(index))
  })

// ---------- Schema Registry ----------

export const COMPATIBILITY = ['BACKWARD', 'BACKWARD_TRANSITIVE', 'FORWARD', 'FORWARD_TRANSITIVE', 'FULL', 'FULL_TRANSITIVE', 'NONE']
const fieldsOf = (schema) => {
  try {
    return (typeof schema === 'string' ? JSON.parse(schema) : schema).fields ?? []
  } catch {
    return null
  }
}
// lab-made: the check reads only the fields of an Avro record. BACKWARD: a new field needs a default. FORWARD: a
// removed field needed a default. FULL is both.
function compatible(level, older, newer) {
  const a = fieldsOf(older)
  const b = fieldsOf(newer)
  const names = (x) => new Set(x.map((f) => f.name))
  const back = () => b.every((f) => names(a).has(f.name) || 'default' in f)
  const fwd = () => a.every((f) => names(b).has(f.name) || 'default' in f)
  if (level.startsWith('BACKWARD')) return back()
  if (level.startsWith('FORWARD')) return fwd()
  if (level.startsWith('FULL')) return back() && fwd()
  return true
}
export function registerSchema(state, cluster, subject, schema) {
  return act(state, cluster, (c) => {
    const reg = c.schemaRegistry
    const body = typeof schema === 'string' ? schema : JSON.stringify(schema)
    if (!fieldsOf(body)) return fail('INVALID_SCHEMA', 'Either the input schema or one of its references is invalid. (42201)')
    const sub = (reg.subjects[subject] ??= { compatibility: null, versions: [] })
    const level = sub.compatibility ?? reg.compatibility
    const known = sub.versions.find((v) => v.schema === body)
    if (known) return { ok: true, id: known.id, version: known.version }
    const against = level.endsWith('TRANSITIVE') ? sub.versions : sub.versions.slice(-1)
    if (level !== 'NONE' && against.some((v) => !compatible(level, v.schema, body))) return fail('INCOMPATIBLE_SCHEMA', `Schema being registered is incompatible with an earlier schema for subject "${subject}". (409)`)
    const v = { id: reg.nextId++, version: (sub.versions.at(-1)?.version ?? 0) + 1, schema: body, compatibility: level }
    sub.versions.push(v)
    return { ok: true, id: v.id, version: v.version }
  })
}
export const setCompatibility = (state, cluster, subject, level) =>
  act(state, cluster, (c) => {
    if (!COMPATIBILITY.includes(level)) return fail('INVALID_COMPATIBILITY', `Invalid compatibility level ${level}. (42203)`)
    if (subject) {
      const sub = c.schemaRegistry.subjects[subject]
      if (!sub) return fail('SUBJECT_NOT_FOUND', `Subject '${subject}' not found. (40401)`)
      sub.compatibility = level
    } else c.schemaRegistry.compatibility = level
  })

// ---------- views ----------

// A copy of the Kafka state with retention, compaction and members brought up to the lab clock, for the pages
export function kafkaView(state) {
  const s = { clock: state.clock, apps: state.apps, kafka: structuredClone(state.kafka ?? newKafka()) }
  kafkaTick(s)
  return s.kafka
}
export const topicSize = (t) => t.partitions.reduce((n, p) => n + p.messages.reduce((k, m) => k + (m.size ?? 0), 0), 0)
export const topicCount = (t) => t.partitions.reduce((n, p) => n + p.messages.length, 0)

// ---------- the seed of the open console ----------

const ORDER_V1 = { type: 'record', name: 'Order', namespace: 'lab.harbor.orders', fields: [{ name: 'orderId', type: 'string' }, { name: 'customerId', type: 'string' }, { name: 'total', type: 'double' }] }
const ORDER_V2 = { ...ORDER_V1, fields: [...ORDER_V1.fields, { name: 'currency', type: 'string', default: 'USD' }] }
const PAYMENT_V1 = { type: 'record', name: 'Payment', namespace: 'lab.harbor.payments', fields: [{ name: 'paymentId', type: 'string' }, { name: 'orderId', type: 'string' }, { name: 'amount', type: 'double' }, { name: 'status', type: 'string' }] }

// harbor-events: three brokers, orders.v1 with 3 partitions, payments.v1, a compacted customers.v1, and the group of
// warehouse-consumer, which has read part of orders.v1 and is not running against Kafka yet
export function harborKafka(now = 0) {
  const c = newCluster('harbor-events', 3)
  placeTopic(c, 'orders.v1', 3, 3, { 'min.insync.replicas': '2' }, now)
  placeTopic(c, 'payments.v1', 2, 3, { 'min.insync.replicas': '2', 'retention.ms': '259200000' }, now)
  placeTopic(c, 'customers.v1', 1, 3, { 'cleanup.policy': 'compact' }, now)
  const s = { clock: now, apps: [], kafka: { clusters: { 'harbor-events': c } } }
  const ctx = kafkaCtx(s, null)
  const customers = ['C-7', 'C-12', 'C-31', 'C-44']
  for (let i = 0; i < 12; i++) {
    s.clock = now - (12 - i) * 7 * MINUTE
    const order = `O-${1001 + i}`
    const customerId = customers[i % 4]
    ctx.produce('harbor-events', 'orders.v1', { key: order, value: { orderId: order, customerId, total: 12 + i * 3.5, currency: 'USD' }, headers: { source: 'order-fulfilment-papi', 'content-type': 'application/json' } })
    if (i % 3 === 0) ctx.produce('harbor-events', 'payments.v1', { key: order, value: { paymentId: `P-${501 + i}`, orderId: order, amount: 12 + i * 3.5, status: 'CAPTURED' }, headers: { source: 'payments-gateway' } })
  }
  for (const [i, id] of customers.entries()) {
    s.clock = now - (90 - i) * MINUTE
    ctx.produce('harbor-events', 'customers.v1', { key: id, value: { id, name: ['Harbor Deli', 'Pier Market', 'Dockside Cafe', 'Lighthouse Foods'][i], tier: 'Standard' } })
  }
  s.clock = now - 30 * MINUTE
  ctx.produce('harbor-events', 'customers.v1', { key: 'C-7', value: { id: 'C-7', name: 'Harbor Deli', tier: 'Gold' } })
  // warehouse-consumer committed part of each partition earlier, so it has lag
  const g = (c.groups['warehouse-consumer'] = newGroup())
  g.topics = ['orders.v1']
  g.generation = 4
  g.offsets['orders.v1'] = Object.fromEntries(c.topics['orders.v1'].partitions.map((p) => [p.id, Math.max(0, endOf(p) - 1)]))
  g.history.push({ t: now - 20 * MINUTE, generation: 4, why: 'The last member left. The group is empty.' })
  const reg = c.schemaRegistry
  const put = (subject, schema) => {
    const sub = (reg.subjects[subject] ??= { compatibility: null, versions: [] })
    sub.versions.push({ id: reg.nextId++, version: sub.versions.length + 1, schema: JSON.stringify(schema), compatibility: 'BACKWARD' })
  }
  put('orders.v1-value', ORDER_V1)
  put('orders.v1-value', ORDER_V2)
  put('payments.v1-value', PAYMENT_V1)
  c.acls = [
    { principal: 'User:order-fulfilment-papi', resource: 'TOPIC', name: 'orders.v1', pattern: 'LITERAL', operation: 'WRITE', permission: 'ALLOW', host: '*' },
    { principal: 'User:warehouse-consumer', resource: 'TOPIC', name: 'orders.v1', pattern: 'LITERAL', operation: 'READ', permission: 'ALLOW', host: '*' },
    { principal: 'User:warehouse-consumer', resource: 'GROUP', name: 'warehouse-consumer', pattern: 'LITERAL', operation: 'READ', permission: 'ALLOW', host: '*' },
    { principal: 'User:payments-gateway', resource: 'TOPIC', name: 'payments.', pattern: 'PREFIXED', operation: 'WRITE', permission: 'ALLOW', host: '*' },
  ]
  return newKafka({ clusters: { 'harbor-events': c } })
}
