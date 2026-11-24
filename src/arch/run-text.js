// The traffic and the incidents of an architecture test, in words, for the Run tab and for the prompt of Copy for AI.
import { describe } from './sim.js'

export const pct = (x) => `${Math.round(x * 1000) / 10}%`
export const n1 = (x) => (Number.isFinite(x) ? String(Math.round(x * 10) / 10) : '∞')
export const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

export function trafficText(t) {
  const to = asList(t.to).length ? ` to ${asList(t.to).map(describe).join(' and ')}` : ''
  const kind = t.kind === 'write' ? 'writes' : 'reads'
  const auth = t.auth === 'none' ? ', with no credentials' : t.auth && t.auth !== 'valid' ? `, with a ${t.auth} credential` : ''
  const when = t.at !== undefined || t.forMin !== undefined ? ` from minute ${t.at ?? 0}${t.forMin !== undefined ? ` for ${t.forMin} min` : ''}` : ''
  const spikes = asList(t.spikes).map((s) => `, ${s.rps}/s at minute ${s.at ?? 0} for ${s.forMin ?? 1} min`).join('')
  const via = t.via ? `, routed to ${asList(t.via).map(describe).join(' or ')}` : ''
  const poison = t.poison ? `, ${pct(t.poison)} of them poison messages that always fail` : ''
  return `${describe(t.from)}: ${t.rps} ${kind} a second${to}${via}${auth}${when}${spikes}${poison}`
}

export function incidentText(i) {
  const when = `from minute ${i.at ?? 0}${i.forMin !== undefined ? ` for ${i.forMin} min` : ''}`
  if (i.down) return `${describe(i.down)} is down ${when}`
  if (i.hang) return `${describe(i.hang)} stops answering (calls hang) ${when}`
  if (i.slow) return `${describe(i.slow)} takes ${i.latencyMs ?? 5000} ms to answer ${when}`
  if (i.errors) return `${describe(i.errors)} fails ${pct(i.rate ?? 0.5)} of calls ${when}`
  if (i.restart) return `The broker of ${describe(i.restart)} restarts at minute ${i.at ?? 0}`
  if (i.zone) return `One availability zone goes down ${when}`
  if (i.region && i.region !== true) return `The region of ${describe(i.region)} goes down ${when}`
  if (i.region) return `A whole region goes down ${when}`
  return 'An incident'
}
