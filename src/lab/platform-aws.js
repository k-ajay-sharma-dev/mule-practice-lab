// AWS for the Mule Amazon S3, SQS and SNS connectors: one account of Harbor in US East (Ohio). S3 buckets with bucket
// policies, Block Public Access and default encryption (SSE-S3 or SSE-KMS with a key policy), SQS standard and FIFO queues
// with visibility timeout, receive count, long polling and a redrive policy to a dead-letter queue, SNS topics with SQS
// subscriptions and filter policies, IAM users, roles, trust policies and policies, STS AssumeRole, and a CloudTrail
// style event history. Pure and import free. Lives in state.aws.
//
// State shape (state.aws once filled; the open console seeds only { created } and fillAws builds the rest on first use):
//   account, region, created, n (counter),
//   users:   { name: { name, arn, created, policies: { policyName: jsonText }, managed: [awsPolicyName],
//                      keys: [{ id, secret, status: 'Active' | 'Inactive', created, lastUsed }] } },
//   roles:   { name: { name, arn, created, trust: jsonText, policies: { policyName: jsonText }, managed: [...], maxSession } },
//   keys:    { keyId: { id, alias, arn, policy: jsonText, enabled, created } },                     (KMS)
//   buckets: { name: { name, region, created, policy: jsonText | '', bpa: { acls, ignoreAcls, policy, restrict },
//                      encryption: { type: 'SSE-S3' | 'SSE-KMS', key }, objects: { key: { size, t, etag, sse, kms, by, body } } } },
//   queues:  { name: { name, fifo, created, visibility, retention, wait, delay, contentDedup, policy: jsonText | '',
//                      redrive: { dlq, max } | null, messages: [{ id, body, attrs, sent, vis, rc, first, receipt, group,
//                      dedup, src, moved }], pending: [{ at, receipt }], dedupIds: { id: t }, changed, lastRedrive: { t, moved },
//                      stats: { sent, received, deleted, empty, moved } } },
//   topics:  { name: { name, arn, created, policy, lastConsole: { t, id, to: [queue] }, consoleTo: [queue], subs: [{ id, protocol, endpoint, filter: jsonText | '', raw,
//                      stats: { delivered, filtered, failed } }], stats: { published, delivered, filtered } } },
//   sessions: { accessKeyId: { id, secret, token, role, name, from, app, expires, t } },             (STS)
//   listeners: { 'app|queue': [time each consumer is free again] },
//   trail:   [{ id, t, src, name, user, arn, res, code, msg, key, app, ip }]                       (CloudTrail)
//
// ctx.aws (see awsCtx) takes the connector configuration as cfg: { accessKeyId, secretAccessKey, sessionToken, region,
// roleArn, roleSessionName, durationSeconds }. With roleArn the connector signs in with the keys and assumes the role
// itself, and assumes it again 5 minutes before the session ends.
//   s3(cfg, op, p)   ListBuckets, HeadBucket, ListObjects { Bucket, Prefix }, PutObject { Bucket, Key, Body,
//                    ServerSideEncryption, SSEKMSKeyId }, GetObject { Bucket, Key }, DeleteObject { Bucket, Key }
//   sqs(cfg, op, p)  SendMessage { QueueUrl, MessageBody, MessageAttributes, MessageGroupId, MessageDeduplicationId,
//                    DelaySeconds }, ReceiveMessage { QueueUrl, MaxNumberOfMessages, VisibilityTimeout, WaitTimeSeconds },
//                    DeleteMessage { QueueUrl, ReceiptHandle }, ChangeMessageVisibility, GetQueueAttributes.
//                    Lab-made: p.At (lab ms) says when inside the minute of a run the call happens.
//   sns(cfg, op, p)  Publish { TopicArn, Message, Subject, MessageAttributes: { name: { DataType, StringValue } } }
//   sts(cfg, op, p)  AssumeRole { RoleArn, RoleSessionName, DurationSeconds }, GetCallerIdentity
//   listen(cfg, queue, { consumers, visibility, wait, max }, handler)  the Receive messages source of the SQS connector
//                    for one lab minute: each consumer receives, runs handler(message) -> { ok, seconds }, and deletes the
//                    message `seconds` later when ok. A message that is visible again before its delete is received again.
// A success is { ok: true, status, ms, ... }. A failure is { ok: false, status, code, error, type, text, ms }: code is the
// AWS error code, type the Mule error type (lab-made names: <SERVICE>:FORBIDDEN, :NOT_FOUND, :CONNECTIVITY and so on).

export const ACCOUNT = '210987654321'
export const REGION = 'us-east-2'
export const REGION_NAME = 'US East (Ohio)'
export const CONSOLE_USER = 'harbor-admin'
const MINUTE = 60000
const MAX_TRAIL = 60
const MAX_QUEUE = 300
const MAX_OBJECTS = 200

// ---------- names ----------

export const arnUser = (n) => `arn:aws:iam::${ACCOUNT}:user/${n}`
export const arnRole = (n) => `arn:aws:iam::${ACCOUNT}:role/${n}`
export const ARN_ROOT = `arn:aws:iam::${ACCOUNT}:root`
export const arnBucket = (b, key) => `arn:aws:s3:::${b}${key === undefined ? '' : `/${key}`}`
export const arnQueue = (q) => `arn:aws:sqs:${REGION}:${ACCOUNT}:${q}`
export const arnTopic = (t) => `arn:aws:sns:${REGION}:${ACCOUNT}:${t}`
export const arnKey = (id) => `arn:aws:kms:${REGION}:${ACCOUNT}:key/${id}`
export const queueUrl = (q) => `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/${q}`
// the connection of the Amazon connectors from the properties of an app
export const awsCfg = (p) => ({ accessKeyId: p['aws.accessKeyId'], secretAccessKey: p['aws.secretAccessKey'], sessionToken: p['aws.sessionToken'], region: p['aws.region'], roleArn: p['aws.roleArn'] })
export const policyText = (doc) => JSON.stringify(doc, null, 2)
export const policyDoc = (...statements) => policyText({ Version: '2012-10-17', Statement: statements })
const managedArn = (n) => `arn:aws:iam::aws:policy/${n}`

// AWS managed policies that can be attached to a user or a role
export const MANAGED = {
  AdministratorAccess: policyDoc({ Effect: 'Allow', Action: '*', Resource: '*' }),
  AmazonS3FullAccess: policyDoc({ Effect: 'Allow', Action: ['s3:*', 's3-object-lambda:*'], Resource: '*' }),
  AmazonS3ReadOnlyAccess: policyDoc({ Effect: 'Allow', Action: ['s3:Get*', 's3:List*', 's3:Describe*', 's3-object-lambda:Get*', 's3-object-lambda:List*'], Resource: '*' }),
  AmazonSQSFullAccess: policyDoc({ Effect: 'Allow', Action: ['sqs:*'], Resource: '*' }),
  AmazonSNSFullAccess: policyDoc({ Effect: 'Allow', Action: ['sns:*'], Resource: '*' }),
}

