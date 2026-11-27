// The sample application of the sec-ip-allowlist lab. Imports only platform-log.js, so the engine can load it without a cycle.
//
// The gateway of the lab reads the caller address from the `ip` of each request, which the IP Allowlist policy sees as
// #[attributes.remoteAddress]. The lab sends no request headers to the gateway, so this application writes the
// X-Forwarded-For value that the load balancer would add to its log, from the caller name. Addresses are documentation
// and private ranges, and the callers are fictional.
import { info } from '../platform-log.js'

// The public load balancer opens its own connection to the API, so the API sees this address for every internet caller
export const LB_IP = '10.250.0.4'
export const OFFICE = '10.1.0.0/16'
export const DATA_CENTER = '10.40.0.0/16'
export const TEAMMATE_LIST = '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16'

export const CALLERS = {
  WAREHOUSE: { name: 'Warehouse App', clientId: 'whs-2b61', clientSecret: 'whs-secret-14', ip: '10.1.8.20' },
  SYNC: { name: 'Stock Sync Job', clientId: 'syn-90c3', clientSecret: 'syn-secret-27', ip: '10.40.3.15' },
  SCANNER: { name: 'Security Scanner', clientId: 'scn-4d08', clientSecret: 'scn-secret-63', ip: LB_IP, origin: '203.0.113.77' },
}
const ORIGIN = Object.fromEntries(Object.values(CALLERS).filter((c) => c.origin).map((c) => [c.name, c.origin]))

const LOGGER = 'harbor.stock.access'

export const PACKAGES = {
  'stock-internal-api': {
    note: 'The internal stock API of Harbor Foods. It logs the address it sees and the X-Forwarded-For value of calls that come through the load balancer.',
    sample: { method: 'GET', path: '/stock/SKU-1001' },
    handle(ctx, req) {
      const path = String(req.path).split('?')[0]
      const via = req.ip === LB_IP
      const log = via || req.traced ? [info(`${req.method} ${path} remoteAddress=${req.ip ?? '10.1.2.3'} X-Forwarded-For=${via ? (ORIGIN[req.client] ?? '198.51.100.9') : '(none)'} caller=${req.client || '(no client application)'}`, LOGGER)] : undefined
      if (!/^\/stock(\/SKU-\d+)?$/.test(path)) return { status: 404, ms: 5, flow: 'stock-internal-api-main', error: 'APIKIT:NOT_FOUND', body: '{"message":"Resource not found"}', log }
      if (req.method !== 'GET') return { status: 405, ms: 5, flow: 'stock-internal-api-main', error: 'APIKIT:METHOD_NOT_ALLOWED', body: '{"message":"Method not allowed"}', log }
      const body = path === '/stock' ? '[{"sku":"SKU-1001","store":"Pier 3","onHand":140,"cost":2.35}]' : `{"sku":"${path.slice(7)}","store":"Pier 3","onHand":140,"cost":2.35}`
      return { status: 200, ms: 40, flow: 'get:\\stock:stock-internal-api-config', body, log }
    },
  },
}
