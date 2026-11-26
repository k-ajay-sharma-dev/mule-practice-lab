// The sample application of the retry-storm lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

const QUERY_TIMEOUT = 2000 // ms the Update stock operation waits for the warehouse database
const whole = (value, fallback) => (Number.isFinite(Number(value)) && String(value).trim() !== '' ? Math.max(0, Math.floor(Number(value))) : fallback)

// The retry policy of the Until Successful scope, read from the properties
export const retryPolicy = (props) => ({ max: whole(props['retry.max'], 0), wait: whole(props['retry.waitMs'], 0) })

export const PACKAGES = {
  'stock-update-sync': {
    note: 'Takes stock updates from a queue and writes them to the warehouse database (Oracle). The write is wrapped in Until Successful, set by retry.max and retry.waitMs. The replay flow moves the dead letters back to the queue.',
    backend: 'oracle',
    boot: needs('warehouse.db.host', 'queue.name', 'dlq.name', 'retry.max', 'retry.waitMs'),
    schedules: [{ flow: 'replay-dlq-flow', type: 'fixed', value: 1, unit: 'days', enabled: false }],
    consumes: 'queue.name',
    consume(ctx, message) {
      const { max, wait } = retryPolicy(ctx.props)
      const calls = max + 1 // the first attempt and then each retry
      const order = String(message.body).match(/O-\d+/)?.[0] ?? message.id
      let be = ctx.backend('oracle')
      // each attempt is one call to the database. The lab records up to 60 of them for Visualizer.
      for (let i = 1; i < Math.min(calls, 60) && (!be.up || be.ms >= QUERY_TIMEOUT); i++) be = ctx.backend('oracle')
      if (be.up && be.ms < QUERY_TIMEOUT) return { ok: true, flow: 'stock-update-flow', log: [info(`Stock update ${order} written to the warehouse database in ${be.ms} ms. 1 call.`)] }
      const each = be.up ? QUERY_TIMEOUT : 30
      const seconds = Math.round((calls * each + max * wait) / 100) / 10
      const last = be.up
        ? `DB:QUERY_EXECUTION ORA-01013: user requested cancel of current operation (query timeout ${QUERY_TIMEOUT / 1000} s)`
        : `DB:CONNECTIVITY Cannot get connection for URL jdbc:oracle:thin:@${ctx.props['warehouse.db.host']}:1521/WMS: ORA-12541: TNS:no listener`
      return {
        ok: false,
        flow: 'stock-update-flow',
        errorType: 'MULE:RETRY_EXHAUSTED',
        error: {
          flow: 'stock-update-flow',
          file: 'stock-update-sync',
          at: 1,
          name: 'Retry warehouse update',
          dsl: '<until-successful maxRetries="${retry.max}" millisBetweenRetries="${retry.waitMs}" doc:name="Retry warehouse update">',
          type: 'MULE:RETRY_EXHAUSTED',
          message: `'until-successful' retries exhausted. Stock update ${order}: ${calls} calls to the warehouse database in ${seconds} s (maxRetries ${max}, millisBetweenRetries ${wait}). Last error: ${last}`,
        },
      }
    },
    run: {
      'replay-dlq-flow': ({ props }) => ({ ok: true, ms: 3000, log: [info('Starting replay-dlq-flow'), info(`Moved the messages of ${props['dlq.name']} back to ${props['queue.name']}`)], move: { from: props['dlq.name'], to: props['queue.name'] } }),
    },
  },
}
