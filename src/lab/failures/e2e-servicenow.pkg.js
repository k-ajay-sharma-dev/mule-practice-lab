// The sample application of the end to end lab of ServiceNow. Imports only platform-log.js and the import free
// ServiceNow engine, so the engine can load it without a cycle. The store monitor of Brightmart posts a store alert; the
// app finds the open incident of the same alert by correlation_id and adds a work note, or opens a new incident with the
// Table API. When ServiceNow answers 429, 5xx or cannot be reached, the alert goes to an Anypoint MQ retry queue and the
// caller gets 202; the Subscriber of that queue sends it again, and after its attempts the queue moves it to its dead
// letter queue. replay-dlq-flow, started by hand, moves the dead letters back to the retry queue.
import { info, muleError, needs, warn } from '../platform-log.js'
import { cfgOf } from '../platform-servicenow.js'

export const SN_PKG = 'brightmart-e2e-store-incident-papi'
export const SN_ASSET = 'store-incident-api'
export const SN_CONSUMER = 'incident-retry-subscriber-flow'
export const SN_REPLAY = 'replay-dlq-flow'
export const SOURCE = 'Brightmart Store Monitor'
const word = (v) => String(v ?? '').trim()
const json = (o) => JSON.stringify(o)
const POST = 'post:\\incidents:application\\json:store-incident-api-config'
const GET = 'get:\\incidents\\(number):store-incident-api-config'
const el = (flow) => ({
  find: { flow, at: 2, name: 'Find open incident', dsl: '<http:request doc:name="Find open incident" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  create: { flow, at: 3, name: 'Create incident', dsl: '<http:request doc:name="Create incident" method="POST" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  note: { flow, at: 4, name: 'Add work note', dsl: '<http:request doc:name="Add work note" method="PATCH" config-ref="ServiceNow_Config" path="/api/now/table/incident/{sys_id}">' },
})
// the dedupe key of an alert: one open incident per store, device and problem
export const keyOf = (a) => `${word(a.store)}:${word(a.device)}:${word(a.problem)}`.toUpperCase()
export const ALERT = (problem, summary, impact = 2) => json({ store: '0042', device: 'STORE-0042-POS', problem, summary, impact })
// lab-made: an answer worth a retry later. 401 and 403 are configuration errors that a retry does not fix.
const retryable = (r) => r.status === 429 || r.status === 0 || r.status >= 500
const nice = (r, dsl) => `HTTP ${dsl.match(/method="(\w+)"/)[1]} on resource '/api/now/table/incident' failed: ${r.error} (${r.status}).${r.headers?.['Retry-After'] ? ` Retry-After ${r.headers['Retry-After']} seconds.` : ''}`

export function readAlert(body) {
  try {
    const a = JSON.parse(body || '{}')
    return a && word(a.store) && word(a.device) && word(a.problem) && word(a.summary) ? a : null
  } catch {
    return null
  }
}

// one alert to ServiceNow: find the open incident of the key, then a work note or a new incident.
// Returns { ok, created, number, calls } or { ok: false, r, where }.
function raise(ctx, a, cid, flow) {
  const cfg = cfgOf(ctx.props)
  const sn = ctx.servicenow
  const e = el(flow)
  const key = keyOf(a)
  const found = sn.table(cfg, 'GET', 'incident', { sysparm_query: `correlation_id=${key}^stateIN1,2,3`, sysparm_fields: 'sys_id,number,state', sysparm_limit: 1 })
  if (!found.ok) return { ok: false, r: found, where: e.find, key }
  const open = found.body.result[0]
  const note = `${SOURCE}: ${word(a.summary)} (correlationId=${cid})`
  if (open) {
    const p = sn.table(cfg, 'PATCH', `incident/${open.sys_id}`, { sysparm_fields: 'number,state' }, { work_notes: note })
    if (!p.ok) return { ok: false, r: p, where: e.note, key }
    return { ok: true, created: false, number: open.number, key, ms: found.ms + p.ms }
  }
  const impact = ['1', '2', '3'].includes(String(a.impact)) ? String(a.impact) : '2'
  const body = {
    short_description: `Store ${word(a.store)}: ${word(a.summary)}`.slice(0, 160),
    description: `Alert ${key} of the ${SOURCE}. Device ${word(a.device)}, problem ${word(a.problem)}.`,
    cmdb_ci: word(a.device),
    assignment_group: word(ctx.props['snow.assignmentGroup']),
    category: 'hardware',
    impact,
    urgency: '2',
    correlation_id: key,
    correlation_display: SOURCE,
    work_notes: note,
  }
  const c = sn.table(cfg, 'POST', 'incident', { sysparm_fields: 'sys_id,number' }, body)
  if (!c.ok) return { ok: false, r: c, where: e.create, key }
  return { ok: true, created: true, number: c.body.result.number, key, ms: found.ms + c.ms }
}
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  [SN_PKG]: {
    note: `Store Incident API of Brightmart. The ${SOURCE} posts each store alert to POST /incidents with {"store","device","problem","summary","impact"}. The flow builds the key STORE:DEVICE:PROBLEM and sends GET /api/now/table/incident?sysparm_query=correlation_id=<key>^stateIN1,2,3. An open incident gets the alert as a work note with PATCH (200); otherwise POST /api/now/table/incident opens one (201) with correlation_id the key, cmdb_ci the device, assignment_group snow.assignmentGroup. A 429, a 5xx or no connection puts the alert on the Anypoint MQ queue mq.retryQueue and answers 202; the Subscriber ${SN_CONSUMER} on that queue sends it again, and the queue moves it to its dead letter queue after its delivery attempts. ${SN_REPLAY} (disabled, run it by hand) moves the messages of mq.dlq back to mq.retryQueue. GET /incidents/{number} reads the state of an incident. Logs carry correlationId. Properties: snow.instance, snow.username, the secure snow.password, snow.assignmentGroup, mq.url, mq.retryQueue, mq.dlq, the secure mq.clientId and mq.clientSecret.`,
    sample: { method: 'POST', path: '/incidents', body: ALERT('CARD_READER_OFFLINE', 'Card reader of till 3 offline') },
    traced: true,
    boot: needs('snow.instance', 'snow.username', 'snow.password', 'snow.assignmentGroup', 'mq.url', 'mq.retryQueue', 'mq.dlq', 'mq.clientId', 'mq.clientSecret'),
    schedules: [{ flow: SN_REPLAY, type: 'fixed', value: '1', unit: 'days', enabled: false }],
    handle(ctx, req) {
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const g = path.match(/^\/incidents\/(INC\d{7})$/i)
      if (req.method === 'GET' && g) {
        const r = ctx.servicenow.table(cfgOf(ctx.props), 'GET', 'incident', { sysparm_query: `number=${g[1].toUpperCase()}`, sysparm_fields: 'number,state,priority,assignment_group,correlation_id,sys_updated_on', sysparm_display_value: 'true', sysparm_limit: 1 })
        if (!r.ok) return { status: 502, ms: r.ms + 5, flow: GET, error: r.type, log: [muleError({ ...el(GET).find, file: SN_PKG, type: r.type, message: nice(r, el(GET).find.dsl) })], body: json({ message: 'ServiceNow call failed' }) }
        const x = r.body.result[0]
        return x ? { status: 200, ms: r.ms + 5, flow: GET, body: json(x) } : { status: 404, ms: r.ms + 5, flow: GET, body: json({ message: `No incident ${g[1].toUpperCase()}` }) }
      }
      if (req.method !== 'POST' || path !== '/incidents') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: 'store-incident-api-main', body: json({ message: 'Resource not found' }) }
      const a = readAlert(req.body)
      if (!a) return { status: 400, ms: 4, flow: POST, error: 'APIKIT:BAD_REQUEST', body: json({ message: 'store, device, problem and summary are required' }) }
      const cid = word(req.cid) || `alert-${keyOf(a).toLowerCase()}`
      const x = raise(ctx, a, cid, POST)
      const st = (ctx.app.store ??= {})
      if (x.ok) {
        st.done = keep(st.done, { key: x.key, number: x.number, created: x.created, cid, t: ctx.now, via: 'api' })
        return { status: x.created ? 201 : 200, ms: x.ms + 15, flow: POST, log: [info(`correlationId=${cid} Alert ${x.key}: ${x.created ? `incident ${x.number} created` : `work note added to the open incident ${x.number}`}`)], body: json({ number: x.number, action: x.created ? 'created' : 'updated', correlationId: cid }) }
      }
      if (!retryable(x.r)) return { status: 502, ms: x.r.ms + 10, flow: POST, error: x.r.type, log: [muleError({ ...x.where, file: SN_PKG, type: x.r.type, message: `correlationId=${cid} ${nice(x.r, x.where.dsl)}` })], body: json({ message: 'ServiceNow refused the call', status: x.r.status }) }
      const queue = word(ctx.props['mq.retryQueue'])
      ctx.put(queue, json({ alert: a, correlationId: cid }))
      st.queued = (st.queued ?? 0) + 1
      return { status: 202, ms: x.r.ms + 40, flow: POST, log: [warn(`correlationId=${cid} Alert ${x.key}: ServiceNow answered ${x.r.status || 'no connection'} (${x.r.type}). The alert is on ${queue} for a retry.`)], body: json({ status: 'QUEUED', key: x.key, correlationId: cid }) }
    },
    consumes: 'mq.retryQueue',
    consume(ctx, m) {
      let b = null
      try {
        b = JSON.parse(m.body)
      } catch {
        b = null
      }
      const a = b?.alert && readAlert(json(b.alert))
      if (!a) return { ok: false, flow: SN_CONSUMER, errorType: 'MULE:EXPRESSION', error: { flow: SN_CONSUMER, file: SN_PKG, at: 1, name: 'Read alert', dsl: '<ee:transform doc:name="Read alert">', type: 'MULE:EXPRESSION', message: `Message ${m.id} is not a store alert.` } }
      const cid = word(b.correlationId) || `alert-${keyOf(a).toLowerCase()}`
      const x = raise(ctx, a, cid, SN_CONSUMER)
      if (!x.ok) return { ok: false, flow: SN_CONSUMER, errorType: x.r.type, error: { ...x.where, file: SN_PKG, type: x.r.type, message: `correlationId=${cid} ${nice(x.r, x.where.dsl)} Message ${m.id}, delivery ${m.deliveries}.` } }
      const st = (ctx.app.store ??= {})
      st.done = keep(st.done, { key: x.key, number: x.number, created: x.created, cid, t: ctx.now, via: 'queue' })
      st.retried = (st.retried ?? 0) + 1
      return { ok: true, flow: SN_CONSUMER, log: [info(`correlationId=${cid} Alert ${x.key} from ${word(ctx.props['mq.retryQueue'])}, delivery ${m.deliveries}: ${x.created ? `incident ${x.number} created` : `work note added to ${x.number}`}. Message ${m.id} acknowledged.`)] }
    },
    run: {
      [SN_REPLAY]: ({ props }) => ({
        ok: true,
        ms: 2000,
        log: [info(`Starting ${SN_REPLAY}`), info(`Moved the messages of ${word(props['mq.dlq'])} back to ${word(props['mq.retryQueue'])}. Each one is published again as a new message.`)],
        move: { from: word(props['mq.dlq']), to: word(props['mq.retryQueue']) },
      }),
    },
  },
}
