// The sample application of the ch2-capacity lab. Imports only platform-log.js and the import free capacity model.
import { warn } from '../platform-log.js'
import { loadOf } from '../platform-capacity.js'

export const DEALS_API = 'brightmart-deals-eapi'
const MINUTE = 60000
// lab-made: one call of the lab traffic stands for 60 real requests, so a minute at peak stays a small list of events
export const SAMPLE = 60
// the measured cost of one request of this API: CPU time on one full vCore, and the size of its JSON payload
export const PROFILE = { type: 'api', requestMs: 31, payloadKb: 8, sample: SAMPLE, path: '/deals', method: 'GET' }
export const loadAt = (app, calls) => loadOf({ replicas: app.replicas, vCores: app.vCores, perMinute: calls * SAMPLE, requestMs: PROFILE.requestMs, payloadKb: PROFILE.payloadKb })

export const PACKAGES = {
  [DEALS_API]: {
    note: 'The deals Experience API of the Brightmart web shop: GET /deals returns the offers of the day for the home page, with prices from the pricing System API. About 31 ms of CPU per request on one vCore, 8 KB of JSON.',
    profile: PROFILE,
    // what the replicas use at this many lab calls a minute, read by the CPU and Memory charts of Runtime Manager
    load: (app, calls) => loadAt(app, calls),
    handle(ctx, req) {
      if (req.method !== 'GET' || req.path !== '/deals') return { status: 404, ms: 3, body: '' }
      const { app, now, perMinute } = ctx
      const L = loadAt(app, Math.max(1, perMinute))
      const i = Math.round(((req.offset ?? 0) * Math.max(1, perMinute)) / MINUTE)
      // above the capacity the HTTP listener applies backpressure to the share of requests it cannot take
      if (L.reject > 0 && Math.floor((i + 1) * L.reject) > Math.floor(i * L.reject)) {
        const first = Math.floor(i * L.reject) === 0
        return {
          status: 503,
          ms: 8,
          flow: 'get-deals-flow',
          body: '{"error":"Service Unavailable"}',
          log: first ? [warn(`Flow 'get-deals-flow' is unable to accept new events at this time. Error type MULE:FLOW_BACK_PRESSURE. About ${Math.round(L.reject * 100)} percent of the requests of this minute got 503.`, 'org.mule.runtime.core.internal.construct.FlowBackPressureHandler')] : undefined,
        }
      }
      // lab-made spread of the response times around the median and the 95th percentile of the load model
      const q = ((i * 7 + Math.floor(now / MINUTE) * 3) % 20) / 20
      const ms = q < 0.5 ? L.p50 * (0.7 + 0.6 * q) : q < 0.95 ? L.p50 + ((L.p95 - L.p50) * (q - 0.5)) / 0.45 : L.p95 * (1 + (q - 0.95) * 4)
      return { status: 200, ms: Math.round(ms), flow: 'get-deals-flow', body: '{"deals":[{"sku":"SKU-2201","price":39.0},{"sku":"SKU-5120","price":24.5}]}' }
    },
  },
}
