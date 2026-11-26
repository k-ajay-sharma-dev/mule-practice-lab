// The sample application of the sas-expired lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, line, muleError, needs } from '../platform-log.js'

const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const DAY = 24 * 60 * 60000
const PER_DAY = 38

// The SAS tokens of the lab are fictional. The signatures are placeholders, not real values.
export const OLD_SAS = 'sv=2024-11-04&sr=c&sp=cw&se=2026-11-03T00:00:00Z&spr=https&sig=lab-not-a-real-signature-1'
export const NEW_SAS = 'sv=2024-11-04&sr=c&sp=cw&se=2027-02-03T00:00:00Z&spr=https&sig=lab-not-a-real-signature-2'
export const cleanSas = (value) => String(value ?? '').trim().replace(/^\?/, '')

const dateOf = (day) => new Date(BASE + day * DAY).toISOString().slice(0, 10)
const expiryOf = (sas) => {
  const se = new URLSearchParams(sas).get('se')
  const t = se ? Date.parse(se) : NaN
  return Number.isNaN(t) ? null : t
}

// The answer of Azure Storage as the error handler logs it. The wording follows the Microsoft guide to 403 errors.
const azureError = (detail, at) =>
  [
    '<?xml version="1.0" encoding="utf-8"?><Error><Code>AuthenticationFailed</Code>',
    '<Message>Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature.',
    `RequestId:7d2a91c4-801e-0042-3c5f-lab000000001`,
    `Time:${new Date(at).toISOString().replace('Z', '0000Z')}</Message>`,
    `<AuthenticationErrorDetail>${detail}</AuthenticationErrorDetail></Error>`,
  ].join('\n')

export const PACKAGES = {
  'document-archive': {
    note: 'Uploads the PDF invoices of the day before to an Azure Blob container at 01:00, through the HTTP connector with a SAS token.',
    boot: needs('blob.account', 'blob.container', 'blob.sas'),
    schedules: [{ flow: 'archive-flow', type: 'cron', value: '0 0 1 * * ?', tz: 'UTC', enabled: true }],
    run: {
      'archive-flow': ({ props, now, store }) => {
        const wall = BASE + now
        const today = Math.floor(now / DAY)
        const through = store.through ?? today - 2
        const days = Array.from({ length: Math.max(0, today - 1 - through) }, (_, i) => through + 1 + i)
        const sas = cleanSas(props['blob.sas'])
        const first = days[0] ?? today - 1
        const resource = `https://${props['blob.account']}.blob.lab/${props['blob.container']}/${dateOf(first)}/INV-${dateOf(first).replace(/-/g, '')}-0001.pdf`
        const expiry = expiryOf(sas)
        const detail =
          expiry !== null && expiry <= wall
            ? `Signed expiry time [${new Date(expiry).toUTCString()}] has to be after signed start time [${new Date(wall).toUTCString()}]`
            : sas !== NEW_SAS && sas !== OLD_SAS
              ? `Signature did not match. String to sign used was cw\n\n${new URLSearchParams(sas).get('se') ?? ''}\n/blob/${props['blob.account']}/${props['blob.container']}`
              : null
        if (detail) {
          const error = { flow: 'archive-flow', file: 'document-archive', at: 3, name: 'Upload invoice', dsl: '<http:request method="PUT" doc:name="Upload invoice" config-ref="Blob_Config" path="#[vars.blobPath]">', type: 'HTTP:FORBIDDEN', message: `HTTP PUT on resource '${resource}' failed: forbidden (403).` }
          return {
            ok: false,
            ms: 1900,
            errorType: error.type,
            log: [info('Starting archive-flow'), info(`Found ${days.length * PER_DAY} invoices to upload for ${days.map(dateOf).join(', ') || 'no day'}`), line('ERROR', `Azure Storage answered 403:\n${azureError(detail, wall)}`), muleError(error)],
          }
        }
        if (!days.length) return { ok: true, ms: 2000, log: [info('Starting archive-flow'), info('Nothing new to upload. Job finished.')] }
        return {
          ok: true,
          ms: 12000 * days.length,
          store: { through: today - 1 },
          log: [info('Starting archive-flow'), ...days.map((d) => info(`Uploaded ${PER_DAY} PDF invoices of ${dateOf(d)} to container ${props['blob.container']}`)), info('Job finished.')],
        }
      },
    },
  },
}
