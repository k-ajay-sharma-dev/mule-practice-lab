// The sample application of the hyb-server-group lab. Imports only platform-log.js, so the engine can load it without a cycle.
export const PACKAGES = {
  'price-lookup-sapi': {
    note: 'A price lookup API of Brightmart. Each answer names the server that handled it.',
    sample: { method: 'GET', path: '/prices/SKU-1001' },
    handle({ node }, req) {
      const m = req.path.split('?')[0].match(/^\/prices\/([\w-]+)$/)
      if (!m) return { status: 404, ms: 5, flow: 'price-lookup-main', body: '{"message":"Resource not found"}' }
      return { status: 200, ms: 28, flow: 'get:\\prices\\(sku)', body: JSON.stringify({ sku: m[1], price: 12.4, currency: 'USD', server: node ?? null }) }
    },
  },
}
