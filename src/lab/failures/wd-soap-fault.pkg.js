// The sample application of the wd-soap-fault lab. Imports only platform-log.js and the import free Workday engine, so
// the engine can load it without a cycle. It sends store transfers from the shift planning system to Workday as
// Change_Job requests.
import { info, muleError, needs, warn } from '../platform-log.js'
import { wdConfig } from '../platform-workday.js'

export const JOBS = 'harbor-wd-job-change'
export const JOBS_FLOW = 'job-change-flow'
const el = { flow: JOBS_FLOW, at: 2, name: 'Change_Job', dsl: '<wsc:consume doc:name="Change_Job" config-ref="Workday_Human_Resources" operation="Change_Job">' }
const keep = (list, item, n = 20) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  [JOBS]: {
    note: `Sends store transfers to Workday. The shift planning system posts {"worker","location","effective"} to POST /transfers, which queues them in the object store. The flow ${JOBS_FLOW} runs every 5 minutes and sends each queued transfer, in order, as a Change_Job request of Human_Resources with the Web Service Consumer: Worker_Reference by Employee_ID, Location_Reference with an ID of type wd.locationIdType, and the reason Transfer. With wd.onFault stop the first SOAP fault ends the run and the rest waits. With wd.onFault continue a transfer that faults is moved to the rejected list with its fault, and the run goes on.`,
    sample: { method: 'POST', path: '/transfers', body: '{"worker":"21002","location":"LOC_PIER_01","effective":"2026-11-04"}' },
    boot: needs('workday.host', 'workday.tenant', 'workday.username', 'workday.password', 'wd.locationIdType'),
    schedules: [{ flow: JOBS_FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/transfers') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${JOBS}-main`, body: '{"message":"Resource not found"}' }
      let o
      try {
        o = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 5, flow: 'post:\\transfers', error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid JSON"}' }
      }
      if (!o.worker || !o.location || !o.effective) return { status: 400, ms: 5, flow: 'post:\\transfers', error: 'APIKIT:BAD_REQUEST', body: '{"message":"worker, location and effective are required"}' }
      ctx.store.queue = [...(ctx.store.queue ?? []), { worker: String(o.worker), location: String(o.location), effective: String(o.effective) }]
      return { status: 202, ms: 12, flow: 'post:\\transfers', body: `{"queued":${ctx.store.queue.length}}` }
    },
    run: {
      [JOBS_FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const queue = [...(store.queue ?? [])]
        if (!queue.length) return { ok: true, ms: 5, log: [] }
        const type = String(p['wd.locationIdType'] ?? '').trim()
        const goOn = String(p['wd.onFault'] ?? 'stop').trim() === 'continue'
        const log = []
        let done = store.done ?? []
        let rejected = store.rejected ?? []
        let ms = 0
        while (queue.length) {
          const x = queue[0]
          const r = ctx.workday.soap(wdConfig(p), 'Change_Job', { worker: x.worker, effective: x.effective, location: { type, id: x.location }, reason: 'Transfer' })
          ms += r.ms
          if (!r.ok) {
            const why = r.fault?.errors?.[0]
            if (!goOn || !why) {
              log.push(muleError({ ...el, file: JOBS, type: r.type, message: `${r.error}${why?.xpath ? ` Xpath: ${why.xpath}` : ''}` }))
              return { ok: false, ms, errorType: r.type, store: { queue, done, rejected }, log }
            }
            queue.shift()
            rejected = keep(rejected, { ...x, t: now, message: why.message, xpath: why.xpath })
            log.push(warn(`Transfer of ${x.worker} to ${x.location} rejected by Workday: ${why.message} Sent to the rejected list for shift planning.`))
            continue
          }
          queue.shift()
          done = keep(done, { ...x, t: now })
          log.push(info(`Change_Job of ${x.worker} to ${x.location}, effective ${x.effective}: done`))
        }
        const bad = rejected.filter((z) => z.t === now).length
        return { ok: bad === 0, ms, errorType: bad ? 'WSC:SOAP_FAULT' : null, errors: bad, store: { queue, done, rejected }, log }
      },
    },
  },
}
