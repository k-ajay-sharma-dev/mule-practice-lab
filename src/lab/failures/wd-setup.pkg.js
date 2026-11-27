// The sample application of the wd-setup lab. Imports only platform-log.js and the import free Workday engine, so the
// engine can load it without a cycle. It feeds the workers of Workday to the identity hub of Brightmart.
import { info, muleError, needs, warn } from '../platform-log.js'
import { wdConfig, wdTime } from '../platform-workday.js'

export const FEED = 'brightmart-wd-worker-feed'
export const FEED_JAR = `${FEED}-1.0.0-mule-application.jar`
export const FEED_FLOW = 'worker-feed-flow'
const el = {
  raas: { flow: FEED_FLOW, at: 1, name: 'Get worker feed', dsl: '<http:request method="GET" doc:name="Get worker feed" config-ref="Workday_RaaS_Config" path="/${raas.owner}/${raas.report}">' },
  health: { flow: 'get:\\health:brightmart-wd-worker-feed-config', at: 1, name: 'Get_Workers', dsl: '<wsc:consume doc:name="Get_Workers" config-ref="Workday_Human_Resources" operation="Get_Workers">' },
}
const keep = (list, items, n = 20) => [...(list ?? []), ...items].slice(-n)

export const PACKAGES = {
  [FEED]: {
    note: `Feeds the active workers of Workday to the identity hub. The flow ${FEED_FLOW} runs every 15 minutes and calls the custom report raas.report of raas.owner as RaaS. With no watermark in the object store it reads the whole report; after that it sends the prompts Updated_From and Updated_To from the watermark to now. A worker row without Email is not sent: it goes to the rejected list and the run counts an error. GET /health calls Get_Workers with Count 1 to test the login. Both log in as workday.username with the secure property workday.password; workday.responseTimeout is the response timeout in ms.`,
    sample: { method: 'GET', path: '/health', body: '' },
    boot: needs('workday.host', 'workday.tenant', 'workday.username', 'workday.password', 'raas.owner', 'raas.report'),
    schedules: [{ flow: FEED_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      if (req.method !== 'GET' || req.path.split('?')[0] !== '/health') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${FEED}-main`, body: '{"message":"Resource not found"}' }
      const r = ctx.workday.soap(wdConfig(ctx.props), 'Get_Workers', { count: 1 })
      if (!r.ok) return { status: 503, ms: r.ms + 5, flow: el.health.flow, error: r.type, log: [muleError({ ...el.health, file: FEED, type: r.type, message: r.error })], body: JSON.stringify({ workday: 'DOWN', error: r.error }) }
      return { status: 200, ms: r.ms + 5, flow: el.health.flow, body: JSON.stringify({ workday: 'UP', tenant: ctx.props['workday.tenant'], activeWorkers: r.results.Total_Results }) }
    },
    run: {
      [FEED_FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const full = store.watermark === undefined
        const r = ctx.workday.raas(wdConfig(p), p['raas.report'], full ? {} : { Updated_From: wdTime(store.watermark), Updated_To: wdTime(now) })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.raas, file: FEED, type: r.type, message: r.error })] }
        const bad = r.rows.filter((x) => !x.Email)
        const good = r.rows.length - bad.length
        const log = [info(`${full ? 'Full load' : 'Delta'} of ${p['raas.report']}: ${good} workers sent to the identity hub${bad.length ? `, ${bad.length} rejected` : ''}`)]
        for (const x of bad.slice(0, 3)) log.push(warn(`Worker ${x.Employee_ID ?? '?'} ${x.Worker ?? ''} has no Email. Not sent; added to the rejected list.`))
        if (bad.length > 3) log.push(warn(`${bad.length} workers have no Email. If every row lacks it, the ISU may not see the field.`))
        const out = {
          watermark: now,
          sent: (full ? 0 : (store.sent ?? 0)) + good,
          ...(full && { first: { t: now, rows: r.rows.length, good, blank: bad.length } }),
          rejected: keep(store.rejected, bad.slice(0, 20).map((x) => ({ id: x.Employee_ID, name: x.Worker, reason: 'Email missing', t: now }))),
        }
        // lab-made error type of the feed for a rejected row
        return { ok: bad.length === 0, ms: r.ms + 60, errorType: bad.length ? 'FEED:INVALID_WORKER' : null, errors: bad.length, store: out, log }
      },
    },
  },
}
