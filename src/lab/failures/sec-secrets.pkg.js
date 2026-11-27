// The sample applications of the sec-secrets lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, line, muleError, needs } from '../platform-log.js'

export const SFTP_HOST = 'sftp.brightmart.lab'
export const SFTP_USER = 'mule_supplier'

// The body of a Key Vault error as the HTTP connector logs it. A disabled secret has the inner code SecretDisabled.
const vaultBody = (e) => JSON.stringify({ error: { code: 'Forbidden', message: e.error.replace(/^\d+ \w+: /, ''), innererror: { code: e.code === 'Forbidden' ? 'SecretDisabled' : e.code } } })
const flowError = (at, name, dsl, type, message) => ({ flow: 'price-list-flow', file: 'supplier-file-pull', at, name, dsl, type, message })

export const PACKAGES = {
  'supplier-file-pull': {
    note: 'Every 15 minutes reads the SFTP password from Azure Key Vault (kv.name, kv.secret.name, and kv.secret.version when it is set), logs in to sftp.brightmart.lab as mule_supplier, and moves each price list from /in to /archive after loading it. It calls Key Vault through the HTTP connector with an OAuth token of its app registration (kv.client.id and kv.client.secret). An empty kv.secret.version reads the current version.',
    boot: needs('kv.name', 'kv.secret.name', 'kv.client.id', 'kv.client.secret', 'sftp.user'),
    schedules: [{ flow: 'price-list-flow', type: 'fixed', value: 15, unit: 'minutes', enabled: true }],
    run: {
      'price-list-flow': ({ props, systems, store }) => {
        const vault = props['kv.name']
        const name = props['kv.secret.name']
        const pinned = String(props['kv.secret.version'] ?? '').trim()
        const uri = `https://${vault}.vault.azure.net/secrets/${name}${pinned ? `/${pinned}` : ''}?api-version=7.4`
        const log = [info('Starting price-list-flow'), info(`GET ${uri}`)]
        const sec = systems.secret(vault, name, pinned || undefined)
        if (!sec.ok) {
          const status = sec.status ?? 0
          const type = status === 403 ? 'HTTP:FORBIDDEN' : status === 404 ? 'HTTP:NOT_FOUND' : status >= 500 ? 'HTTP:SERVICE_UNAVAILABLE' : 'HTTP:CONNECTIVITY'
          const error = flowError(1, 'Read SFTP password', '<http:request method="GET" doc:name="Read SFTP password" config-ref="Key_Vault_Config" path="#[vars.secretPath]">', type, status ? `HTTP GET on resource '${uri}' failed: ${status === 403 ? 'forbidden' : 'error'} (${status}).` : `HTTP GET on resource '${uri}' failed: ${sec.error}`)
          return { ok: false, ms: 700, errorType: type, log: [...log, ...(status ? [line('ERROR', `Key Vault answered ${status}: ${vaultBody(sec)}`)] : []), muleError(error)] }
        }
        log.push(info(`Got ${name}, version ${sec.version.slice(0, 8)}`))
        const sftp = systems.files(SFTP_HOST, { user: props['sftp.user'], password: sec.value })
        const list = sftp.list('/in')
        if (!list.ok) {
          const error = flowError(2, 'List price lists', `<sftp:list doc:name="List price lists" config-ref="Supplier_SFTP" directoryPath="/in">`, list.type ?? 'SFTP:CONNECTIVITY', list.error)
          return { ok: false, ms: 1500, errorType: error.type, log: [...log, muleError(error)] }
        }
        const files = list.files.filter((f) => !f.dir)
        if (!files.length) return { ok: true, ms: 900, log: [...log, info('No price list in /in. Job finished.')] }
        for (const f of files) {
          sftp.move(f.path, `/archive/${f.name}`, { overwrite: true })
          log.push(info(`Loaded ${f.name} into the price table and moved it to /archive`))
        }
        return { ok: true, ms: 1500 * files.length, store: { loaded: (store.loaded ?? 0) + files.length }, log: [...log, info('Job finished.')] }
      },
    },
  },
}
