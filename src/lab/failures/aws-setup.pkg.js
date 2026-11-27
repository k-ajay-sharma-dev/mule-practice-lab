// The sample application of the aws-setup lab. Imports only platform-log.js and the import free AWS engine, so the
// engine can load it without a cycle. The app reaches S3 and SQS through ctx.aws (src/lab/platform-aws.js).
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { awsCfg } from '../platform-aws.js'

export const POD_BRIDGE = 'harbor-pod-aws-bridge'
export const POD_JAR = `${POD_BRIDGE}-1.0.0-mule-application.jar`
export const POD_FLOW = 'pod-events-listener-flow'
export const POD_SAMPLE = '{"shipment":"SL-40021","order":"O-1001","deliveredAt":"2026-11-03T08:41:00Z","signedBy":"R. Moreau"}'
const keep = (arr, item, n = 30) => [...(arr ?? []), item].slice(-n)
const el = {
  put: { flow: 'post:\\pod', at: 2, name: 'Put Object', dsl: '<s3:put-object doc:name="Put Object" config-ref="Amazon_S3_Configuration" bucketName="${s3.bucket}" key="#[vars.key]"/>' },
  send: { flow: 'post:\\pod', at: 3, name: 'Send message', dsl: '<sqs:send-message doc:name="Send message" config-ref="Amazon_SQS_Configuration" queueUrl="${sqs.queueUrl}"/>' },
  listen: { flow: POD_FLOW, at: 0, name: 'Receive messages', dsl: '<sqs:receivemessages doc:name="Receive messages" config-ref="Amazon_SQS_Configuration" queueUrl="${sqs.queueUrl}" numberOfConsumers="2"/>' },
  parse: { flow: POD_FLOW, at: 2, name: 'Read POD event', dsl: '<ee:transform doc:name="Read POD event">' },
}
const bad = (status, error, flow, extra = {}) => ({ status, ms: 6, error, flow, body: `{"message":"${status === 404 ? 'Resource not found' : 'Bad request'}"}`, ...extra })

export const PACKAGES = {
  [POD_BRIDGE]: {
    note: `The proof of delivery bridge. The carrier posts each proof of delivery to POST /pod with {"shipment","order","deliveredAt","signedBy"}. The flow writes it as JSON to the bucket s3.bucket under pod/ plus the date and the shipment, with Put Object of the Amazon S3 connector, and sends an event to sqs.queueUrl with Send message of the Amazon SQS connector. The flow ${POD_FLOW} receives those events with 2 consumers and marks the order delivered; a message that is not a valid event fails the flow, so SQS delivers it again. GET /health checks the bucket with Head bucket and the queue with Get queue attributes. Both connections use aws.region, aws.accessKeyId and the secure property aws.secretAccessKey.`,
    sample: { method: 'POST', path: '/pod', body: POD_SAMPLE },
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 's3.bucket', 'sqs.queueUrl'),
    schedules: [{ flow: POD_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const cfg = awsCfg(ctx.props)
      const { props } = ctx
      if (req.method === 'GET' && path === '/health') {
        const b = ctx.aws.s3(cfg, 'HeadBucket', { Bucket: props['s3.bucket'] })
        const q = b.ok ? ctx.aws.sqs(cfg, 'GetQueueAttributes', { QueueUrl: props['sqs.queueUrl'] }) : null
        if (!b.ok || !q.ok) {
          const r = b.ok ? q : b
          return { status: 503, ms: 40, flow: 'get:\\health', error: r.type, log: [warn(`Health check failed: ${r.text}`)], body: JSON.stringify({ s3: b.ok ? 'ok' : r.code, sqs: q?.ok ? 'ok' : (q?.code ?? 'not checked') }) }
        }
        return { status: 200, ms: 60, flow: 'get:\\health', log: [info(`Health check: bucket ${props['s3.bucket']} reachable, queue has ${q.Attributes.ApproximateNumberOfMessages} messages waiting`)], body: '{"s3":"ok","sqs":"ok"}' }
      }
      if (req.method !== 'POST' || path !== '/pod') return bad(404, 'APIKIT:NOT_FOUND', `${POD_BRIDGE}-main`)
      let pod
      try {
        pod = JSON.parse(req.body || '{}')
      } catch {
        return bad(400, 'APIKIT:BAD_REQUEST', 'post:\\pod')
      }
      if (!pod.shipment || !pod.order) return bad(400, 'APIKIT:BAD_REQUEST', 'post:\\pod')
      const key = `pod/2026/11/03/${pod.shipment}.json`
      const put = ctx.aws.s3(cfg, 'PutObject', { Bucket: props['s3.bucket'], Key: key, Body: JSON.stringify(pod) })
      if (!put.ok) return { status: 500, ms: put.ms + 10, flow: el.put.flow, error: put.type, log: [muleError({ ...el.put, file: POD_BRIDGE, type: put.type, message: put.text })], body: '{"message":"Internal server error"}' }
      const sent = ctx.aws.sqs(cfg, 'SendMessage', { QueueUrl: props['sqs.queueUrl'], MessageBody: JSON.stringify({ type: 'PodReceived', shipment: pod.shipment, order: pod.order, s3Key: key }) })
      if (!sent.ok) return { status: 500, ms: sent.ms + put.ms, flow: el.send.flow, error: sent.type, log: [muleError({ ...el.send, file: POD_BRIDGE, type: sent.type, message: sent.text })], body: '{"message":"Internal server error"}' }
      return { status: 202, ms: put.ms + sent.ms + 15, flow: el.send.flow, log: [info(`POD of ${pod.shipment} stored as s3://${props['s3.bucket']}/${key} (${put.ServerSideEncryption}), event ${sent.MessageId} sent`)], body: `{"shipment":"${pod.shipment}","s3Key":"${key}"}` }
    },
    run: {
      [POD_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        let delivered = store.delivered ?? []
        let errors = 0
        const log = []
        const r = ctx.aws.listen(awsCfg(props), props['sqs.queueUrl'], { consumers: 2 }, (m) => {
          let e
          try {
            e = JSON.parse(m.Body)
          } catch {
            e = null
          }
          if (!e || e.type !== 'PodReceived' || !e.order) {
            errors++
            log.push(muleError({ ...el.parse, file: POD_BRIDGE, type: 'MULE:EXPRESSION', message: e ? `Message ${m.MessageId} is not a POD event: the field order is missing (receive ${m.Attributes.ApproximateReceiveCount})` : `Unexpected end-of-input at payload@[1:${m.Body.length + 1}] (line:column), while reading payload as Json. Message ${m.MessageId}, receive ${m.Attributes.ApproximateReceiveCount}` }))
            return { ok: false, seconds: 0.2 }
          }
          delivered = keep(delivered, { order: e.order, shipment: e.shipment, t: now })
          log.push(info(`Order ${e.order} marked delivered (shipment ${e.shipment})`))
          return { ok: true, seconds: 2 }
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.listen, file: POD_BRIDGE, type: r.type, message: r.text })], store }
        if (r.errors.length) log.push(line('ERROR', `Delete message failed: ${r.errors[0].text}`))
        return { ok: errors === 0 && !r.errors.length, ms: 40 + r.received * 30, errors, errorType: errors ? 'MULE:EXPRESSION' : r.errors.length ? r.errors[0].type : null, log, store: { ...store, delivered } }
      },
    },
  },
}
