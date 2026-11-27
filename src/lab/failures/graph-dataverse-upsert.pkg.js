// The sample application of the graph-dataverse-upsert lab. Imports only platform-log.js and the import free Graph
// engine, so the engine can load it without a cycle. It writes customer changes of the web shop to Dynamics 365.
import { info, muleError, needs } from '../platform-log.js'
import { API_PATH, errorText, httpMessage, httpType, tokenFor } from '../platform-msgraph.js'

export const CUSTOMER_SYNC = 'brightmart-d365-customer-sync'
const FLOW = 'post:\\customers'
export const CUSTOMERS = [
  ['C-1001', 'Northgate Grocers', 'Leeds'],
  ['C-1002', 'Bluebay Kitchens', 'Bristol'],
  ['C-1003', 'Larch and Pine Stores', 'York'],
  ['C-1004', 'Saltmarsh Deli', 'Hull'],
  ['C-1005', 'Ferry Lane Market', 'Dover'],
  ['C-1006', 'Copperleaf Foods', 'Bath'],
  ['C-1007', 'Moorgate Pantry', 'Durham'],
  ['C-1008', 'Riverside Provisions', 'Exeter'],
]
const cfgOf = (p) => ({ tenant: p['azure.tenantId'], clientId: p['azure.clientId'], clientSecret: p['azure.clientSecret'] })
const el = {
  token: { flow: FLOW, at: 1, name: 'Get Dataverse token', dsl: '<http:request doc:name="Get Dataverse token" method="POST" config-ref="Entra_Token_Config" path="/${azure.tenantId}/oauth2/v2.0/token">' },
  create: { flow: FLOW, at: 3, name: 'Create account', dsl: '<http:request doc:name="Create account" method="POST" config-ref="Dataverse_Config" path="/accounts">' },
  upsert: { flow: FLOW, at: 3, name: 'Upsert account', dsl: '<http:request doc:name="Upsert account" method="PATCH" config-ref="Dataverse_Config" path="/accounts(accountnumber=\'#[payload.accountNumber]\')">' },
}

export const PACKAGES = {
  [CUSTOMER_SYNC]: {
    note: `Receives customer changes of the web shop on POST /customers with {"accountNumber","name","city","phone"} and writes them to the account table of Dynamics 365 (dataverse.url). dynamics.writeMode create sends POST /accounts for each change; upsert sends PATCH /accounts(accountnumber='...'), which needs an active alternate key on accountnumber. A change without accountNumber is one of the known customers, in turn (lab-made, for the steady traffic of the lab).`,
    sample: { method: 'POST', path: '/customers', body: '{"accountNumber":"C-1003","name":"Larch and Pine Stores","city":"York","phone":"01904 550 210"}' },
    boot: needs('azure.tenantId', 'azure.clientId', 'azure.clientSecret', 'dataverse.url', 'dynamics.writeMode'),
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/customers') return { status: 404, ms: 4, flow: `${CUSTOMER_SYNC}-main`, error: 'APIKIT:NOT_FOUND', body: '{"message":"Resource not found"}' }
      let o
      try {
        o = JSON.parse(req.body || '{}')
      } catch {
        return { status: 400, ms: 4, flow: FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid JSON"}' }
      }
      const store = (ctx.app.store ??= {})
      store.n = (store.n ?? 0) + 1
      const [no, name, city] = o.accountNumber ? [String(o.accountNumber), o.name, o.city] : CUSTOMERS[store.n % CUSTOMERS.length]
      const fields = { name: name ?? no, address1_city: city ?? '', telephone1: o.phone ?? `0161 555 ${String(1000 + (store.n % 9000)).slice(-4)}` }
      const url = String(ctx.props['dataverse.url'] ?? '').trim().replace(/\/+$/, '')
      const tok = tokenFor(ctx.msgraph, store, cfgOf(ctx.props), ctx.now, `${url}/.default`)
      if (!tok.ok) {
        const type = httpType(tok.status)
        return { status: 500, ms: 150, flow: FLOW, error: type, log: [muleError({ ...el.token, file: CUSTOMER_SYNC, type, message: `${httpMessage('POST', 'https://login.microsoftonline.com/token', tok)} ${errorText(tok)}` })], body: '{"message":"Internal server error"}' }
      }
      const upsert = String(ctx.props['dynamics.writeMode'] ?? '').trim() === 'upsert'
      const path = upsert ? `${API_PATH}/accounts(accountnumber='${no.replace(/'/g, "''")}')` : `${API_PATH}/accounts`
      const r = upsert ? ctx.msgraph.dataverse(tok.token, 'PATCH', `${url}${path}`, fields) : ctx.msgraph.dataverse(tok.token, 'POST', `${url}${path}`, { accountnumber: no, ...fields })
      if (!r.ok) {
        const type = httpType(r.status)
        const e = upsert ? el.upsert : el.create
        return { status: r.status === 412 ? 409 : 500, ms: r.ms + 150, flow: FLOW, error: type, log: [muleError({ ...e, file: CUSTOMER_SYNC, type, message: `${httpMessage(upsert ? 'PATCH' : 'POST', `${url}${path}`, r)} ${errorText(r)}` })], body: JSON.stringify({ message: errorText(r) }) }
      }
      return { status: 200, ms: r.ms + 150, flow: FLOW, log: [info(`Customer ${no} ${upsert ? 'upserted' : 'created'} in Dataverse`)], body: JSON.stringify({ accountNumber: no, entity: r.headers['OData-EntityId'] }) }
    },
  },
}
