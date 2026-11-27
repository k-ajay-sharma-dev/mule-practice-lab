// The sample applications of the snow-dedupe lab. Imports only platform-log.js and the import free ServiceNow engine,
// so the engine can load it without a cycle. The app turns monitoring alerts into ServiceNow incidents with the Table API.
import { info, line, muleError, needs } from '../platform-log.js'
import { cfgOf } from '../platform-servicenow.js'

export const BRIDGE = 'brightmart-alert-to-incident'
export const ALERT_KEY = 'WMS-DB-01:disk_free'
export const ALERT = JSON.stringify({ key: ALERT_KEY, ci: 'WMS-DB-01', summary: 'WMS-DB-01 disk E: free space below 5 percent', impact: 2 })
const FLOW = 'post:\\alerts:application\\json:alert-api-config'
const el = {
  find: { flow: FLOW, at: 2, name: 'Find open incident', dsl: '<http:request doc:name="Find open incident" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  create: { flow: FLOW, at: 3, name: 'Create incident', dsl: '<http:request doc:name="Create incident" method="POST" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  update: { flow: FLOW, at: 4, name: 'Update incident', dsl: '<http:request doc:name="Update incident" method="PATCH" config-ref="ServiceNow_Config" path="/api/now/table/incident/{sys_id}">' },
  load: { flow: FLOW, at: 3, name: 'Load import set', dsl: '<http:request doc:name="Load import set" method="POST" config-ref="ServiceNow_Config" path="/api/now/import/u_brightmart_alert_import">' },
}
export const modeOf = (p) => String(p?.['incident.dedupe'] ?? 'none').trim().toLowerCase()
const fail = (r, where) => ({ status: 502, ms: r.ms + 10, flow: FLOW, error: r.type, log: [muleError({ ...where, file: BRIDGE, type: r.type, message: `HTTP ${where.dsl.match(/method="(\w+)"/)[1]} on resource '${'/api/now/table/incident'}' failed: ${r.error} (${r.status}).` })], body: '{"message":"ServiceNow call failed"}' })

export const PACKAGES = {
  [BRIDGE]: {
    note: `POST /alerts with {"key","ci","summary","impact"} from Brightmart monitoring opens a ServiceNow incident with the Table API, as the user snow.username over basic auth (snow.password is a secure property). The property incident.dedupe picks what happens when the same alert fires again: none always sends POST /api/now/table/incident; correlation_id first sends GET /api/now/table/incident?sysparm_query=correlation_id=<key>^stateIN1,2,3&sysparm_limit=1 and sends PATCH with a work note to the incident it finds, or POST with correlation_id set; import-set sends the alert to the Import Set API (staging table u_brightmart_alert_import), whose transform map decides insert or update by its coalesce fields. snow.assignmentGroup is the group of new incidents.`,
    sample: { method: 'POST', path: '/alerts', body: ALERT },
    boot: needs('snow.instance', 'snow.username', 'snow.password'),
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/alerts') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${BRIDGE}-main`, body: '{"message":"Resource not found"}' }
      let a
      try {
        a = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid JSON"}' }
      }
      if (!a.key || !a.summary) return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"key and summary are required"}' }
      const cfg = cfgOf(ctx.props)
      const sn = ctx.servicenow
      const mode = modeOf(ctx.props)
      const store = ctx.store
      store.alerts = (store.alerts ?? 0) + 1
      const fields = { short_description: a.summary, cmdb_ci: a.ci, assignment_group: ctx.props['snow.assignmentGroup'] ?? '', impact: String(a.impact ?? 2), urgency: '2', category: 'database', correlation_display: 'Brightmart monitoring' }
      if (mode === 'import-set') {
        const r = sn.importSet(cfg, 'u_brightmart_alert_import', { u_alert_key: a.key, u_summary: a.summary, u_ci: a.ci, u_group: fields.assignment_group, u_impact: fields.impact })
        if (!r.ok) return fail(r, el.load)
        const x = r.body.result[0]
        return { status: x.status === 'inserted' ? 201 : 200, ms: r.ms + 20, flow: FLOW, log: [info(`Alert ${a.key}: import set ${r.body.import_set}, ${x.status} ${x.display_value}`)], body: JSON.stringify({ incident: x.display_value, status: x.status }) }
      }
      if (mode === 'correlation_id') {
        const f = sn.table(cfg, 'GET', 'incident', { sysparm_query: `correlation_id=${a.key}^stateIN1,2,3`, sysparm_fields: 'sys_id,number', sysparm_limit: 1 })
        if (!f.ok) return fail(f, el.find)
        const open = f.body.result[0]
        if (open) {
          const u = sn.table(cfg, 'PATCH', `incident/${open.sys_id}`, { sysparm_fields: 'number,sys_mod_count' }, { work_notes: `Alert ${a.key} fired again: ${a.summary}` })
          if (!u.ok) return fail(u, el.update)
          return { status: 200, ms: f.ms + u.ms + 20, flow: FLOW, log: [info(`Alert ${a.key}: open incident ${open.number} found, work note added`)], body: JSON.stringify({ incident: open.number, status: 'updated' }) }
        }
        fields.correlation_id = a.key
      }
      const c = sn.table(cfg, 'POST', 'incident', { sysparm_fields: 'number,sys_id' }, fields)
      if (!c.ok) return fail(c, el.create)
      store.created = (store.created ?? 0) + 1
      return { status: 201, ms: c.ms + 20, flow: FLOW, log: [mode === 'none' ? line('INFO', `Alert ${a.key}: incident ${c.body.result.number} created`) : info(`Alert ${a.key}: no open incident, ${c.body.result.number} created with correlation_id`)], body: JSON.stringify({ incident: c.body.result.number, status: 'created' }) }
    },
  },
}
