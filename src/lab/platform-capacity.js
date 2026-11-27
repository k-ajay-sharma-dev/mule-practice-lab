// CloudHub 2.0 capacity: replica sizes, a lab-made throughput model and the load test of the capacity planner.
// Pure and import free, so a package of a lab can use it. Source of the sizes: docs.mulesoft.com/cloudhub-2/ch2-architecture.

const MINUTE = 60000

// The replica sizes of CloudHub 2.0: total memory and heap in MB, storage in GB
export const SIZES = [
  { vCores: 0.1, memory: 1400, heap: 480, storage: 8 },
  { vCores: 0.2, memory: 2000, heap: 1000, storage: 8 },
  { vCores: 0.5, memory: 2600, heap: 1300, storage: 10 },
  { vCores: 1, memory: 4000, heap: 2000, storage: 12 },
  { vCores: 1.5, memory: 6000, heap: 3000, storage: 20 },
  { vCores: 2, memory: 8000, heap: 4000, storage: 20 },
  { vCores: 2.5, memory: 9500, heap: 4750, storage: 20 },
  { vCores: 3, memory: 11000, heap: 5500, storage: 20 },
  { vCores: 3.5, memory: 13000, heap: 6500, storage: 20 },
  { vCores: 4, memory: 15000, heap: 7500, storage: 20 },
]
export const sizeOf = (vCores) => SIZES.find((x) => x.vCores === Number(vCores)) ?? SIZES[0]
export const gb = (mb) => `${Math.round(mb / 100) / 10} GB`
export const MAX_REPLICAS = 8

// Lab-made CPU time of one request on one full vCore, by the kind of application. Measure your own with a load test.
export const APP_TYPES = [
  { id: 'proxy', name: 'API proxy or pass through', ms: 6 },
  { id: 'api', name: 'API with a DataWeave mapping', ms: 30 },
  { id: 'heavy', name: 'Heavy transformation, XML or large JSON', ms: 90 },
  { id: 'file', name: 'File or batch record processing', ms: 200 },
]
// lab-made: parsing and writing the payload costs CPU too, per KB of request and response
export const PAYLOAD_MS_PER_KB = 0.4
// lab-made: the time a request waits for the system it calls, which takes no CPU of the replica
export const WAIT_MS = 60
// the idle CPU of a Mule runtime with no traffic
export const IDLE_CPU = 4
// the targets of the planner: peak CPU under 70 percent, and with one replica down under 90 percent
export const CPU_TARGET = 70
export const N1_LIMIT = 90
// requests the Mule HTTP listener queues before backpressure gives 503 (lab-made), and the client timeout
export const TIMEOUT_MS = 30000

export const costMs = (requestMs, payloadKb) => Number(requestMs) + Number(payloadKb) * PAYLOAD_MS_PER_KB
// what one replica of this size serves at 100 percent CPU, in requests a minute
export const perReplica = (vCores, requestMs, payloadKb) => (Number(vCores) * MINUTE) / Math.max(0.1, costMs(requestMs, payloadKb))

// The load of `replicas` replicas of `vCores` each at `perMinute` requests a minute. The ingress spreads requests round
// robin, so each replica gets the same share. u is the share of the CPU capacity the load needs.
export function loadOf({ replicas, vCores, perMinute, requestMs, payloadKb }) {
  const n = Math.max(0, Number(replicas) || 0)
  if (n === 0) return { u: Infinity, cpu: 100, p50: TIMEOUT_MS, p95: TIMEOUT_MS, reject: 1, heap: 0, heapPct: 0 }
  const cap = n * perReplica(vCores, requestMs, payloadKb)
  const u = Number(perMinute) / cap
  const cpu = Math.min(100, Math.round(IDLE_CPU + Math.min(1, u) * (100 - IDLE_CPU)))
  const base = costMs(requestMs, payloadKb) / Math.min(1, Number(vCores)) + WAIT_MS
  // lab-made queueing: the response time grows fast as the load comes near the capacity
  const wait = u < 0.97 ? (u * u) / (1 - u) : 30
  const p50 = Math.min(TIMEOUT_MS, Math.round(base * (1 + wait * 0.6)))
  const p95 = Math.min(TIMEOUT_MS, Math.round(base * (1 + wait * 2)))
  // above the capacity the listener applies backpressure: the requests it cannot take get 503
  const reject = u > 1 ? 1 - 1 / u : 0
  // lab-made heap: the runtime itself, and the payloads of the requests in flight on one replica
  const inFlight = ((Number(perMinute) / n / MINUTE) * Math.min(p95, TIMEOUT_MS)) * (1 - reject)
  const heap = Math.round(320 + inFlight * Number(payloadKb) * 0.02)
  const heapPct = Math.min(100, Math.round((heap / sizeOf(vCores).heap) * 100))
  return { u, cpu, p50, p95, reject, heap, heapPct }
}

