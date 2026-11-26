// The sample applications of the hyb-manual-copy lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

export const PACKAGES = {
  'hyb-orders-sapi': {
    note: 'The Orders System API on the own servers of Harbor. It reads orders from SQL Server at db.host.',
    sample: { method: 'GET', path: '/orders' },
    traced: true,
    boot: needs('db.host'),
    handle: ({ props, node }, req) =>
      /^\/orders(\/[A-Z0-9-]+)?$/.test(req.path)
        ? { status: 200, ms: 45, flow: 'get:\\orders', body: '[{"orderId":"O-2207","customer":"Harbor Foods","total":61.2}]', log: [info(`Read orders from ${props['db.host']} on ${node ?? 'the replica'}`)] }
        : { status: 404, ms: 4, flow: 'orders-sapi-main', body: '{"message":"Resource not found"}' },
  },
  'hyb-customers-sapi': {
    note: 'The Customers System API, deployed through Runtime Manager.',
    sample: { method: 'GET', path: '/customers/C-7' },
    boot: needs('crm.host'),
    handle: () => ({ status: 200, ms: 40, flow: 'get:\\customers\\(id)', body: '{"id":"C-7","name":"Harbor Foods"}' }),
  },
}
