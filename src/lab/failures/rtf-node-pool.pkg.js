// The sample applications of the rtf-node-pool lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info } from '../platform-log.js'

export const CART = 'harbor-cart-api'
export const CATALOG = 'harbor-catalog-sync'
export const PRICES = 'harbor-price-feed'

export const PACKAGES = {
  [CART]: {
    note: 'The cart API of the Harbor storefront: GET /cart/{id} and POST /cart/{id}/items. Each replica is sized at 0.5 vCores reserved and 1 vCore limit.',
    cpu: true,
    handle: (ctx, req) => (/^\/cart\//.test(req.path) ? { status: req.method === 'POST' ? 201 : 200, ms: 24, body: '{"cart":"C-100","items":2}' } : { status: 404, ms: 3, body: '' }),
  },
  [CATALOG]: {
    note: 'Syncs the product catalog from the PIM to the storefront search once a night at 02:00. It idles the rest of the day.',
    schedules: [{ flow: 'catalog-sync-flow', type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: { 'catalog-sync-flow': () => ({ ok: true, ms: 240000, log: [info('Synced 5400 products from the PIM to the storefront search')] }) },
  },
  [PRICES]: {
    note: 'Pulls price changes from the pricing service every 15 minutes.',
    schedules: [{ flow: 'price-feed-flow', type: 'cron', value: '0 */15 * * * ?', tz: 'UTC', enabled: true }],
    run: { 'price-feed-flow': () => ({ ok: true, ms: 4000, log: [info('Applied 37 price changes')] }) },
  },
}
