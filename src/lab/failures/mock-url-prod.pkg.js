// The sample application of the mock-url-prod lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

// Each real order gets its own number from the lab clock. API client calls are 100 ms apart, so no two are the same.
export const realOrderId = (now) => `PO-${String(20000 + (Math.floor(now / 100) % 80000))}`
// What the example in the specification says. The mocking service gives this to every caller.
export const EXAMPLE_ID = 'PO-1001'
export const CREATED = 'saved in the order database'

export const PACKAGES = {
  'partner-orders-api': {
    note: 'The real Partner Orders API. POST /orders saves the order in the order database of Harbor Foods and returns its own order ID.',
    boot: needs('db.host'),
    sample: { method: 'POST', path: '/orders' },
    handle({ props, now }, req) {
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      if (path === '/orders' && req.method === 'POST') {
        const id = realOrderId(now)
        return {
          status: 201,
          ms: 140,
          flow: 'post:\\orders:partner-orders-api-config',
          log: [info(`Order ${id} ${CREATED} ${props['db.host']} for client ${req.clientId || 'unknown'}`)],
          body: JSON.stringify({ orderId: id, status: 'RECEIVED' }),
        }
      }
      const one = path.match(/^\/orders\/([^/]+)$/)
      if (one && req.method === 'GET') {
        if (one[1] === EXAMPLE_ID) return { status: 404, ms: 30, flow: 'get:\\orders\\(orderId):partner-orders-api-config', body: JSON.stringify({ message: `Order ${EXAMPLE_ID} not found` }) }
        return { status: 200, ms: 45, flow: 'get:\\orders\\(orderId):partner-orders-api-config', body: JSON.stringify({ orderId: one[1], status: 'RECEIVED' }) }
      }
      return { status: path.startsWith('/orders') ? 405 : 404, ms: 5, error: path.startsWith('/orders') ? 'APIKIT:METHOD_NOT_ALLOWED' : 'APIKIT:NOT_FOUND', body: JSON.stringify({ message: 'Resource not found' }) }
    },
  },
}
