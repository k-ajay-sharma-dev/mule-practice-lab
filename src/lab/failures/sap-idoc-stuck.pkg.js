// The sample application of the sap-idoc-stuck lab. Imports only platform-log.js and the import free SAP engine, so
// the engine can load it without a cycle. The app reaches SAP through ctx.sap (src/lab/platform-sap.js), so its IDocs,
// tRFC calls and gateway registration show in the SAP screen.
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { ordersIdoc } from '../platform-sap.js'

export const SHOP = 'harbor-webshop-orders-sap'
export const AUDIT_FLOW = 'aleaud-listener-flow'
const ITEMS = [
  ['H-1250', 2],
  ['H-1300', 1],
  ['H-2000', 3],
  ['H-1250', 6],
]
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
export const statusCheckOf = (p) => String(p['idoc.statusCheck'] ?? '').trim().toLowerCase()
// the SAP connector configuration (sap:sap-config with simple connection provider and the listener fields)
export const cfgOf = (p) => ({
  applicationServerHost: p['sap.applicationServerHost'],
  systemNumber: p['sap.systemNumber'],
  client: p['sap.client'],
  username: p['sap.username'],
  password: p['sap.password'],
  gatewayHost: p['sap.gatewayHost'],
  gatewayService: p['sap.gatewayService'],
  programId: p['sap.programId'],
  connectionCount: p['sap.connectionCount'],
})

const el = {
  send: { flow: 'post:\\orders', at: 3, name: 'Send ORDERS05 IDoc', dsl: '<sap:send doc:name="Send ORDERS05 IDoc" config-ref="SAP_Config" key="ORDERS05" type="IDOC">' },
  listen: { flow: AUDIT_FLOW, at: 0, name: 'ALEAUD listener', dsl: '<sap:document-listener doc:name="ALEAUD listener" config-ref="SAP_Listener_Config" operationTimeout="10000">' },
}

export const PACKAGES = {
  [SHOP]: {
    note: `The web shop of Harbor posts each order to POST /orders. The flow maps it to an ORDERS05 IDoc (sold-to 4711, sales area 1000 10 00) and sends it with the Send operation of the SAP connector, which is a tRFC call of IDOC_INBOUND_ASYNCHRONOUS. The connection is sap.applicationServerHost, sap.systemNumber, sap.client, sap.username and sap.password. The flow ${AUDIT_FLOW} has a Document listener on sap.gatewayHost, sap.gatewayService and sap.programId with sap.connectionCount connections. It runs only when idoc.statusCheck is aleaud: it reads the ALEAUD01 IDocs that SAP sends back and logs an error for each IDoc that did not post (lab-made: the property switches the flow on).`,
    sample: { method: 'POST', path: '/orders', body: '{"source":"web","items":1}' },
    boot: needs('sap.applicationServerHost', 'sap.systemNumber', 'sap.client', 'sap.username', 'sap.password'),
    schedules: [{ flow: AUDIT_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/orders') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${SHOP}-main`, body: '{"message":"Resource not found"}' }
      const store = ctx.store
      store.n = (store.n ?? 0) + 1
      const po = `WEB-${8100 + store.n}`
      const [matnr, qty] = ITEMS[store.n % ITEMS.length]
      const idoc = ordersIdoc({ po, kunnr: '4711', items: [{ matnr, qty }] })
      const r = ctx.sap.sendIdoc(cfgOf(ctx.props), idoc)
      if (!r.ok) return { status: 500, ms: r.ms + 20, flow: el.send.flow, error: r.type, log: [muleError({ ...el.send, file: SHOP, type: r.type, message: r.error })], body: '{"message":"Internal server error"}' }
      store.sent = keep(store.sent, { po, tid: r.tid, t: ctx.now }, 20)
      return { status: 202, ms: r.ms + 30, flow: el.send.flow, log: [info(`Order ${po}: ORDERS05 sent to SAP ${idoc.sndprn}, tRFC TID ${r.tid}. Send IDoc completed.`)], body: `{"orderId":"${po}","status":"SENT_TO_SAP"}` }
    },
    run: {
      [AUDIT_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        if (statusCheckOf(props) !== 'aleaud') return { ok: true, ms: 2, log: [] }
        const r = ctx.sap.listen(cfgOf(props), props['sap.programId'])
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.listen, file: SHOP, type: r.type, message: r.error })] }
        const audits = r.idocs.filter((d) => d.mestyp === 'ALEAUD')
        if (!audits.length) return { ok: true, ms: 20, log: [] }
        const log = []
        for (const d of audits) {
          const states = d.segments.filter((x) => x.name === 'E1STATE').map((x) => x.fields)
          const bad = states.filter((x) => x.STATUS !== '53')
          log.push(info(`ALEAUD01 ${d.docnum} from SAP: ${states.length} status${states.length === 1 ? '' : 'es'}, ${states.length - bad.length} posted (53), ${bad.length} not posted`))
          for (const x of bad) log.push(line('ERROR', `IDoc ${x.DOCNUM} for order ${x.STAPA1} has status ${x.STATUS} in SAP: ${x.STATXT}. Alert sent to the order desk.`))
          for (const x of states) store.audits = keep(store.audits, { t: now, docnum: x.DOCNUM, status: x.STATUS, po: x.STAPA1 })
        }
        store.lastAudit = now
        if (log.length > 12) log.splice(11, log.length - 11, warn(`${log.length - 11} more lines left out`))
        return { ok: true, ms: 60, log, store }
      },
    },
  },
}
