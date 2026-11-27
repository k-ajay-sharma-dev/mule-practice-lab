// The sample applications of the hyb-disconnected lab. Imports only platform-log.js, so the engine can load it without a cycle.
export const PACKAGES = {
  'carrier-rates-papi': {
    note: 'A carrier rates API of Brightmart. It has run on the data center server for months.',
    sample: { method: 'GET', path: '/rates' },
    handle({ node }, req) {
      if (req.path.split('?')[0] !== '/rates') return { status: 404, ms: 5, flow: 'carrier-rates-main', body: '{"message":"Resource not found"}' }
      return { status: 200, ms: 40, flow: 'get:\\rates', body: JSON.stringify({ rates: [{ carrier: 'Brightmart Freight Lines', perKg: 0.82 }], server: node ?? null }) }
    },
  },
  'label-print-papi': {
    note: 'A new shipping label API of Brightmart. It is not on any server yet.',
    sample: { method: 'GET', path: '/labels/L-1001' },
    handle({ node }, req) {
      const m = req.path.split('?')[0].match(/^\/labels\/([\w-]+)$/)
      if (!m) return { status: 404, ms: 5, flow: 'label-print-main', body: '{"message":"Resource not found"}' }
      return { status: 200, ms: 55, flow: 'get:\\labels\\(id)', body: JSON.stringify({ label: m[1], format: 'ZPL', server: node ?? null }) }
    },
  },
}
