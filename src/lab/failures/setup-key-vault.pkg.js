// The sample application of the setup-key-vault lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, line, muleError, needs } from '../platform-log.js'

export const NAME = 'order-history-sync'
export const FLOW = 'history-sync-flow'
export const DB_USER = 'svc_order_history'
// Practice values of the lab, not real passwords
export const OLD_PASSWORD = 'lab-practice-db-pass-1'
export const NEW_PASSWORD = 'lab-practice-db-pass-2'
// Lab made: during the rotation the database accepts the old and the new password. SQL Server keeps one password per
// login, so a real rotation without downtime uses two logins and switches between them (the dual credential pattern).
const ACCEPTED = [OLD_PASSWORD, NEW_PASSWORD]

// The vault is read through the HTTP connector with an OAuth token of the app registration (the token step is not
// modelled). No version in the path, so each run gets the current version.
const el = {
  secret: { at: 1, name: 'Get DB password', dsl: '<http:request method="GET" config-ref="Key_Vault_Config" path="/secrets/${kv.secret.name}?api-version=7.4">' },
  db: { at: 3, name: 'Select new orders', dsl: '<db:select config-ref="Order_History_DB">' },
}
const fail = (log, where, type, message, extra = []) => ({ ok: false, ms: 1500, errorType: type, log: [...log, ...extra, muleError({ flow: FLOW, file: NAME, ...el[where], type, message })] })

export const PACKAGES = {
  [NAME]: {
    note: 'Every 5 minutes it copies new orders into the order history database db.host, database db.name, as the login svc_order_history. It reads the password of that login from the Azure Key Vault kv.name, secret kv.secret.name, on each run, with the app registration kv.client.id and kv.client.secret. kv.secret.version pins a version when it is set.',
    boot: needs('kv.name', 'kv.secret.name', 'kv.client.id', 'kv.client.secret', 'db.host', 'db.name'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const vault = props['kv.name']
        const name = props['kv.secret.name']
        const pin = String(props['kv.secret.version'] ?? '').trim()
        const uri = `https://${vault}.vault.azure.net/secrets/${name}${pin ? `/${pin}` : ''}`
        const log = [info(`Starting ${FLOW}. GET ${uri}`)]
        const sec = ctx.systems.secret(vault, name, pin || undefined)
        if (!sec.ok) {
          const type = sec.status === 403 ? 'HTTP:FORBIDDEN' : sec.status === 404 ? 'HTTP:NOT_FOUND' : sec.status >= 500 ? 'HTTP:SERVICE_UNAVAILABLE' : 'HTTP:CONNECTIVITY'
          // fail closed: no cached or default password, the run stops and the error counts
          const denied = [...(store.denied ?? []), { t: now, kind: sec.kind, code: sec.code ?? null }].slice(-10)
          return { ...fail(log, 'secret', type, `HTTP GET on resource '${uri}' failed: ${sec.status ? `${sec.status === 403 ? 'forbidden' : 'error'} (${sec.status})` : sec.error}.`, sec.status ? [line('ERROR', `Key Vault answered ${sec.error}`)] : []), store: { ...store, denied } }
        }
        log.push(info(`Got ${name} version ${sec.version.slice(0, 8)}`))
        if (!ACCEPTED.includes(sec.value))
          return fail(log, 'db', 'DB:CONNECTIVITY', `Could not obtain connection from data source. Caused by: com.microsoft.sqlserver.jdbc.SQLServerException: Login failed for user '${DB_USER}'. ClientConnectionId:lab-0000-0001`)
        const orders = 6 + (Math.floor(now / 300000) % 5)
        store.versions = [...new Set([...(store.versions ?? []), sec.version])].slice(-10)
        store.version = sec.version
        store.runs = (store.runs ?? 0) + 1
        return { ok: true, ms: 900, log: [...log, info(`Connected to ${props['db.host']}/${props['db.name']} as ${DB_USER}`), info(`Copied ${orders} new orders into the order history`)], store }
      },
    },
  },
}
