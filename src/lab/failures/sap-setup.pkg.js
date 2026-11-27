// The sample application of the sap-setup lab. Imports only platform-log.js and the import free SAP engine, so the
// engine can load it without a cycle. It sends ORDERS05 IDocs to SAP and listens for the IDocs SAP sends back.
import { info, line, muleError, needs } from '../platform-log.js'
import { ordersIdoc } from '../platform-sap.js'

export const BRIDGE = 'brightmart-sap-idoc-bridge'
export const BRIDGE_JAR = `${BRIDGE}-1.0.0-mule-application.jar`
export const LISTEN_FLOW = 'sap-idoc-listener-flow'
const keep = (list, item, n = 20) => [...(list ?? []), item].slice(-n)
export const bridgeCfg = (p) => ({
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
  send: { flow: 'post:\\orders', at: 2, name: 'Send ORDERS05', dsl: '<sap:send doc:name="Send ORDERS05" config-ref="SAP_Config" key="ORDERS05" type="IDOC">' },
  listen: { flow: LISTEN_FLOW, at: 0, name: 'SAP Document listener', dsl: '<sap:document-listener doc:name="SAP Document listener" config-ref="SAP_Listener_Config">' },
}

export const PACKAGES = {
  [BRIDGE]: {
    note: `The IDoc bridge of Brightmart. POST /orders with {"customer","material","qty"} sends an ORDERS05 IDoc from logical system BRIGHTWEB to SAP with the Send operation of the SAP connector. The flow ${LISTEN_FLOW} is a Document listener that registers sap.programId at the gateway sap.gatewayHost and sap.gatewayService with sap.connectionCount connections, and logs each IDoc SAP sends: INVOIC02 invoices, and ALEAUD01 audits where a status other than 53 is an error. The SAP config reads sap.applicationServerHost, sap.systemNumber, sap.client, sap.username and the secure property sap.password.`,
    sample: { method: 'POST', path: '/orders', body: '{"customer":"4712","material":"H-1300","qty":2}' },
    boot: needs('sap.applicationServerHost', 'sap.systemNumber', 'sap.client', 'sap.username', 'sap.password', 'sap.gatewayHost', 'sap.gatewayService', 'sap.programId'),
    schedules: [{ flow: LISTEN_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/orders') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${BRIDGE}-main`, body: '{"message":"Resource not found"}' }
      let o
      try {
        o = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 5, flow: el.send.flow, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid JSON"}' }
      }
      ctx.store.n = (ctx.store.n ?? 0) + 1
      const po = o.po ?? `TEST-${9000 + ctx.store.n}`
      const idoc = ordersIdoc({ po, kunnr: String(o.customer ?? '4712'), items: [{ matnr: o.material ?? 'H-1300', qty: Number(o.qty ?? 1) }] })
      const r = ctx.sap.sendIdoc(bridgeCfg(ctx.props), idoc)
      if (!r.ok) return { status: 500, ms: r.ms + 20, flow: el.send.flow, error: r.type, log: [muleError({ ...el.send, file: BRIDGE, type: r.type, message: r.error })], body: '{"message":"Internal server error"}' }
      ctx.store.sent = keep(ctx.store.sent, { po, tid: r.tid, t: ctx.now })
      return { status: 202, ms: r.ms + 30, flow: el.send.flow, log: [info(`Order ${po}: ORDERS05 sent, tRFC TID ${r.tid}`)], body: `{"orderId":"${po}","tid":"${r.tid}"}` }
    },
    run: {
      [LISTEN_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const r = ctx.sap.listen(bridgeCfg(props), props['sap.programId'])
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.listen, file: BRIDGE, type: r.type, message: r.error })] }
        if (!r.idocs.length) return { ok: true, ms: 10, log: [] }
        const log = []
        let errors = 0
        for (const d of r.idocs) {
          if (d.mestyp === 'INVOIC') {
            const k = d.segments.find((x) => x.name === 'E1EDK01')?.fields ?? {}
            const sum = d.segments.find((x) => x.name === 'E1EDS01')?.fields ?? {}
            store.invoices = keep(store.invoices, { t: now, docnum: d.docnum, belnr: k.BELNR, total: sum.SUMME })
            log.push(info(`${d.idoctp} ${d.docnum} received: invoice ${k.BELNR ?? ''} over ${sum.SUMME ?? '?'} ${sum.WAERQ ?? ''}`))
          } else if (d.mestyp === 'ALEAUD') {
            for (const x of d.segments.filter((z) => z.name === 'E1STATE').map((z) => z.fields)) {
              if (x.STATUS === '53') continue
              errors++
              log.push(line('ERROR', `IDoc ${x.DOCNUM} has status ${x.STATUS} in SAP: ${x.STATXT}`))
            }
          } else log.push(info(`${d.idoctp} ${d.docnum} received`))
        }
        store.received = (store.received ?? 0) + r.idocs.length
        return { ok: errors === 0, ms: 40, errorType: errors ? 'SAP:IDOC_STATUS' : null, errors, log, store } // lab-made error type
      },
    },
  },
}
