// Settings a box on the Architecture Designer can have: how an API is deployed and protected, how a queue keeps its
// messages, how long a cache keeps an answer. They are what the architecture simulator (arch/sim.js) runs on.
// The systems of record (SAP, Salesforce, a carrier API) are given by the scenario, so they have no settings here.
// A field is { key, label, type: 'number' | 'select', options?, default, help? }.

const num = (key, label, value, help) => ({ key, label, type: 'number', default: value, help })
const select = (key, label, options, value = options[0], help) => ({ key, label, type: 'select', options, default: value, help })

const DEPLOY = [
  num('replicas', 'Replicas', 1, 'Copies of the app. CloudHub 2.0 spreads them over availability zones, so one zone going down leaves the others.'),
  select('vCores', 'vCores per replica', ['0.1', '0.2', '0.5', '1', '2', '4'], '0.1', 'In this model one vCore serves about 500 simple requests a second.'),
  select('regions', 'Regions', ['1', '2'], '1', '2 runs a copy in a second region (active-active), so a region outage leaves half the capacity.'),
]

const CALLS = [
  num('timeoutMs', 'Timeout for its calls (ms)', 10000, 'A call that takes longer fails. While it waits, a thread is held.'),
  num('retries', 'Retries on a failed call', 0, 'Helps with short or partial failures, not with a system that is down.'),
  select('circuitBreaker', 'Circuit breaker', ['off', 'on'], 'off', 'When most calls to a system fail, fail at once instead of waiting for the timeout.'),
  select('onFailure', 'When a call it makes fails', ['fail', 'partial answer'], 'fail', 'partial answer: answer without that data, for example with the order but no tracking.'),
  select('calls', 'Calls to several systems', ['one after another', 'in parallel'], 'one after another', 'In parallel (Scatter-Gather) the slowest call sets the time, not the sum.'),
]

const POLICIES = [
  select('auth', 'Client authentication policy', ['none', 'client-id', 'jwt', 'oauth2', 'mtls'], 'none', 'oauth2 checks each token with the identity provider; jwt checks the signature locally.'),
  num('rateLimit', 'Rate limit (requests a second, 0 = none)', 0, 'Requests over the limit get 429 Too Many Requests.'),
]

const API = [...DEPLOY, ...POLICIES, ...CALLS]
const MESSAGES = [
  select('persistent', 'Persistent messages', ['yes', 'no'], 'yes', 'A non-persistent queue loses what it holds when the broker restarts.'),
  num('maxRedelivery', 'Deliveries before the DLQ (0 = no limit)', 0, 'After this many failed deliveries a message goes to the dead-letter queue drawn from this one, or is dropped if there is none.'),
]

export const ARCH_SETTINGS = {
  'experience-api': API,
  'process-api': API,
  'system-api': API,
  'batch-job': [...DEPLOY, ...CALLS],
  'api-gateway': POLICIES,
  queue: MESSAGES,
  topic: MESSAGES,
  'cloud-queue': MESSAGES,
  'event-stream': [select('persistent', 'Keeps events (retention)', ['yes', 'no'], 'yes'), MESSAGES[1]],
  'load-balancer': [
    select('mode', 'Sends each request to', ['spread', 'failover'], 'spread', 'spread: shares requests between the healthy boxes behind it. failover: sends all to the first one connected, and to the next only when it is down (active/passive, such as DNS failover).'),
  ],
  cache: [num('ttlSec', 'Time to live (seconds)', 300, 'How long an answer is kept. Longer saves more calls, but the data can be older.')],
}

export const settingsOf = (type) => ARCH_SETTINGS[type] ?? []

// A node's settings with the defaults filled in.
export function configOf(node) {
  const out = {}
  for (const f of settingsOf(node.type)) out[f.key] = node.config?.[f.key] ?? f.default
  return out
}

// A short line for the box, such as "2 × 0.5 vCore · JWT · ≤ 20/s", showing only what differs from the defaults.
export function settingsBadge(node) {
  const c = configOf(node)
  const has = (k) => node.config && node.config[k] !== undefined && node.config[k] !== '' && String(node.config[k]) !== String(settingsOf(node.type).find((f) => f.key === k)?.default)
  const parts = []
  if (has('replicas') || has('vCores')) parts.push(`${c.replicas} × ${c.vCores} vCore`)
  if (has('regions')) parts.push(`${c.regions} regions`)
  if (has('auth')) parts.push(String(c.auth).toUpperCase())
  if (has('rateLimit') && Number(c.rateLimit) > 0) parts.push(`≤ ${c.rateLimit}/s`)
  if (has('timeoutMs')) parts.push(`timeout ${c.timeoutMs} ms`)
  if (has('retries') && Number(c.retries) > 0) parts.push(`${c.retries} retries`)
  if (has('circuitBreaker') && c.circuitBreaker === 'on') parts.push('breaker')
  if (has('onFailure') && c.onFailure !== 'fail') parts.push('partial')
  if (has('calls') && c.calls === 'in parallel') parts.push('parallel')
  if (has('persistent') && c.persistent === 'no') parts.push('not persistent')
  if (has('maxRedelivery') && Number(c.maxRedelivery) > 0) parts.push(`DLQ after ${c.maxRedelivery}`)
  if (has('ttlSec')) parts.push(`TTL ${c.ttlSec} s`)
  if (has('mode')) parts.push(String(c.mode))
  return parts.join(' · ')
}
