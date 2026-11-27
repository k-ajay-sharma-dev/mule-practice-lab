// The sample application of the wd-isu-password lab. Imports only platform-log.js and the import free Workday engine,
// so the engine can load it without a cycle. It keeps the badge system in step with Workday and answers badge desk
// lookups of one worker.
import { info, muleError, needs } from '../platform-log.js'
import { wdConfig, wdTime } from '../platform-workday.js'

export const BADGE = 'brightmart-wd-badge-sync'
export const BADGE_FLOW = 'badge-delta-flow'
const el = {
  raas: { flow: BADGE_FLOW, at: 1, name: 'Get changed workers', dsl: '<http:request method="GET" doc:name="Get changed workers" config-ref="Workday_RaaS_Config" path="/${raas.owner}/${raas.report}">' },
  soap: { flow: 'get:\\workers\\(id):brightmart-wd-badge-sync-config', at: 1, name: 'Get_Workers', dsl: '<wsc:consume doc:name="Get_Workers" config-ref="Workday_Human_Resources" operation="Get_Workers">' },
}
const err = (e, r) => muleError({ ...e, file: BADGE, type: r.type, message: r.error })

export const PACKAGES = {
  [BADGE]: {
    note: `Keeps the badge system in step with Workday. The flow ${BADGE_FLOW} runs every 15 minutes and calls the report raas.report of raas.owner as RaaS with the prompts Updated_From and Updated_To, from the watermark to now. GET /workers/{id} is the lookup of the badge desk: it calls Get_Workers of Human_Resources with the Web Service Consumer. Both log in as workday.username with the secure property workday.password.`,
    sample: { method: 'GET', path: '/workers/21004', body: '' },
    boot: needs('workday.host', 'workday.tenant', 'workday.username', 'workday.password', 'raas.owner', 'raas.report'),
    schedules: [{ flow: BADGE_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/workers\/([^/]+)$/)
      if (req.method !== 'GET' || !m) return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${BADGE}-main`, body: '{"message":"Resource not found"}' }
      const r = ctx.workday.soap(wdConfig(ctx.props), 'Get_Workers', { ids: [m[1]] })
      if (!r.ok) {
        const notFound = /Invalid ID value/.test(r.error)
        return { status: notFound ? 404 : 502, ms: r.ms + 10, flow: el.soap.flow, error: r.type, log: notFound ? [] : [err(el.soap, r)], body: notFound ? '{"message":"No such worker"}' : '{"message":"Workday is not available"}' }
      }
      const x = r.workers[0]
      return { status: 200, ms: r.ms + 10, flow: el.soap.flow, body: JSON.stringify({ id: x.Employee_ID, name: x.Worker, status: x.Status, location: x.Location_ID ?? null }) }
    },
    run: {
      [BADGE_FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const from = store.watermark ?? now - 15 * 60000
        const r = ctx.workday.raas(wdConfig(p), p['raas.report'], { Updated_From: wdTime(from), Updated_To: wdTime(now) })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [err(el.raas, r)] }
        return { ok: true, ms: r.ms + 40, store: { watermark: now, lastOk: now }, log: r.rows.length ? [info(`${r.rows.length} changed workers sent to the badge system`)] : [] }
      },
    },
  },
}
