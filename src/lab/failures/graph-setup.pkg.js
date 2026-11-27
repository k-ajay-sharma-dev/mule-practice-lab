// The sample application of the graph-setup lab. Imports only platform-log.js and the import free Graph engine, so the
// engine can load it without a cycle. It writes the customers of the web shop to Dynamics 365 and files their
// contracts in SharePoint.
import { info, muleError, needs, warn } from '../platform-log.js'
import { API_PATH, errorText, FRAGMENT, GRAPH_SCOPE, GRAPH_URL, httpMessage, httpType, SIMPLE_LIMIT, tokenFor } from '../platform-msgraph.js'

export const BRIDGE = 'brightmart-d365-customer-bridge'
export const BRIDGE_JAR = `${BRIDGE}-1.0.0-mule-application.jar`
const cfgOf = (p) => ({ tenant: p['azure.tenantId'], clientId: p['azure.clientId'], clientSecret: p['azure.clientSecret'] })
const el = (flow, at, name, dsl) => ({ flow, at, name, dsl })
const E = {
  token: el('get:\\health', 1, 'Get token', '<http:request doc:name="Get token" method="POST" config-ref="Entra_Token_Config" path="/${azure.tenantId}/oauth2/v2.0/token">'),
  whoami: el('get:\\health', 2, 'WhoAmI', '<http:request doc:name="WhoAmI" method="GET" config-ref="Dataverse_Config" path="/WhoAmI">'),
  site: el('get:\\health', 3, 'Get site', '<http:request doc:name="Get site" method="GET" config-ref="Graph_Config" path="/sites/${sharepoint.hostname}:${sharepoint.sitePath}">'),
  upsert: el('post:\\customers', 3, 'Upsert account', '<http:request doc:name="Upsert account" method="PATCH" config-ref="Dataverse_Config" path="/accounts(accountnumber=\'#[payload.accountNumber]\')">'),
  upload: el('post:\\customers\\(no)\\contract', 4, 'Upload contract', '<http:request doc:name="Upload contract" method="PUT" config-ref="Graph_Config" path="/drives/#[vars.driveId]/root:/#[vars.path]:/content">'),
}
const answer = (status, body, extra = {}) => ({ status, ms: 160, body: JSON.stringify(body), ...extra })
const word = (v) => String(v ?? '').trim()

// the token, or an error answer; each API has its own token
function tokenOr(ctx, store, scope, e) {
  const tok = tokenFor(ctx.msgraph, store, cfgOf(ctx.props), ctx.now, scope)
  if (tok.ok) return { token: tok.token }
  const type = httpType(tok.status)
  return { fail: answer(500, { message: 'Internal server error' }, { flow: e.flow, error: type, log: [muleError({ ...e, file: BRIDGE, type, message: `${httpMessage('POST', 'https://login.microsoftonline.com/token', tok)} ${errorText(tok)}` })] }) }
}
// finds the document library: GET the site by its path, then its drives
function library(ctx, token) {
  const p = ctx.props
  const sitePath = `/v1.0/sites/${word(p['sharepoint.hostname'])}:${word(p['sharepoint.sitePath'])}`
  const site = ctx.msgraph.graph(token, 'GET', sitePath)
  if (!site.ok) return { r: site, url: `${GRAPH_URL}${sitePath}` }
  const drives = ctx.msgraph.graph(token, 'GET', `/v1.0/sites/${site.body.id}/drives`)
  if (!drives.ok) return { r: drives, url: `${GRAPH_URL}/v1.0/sites/${site.body.id}/drives` }
  const d = drives.body.value.find((x) => x.name === word(p['sharepoint.library']))
  return d ? { drive: d.id } : { r: { status: 404, body: { error: { message: `The site has no library named ${word(p['sharepoint.library'])}` } } }, url: `${GRAPH_URL}/v1.0/sites/${site.body.id}/drives` }
}

