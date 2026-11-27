// The sample applications of the files-azure-share lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, line, muleError, needs } from '../platform-log.js'

const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
export const SNAPSHOT = 'stock-latest.csv'

const wall = (now) => new Date(BASE + now).toISOString()
const cleanSas = (value) => String(value ?? '').trim().replace(/^\?/, '')
// the stock of the warehouse changes a little in each snapshot, so a new file is visible
const snapshot = (now) => {
  const n = Math.floor(now / 900000) % 40
  return `sku,warehouse,available,at\nH-100,DUB-1,${24 + n},${wall(now)}\nH-200,DUB-1,${n % 3},${wall(now)}\nH-300,ROT-2,${112 - n},${wall(now)}\n`
}

// The answer of Azure Files as the error handler logs it: the XML body of the REST API
const azureXml = (e, now) =>
  [
    `<?xml version="1.0" encoding="utf-8"?><Error><Code>${e.code}</Code>`,
    `<Message>${e.error.replace(/^\d+ \w+: /, '')}`,
    'RequestId:3f9c11ab-901a-0061-2b7e-lab000000002',
    `Time:${wall(now).replace('Z', '0000Z')}</Message></Error>`,
  ].join('\n')

export const PACKAGES = {
  'stock-snapshot-export': {
    note: 'Writes a stock snapshot to the Azure File Share in share.account and share.name every 15 minutes, as share.dir/stock-latest.csv. It uses the File REST API through the HTTP connector (Create File, then Put Range) with the SAS token in share.sas. The warehouse servers mount the share over SMB and the handheld scanners read the file from there.',
    boot: needs('share.account', 'share.name', 'share.dir', 'share.sas'),
    schedules: [{ flow: 'snapshot-flow', type: 'fixed', value: 15, unit: 'minutes', enabled: true }],
    run: {
      'snapshot-flow': ({ props, now, systems, store }) => {
        const target = `share:${props['share.account']}/${props['share.name']}`
        const path = `${String(props['share.dir']).replace(/^\/+|\/+$/g, '')}/${SNAPSHOT}`
        const url = `https://${props['share.account']}.file.core.windows.net/${props['share.name']}/${path}`
        const r = systems.files(target, { sas: cleanSas(props['share.sas']) }).write(path, snapshot(now), { overwrite: true })
        if (!r.ok) {
          const status = r.status ?? 0
          const error = {
            flow: 'snapshot-flow', file: 'stock-snapshot-export', at: 2, name: 'Create file on share',
            dsl: '<http:request method="PUT" doc:name="Create file on share" config-ref="Azure_Files_Config" path="#[vars.sharePath]">',
            type: status === 403 ? 'HTTP:FORBIDDEN' : status === 404 ? 'HTTP:NOT_FOUND' : status >= 500 ? 'HTTP:SERVICE_UNAVAILABLE' : 'HTTP:CONNECTIVITY',
            message: status ? `HTTP PUT on resource '${url}' failed: ${status === 403 ? 'forbidden' : 'error'} (${status}).` : `HTTP PUT on resource '${url}' failed: ${r.error}`,
          }
          return {
            ok: false,
            ms: 900,
            errorType: error.type,
            log: [info('Starting snapshot-flow'), info('Read 3 stock lines from the warehouse system'), ...(status ? [line('ERROR', `Azure Files answered ${status}:\n${azureXml(r, now)}`)] : []), muleError(error)],
          }
        }
        return {
          ok: true,
          ms: 1200,
          store: { written: (store.written ?? 0) + 1, lastOk: now },
          log: [info('Starting snapshot-flow'), info('Read 3 stock lines from the warehouse system'), info(`Wrote ${path} to the file share ${props['share.name']}, ${r.size} bytes`), info('Snapshot finished.')],
        }
      },
    },
  },
}
