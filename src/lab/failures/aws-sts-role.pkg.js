// The sample application of the aws-sts-role lab. Imports only platform-log.js and the import free AWS engine, so the
// engine can load it without a cycle. The app reaches S3 through ctx.aws (src/lab/platform-aws.js).
import { info, muleError, needs } from '../platform-log.js'
import { awsCfg } from '../platform-aws.js'

export const MEDIA_SYNC = 'brightmart-media-s3-sync'
export const SYNC_FLOW = 'sync-images-flow'
const keep = (arr, item, n = 30) => [...(arr ?? []), item].slice(-n)
const el = {
  list: { flow: SYNC_FLOW, at: 1, name: 'List objects', dsl: '<s3:list-objects doc:name="List objects" config-ref="Amazon_S3_Configuration" bucketName="${s3.bucket}" prefix="incoming/"/>' },
  get: { flow: SYNC_FLOW, at: 3, name: 'Get Object', dsl: '<s3:get-object doc:name="Get Object" config-ref="Amazon_S3_Configuration" bucketName="${s3.bucket}" key="#[payload.key]"/>' },
}

export const PACKAGES = {
  [MEDIA_SYNC]: {
    note: `Every 5 minutes the flow ${SYNC_FLOW} lists the new product images under incoming/ in the bucket s3.bucket and reads up to 3 of them with Get Object for the web shop. The Amazon S3 connection uses aws.region, aws.accessKeyId, the secure property aws.secretAccessKey and, when set, aws.sessionToken. With aws.roleArn set, the connection signs in with the keys and assumes that role itself, and assumes it again before the session ends.`,
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 's3.bucket'),
    schedules: [{ flow: SYNC_FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [SYNC_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const cfg = awsCfg(props)
        const bad = (r, e) => ({ ok: false, ms: 80, errorType: r.type, log: [muleError({ ...e, file: MEDIA_SYNC, type: r.type, message: r.text })], store: { ...store, runs: keep(store.runs, { t: now, ok: false, code: r.code }) } })
        const l = ctx.aws.s3(cfg, 'ListObjects', { Bucket: props['s3.bucket'], Prefix: 'incoming/' })
        if (!l.ok) return bad(l, el.list)
        const synced = new Set(store.synced ?? [])
        const todo = l.Contents.filter((o) => !synced.has(o.Key)).slice(0, 3)
        const log = []
        for (const o of todo) {
          const g = ctx.aws.s3(cfg, 'GetObject', { Bucket: props['s3.bucket'], Key: o.Key })
          if (!g.ok) return bad(g, el.get)
          synced.add(o.Key)
          log.push(info(`Image ${o.Key} (${g.ContentLength} bytes) copied to the web shop`))
        }
        if (!todo.length) log.push(info(`No new images under incoming/ (${l.Contents.length} synced)`))
        return { ok: true, ms: 120 + todo.length * 80, log, store: { ...store, synced: [...synced].slice(-40), runs: keep(store.runs, { t: now, ok: true }) } }
      },
    },
  },
}