// the key policy KMS gives a new key: the account may use IAM policies for the key
export const defaultKeyPolicy = () => policyText({ Version: '2012-10-17', Id: 'key-default-1', Statement: [{ Sid: 'Enable IAM User Permissions', Effect: 'Allow', Principal: { AWS: ARN_ROOT }, Action: 'kms:*', Resource: '*' }] })
// the statement the SQS console adds to a queue when it subscribes the queue to a topic
export const snsToQueueStatement = (queue, topic) => ({ Sid: `topic-subscription-${arnTopic(topic)}`, Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' }, Action: 'SQS:SendMessage', Resource: arnQueue(queue), Condition: { ArnLike: { 'aws:SourceArn': arnTopic(topic) } } })

// ---------- small helpers ----------

const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const word = (v) => String(v ?? '').trim()
const hexOf = (seed, len = 32) => {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < len; i++) {
    for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}
const uuidOf = (seed) => {
  const h = hexOf(seed, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const next = (y) => (y.n = (y.n ?? 4700) + 1)
const push = (arr, item, max) => {
  arr.push(item)
  if (arr.length > max) arr.splice(0, arr.length - max)
}
export const readJson = (text) => {
  try {
    const v = typeof text === 'string' ? JSON.parse(text) : text
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

// ---------- policies ----------

const rx = new Map()
const glob = (pattern, value, ci) => {
  const k = `${ci ? 'i' : 's'}${pattern}`
  let r = rx.get(k)
  if (!r) {
    r = new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, ci ? 'i' : '')
    rx.set(k, r)
  }
  return r.test(String(value))
}
const COND = {
  StringEquals: (a, b) => a === b,
  StringEqualsIgnoreCase: (a, b) => a.toLowerCase() === b.toLowerCase(),
  StringLike: (a, b) => glob(b, a),
  ArnEquals: (a, b) => a === b,
  ArnLike: (a, b) => glob(b, a),
  Bool: (a, b) => a.toLowerCase() === b.toLowerCase(),
  NumericEquals: (a, b) => Number(a) === Number(b),
  NumericLessThan: (a, b) => Number(a) < Number(b),
  NumericLessThanEquals: (a, b) => Number(a) <= Number(b),
  NumericGreaterThan: (a, b) => Number(a) > Number(b),
  NumericGreaterThanEquals: (a, b) => Number(a) >= Number(b),
}
const NEGATED = { StringNotEquals: 'StringEquals', StringNotEqualsIgnoreCase: 'StringEqualsIgnoreCase', StringNotLike: 'StringLike', ArnNotEquals: 'ArnEquals', ArnNotLike: 'ArnLike', NumericNotEquals: 'NumericEquals' }
const OPERATORS = [...Object.keys(COND), ...Object.keys(NEGATED), 'Null']
const knownOp = (op) => OPERATORS.includes(op.replace(/IfExists$/, ''))
const lookup = (ctx, key) => {
  const k = Object.keys(ctx ?? {}).find((x) => x.toLowerCase() === String(key).toLowerCase())
  return k === undefined ? undefined : ctx[k]
}
function conditionOk(cond, ctx) {
  for (const [raw, block] of Object.entries(cond ?? {})) {
    const ifExists = raw.endsWith('IfExists')
    const op = ifExists ? raw.slice(0, -8) : raw
    for (const [key, want] of Object.entries(block ?? {})) {
      const have = lookup(ctx, key)
      if (op === 'Null') {
        if (String(list(want)[0]).toLowerCase() !== String(have === undefined)) return false
        continue
      }
      const base = NEGATED[op] ?? op
      const fn = COND[base]
      if (!fn) return false
      // a missing key: a negated operator is met, a positive one is not (unless IfExists)
      if (have === undefined) {
        if (ifExists || NEGATED[op]) continue
        return false
      }
      const hit = list(want).some((w) => fn(String(have), String(w)))
      if (NEGATED[op] ? hit : !hit) return false
    }
  }
  return true
}
const actionHit = (st, action) => (st.NotAction !== undefined ? !list(st.NotAction).some((a) => glob(a, action, true)) : list(st.Action).some((a) => glob(a, action, true)))
const resourceHit = (st, res) => (st.NotResource !== undefined ? !list(st.NotResource).some((r) => glob(r, res)) : st.Resource === undefined ? true : list(st.Resource).some((r) => glob(r, res)))
// 'direct' when the statement names this principal (or everyone), 'account' when it names the account, else false
function principalHit(st, p) {
  const P = st.Principal
  if (P === undefined) return false
  if (P === '*') return 'direct'
  if (p.service) return list(P.Service).includes(p.service) ? 'direct' : false
  let account = false
  for (const a of list(P.AWS)) {
    if (a === '*' || a === p.arn || (p.roleArn && a === p.roleArn)) return 'direct'
    if (a === ARN_ROOT || a === ACCOUNT) account = true
  }
  return account ? 'account' : false
}
// the statements of one policy that match a request
function scan(doc, req, principal) {
  const out = { deny: null, allow: null, allowAccount: null }
  for (const st of list(doc?.Statement)) {
    if (!st || !actionHit(st, req.action) || !resourceHit(st, req.resource) || !conditionOk(st.Condition, req.ctx)) continue
    let how = 'direct'
    if (principal) {
      how = principalHit(st, principal)
      if (!how) continue
    }
    if (st.Effect === 'Deny') out.deny ??= st
    else if (st.Effect === 'Allow') {
      if (how === 'direct') out.allow ??= st
      else out.allowAccount ??= st
    }
  }
  return out
}

export function policyErrors(text, kind = 'identity') {
  if (!word(text)) return ['The policy is empty.']
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    return [`MalformedPolicyDocument: JSON syntax error. ${e.message}`]
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['MalformedPolicyDocument: The policy must be a JSON object.']
  const errs = []
  if (doc.Version !== undefined && !['2012-10-17', '2008-10-17'].includes(doc.Version)) errs.push('MalformedPolicyDocument: The policy must contain a valid version string')
  const sts = list(doc.Statement)
  if (!sts.length) errs.push('MalformedPolicyDocument: The policy has no Statement.')
  sts.forEach((st, i) => {
    const n = st?.Sid ? `Statement ${st.Sid}` : `Statement ${i + 1}`
    if (!st || typeof st !== 'object') return errs.push(`${n}: A statement must be an object.`)
    if (!['Allow', 'Deny'].includes(st.Effect)) errs.push(`${n}: Effect must be Allow or Deny.`)
    if (st.Action === undefined && st.NotAction === undefined) errs.push(`${n}: Missing required field Action.`)
    for (const a of list(st.Action ?? st.NotAction)) if (typeof a !== 'string' || (a !== '*' && !/^[a-z0-9-]+:[A-Za-z0-9*?]+$/.test(a))) errs.push(`${n}: Invalid action: ${JSON.stringify(a)}`)
    if (kind === 'identity' && (st.Principal !== undefined || st.NotPrincipal !== undefined)) errs.push('MalformedPolicyDocument: Policy document should not specify a principal.')
    if (kind !== 'identity' && st.Principal === undefined && st.NotPrincipal === undefined) errs.push(`MalformedPolicyDocument: ${n}: Missing required field Principal.`)
    if (kind === 'trust' && st.Resource !== undefined) errs.push('MalformedPolicyDocument: Has prohibited field Resource.')
    if (kind !== 'trust' && st.Resource === undefined && st.NotResource === undefined) errs.push(`${n}: Missing required field Resource.`)
    for (const op of Object.keys(st.Condition ?? {})) if (!knownOp(op)) errs.push(`${n}: Invalid condition operator ${op}.`)
  })
  return [...new Set(errs)]
}
// Allow statements with a wildcard action (* or service:*) or on every resource
export function wideStatements(text) {
  const doc = readJson(text)
  return list(doc?.Statement).filter((st) => st?.Effect === 'Allow' && (list(st.Action).some((a) => a === '*' || /:\*$/.test(a)) || list(st.Resource).includes('*') || st.NotAction !== undefined || st.NotResource !== undefined))
}

// the identity policies of a principal, with their names
function identityDocs(y, p) {
  const holder = p.kind === 'user' ? y.users[p.user] : p.kind === 'role' ? y.roles[p.role] : null
  if (!holder) return []
  return [...Object.entries(holder.policies ?? {}).map(([name, text]) => ({ name, doc: readJson(text) })), ...(holder.managed ?? []).map((name) => ({ name, doc: readJson(MANAGED[name]) }))]
}

// The policy evaluation of AWS for one account: an explicit deny anywhere wins, then an allow, else the implicit deny.
// mode 'kms' and 'trust': the key policy or trust policy must allow, either the principal itself or the account (then
// the identity policy must allow too).
function decide(y, p, action, resource, { resourceDoc, resourceName = 'resource policy', mode = 'same', ctx = {} } = {}) {
  const req = { action, resource, ctx: { 'aws:SecureTransport': 'true', 'aws:PrincipalArn': p.roleArn ?? p.arn, ...(p.user && { 'aws:username': p.user }), ...ctx } }
  const ids = p.service ? [] : identityDocs(y, p).map((d) => ({ ...d, r: scan(d.doc, req) }))
  const rs = resourceDoc ? scan(resourceDoc, req, p) : { deny: null, allow: null, allowAccount: null }
  const idDeny = ids.find((d) => d.r.deny)
  const idAllow = ids.find((d) => d.r.allow)
  const who = p.arn
  if (idDeny || rs.deny) {
    const kind = rs.deny ? 'resource' : 'identity'
    return { decision: 'explicitDeny', kind, policy: rs.deny ? resourceName : idDeny.name, sid: (rs.deny ?? idDeny.r.deny).Sid ?? '', message: `User: ${who} is not authorized to perform: ${action} on resource: "${resource}" with an explicit deny in a ${kind}-based policy` }
  }
  const viaResource = Boolean(rs.allow)
  const allowed = mode === 'same' ? Boolean(idAllow) || viaResource : viaResource || (Boolean(rs.allowAccount) && Boolean(idAllow))
  if (allowed) return { decision: 'allowed', policy: viaResource ? resourceName : idAllow.name, sid: (viaResource ? rs.allow : idAllow.r.allow).Sid ?? '' }
  if (mode === 'trust') return { decision: 'implicitDeny', message: `User: ${who} is not authorized to perform: ${action} on resource: ${resource}` }
  const noResource = mode === 'kms' && !rs.allowAccount
  return { decision: 'implicitDeny', message: `User: ${who} is not authorized to perform: ${action} on resource: "${resource}" because no ${noResource ? 'resource' : 'identity'}-based policy allows the ${action} action` }
}

// ---------- the account ----------

const mkUser = (name, x = {}, now = 0) => ({ name, arn: arnUser(name), created: x.created ?? now, policies: { ...x.policies }, managed: [...(x.managed ?? [])], keys: (x.keys ?? []).map((k) => ({ id: k.id, secret: k.secret, status: k.status ?? 'Active', created: k.created ?? now, lastUsed: k.lastUsed ?? null })) })
const mkRole = (name, x = {}, now = 0) => ({ name, arn: arnRole(name), created: x.created ?? now, trust: x.trust ?? policyDoc({ Effect: 'Allow', Principal: { AWS: ARN_ROOT }, Action: 'sts:AssumeRole' }), policies: { ...x.policies }, managed: [...(x.managed ?? [])], maxSession: x.maxSession ?? 3600, desc: x.desc ?? '' })
const mkKey = (alias, x = {}, now = 0) => {
  const id = x.id ?? uuidOf(`key:${alias}`)
  return { id, alias, arn: arnKey(id), policy: x.policy ?? defaultKeyPolicy(), enabled: x.enabled ?? true, created: x.created ?? now }
}
const ALL_BLOCKED = { acls: true, ignoreAcls: true, policy: true, restrict: true }
const mkBucket = (name, x = {}, now = 0) => ({
  name,
  region: x.region ?? REGION,
  created: x.created ?? now,
  policy: x.policy ?? '',
  bpa: { ...ALL_BLOCKED, ...x.bpa },
  encryption: { type: 'SSE-S3', key: '', ...x.encryption },
  objects: Object.fromEntries(Object.entries(x.objects ?? {}).map(([k, o]) => [k, { size: String(o.body ?? '').length || (o.size ?? 0), t: o.t ?? now, etag: hexOf(`${name}/${k}`), sse: o.sse ?? (x.encryption?.type === 'SSE-KMS' ? 'aws:kms' : 'AES256'), kms: o.kms ?? '', by: o.by ?? CONSOLE_USER, body: String(o.body ?? '').slice(0, 2000) }])),
})
const STATS = () => ({ sent: 0, received: 0, deleted: 0, empty: 0, moved: 0 })
const mkQueue = (name, x = {}, now = 0) => ({
  name,
  fifo: name.endsWith('.fifo'),
  created: x.created ?? now,
  visibility: x.visibility ?? 30,
  retention: x.retention ?? 345600,
  wait: x.wait ?? 0,
  delay: x.delay ?? 0,
  contentDedup: Boolean(x.contentDedup),
  policy: x.policy ?? '',
  redrive: x.redrive ? { dlq: x.redrive.dlq, max: Number(x.redrive.max) } : null,
  messages: [],
  pending: [],
  dedupIds: {},
  stats: STATS(),
})
const mkTopic = (name, x = {}, now = 0) => ({ name, arn: arnTopic(name), created: x.created ?? now, policy: x.policy ?? '', subs: [], stats: { published: 0, delivered: 0, filtered: 0 } })

// A new account. Each list holds specs: users [{ name, policies, managed, keys }], roles [{ name, trust, policies, maxSession }],
// keys [{ alias, policy }], buckets [{ name, policy, bpa, encryption, objects }], queues [{ name, visibility, wait,
// redrive: { dlq, max }, messages: [{ body, attrs, sent, rc }] }], topics [{ name, subs: [{ queue, filter, raw }] }],
// trail [{ t, src, name, user, res, code, msg }].
export function newAwsAccount(now = 0, x = {}) {
  const y = { account: ACCOUNT, region: REGION, created: now, n: 4700, users: {}, roles: {}, keys: {}, buckets: {}, queues: {}, topics: {}, sessions: {}, listeners: {}, trail: [] }
  y.users[CONSOLE_USER] = mkUser(CONSOLE_USER, { managed: ['AdministratorAccess'] }, now - 90 * 24 * 60 * MINUTE)
  for (const u of x.users ?? []) y.users[u.name] = mkUser(u.name, u, now)
  for (const r of x.roles ?? []) y.roles[r.name] = mkRole(r.name, r, now)
  for (const k of x.keys ?? []) {
    const key = mkKey(k.alias, k, now)
    y.keys[key.id] = key
  }
  for (const b of x.buckets ?? []) y.buckets[b.name] = mkBucket(b.name, b, now)
  for (const q of x.queues ?? []) {
    const queue = (y.queues[q.name] = mkQueue(q.name, q, now))
    for (const m of q.messages ?? []) {
      const r = enqueue(y, queue, { body: m.body, attrs: m.attrs, group: m.group, dedup: m.dedup }, m.sent ?? now)
      const msg = queue.messages.find((z) => z.id === r.id)
      if (msg && m.rc) Object.assign(msg, { rc: m.rc, first: m.sent ?? now })
      if (msg && m.src) msg.src = m.src
    }
  }
  for (const t of x.topics ?? []) {
    const topic = (y.topics[t.name] = mkTopic(t.name, t, now))
    for (const sub of t.subs ?? []) addSub(y, topic, sub)
  }
  for (const e of x.trail ?? []) push(y.trail, { id: uuidOf(`trail:${y.trail.length}:${e.t}`), ip: '10.20.0.15', ...e }, MAX_TRAIL)
  return y
}

// The account of the open console, built the first time the AWS screen opens
export function defaultAwsAccount(now = 0) {
  return newAwsAccount(now, {
    users: [{ name: 'svc-web-orders', keys: [{ id: 'AKIA_LAB_0000101', secret: 'lab-only/web-orders-secret-0101', created: now - 30 * 24 * 60 * MINUTE }], policies: { 'send-orders': policyDoc({ Effect: 'Allow', Action: ['sqs:SendMessage', 'sqs:GetQueueAttributes'], Resource: arnQueue('harbor-orders') }) } }],
    keys: [{ alias: 'alias/harbor-data' }],
    buckets: [
      { name: 'harbor-web-assets', objects: { 'banners/black-friday.json': { body: '{"title":"Black Friday","from":"2026-11-27"}', t: now - 60 * MINUTE }, 'robots.txt': { body: 'User-agent: *\nAllow: /', t: now - 3000 * MINUTE } } },
      { name: 'harbor-data-exports', encryption: { type: 'SSE-KMS', key: 'alias/harbor-data' } },
    ],
    queues: [
      { name: 'harbor-orders-dlq', retention: 1209600 },
      { name: 'harbor-orders', visibility: 60, wait: 20, redrive: { dlq: 'harbor-orders-dlq', max: 5 }, messages: [{ body: '{"orderId":"O-1001","total":42.5}', sent: now - 2 * MINUTE }] },
    ],
    topics: [{ name: 'harbor-order-events', subs: [{ queue: 'harbor-orders', filter: '{\n  "eventType": ["OrderPlaced"]\n}' }] }],
  })
}

// fills a missing or placeholder state.aws, and any key an older save lacks
export function fillAws(y) {
  if (!y) return defaultAwsAccount(0)
  if (!y.account) {
    const base = defaultAwsAccount(y.created ?? 0)
    for (const k of Object.keys(base)) y[k] ??= base[k]
    return y
  }
  for (const k of ['users', 'roles', 'keys', 'buckets', 'queues', 'topics', 'sessions', 'listeners']) y[k] ??= {}
  y.trail ??= []
  return y
}
export const isFilled = (y) => Boolean(y?.account)
export const defaultAws = (now) => ({ created: now })

const keyOf = (y, ref) => {
  const r = word(ref)
  if (!r) return null
  return Object.values(y.keys).find((k) => k.id === r || k.alias === r || k.arn === r || `alias/${k.alias.replace(/^alias\//, '')}` === r) ?? null
}
export const queueOf = (y, ref) => {
  const r = word(ref)
  if (!r) return null
  const name = r.startsWith('https://') ? r.split('/').at(-1) : r.startsWith('arn:aws:sqs:') ? r.split(':').at(-1) : r
  if (r.startsWith('https://') && !r.startsWith(`https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/`)) return null
  return y.queues[name] ?? null
}
export const topicOf = (y, ref) => {
  const r = word(ref)
  return y.topics[r.startsWith('arn:aws:sns:') ? r.split(':').at(-1) : r] ?? null
}

// ---------- errors and the event history ----------

const SERVICE = { s3: 'S3', sqs: 'Sqs', sns: 'Sns', sts: 'Sts', kms: 'Kms' }
const SOURCE = { s3: 's3.amazonaws.com', sqs: 'sqs.amazonaws.com', sns: 'sns.amazonaws.com', sts: 'sts.amazonaws.com', kms: 'kms.amazonaws.com', iam: 'iam.amazonaws.com' }
export const sourceOf = (src) => SOURCE[src] ?? src
function fail(y, svc, status, code, error, ms = 40) {
  const kind = code === 'SdkClientException' ? 'CONNECTIVITY' : code === 'NoSuchBucket' ? 'NO_SUCH_BUCKET' : code === 'NoSuchKey' ? 'NO_SUCH_KEY' : status === 403 ? 'FORBIDDEN' : status === 404 || /NonExistentQueue|NotFound/.test(code) ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : 'SERVICE_ERROR'
  const rid = hexOf(`rid:${next(y)}`, 16).toUpperCase()
  const text = code === 'SdkClientException' ? `Unable to execute HTTP request: ${error}` : `${error} (Service: ${SERVICE[svc] ?? svc}, Status Code: ${status}, Error Code: ${code}, Request ID: ${rid})`
  return { ok: false, status, code, error, type: `${String(SERVICE[svc] ?? svc).toUpperCase()}:${kind}`, text, ms }
}
function trail(y, now, e) {
  push(y.trail, { id: uuidOf(`trail:${next(y)}`), t: now, ip: e.app ? '10.20.31.7' : '198.51.100.24', ...e }, MAX_TRAIL)
}
const display = (p) => (p ? (p.kind === 'user' ? p.user : p.kind === 'role' ? p.name : p.service) : '')

// ---------- sign in: access keys, temporary credentials, the role of the connector ----------

const INVALID = { s3: ['InvalidAccessKeyId', 'The AWS Access Key Id you provided does not exist in our records.'], other: ['InvalidClientTokenId', 'The security token included in the request is invalid.'] }
const EXPIRED = { s3: ['ExpiredToken', 'The provided token has expired.'], other: ['ExpiredToken', 'The security token included in the request is expired'] }
const SIGNATURE = ['SignatureDoesNotMatch', 'The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method. Consult the service documentation for details.']

function signIn(y, cfg, svc, now, who) {
  const kind = svc === 's3' ? 's3' : 'other'
  if (!word(cfg?.region)) return { bad: fail(y, svc, 0, 'SdkClientException', 'Unable to load region from any of the providers in the chain', 5) }
  const id = word(cfg?.accessKeyId)
  const secret = word(cfg?.secretAccessKey)
  if (!id || !secret) return { bad: fail(y, svc, 0, 'SdkClientException', 'Unable to load credentials from any of the providers in the chain AwsCredentialsProviderChain', 5) }
  let p
  if (id.startsWith('ASIA')) {
    const ses = y.sessions[id]
    if (!ses) return { bad: fail(y, svc, 403, ...INVALID[kind]), key: id }
    if (secret !== ses.secret) return { bad: fail(y, svc, 403, ...SIGNATURE), key: id }
    if (word(cfg.sessionToken) !== ses.token) return { bad: fail(y, svc, 403, ...(kind === 's3' ? ['InvalidToken', 'The provided token is malformed or otherwise invalid.'] : INVALID.other)), key: id }
    if (now >= ses.expires) return { bad: fail(y, svc, kind === 's3' ? 400 : 403, ...EXPIRED[kind]), key: id, p: { kind: 'role', role: ses.role, name: ses.name, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${ses.role}/${ses.name}` } }
    p = { kind: 'role', role: ses.role, name: ses.name, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${ses.role}/${ses.name}`, roleArn: arnRole(ses.role), key: id }
  } else {
    const user = Object.values(y.users).find((u) => u.keys.some((k) => k.id === id))
    const key = user?.keys.find((k) => k.id === id)
    if (!key || key.status !== 'Active') return { bad: fail(y, svc, 403, ...INVALID[kind]), key: id }
    if (key.secret !== secret) return { bad: fail(y, svc, 403, ...SIGNATURE), key: id, p: { kind: 'user', user: user.name, arn: user.arn } }
    key.lastUsed = now
    p = { kind: 'user', user: user.name, arn: user.arn, key: id }
  }
  const roleArn = word(cfg.roleArn)
  if (!roleArn) return { p }
  // the connector assumes the role itself and does it again 5 minutes before the session ends
  const kept = Object.values(y.sessions).find((x) => x.app === who && x.roleArn === roleArn && x.from === p.arn && x.expires - now > 5 * MINUTE)
  if (kept) return { p: { kind: 'role', role: kept.role, name: kept.name, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${kept.role}/${kept.name}`, roleArn, key: kept.id } }
  const r = assumeRole(y, p, { RoleArn: roleArn, RoleSessionName: word(cfg.roleSessionName) || `mule-${who}`.slice(0, 64), DurationSeconds: Number(cfg.durationSeconds) || 3600 }, now, who)
  if (!r.ok) return { bad: { ...r, type: `${String(SERVICE[svc] ?? svc).toUpperCase()}:CONNECTIVITY` }, key: p.key, p, assume: true }
  const ses = y.sessions[r.Credentials.AccessKeyId]
  return { p: { kind: 'role', role: ses.role, name: ses.name, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${ses.role}/${ses.name}`, roleArn, key: ses.id } }
}
// a sign in that failed: one CloudTrail entry, and the error
function refused(y, a, svc, name, now, who, res = '') {
  if (!a.assume) trail(y, now, { src: svc, name, user: display(a.p), arn: a.p?.arn ?? '', key: a.key ?? '', app: who, res, code: a.bad.code, msg: a.bad.error })
  return a.bad
}

function assumeRole(y, p, params, now, who) {
  const roleArn = word(params.RoleArn)
  const name = roleArn.startsWith(`arn:aws:iam::${ACCOUNT}:role/`) ? roleArn.split('/').at(-1) : ''
  const role = y.roles[name]
  const sessionName = word(params.RoleSessionName)
  if (!/^[\w+=,.@-]{2,64}$/.test(sessionName)) {
    const e = fail(y, 'sts', 400, 'ValidationError', `1 validation error detected: Value '${sessionName}' at 'roleSessionName' failed to satisfy constraint: Member must satisfy regular expression pattern: [\\w+=,.@-]*`)
    trail(y, now, { src: 'sts', name: 'AssumeRole', user: display(p), arn: p.arn, key: p.key, app: who, res: roleArn, code: e.code, msg: e.error })
    return e
  }
  const d = role ? decide(y, p, 'sts:AssumeRole', roleArn, { resourceDoc: readJson(role.trust), resourceName: 'trust policy', mode: 'trust' }) : { decision: 'implicitDeny', message: `User: ${p.arn} is not authorized to perform: sts:AssumeRole on resource: ${roleArn}` }
  if (d.decision !== 'allowed') {
    const e = fail(y, 'sts', 403, 'AccessDenied', d.message)
    trail(y, now, { src: 'sts', name: 'AssumeRole', user: display(p), arn: p.arn, key: p.key, app: who, res: roleArn, code: e.code, msg: e.error })
    return e
  }
  const secs = Number(params.DurationSeconds) || 3600
  if (secs < 900 || secs > role.maxSession) {
    const e = fail(y, 'sts', 400, 'ValidationError', secs < 900 ? "1 validation error detected: Value at 'durationSeconds' failed to satisfy constraint: Member must have value greater than or equal to 900" : 'The requested DurationSeconds exceeds the MaxSessionDuration set for this role.')
    trail(y, now, { src: 'sts', name: 'AssumeRole', user: display(p), arn: p.arn, key: p.key, app: who, res: roleArn, code: e.code, msg: e.error })
    return e
  }
  const n = next(y)
  // lab-made key IDs: the real prefix ASIA, then _LAB_, so they never look like real temporary keys
  const id = `ASIA_LAB_${String(n).padStart(7, '0')}`
  const ses = { id, secret: `lab-only/session-${hexOf(`sec:${n}`, 16)}`, token: `LabSessionToken/${hexOf(`tok:${n}`, 24)}`, role: role.name, roleArn, name: sessionName, from: p.arn, app: who ?? '', expires: now + secs * 1000, t: now }
  y.sessions[id] = ses
  // keep the newest sessions only
  const all = Object.values(y.sessions).sort((a, b) => a.t - b.t)
  for (const old of all.slice(0, Math.max(0, all.length - 16))) delete y.sessions[old.id]
  trail(y, now, { src: 'sts', name: 'AssumeRole', user: display(p), arn: p.arn, key: p.key, app: who, res: roleArn, code: '', msg: `DurationSeconds ${secs}, session ${sessionName}, expires ${new Date(ses.expires).toISOString().slice(11, 16)}` })
  return { ok: true, status: 200, ms: 90, Credentials: { AccessKeyId: id, SecretAccessKey: ses.secret, SessionToken: ses.token, Expiration: ses.expires }, AssumedRoleUser: { Arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${role.name}/${sessionName}` } }
}

// ---------- KMS ----------

function kmsCheck(y, p, action, key, now, who, by = 's3.amazonaws.com') {
  if (!key.enabled) return { ok: false, code: 'KMS.DisabledException', message: `${key.arn} is disabled.` }
  const d = decide(y, p, action, key.arn, { resourceDoc: readJson(key.policy), resourceName: 'key policy', mode: 'kms', ctx: { 'kms:ViaService': `s3.${REGION}.amazonaws.com` } })
  const ok = d.decision === 'allowed'
  trail(y, now, { src: 'kms', name: action.replace('kms:', ''), user: display(p), arn: p.arn, key: p.key, app: who, res: key.arn, code: ok ? '' : 'AccessDenied', msg: ok ? `invoked by ${by}` : d.message })
  return ok ? { ok } : { ok: false, code: 'AccessDenied', message: d.message }
}

// ---------- S3 ----------

function s3op(y, cfg, op, p, who, now) {
  const a = signIn(y, cfg, 's3', now, who)
  const res = p.Bucket ? arnBucket(p.Bucket, p.Key) : '*'
  if (a.bad) return refused(y, a, 's3', op, now, who, res)
  const P = a.p
  const done = (r, msg = '') => {
    trail(y, now, { src: 's3', name: op, user: display(P), arn: P.arn, key: P.key, app: who, res, code: r.ok ? '' : r.code, msg: r.ok ? msg : r.error })
    return r
  }
  if (op === 'ListBuckets') {
    const d = decide(y, P, 's3:ListAllMyBuckets', '*')
    if (d.decision !== 'allowed') return done(fail(y, 's3', 403, 'AccessDenied', d.message))
    return done({ ok: true, status: 200, ms: 60, Buckets: Object.values(y.buckets).map((b) => ({ Name: b.name, CreationDate: b.created })) })
  }
  const b = y.buckets[word(p.Bucket)]
  if (!b) return done(fail(y, 's3', 404, 'NoSuchBucket', 'The specified bucket does not exist'))
  if (word(cfg.region) !== b.region) return done(fail(y, 's3', 301, 'PermanentRedirect', `The bucket you are attempting to access must be addressed using the specified endpoint. Please send all future requests to this endpoint: ${b.name}.s3.${b.region}.amazonaws.com`))
  const bucketDoc = readJson(b.policy)
  const allow = (action, resource, ctx) => decide(y, P, action, resource, { resourceDoc: bucketDoc, resourceName: 'bucket policy', ctx })
  if (op === 'HeadBucket' || op === 'ListObjects' || op === 'ListObjectsV2') {
    const d = allow('s3:ListBucket', arnBucket(b.name))
    if (d.decision !== 'allowed') return done(fail(y, 's3', 403, 'AccessDenied', op === 'HeadBucket' ? 'Forbidden' : d.message))
    if (op === 'HeadBucket') return { ok: true, status: 200, ms: 30 }
    const prefix = word(p.Prefix)
    return done({ ok: true, status: 200, ms: 70, Contents: Object.entries(b.objects).filter(([k]) => k.startsWith(prefix)).map(([Key, o]) => ({ Key, Size: o.size, LastModified: o.t, ETag: o.etag })) })
  }
  const key = word(p.Key)
  if (!key) return done(fail(y, 's3', 400, 'InvalidRequest', 'A key must be provided'))
  if (op === 'PutObject') {
    const sse = word(p.ServerSideEncryption)
    if (sse && !['AES256', 'aws:kms'].includes(sse)) return done(fail(y, 's3', 400, 'InvalidArgument', 'The encryption method specified is not supported'))
    const ctx = { ...(sse && { 's3:x-amz-server-side-encryption': sse }), ...(word(p.SSEKMSKeyId) && { 's3:x-amz-server-side-encryption-aws-kms-key-id': word(p.SSEKMSKeyId) }) }
    const d = allow('s3:PutObject', arnBucket(b.name, key), ctx)
    if (d.decision !== 'allowed') return done(fail(y, 's3', 403, 'AccessDenied', d.message))
    const enc = sse || (b.encryption.type === 'SSE-KMS' ? 'aws:kms' : 'AES256')
    let kms = null
    if (enc === 'aws:kms') {
      kms = keyOf(y, word(p.SSEKMSKeyId) || b.encryption.key || 'alias/aws/s3')
      if (!kms) return done(fail(y, 's3', 400, 'KMS.NotFoundException', `Invalid keyId ${word(p.SSEKMSKeyId) || b.encryption.key || 'alias/aws/s3'}`))
      const k = kmsCheck(y, P, 'kms:GenerateDataKey', kms, now, who)
      if (!k.ok) return done(fail(y, 's3', 403, k.code === 'AccessDenied' ? 'AccessDenied' : k.code, k.message))
    }
    const body = String(p.Body ?? '')
    b.objects[key] = { size: body.length, t: now, etag: hexOf(`${b.name}/${key}/${now}/${body.length}`), sse: enc, kms: kms?.id ?? '', by: display(P), body: body.slice(0, 2000) }
    const keys = Object.keys(b.objects)
    if (keys.length > MAX_OBJECTS) for (const k of keys.sort((m, n) => b.objects[m].t - b.objects[n].t).slice(0, keys.length - MAX_OBJECTS)) delete b.objects[k]
    return done({ ok: true, status: 200, ms: 120, ETag: b.objects[key].etag, ServerSideEncryption: enc, ...(kms && { SSEKMSKeyId: kms.arn }) }, enc === 'aws:kms' ? `SSE-KMS with ${kms.alias}` : 'SSE-S3')
  }
  if (op === 'GetObject') {
    const d = allow('s3:GetObject', arnBucket(b.name, key))
    if (d.decision !== 'allowed') return done(fail(y, 's3', 403, 'AccessDenied', d.message))
    const o = b.objects[key]
    if (!o) {
      // without s3:ListBucket S3 does not say whether the key exists
      if (allow('s3:ListBucket', arnBucket(b.name)).decision !== 'allowed') return done(fail(y, 's3', 403, 'AccessDenied', 'Access Denied'))
      return done(fail(y, 's3', 404, 'NoSuchKey', 'The specified key does not exist.'))
    }
    if (o.sse === 'aws:kms') {
      const kms = y.keys[o.kms] ?? keyOf(y, b.encryption.key)
      const k = kms ? kmsCheck(y, P, 'kms:Decrypt', kms, now, who) : { ok: true }
      if (!k.ok) return done(fail(y, 's3', 403, 'AccessDenied', k.message))
    }
    return done({ ok: true, status: 200, ms: 80, Body: o.body, ContentLength: o.size, LastModified: o.t, ServerSideEncryption: o.sse })
  }
  if (op === 'DeleteObject') {
    const d = allow('s3:DeleteObject', arnBucket(b.name, key))
    if (d.decision !== 'allowed') return done(fail(y, 's3', 403, 'AccessDenied', d.message))
    delete b.objects[key]
    return done({ ok: true, status: 204, ms: 50 })
  }
  return done(fail(y, 's3', 400, 'InvalidRequest', `Operation ${op} is not part of the lab`))
}

// ---------- SQS ----------

const receiptOf = (m) => `AQEB${m.id.replace(/-/g, '')}${String(m.rc).padStart(3, '0')}`
const idOfReceipt = (h) => {
  const r = /^AQEB([0-9a-f]{32})(\d{3})$/.exec(word(h))
  if (!r) return null
  const x = r[1]
  return { id: `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`, rc: Number(r[2]) }
}
const attrsValid = (attrs) => {
  for (const [name, a] of Object.entries(attrs ?? {})) {
    const t = word(a?.DataType)
    if (!/^(String|Number|Binary|String\.Array)(\..+)?$/.test(t)) return `The message attribute '${name}' has an invalid message attribute type, the set of supported type prefixes is Binary, Number, and String.`
    if (t.startsWith('Number') && !Number.isFinite(Number(a.StringValue))) return `Could not cast message attribute '${name}' value to number.`
    if (!t.startsWith('Binary') && !word(a.StringValue)) return `The message attribute '${name}' must contain non-empty message attribute value for message attribute type '${t}'.`
  }
  return null
}
// puts a message on a queue; the SQS rules for FIFO queues apply
function enqueue(y, q, { body, attrs, group, dedup, delay }, now) {
  const text = String(body ?? '')
  if (!text) return { error: ['MissingParameter', 'The request must contain the parameter MessageBody.'] }
  const bad = attrsValid(attrs)
  if (bad) return { error: ['InvalidParameterValue', bad] }
  if (q.fifo) {
    if (!word(group)) return { error: ['MissingParameter', 'The request must contain the parameter MessageGroupId.'] }
    if (!word(dedup) && !q.contentDedup) return { error: ['InvalidParameterValue', 'The queue should either have ContentBasedDeduplication enabled or MessageDeduplicationId provided explicitly'] }
    // a FIFO queue has no delay per message, only the delay of the queue
    if (delay !== undefined && delay !== null && word(delay) !== '') return { error: ['InvalidParameterValue', `Value ${word(delay)} for parameter DelaySeconds is invalid. Reason: The request include parameter that is not valid for this queue type.`] }
  }
  // a standard queue takes a MessageGroupId too (fair queues): it spreads the work, it does not order (lab: stored only)
  const n = next(y)
  const id = uuidOf(`msg:${q.name}:${n}`)
  if (q.fifo) {
    const d = word(dedup) || hexOf(text, 32)
    for (const [k, t] of Object.entries(q.dedupIds)) if (now - t >= 5 * MINUTE) delete q.dedupIds[k]
    // the same deduplication ID within 5 minutes: SQS answers success and keeps only the first message
    if (q.dedupIds[d] !== undefined) return { id, duplicate: true }
    q.dedupIds[d] = now
  }
  const wait = Number(delay ?? q.delay) || 0
  push(q.messages, { id, body: text.slice(0, 4000), attrs: attrs ?? {}, sent: now, vis: now + wait * 1000, rc: 0, first: null, receipt: '', group: word(group), dedup: word(dedup) }, MAX_QUEUE)
  q.stats.sent++
  return { id }
}
const applyDeletes = (q, upTo) => {
  if (!q.pending?.length) return
  const due = q.pending.filter((d) => d.at <= upTo).sort((a, b) => a.at - b.at)
  q.pending = q.pending.filter((d) => d.at > upTo)
  for (const d of due) removeByReceipt(q, d.receipt)
}
// a delete with an old receipt handle succeeds and deletes nothing (the message was received again since)
function removeByReceipt(q, receipt) {
  const ref = idOfReceipt(receipt)
  if (!ref) return 'invalid'
  const i = q.messages.findIndex((m) => m.id === ref.id)
  if (i < 0 || q.messages[i].receipt !== receipt) return 'stale'
  q.messages.splice(i, 1)
  q.stats.deleted++
  return 'deleted'
}
function moveToDlq(y, q, m, now) {
  const dlq = y.queues[q.redrive?.dlq]
  q.messages = q.messages.filter((x) => x !== m)
  if (!dlq) return
  push(dlq.messages, { ...m, sent: m.sent, vis: now, rc: 0, first: null, receipt: '', src: arnQueue(q.name), moved: now, srcRc: m.rc }, MAX_QUEUE)
  q.stats.moved++
}
// the messages one receive gets at time `at`
function receive(y, q, at, { max = 1, visibility }) {
  const V = Number(visibility ?? q.visibility)
  const out = []
  const blocked = new Set(q.fifo ? q.messages.filter((m) => m.vis > at && m.rc > 0).map((m) => m.group) : [])
  for (const m of [...q.messages]) {
    if (out.length >= Math.min(10, Math.max(1, Number(max) || 1))) break
    if (m.vis > at) continue
    if (q.fifo && blocked.has(m.group)) continue
    // the redrive policy: a message received maxReceiveCount times goes to the dead-letter queue on the next receive
    if (q.redrive && m.rc >= q.redrive.max && y.queues[q.redrive.dlq]) {
      moveToDlq(y, q, m, at)
      continue
    }
    m.rc++
    m.first ??= at
    m.vis = at + V * 1000
    m.receipt = receiptOf(m)
    if (q.fifo) blocked.add(m.group)
    out.push(m)
  }
  q.stats.received += out.length
  if (!out.length) q.stats.empty++
  return out
}
const messageView = (q, m) => ({
  MessageId: m.id,
  ReceiptHandle: m.receipt,
  Body: m.body,
  MessageAttributes: m.attrs,
  Attributes: { ApproximateReceiveCount: String(m.rc), SentTimestamp: String(m.sent), ApproximateFirstReceiveTimestamp: String(m.first ?? ''), ...(m.group && { MessageGroupId: m.group }), ...(m.src && { DeadLetterQueueSourceArn: m.src }) },
})
const nextVisible = (q, t) => q.messages.reduce((min, m) => (m.vis > t && m.vis < min ? m.vis : min), Infinity)
export const queueCounts = (q, now) => ({
  visible: q.messages.filter((m) => m.vis <= now).length,
  inFlight: q.messages.filter((m) => m.vis > now && m.rc > 0).length,
  delayed: q.messages.filter((m) => m.vis > now && m.rc === 0).length,
})
export const queueAttributes = (q, now) => {
  const c = queueCounts(q, now)
  return {
    QueueArn: arnQueue(q.name),
    ApproximateNumberOfMessages: String(c.visible),
    ApproximateNumberOfMessagesNotVisible: String(c.inFlight),
    ApproximateNumberOfMessagesDelayed: String(c.delayed),
    VisibilityTimeout: String(q.visibility),
    MessageRetentionPeriod: String(q.retention),
    ReceiveMessageWaitTimeSeconds: String(q.wait),
    DelaySeconds: String(q.delay),
    ...(q.redrive && { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: arnQueue(q.redrive.dlq), maxReceiveCount: q.redrive.max }) }),
    ...(q.fifo && { FifoQueue: 'true', ContentBasedDeduplication: String(q.contentDedup) }),
  }
}
const SQS_ACTION = { SendMessage: 'sqs:SendMessage', ReceiveMessage: 'sqs:ReceiveMessage', DeleteMessage: 'sqs:DeleteMessage', ChangeMessageVisibility: 'sqs:ChangeMessageVisibility', GetQueueAttributes: 'sqs:GetQueueAttributes', PurgeQueue: 'sqs:PurgeQueue' }
const NO_QUEUE = ['AWS.SimpleQueueService.NonExistentQueue', 'The specified queue does not exist for this wsdl version.']

function sqsop(y, cfg, op, p, who, now0) {
  const now = Number.isFinite(p.At) ? p.At : now0
  const a = signIn(y, cfg, 'sqs', now0, who)
  const ref = p.QueueUrl ?? p.QueueName
  if (a.bad) return refused(y, a, 'sqs', op, now0, who, word(ref))
  const P = a.p
  // ReceiveMessage that gets nothing is not written to the event history, so it stays readable (lab-made)
  const done = (r, msg = '', quiet = false) => {
    if (!quiet || !r.ok) trail(y, now0, { src: 'sqs', name: op, user: display(P), arn: P.arn, key: P.key, app: who, res: q ? arnQueue(q.name) : word(ref), code: r.ok ? '' : r.code, msg: r.ok ? msg : r.error })
    return r
  }
  const q = word(cfg.region) === REGION ? queueOf(y, ref) : null
  if (!q) return done(fail(y, 'sqs', 400, ...NO_QUEUE))
  const action = SQS_ACTION[op]
  if (!action) return done(fail(y, 'sqs', 400, 'InvalidAction', `The action ${op} is not valid for this endpoint.`))
  const d = decide(y, P, action, arnQueue(q.name), { resourceDoc: readJson(q.policy), resourceName: 'queue policy' })
  if (d.decision !== 'allowed') return done(fail(y, 'sqs', 403, 'AccessDenied', d.message))
  applyDeletes(q, now)
  if (op === 'SendMessage') {
    const r = enqueue(y, q, { body: p.MessageBody, attrs: p.MessageAttributes, group: p.MessageGroupId, dedup: p.MessageDeduplicationId, delay: p.DelaySeconds }, now)
    if (r.error) return done(fail(y, 'sqs', 400, ...r.error))
    return done({ ok: true, status: 200, ms: 25, MessageId: r.id }, r.duplicate ? 'duplicate within the deduplication interval, not added' : `MessageId ${r.id}`)
  }
  if (op === 'ReceiveMessage') {
    const got = receive(y, q, now, { max: p.MaxNumberOfMessages, visibility: p.VisibilityTimeout })
    return done({ ok: true, status: 200, ms: got.length ? 30 : Math.min(20, Number(p.WaitTimeSeconds ?? q.wait) || 0) * 1000 || 20, Messages: got.map((m) => messageView(q, m)) }, `${got.length} message${got.length === 1 ? '' : 's'}`, !got.length)
  }
  if (op === 'DeleteMessage') {
    const r = removeByReceipt(q, p.ReceiptHandle)
    if (r === 'invalid') return done(fail(y, 'sqs', 400, 'ReceiptHandleIsInvalid', `The input receipt handle "${word(p.ReceiptHandle)}" is not a valid receipt handle.`))
    return done({ ok: true, status: 200, ms: 20 }, r === 'stale' ? 'receipt handle of an earlier receive: nothing deleted' : 'deleted')
  }
  if (op === 'ChangeMessageVisibility') {
    const ref2 = idOfReceipt(p.ReceiptHandle)
    const m = ref2 && q.messages.find((x) => x.id === ref2.id && x.receipt === word(p.ReceiptHandle))
    if (!m) return done(fail(y, 'sqs', 400, 'ReceiptHandleIsInvalid', 'Value for parameter ReceiptHandle is invalid. Reason: Message does not exist or is not available for visibility timeout change.'))
    m.vis = now + Number(p.VisibilityTimeout ?? 0) * 1000
    return done({ ok: true, status: 200, ms: 20 })
  }
  if (op === 'GetQueueAttributes') return { ok: true, status: 200, ms: 20, Attributes: queueAttributes(q, now) }
  if (op === 'PurgeQueue') {
    q.messages = []
    return done({ ok: true, status: 200, ms: 20 })
  }
  return done(fail(y, 'sqs', 400, 'InvalidAction', `The action ${op} is not valid for this endpoint.`))
}

// The Receive messages source of the connector for one lab minute, consumer by consumer in time order
function listen(y, cfg, ref, opts, handler, who, now) {
  const a = signIn(y, cfg, 'sqs', now, who)
  if (a.bad) return refused(y, a, 'sqs', 'ReceiveMessage', now, who, word(ref))
  const P = a.p
  const q = word(cfg.region) === REGION ? queueOf(y, ref) : null
  if (!q) {
    const e = fail(y, 'sqs', 400, ...NO_QUEUE)
    trail(y, now, { src: 'sqs', name: 'ReceiveMessage', user: display(P), arn: P.arn, key: P.key, app: who, res: word(ref), code: e.code, msg: e.error })
    return e
  }
  const policy = readJson(q.policy)
  const may = (action) => decide(y, P, action, arnQueue(q.name), { resourceDoc: policy, resourceName: 'queue policy' })
  const r0 = may('sqs:ReceiveMessage')
  if (r0.decision !== 'allowed') {
    const e = fail(y, 'sqs', 403, 'AccessDenied', r0.message)
    trail(y, now, { src: 'sqs', name: 'ReceiveMessage', user: display(P), arn: P.arn, key: P.key, app: who, res: arnQueue(q.name), code: e.code, msg: e.error })
    return e
  }
  const canDelete = may('sqs:DeleteMessage')
  const C = Math.max(1, Math.min(8, Number(opts?.consumers) || 1))
  const V = Number.isFinite(Number(opts?.visibility)) && word(opts?.visibility) !== '' ? Number(opts.visibility) : q.visibility
  const W = Number.isFinite(Number(opts?.wait)) && word(opts?.wait) !== '' ? Number(opts.wait) : q.wait
  const key = `${who}|${q.name}`
  const free = (y.listeners[key] ?? []).slice(0, C).map((t) => Math.max(t, now))
  while (free.length < C) free.push(now + free.length * 50)
  const end = now + MINUTE
  const out = { ok: true, status: 200, ms: 0, received: 0, done: 0, failed: 0, empty: 0, errors: [], messages: [] }
  for (let guard = 0; guard < 400; guard++) {
    const i = free.indexOf(Math.min(...free))
    const t = free[i]
    if (t >= end) break
    applyDeletes(q, t)
    const got = receive(y, q, t, { max: opts?.max ?? 1, visibility: V })
    if (!got.length) {
      out.empty++
      // long polling waits up to W seconds and returns when a message turns visible; short polling asks again after 1 s (lab-made)
      const nv = nextVisible(q, t)
      free[i] = W > 0 ? Math.max(t + 1000, Math.min(t + W * 1000, nv)) : t + 1000
      continue
    }
    let busy = 0
    for (const m of got) {
      out.received++
      const view = messageView(q, m)
      const r = handler(view, t) ?? { ok: true }
      busy += Math.max(0.1, Number(r.seconds ?? 1)) * 1000
      out.messages.push({ id: m.id, rc: m.rc, ok: Boolean(r.ok), t })
      if (!r.ok) {
        out.failed++
        continue
      }
      if (canDelete.decision !== 'allowed') {
        out.errors.push(fail(y, 'sqs', 403, 'AccessDenied', canDelete.message))
        continue
      }
      q.pending.push({ at: t + busy, receipt: m.receipt })
      out.done++
    }
    free[i] = t + Math.max(busy, 1000)
  }
  y.listeners[key] = free
  if (out.received) trail(y, now, { src: 'sqs', name: 'ReceiveMessage', user: display(P), arn: P.arn, key: P.key, app: who, res: arnQueue(q.name), code: '', msg: `${out.received} received by ${C} consumer${C > 1 ? 's' : ''}` })
  if (out.errors.length) trail(y, now, { src: 'sqs', name: 'DeleteMessage', user: display(P), arn: P.arn, key: P.key, app: who, res: arnQueue(q.name), code: 'AccessDenied', msg: out.errors[0].error })
  out.ms = Math.max(20, out.received * 200)
  return out
}

// ---------- SNS ----------

const ARRAY_OF = (a) => {
  try {
    const v = JSON.parse(a.StringValue)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function ruleHit(r, a) {
  if (typeof r === 'string') return Boolean(a) && ((a.DataType === 'String' && a.StringValue === r) || (a.DataType === 'String.Array' && ARRAY_OF(a).includes(r)))
  if (typeof r === 'number') return Boolean(a) && a.DataType === 'Number' && Number(a.StringValue) === r
  if (r === null || typeof r !== 'object') return false
  if ('exists' in r) return r.exists ? Boolean(a) : !a
  if (!a) return false
  const isString = a.DataType === 'String'
  if ('prefix' in r) return isString && a.StringValue.startsWith(String(r.prefix))
  if ('suffix' in r) return isString && a.StringValue.endsWith(String(r.suffix))
  if ('anything-but' in r) {
    const no = list(r['anything-but'])
    if (a.DataType === 'Number') return !no.some((v) => typeof v === 'number' && v === Number(a.StringValue))
    return isString && !no.some((v) => String(v) === a.StringValue)
  }
  // numeric matching works on attributes of type Number only
  if ('numeric' in r) {
    if (a.DataType !== 'Number') return false
    const n = Number(a.StringValue)
    const c = r.numeric
    for (let i = 0; i < c.length; i += 2) {
      const v = Number(c[i + 1])
      const ok = { '=': n === v, '>': n > v, '>=': n >= v, '<': n < v, '<=': n <= v }[c[i]]
      if (!ok) return false
    }
    return true
  }
  return false
}
// a filter policy with scope MessageAttributes: every key must match, any value of a key may match
export function filterMatches(policyText, attrs) {
  const doc = readJson(policyText)
  if (!doc) return true
  return Object.entries(doc).every(([k, rules]) => list(rules).some((r) => ruleHit(r, attrs?.[k])))
}
export function filterErrors(text) {
  if (!word(text)) return []
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    return [`Invalid parameter: FilterPolicy: failed to parse JSON. ${e.message}`]
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['Invalid parameter: FilterPolicy: Filter policy must be a JSON object']
  const errs = []
  for (const [k, v] of Object.entries(doc)) {
    if (!Array.isArray(v)) {
      errs.push(`Invalid parameter: FilterPolicy: "${k}" must be an object or an array`)
      continue
    }
    for (const r of v) {
      if (r === null || ['string', 'number', 'boolean'].includes(typeof r)) continue
      const op = Object.keys(r)[0]
      if (!['exists', 'prefix', 'suffix', 'anything-but', 'numeric'].includes(op)) errs.push(`Invalid parameter: FilterPolicy: Unrecognized match type ${op}`)
      else if (op === 'numeric' && (!Array.isArray(r.numeric) || r.numeric.length % 2 || r.numeric.some((x, i) => (i % 2 ? typeof x !== 'number' : !['=', '>', '>=', '<', '<='].includes(x))))) errs.push('Invalid parameter: FilterPolicy: Value of numeric must be an array of operators and numbers, such as [">=", 30]')
    }
  }
  return errs
}
function addSub(y, topic, { queue, filter = '', raw = false }) {
  const id = uuidOf(`sub:${topic.name}:${queue}:${topic.subs.length}`)
  topic.subs.push({ id, protocol: 'sqs', endpoint: arnQueue(queue), filter, raw: Boolean(raw), stats: { delivered: 0, filtered: 0, failed: 0 } })
  // as the SQS console does: the queue lets the topic send to it
  const q = y.queues[queue]
  if (q) {
    const doc = readJson(q.policy) ?? { Version: '2012-10-17', Statement: [] }
    doc.Statement = list(doc.Statement)
    if (!doc.Statement.some((st) => st.Sid === snsToQueueStatement(queue, topic.name).Sid)) doc.Statement.push(snsToQueueStatement(queue, topic.name))
    q.policy = policyText(doc)
  }
  return id
}
function fanOut(y, topic, { message, subject, attrs }, now) {
  const msgId = uuidOf(`sns:${topic.name}:${next(y)}`)
  topic.stats.published++
  const to = []
  for (const sub of topic.subs) {
    if (sub.filter && !filterMatches(sub.filter, attrs)) {
      sub.stats.filtered++
      topic.stats.filtered++
      continue
    }
    const q = queueOf(y, sub.endpoint)
    const d = q && decide(y, { service: 'sns.amazonaws.com', arn: 'sns.amazonaws.com' }, 'sqs:SendMessage', arnQueue(q.name), { resourceDoc: readJson(q.policy), ctx: { 'aws:SourceArn': topic.arn } })
    if (!q || d.decision !== 'allowed') {
      sub.stats.failed++
      continue
    }
    const body = sub.raw ? message : JSON.stringify({ Type: 'Notification', MessageId: msgId, TopicArn: topic.arn, ...(subject && { Subject: subject }), Message: message, Timestamp: new Date(Date.UTC(2026, 10, 2) + now).toISOString(), MessageAttributes: Object.fromEntries(Object.entries(attrs ?? {}).map(([k, v]) => [k, { Type: v.DataType, Value: v.StringValue }])) })
    const r = enqueue(y, q, { body, attrs: sub.raw ? attrs : {}, group: q.fifo ? topic.name : '', dedup: q.fifo ? msgId : '' }, now)
    if (r.error) sub.stats.failed++
    else {
      sub.stats.delivered++
      topic.stats.delivered++
      to.push(q.name)
    }
  }
  return { id: msgId, to }
}
function snsop(y, cfg, op, p, who, now) {
  const a = signIn(y, cfg, 'sns', now, who)
  if (a.bad) return refused(y, a, 'sns', op, now, who, word(p.TopicArn))
  const P = a.p
  const topic = word(cfg.region) === REGION && word(p.TopicArn).startsWith(`arn:aws:sns:${REGION}:${ACCOUNT}:`) ? topicOf(y, p.TopicArn) : null
  const done = (r, msg = '') => {
    trail(y, now, { src: 'sns', name: op, user: display(P), arn: P.arn, key: P.key, app: who, res: word(p.TopicArn), code: r.ok ? '' : r.code, msg: r.ok ? msg : r.error })
    return r
  }
  if (op !== 'Publish') return done(fail(y, 'sns', 400, 'InvalidAction', `Operation ${op} is not part of the lab`))
  if (!topic) return done(fail(y, 'sns', 404, 'NotFound', 'Topic does not exist'))
  const d = decide(y, P, 'sns:Publish', topic.arn, { resourceDoc: readJson(topic.policy), resourceName: 'topic policy' })
  if (d.decision !== 'allowed') return done(fail(y, 'sns', 403, 'AuthorizationError', d.message))
  if (!word(p.Message)) return done(fail(y, 'sns', 400, 'InvalidParameter', 'Invalid parameter: Empty message'))
  const bad = attrsValid(p.MessageAttributes)
  if (bad) return done(fail(y, 'sns', 400, 'InvalidParameterValue', bad))
  const { id } = fanOut(y, topic, { message: String(p.Message), subject: p.Subject, attrs: p.MessageAttributes ?? {} }, now)
  return done({ ok: true, status: 200, ms: 40, MessageId: id }, `MessageId ${id}`)
}

function stsop(y, cfg, op, p, who, now) {
  const a = signIn(y, { ...cfg, roleArn: op === 'AssumeRole' ? '' : cfg.roleArn }, 'sts', now, who)
  if (a.bad) return refused(y, a, 'sts', op, now, who, word(p.RoleArn))
  if (op === 'GetCallerIdentity') return { ok: true, status: 200, ms: 20, Account: ACCOUNT, Arn: a.p.arn }
  if (op === 'AssumeRole') return assumeRole(y, a.p, p, now, who)
  return fail(y, 'sts', 400, 'InvalidAction', `Operation ${op} is not part of the lab`)
}

// ---------- the ctx hook and the clock ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function awsCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.aws = fillAws(s.aws))
  const now = () => s.clock ?? 0
  return {
    s3: (cfg, op, params = {}) => s3op(sys(), cfg ?? {}, op, params, who, now()),
    sqs: (cfg, op, params = {}) => sqsop(sys(), cfg ?? {}, op, params, who, now()),
    sns: (cfg, op, params = {}) => snsop(sys(), cfg ?? {}, op, params, who, now()),
    sts: (cfg, op, params = {}) => stsop(sys(), cfg ?? {}, op, params, who, now()),
    listen: (cfg, queue, opts, handler) => listen(sys(), cfg ?? {}, queue, opts ?? {}, handler, who, now()),
  }
}

// runs once a lab minute while state.aws exists. Changes `s` in place.
export function awsTick(s) {
  const y = s?.aws
  if (!isFilled(y)) return s
  const now = s.clock ?? 0
  for (const q of Object.values(y.queues)) {
    applyDeletes(q, now)
    if (q.messages.some((m) => m.sent + q.retention * 1000 <= now)) q.messages = q.messages.filter((m) => m.sent + q.retention * 1000 > now)
  }
  return s
}

// ---------- screen actions (pure: state in, { state, result } out) ----------
// The console acts as harbor-admin with AdministratorAccess. Lab-made: console actions skip the policy checks.

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.aws = fillAws(s.aws)
  s.seen ??= {}
  const result = fn(s, s.aws, s.clock ?? 0)
  if (result?.errors?.length) return { state, result }
  return { state: s, result }
}
const errors = (...e) => ({ errors: e.filter(Boolean) })
const admin = (y, now, src, name, res, msg = '') => trail(y, now, { src, name, user: CONSOLE_USER, arn: arnUser(CONSOLE_USER), key: '', res, code: '', msg })
export const upgradeAws = (state) => (isFilled(state?.aws) ? state : edit(state, () => null).state)
const seen = (s, key) => (s.seen[key] ??= s.clock ?? 0)

// S3
const BUCKET_RULE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
export const createBucket = (state, { name, bpa = ALL_BLOCKED, encryption = { type: 'SSE-S3', key: '' } }) =>
  edit(state, (s, y, now) => {
    const n = word(name)
    if (!BUCKET_RULE.test(n) || n.includes('..')) return errors('Bucket name must be 3 to 63 characters: lowercase letters, numbers, dots and hyphens, and begin and end with a letter or number.')
    if (y.buckets[n]) return errors('BucketAlreadyOwnedByYou: A bucket with the same name already exists in your account.')
    if (encryption.type === 'SSE-KMS' && !keyOf(y, encryption.key)) return errors('Choose an AWS KMS key.')
    y.buckets[n] = mkBucket(n, { bpa, encryption }, now)
    admin(y, now, 's3', 'CreateBucket', arnBucket(n))
    return { name: n }
  })
export const setBucketPolicy = (state, bucket, text) =>
  edit(state, (s, y, now) => {
    const b = y.buckets[bucket]
    if (!word(text)) {
      b.policy = ''
      admin(y, now, 's3', 'DeleteBucketPolicy', arnBucket(bucket))
      return {}
    }
    const e = policyErrors(text, 'resource')
    if (e.length) return errors(...e)
    const doc = readJson(text)
    if (list(doc.Statement).some((st) => !list(st.Resource ?? st.NotResource).every((r) => r === arnBucket(bucket) || r.startsWith(`${arnBucket(bucket)}/`)))) return errors('MalformedPolicy: Policy has invalid resource')
    // Block Public Access refuses a policy that grants everyone
    if (b.bpa.policy && list(doc.Statement).some((st) => st.Effect === 'Allow' && (st.Principal === '*' || list(st.Principal?.AWS).includes('*')))) return errors('AccessDenied: Block Public Access settings of this bucket prevent public bucket policies. Turn off Block public access (bucket settings) first.')
    b.policy = policyText(doc)
    admin(y, now, 's3', 'PutBucketPolicy', arnBucket(bucket))
    return {}
  })
export const setBlockPublicAccess = (state, bucket, bpa) =>
  edit(state, (s, y, now) => {
    y.buckets[bucket].bpa = { ...ALL_BLOCKED, ...bpa }
    admin(y, now, 's3', 'PutPublicAccessBlock', arnBucket(bucket))
    return {}
  })
export const setBucketEncryption = (state, bucket, encryption) =>
  edit(state, (s, y, now) => {
    if (encryption.type === 'SSE-KMS' && !keyOf(y, encryption.key)) return errors('Choose an AWS KMS key.')
    y.buckets[bucket].encryption = { type: encryption.type, key: encryption.type === 'SSE-KMS' ? keyOf(y, encryption.key).alias : '' }
    admin(y, now, 's3', 'PutBucketEncryption', arnBucket(bucket))
    return {}
  })
export const uploadObject = (state, bucket, key, body) =>
  edit(state, (s, y, now) => {
    const k = word(key).replace(/^\/+/, '')
    if (!k) return errors('Enter a key for the object.')
    const b = y.buckets[bucket]
    const kms = b.encryption.type === 'SSE-KMS' ? keyOf(y, b.encryption.key) : null
    b.objects[k] = { size: String(body ?? '').length, t: now, etag: hexOf(`${bucket}/${k}/${now}`), sse: kms ? 'aws:kms' : 'AES256', kms: kms?.id ?? '', by: CONSOLE_USER, body: String(body ?? '').slice(0, 2000) }
    admin(y, now, 's3', 'PutObject', arnBucket(bucket, k))
    return { key: k }
  })
export const deleteObject = (state, bucket, key) =>
  edit(state, (s, y, now) => {
    delete y.buckets[bucket].objects[key]
    admin(y, now, 's3', 'DeleteObject', arnBucket(bucket, key))
    return {}
  })

// KMS
export const setKeyPolicy = (state, keyId, text) =>
  edit(state, (s, y, now) => {
    const e = policyErrors(text, 'resource')
    if (e.length) return errors(...e)
    y.keys[keyId].policy = policyText(readJson(text))
    admin(y, now, 'kms', 'PutKeyPolicy', y.keys[keyId].arn)
    return {}
  })

// SQS
const QUEUE_RULE = /^[A-Za-z0-9_-]{1,80}$/
function queueFieldErrors(y, f, self) {
  const e = []
  const num = (v, min, max, what) => {
    const n = Number(v)
    if (word(v) === '' || !Number.isInteger(n) || n < min || n > max) e.push(`${what} must be a whole number from ${min} to ${max}.`)
  }
  num(f.visibility, 0, 43200, 'Visibility timeout (seconds)')
  num(f.retention, 60, 1209600, 'Message retention period (seconds)')
  num(f.wait, 0, 20, 'Receive message wait time (seconds)')
  num(f.delay, 0, 900, 'Delivery delay (seconds)')
  if (f.dlq) {
    const d = y.queues[f.dlq]
    if (!d || d.name === self) e.push('Choose an existing queue as the dead-letter queue.')
    else if (d.fifo !== String(self).endsWith('.fifo')) e.push('The dead-letter queue of a FIFO queue must be a FIFO queue, and of a standard queue a standard queue.')
    num(f.maxReceives, 1, 1000, 'Maximum receives')
  }
  return e
}
export const createQueue = (state, f) =>
  edit(state, (s, y, now) => {
    const name = word(f.name) + (f.fifo && !word(f.name).endsWith('.fifo') ? '.fifo' : '')
    if (!QUEUE_RULE.test(name.replace(/\.fifo$/, '')) || name.length > 80) return errors('A queue name can have up to 80 characters: letters, numbers, hyphens and underscores. A FIFO queue name ends with .fifo.')
    if (y.queues[name]) return errors(`QueueAlreadyExists: A queue named ${name} already exists.`)
    const e = queueFieldErrors(y, { ...f, fifo: Boolean(f.fifo) }, name)
    if (e.length) return errors(...e)
    y.queues[name] = mkQueue(name, { visibility: Number(f.visibility), retention: Number(f.retention), wait: Number(f.wait), delay: Number(f.delay), contentDedup: f.contentDedup, redrive: f.dlq ? { dlq: f.dlq, max: Number(f.maxReceives) } : null }, now)
    admin(y, now, 'sqs', 'CreateQueue', arnQueue(name))
    return { name }
  })
export const editQueue = (state, name, f) =>
  edit(state, (s, y, now) => {
    const q = y.queues[name]
    const e = queueFieldErrors(y, { ...f, fifo: q.fifo }, name)
    if (e.length) return errors(...e)
    Object.assign(q, { visibility: Number(f.visibility), retention: Number(f.retention), wait: Number(f.wait), delay: Number(f.delay), contentDedup: Boolean(f.contentDedup), redrive: f.dlq ? { dlq: f.dlq, max: Number(f.maxReceives) } : null, changed: now })
    admin(y, now, 'sqs', 'SetQueueAttributes', arnQueue(name), `VisibilityTimeout ${q.visibility}, ReceiveMessageWaitTimeSeconds ${q.wait}${q.redrive ? `, RedrivePolicy ${q.redrive.dlq} after ${q.redrive.max}` : ''}`)
    return {}
  })
export const setQueuePolicy = (state, name, text) =>
  edit(state, (s, y, now) => {
    if (word(text)) {
      const e = policyErrors(text, 'resource')
      if (e.length) return errors(...e)
    }
    y.queues[name].policy = word(text) ? policyText(readJson(text)) : ''
    admin(y, now, 'sqs', 'SetQueueAttributes', arnQueue(name), 'Policy')
    return {}
  })
export const sendFromConsole = (state, name, { body, attrs = {}, group = '', dedup = '' }) =>
  edit(state, (s, y, now) => {
    const q = y.queues[name]
    applyDeletes(q, now)
    const r = enqueue(y, q, { body, attrs, group, dedup }, now)
    if (r.error) return errors(`${r.error[0]}: ${r.error[1]}`)
    admin(y, now, 'sqs', 'SendMessage', arnQueue(name), `MessageId ${r.id}`)
    return { id: r.id, duplicate: Boolean(r.duplicate) }
  })
// Poll for messages in the console is a ReceiveMessage too: it counts as a receive and hides the messages for the visibility timeout
export const pollFromConsole = (state, name, max = 10) =>
  edit(state, (s, y, now) => {
    const q = y.queues[name]
    applyDeletes(q, now)
    const got = receive(y, q, now, { max })
    seen(s, `aws:poll:${name}`)
    admin(y, now, 'sqs', 'ReceiveMessage', arnQueue(name), `${got.length} message${got.length === 1 ? '' : 's'} (console poll)`)
    return { messages: got.map((m) => messageView(q, m)) }
  })
export const deleteFromConsole = (state, name, receipts) =>
  edit(state, (s, y, now) => {
    const q = y.queues[name]
    const r = list(receipts).map((h) => removeByReceipt(q, h))
    admin(y, now, 'sqs', 'DeleteMessageBatch', arnQueue(name), `${r.filter((x) => x === 'deleted').length} deleted`)
    return { deleted: r.filter((x) => x === 'deleted').length }
  })
export const purgeQueue = (state, name) =>
  edit(state, (s, y, now) => {
    y.queues[name].messages = []
    y.queues[name].pending = []
    admin(y, now, 'sqs', 'PurgeQueue', arnQueue(name))
    return {}
  })
// Start DLQ redrive: moves the messages of a dead-letter queue back to the queues they came from
export const startRedrive = (state, dlqName) =>
  edit(state, (s, y, now) => {
    const d = y.queues[dlqName]
    applyDeletes(d, now)
    const back = d.messages.filter((m) => m.src && queueOf(y, m.src) && m.vis <= now)
    if (!back.length) return errors('There are no available messages to redrive. Messages in flight wait until their visibility timeout ends.')
    for (const m of back) {
      const q = queueOf(y, m.src)
      push(q.messages, { ...m, rc: 0, first: null, receipt: '', vis: now, src: undefined, moved: undefined, srcRc: undefined, redriven: now }, MAX_QUEUE)
    }
    d.messages = d.messages.filter((m) => !back.includes(m))
    d.lastRedrive = { t: now, moved: back.length }
    admin(y, now, 'sqs', 'StartMessageMoveTask', arnQueue(dlqName), `${back.length} message${back.length === 1 ? '' : 's'} moved to the source queue`)
    return { moved: back.length }
  })

// SNS
export const createTopic = (state, name) =>
  edit(state, (s, y, now) => {
    const n = word(name)
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(n)) return errors('Topic names can have letters, numbers, hyphens and underscores.')
    if (y.topics[n]) return errors(`A topic named ${n} already exists.`)
    y.topics[n] = mkTopic(n, {}, now)
    admin(y, now, 'sns', 'CreateTopic', arnTopic(n))
    return { name: n }
  })
export const subscribe = (state, topic, { queue, filter = '', raw = false }) =>
  edit(state, (s, y, now) => {
    if (!y.queues[queue]) return errors('Choose an Amazon SQS queue as the endpoint.')
    const e = filterErrors(filter)
    if (e.length) return errors(...e)
    const id = addSub(y, y.topics[topic], { queue, filter: word(filter) ? JSON.stringify(JSON.parse(filter), null, 2) : '', raw })
    admin(y, now, 'sns', 'Subscribe', arnTopic(topic), `sqs ${arnQueue(queue)}`)
    return { id }
  })
export const setSubscription = (state, topic, id, { filter, raw }) =>
  edit(state, (s, y, now) => {
    const sub = y.topics[topic].subs.find((x) => x.id === id)
    if (filter !== undefined) {
      const e = filterErrors(filter)
      if (e.length) return errors(...e)
      sub.filter = word(filter) ? JSON.stringify(JSON.parse(filter), null, 2) : ''
    }
    if (raw !== undefined) sub.raw = Boolean(raw)
    admin(y, now, 'sns', 'SetSubscriptionAttributes', `${arnTopic(topic)}:${id}`, filter !== undefined ? 'FilterPolicy' : 'RawMessageDelivery')
    return {}
  })
export const unsubscribe = (state, topic, id) =>
  edit(state, (s, y, now) => {
    y.topics[topic].subs = y.topics[topic].subs.filter((x) => x.id !== id)
    admin(y, now, 'sns', 'Unsubscribe', `${arnTopic(topic)}:${id}`)
    return {}
  })
// attrs: [{ name, type, value }]
export const publishFromConsole = (state, topic, { message, subject = '', attrs = [] }) =>
  edit(state, (s, y, now) => {
    if (!word(message)) return errors('Enter a message body.')
    const map = Object.fromEntries(attrs.filter((a) => word(a.name)).map((a) => [word(a.name), { DataType: a.type, StringValue: String(a.value ?? '') }]))
    const bad = attrsValid(map)
    if (bad) return errors(bad)
    const { id, to } = fanOut(y, y.topics[topic], { message, subject, attrs: map }, now)
    const tp = y.topics[topic]
    tp.lastConsole = { t: now, id, to }
    tp.consoleTo = [...new Set([...(tp.consoleTo ?? []), ...to])]
    admin(y, now, 'sns', 'Publish', arnTopic(topic), `MessageId ${id}, delivered to ${to.length ? to.join(', ') : 'no subscription'}`)
    return { id, to }
  })

// IAM
export const createUser = (state, name) =>
  edit(state, (s, y, now) => {
    const n = word(name)
    if (!/^[\w+=,.@-]{1,64}$/.test(n)) return errors('User names can have up to 64 letters, numbers and the characters + = , . @ _ -.')
    if (y.users[n]) return errors(`EntityAlreadyExists: User with name ${n} already exists.`)
    y.users[n] = mkUser(n, {}, now)
    admin(y, now, 'iam', 'CreateUser', arnUser(n))
    return { name: n }
  })
export const createAccessKey = (state, user) =>
  edit(state, (s, y, now) => {
    const u = y.users[user]
    if (u.keys.length >= 2) return errors('LimitExceeded: Cannot exceed quota for AccessKeysPerUser: 2')
    const n = next(y)
    // lab-made key IDs: the real prefix AKIA, then _LAB_, so they never look like real access keys
    const key = { id: `AKIA_LAB_${String(n).padStart(7, '0')}`, secret: `lab-only/${hexOf(`key:${user}:${n}`, 24)}`, status: 'Active', created: now, lastUsed: null }
    u.keys.push(key)
    admin(y, now, 'iam', 'CreateAccessKey', u.arn, key.id)
    return { id: key.id, secret: key.secret }
  })
export const setAccessKeyStatus = (state, user, id, status) =>
  edit(state, (s, y, now) => {
    y.users[user].keys.find((k) => k.id === id).status = status
    admin(y, now, 'iam', 'UpdateAccessKey', arnUser(user), `${id} ${status}`)
    return {}
  })
export const deleteAccessKey = (state, user, id) =>
  edit(state, (s, y, now) => {
    const u = y.users[user]
    if (u.keys.find((k) => k.id === id)?.status === 'Active') return errors('Deactivate the access key before you delete it.')
    u.keys = u.keys.filter((k) => k.id !== id)
    admin(y, now, 'iam', 'DeleteAccessKey', u.arn, id)
    return {}
  })
const holderOf = (y, kind, name) => (kind === 'role' ? y.roles[name] : y.users[name])
export const putPolicy = (state, kind, name, policyName, text) =>
  edit(state, (s, y, now) => {
    const pn = word(policyName)
    if (!/^[\w+=,.@-]{1,128}$/.test(pn)) return errors('Enter a policy name: letters, numbers and + = , . @ _ -.')
    const e = policyErrors(text, 'identity')
    if (e.length) return errors(...e)
    const h = holderOf(y, kind, name)
    h.policies[pn] = policyText(readJson(text))
    admin(y, now, 'iam', kind === 'role' ? 'PutRolePolicy' : 'PutUserPolicy', h.arn, pn)
    return {}
  })
export const deletePolicy = (state, kind, name, policyName) =>
  edit(state, (s, y, now) => {
    const h = holderOf(y, kind, name)
    delete h.policies[policyName]
    admin(y, now, 'iam', kind === 'role' ? 'DeleteRolePolicy' : 'DeleteUserPolicy', h.arn, policyName)
    return {}
  })
export const attachManaged = (state, kind, name, policyName) =>
  edit(state, (s, y, now) => {
    const h = holderOf(y, kind, name)
    if (!MANAGED[policyName]) return errors('Choose a policy.')
    if (!h.managed.includes(policyName)) h.managed.push(policyName)
    admin(y, now, 'iam', kind === 'role' ? 'AttachRolePolicy' : 'AttachUserPolicy', h.arn, managedArn(policyName))
    return {}
  })
export const detachManaged = (state, kind, name, policyName) =>
  edit(state, (s, y, now) => {
    const h = holderOf(y, kind, name)
    h.managed = h.managed.filter((x) => x !== policyName)
    admin(y, now, 'iam', kind === 'role' ? 'DetachRolePolicy' : 'DetachUserPolicy', h.arn, managedArn(policyName))
    return {}
  })
export const createRole = (state, { name, trust, maxSession = 3600 }) =>
  edit(state, (s, y, now) => {
    const n = word(name)
    if (!/^[\w+=,.@-]{1,64}$/.test(n)) return errors('Role names can have up to 64 letters, numbers and the characters + = , . @ _ -.')
    if (y.roles[n]) return errors(`EntityAlreadyExists: Role with name ${n} already exists.`)
    const e = policyErrors(trust, 'trust')
    if (e.length) return errors(...e)
    const m = Number(maxSession)
    if (!Number.isInteger(m) || m < 3600 || m > 43200) return errors('Maximum session duration must be from 3600 to 43200 seconds.')
    y.roles[n] = mkRole(n, { trust: policyText(readJson(trust)), maxSession: m }, now)
    admin(y, now, 'iam', 'CreateRole', arnRole(n))
    return { name: n }
  })
export const setTrustPolicy = (state, role, text) =>
  edit(state, (s, y, now) => {
    const e = policyErrors(text, 'trust')
    if (e.length) return errors(...e)
    const doc = readJson(text)
    for (const st of list(doc.Statement)) for (const a of list(st.Principal?.AWS)) if (a !== '*' && a !== ACCOUNT && a !== ARN_ROOT && !Object.values(y.users).some((u) => u.arn === a) && !Object.values(y.roles).some((r) => r.arn === a)) return errors(`MalformedPolicyDocument: Invalid principal in policy: "AWS":"${a}"`)
    y.roles[role].trust = policyText(doc)
    admin(y, now, 'iam', 'UpdateAssumeRolePolicy', arnRole(role))
    return {}
  })
export const setMaxSession = (state, role, seconds) =>
  edit(state, (s, y, now) => {
    const m = Number(seconds)
    if (!Number.isInteger(m) || m < 3600 || m > 43200) return errors('Maximum session duration must be from 3600 to 43200 seconds.')
    y.roles[role].maxSession = m
    admin(y, now, 'iam', 'UpdateRole', arnRole(role), `MaxSessionDuration ${m}`)
    return {}
  })

// The IAM policy simulator. principal is 'user:NAME' or 'role:NAME'. It takes the bucket policy, queue policy, topic
// policy or key policy of the resource into account, as the simulator does when you include resource policies.
export function simulate(y, principal, action, resource, ctx = {}) {
  const [kind, name] = String(principal).split(':')
  const h = kind === 'role' ? y?.roles?.[name] : y?.users?.[name]
  if (!h) return { decision: 'implicitDeny', message: 'Choose a user or a role.' }
  const p = kind === 'role' ? { kind: 'role', role: name, name: 'simulation', arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${name}/simulation`, roleArn: h.arn } : { kind: 'user', user: name, arn: h.arn }
  const a = word(action)
  const r = word(resource) || '*'
  if (a.startsWith('kms:')) {
    const key = Object.values(y.keys).find((k) => k.arn === r || glob(r, k.arn))
    return decide(y, p, a, key?.arn ?? r, { resourceDoc: key ? readJson(key.policy) : null, resourceName: 'key policy', mode: 'kms', ctx })
  }
  if (a.toLowerCase() === 'sts:assumerole') {
    const role = Object.values(y.roles).find((x) => x.arn === r)
    return decide(y, p, a, r, { resourceDoc: role ? readJson(role.trust) : null, resourceName: 'trust policy', mode: 'trust', ctx })
  }
  const bucket = r.startsWith('arn:aws:s3:::') ? y.buckets[r.slice(13).split('/')[0]] : null
  const queue = r.startsWith('arn:aws:sqs:') ? queueOf(y, r) : null
  const topic = r.startsWith('arn:aws:sns:') ? topicOf(y, r) : null
  const doc = bucket?.policy || queue?.policy || topic?.policy
  return decide(y, p, a, r, { resourceDoc: readJson(doc), resourceName: bucket ? 'bucket policy' : queue ? 'queue policy' : 'topic policy', ctx })
}
export const allowed = (y, principal, action, resource, ctx) => simulate(y, principal, action, resource, ctx).decision === 'allowed'
