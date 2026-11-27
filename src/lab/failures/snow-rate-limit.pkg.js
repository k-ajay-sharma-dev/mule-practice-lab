// The sample application of the snow-rate-limit lab. Imports only platform-log.js and the import free ServiceNow engine,
// so the engine can load it without a cycle. A scheduler keeps the ticket list of the Brightmart store portal up to date.
import { info, muleError, needs, warn } from '../platform-log.js'
import { cfgOf, dt } from '../platform-servicenow.js'

export const PORTAL = 'brightmart-store-ticket-portal-sync'
export const PORTAL_FLOW = 'store-portal-sync-flow'
export const GROUP = 'Store Systems'
const el = { flow: PORTAL_FLOW, at: 2, name: 'Read incident', dsl: '<http:request doc:name="Read incident" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident/{sys_id}">' }
const elList = { ...el, at: 1, name: 'Read changed incidents', dsl: '<http:request doc:name="Read changed incidents" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' }
export const modeOf = (p) => String(p?.['sync.mode'] ?? 'per-record').trim().toLowerCase()
export const on429Of = (p) => String(p?.['snow.on429'] ?? 'fail').trim().toLowerCase()
const FIELDS = 'number,short_description,state,priority,assigned_to,sys_updated_on'
const BASE = Date.UTC(2026, 10, 2)

export const PACKAGES = {
  [PORTAL]: {
    note: `Every minute the flow ${PORTAL_FLOW} copies the open incidents of the group ${GROUP} to the Brightmart store portal. With sync.mode per-record it lists the sys_ids of the open incidents of the group, then sends one GET /api/now/table/incident/{sys_id} per incident. With sync.mode changed-since it sends one GET /api/now/table/incident?sysparm_query=assignment_group=${GROUP}^sys_updated_on>=<watermark>^ORDERBYsys_updated_on&sysparm_fields=${FIELDS} and keeps the watermark in its object store. snow.on429 says what a 429 Too Many Requests does: fail raises HTTP:TOO_MANY_REQUESTS and the portal misses that run; wait reads X-RateLimit-Reset, keeps the watermark and makes no call until that time.`,
    boot: needs('snow.instance', 'snow.username', 'snow.password'),
    schedules: [{ flow: PORTAL_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [PORTAL_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const cfg = cfgOf(props)
        const sn = ctx.servicenow
        if (store.waitUntil && now < store.waitUntil) return { ok: true, ms: 2, log: [], store }
        const limited = (r, where) => {
          if (r.status === 429 && on429Of(props) === 'wait') {
            const reset = Number(r.headers['X-RateLimit-Reset']) * 1000 - BASE
            store.waitUntil = Number.isFinite(reset) ? reset : now + 60000 * 10
            return { ok: true, ms: r.ms, log: [warn(`ServiceNow answered 429. Waiting until X-RateLimit-Reset ${dt(store.waitUntil)} before the next call. Watermark kept at ${store.wm ?? '(none)'}.`)], store }
          }
          store.failed = (store.failed ?? 0) + 1
          return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...where, file: PORTAL, type: r.type, message: `HTTP GET on resource '/api/now/table/incident' failed: ${r.error} (${r.status}).` })], store }
        }
        delete store.waitUntil
        if (modeOf(props) === 'changed-since') {
          const wm = store.wm ?? dt(now - 24 * 3600000)
          const r = sn.table(cfg, 'GET', 'incident', { sysparm_query: `assignment_group=${GROUP}^sys_updated_on>=${wm}^ORDERBYsys_updated_on`, sysparm_fields: FIELDS, sysparm_limit: 200 })
          if (!r.ok) return limited(r, elList)
          store.wm = r.body.result.at(-1)?.sys_updated_on ?? wm
          store.lastSync = now
          store.calls = (store.calls ?? 0) + 1
          return { ok: true, ms: r.ms + 20, log: r.body.result.length ? [info(`Portal sync: ${r.body.result.length} changed incidents sent to the portal, watermark ${store.wm}`)] : [], store }
        }
        const list = sn.table(cfg, 'GET', 'incident', { sysparm_query: `assignment_group=${GROUP}^stateIN1,2,3`, sysparm_fields: 'sys_id' })
        if (!list.ok) return limited(list, elList)
        let ms = list.ms
        for (const x of list.body.result) {
          const r = sn.table(cfg, 'GET', `incident/${x.sys_id}`, { sysparm_fields: FIELDS })
          ms += r.ms
          if (!r.ok) return limited(r, el)
        }
        store.lastSync = now
        store.calls = (store.calls ?? 0) + 1 + list.body.result.length
        return { ok: true, ms: ms + 20, log: [], store }
      },
    },
  },
}
