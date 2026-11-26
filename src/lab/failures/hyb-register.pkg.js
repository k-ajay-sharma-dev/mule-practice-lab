// The sample application of the hyb-register lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info } from '../platform-log.js'

export const PACKAGES = {
  'dock-booking-sapi': {
    note: 'A dock booking API of the Harbor warehouse. It answers which loading dock a truck gets, and says which server answered.',
    sample: { method: 'GET', path: '/docks' },
    handle({ node }, req) {
      if (req.path.split('?')[0] !== '/docks') return { status: 404, ms: 6, flow: 'dock-booking-main', body: '{"message":"Resource not found"}' }
      return { status: 200, ms: 35, flow: 'get:\\docks', log: [info(`Dock list read on ${node ?? 'the runtime'}`)], body: JSON.stringify({ docks: [{ dock: 'D-04', free: true }, { dock: 'D-07', free: false }], server: node ?? null }) }
    },
  },
}
