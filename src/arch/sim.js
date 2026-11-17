// The architecture simulator: runs traffic and incidents through a diagram, a minute at a time, and reports what the
// users would see (answers, refusals, time), what each box carries, what queues hold, and what it costs.
//
// It is a model, not a benchmark. The rules, in the words the Run tab uses:
// - A request starts at its channel and goes along the lines towards the systems it needs (`to`). Each box calls the
//   next boxes on that route once per request. A line into a queue, topic or event stream is a publish: the caller is
//   done once the broker has the message, and the message goes on when a consumer takes it.
// - An API replica serves vCores × 500 requests a second, and holds one of its threads (128, and 256 more per vCore)
//   for as long as a request takes, so slow calls use up the threads. Over capacity, the extra requests fail with 503. Above 70% busy, a box
//   gets slower.
// - A rate limit answers 429 to what is over it. An authentication policy on a box the outside world calls refuses
//   requests without the right credential. oauth2 asks the identity provider about each token; jwt does not.
// - A call slower than the caller's timeout fails, and holds the thread until then. With a circuit breaker on, calls to
//   a failing system fail at once. Retries help with partial failures. A partial answer leaves out a failed call.
// - A cache on a box that reads answers the share the scenario gives (hit ratio), so fewer calls go further.
// - A consumer takes messages as fast as its own spare capacity and the tightest box on its route allow. A delivery
//   that fails is tried again the next minute; after Deliveries before the DLQ it moves to the dead-letter queue drawn
//   from the queue, or is dropped if there is none.
//
// - A request takes the direct way to its target when there is one, and goes through a broker only when it must.
//   A load balancer or gateway sends each request to one box behind it: a load balancer shares them between the
//   boxes that are up (or, in failover mode, uses the first one), and traffic can name its API with `via`.
// - Poison messages (a share of a flow, `poison`) fail at every delivery. A message never goes back into a queue it
//   has already passed, so a loop in the drawing ends. A DLQ counts when drawn from the queue or from its consumer.
//
// simulateArch(diagram, simulation, test) → { duration, flows, nodes, queues, lost, vCores, notes }
import { NODE_TYPES } from './catalog.js'
import { matches } from './checks.js'
import { configOf } from './settings.js'

export const API_TYPES = new Set(['experience-api', 'process-api', 'system-api', 'batch-job'])
const laneOf = (n) => NODE_TYPES[n?.type]?.lane
export const isMessaging = (n) => laneOf(n) === 'messaging' && n.type !== 'dlq'
const SHARED = new Set(['queue', 'cloud-queue']) // consumers compete; a topic or stream gives each consumer a copy
const OWN_MS = { 'api-gateway': 5, 'load-balancer': 2, cache: 2, 'identity-provider': 40, queue: 15, topic: 15, 'event-stream': 10, 'cloud-queue': 20, dlq: 15 }
const API_MS = 20
const THREADS = 128
const THREADS_PER_VCORE = 256 // the I/O pool grows with the cores
const PER_VCORE = 500
const DOWN_MS = 3

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const round = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

