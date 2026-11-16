// Turns what an architecture test expects into lines that say, for this run, what held and what did not.
//
// expect: {
//   answers:    [{ flow?, minSuccess, maxSuccess, maxMs, minRefused, maxRefused, minLimited, maxLimited, maxFailed, minDegraded, maxDegraded }]
//               one or every flow (by name): the share of requests answered (0..1), refused (credentials), limited
//               (429), failed otherwise, answered with a partial answer, and the average time of an answer
//   peakRps:    [{ node, max, min }]          the busiest minute at each matching box, in requests a second
//   delivered:  [{ flow?, to, min, max }]     the share of a flow's requests that a matching box served (a topic can
//                                             give each subscriber a copy, so each one counts on its own)
//   notReached: [{ flow?, node }]             no request of the flow (or of any flow) arrived at a matching box
//   backlog:    [{ queue, maxPeak, minPeak, maxEnd }]   messages waiting in a matching queue, at worst and at the end
//   dlq:        { queue?, min, max }          messages moved to dead-letter queues
//   lost:       { max }                       messages dropped (after the last delivery with no DLQ, or on a restart)
//   vCores:     { max, min }                  what the APIs in the design use, in vCores
// }
import { matches } from './checks.js'
import { describe } from './sim.js'

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const pct = (x) => `${Math.round(x * 1000) / 10}%`
const num = (x) => (Number.isFinite(x) ? String(Math.round(x * 10) / 10) : String(x))
const ms = (x) => (x == null ? 'no answer' : `${Math.round(x)} ms`)

