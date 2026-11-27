// The sample application of the setup-azure-blob lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, line, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'customer-blob-export'
export const FLOW = 'customer-export-flow'
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
export const dateOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)
export const blobName = (prefix, now) => `${String(prefix ?? '').replace(/^\/+|\/+$/g, '')}/customers-${dateOf(now)}.csv`
export const rejectsName = (prefix, now) => `${String(prefix ?? '').replace(/^\/+|\/+$/g, '')}/rejects/customers-${dateOf(now)}-rejects.csv`

// Lab made: the customers that changed yesterday, as the CRM query returns them. One has no valid email.
export const CUSTOMERS = [
  ['C-1041', 'Maple Deli Dublin', 'orders@mapledeli.example'],
  ['C-1042', 'Quayside Bakery', 'hello@quayside.example'],
  ['C-1043', 'North Pier Cafe', 'not-an-email'],
  ['C-1044', 'Lantern Grocers', 'buying@lantern.example'],
  ['C-1045', 'Tidewater Market', 'ap@tidewater.example'],
]
const valid = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c[2])

// The secret holds the SAS. The flow reads it from Key Vault on each run, so a new version needs no redeploy.
// Both calls use the HTTP connector: the Key Vault REST API with an OAuth token of the app registration (the token
// step is not modelled), then Put Blob with the SAS as the query.
const el = {
  secret: { at: 1, name: 'Get SAS from Key Vault', dsl: '<http:request method="GET" config-ref="Key_Vault_Config" path="/secrets/${kv.secret.name}?api-version=7.4">' },
  put: { at: 4, name: 'Put customer blob', dsl: '<http:request method="PUT" config-ref="Blob_Config" path="#[vars.blobPath]">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 3000, errorType: type, log: [...log, muleError({ flow: FLOW, file: NAME, ...el[where], type, message })] })
const httpType = (e) => (e.status === 403 ? 'HTTP:FORBIDDEN' : e.status === 404 ? 'HTTP:NOT_FOUND' : e.status === 409 ? 'HTTP:CONFLICT' : 'HTTP:CONNECTIVITY')

export const PACKAGES = {
  [NAME]: {
    note: 'At 02:00 UTC it exports the customers that changed the day before to the Azure Blob container blob.container, as blob.prefix/customers-<date>.csv. Rows that fail validation go to blob.prefix/rejects. It reads the SAS from the Azure Key Vault kv.name, secret kv.secret.name, with the app registration kv.client.id and kv.client.secret.',
    boot: needs('blob.account', 'blob.container', 'blob.prefix', 'kv.name', 'kv.secret.name', 'kv.client.id', 'kv.client.secret'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const log = [info(`Starting ${FLOW}, ${CUSTOMERS.length} changed customers from the CRM`)]
        const sec = ctx.systems.secret(props['kv.name'], props['kv.secret.name'])
        if (!sec.ok) return fail([...log, line('ERROR', `Key Vault answered ${sec.error}`)], 'secret', httpType(sec), `HTTP GET on resource 'https://${props['kv.name']}.vault.azure.net/secrets/${props['kv.secret.name']}' failed: ${sec.status ? `(${sec.status})` : sec.error}`)
        log.push(info(`Read secret ${props['kv.secret.name']} version ${sec.version.slice(0, 8)} from ${props['kv.name']}`))
        if (sec.expired) log.push(warn(`Secret ${props['kv.secret.name']} is past its expiration date`))
        const f = ctx.systems.files(`blob:${props['blob.account']}/${props['blob.container']}`, { sas: sec.value })
        const good = CUSTOMERS.filter(valid)
        const bad = CUSTOMERS.filter((c) => !valid(c))
        const name = blobName(props['blob.prefix'], now)
        const w = f.write(name, `id,name,email\n${good.map((c) => c.join(',')).join('\n')}\n`, { overwrite: true })
        if (!w.ok) return fail([...log, line('ERROR', `Azure Storage answered ${w.status ?? ''} ${w.code ?? ''}`)], 'put', httpType(w), `HTTP PUT on resource 'https://${props['blob.account']}.blob.core.windows.net/${props['blob.container']}/${name}' failed: ${w.error}`)
        log.push(info(`Uploaded ${good.length} customers to ${props['blob.container']}/${name}, ${w.size} bytes`))
        if (bad.length) {
          // on-error-continue per row: a rejected row is written next to the export with its reason, never dropped
          const rname = rejectsName(props['blob.prefix'], now)
          const r = f.write(rname, `id,name,email,reason\n${bad.map((c) => `${c.join(',')},email is not valid`).join('\n')}\n`, { overwrite: true })
          if (!r.ok) return fail(log, 'put', httpType(r), `HTTP PUT on resource '${rname}' failed: ${r.error}`)
          log.push(warn(`Rejected ${bad.length} customer: ${bad.map((c) => `${c[0]} (email '${c[2]}' is not valid)`).join(', ')}. Written to ${props['blob.container']}/${rname}`))
        }
        store.exports = [...(store.exports ?? []), { name, t: now, rows: good.length, rejects: bad.length }].slice(-10)
        return { ok: true, ms: 4000, log: [...log, info('Job finished.')], store }
      },
    },
  },
}