export function simulateArch(diagram, simulation = {}, test = {}) {
  const nodes = diagram?.nodes ?? []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = (diagram?.edges ?? []).filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to)
  const outs = new Map(nodes.map((n) => [n.id, edges.filter((e) => e.from === n.id)]))
  const out = (id) => outs.get(id) ?? []
  const cfg = new Map(nodes.map((n) => [n.id, configOf(n)]))
  const duration = Math.max(1, Math.min(240, Number(test.durationMin) || 10))
  const notes = []

  // ---------- what the scenario says about each box ----------
  const sys = new Map(nodes.map((n) => [n.id, (simulation.systems ?? []).find((s) => matches(n, s.match)) ?? {}]))
  const hitRatio = (cacheNode) => {
    const base = sys.get(cacheNode.id).hitRatio ?? simulation.cache?.hitRatio ?? 0.8
    const at = simulation.cache?.atTtlSec ?? 300
    const ttl = Number(cfg.get(cacheNode.id).ttlSec) || 0
    return ttl <= 0 ? 0 : Math.min(0.99, base * Math.min(1, ttl / at))
  }
  const idp = nodes.find((n) => n.type === 'identity-provider')

  // ---------- traffic ----------
  const flows = asList(test.traffic).map((t, i) => {
    const entries = nodes.filter((n) => matches(n, t.from))
    const targets = asList(t.to)
    const name = t.name ?? `${describe(t.from)}${targets.length ? ` to ${targets.map(describe).join(' and ')}` : ''}`
    return { ...t, i, name, entries, targets, kind: t.kind ?? 'read', auth: t.auth ?? 'valid' }
  })
  for (const f of flows) if (!f.entries.length) notes.push(`Your design has no ${describe(f.from)}, so "${f.name}" has nowhere to start.`)

  // which boxes can reach which: a box is on a flow's route when it can reach one of the flow's targets.
  // A direct reach stops at brokers: the boxes a request reaches without a queue, topic or stream in between.
  const reachCache = new Map()
  const reachFrom = (id, direct = false) => {
    const key = `${id}|${direct}`
    if (!reachCache.has(key)) {
      const seen = new Set([id])
      const q = [id]
      while (q.length) {
        const at = q.shift()
        if (direct && at !== id && isMessaging(byId.get(at))) continue
        for (const e of out(at)) if (!seen.has(e.to)) seen.add(e.to), q.push(e.to)
      }
      reachCache.set(key, seen)
    }
    return reachCache.get(key)
  }
  const reaches = (id, target, direct = false) => [...reachFrom(id, direct)].some((x) => matches(byId.get(x), target) && !(direct && x !== id && isMessaging(byId.get(x)) && !matches(byId.get(x), target)))
  const onRoute = (id, f) => !f.targets.length || f.targets.some((t) => reaches(id, t))
  const ROUTERS = new Set(['load-balancer', 'api-gateway'])
  // The lines a box uses for a request: for each target, the lines that reach it directly if there are any, else the
  // lines that reach it through a broker. A load balancer or gateway sends each request down one of them (see visit).
  // A line into a broker is never direct (the message waits there), and of several lines to the same target a request
  // takes the shortest: one request goes one way, it is not sent down two routes to the same system.
  const hopsCache = new Map()
  const hopsTo = (start, t, direct) => {
    const key = `${start}|${direct}|${JSON.stringify(t)}`
    if (!hopsCache.has(key)) {
      let level = [start]
      const seen = new Set(level)
      let found = Infinity
      for (let d = 0; d < 12 && level.length; d++) {
        if (level.some((x) => matches(byId.get(x), t))) {
          found = d
          break
        }
        level = level
          .filter((x) => !(direct && isMessaging(byId.get(x))))
          .flatMap((x) => out(x).map((e) => e.to))
          .filter((x) => !seen.has(x) && seen.add(x))
      }
      hopsCache.set(key, found)
    }
    return hopsCache.get(key)
  }
  const routeLines = (id, f, path) => {
    const lines = out(id).filter((e) => !path.has(e.to) || (ROUTERS.has(byId.get(e.to).type) && path.get(e.to) < 2))
    if (!f.targets.length) return lines
    const chosen = new Set()
    for (const t of f.targets) {
      // a queue the box consumes itself stays beside its direct calls (see visit: it keeps what they could not finish)
      for (const e of lines) if (isMessaging(byId.get(e.to)) && consumersOf(e.to).some((c) => c.id === id) && reaches(e.to, t)) chosen.add(e)
      const isDirect = (e) => matches(byId.get(e.to), t) || (!isMessaging(byId.get(e.to)) && reaches(e.to, t, true))
      const direct = lines.filter(isDirect)
      const list = direct.length ? direct : lines.filter((e) => reaches(e.to, t))
      // a load balancer or gateway picks one box behind it itself (see visit), so it keeps all its lines
      if (ROUTERS.has(byId.get(id).type) || list.length < 2) {
        for (const e of list) chosen.add(e)
        continue
      }
      const dist = list.map((e) => hopsTo(e.to, t, direct.length > 0))
      const best = Math.min(...dist)
      list.forEach((e, i) => dist[i] === best && chosen.add(e))
    }
    return lines.filter((e) => chosen.has(e))
  }

  // ---------- incidents ----------
  const incidents = asList(test.incidents)
  const activeAt = (inc, m) => m >= (inc.at ?? 0) && m < (inc.at ?? 0) + (inc.forMin ?? duration)
  function stateAt(m) {
    const st = { down: new Set(), hang: new Set(), slow: new Map(), errors: new Map(), share: new Map(), restart: new Set() }
    const scale = (id, f) => st.share.set(id, (st.share.get(id) ?? 1) * f)
    for (const inc of incidents) {
      if (!activeAt(inc, m)) continue
      for (const n of nodes) {
        if (inc.down && matches(n, inc.down)) st.down.add(n.id)
        if (inc.hang && matches(n, inc.hang)) st.hang.add(n.id)
        if (inc.slow && matches(n, inc.slow)) st.slow.set(n.id, Number(inc.latencyMs) || 5000)
        if (inc.errors && matches(n, inc.errors)) st.errors.set(n.id, Math.min(1, Number(inc.rate) || 0.5))
        if (inc.restart && matches(n, inc.restart) && m === (inc.at ?? 0)) st.restart.add(n.id)
        const c = cfg.get(n.id)
        if (inc.zone && API_TYPES.has(n.type)) {
          const r = Math.max(1, Number(c.replicas) || 1)
          scale(n.id, (r - 1) / r)
        }
        if (inc.region && inc.region !== true) {
          // one named region: the boxes in it (by label) stop; a box deployed to 2 regions loses half
          if (matches(n, inc.region)) scale(n.id, API_TYPES.has(n.type) && Number(c.regions) >= 2 ? 0.5 : 0)
        } else if (inc.region) {
          if (API_TYPES.has(n.type)) scale(n.id, Number(c.regions) >= 2 ? 0.5 : 0)
          else if (sys.get(n.id).regions === 1) scale(n.id, 0)
        }
      }
    }
    for (const [id, f] of st.share) if (f <= 0) st.down.add(id)
    return st
  }

  // ---------- one box's own time and capacity ----------
  const ownMs = (n, st) => {
    if (laneOf(n) === 'consumers') return 0
    // an API's own work, plus what the scenario gives it (an AI agent thinking, a heavy transform)
    if (API_TYPES.has(n.type)) return API_MS + (st.slow.get(n.id) ?? sys.get(n.id).latencyMs ?? 0)
    return st.slow.get(n.id) ?? sys.get(n.id).latencyMs ?? OWN_MS[n.type] ?? 100
  }
  const capacityOf = (n, st, heldMs, why) => {
    const share = st.share.get(n.id) ?? 1
    if (API_TYPES.has(n.type)) {
      const c = cfg.get(n.id)
      const up = Math.max(1, Number(c.replicas) || 1) * (Number(c.regions) || 1) * share
      const cpu = up * (Number(c.vCores) || 0.1) * PER_VCORE
      const threads = (up * (THREADS + THREADS_PER_VCORE * (Number(c.vCores) || 0.1)) * 1000) / Math.max(API_MS, heldMs || API_MS)
      if (why) why.threads = threads < cpu
      return Math.min(cpu, threads)
    }
    const max = sys.get(n.id).maxRps
    return max !== undefined ? max * share : Infinity
  }
  const slowdown = (u) => 1 + Math.max(0, Math.min(1, u) - 0.7) / 0.3 // twice as slow when fully busy

  // ---------- what is recorded ----------
  const flowStats = flows.map(() => ({ offered: 0, ok: 0, refused: 0, limited: 0, degraded: 0, msWeighted: 0, maxMs: 0, reasons: {}, byMinute: [] }))
  const nodeStats = new Map(nodes.map((n) => [n.id, { peakRps: 0, sumRps: 0, peakUtil: 0, down: false, arrived: 0, served: 0 }]))
  const flowAt = new Map() // `${flow}|${node}` → { arrived, served } in requests
  const atNode = (fi, id) => {
    const k = `${fi}|${id}`
    if (!flowAt.has(k)) flowAt.set(k, { arrived: 0, served: 0 })
    return flowAt.get(k)
  }
  // a consumer delivery is tallied apart first, so a retried message counts once (see the consumers below)
  const recAt = (ctx, f, id) => {
    if (!ctx.tally) return atNode(f.i, id)
    if (!ctx.tally.has(id)) ctx.tally.set(id, { arrived: 0, served: 0 })
    return ctx.tally.get(id)
  }
  // a messaging box holds lanes of waiting messages: one shared lane for a queue, one per consumer for a topic
  const queues = new Map(nodes.filter(isMessaging).map((n) => [n.id, { lanes: new Map(), peak: 0, dlq: 0, lost: 0, delivered: 0, byMinute: [] }]))
  const waiting = (q) => Math.max(0, ...[...q.lanes.values()].map((bs) => sum(bs.map((b) => b.count))))
  const consumersOf = (qid) => out(qid).map((e) => byId.get(e.to)).filter((c) => !isMessaging(c) && c.type !== 'dlq')

  let admit = new Map() // node → share let in (after the rate limit and capacity), from the pass before
  let limitedShare = new Map()
  let held = new Map() // node → ms a thread is held, from the pass before
  let util = new Map() // node → how busy it was, from the pass before
  let threadBound = new Set() // boxes whose threads, not their CPU, ran out

  for (let m = 0; m < duration; m++) {
    const st = stateAt(m)
    // a broker restart drops what a non-persistent queue holds
    for (const id of st.restart) {
      const q = queues.get(id)
      if (!q || cfg.get(id).persistent !== 'no') continue
      const n = sum([...q.lanes.values()].flatMap((bs) => bs.map((b) => b.count)))
      q.lost += n
      q.lanes.clear()
      if (n) notes.push(`Minute ${m}: the broker restarted and ${describeNode(byId.get(id))} lost ${round(n)} messages that were not persistent.`)
    }

    // the requests from the channels: several passes, each using the load and held time of the pass before. What a
    // box let in carries over from the minute before, and each pass moves halfway to the new value, so a rate limit
    // behind a busy box settles instead of swinging.
    let final = null
    const PASSES = m === 0 ? 12 : 5 // the first minute starts cold, so it settles for longer
    for (let pass = 0; pass < PASSES; pass++) {
      const ctx = { load: new Map(), limitLoad: new Map(), heldNow: new Map(), published: [], st, first: m === 0 && pass === 0, record: pass === PASSES - 1, m }
      const outcomes = flows.map((f) => {
        const rate = rateAt(f, m)
        if (!rate || !f.entries.length) return { rate, results: [] }
        const per = rate / f.entries.length
        return { rate, results: f.entries.map((e) => ({ ...visit(e.id, per, f, new Map(), ctx, true), rate: per })) }
      })
      const nextAdmit = new Map()
      const nextLimited = new Map()
      const nextUtil = new Map()
      const nextThreads = new Set()
      const blend = (map, id, v) => (ctx.first || !map.has(id) ? v : (map.get(id) + v) / 2)
      for (const n of nodes) {
        const offered = ctx.load.get(n.id) ?? 0
        // requests refused for their credentials do not count towards the rate limit
        const counted = ctx.limitLoad.get(n.id) ?? 0
        const limit = Number(cfg.get(n.id).rateLimit) || 0
        const byLimit = limit > 0 && counted > limit ? limit / counted : 1
        const why = {}
        const cap = capacityOf(n, st, ctx.heldNow.get(n.id) ?? held.get(n.id), why)
        const let_ = offered * byLimit
        if (why.threads && let_ > cap) nextThreads.add(n.id)
        // a rate limit acts at once; the capacity share moves halfway each pass
        const prevLimit = 1 - (limitedShare.get(n.id) ?? 0)
        const prevCap = prevLimit > 0 && admit.has(n.id) ? admit.get(n.id) / prevLimit : 1
        const capShare = ctx.first || !admit.has(n.id) ? (let_ > cap ? cap / let_ : 1) : (prevCap + (let_ > cap ? cap / let_ : 1)) / 2
        nextAdmit.set(n.id, byLimit * capShare)
        nextLimited.set(n.id, 1 - byLimit)
        nextUtil.set(n.id, Number.isFinite(cap) && cap > 0 ? let_ / cap : 0)
      }
      admit = nextAdmit
      limitedShare = nextLimited
      util = nextUtil
      threadBound = nextThreads
      held = new Map([...held, ...ctx.heldNow])
      final = { ctx, outcomes }
    }

    // what the users saw this minute
    final.outcomes.forEach((o, i) => {
      const fs = flowStats[i]
      let okRate = 0
      for (const r of o.results) {
        const req = r.rate * 60
        fs.offered += req
        fs.ok += req * r.s
        fs.refused += req * r.refused
        fs.limited += req * r.limited
        fs.degraded += req * r.degraded
        if (r.s > 0) {
          fs.msWeighted += req * r.s * r.ms
          fs.maxMs = Math.max(fs.maxMs, r.ms)
        }
        if (r.reason && r.s < 0.999) fs.reasons[r.reason] = (fs.reasons[r.reason] ?? 0) + req * (1 - r.s)
        okRate += r.s * r.rate
      }
      fs.byMinute.push(o.rate ? round(okRate / o.rate, 3) : null)
    })

    // messages published this minute join their queues, then the consumers take what they can
    // a share of a flow's messages can be poison: they fail at every consumer, every time
    for (const p of final.ctx.published) {
      const poison = Math.min(1, Math.max(0, Number(flows[p.flow].poison) || 0))
      enqueue(p.queue, p.count * (1 - poison), p.flow, 0, new Set(p.seen))
      if (poison) enqueue(p.queue, p.count * poison, p.flow, 0, new Set(p.seen), true)
    }
    const consumerLoad = new Map()
    for (const [qid, q] of queues) {
      for (const [lane, buckets] of q.lanes) {
        const group = lane === '*' ? consumersOf(qid) : consumersOf(qid).filter((c) => c.id === lane)
        let left = buckets
        for (const c of group) {
          if (st.down.has(c.id) || st.hang.has(c.id)) continue
          const used = (final.ctx.load.get(c.id) ?? 0) + (consumerLoad.get(c.id) ?? 0)
          let room = Math.max(0, capacityOf(c, st, held.get(c.id)) - used) * 60
          const next = []
          for (const b of left) {
            const f = flows[b.flow]
            // on a shared queue the consumers compete for every message, whatever it holds (Anypoint MQ has no
            // selectors): a consumer meant for other records takes these too, and that is the design's mistake
            const take = Math.min(b.count, room, routeRoom(c.id, f, st, final.ctx.load, consumerLoad) * 60)
            if (!(take > 0)) {
              next.push(b)
              continue
            }
            room -= take
            // the message remembers the queues it passed, so a loop in the drawing does not send it round forever
            const seen = [...(b.seen ?? []), qid]
            // a poison message fails where its content is processed: at the consumer that delivers it to the target.
            // A consumer that only passes it on to another queue passes the poison on too.
            // (a consumer off the route reads the content too, so it fails there as well)
            const relays = f.targets.length > 0 && !f.targets.some((t) => reaches(c.id, t, true)) && f.targets.some((t) => reaches(c.id, t))
            const processes = !relays
            const tally = new Map()
            const cctx = { load: new Map(), limitLoad: new Map(), heldNow: new Map(), published: [], st, first: false, record: true, tally, m, consumer: true, seen, poisonAt: b.poison && processes ? c.id : null }
            const r = visit(c.id, take / 60, f, new Map(seen.map((x) => [x, 1])), cctx, false)
            for (const [id, v] of cctx.load) consumerLoad.set(id, (consumerLoad.get(id) ?? 0) + v)
            for (const p of cctx.published) enqueue(p.queue, p.count, p.flow, 0, new Set(p.seen), b.poison && !processes)
            const done = take * r.s
            q.delivered += done
            const failed = take - done
            const max = Number(cfg.get(qid).maxRedelivery) || 0
            const lastTry = max > 0 && b.attempt + 1 >= max
            // a message is counted at each box once: on the try that got through, or on its last try. A delivery
            // that will be tried again does not count yet, so retries do not add up to more than was sent.
            for (const [id, v] of tally) {
              const at = atNode(f.i, id)
              at.arrived += v.arrived
              at.served += lastTry ? v.served : Math.min(v.served, done)
            }
            if (failed > 0) {
              if (lastTry) {
                // the dead-letter queue is drawn from the queue, or from the consumer that gives up on the message
                const dlq = (id) => out(id).some((e) => byId.get(e.to).type === 'dlq')
                if (dlq(qid) || dlq(c.id)) q.dlq += failed
                else q.lost += failed
              } else next.push({ ...b, count: failed, attempt: b.attempt + 1 })
            }
            if (b.count - take > 0) next.push({ ...b, count: b.count - take })
          }
          left = next
        }
        q.lanes.set(lane, merge(left))
      }
      const w = waiting(q)
      q.peak = Math.max(q.peak, w)
      q.byMinute.push(round(w))
    }

    // how busy each box was this minute
    for (const n of nodes) {
      const ns = nodeStats.get(n.id)
      // a box that is down serves nothing, so what is sent to it while it is down is not its load
      const rps = st.down.has(n.id) ? 0 : (final.ctx.load.get(n.id) ?? 0) + (consumerLoad.get(n.id) ?? 0)
      ns.peakRps = Math.max(ns.peakRps, rps)
      ns.sumRps += rps
      const cap = capacityOf(n, st, held.get(n.id))
      if (Number.isFinite(cap) && cap > 0) ns.peakUtil = Math.max(ns.peakUtil, rps / cap)
      if (st.down.has(n.id) || st.hang.has(n.id)) ns.down = true
    }
  }

  // ---------- one request at one box ----------
  // Returns shares of the requests that reach it: s (answered), refused (credentials), limited (429), degraded (a
  // partial answer), published (answered once a broker had the message), and ms for an answered one.
  function visit(id, rate, f, path, ctx, outside) {
    const n = byId.get(id)
    const c = cfg.get(id)
    const st = ctx.st
    // where the traffic starts (a channel, or a system that sends events) it only sends: it is not held back by its
    // own limits, its own time is not part of the answer, and sending does not count as load on it
    const source = path.size === 0 && !API_TYPES.has(n.type) && !ROUTERS.has(n.type)
    if (!source) ctx.load.set(id, (ctx.load.get(id) ?? 0) + rate)
    const rec = ctx.record ? recAt(ctx, f, id) : null
    if (rec) rec.arrived += rate * 60
    const done = (r) => {
      if (rec) rec.served += rate * 60 * r.s
      return r
    }
    // a box already on this request's path: only a load balancer or gateway is passed twice (a hairpin)
    if (path.has(id) && !(ROUTERS.has(n.type) && path.get(id) < 2)) return done(result(1, 0))
    const here = new Map(path).set(id, (path.get(id) ?? 0) + 1)

    if (st.down.has(id)) return done(failed(`${describeNode(n)} is down`, DOWN_MS))
    if (st.hang.has(id)) return done(failed(`${describeNode(n)} does not answer`, Infinity))
    if (ctx.poisonAt === id) return done(failed(`${describeNode(n)} could not process a poison message`, ownMs(n, st)))

    // credentials are checked where the outside world comes in
    if (outside && c.auth && c.auth !== 'none') {
      if (!(f.auth === 'valid' || f.auth === c.auth)) return done({ ...failed(`${describeNode(n)} refused the request (${c.auth} policy)`, 5), refused: 1 })
      if (c.auth === 'oauth2' && idp) {
        ctx.load.set(idp.id, (ctx.load.get(idp.id) ?? 0) + rate)
        if (st.down.has(idp.id) || st.hang.has(idp.id)) return done(failed(`${describeNode(n)} could not check tokens: the identity provider is down`, 5))
      }
    }
    ctx.limitLoad?.set(id, (ctx.limitLoad.get(id) ?? 0) + rate)
    const stillOutside = outside && !['experience', 'process', 'system'].includes(laneOf(n))

    const a = ctx.first || source ? 1 : admit.get(id) ?? 1
    const limited = ctx.first || source ? 0 : limitedShare.get(id) ?? 0
    const errorRate = source ? 0 : st.errors.get(id) ?? sys.get(id).errorRate ?? 0
    const own = (source ? 0 : ownMs(n, st) * slowdown(util.get(id) ?? 0)) + (c.auth === 'oauth2' && outside && idp ? OWN_MS['identity-provider'] : 0)

    // the boxes it calls for this request: those on the route, and a cache it reads first
    let next = routeLines(id, f, here)
    const cacheEdge = out(id).find((e) => byId.get(e.to).type === 'cache' && !f.targets.some((t) => matches(byId.get(e.to), t)))
    const cacheNode = cacheEdge ? byId.get(cacheEdge.to) : null
    const cacheUp = cacheNode && !st.down.has(cacheNode.id) && !st.hang.has(cacheNode.id)
    const h = cacheUp && f.kind === 'read' && API_TYPES.has(n.type) ? hitRatio(cacheNode) : 0
    if (cacheNode) {
      ctx.load.set(cacheNode.id, (ctx.load.get(cacheNode.id) ?? 0) + rate * a)
      if (ctx.record) recAt(ctx, f, cacheNode.id).arrived += rate * a * 60
    }
    let callRate = rate * a * (1 - h)
    // A load balancer or gateway sends each request to one box behind it, not to all of them. With `via` the traffic
    // names the box it is routed to (a gateway routes by path). A load balancer skips boxes that are down.
    let split = 1
    if (ROUTERS.has(n.type)) {
      let calls = next.filter((e) => !isMessaging(byId.get(e.to)) && byId.get(e.to) !== cacheNode)
      if (f.via) {
        const is = calls.filter((e) => asList(f.via).some((v) => matches(byId.get(e.to), v)))
        // else the lines with the shortest way to it
        const hops = (start) => {
          let level = [start]
          const seen = new Set(level)
          for (let d = 0; d < 6 && level.length; d++) {
            if (level.some((x) => asList(f.via).some((v) => matches(byId.get(x), v)))) return d
            level = level.flatMap((x) => out(x).map((e) => e.to)).filter((x) => !seen.has(x) && seen.add(x))
          }
          return Infinity
        }
        const dist = calls.map((e) => hops(e.to))
        const best = Math.min(...dist)
        const named = is.length ? is : Number.isFinite(best) ? calls.filter((e, i) => dist[i] === best) : []
        if (named.length) calls = named
      }
      if (n.type === 'load-balancer') {
        // its health check asks each box behind it. A gateway only proxies, so it is healthy while an API behind it
        // is; an API answers its health check itself, even when something it calls is down.
        const working = (x) => !st.down.has(x) && !st.hang.has(x)
        const healthy = (x, depth = 0) =>
          working(x) &&
          (!ROUTERS.has(byId.get(x).type) || depth > 3 || out(x).some((e) => !isMessaging(byId.get(e.to)) && healthy(e.to, depth + 1)))
        const up = calls.filter((e) => healthy(e.to))
        if (up.length) calls = up
        // active/passive: everything goes to the first box connected that is up
        if (c.mode === 'failover') calls = calls.slice(0, 1)
      }
      if (calls.length > 1) {
        split = calls.length
        callRate /= split
      }
      next = next.filter((e) => isMessaging(byId.get(e.to)) || calls.includes(e))
    }
    // A queue this box consumes itself (an orchestrator's step queue, a pending queue) beside its direct calls keeps
    // only what the direct calls could not finish: those requests are answered as accepted and done later.
    const ownQueue = (e) => isMessaging(byId.get(e.to)) && consumersOf(e.to).some((x) => x.id === id)
    const pending = next.some((e) => !ownQueue(e)) ? next.filter(ownQueue) : []
    if (pending.length) next = next.filter((e) => !ownQueue(e))
    const results = []
    const shares = []
    for (const e of next) {
      const to = byId.get(e.to)
      if (to === cacheNode) continue
      if (isMessaging(to)) {
        // a publish: done once the broker has the message
        ctx.load.set(to.id, (ctx.load.get(to.id) ?? 0) + callRate)
        if (ctx.record) recAt(ctx, f, to.id).arrived += callRate * 60
        if (st.down.has(to.id) || st.hang.has(to.id)) results.push(failed(`${describeNode(to)} is down, so the message could not be sent`, DOWN_MS))
        else {
          if (ctx.record) ctx.published.push({ queue: to.id, count: callRate * 60 * split, flow: f.i, seen: ctx.seen ?? [] })
          results.push({ ...result(1, ownMs(to, st)), published: 1 })
        }
        continue
      }
      if (e.kind === 'async' && !API_TYPES.has(to.type)) {
        // fire and forget: the caller does not wait for the answer
        visit(to.id, callRate, f, here, ctx, false)
        results.push(result(1, 1))
        continue
      }
      let r = visit(to.id, callRate, f, here, ctx, stillOutside)
      if (API_TYPES.has(n.type)) {
        const timeout = Number(c.timeoutMs) || 10000
        if (!(r.ms <= timeout)) r = { ...r, s: 0, refused: 0, limited: 0, degraded: 0, published: 0, ms: timeout, reason: r.reason ?? `${describeNode(to)} took longer than the ${timeout} ms timeout` }
        if (c.circuitBreaker === 'on' && r.s < 0.5) r = { ...r, ms: r.s * r.ms + (1 - r.s) * 1 }
        const retries = Number(c.retries) || 0
        if (retries > 0 && r.s > 0 && r.s < 1) {
          const s = 1 - (1 - r.s) ** (1 + retries)
          r = { ...r, s, refused: r.refused * (1 - s), limited: r.limited * (1 - s) }
        }
        // a partial answer is for someone waiting; a consumer that skips a failed call has not done the work
        if (c.onFailure === 'partial answer' && r.s < 1) r = { ...r, degraded: Math.min(1, r.degraded + 1 - r.s - r.refused), s: 1 - r.refused, limited: 0 }
      }
      if (split > 1) shares.push(r)
      else results.push(r)
    }
    if (shares.length) {
      // the branches of a load balancer or gateway each take their share, so the request sees their average
      const avg = (k) => sum(shares.map((r) => r[k])) / shares.length
      const ok = shares.filter((r) => r.s > 0)
      results.push({
        s: avg('s'),
        refused: avg('refused'),
        limited: avg('limited'),
        degraded: avg('degraded'),
        published: avg('published'),
        ms: ok.length ? sum(ok.map((r) => r.s * r.ms)) / sum(ok.map((r) => r.s)) : Math.max(...shares.map((r) => r.ms)),
        reason: shares.find((r) => r.s < 0.999)?.reason,
      })
    }

    const sDirect = results.reduce((p, r) => p * r.s, 1)
    let parked = 0
    let parkMs = 0
    if (pending.length && sDirect < 1) {
      const rest = callRate * (1 - sDirect)
      for (const e of pending) {
        const to = byId.get(e.to)
        ctx.load.set(to.id, (ctx.load.get(to.id) ?? 0) + rest)
        if (ctx.record) recAt(ctx, f, to.id).arrived += rest * 60
        if (st.down.has(to.id) || st.hang.has(to.id)) continue
        if (ctx.record) ctx.published.push({ queue: to.id, count: rest * 60 * split, flow: f.i, seen: ctx.seen ?? [] })
        parked = 1 - sDirect
        parkMs = Math.max(parkMs, ownMs(to, st))
      }
    }
    const sAll = sDirect + parked
    if (parked) results.push({ ...result(1, parkMs), published: parked })
    const childMs = c.calls === 'in parallel' ? Math.max(0, ...results.map((r) => r.ms)) : sum(results.map((r) => r.ms))
    const total = own + (cacheNode ? OWN_MS.cache : 0) + (1 - h) * childMs
    const heldMs = Number.isFinite(total) ? total : Number(c.timeoutMs) || 10000
    ctx.heldNow.set(id, Math.max(ctx.heldNow.get(id) ?? 0, heldMs))

    const s = a * (1 - errorRate) * (h + (1 - h) * sAll)
    const notOk = 1 - s
    const childFail = a * (1 - errorRate) * (1 - h) * (1 - sAll)
    const childShare = (key) => {
      const bad = sum(results.map((r) => 1 - r.s))
      return bad > 0 ? Math.min(1, sum(results.map((r) => r[key])) / bad) : 0
    }
    const overload = Math.max(0, 1 - a - limited)
    const reason =
      limited > 0.001
        ? `${describeNode(n)} rate limit answered 429`
        : overload > 0.001
          ? threadBound.has(id)
            ? `${describeNode(n)} ran out of threads waiting on slow calls and answered 503`
            : `${describeNode(n)} was over capacity and answered 503`
          : errorRate > 0
            ? `${describeNode(n)} returned errors`
            : results.find((r) => r.s < 0.999)?.reason
    return done({
      s: Math.max(0, s),
      refused: Math.min(notOk, childFail * childShare('refused')),
      limited: Math.min(notOk, limited + childFail * childShare('limited')),
      degraded: Math.min(s, a * (1 - h) * Math.max(0, ...results.map((r) => r.degraded))),
      published: a * (1 - h) * sAll * Math.max(0, ...results.map((r) => r.published)),
      ms: total,
      reason,
    })
  }

  // how many messages a second a consumer can move for a flow: the least spare room on its route
  function routeRoom(startId, f, st, entryLoad, consumerLoad) {
    let min = Infinity
    // only the boxes it calls directly: what waits behind another queue or topic does not slow this consumer
    for (const id of reachFrom(startId, true)) {
      const n = byId.get(id)
      if (!onRoute(id, f) || isMessaging(n) || st.down.has(id) || st.hang.has(id)) continue
      const limit = Number(cfg.get(id).rateLimit) || Infinity
      const room = Math.min(capacityOf(n, st, held.get(id)), limit) - (entryLoad.get(id) ?? 0) - (consumerLoad.get(id) ?? 0)
      min = Math.min(min, Math.max(0, room))
    }
    return min
  }

  function enqueue(qid, count, flow, attempt, seen, poison = false) {
    if (seen.has(qid) || !(count > 0)) return
    const passed = [...seen]
    seen.add(qid)
    const n = byId.get(qid)
    const q = queues.get(qid)
    // a topic or exchange bound to queues copies the message into each of them
    for (const e of out(qid)) if (isMessaging(byId.get(e.to))) enqueue(e.to, count, flow, attempt, seen, poison)
    const consumers = consumersOf(qid)
    const bound = out(qid).some((e) => isMessaging(byId.get(e.to)))
    if (bound && !consumers.length) return
    // a topic gives every subscriber a copy, but only the subscribers on this flow's route are followed: the others
    // (a data warehouse, another team's service) take their copy and are not part of this test
    const routed = consumers.filter((c) => onRoute(c.id, flows[flow]))
    if (!SHARED.has(n.type) && consumers.length && !routed.length) return
    const lanes = SHARED.has(n.type) || !consumers.length ? ['*'] : routed.map((c) => c.id)
    for (const lane of lanes) {
      if (!q.lanes.has(lane)) q.lanes.set(lane, [])
      q.lanes.get(lane).push({ count, attempt, flow, seen: passed, poison })
    }
  }

  function rateAt(f, m) {
    if (f.at !== undefined && m < f.at) return 0
    if (f.forMin !== undefined && m >= (f.at ?? 0) + f.forMin) return 0
    let r = Number(f.rps) || 0
    for (const sp of asList(f.spikes)) if (m >= (sp.at ?? 0) && m < (sp.at ?? 0) + (sp.forMin ?? 1)) r = Number(sp.rps) || r
    return r
  }

  function result(s, ms) {
    return { s, refused: 0, limited: 0, degraded: 0, published: 0, ms }
  }
  function failed(reason, ms) {
    return { ...result(0, ms), reason }
  }

  // ---------- the answer ----------
  const vCores = sum(
    nodes.filter((n) => API_TYPES.has(n.type)).map((n) => {
      const c = cfg.get(n.id)
      return (Number(c.replicas) || 1) * (Number(c.vCores) || 0.1) * (Number(c.regions) || 1)
    }),
  )
  for (const [k, v] of flowAt) {
    const id = k.slice(k.indexOf('|') + 1)
    nodeStats.get(id).arrived += v.arrived
    nodeStats.get(id).served += v.served
  }
  return {
    duration,
    flows: flows.map((f, i) => {
      const fs = flowStats[i]
      const share = (x) => (fs.offered ? x / fs.offered : 0)
      const success = fs.offered ? fs.ok / fs.offered : 1
      return {
        name: f.name,
        offered: round(fs.offered),
        success,
        refused: share(fs.refused),
        limited: share(fs.limited),
        failed: Math.max(0, 1 - success - share(fs.refused) - share(fs.limited)),
        degraded: share(fs.degraded),
        avgMs: fs.ok ? fs.msWeighted / fs.ok : null,
        maxMs: fs.maxMs,
        reasons: Object.entries(fs.reasons)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([text, n]) => ({ text, share: share(n) })),
        byMinute: fs.byMinute,
        at: Object.fromEntries(nodes.map((n) => [n.id, flowAt.get(`${i}|${n.id}`) ?? { arrived: 0, served: 0 }])),
      }
    }),
    nodes: Object.fromEntries(
      nodes.map((n) => {
        const ns = nodeStats.get(n.id)
        return [n.id, { label: n.label, type: n.type, peakRps: round(ns.peakRps, 1), avgRps: round(ns.sumRps / duration, 1), peakUtil: round(ns.peakUtil, 2), down: ns.down, arrived: round(ns.arrived), served: round(ns.served) }]
      }),
    ),
    queues: Object.fromEntries(
      [...queues].map(([id, q]) => [id, { label: byId.get(id).label, peak: round(q.peak), end: round(waiting(q)), dlq: round(q.dlq), lost: round(q.lost), delivered: round(q.delivered), byMinute: q.byMinute }]),
    ),
    lost: round(sum([...queues.values()].map((q) => q.lost))),
    vCores: round(vCores, 2),
    notes,
  }
}

// waiting messages of the same flow, attempt, history and kind are kept together
function merge(buckets) {
  const m = new Map()
  for (const b of buckets) {
    const k = `${b.flow}|${b.attempt}|${(b.seen ?? []).join(',')}|${b.poison ? 1 : 0}`
    if (m.has(k)) m.get(k).count += b.count
    else m.set(k, { ...b })
  }
  return [...m.values()].filter((b) => b.count > 1e-6)
}

export function describe(m) {
  if (!m) return 'anything'
  if (typeof m === 'string' || Array.isArray(m)) return asList(m).map((t) => NODE_TYPES[t]?.label ?? t).join(' or ')
  if (m.label) return asList(m.label)[0]
  return asList(m.type).map((t) => NODE_TYPES[t]?.label ?? t).join(' or ')
}

export function describeNode(n) {
  return n?.label || NODE_TYPES[n?.type]?.label || 'a box'
}