export function checkExpectations(result, expect = {}, diagram) {
  const lines = []
  const add = (ok, text) => lines.push({ ok: Boolean(ok), text })
  const nodes = diagram?.nodes ?? []
  const pick = (spec) => (spec.flow === undefined ? result.flows : result.flows.filter((f) => f.name === spec.flow))
  const named = (spec) => (spec.flow === undefined ? '' : `"${spec.flow}": `)

  for (const a of asList(expect.answers)) {
    const flows = pick(a)
    if (!flows.length) {
      add(false, `${named(a)}no such traffic in this test`)
      continue
    }
    for (const f of flows) {
      const who = `"${f.name}"`
      if (!f.offered) {
        add(false, `${who} sent no requests. Check that the design has the channel it starts from`)
        continue
      }
      if (a.minSuccess !== undefined) add(f.success >= a.minSuccess - 1e-9, `${who}: ${pct(f.success)} answered (wanted at least ${pct(a.minSuccess)})${f.success < a.minSuccess && f.reasons[0] ? `. Most failures: ${f.reasons[0].text}` : ''}`)
      if (a.maxSuccess !== undefined) add(f.success <= a.maxSuccess + 1e-9, `${who}: ${pct(f.success)} answered (wanted at most ${pct(a.maxSuccess)})`)
      if (a.maxMs !== undefined) add(f.avgMs != null && f.avgMs <= a.maxMs, `${who}: an answer took ${ms(f.avgMs)} on average (wanted at most ${a.maxMs} ms)`)
      if (a.minRefused !== undefined) add(f.refused >= a.minRefused - 1e-9, `${who}: ${pct(f.refused)} refused for missing or wrong credentials (wanted at least ${pct(a.minRefused)})`)
      if (a.maxRefused !== undefined) add(f.refused <= a.maxRefused + 1e-9, `${who}: ${pct(f.refused)} refused for credentials (wanted at most ${pct(a.maxRefused)})`)
      if (a.minLimited !== undefined) add(f.limited >= a.minLimited - 1e-9, `${who}: ${pct(f.limited)} got 429 from a rate limit (wanted at least ${pct(a.minLimited)})`)
      if (a.maxLimited !== undefined) add(f.limited <= a.maxLimited + 1e-9, `${who}: ${pct(f.limited)} got 429 from a rate limit (wanted at most ${pct(a.maxLimited)})`)
      if (a.maxFailed !== undefined) add(f.failed <= a.maxFailed + 1e-9, `${who}: ${pct(f.failed)} failed with an error (wanted at most ${pct(a.maxFailed)})${f.failed > a.maxFailed && f.reasons[0] ? `. Most failures: ${f.reasons[0].text}` : ''}`)
      if (a.minDegraded !== undefined) add(f.degraded >= a.minDegraded - 1e-9, `${who}: ${pct(f.degraded)} got a partial answer (wanted at least ${pct(a.minDegraded)})`)
      if (a.maxDegraded !== undefined) add(f.degraded <= a.maxDegraded + 1e-9, `${who}: ${pct(f.degraded)} got a partial answer (wanted at most ${pct(a.maxDegraded)})`)
    }
  }

  for (const p of asList(expect.peakRps)) {
    const ids = nodes.filter((n) => matches(n, p.node)).map((n) => n.id)
    if (!ids.length) {
      add(false, `Your design has no ${describe(p.node)}`)
      continue
    }
    for (const id of ids) {
      const n = result.nodes[id]
      if (p.max !== undefined) add(n.peakRps <= p.max + 1e-6, `${n.label} carried at most ${num(n.peakRps)} requests a second (wanted at most ${p.max})`)
      if (p.min !== undefined) add(n.peakRps >= p.min - 1e-6, `${n.label} carried at most ${num(n.peakRps)} requests a second (wanted at least ${p.min})`)
    }
  }

  for (const d of asList(expect.delivered)) {
    const flows = pick(d)
    const ids = nodes.filter((n) => matches(n, d.to)).map((n) => n.id)
    if (!ids.length) {
      add(false, `Your design has no ${describe(d.to)}`)
      continue
    }
    for (const f of flows) {
      const served = Math.max(0, ...ids.map((id) => f.at[id]?.served ?? 0))
      const share = f.offered ? served / f.offered : 0
      const label = ids.length === 1 ? result.nodes[ids[0]].label : describe(d.to)
      if (d.min !== undefined) add(share >= d.min - 1e-6, `${label} got ${pct(share)} of "${f.name}" (wanted at least ${pct(d.min)})`)
      if (d.max !== undefined) add(share <= d.max + 1e-6, `${label} got ${pct(share)} of "${f.name}" (wanted at most ${pct(d.max)})`)
    }
  }

  for (const nr of asList(expect.notReached)) {
    const flows = pick(nr)
    const ids = nodes.filter((n) => matches(n, nr.node)).map((n) => n.id)
    const arrived = ids.reduce((s, id) => s + Math.max(0, ...flows.map((f) => f.at[id]?.arrived ?? 0)), 0)
    const whose = nr.flow === undefined ? 'requests' : `requests of "${nr.flow}"`
    add(arrived < 1e-6, arrived < 1e-6 ? `No ${whose} reached ${describe(nr.node)}` : `${num(arrived)} ${whose} reached ${describe(nr.node)} (wanted none)`)
  }

  for (const b of asList(expect.backlog)) {
    const qs = Object.entries(result.queues).filter(([id]) => matches(nodes.find((n) => n.id === id), b.queue))
    if (!qs.length) {
      add(false, `Your design has no ${describe(b.queue)}`)
      continue
    }
    for (const [, q] of qs) {
      if (b.maxPeak !== undefined) add(q.peak <= b.maxPeak, `${q.label} held at most ${num(q.peak)} waiting messages (wanted at most ${b.maxPeak})`)
      if (b.minPeak !== undefined) add(q.peak >= b.minPeak, `${q.label} held at most ${num(q.peak)} waiting messages (wanted at least ${b.minPeak})`)
      if (b.maxEnd !== undefined) add(q.end <= b.maxEnd, `${q.label} still held ${num(q.end)} messages at the end (wanted at most ${b.maxEnd})`)
    }
  }

  if (expect.dlq) {
    const qs = Object.entries(result.queues).filter(([id]) => !expect.dlq.queue || matches(nodes.find((n) => n.id === id), expect.dlq.queue))
    const total = qs.reduce((s, [, q]) => s + q.dlq, 0)
    if (expect.dlq.min !== undefined) add(total >= expect.dlq.min, `${num(total)} messages went to a dead-letter queue (wanted at least ${expect.dlq.min})`)
    if (expect.dlq.max !== undefined) add(total <= expect.dlq.max, `${num(total)} messages went to a dead-letter queue (wanted at most ${expect.dlq.max})`)
  }

  if (expect.lost) {
    if (expect.lost.max !== undefined) add(result.lost <= expect.lost.max, `${num(result.lost)} messages were lost (wanted at most ${expect.lost.max})`)
    if (expect.lost.min !== undefined) add(result.lost >= expect.lost.min, `${num(result.lost)} messages were lost (wanted at least ${expect.lost.min})`)
  }

  if (expect.vCores) {
    if (expect.vCores.max !== undefined) add(result.vCores <= expect.vCores.max + 1e-9, `The APIs use ${num(result.vCores)} vCores (wanted at most ${expect.vCores.max})`)
    if (expect.vCores.min !== undefined) add(result.vCores >= expect.vCores.min - 1e-9, `The APIs use ${num(result.vCores)} vCores (wanted at least ${expect.vCores.min})`)
  }

  return lines
}

// The keys an expect object may have, for the content checks.
export const EXPECT_KEYS = ['answers', 'peakRps', 'delivered', 'notReached', 'backlog', 'dlq', 'lost', 'vCores']
