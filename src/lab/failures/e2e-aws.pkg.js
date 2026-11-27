// The sample application of the end to end lab of AWS. Imports only platform-log.js and the import free AWS engine, so
// the engine can load it without a cycle. The carrier posts a proof of delivery (POD); the app keeps the document in S3,
// puts a small event with the S3 key on SQS (a claim check), and a listener marks the order delivered in the order
// database (SQL Server BrightmartOrders, dbo.orders).
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { awsCfg } from '../platform-aws.js'

export const AWS_PKG = 'brightmart-e2e-pod-papi'
export const AWS_FLOW = 'pod-events-listener-flow'
// lab-made: the app reaches the database server of its db.host; the lab has a Sandbox and a Production order database
export const ORDER_DBS = { 'sql.brightmart.lab': 'brightmart-sql', 'sql-prd.brightmart.lab': 'brightmart-sql-prd' }
const word = (v) => String(v ?? '').trim()
const json = (o) => JSON.stringify(o)
const keyOf = (pod) => `pod/${word(pod.deliveredAt).slice(0, 10).replace(/-/g, '/')}/${pod.shipment}.json`
const dbOf = (p) => ({ name: ORDER_DBS[word(p['db.host']).toLowerCase()] ?? 'brightmart-sql', cfg: { host: p['db.host'], database: p['db.database'], user: p['db.user'], password: p['db.password'] } })
const POST = 'post:\\pods:application\\json:proof-of-delivery-api-config'
const GET = 'get:\\pods\\(shipment):proof-of-delivery-api-config'
const el = {
  put: { flow: POST, at: 2, name: 'Put Object', dsl: '<s3:put-object doc:name="Put Object" config-ref="Amazon_S3_Configuration" bucketName="${s3.bucket}" key="#[vars.key]"/>' },
  send: { flow: POST, at: 3, name: 'Send message', dsl: '<sqs:send-message doc:name="Send message" config-ref="Amazon_SQS_Configuration" queueUrl="${sqs.queueUrl}"/>' },
  listen: { flow: AWS_FLOW, at: 0, name: 'Receive messages', dsl: '<sqs:receivemessages doc:name="Receive messages" config-ref="Amazon_SQS_Configuration" queueUrl="${sqs.queueUrl}" numberOfConsumers="2"/>' },
  get: { flow: AWS_FLOW, at: 2, name: 'Get Object', dsl: '<s3:get-object doc:name="Get Object" config-ref="Amazon_S3_Configuration" bucketName="${s3.bucket}" key="#[payload.s3Key]"/>' },
  update: { flow: AWS_FLOW, at: 4, name: 'Mark order delivered', dsl: '<db:update doc:name="Mark order delivered" config-ref="Orders_Database_Config">' },
}
const bad = (status, error, flow, message) => ({ status, ms: 6, error, flow, body: json({ message }) })

export const POD_BODY = (shipment, order) => json({ shipment, order, deliveredAt: '2026-11-03T08:41:00Z', signedBy: 'R. Moreau', signature: 'iVBORw0KGgo...lab' })

