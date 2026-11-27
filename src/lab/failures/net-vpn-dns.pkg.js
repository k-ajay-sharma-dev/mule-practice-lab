// The sample application of the net-vpn-dns lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

export const NAME = 'brightmart-erp-stock-sync'
export const FLOW = 'erp-stock-flow'

const el = { at: 2, name: 'Get stock from ERP', dsl: '<http:request method="GET" config-ref="ERP_HTTPS" path="/api/stock" />' }

export const PACKAGES = {
  [NAME]: {
    note: 'Every 5 minutes it reads the stock levels from the ERP in the Brightmart data center, at https://erp.host:erp.port/api/stock, and updates the web shop. It runs in a private space and reaches the data center over the VPN.',
    boot: needs('erp.host', 'erp.port'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store } = ctx
        const port = Number(props['erp.port'])
        const r = ctx.network.request(props['erp.host'], { port, method: 'GET', path: '/api/stock' })
        const log = [info(`Reading stock from ${props['erp.host']}:${port}`)]
        if (!r.ok) {
          log.push(muleError({ flow: FLOW, file: NAME, ...el, type: r.type, message: r.message }))
          // a connect timeout waits for the whole connection timeout of the requester
          return { ok: false, ms: r.kind === 'dns' ? 200 : 30000, errorType: r.type, log }
        }
        log.push(info(`ERP answered 200 with 1,240 stock rows. The web shop is up to date.`))
        return { ok: true, ms: 900, log, store: { synced: (store.synced ?? 0) + 1 } }
      },
    },
  },
}
