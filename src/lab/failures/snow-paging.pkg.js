// The sample application of the snow-paging lab. Imports only platform-log.js and the import free ServiceNow engine,
// so the engine can load it without a cycle. A scheduler copies the open incidents to the Brightmart data warehouse.
import { info, line, muleError, needs } from '../platform-log.js'
import { cfgOf } from '../platform-servicenow.js'

export const SYNC = 'brightmart-incident-warehouse-sync'
export const SYNC_FLOW = 'incident-warehouse-sync-flow'
const el = { flow: SYNC_FLOW, at: 2, name: 'Read incidents', dsl: '<http:request doc:name="Read incidents" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">' }
export const pagingOf = (p) => String(p?.['sync.paging'] ?? 'none').trim().toLowerCase()

export const PACKAGES = {
  [SYNC]: {
    note: `Every 15 minutes the flow ${SYNC_FLOW} reads the open incidents with GET /api/now/table/incident and writes them to the Brightmart data warehouse, where the store and warehouse reports read them. The query is the property sync.query, the page size sync.pageSize (sysparm_limit). With sync.paging none it reads one page. With sync.paging offset it reads page after page with sysparm_offset until a page is short or the offset reaches X-Total-Count. It logs how many rows it wrote, how many it read twice and how many of X-Total-Count it never saw.`,
    boot: needs('snow.instance', 'snow.username', 'snow.password', 'sync.query', 'sync.pageSize'),
    schedules: [{ flow: SYNC_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [SYNC_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const size = Math.max(1, Number(props['sync.pageSize']) || 50)
        const offset = pagingOf(props) === 'offset'
        const seen = new Set()
        let dupes = 0
        let total = 0
        let pages = 0
        let ms = 0
        for (let at = 0; pages < 40; at += size) {
          const params = { sysparm_query: props['sync.query'], sysparm_fields: 'sys_id,number,state,priority,assignment_group,sys_updated_on', sysparm_limit: size, ...(offset && { sysparm_offset: at }) }
          const r = ctx.servicenow.table(cfgOf(props), 'GET', 'incident', params)
          ms += r.ms
          if (!r.ok) return { ok: false, ms, errorType: r.type, log: [muleError({ ...el, file: SYNC, type: r.type, message: `HTTP GET on resource '/api/now/table/incident' failed: ${r.error} (${r.status}).` })] }
          pages++
          total = Number(r.headers['X-Total-Count'] ?? 0)
          for (const x of r.body.result) seen.has(x.number) ? dupes++ : seen.add(x.number)
          if (!offset || r.body.result.length < size || at + size >= total) break
        }
        const missed = Math.max(0, total - seen.size)
        store.last = { t: now, wrote: seen.size, dupes, missed, total, pages }
        store.runs = (store.runs ?? 0) + 1
        // the app trusts what it read: a page short of X-Total-Count is not an error to it
        return { ok: true, ms: ms + 30, log: [info(`Warehouse sync: ${seen.size} incidents written in ${pages} page${pages > 1 ? 's' : ''}`), ...(dupes ? [line('DEBUG', `${dupes} incidents came twice and were written again`)] : [])], store }
      },
    },
  },
}
