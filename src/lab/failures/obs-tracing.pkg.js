// The sample applications of the obs-tracing lab. Imports only platform-log.js, so the engine can load it without a
// cycle. The Process API returns r.spans, the spans of its own operations, so the trace waterfall shows them.
import { needs, warn } from '../platform-log.js'

export const EAPI = 'basket-checkout-eapi'
export const PAPI = 'basket-checkout-papi'
const CARRIER = 'https://rates.seaway-freight.lab/v2/rates'
const json = (x) => JSON.stringify(x)
const itemsOf = (body) => {
  try {
    return Math.max(1, (JSON.parse(body ?? '{}').items ?? []).length)
  } catch {
    return 1
  }
}
// shipping.quote.mode: per-item (one carrier call for each item, one after the other), batch (one call for the whole
// basket) or parallel (a Scatter-Gather with one route per item). Lab made: the carrier answers each call in 230 to
// 270 ms, a batch call in 290 ms plus 6 ms an item, and takes parallel calls without a rate limit.
export const modeOf = (props) => String(props['shipping.quote.mode'] ?? 'per-item').trim().toLowerCase()
function quote(mode, n) {
  const one = (i) => 230 + ((i * 37) % 41)
  if (mode === 'batch') {
    const ms = 290 + 6 * n
    return { ms: ms + 2, span: { op: 'flow-ref shipping-quote', flow: 'shipping-quote', ms: ms + 2, kids: [{ op: `http:request POST ${CARRIER}/batch`, kind: 'client', ms }] } }
  }
  if (mode === 'parallel') {
    const kids = Array.from({ length: n }, (_, i) => ({ op: `http:request POST ${CARRIER} (route ${i + 1})`, kind: 'client', ms: one(i), at: 3 }))
    const ms = 3 + Math.max(...kids.map((k) => k.ms)) + 4
    return { ms, span: { op: 'scatter-gather shipping-quote', flow: 'shipping-quote', ms, kids } }
  }
  const kids = Array.from({ length: n }, (_, i) => ({ op: `http:request POST ${CARRIER} (item ${i + 1})`, kind: 'client', ms: one(i) }))
  const ms = kids.reduce((t, k) => t + k.ms + 1, 2)
  return { ms, span: { op: 'foreach item: shipping-quote', flow: 'shipping-quote', ms, kids } }
}

export const PACKAGES = {
  [EAPI]: {
    layer: 'Experience',
    traced: true,
    note: `POST /checkout of the Harbor web shop. It calls the checkout Process API at papi.url, POST /orders, with responseTimeout 10000 ms.`,
    sample: { method: 'POST', path: '/checkout', body: '{"items":["H-100","H-200"]}' },
    boot: needs('papi.url'),
    handle(ctx, req) {
      if (req.path.split('?')[0] !== '/checkout' || req.method !== 'POST') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${EAPI}-main`, body: json({ message: 'Resource not found' }) }
      const flow = 'post:\\checkout:basket-checkout-config'
      const r = ctx.call('papi.url', { method: 'POST', path: '/orders', body: req.body }, 10000)
      if (r.error) return { status: 502, ms: r.ms + 8, error: r.error, flow, body: json({ message: 'Checkout failed' }) }
      return { status: 201, ms: r.ms + 18, flow, body: r.body }
    },
  },
  [PAPI]: {
    layer: 'Process',
    traced: true,
    note: 'POST /orders checks stock, asks the carrier Seaway Freight for a shipping quote and reserves the payment. shipping.quote.mode is per-item, batch or parallel.',
    sample: { method: 'POST', path: '/orders', body: '{"items":["H-100","H-200"]}' },
    handle(ctx, req) {
      if (req.path.split('?')[0] !== '/orders' || req.method !== 'POST') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${PAPI}-main`, body: json({ message: 'Resource not found' }) }
      const n = itemsOf(req.body)
      const flow = 'post:\\orders:basket-checkout-papi-config'
      const q = quote(modeOf(ctx.props), n)
      const spans = [{ op: 'db:select stock', kind: 'client', ms: 38 }, q.span, { op: 'http:request POST https://payments.harbor.lab/v2/reservations', kind: 'client', ms: 61 }]
      const ms = 6 + 38 + 1 + q.ms + 1 + 61 + 4
      const log = q.ms > 1000 ? [warn(`Shipping quote took ${q.ms} ms for ${n} items, mode ${modeOf(ctx.props)}`)] : []
      return { status: 201, ms, flow, spans, log, body: json({ orderId: `O-${8000 + (Math.floor(ctx.now / 60000) % 1000)}`, items: n, shippingQuoteMs: q.ms }) }
    },
  },
}
