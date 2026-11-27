// The sample application of the graph-upload-session lab. Imports only platform-log.js and the import free Graph
// engine, so the engine can load it without a cycle. It archives scanned delivery notes in a SharePoint library.
import { info, muleError, needs, warn } from '../platform-log.js'
import { errorText, GRAPH_SCOPE, GRAPH_URL, httpMessage, httpType, MIB, tokenFor } from '../platform-msgraph.js'

export const ARCHIVE = 'brightmart-sp-scan-archive'
export const ARCHIVE_FLOW = 'scan-archive-flow'
const cfgOf = (p) => ({ tenant: p['azure.tenantId'], clientId: p['azure.clientId'], clientSecret: p['azure.clientSecret'] })
const el = {
  token: { flow: ARCHIVE_FLOW, at: 1, name: 'Get Graph token', dsl: '<http:request doc:name="Get Graph token" method="POST" config-ref="Entra_Token_Config" path="/${azure.tenantId}/oauth2/v2.0/token">' },
  put: { flow: ARCHIVE_FLOW, at: 4, name: 'Upload file', dsl: '<http:request doc:name="Upload file" method="PUT" config-ref="Graph_Config" path="/drives/${graph.driveId}/root:/#[vars.path]:/content">' },
  session: { flow: ARCHIVE_FLOW, at: 4, name: 'Create upload session', dsl: '<http:request doc:name="Create upload session" method="POST" config-ref="Graph_Config" path="/drives/${graph.driveId}/root:/#[vars.path]:/createUploadSession">' },
  chunk: { flow: ARCHIVE_FLOW, at: 6, name: 'Upload fragment', dsl: '<http:request doc:name="Upload fragment" method="PUT" url="#[vars.uploadUrl]">' },
}
const mb = (n) => `${(n / MIB).toFixed(1)} MB`

export const PACKAGES = {
  [ARCHIVE]: {
    note: `Archives the scanned delivery notes of the warehouse in the SharePoint library graph.driveId, folder sp.folder. The flow ${ARCHIVE_FLOW} runs every minute and uploads each waiting scan. sp.uploadMode simple sends PUT .../content with the whole file; session calls createUploadSession and sends the file in fragments of sp.chunkSize bytes with Content-Range, then cancels the session when a fragment fails. A scan that fails stays waiting for the next run. Lab-made: the scanner leaves its files in the app's object store.`,
    boot: needs('azure.tenantId', 'azure.clientId', 'azure.clientSecret', 'graph.driveId', 'sp.folder', 'sp.uploadMode'),
    schedules: [{ flow: ARCHIVE_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [ARCHIVE_FLOW]: (ctx) => {
        const { props, now } = ctx
        const store = { ...ctx.store, pending: [...(ctx.store.pending ?? [])], done: [...(ctx.store.done ?? [])] }
        if (!store.pending.length) return { ok: true, ms: 5, log: [], store }
        const tok = tokenFor(ctx.msgraph, store, cfgOf(props), now, GRAPH_SCOPE)
        if (!tok.ok) {
          const type = httpType(tok.status)
          return { ok: false, ms: 150, errorType: type, log: [muleError({ ...el.token, file: ARCHIVE, type, message: `${httpMessage('POST', 'https://login.microsoftonline.com/token', tok)} ${errorText(tok)}` })], store }
        }
        const drive = String(props['graph.driveId']).trim()
        const folder = String(props['sp.folder']).trim().replace(/^\/+|\/+$/g, '')
        const session = String(props['sp.uploadMode']).trim() === 'session'
        const chunk = Math.floor(Number(props['sp.chunkSize']))
        const log = []
        let firstError = null
        let ms = 100
        const failed = (r, e, method, url, name) => {
          const type = httpType(r.status)
          // the first failure of a run gets the full error block, the next ones a line each
          if (firstError) return void log.push(warn(`${name} not uploaded: ${r.status} ${r.code ?? ''}. It waits for the next run`))
          firstError = type
          log.push(muleError({ ...e, file: ARCHIVE, type, message: `${httpMessage(method, url, r)} ${errorText(r)} (file ${name})` }))
        }
        for (const f of [...store.pending]) {
          const path = `${folder ? `${folder}/` : ''}${f.name}`
          let ok = false
          if (!session) {
            const url = `/v1.0/drives/${drive}/root:/${path}:/content`
            const r = ctx.msgraph.graph(tok.token, 'PUT', url, { size: f.size }, { 'Content-Length': String(f.size) })
            ms += r.ms
            if (r.ok) ok = true
            else failed(r, el.put, 'PUT', `${GRAPH_URL}${url}`, f.name)
          } else if (!(chunk > 0)) {
            firstError ??= 'MULE:EXPRESSION'
            log.push(muleError({ ...el.chunk, file: ARCHIVE, type: 'MULE:EXPRESSION', message: `sp.chunkSize "${props['sp.chunkSize'] ?? ''}" is not a number of bytes.` }))
            break
          } else {
            const url = `/v1.0/drives/${drive}/root:/${path}:/createUploadSession`
            const s = ctx.msgraph.graph(tok.token, 'POST', url, { item: { '@microsoft.graph.conflictBehavior': 'replace' } })
            ms += s.ms
            if (!s.ok) failed(s, el.session, 'POST', `${GRAPH_URL}${url}`, f.name)
            else {
              const up = s.body.uploadUrl
              let from = 0
              let parts = 0
              while (from < f.size) {
                const to = Math.min(f.size, from + chunk) - 1
                // the upload URL is pre-authenticated: no Authorization header
                const r = ctx.msgraph.graph(null, 'PUT', up, null, { 'Content-Length': String(to - from + 1), 'Content-Range': `bytes ${from}-${to}/${f.size}` })
                ms += r.ms
                parts++
                if (!r.ok) {
                  failed(r, el.chunk, 'PUT', up.split('?')[0], f.name)
                  ctx.msgraph.graph(null, 'DELETE', up)
                  break
                }
                if (r.status === 201) ok = true
                from = to + 1
              }
              if (ok) log.push(info(`${f.name} (${mb(f.size)}) uploaded in ${parts} fragment${parts > 1 ? 's' : ''}`))
            }
          }
          if (ok) {
            store.pending = store.pending.filter((x) => x.name !== f.name)
            store.done = [...store.done, f.name].slice(-20)
            if (!session) log.push(info(`${f.name} (${mb(f.size)}) uploaded`))
          }
        }
        return { ok: !firstError, ms, errorType: firstError, log, store }
      },
    },
  },
}
