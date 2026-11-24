// What a flow test sends and what a run did, in words, for the Run tab and for the prompt of Copy for AI.

export const json = (v) => {
  if (v === undefined) return '(nothing)'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export function triggerText(t = {}) {
  if (t.http) return `${t.http.method ?? 'GET'} ${t.http.path}`
  if (t.message) return `A message on ${t.message.kind} ${t.message.destination}`
  if (t.schedule !== undefined) return 'The Scheduler fires'
  if (t.file) return `A file arrives: ${t.file.path}`
  if (t.source) return `${t.source} receives an event`
  return 'Start'
}

export function triggerBody(t = {}) {
  if (t.http) return t.http.body
  if (t.message) return t.message.payload
  if (t.file) return t.file.content
  return t.payload
}

// a statement that failed never gets a result; a stored procedure gets one without a count
const dbOutcome = (d) => (!('result' in d) ? 'failed' : d.result === undefined ? 'ran' : typeof d.result === 'number' ? `${d.result} rows changed` : d.result)

// One line for each call to another system
export function effectRows(effects) {
  const rows = []
  for (const c of effects.http) rows.push(`HTTP ${c.method} ${c.path} → ${c.status}`)
  for (const d of effects.db) rows.push(`Database: ${d.sql.replace(/\s+/g, ' ').slice(0, 90)} → ${dbOutcome(d)}`)
  for (const m of effects.sent) rows.push(`Sent to ${m.destination}: ${json(m.payload).replace(/\s+/g, ' ').slice(0, 90)}`)
  for (const e of effects.emails) rows.push(`Email to ${e.to}: ${e.subject}`)
  for (const c of effects.calls) rows.push(`${c.type} ${c.operation}`)
  for (const a of effects.acks.filter((x) => x.op === 'outcome')) rows.push(`Message on ${a.destination}: ${a.outcome}`)
  return rows
}
