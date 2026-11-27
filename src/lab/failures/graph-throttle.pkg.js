// The sample application of the graph-throttle lab. Imports only platform-log.js and the import free Graph engine, so
// the engine can load it without a cycle. Every minute it reads the product sheets that changed in a SharePoint
// library over Microsoft Graph and syncs their metadata.
import { info, muleError, needs, warn } from '../platform-log.js'
import { clockText, errorText, GRAPH_SCOPE, GRAPH_URL, httpMessage, httpType, tokenFor } from '../platform-msgraph.js'

export const CATALOG = 'brightmart-sp-catalog-sync'
export const CATALOG_FLOW = 'catalog-sync-flow'
const cfgOf = (p) => ({ tenant: p['azure.tenantId'], clientId: p['azure.clientId'], clientSecret: p['azure.clientSecret'] })
const el = {
  token: { flow: CATALOG_FLOW, at: 0, name: 'Get Graph token', dsl: '<http:request doc:name="Get Graph token" method="POST" config-ref="Entra_Token_Config" path="/${azure.tenantId}/oauth2/v2.0/token">' },
  list: { flow: CATALOG_FLOW, at: 1, name: 'List product sheets', dsl: '<http:request doc:name="List product sheets" method="GET" config-ref="Graph_Config" path="/drives/${graph.driveId}/root/children">' },
  get: { flow: CATALOG_FLOW, at: 3, name: 'Get item', dsl: '<http:request doc:name="Get item" method="GET" config-ref="Graph_Config" path="/drives/${graph.driveId}/items/#[vars.itemId]">' },
  batch: { flow: CATALOG_FLOW, at: 3, name: 'Graph batch', dsl: '<http:request doc:name="Graph batch" method="POST" config-ref="Graph_Config" path="/$batch">' },
}
const SELECT = '$select=id,name,size,lastModifiedDateTime'

