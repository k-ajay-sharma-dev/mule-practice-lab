// The sample application of the end to end lab of SAP. Imports only platform-log.js and the import free SAP engine, so
// the engine can load it without a cycle. POST /orders sends a web shop order to SAP as an ORDERS05 IDoc; the Document
// listener takes the ALEAUD01 audit IDocs SAP sends back and keeps the status of each order for GET /orders/{orderId}.
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { ordersIdoc } from '../platform-sap.js'

export const NAME = 'webshop-sap-orders'
export const ASSET = 'sap-orders-api'
export const MAIN = 'sap-orders-api-main'
export const LISTEN = 'sap-status-listener-flow'
const POST_FLOW = 'post:\\orders:application\\json:sap-orders-api-config'
const GET_FLOW = 'get:\\orders\\(orderId):sap-orders-api-config'
const keep = (list, item, n = 20) => [...(list ?? []), item].slice(-n)
const json = (x) => JSON.stringify(x)
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
// the DataWeave of the lab: the JSON order of the web shop as an ORDERS05 IDoc (sold-to in E1EDKA1, PO number in E1EDK02)
export const toIdoc = (o) => ordersIdoc({ po: String(o.orderId), kunnr: String(o.customer), items: (o.items ?? []).map((it) => ({ matnr: String(it.material), qty: Number(it.qty) })) })
const el = {
  send: { flow: POST_FLOW, at: 2, name: 'Send ORDERS05', dsl: '<sap:send doc:name="Send ORDERS05" config-ref="SAP_Config" key="ORDERS05" type="IDOC">' },
  listen: { flow: LISTEN, at: 0, name: 'SAP Document listener', dsl: '<sap:document-listener doc:name="SAP Document listener" config-ref="SAP_Listener_Config">' },
}

export const PACKAGES = {
  [NAME]: {
    note: `SAP Orders API, built in Studio on the spec of Exchange. POST /orders with {"orderId","customer","items":[{"material","qty"}]} maps the order to an ORDERS05 IDoc in DataWeave and sends it from logical system BRIGHTWEB with the Send operation of the SAP connector, then answers 202: SAP took the tRFC LUW. ${LISTEN} is a Document listener that registers sap.programId at the gateway and reads the ALEAUD01 audits SAP sends back: 53 makes the order POSTED with its sales order number, 51 makes it FAILED with the SAP message. GET /orders/{orderId} answers that status. Properties: sap.applicationServerHost, sap.systemNumber, sap.client, sap.username, sap.password (protected), sap.gatewayHost, sap.gatewayService, sap.programId, sap.connectionCount, api.id and the environment client ID and secret.`,
    sample: { method: 'GET', path: '/orders/WEB-81001' },
    traced: true,
    boot: needs('sap.applicationServerHost', 'sap.systemNumber', 'sap.client', 'sap.username', 'sap.password', 'sap.gatewayHost', 'sap.gatewayService', 'sap.programId'),
    schedules: [{ flow: LISTEN, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const path = req.path.split('?')[0]
      const one = path.match(/^\/orders\/([\w-]+)$/)
      if (req.method === 'GET' && one) {
        const o = store.orders?.[one[1]]
        return o ? { status: 200, ms: 6, flow: GET_FLOW, body: json({ orderId: one[1], ...o }) } : { status: 404, ms: 5, flow: GET_FLOW, body: json({ message: `No order ${one[1]}` }) }
      }
      if (req.method !== 'POST' || path !== '/orders') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: MAIN, body: json({ message: 'Resource not found' }) }
      let o
      try {
        o = JSON.parse(req.body || 'null')
      } catch {
        o = null
      }
      if (!o?.orderId || !o.customer || !Array.isArray(o.items) || !o.items.length) return { status: 400, ms: 5, flow: POST_FLOW, error: 'APIKIT:BAD_REQUEST', log: [warn('APIKIT:BAD_REQUEST: the body needs orderId, customer and items')], body: json({ message: 'Bad request: orderId, customer and items are required' }) }
      const r = ctx.sap.sendIdoc(cfgOf(ctx.props), toIdoc(o))
      if (!r.ok) return { status: 503, ms: r.ms + 20, flow: POST_FLOW, error: r.type, log: [muleError({ ...el.send, file: NAME, type: r.type, message: r.error })], body: json({ message: 'SAP is not available. Send the order again later.' }) }
      store.orders = Object.fromEntries([...Object.entries(store.orders ?? {}), [o.orderId, { status: 'SENT', tid: r.tid, t: ctx.now }]].slice(-30))
      return { status: 202, ms: r.ms + 30, flow: POST_FLOW, log: [info(`Order ${o.orderId} for customer ${o.customer}: ORDERS05 sent from BRIGHTWEB, tRFC TID ${r.tid}`)], body: json({ orderId: o.orderId, status: 'SENT', tid: r.tid }) }
    },
    run: {
      [LISTEN]: (ctx) => {
        // lab: the Production SAP system is not part of this lab, so the listener in Production only says where it would register
        if (ctx.app.env === 'Production') return { ok: true, ms: 5, log: ctx.app.logs.some((l) => /lab: the Production SAP/.test(l.text)) ? [] : [info(`lab: the Production SAP system is not part of this lab. Here the listener registers ${ctx.props['sap.programId']} at ${ctx.props['sap.gatewayHost']} ${ctx.props['sap.gatewayService']}.`)] }
        const store = (ctx.app.store ??= {})
        const r = ctx.sap.listen(cfgOf(ctx.props), ctx.props['sap.programId'])
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.listen, file: NAME, type: r.type, message: r.error })] }
        const log = []
        let errors = 0
        for (const d of r.idocs.filter((x) => x.mestyp === 'ALEAUD')) {
          for (const x of d.segments.filter((z) => z.name === 'E1STATE').map((z) => z.fields)) {
            const po = x.STAPA1
            const order = store.orders?.[po]
            if (!order) continue
            if (x.STATUS === '53') {
              const vbeln = ((String(x.STATXT).match(/Order (\d+)/) ?? [])[1] ?? '').padStart(10, '0')
              Object.assign(order, { status: 'POSTED', salesOrder: vbeln, idoc: x.DOCNUM, message: x.STATXT })
              log.push(info(`ALEAUD01 ${d.docnum}: order ${po}, IDoc ${x.DOCNUM} status 53. ${x.STATXT}. Status of ${po} is POSTED.`))
            } else {
              errors++
              Object.assign(order, { status: 'FAILED', idoc: x.DOCNUM, message: x.STATXT })
              store.failures = keep(store.failures, { po, idoc: x.DOCNUM, status: x.STATUS, message: x.STATXT, t: ctx.now })
              log.push(line('ERROR', `ALEAUD01 ${d.docnum}: order ${po}, IDoc ${x.DOCNUM} status ${x.STATUS} in SAP: ${x.STATXT}. The IDoc waits in SAP for BD87.`))
            }
          }
        }
        return { ok: errors === 0, ms: 30, errorType: errors ? 'SAP:IDOC_STATUS' : null, errors, log } // lab-made error type
      },
    },
  },
}
