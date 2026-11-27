// The sample applications of the db-sql-deadlock lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { muleError, needs, warn } from '../platform-log.js'

const FILE = 'order-payments-sapi'
const PROVIDER_MS = 900 // the call to the payment provider
const UPDATE_MS = 25 // one UPDATE on SQL Server
const body500 = '{"message":"Internal server error"}'
const whole = (value, fallback) => (String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback)

// a stable choice per call and per attempt, so the same state gives the same answers
const pick = (t, salt) => ((((Math.floor(t / 7) + salt * 7919) * 2654435761) >>> 0) % 100000) / 100000

// The settings of the application, read from the properties
export function settingsOf(props) {
  return {
    order: String(props['db.lockOrder.reservations'] ?? '').trim() === 'orders-then-stock' ? 'same' : 'opposite',
    short: String(props['tx.scope'] ?? '').trim() === 'db-only',
    on: ['all', 'deadlock'].includes(String(props['retry.on']).trim()) ? String(props['retry.on']).trim() : 'none',
    max: whole(props['retry.max'], 0),
    wait: whole(props['retry.waitMs'], 60000),
  }
}

// How often one attempt is chosen as the deadlock victim. Locks in the same order block for a moment and never deadlock.
// The longer a transaction holds its first lock, the more often the other flow takes its own first lock in that time.
export const deadlockChance = (set) => (set.order === 'same' ? 0 : set.short ? 0.06 : 0.3)

const DEADLOCK = (pid) => `com.microsoft.sqlserver.jdbc.SQLServerException: Transaction (Process ID ${pid}) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.`
// the payment row of an order that does not exist breaks the foreign key to dbo.orders
const FOREIGN_KEY = `com.microsoft.sqlserver.jdbc.SQLServerException: The INSERT statement conflicted with the FOREIGN KEY constraint "FK_payment_order". The conflict occurred in database "orders", table "dbo.orders", column 'order_id'.`

export const PACKAGES = {
  [FILE]: {
    note: 'Payments and stock reservations on SQL Server. POST /payments/{orderId} locks the orders row, then the stock row. POST /reservations/{orderId} locks them in the order set by db.lockOrder.reservations (stock-then-orders or orders-then-stock). tx.scope is whole-flow (the transaction also holds the payment provider call) or db-only. The updates sit in Until Successful: retry.on (none, all or deadlock), retry.max and retry.waitMs.',
    sample: { method: 'POST', path: '/payments/O-5001' },
    boot: needs('db.host', 'db.lockOrder.reservations', 'tx.scope', 'retry.on', 'retry.max'),
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const m = path.match(/^\/(payments|reservations)\/([\w-]+)$/)
      if (!m || req.method !== 'POST') return { status: 404, ms: 10, error: 'APIKIT:NOT_FOUND', flow: `${FILE}-main`, body: '{"message":"Resource not found"}' }
      const [, kind, id] = m
      const set = settingsOf(ctx.props)
      const flow = `post:\\${kind}\\(orderId)`
      const name = kind === 'payments' ? 'Update order and stock' : 'Reserve stock'
      const at = { flow, file: FILE, at: 2, name }
      const dsl = set.on === 'none' ? `<db:update doc:name="${name}" config-ref="SqlServer_Config">` : `<until-successful maxRetries="\${retry.max}" millisBetweenRetries="\${retry.waitMs}" doc:name="${name}">`
      // a payment calls the provider: inside the transaction with whole-flow, before it with db-only
      const provider = kind === 'payments' ? PROVIDER_MS : 0
      const attemptMs = 2 * UPDATE_MS + (set.short ? 0 : provider)
      const outside = set.short ? provider : 0
      const tries = set.on === 'none' ? 1 : set.max + 1
      const wait = Math.min(set.wait, 120000)
      const t = ctx.now + (req.offset ?? 0)

      // an order that does not exist: the update breaks a foreign key, and no retry can change that
      if (/^O-9/.test(id)) {
        if (set.on !== 'all') return { status: 422, ms: outside + attemptMs + 15, flow, error: 'DB:QUERY_EXECUTION', log: [warn(`Order ${id} does not exist. On Error Continue answered 422.`)], body: '{"message":"Unknown order"}' }
        const ms = outside + tries * attemptMs + (tries - 1) * wait
        const error = { ...at, dsl, type: 'MULE:RETRY_EXHAUSTED', message: `'until-successful' retries exhausted. ${tries} attempts in ${(ms / 1000).toFixed(1)} s for order ${id}, retry.on all. Every attempt failed the same way: DB:QUERY_EXECUTION ${FOREIGN_KEY}` }
        return { status: 500, ms, flow, error: error.type, log: [muleError(error)], body: body500 }
      }

      const chance = deadlockChance(set)
      let attempt = 0
      while (attempt < tries && pick(t, attempt * 31 + (kind === 'payments' ? 1 : 2)) < chance) {
        attempt++
        if (set.on === 'none') break
      }
      const ok = { status: 201, flow, body: `{"orderId":"${id}","status":"${kind === 'payments' ? 'PAID' : 'RESERVED'}"}` }
      // blocked behind the other flow for a moment, the longer the other transaction is
      const blocked = set.order === 'same' ? (set.short ? 10 : 180) : 0
      if (attempt === 0) return { ...ok, ms: outside + attemptMs + blocked + 20 }
      if (set.on !== 'none' && attempt < tries) {
        const ms = outside + (attempt + 1) * attemptMs + attempt * wait + 20
        return { ...ok, ms, log: [warn(`Deadlock victim on attempt ${attempt} for ${id}. Until Successful ran the transaction again and it committed on attempt ${attempt + 1}.`)] }
      }
      const pid = 50 + Math.floor(pick(t, 99) * 90)
      if (set.on === 'none') {
        const error = { ...at, dsl, type: 'DB:QUERY_EXECUTION', message: DEADLOCK(pid) }
        return { status: 500, ms: outside + attemptMs + 20, flow, error: error.type, log: [muleError(error)], body: body500 }
      }
      const ms = outside + tries * attemptMs + (tries - 1) * wait
      const error = { ...at, dsl, type: 'MULE:RETRY_EXHAUSTED', message: `'until-successful' retries exhausted. ${tries} attempts for ${id}. Last error: DB:QUERY_EXECUTION ${DEADLOCK(pid)}` }
      return { status: 500, ms, flow, error: error.type, log: [muleError(error)], body: body500 }
    },
  },
}
