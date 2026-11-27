// The sample applications of the aws-sqs-visibility lab. Imports only platform-log.js and the import free AWS engine,
// so the engine can load it without a cycle. Both apps reach SQS through ctx.aws (src/lab/platform-aws.js).
import { info, muleError, needs, warn } from '../platform-log.js'
import { awsCfg } from '../platform-aws.js'

export const INTAKE = 'brightmart-returns-sqs-intake'
export const REFUNDS = 'brightmart-returns-sqs-refunds'
export const REFUND_FLOW = 'refund-listener-flow'
// a refund calls the payment provider and the warehouse system and takes about 75 seconds
export const REFUND_SECONDS = 75
const keep = (arr, item, n = 80) => [...(arr ?? []), item].slice(-n)
const on = (v) => String(v ?? '').trim().toLowerCase() === 'true'

const el = {
  send: { flow: 'post:\\returns', at: 2, name: 'Send message', dsl: '<sqs:send-message doc:name="Send message" config-ref="Amazon_SQS_Configuration" queueUrl="${sqs.queueUrl}"/>' },
  listen: { flow: REFUND_FLOW, at: 0, name: 'Receive messages', dsl: '<sqs:receivemessages doc:name="Receive messages" config-ref="Amazon_SQS_Configuration" queueUrl="${sqs.queueUrl}" visibilityTimeout="${sqs.visibilityTimeout}" numberOfConsumers="${sqs.numberOfConsumers}"/>' },
}

export const PACKAGES = {
  [INTAKE]: {
    note: 'The returns portal posts each approved return to POST /returns. The flow sends one SQS message per return, with the RMA number and the amount, to sqs.queueUrl with the Send message operation of the Amazon SQS connector. The connection uses aws.region, aws.accessKeyId and the secure property aws.secretAccessKey.',
    sample: { method: 'POST', path: '/returns', body: '{"amount":59.9}' },
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 'sqs.queueUrl'),
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/returns') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${INTAKE}-main`, body: '{"message":"Resource not found"}' }
      const store = (ctx.app.store ??= {})
      store.n = (store.n ?? 5100) + 1
      const rma = `RMA-${store.n}`
      let amount = 59.9
      try {
        amount = Number(JSON.parse(req.body || '{}').amount ?? amount)
      } catch {
        return { status: 400, ms: 5, error: 'APIKIT:BAD_REQUEST', flow: el.send.flow, body: '{"message":"Invalid JSON"}' }
      }
      const r = ctx.aws.sqs(awsCfg(ctx.props), 'SendMessage', { QueueUrl: ctx.props['sqs.queueUrl'], MessageBody: JSON.stringify({ rma, amount }), MessageAttributes: { source: { DataType: 'String', StringValue: 'returns-portal' } } })
      if (!r.ok) return { status: 500, ms: r.ms + 10, flow: el.send.flow, error: r.type, log: [muleError({ ...el.send, file: INTAKE, type: r.type, message: r.text })], body: '{"message":"Internal server error"}' }
      return { status: 202, ms: r.ms + 15, flow: el.send.flow, body: `{"rma":"${rma}","messageId":"${r.MessageId}"}` }
    },
  },
  [REFUNDS]: {
    note: `The flow ${REFUND_FLOW} has the Receive messages source of the Amazon SQS connector on sqs.queueUrl with sqs.numberOfConsumers consumers (lab-made name for the receivers that poll in parallel). sqs.visibilityTimeout sets the visibility timeout of each receive; empty uses the timeout of the queue. For each message it calls the payment provider and the warehouse to refund the return, which takes about ${REFUND_SECONDS} seconds, and the source deletes the message when the flow ends. With idempotency.enabled true an Idempotent message validator on the RMA number skips a return that was refunded already (lab-made: the property switches the validator on).`,
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 'sqs.queueUrl'),
    schedules: [{ flow: REFUND_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [REFUND_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const refunded = { ...(store.refunded ?? {}) }
        let refunds = store.refunds ?? []
        let skipped = store.skipped ?? 0
        const log = []
        const idem = on(props['idempotency.enabled'])
        const r = ctx.aws.listen(awsCfg(props), props['sqs.queueUrl'], { consumers: props['sqs.numberOfConsumers'], visibility: props['sqs.visibilityTimeout'] }, (m) => {
          let body
          try {
            body = JSON.parse(m.Body)
          } catch {
            log.push(warn(`Message ${m.MessageId} is not JSON, it goes back to the queue`))
            return { ok: false, seconds: 0.2 }
          }
          const n = refunded[body.rma] ?? 0
          if (idem && n > 0) {
            skipped++
            log.push(info(`${body.rma}: refunded already, skipped by the idempotent message validator (receive ${m.Attributes.ApproximateReceiveCount})`))
            return { ok: true, seconds: 0.3 }
          }
          refunded[body.rma] = n + 1
          refunds = keep(refunds, { rma: body.rma, t: now, rc: Number(m.Attributes.ApproximateReceiveCount) })
          log.push(n ? warn(`${body.rma}: refund of ${body.amount} EUR issued again, refund number ${n + 1} for this return (receive ${m.Attributes.ApproximateReceiveCount})`) : info(`${body.rma}: refund of ${body.amount} EUR issued (receive ${m.Attributes.ApproximateReceiveCount})`))
          return { ok: true, seconds: REFUND_SECONDS }
        })
        // the refund ledger keeps the last 80 returns
        const kept = Object.fromEntries(Object.entries(refunded).slice(-80))
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el.listen, file: REFUNDS, type: r.type, message: r.text })], store }
        if (log.length > 12) log.splice(11, log.length - 11, warn(`${log.length - 11} more lines left out`))
        return { ok: true, ms: 50 + r.received * 40, log, store: { ...store, refunded: kept, refunds, skipped } }
      },
    },
  },
}
