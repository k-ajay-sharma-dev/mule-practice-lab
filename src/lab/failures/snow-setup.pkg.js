// The sample application of the snow-setup lab. Imports only platform-log.js and the import free ServiceNow engine, so
// the engine can load it without a cycle. Warehouse monitoring alerts become ServiceNow incidents, one per open problem.
import { info, muleError, warn } from '../platform-log.js'
import { cfgOf } from '../platform-servicenow.js'

export const WMS = 'brightmart-wms-incident-bridge'
export const WMS_JAR = `${WMS}-1.0.0-mule-application.jar`
export const WMS_ALERT = '{"key":"WMS-APP-01:pick_queue","ci":"WMS-APP-01","summary":"WMS-APP-01 pick queue above 500 orders","impact":2}'
export const WMS_BAD = '{"ci":"WMS-APP-01","summary":"alert without a key"}'
const FLOW = 'post:\\alerts:application\\json:wms-alerts-config'
const HEALTH = 'get:\\health:wms-alerts-config'
const el = {
  health: { flow: HEALTH, at: 1, name: 'Ping ServiceNow', dsl: '<http:request doc:name="Ping ServiceNow" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  find: { flow: FLOW, at: 2, name: 'Find open incident', dsl: '<http:request doc:name="Find open incident" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  create: { flow: FLOW, at: 3, name: 'Create incident', dsl: '<http:request doc:name="Create incident" method="POST" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  update: { flow: FLOW, at: 4, name: 'Update incident', dsl: '<http:request doc:name="Update incident" method="PATCH" config-ref="ServiceNow_Config" path="/api/now/table/incident/{sys_id}">' },
}
const fail = (r, where, flow = FLOW) => ({ status: flow === HEALTH ? 503 : 502, ms: r.ms + 10, flow, error: r.type, log: [muleError({ ...where, file: WMS, type: r.type, message: `HTTP ${where.dsl.match(/method="(\w+)"/)[1]} on resource '/api/now/table/incident' failed: ${r.error}${r.status ? ` (${r.status})` : ''}.` })], body: flow === HEALTH ? `{"status":"DOWN","servicenow":"${r.type}"}` : '{"message":"ServiceNow call failed"}' })
const has = (p, k) => Boolean(String(p[k] ?? '').trim())

export const PACKAGES = {
  [WMS]: {
    note: `The bridge from Brightmart warehouse monitoring to ServiceNow. GET /health sends GET /api/now/table/incident?sysparm_limit=1 as the integration user and answers UP or DOWN. POST /alerts with {"key","ci","summary","impact"} looks for an open incident with correlation_id = key and adds a work note to it, or creates one with POST /api/now/table/incident, assignment group snow.assignmentGroup. An alert without key or summary is rejected with 400 and never reaches ServiceNow. Properties: snow.instance (https://<instance>), snow.auth basic or oauth, snow.username with the secure snow.password for basic, snow.clientId with the secure snow.clientSecret for OAuth client credentials, snow.assignmentGroup.`,
    sample: { method: 'POST', path: '/alerts', body: WMS_ALERT },
    boot({ props: p }) {
      const need = ['snow.instance', 'snow.assignmentGroup', ...(String(p['snow.auth'] ?? 'basic').trim().toLowerCase() === 'oauth' ? ['snow.clientId', 'snow.clientSecret'] : ['snow.username', 'snow.password'])]
      const gone = need.find((k) => !has(p, k))
      return gone ? `Couldn't find configuration property value for key \${${gone}} from properties provider "Environment properties"` : null
    },
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const cfg = cfgOf(ctx.props)
      const sn = ctx.servicenow
      if (req.method === 'GET' && path === '/health') {
        const r = sn.table(cfg, 'GET', 'incident', { sysparm_limit: 1, sysparm_fields: 'sys_id' })
        if (!r.ok) return fail(r, el.health, HEALTH)
        return { status: 200, ms: r.ms + 5, flow: HEALTH, log: [info(`Health: ServiceNow ${cfg.instance} answered 200 as the integration user`)], body: '{"status":"UP","servicenow":"reachable"}' }
      }
      if (req.method !== 'POST' || path !== '/alerts') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${WMS}-main`, body: '{"message":"Resource not found"}' }
      let a
      try {
        a = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', log: [warn('Alert rejected: the body is not JSON')], body: '{"message":"Invalid JSON"}' }
      }
      if (!String(a.key ?? '').trim() || !String(a.summary ?? '').trim()) {
        ctx.store.rejected = (ctx.store.rejected ?? 0) + 1
        return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', log: [warn(`Alert rejected: key and summary are required. Body ${req.body}`)], body: '{"message":"key and summary are required"}' }
      }
      const f = sn.table(cfg, 'GET', 'incident', { sysparm_query: `correlation_id=${a.key}^stateIN1,2,3`, sysparm_fields: 'sys_id,number', sysparm_limit: 1 })
      if (!f.ok) return fail(f, el.find)
      const open = f.body.result[0]
      if (open) {
        const u = sn.table(cfg, 'PATCH', `incident/${open.sys_id}`, { sysparm_fields: 'number' }, { work_notes: `Alert ${a.key} fired again: ${a.summary}` })
        if (!u.ok) return fail(u, el.update)
        return { status: 200, ms: f.ms + u.ms + 10, flow: FLOW, log: [info(`Alert ${a.key}: work note added to ${open.number}`)], body: JSON.stringify({ incident: open.number, status: 'updated' }) }
      }
      const c = sn.table(cfg, 'POST', 'incident', { sysparm_fields: 'number,sys_id' }, { short_description: a.summary, cmdb_ci: a.ci ?? '', correlation_id: a.key, correlation_display: 'Brightmart warehouse monitoring', assignment_group: ctx.props['snow.assignmentGroup'], impact: String(a.impact ?? 2), urgency: '2', category: 'software' })
      if (!c.ok) return fail(c, el.create)
      ctx.store.created = (ctx.store.created ?? 0) + 1
      return { status: 201, ms: f.ms + c.ms + 10, flow: FLOW, log: [info(`Alert ${a.key}: incident ${c.body.result.number} created`)], body: JSON.stringify({ incident: c.body.result.number, status: 'created' }) }
    },
  },
}
