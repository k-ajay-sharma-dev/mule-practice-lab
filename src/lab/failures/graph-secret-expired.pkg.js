// The sample application of the graph-secret-expired lab. Imports only platform-log.js and the import free Graph
// engine, so the engine can load it without a cycle. It exports web orders to Dynamics 365 as sales orders.
import { info, muleError, needs } from '../platform-log.js'
import { API_PATH, errorText, httpMessage, httpType, tokenFor } from '../platform-msgraph.js'

export const EXPORT = 'harbor-d365-order-export'
export const EXPORT_FLOW = 'order-export-flow'
const PAGE = 40
const cfgOf = (p) => ({ tenant: p['azure.tenantId'], clientId: p['azure.clientId'], clientSecret: p['azure.clientSecret'] })
const el = {
  token: { flow: EXPORT_FLOW, at: 1, name: 'Get Dataverse token', dsl: '<http:request doc:name="Get Dataverse token" method="POST" config-ref="Entra_Token_Config" path="/${azure.tenantId}/oauth2/v2.0/token">' },
  upsert: { flow: EXPORT_FLOW, at: 3, name: 'Upsert sales order', dsl: '<http:request doc:name="Upsert sales order" method="PATCH" config-ref="Dataverse_Config" path="/salesorders(harbor_weborderid=\'#[vars.orderId]\')">' },
}
export const orderId = (n) => `W-${6001 + n}`

export const PACKAGES = {
  [EXPORT]: {
    note: `Exports web orders to Dynamics 365. The flow ${EXPORT_FLOW} runs every 5 minutes. It gets a token for dataverse.url with the client credentials grant of azure.clientId and the secure property azure.clientSecret, then upserts each waiting order with PATCH /salesorders(harbor_weborderid='W-...'), up to ${PAGE} a run. Lab-made: the web shop leaves one order in the app's object store every 5 minutes; a failed run leaves them waiting.`,
    boot: needs('azure.tenantId', 'azure.clientId', 'azure.clientSecret', 'dataverse.url'),
    schedules: [{ flow: EXPORT_FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [EXPORT_FLOW]: (ctx) => {
        const { props, now } = ctx
        const store = { ...ctx.store }
        store.made = (store.made ?? 0) + 1
        store.sent ??= 0
        const url = String(props['dataverse.url'] ?? '').trim().replace(/\/+$/, '')
        const tok = tokenFor(ctx.msgraph, store, cfgOf(props), now, `${url}/.default`)
        if (!tok.ok) {
          const type = httpType(tok.status)
          return { ok: false, ms: 150, errorType: type, log: [muleError({ ...el.token, file: EXPORT, type, message: `${httpMessage('POST', `https://login.microsoftonline.com/${props['azure.tenantId']}/oauth2/v2.0/token`, tok)} ${errorText(tok)}` })], store }
        }
        let n = 0
        const end = Math.min(store.made, store.sent + PAGE)
        while (store.sent < end) {
          const id = orderId(store.sent)
          const path = `${API_PATH}/salesorders(harbor_weborderid='${id}')`
          const r = ctx.msgraph.dataverse(tok.token, 'PATCH', `${url}${path}`, { name: `Web order ${id}`, ordernumber: `ORD-${id.slice(2)}-WEB`, totalamount: 40 + ((store.sent * 37) % 160) })
          if (!r.ok) {
            const type = httpType(r.status)
            return { ok: false, ms: 150 + n * 70, errorType: type, log: [info(`Exported ${n} orders`), muleError({ ...el.upsert, file: EXPORT, type, message: `${httpMessage('PATCH', `${url}${path}`, r)} ${errorText(r)}` })], store }
          }
          store.sent++
          n++
        }
        return { ok: true, ms: 150 + n * 70, log: n ? [info(`Exported ${n} web orders to Dataverse, ${store.made - store.sent} waiting`)] : [], store }
      },
    },
  },
}
