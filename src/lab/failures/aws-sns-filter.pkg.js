// The sample application of the aws-sns-filter lab. Imports only platform-log.js and the import free AWS engine, so the
// engine can load it without a cycle. The app reaches SNS through ctx.aws (src/lab/platform-aws.js).
import { info, muleError, needs } from '../platform-log.js'
import { awsCfg } from '../platform-aws.js'

export const PUBLISHER = 'brightmart-price-sns-publisher'
export const PRICE_FLOW = 'price-change-flow'
// the price changes the pricing engine makes, in turn: sku, region, discount in percent
export const CHANGES = [
  ['H-1250', 'east', 10],
  ['H-1300', 'central', 35],
  ['H-2000', 'west', 20],
  ['H-2210', 'east', 50],
  ['H-1400', 'central', 15],
  ['H-3120', 'west', 40],
]
const keep = (arr, item, n = 60) => [...(arr ?? []), item].slice(-n)
const typeOf = (p) => (String(p['sns.attr.discountPct.dataType'] ?? '').trim() || 'String')
const el = { flow: PRICE_FLOW, at: 2, name: 'Publish', dsl: '<sns:publish doc:name="Publish" config-ref="Amazon_SNS_Configuration" topicArn="${sns.topicArn}"/>' }

function publish(ctx, change, source) {
  const [sku, region, pct, t] = change
  const message = JSON.stringify({ sku, region, discountPct: pct, source, changedAt: t })
  return ctx.aws.sns(awsCfg(ctx.props), 'Publish', {
    TopicArn: ctx.props['sns.topicArn'],
    Message: message,
    MessageAttributes: { eventType: { DataType: 'String', StringValue: 'PriceChanged' }, region: { DataType: 'String', StringValue: region }, discountPct: { DataType: typeOf(ctx.props), StringValue: String(pct) } },
  })
}

export const PACKAGES = {
  [PUBLISHER]: {
    note: `Every 2 minutes the flow ${PRICE_FLOW} takes the next price change of the pricing engine and publishes it to the SNS topic sns.topicArn with the Publish operation of the Amazon SNS connector. The message attributes are eventType, region and discountPct. The DataType of discountPct comes from sns.attr.discountPct.dataType (String or Number; lab-made: in the real app the DataWeave of the flow builds the attributes). POST /replay with {"from":"08:00"} publishes again every change it made since that time. The connection uses aws.region, aws.accessKeyId and the secure property aws.secretAccessKey.`,
    sample: { method: 'POST', path: '/replay', body: '{"from":"08:00"}' },
    boot: needs('aws.region', 'aws.accessKeyId', 'aws.secretAccessKey', 'sns.topicArn'),
    schedules: [{ flow: PRICE_FLOW, type: 'fixed', value: '2', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      if (req.method !== 'POST' || req.path.split('?')[0] !== '/replay') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${PUBLISHER}-main`, body: '{"message":"Resource not found"}' }
      let from
      try {
        from = String(JSON.parse(req.body || '{}').from ?? '')
      } catch {
        return { status: 400, ms: 5, error: 'APIKIT:BAD_REQUEST', flow: 'post:\\replay', body: '{"message":"Invalid JSON"}' }
      }
      const m = /^(\d{1,2}):(\d{2})$/.exec(from)
      if (!m) return { status: 400, ms: 5, error: 'APIKIT:BAD_REQUEST', flow: 'post:\\replay', body: '{"message":"from must be a time such as 08:00"}' }
      const store = (ctx.app.store ??= {})
      const day = Math.floor(ctx.now / 86400000) * 86400000
      const since = day + (Number(m[1]) * 60 + Number(m[2])) * 60000
      const list = (store.made ?? []).filter((c) => c[3] >= since)
      let n = 0
      for (const c of list) {
        const r = publish(ctx, c, 'replay')
        if (!r.ok) return { status: 500, ms: 40 + n * 30, flow: 'post:\\replay', error: r.type, log: [muleError({ ...el, flow: 'post:\\replay', file: PUBLISHER, type: r.type, message: r.text })], body: '{"message":"Internal server error"}' }
        n++
      }
      store.replays = keep(store.replays, { t: ctx.now, from: since, n, type: typeOf(ctx.props) }, 10)
      return { status: 200, ms: 40 + n * 30, flow: 'post:\\replay', log: [info(`Replay from ${from}: ${n} price changes published again with discountPct as ${typeOf(ctx.props)}`)], body: `{"replayed":${n}}` }
    },
    run: {
      [PRICE_FLOW]: (ctx) => {
        const { store, now } = ctx
        const i = store.i ?? 0
        const [sku, region, pct] = CHANGES[i % CHANGES.length]
        const change = [sku, region, pct, now]
        const r = publish(ctx, change, 'live')
        if (!r.ok) return { ok: false, ms: 60, errorType: r.type, log: [muleError({ ...el, file: PUBLISHER, type: r.type, message: r.text })], store }
        return { ok: true, ms: 60, log: [info(`Price change ${sku} in ${region}, ${pct}% off, published as ${r.MessageId} (discountPct ${typeOf(ctx.props)})`)], store: { ...store, i: i + 1, made: keep(store.made, change) } }
      },
    },
  },
}
