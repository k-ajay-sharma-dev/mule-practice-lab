// The sample application of the splunk-setup lab. Imports only platform-log.js, so the engine can load it without a
// cycle. Where its logs go comes from app.log4j and app.disableChLogs (see platform-observability.js).
import { info, muleError } from '../platform-log.js'

export const NAME = 'returns-desk-papi'
const FLOW = 'post:\\returns:returns-desk-config'
const json = (x) => JSON.stringify(x)

export const PACKAGES = {
  [NAME]: {
    layer: 'Process',
    traced: true,
    note: 'Registers the returns of the Harbor shops. POST /returns with {"order":"O-7001","reason":"..."} books a return. A body with the reason DAMAGED-LABEL fails in the label service with HTTP:INTERNAL_SERVER_ERROR.',
    sample: { method: 'POST', path: '/returns', body: '{"order":"O-7001","reason":"too small"}' },
    handle(ctx, req) {
      if (req.path.split('?')[0] !== '/returns' || req.method !== 'POST') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${NAME}-main`, body: json({ message: 'Resource not found' }) }
      const id = `R-${3000 + (Math.floor(ctx.now / 60000) % 5000)}`
      if (/DAMAGED-LABEL/.test(req.body ?? ''))
        return {
          status: 500,
          ms: 140,
          error: 'HTTP:INTERNAL_SERVER_ERROR',
          flow: FLOW,
          body: json({ message: 'Return label failed' }),
          log: [muleError({ message: `HTTP POST on resource 'https://labels.harbor.lab/v1/returns' failed: internal server error (500). Return ${id} has no label.`, type: 'HTTP:INTERNAL_SERVER_ERROR', flow: FLOW, file: NAME, at: 3, name: 'Create return label', dsl: '<http:request method="POST" doc:name="Create return label" config-ref="Labels_HTTP" path="/v1/returns">' })],
        }
      return { status: 201, ms: 120, flow: FLOW, body: json({ returnId: id, status: 'REGISTERED' }), log: [info(`Return ${id} registered`)] }
    },
  },
}
