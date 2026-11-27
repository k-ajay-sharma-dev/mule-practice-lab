// The sample application of the aws-s3-denied lab. Imports only platform-log.js and the import free AWS engine, so the
// engine can load it without a cycle. The app reaches S3 through ctx.aws (src/lab/platform-aws.js).
import { info, muleError, needs, warn } from '../platform-log.js'
import { awsCfg } from '../platform-aws.js'

export const ARCHIVER = 'brightmart-invoice-s3-archiver'
export const ARCHIVE_FLOW = 'archive-invoices-flow'
// billing closes two invoices every 5 minutes
const PER_RUN = 2
const keep = (arr, item, n = 30) => [...(arr ?? []), item].slice(-n)
const el = { flow: ARCHIVE_FLOW, at: 3, name: 'Put Object', dsl: '<s3:put-object doc:name="Put Object" config-ref="Amazon_S3_Configuration" bucketName="${s3.bucket}" key="#[vars.key]" serverSideEncryption="${s3.serverSideEncryption}"/>' }

export const PACKAGES = {
  [ARCHIVER]: {
    note: 'Every 5 minutes it takes the invoices billing closed and writes each PDF to S3 with the Put Object operation of the Amazon S3 connector: bucket s3.bucket, key s3.prefix plus the year, month and invoice number, and the header x-amz-server-side-encryption from s3.serverSideEncryption (AES256 or aws:kms; empty sends no header). The connection uses aws.region, aws.accessKeyId and the secure property aws.secretAccessKey. An invoice that fails stays in the backlog and the next run tries it again.',
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 's3.bucket'),
    schedules: [{ flow: ARCHIVE_FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [ARCHIVE_FLOW]: (ctx) => {
        const { props, store } = ctx
        let n = store.next ?? 88410
        const backlog = [...(store.backlog ?? [])]
        for (let i = 0; i < PER_RUN; i++) backlog.push(`INV-${n++}`)
        const log = []
        const done = []
        let error = null
        for (const inv of backlog) {
          const key = `${props['s3.prefix'] ?? 'invoices/'}2026/11/${inv}.pdf`
          const r = ctx.aws.s3(awsCfg(props), 'PutObject', { Bucket: props['s3.bucket'], Key: key, Body: `%PDF-1.7 invoice ${inv} (lab copy)`, ServerSideEncryption: String(props['s3.serverSideEncryption'] ?? '').trim() })
          if (!r.ok) {
            error = r
            break
          }
          done.push(inv)
          log.push(info(`Invoice ${inv} archived to s3://${props['s3.bucket']}/${key} (${r.ServerSideEncryption})`))
        }
        const left = backlog.filter((x) => !done.includes(x))
        const out = { ...store, next: n, backlog: left, archived: (store.archived ?? 0) + done.length, runs: keep(store.runs, { t: ctx.now, ok: !error, n: done.length }) }
        if (error) {
          log.push(muleError({ ...el, file: ARCHIVER, type: error.type, message: error.text }))
          log.push(warn(`${left.length} invoice${left.length === 1 ? '' : 's'} wait in the backlog for the next run`))
          return { ok: false, ms: 300, errorType: error.type, log, store: out }
        }
        return { ok: true, ms: 200 + done.length * 120, log, store: out }
      },
    },
  },
}
