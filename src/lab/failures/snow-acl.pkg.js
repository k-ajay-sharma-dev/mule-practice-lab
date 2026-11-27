// The sample application of the snow-acl lab. Imports only platform-log.js and the import free ServiceNow engine,
// so the engine can load it without a cycle. Store device alerts become incidents routed to the support group of the CI.
import { info, muleError, needs, warn } from '../platform-log.js'
import { cfgOf } from '../platform-servicenow.js'

export const POS = 'brightmart-pos-alert-incidents'
export const POS_ALERT = JSON.stringify({ ci: 'STORE-0042-POS', check: 'receipt_printer', summary: 'STORE-0042-POS receipt printer offline' })
const FLOW = 'post:\\alerts:application\\json:pos-alerts-config'
const el = {
  ci: { flow: FLOW, at: 1, name: 'Read CI', dsl: '<http:request doc:name="Read CI" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/cmdb_ci">' },
  find: { flow: FLOW, at: 2, name: 'Find open incident', dsl: '<http:request doc:name="Find open incident" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
  group: { flow: FLOW, at: 3, name: 'Check support group', dsl: '<raise-error doc:name="Check support group" type="APP:CI_WITHOUT_GROUP"/>' },
  create: { flow: FLOW, at: 4, name: 'Create incident', dsl: '<http:request doc:name="Create incident" method="POST" config-ref="ServiceNow_Config" path="/api/now/table/incident">' },
}
export const missingOf = (p) => String(p?.['ci.missingGroup'] ?? 'empty').trim().toLowerCase()
const httpFail = (r, where, path) => ({ status: 502, ms: r.ms + 10, flow: FLOW, error: r.type, log: [muleError({ ...where, file: POS, type: r.type, message: `HTTP ${where.dsl.match(/method="(\w+)"/)[1]} on resource '${path}' failed: ${r.error} (${r.status}).` })], body: '{"message":"ServiceNow call failed"}' })

export const PACKAGES = {
  [POS]: {
    note: `POST /alerts with {"ci","check","summary"} from the store device monitor. The flow reads the CI with GET /api/now/table/cmdb_ci?sysparm_query=name=<ci>&sysparm_fields=sys_id,name,support_group, looks for an open incident with correlation_id <ci>:<check>, and when there is none sends POST /api/now/table/incident with cmdb_ci, correlation_id and assignment_group set to the support group of the CI. The property ci.missingGroup says what happens when the CI comes back without a support group: empty creates the incident with an empty assignment group; fail raises APP:CI_WITHOUT_GROUP and answers 500, so the alert is retried and the error is counted.`,
    sample: { method: 'POST', path: '/alerts', body: POS_ALERT },
    boot: needs('snow.instance', 'snow.username', 'snow.password'),
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/alerts') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${POS}-main`, body: '{"message":"Resource not found"}' }
      let a
      try {
        a = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid JSON"}' }
      }
      if (!a.ci || !a.check || !a.summary) return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"ci, check and summary are required"}' }
      const cfg = cfgOf(ctx.props)
      const sn = ctx.servicenow
      const key = `${a.ci}:${a.check}`
      const c = sn.table(cfg, 'GET', 'cmdb_ci', { sysparm_query: `name=${a.ci}`, sysparm_fields: 'sys_id,name,support_group', sysparm_limit: 1 })
      if (!c.ok) return httpFail(c, el.ci, '/api/now/table/cmdb_ci')
      const ci = c.body.result[0]
      if (!ci) return { status: 404, ms: c.ms + 5, flow: FLOW, error: 'APP:CI_NOT_FOUND', log: [warn(`Alert ${key}: no CI named ${a.ci}`)], body: '{"message":"Unknown CI"}' }
      const f = sn.table(cfg, 'GET', 'incident', { sysparm_query: `correlation_id=${key}^stateIN1,2,3`, sysparm_fields: 'number', sysparm_limit: 1 })
      if (!f.ok) return httpFail(f, el.find, '/api/now/table/incident')
      if (f.body.result[0]) return { status: 200, ms: c.ms + f.ms + 10, flow: FLOW, log: [info(`Alert ${key}: ${f.body.result[0].number} is open already`)], body: JSON.stringify({ incident: f.body.result[0].number, status: 'open' }) }
      // the field is left out of the answer when the user may not read it, so the value is undefined, not an error
      const group = ci.support_group?.value ?? ci.support_group ?? ''
      if (!group && missingOf(ctx.props) === 'fail') {
        const message = `CI ${a.ci} came back without support_group. The integration user may not read it, or the CI has no group.`
        return { status: 500, ms: c.ms + f.ms + 10, flow: FLOW, error: 'APP:CI_WITHOUT_GROUP', log: [muleError({ ...el.group, file: POS, type: 'APP:CI_WITHOUT_GROUP', message })], body: '{"message":"Internal server error"}' }
      }
      const p = sn.table(cfg, 'POST', 'incident', { sysparm_fields: 'number' }, { short_description: a.summary, cmdb_ci: ci.sys_id, correlation_id: key, correlation_display: 'Brightmart store monitor', assignment_group: group, category: 'hardware', impact: '2', urgency: '2' })
      if (!p.ok) return httpFail(p, el.create, '/api/now/table/incident')
      return { status: 201, ms: c.ms + f.ms + p.ms + 10, flow: FLOW, log: [info(`Alert ${key}: incident ${p.body.result.number} created for group ${group || '(none)'}`)], body: JSON.stringify({ incident: p.body.result.number, status: 'created' }) }
    },
  },
}
