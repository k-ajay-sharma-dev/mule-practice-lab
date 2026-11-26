// The sample applications of the hyb-version-mismatch lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

export const PACKAGES = {
  'hyb-stock-api': {
    note: 'The stock API of the Harbor warehouses. Its mule-artifact.json sets minMuleVersion to 4.9.0, so an older runtime refuses it.',
    sample: { method: 'GET', path: '/stock/SKU-1001' },
    minMule: '4.9.0',
    traced: true,
    boot: needs('db.host'),
    handle: ({ props, node }, req) =>
      /^\/stock\/[A-Z0-9-]+$/.test(req.path)
        ? { status: 200, ms: 60, flow: 'get:\\stock\\(sku)', body: JSON.stringify({ sku: req.path.split('/').pop(), onHand: 240, warehouse: 'Rotterdam' }), log: [info(`Read stock from ${props['db.host']} on ${node ?? 'the replica'}`)] }
        : { status: 404, ms: 5, flow: 'stock-api-main', body: '{"message":"Resource not found"}' },
  },
}
