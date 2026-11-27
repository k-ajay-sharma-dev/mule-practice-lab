// The sample application of the end to end lab of Dynamics 365. Imports only platform-log.js and the import free Graph
// engine, so the engine can load it without a cycle. PUT /customers/{customerNo} upserts a Contact in Dataverse with
// PATCH on the alternate key brightmart_customerno; a record Dataverse refuses is answered 400 and kept in the reject
// store of the app, which GET /rejects lists.
import { info, muleError, needs, warn } from '../platform-log.js'
import { API_PATH, errorText, httpMessage, httpType, tokenFor } from '../platform-msgraph.js'

export const NAME = 'contact-dataverse-sync'
export const ASSET = 'customer-sync-api'
export const MAIN = 'customer-sync-api-main'
const PUT_FLOW = 'put:\\customers\\(customerNo):application\\json:customer-sync-api-config'
const GET_FLOW = 'get:\\rejects:customer-sync-api-config'
const json = (x) => JSON.stringify(x)
const word = (v) => String(v ?? '').trim()
const cfgOf = (p) => ({ tenant: p['azure.tenantId'], clientId: p['azure.clientId'], clientSecret: p['azure.clientSecret'] })
// the DataWeave of the lab: the customer of the web shop as a Dataverse contact
export const toContact = (c) => ({ firstname: word(c.firstName), lastname: word(c.lastName), emailaddress1: word(c.email), telephone1: word(c.phone) })
const el = {
  token: { flow: PUT_FLOW, at: 1, name: 'Get token', dsl: '<http:request doc:name="Get token" method="POST" config-ref="Entra_Token_Config" path="/${azure.tenantId}/oauth2/v2.0/token">' },
  upsert: { flow: PUT_FLOW, at: 3, name: 'Upsert contact', dsl: '<http:request doc:name="Upsert contact" method="PATCH" config-ref="Dataverse_Config" path="/contacts(brightmart_customerno=\'#[attributes.uriParams.customerNo]\')">' },
}

export const PACKAGES = {
  [NAME]: {
    note: `Customer Sync API, built in Studio on the spec of Exchange. PUT /customers/{customerNo} with {"firstName","lastName","email","phone"} maps the customer to a contact in DataWeave and sends PATCH /contacts(brightmart_customerno='...') to the Dataverse Web API with a token of the client credentials grant: an upsert on the alternate key. A record Dataverse refuses (400 or 412) is answered 400 and kept in the reject store; GET /rejects lists the open ones, and a later successful PUT of the same customer closes its reject. Properties: azure.tenantId, azure.clientId, azure.clientSecret (protected), dataverse.url, api.id and the environment client ID and secret. The token is cached until 5 minutes before it expires.`,
    sample: { method: 'GET', path: '/rejects' },
    traced: true,
    boot: needs('azure.tenantId', 'azure.clientId', 'azure.clientSecret', 'dataverse.url'),
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/rejects') return { status: 200, ms: 6, flow: GET_FLOW, body: json((store.rejected ?? []).filter((x) => !x.closed).map(({ customerNo, code, why, t }) => ({ customerNo, code, why, t }))) }
      const m = path.match(/^\/customers\/([\w-]+)$/)
      if (req.method !== 'PUT' || !m) return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: MAIN, body: json({ message: 'Resource not found' }) }
      let c
      try {
        c = JSON.parse(req.body || 'null')
      } catch {
        c = null
      }
      if (!c || !word(c.lastName)) return { status: 400, ms: 5, flow: PUT_FLOW, error: 'APIKIT:BAD_REQUEST', log: [warn('APIKIT:BAD_REQUEST: the body needs at least lastName')], body: json({ message: 'Bad request: lastName is required' }) }
      const no = m[1]
      const url = word(ctx.props['dataverse.url']).replace(/\/+$/, '')
      const tok = tokenFor(ctx.msgraph, store, cfgOf(ctx.props), ctx.now, `${url}/.default`)
      if (!tok.ok) {
        const type = httpType(tok.status)
        return { status: 502, ms: 200, flow: PUT_FLOW, error: type, log: [muleError({ ...el.token, file: NAME, type, message: `${httpMessage('POST', 'https://login.microsoftonline.com/token', tok)} ${errorText(tok)}` })], body: json({ message: 'Dataverse is not available' }) }
      }
      const target = `${url}${API_PATH}/contacts(brightmart_customerno='${no.replace(/'/g, "''")}')`
      const r = ctx.msgraph.dataverse(tok.token, 'PATCH', target, toContact(c))
      // a record Dataverse refuses is a business error: answer 400 and keep it with the body, so it can be fixed and sent again
      if (r.status === 400 || r.status === 412) {
        store.rejected = [...(store.rejected ?? []), { customerNo: no, code: r.code ?? null, why: errorText(r).slice(0, 200), body: req.body, t: ctx.now }].slice(-20)
        return { status: 400, ms: r.ms + 20, flow: PUT_FLOW, error: 'HTTP:BAD_REQUEST', log: [warn(`Customer ${no} rejected by Dataverse: ${r.code} ${errorText(r).replace(/\.$/, '')}. Kept in the reject store, see GET /rejects.`)], body: json({ message: errorText(r), code: r.code, kept: 'GET /rejects' }) }
      }
      if (!r.ok) {
        const type = httpType(r.status)
        return { status: 502, ms: r.ms + 20, flow: PUT_FLOW, error: type, log: [muleError({ ...el.upsert, file: NAME, type, message: `${httpMessage('PATCH', target, r)} ${errorText(r)}` })], body: json({ message: 'Dataverse is not available' }) }
      }
      for (const x of store.rejected ?? []) if (x.customerNo === no && !x.closed) x.closed = ctx.now
      return { status: 200, ms: r.ms + 25, flow: PUT_FLOW, log: [info(`Customer ${no} upserted as contact (PATCH on brightmart_customerno, ${r.status}): ${word(c.firstName)} ${word(c.lastName)}, ${word(c.email)}`)], body: json({ customerNo: no, status: 'UPSERTED' }) }
    },
  },
}