// Every option within the budget, the cheapest that meets the targets first
export function planOptions({ perMinute, requestMs, payloadKb, budget }) {
  const out = []
  for (const size of SIZES)
    for (let r = 1; r <= MAX_REPLICAS; r++) {
      const cost = Math.round(r * size.vCores * 10) / 10
      if (cost > Number(budget)) continue
      const peak = loadOf({ replicas: r, vCores: size.vCores, perMinute, requestMs, payloadKb })
      const down = loadOf({ replicas: r - 1, vCores: size.vCores, perMinute, requestMs, payloadKb })
      const n1 = r >= 2 && down.cpu < N1_LIMIT && down.reject === 0
      out.push({ replicas: r, vCores: size.vCores, cost, peak, down, headroom: 100 - peak.cpu, n1, fits: peak.cpu < CPU_TARGET && n1 })
    }
  return out.sort((a, b) => b.fits - a.fits || a.cost - b.cost || a.peak.cpu - b.peak.cpu)
}

// The replicas of one application, the way CloudHub 2.0 names its pods: one base name and a suffix per replica
const SUFFIX = ['x2k9p', 'm7q4t', 'c3w8z', 'h5n2v', 'r9d6s', 'f4j7b', 'w2p8k', 'z6t3m']
export const replicaIds = (base, replicas) => Array.from({ length: Math.max(1, replicas) }, (_, i) => base.replace(/x2k9p$/, SUFFIX[i % SUFFIX.length]))

// Load test: sends `perMinute` requests a minute to one application for `minutes` lab minutes and keeps the result.
// `advance` is the engine's, passed in so this file stays free of imports. In the lab one test call stands for
// `sample` real requests, so the event list stays small; the package of the application reads the same sample.
export const LOAD_CLIENT = 'Load test'
// the real requests a minute of the steady traffic of an application
export const steadyOf = (state, app, env = state.env) => state.traffic.filter((x) => x.app === app && x.env === env && !x.loadTest).reduce((n, x) => n + x.perMinute * (x.sample ?? 1), 0)
export function runLoadTest(state, { app, env = state.env, path = '/', method = 'GET', perMinute, minutes = 10, sample = 1 }, advance) {
  // the steady traffic keeps running, so the test sends what it lacks to reach the peak
  const steady = steadyOf(state, app, env)
  const flow = { app, env, path, method, perMinute: Math.max(1, Math.round((perMinute - steady) / sample)), sample, client: LOAD_CLIENT, loadTest: true }
  const from = state.clock
  let s = advance({ ...state, traffic: [...state.traffic, flow] }, minutes * MINUTE)
  // the calls of the test carry its client name, so the steady traffic of the lab is not counted
  const own = s.events.filter((e) => e.k === 'in' && e.app === app && e.env === env && e.t > from && e.c === LOAD_CLIENT)
  const ms = own.map((e) => e.ms).sort((a, b) => a - b)
  const target = s.apps.find((a) => a.name === app && a.env === env)
  const result = {
    app,
    env,
    t: from,
    end: s.clock,
    perMinute: Number(perMinute),
    minutes,
    config: target?.config,
    replicas: target?.replicas,
    vCores: target?.vCores,
    sent: own.length * sample,
    rejected: own.filter((e) => e.s === 503).length * sample,
    failed: own.filter((e) => e.s >= 500).length * sample,
    p50: ms.length ? ms[Math.floor(ms.length * 0.5)] : 0,
    p95: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : 0,
  }
  s = { ...s, traffic: s.traffic.filter((x) => !x.loadTest), capacity: { ...s.capacity, tests: [...(s.capacity?.tests ?? []), result].slice(-6) } }
  return s
}
export const testsOf = (s, app, env = s.env) => (s.capacity?.tests ?? []).filter((t) => t.app === app && t.env === env)