export const PACKAGES = {
  [AWS_PKG]: {
    note: `Proof of Delivery API of Brightmart. The carrier posts each POD to POST /pods with {"shipment","order","deliveredAt","signedBy","signature"}. The flow writes the whole document to the bucket s3.bucket under pod/ plus the date and the shipment with Put Object, sends a small event {"type":"PodReceived","shipment","order","s3Key","correlationId"} to sqs.queueUrl with Send message and answers 202. The flow ${AWS_FLOW} receives the events with 2 consumers, reads the POD back from S3 with Get Object and runs UPDATE dbo.orders SET status = 'DELIVERED' WHERE order_id = :order on db.host. An order the order system does not have fails the message, so SQS delivers it again and the redrive policy moves it to the dead-letter queue. GET /pods/{shipment} reads the POD from S3 and the order status. The X-Correlation-ID of the POST travels in the event and is logged by the listener. Properties: aws.region, aws.accessKeyId, the secure aws.secretAccessKey, s3.bucket, sqs.queueUrl, db.host, db.database, db.user, the secure db.password.`,
    sample: { method: 'POST', path: '/pods', body: POD_BODY('SL-40031', 'O-1006') },
    traced: true,
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 's3.bucket', 'sqs.queueUrl', 'db.host', 'db.database', 'db.user', 'db.password'),
    schedules: [{ flow: AWS_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const cfg = awsCfg(ctx.props)
      const p = ctx.props
      const g = path.match(/^\/pods\/([\w-]+)$/)
      // lab-made: every POD of the lab is delivered on 2026-11-03, so the key of a shipment is known without an index
      if (req.method === 'GET' && g) {
        const o = ctx.aws.s3(cfg, 'GetObject', { Bucket: p['s3.bucket'], Key: `pod/2026/11/03/${g[1]}.json` })
        if (!o.ok) return { status: o.code === 'NoSuchKey' ? 404 : 502, ms: o.ms ?? 30, flow: GET, error: o.code === 'NoSuchKey' ? undefined : o.type, body: json({ message: o.code === 'NoSuchKey' ? `No POD for shipment ${g[1]}` : o.text }) }
        let pod = {}
        try {
          pod = JSON.parse(o.Body)
        } catch {
          pod = {}
        }
        const d = dbOf(p)
        const r = ctx.db.select(d.name, d.cfg, 'SELECT order_id, status FROM dbo.orders WHERE order_id = :order', { order: pod.order ?? '' })
        return { status: 200, ms: 120, flow: GET, body: json({ shipment: pod.shipment, order: pod.order, deliveredAt: pod.deliveredAt, signedBy: pod.signedBy, orderStatus: r.ok ? (r.rows[0]?.status ?? 'NOT_FOUND') : 'UNKNOWN' }) }
      }
      if (req.method !== 'POST' || path !== '/pods') return bad(404, 'APIKIT:NOT_FOUND', 'proof-of-delivery-api-main', 'Resource not found')
      let pod
      try {
        pod = JSON.parse(req.body || '{}')
      } catch {
        return bad(400, 'APIKIT:BAD_REQUEST', POST, 'The body is not JSON')
      }
      if (!word(pod?.shipment) || !word(pod?.order) || !/^\d{4}-\d{2}-\d{2}T/.test(word(pod?.deliveredAt))) return bad(400, 'APIKIT:BAD_REQUEST', POST, 'shipment, order and deliveredAt are required')
      const key = keyOf(pod)
      const cid = word(req.cid) || `pod-${pod.shipment}`
      const put = ctx.aws.s3(cfg, 'PutObject', { Bucket: p['s3.bucket'], Key: key, Body: JSON.stringify(pod) })
      if (!put.ok) return { status: 500, ms: put.ms + 10, flow: POST, error: put.type, log: [muleError({ ...el.put, file: AWS_PKG, type: put.type, message: put.text })], body: json({ message: 'The POD was not stored' }) }
      const sent = ctx.aws.sqs(cfg, 'SendMessage', { QueueUrl: p['sqs.queueUrl'], MessageBody: json({ type: 'PodReceived', shipment: pod.shipment, order: pod.order, s3Key: key, correlationId: cid }) })
      if (!sent.ok) return { status: 500, ms: sent.ms + put.ms, flow: POST, error: sent.type, log: [muleError({ ...el.send, file: AWS_PKG, type: sent.type, message: sent.text })], body: json({ message: 'The POD was stored but the event was not sent' }) }
      return { status: 202, ms: put.ms + sent.ms + 15, flow: POST, log: [info(`correlationId=${cid} POD of ${pod.shipment} for order ${pod.order} stored as s3://${p['s3.bucket']}/${key} (${put.ServerSideEncryption}), event ${sent.MessageId} sent`)], body: json({ shipment: pod.shipment, s3Key: key, correlationId: cid }) }
    },
    run: {
      [AWS_FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const cfg = awsCfg(p)
        const d = dbOf(p)
        let delivered = store.delivered ?? []
        let errors = 0
        let errorType = null
        const log = []
        const r = ctx.aws.listen(cfg, p['sqs.queueUrl'], { consumers: 2 }, (m) => {
          let e = null
          try {
            e = JSON.parse(m.Body)
          } catch {
            e = null
          }
          const rc = m.Attributes.ApproximateReceiveCount
          if (!e || e.type !== 'PodReceived' || !e.order || !e.s3Key) {
            errors++
            errorType = 'MULE:EXPRESSION'
            log.push(muleError({ ...el.listen, at: 1, name: 'Read POD event', dsl: '<ee:transform doc:name="Read POD event">', file: AWS_PKG, type: 'MULE:EXPRESSION', message: `Message ${m.MessageId} is not a POD event (receive ${rc})` }))
            return { ok: false, seconds: 0.2 }
          }
          const cid = e.correlationId ?? `pod-${e.shipment}`
          const o = ctx.aws.s3(cfg, 'GetObject', { Bucket: p['s3.bucket'], Key: e.s3Key })
          if (!o.ok) {
            errors++
            errorType = o.type
            log.push(muleError({ ...el.get, file: AWS_PKG, type: o.type, message: `correlationId=${cid} ${o.text} (receive ${rc})` }))
            return { ok: false, seconds: 0.3 }
          }
          const u = ctx.db.update(d.name, d.cfg, "UPDATE dbo.orders SET status = 'DELIVERED' WHERE order_id = :order", { order: e.order })
          if (!u.ok) {
            errors++
            errorType = u.errorType
            log.push(muleError({ ...el.update, file: AWS_PKG, type: u.errorType, message: `correlationId=${cid} ${u.text} (receive ${rc})` }))
            return { ok: false, seconds: 0.5 }
          }
          if (!u.affected) {
            // lab-made error type: the order system does not know the order yet
            errors++
            errorType = 'POD:ORDER_NOT_FOUND'
            log.push(line('ERROR', `correlationId=${cid} Order ${e.order} of shipment ${e.shipment} is not in the order system. The message is not deleted, so SQS delivers it again (receive ${rc} of the redrive policy).`))
            return { ok: false, seconds: 0.4 }
          }
          delivered = [...delivered, { order: e.order, shipment: e.shipment, cid, t: now }].slice(-20)
          log.push(info(`correlationId=${cid} POD ${e.s3Key} read from S3; order ${e.order} marked DELIVERED (shipment ${e.shipment}, receive ${rc})`))
          return { ok: true, seconds: 1.5 }
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.listen, file: AWS_PKG, type: r.type, message: r.text })], store }
        if (r.errors.length) log.push(warn(`Delete message failed: ${r.errors[0].text}`))
        return { ok: errors === 0 && !r.errors.length, ms: 40 + r.received * 30, errors, errorType: errorType ?? (r.errors.length ? r.errors[0].type : null), log, store: { ...store, delivered } }
      },
    },
  },
}
