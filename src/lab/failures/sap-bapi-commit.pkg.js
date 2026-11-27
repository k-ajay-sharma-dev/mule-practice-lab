// The sample application of the sap-bapi-commit lab. Imports only platform-log.js, so the engine can load it without a
// cycle. The app reaches SAP through ctx.sap (src/lab/platform-sap.js), so its RFC sessions and sales orders show in
// the SAP screen.
import { info, muleError, needs, warn } from '../platform-log.js'

export const BAPI_APP = 'brightmart-b2b-salesorder-bapi'
export const CREATE = 'BAPI_SALESORDER_CREATEFROMDAT2'
const FLOW = 'post:\\sales-orders'
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'
// none: Execute BAPI only. separate: a second Execute BAPI with BAPI_TRANSACTION_COMMIT after it, outside any
// transaction. scope: both inside a Transactional scope, so they share one SAP session (lab-made: a property picks the flow).
export const txModeOf = (p) => String(p['sap.transaction'] ?? '').trim().toLowerCase()
export const checksReturn = (p) => yes(p['bapi.checkReturn'])
export const cfgOf = (p) => ({ applicationServerHost: p['sap.applicationServerHost'], systemNumber: p['sap.systemNumber'], client: p['sap.client'], username: p['sap.username'], password: p['sap.password'] })

const el = {
  scope: { at: 2, name: 'Order transaction', dsl: '<try doc:name="Order transaction" transactionalAction="ALWAYS_BEGIN" transactionType="LOCAL">' },
  create: { at: 3, name: 'Create sales order', dsl: `<sap:sync-rfc doc:name="Create sales order" config-ref="SAP_Config" key="${CREATE}" transactionalAction="\${sap.transactionalAction}">` },
  commit: { at: 4, name: 'Commit', dsl: '<sap:sync-rfc doc:name="Commit" config-ref="SAP_Config" key="BAPI_TRANSACTION_COMMIT">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: BAPI_APP, ...el[where], type, message })
const retLine = (r) => r.map((x) => `${x.TYPE} ${x.ID} ${x.NUMBER} ${x.MESSAGE}`).join(' | ')

export const PACKAGES = {
  [BAPI_APP]: {
    note: `B2B partners post orders to POST /sales-orders with a customer and items. The flow calls ${CREATE} with the SAP connector (sap.applicationServerHost, sap.systemNumber, sap.client, sap.username, sap.password) and answers 201 with the SALESDOCUMENT number. sap.transaction is none (only the BAPI), separate (a second Execute BAPI with BAPI_TRANSACTION_COMMIT after it) or scope (the BAPI and the commit inside one Transactional scope, so one SAP session). bapi.checkReturn true makes the flow read the RETURN table: a row of TYPE E or A rolls back and answers 422.`,
    sample: { method: 'POST', path: '/sales-orders', body: '{"customer":"4712","items":[{"material":"H-1300","qty":2}]}' },
    boot: needs('sap.applicationServerHost', 'sap.client', 'sap.username', 'sap.password', 'sap.transaction'),
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/sales-orders') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${BAPI_APP}-main`, body: '{"message":"Resource not found"}' }
      let order
      try {
        order = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 5, flow: FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid JSON"}' }
      }
      const { store, props } = ctx
      store.n = (store.n ?? 0) + 1
      const po = order.po ?? `B2B-${5100 + store.n}`
      const params = {
        ORDER_HEADER_IN: { DOC_TYPE: 'TA', SALES_ORG: '1000', DISTR_CHAN: '10', DIVISION: '00', PURCH_NO_C: po },
        ORDER_PARTNERS: [{ PARTN_ROLE: 'AG', PARTN_NUMB: String(order.customer ?? '') }],
        ORDER_ITEMS_IN: (order.items ?? []).map((x, i) => ({ ITM_NUMBER: String((i + 1) * 10).padStart(6, '0'), MATERIAL: x.material, TARGET_QTY: String(x.qty) })),
      }
      const cfg = cfgOf(props)
      const mode = txModeOf(props)
      const check = checksReturn(props)
      const sap = ctx.sap
      const log = []
      let tx = null
      if (mode === 'scope') {
        const b = sap.begin(cfg)
        if (!b.ok) return { status: 500, ms: b.ms, flow: FLOW, error: b.type, log: [block('scope', b.type, b.error)], body: '{"message":"Internal server error"}' }
        tx = b.transaction
      }
      const r = sap.executeBapi(cfg, CREATE, params, tx ? { transaction: tx } : {})
      if (!r.ok) {
        if (tx) sap.rollback(tx)
        return { status: 500, ms: r.ms, flow: FLOW, error: r.type, log: [block('create', r.type, r.error)], body: '{"message":"Internal server error"}' }
      }
      const vbeln = r.export?.SALESDOCUMENT ?? ''
      const errors = r.RETURN.filter((x) => x.TYPE === 'E' || x.TYPE === 'A')
      log.push((errors.length ? warn : info)(`${po}: ${CREATE} RETURN ${retLine(r.RETURN)}`))
      if (errors.length && check) {
        if (tx) sap.rollback(tx)
        store.rejected = keep(store.rejected, { t: ctx.now, po, m: errors[0].MESSAGE }, 20)
        log.push(info(`${po}: RETURN has TYPE ${errors[0].TYPE}, so the flow rolled back and answers 422`))
        return { status: 422, ms: r.ms + 30, flow: FLOW, log, body: JSON.stringify({ message: errors[0].MESSAGE, po }) }
      }
      if (tx) {
        const c = sap.commit(tx)
        log.push(info(`${po}: BAPI_TRANSACTION_COMMIT WAIT X in session ${tx}: ${c.saved.length ? `order ${c.saved.map(Number).join(', ')} committed` : 'nothing to commit'}`))
      } else if (mode === 'separate') {
        const c = sap.executeBapi(cfg, 'BAPI_TRANSACTION_COMMIT', { WAIT: 'X' })
        if (!c.ok) return { status: 500, ms: c.ms, flow: FLOW, error: c.type, log: [...log, block('commit', c.type, c.error)], body: '{"message":"Internal server error"}' }
        log.push(info(`${po}: BAPI_TRANSACTION_COMMIT returned an empty RETURN (session ${c.session})`))
      }
      store.created = keep(store.created, { t: ctx.now, po, vbeln, mode, ok: !errors.length }, 30)
      return { status: 201, ms: r.ms + 60, flow: FLOW, log, body: JSON.stringify({ po, salesDocument: vbeln }) }
    },
  },
}