export const PACKAGES = {
  [CATALOG]: {
    note: `Syncs the product sheets of the SharePoint library graph.driveId to the catalog. The flow ${CATALOG_FLOW} runs every minute: it gets a token with the client credentials of azure.clientId (cached until 5 minutes before it expires), lists the library, and reads each item changed since its watermark. graph.batchSize 1 sends one GET per item; 2 to 20 sends them in a Graph $batch. graph.retryMode immediate retries a 429 at once, up to 3 times; retry-after waits as long as the Retry-After header says and goes on from where it stopped.`,
    boot: needs('azure.tenantId', 'azure.clientId', 'azure.clientSecret', 'graph.driveId'),
    schedules: [{ flow: CATALOG_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [CATALOG_FLOW]: (ctx) => {
        const { props, now } = ctx
        const store = { ...ctx.store }
        if (store.waitUntil > now) return { ok: true, ms: 2, log: [info(`Graph asked to wait: paused until ${clockText(store.waitUntil)} (Retry-After)`)], store }
        delete store.waitUntil
        const tok = tokenFor(ctx.msgraph, store, cfgOf(props), now, GRAPH_SCOPE)
        if (!tok.ok) return { ok: false, ms: tok.ms, errorType: httpType(tok.status), log: [muleError({ ...el.token, file: CATALOG, type: httpType(tok.status), message: `${httpMessage('POST', 'https://login.microsoftonline.com/token', tok)} ${errorText(tok)}` })], store }
        const mode = String(props['graph.retryMode'] ?? '').trim() === 'retry-after' ? 'retry-after' : 'immediate'
        const size = Math.max(1, Math.floor(Number(props['graph.batchSize'])) || 1)
        const drive = String(props['graph.driveId']).trim()
        let calls = 0
        const call = (method, path, body) => {
          calls++
          return ctx.msgraph.graph(tok.token, method, path, body)
        }
        // the retry policy of the app: immediate sends again at once, retry-after gives up for this run
        const send = (fn) => {
          let r = fn()
          for (let i = 0; i < 3 && r.status === 429 && mode === 'immediate'; i++) r = fn()
          return r
        }
        const ms = () => calls * (size > 1 ? 180 : 110)
        const fail = (r, e, method, path) => ({ ok: false, ms: ms(), errorType: httpType(r.status), log: [muleError({ ...e, file: CATALOG, type: httpType(r.status), message: `${httpMessage(method, `${GRAPH_URL}${path}`, r)} ${errorText(r)}` })], store })
        const pause = (wait, done) => {
          store.waitUntil = now + wait * 1000
          return { ok: true, ms: ms(), log: [warn(`Graph answered 429 activityLimitReached after ${done} items. Retry-After ${wait} s: paused until ${clockText(store.waitUntil)}`)], store }
        }

        const listPath = `/v1.0/drives/${drive}/root/children?$top=500&$select=id,lastModifiedDateTime`
        const list = send(() => call('GET', listPath))
        if (list.status === 429 && mode === 'retry-after') return pause(Number(list.headers['Retry-After']) || 60, 0)
        if (!list.ok) return fail(list, el.list, 'GET', listPath)
        const wm = store.wm ?? ''
        const todo = list.body.value.filter((x) => x.lastModifiedDateTime > wm).sort((a, b) => (a.lastModifiedDateTime + a.id).localeCompare(b.lastModifiedDateTime + b.id))
        let pos = Math.min(store.pos ?? 0, todo.length)
        const start = pos
        const finish = () => {
          store.synced = (store.synced ?? 0) + (pos - start)
          if (pos >= todo.length && todo.length) {
            store.wm = todo.at(-1).lastModifiedDateTime
            store.pos = 0
            return info(`Catalog sync done: ${todo.length} product sheets since the last watermark, watermark now ${store.wm}`)
          }
          store.pos = pos
          return pos > start ? info(`Synced ${pos - start} product sheets, ${todo.length - pos} left`) : null
        }
        while (pos < todo.length) {
          if (size === 1) {
            const path = `/v1.0/drives/${drive}/items/${todo[pos].id}?${SELECT}`
            const r = send(() => call('GET', path))
            if (r.status === 429 && mode === 'retry-after') {
              const note = finish()
              const out = pause(Number(r.headers['Retry-After']) || 60, pos - start)
              return { ...out, log: [...(note ? [note] : []), ...out.log] }
            }
            if (!r.ok) {
              const note = finish()
              const out = fail(r, el.get, 'GET', path)
              return { ...out, log: [...(note ? [note] : []), ...out.log] }
            }
            pos++
            continue
          }
          const chunk = todo.slice(pos, pos + size)
          let left = chunk.map((x, i) => ({ id: String(i + 1), method: 'GET', url: `/drives/${drive}/items/${x.id}?${SELECT}` }))
          let got = 0
          let wait = 0
          // a batch answers 200 even when requests inside it failed: each response has its own status
          for (let attempt = 0; left.length; attempt++) {
            const r = call('POST', '/v1.0/$batch', { requests: left })
            if (!r.ok) {
              finish()
              return fail(r, el.batch, 'POST', '/v1.0/$batch')
            }
            const res = [...r.body.responses].sort((a, b) => Number(a.id) - Number(b.id))
            const firstBad = res.findIndex((x) => x.status !== 200)
            const ok = firstBad < 0 ? res.length : firstBad
            got += ok
            left = left.slice(ok)
            if (!left.length) break
            const bad = res[firstBad]
            if (bad.status !== 429) {
              pos += got
              finish()
              return fail({ status: bad.status, body: bad.body }, el.batch, 'GET', `/v1.0${left[0].url}`)
            }
            wait = Math.max(...res.filter((x) => x.status === 429).map((x) => Number(x.headers?.['Retry-After']) || 60))
            if (mode === 'retry-after' || attempt >= 3) break
          }
          pos += got
          if (left.length) {
            const note = finish()
            if (mode === 'retry-after') {
              const out = pause(wait, pos - start)
              return { ...out, log: [...(note ? [note] : []), ...out.log] }
            }
            const out = fail({ status: 429, body: { error: { message: 'The request has been throttled' } } }, el.batch, 'GET', `/v1.0${left[0].url}`)
            return { ...out, log: [...(note ? [note] : []), ...out.log] }
          }
        }
        const note = finish()
        return { ok: true, ms: ms() || 20, log: note ? [note] : [], store }
      },
    },
  },
}