export const PACKAGES = {
  [BRIDGE]: {
    note: `The customer bridge of Brightmart. GET /health gets a token for Dataverse and one for Microsoft Graph, calls WhoAmI and finds the library. POST /customers with {"accountNumber","name","city"} upserts the account with PATCH /accounts(accountnumber='...'); a record Dataverse refuses is answered 400 and kept in the reject store of the app. POST /customers/{accountNumber}/contract with {"file","size"} files the contract in the library, in an upload session above 4 MB. Properties: azure.tenantId, azure.clientId, the secure azure.clientSecret, dataverse.url, sharepoint.hostname, sharepoint.sitePath, sharepoint.library. Tokens are cached until 5 minutes before they expire.`,
    sample: { method: 'POST', path: '/customers', body: '{"accountNumber":"C-2001","name":"Brightmart Test Customer","city":"Leeds"}' },
    boot: needs('azure.tenantId', 'azure.clientId', 'azure.clientSecret', 'dataverse.url', 'sharepoint.hostname', 'sharepoint.sitePath', 'sharepoint.library'),
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const store = (ctx.app.store ??= {})
      const url = word(ctx.props['dataverse.url']).replace(/\/+$/, '')
      if (req.method === 'GET' && path === '/health') {
        const dv = tokenOr(ctx, store, `${url}/.default`, E.token)
        if (dv.fail) return { ...dv.fail, status: 503 }
        const who = ctx.msgraph.dataverse(dv.token, 'GET', `${url}${API_PATH}/WhoAmI`)
        if (!who.ok) return answer(503, { dataverse: 'DOWN', reason: errorText(who) }, { flow: E.whoami.flow, error: httpType(who.status), log: [muleError({ ...E.whoami, file: BRIDGE, type: httpType(who.status), message: `${httpMessage('GET', `${url}${API_PATH}/WhoAmI`, who)} ${errorText(who)}` })] })
        const g = tokenOr(ctx, store, GRAPH_SCOPE, E.token)
        if (g.fail) return { ...g.fail, status: 503 }
        const lib = library(ctx, g.token)
        if (!lib.drive) return answer(503, { dataverse: 'UP', sharepoint: 'DOWN', reason: errorText(lib.r) }, { flow: E.site.flow, error: httpType(lib.r.status), log: [muleError({ ...E.site, file: BRIDGE, type: httpType(lib.r.status), message: `${httpMessage('GET', lib.url, lib.r)} ${errorText(lib.r)}` })] })
        return answer(200, { dataverse: 'UP', userId: who.body.UserId, sharepoint: 'UP', driveId: lib.drive }, { flow: 'get:\\health', log: [info(`Health: Dataverse user ${who.body.UserId}, SharePoint library ${word(ctx.props['sharepoint.library'])} found`)] })
      }
      let o
      try {
        o = JSON.parse(req.body || '{}')
      } catch {
        return answer(400, { message: 'Invalid JSON' }, { flow: 'post:\\customers', error: 'APIKIT:BAD_REQUEST' })
      }
      const reject = (no, why, code) => {
        store.rejected = [...(store.rejected ?? []), { t: ctx.now, accountNumber: no ?? null, code: code ?? null, why: String(why).slice(0, 200) }].slice(-20)
        return answer(400, { message: why, kept: 'reject store' }, { flow: 'post:\\customers', error: 'HTTP:BAD_REQUEST', log: [warn(`Customer ${no ?? '(no number)'} rejected: ${String(why).replace(/\.$/, '')}. Kept in the reject store for the CRM team`)] })
      }
      if (req.method === 'POST' && path === '/customers') {
        const no = word(o.accountNumber)
        if (!no) return reject(null, 'accountNumber is required', null)
        const dv = tokenOr(ctx, store, `${url}/.default`, E.token)
        if (dv.fail) return dv.fail
        const p = `${url}${API_PATH}/accounts(accountnumber='${no.replace(/'/g, "''")}')`
        const r = ctx.msgraph.dataverse(dv.token, 'PATCH', p, { name: word(o.name) || no, address1_city: word(o.city) })
        // a record Dataverse refuses is a business error: answer 400 and keep it. Anything else is ours to fix: 500.
        if (r.status === 400 || r.status === 412) return reject(no, errorText(r), r.code)
        if (!r.ok) return answer(500, { message: 'Internal server error' }, { flow: E.upsert.flow, error: httpType(r.status), log: [muleError({ ...E.upsert, file: BRIDGE, type: httpType(r.status), message: `${httpMessage('PATCH', p, r)} ${errorText(r)}` })] })
        return answer(200, { accountNumber: no, entity: r.headers['OData-EntityId'] }, { flow: E.upsert.flow, log: [info(`Account ${no} upserted`)] })
      }
      const m = path.match(/^\/customers\/([^/]+)\/contract$/)
      if (req.method === 'POST' && m) {
        const file = word(o.file)
        const size = Number(o.size) || 0
        if (!file || size <= 0) return answer(400, { message: 'file and size are required' }, { flow: E.upload.flow, error: 'APIKIT:BAD_REQUEST' })
        const g = tokenOr(ctx, store, GRAPH_SCOPE, E.token)
        if (g.fail) return g.fail
        const lib = library(ctx, g.token)
        if (!lib.drive) return answer(500, { message: 'Internal server error' }, { flow: E.upload.flow, error: httpType(lib.r.status), log: [muleError({ ...E.upload, file: BRIDGE, type: httpType(lib.r.status), message: `${httpMessage('GET', lib.url, lib.r)} ${errorText(lib.r)}` })] })
        const target = `${decodeURIComponent(m[1])}/${file}`
        let r
        if (size <= SIMPLE_LIMIT) r = ctx.msgraph.graph(g.token, 'PUT', `/v1.0/drives/${lib.drive}/root:/${target}:/content`, { size })
        else {
          const sess = ctx.msgraph.graph(g.token, 'POST', `/v1.0/drives/${lib.drive}/root:/${target}:/createUploadSession`, {})
          r = sess
          for (let from = 0; sess.ok && from < size; ) {
            const to = Math.min(size, from + 10 * FRAGMENT) - 1
            r = ctx.msgraph.graph(null, 'PUT', sess.body.uploadUrl, null, { 'Content-Range': `bytes ${from}-${to}/${size}` })
            if (!r.ok) break
            from = to + 1
          }
        }
        if (!r.ok) return answer(500, { message: 'Internal server error' }, { flow: E.upload.flow, error: httpType(r.status), log: [muleError({ ...E.upload, file: BRIDGE, type: httpType(r.status), message: `${httpMessage('PUT', `${GRAPH_URL}/v1.0/drives/${lib.drive}/root:/${target}:/content`, r)} ${errorText(r)}` })] })
        return answer(201, { file: target, id: r.body.id }, { flow: E.upload.flow, log: [info(`Contract ${target} filed in ${word(ctx.props['sharepoint.library'])}`)] })
      }
      return answer(404, { message: 'Resource not found' }, { flow: `${BRIDGE}-main`, error: 'APIKIT:NOT_FOUND' })
    },
  },
}
