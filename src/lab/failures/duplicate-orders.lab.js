// The guided lab duplicate-orders. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform, timeText } from '../platform.js'
import { app, ask, change, OPS, propsValue, sawLogs, until, withProp } from '../platform-kit.js'
import { ORDER_EVERY, orderId, orderNumber } from './duplicate-orders.pkg.js'

const NAME = 'order-sync-poll'
const DOCS = 'https://docs.mulesoft.com/object-store-connector/latest/object-store-connector-reference'

// Each run of the job, read back from its log lines: where it started and which orders it sent to the ERP
function runsOf(a) {
  const runs = new Map()
  for (const l of a?.logs ?? []) {
    const run = runs.get(l.t) ?? { t: l.t, config: l.config }
    if (/^Watermark SO-\d+ found/.test(l.text)) run.from = 'found'
    else if (/^No watermark in the object store\. Reading after watermark\.initial/.test(l.text)) run.from = 'initial'
    else if (/^No watermark in the object store\. Reading all orders/.test(l.text)) run.from = 'day'
    const m = l.text.match(/^Sent \d+ orders? to the ERP: (SO-\d+) to (SO-\d+)/)
    if (m) Object.assign(run, { first: orderNumber(m[1]), last: orderNumber(m[2]) })
    if (run.from || m) runs.set(l.t, run)
  }
  return [...runs.values()].sort((x, y) => x.t - y.t)
}
// A run that sent orders continues right after the highest order sent before it: nothing twice, nothing left out
function continues(runs, run) {
  const before = runs.filter((r) => r.t < run.t && r.last !== undefined)
  return before.length > 0 && run.first === Math.max(...before.map((r) => r.last)) + 1
}
const fixed = (s) => {
  const a = app(s, NAME)
  return propsValue(a, 'watermark.persistent') === 'true' && propsValue(a, 'idempotency.enabled') === 'true' && a.status === 'Running'
}
const seededRun = (s) => {
  const runs = runsOf(app(s, NAME))
  return runs.find((r) => r.from === 'initial' && r.last !== undefined && continues(runs, r))
}

const lab = {
  id: 'p-fail-duplicate-orders',
  group: 'More production failures',
  title: 'Duplicate orders after a redeploy',
  minutes: 15,
  scenario: 'It is 10:00. order-sync-poll reads new orders from SQL Server every 5 minutes and creates them in the ERP of Brightmart. It keeps the last order ID it sent as a watermark in an object store. At 09:32 a teammate redeployed it to change a timeout. Now the ERP team says orders arrived twice.',
  start() {
    const startAt = at(1, 6)
    let s = newPlatform({
      clock: startAt,
      apps: [
        newApp(NAME, {
          props: { 'db.host': 'sql01.brightmart.lab', 'erp.baseUrl': 'https://erp.brightmart.lab/v2', 'erp.timeout': '10000', 'watermark.persistent': 'false', 'idempotency.enabled': 'false' },
          store: { kind: 'memory', watermark: orderId(Math.floor(startAt / ORDER_EVERY)), sent: [] },
        }),
      ],
    })
    s = until(s, at(1, 9, 32))
    s = withProp(s, NAME, 'erp.timeout', '30000')
    s = until(s, at(1, 9, 50))
    const twice = runsOf(app(s, NAME)).find((r) => r.from === 'day' && r.last !== undefined)
    const body = twice
      ? `Since ${timeText(twice.t).slice(0, 5)} the ERP has ${twice.last - twice.first + 1} orders twice, ${orderId(twice.first)} to ${orderId(twice.last)}. They are every order of today. Nothing changed on our side. Please stop it before the warehouse ships them twice.`
      : 'The ERP has orders of today twice. Nothing changed on our side.'
    s = { ...s, mail: [...s.mail, { t: s.clock, to: OPS, subject: 'Duplicate orders in the ERP', body, source: 'ERP team' }] }
    return until(s, at(1, 10))
  },
  steps: [
    { title: 'Read the mail of the ERP team', how: 'Open the Inbox from the menu. Note which orders came twice and when.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(NAME),
    ask('Read the first run after the redeploy', 'Find the run at 09:36. What did it read?', ['Only the orders that were new since 09:31', 'Every order since 00:00 today, because no watermark was found', 'Nothing, the run failed', 'The orders of yesterday'], 1, 'The log says No watermark in the object store. The flow fell back to the start of the day and sent every order of today again.'),
    ask('Find the cause', 'Why was the watermark gone after the redeploy?', ['Someone deleted the key by hand', 'The object store has persistent set to false, so it lives in memory and a redeploy empties it', 'The SQL table was truncated', 'The scheduler ran twice'], 1, 'A store with persistent false is transient. Its data does not survive the runtime that holds it. A redeploy or a restart starts a new replica, so the watermark was lost. The property change itself was harmless.'),
    ask('A new store starts empty', 'You switch the object store to persistent and Apply Changes. Where does the first run start?', ['At the watermark of the old in memory store', 'At 00:00 again, because the new persistent store is empty, unless you give the flow a starting point', 'At the newest order in SQL Server'], 1, 'Nothing copies the old in memory value into the new store. The flow of this application reads the property watermark.initial when the store has no watermark, so you can tell it where to start.'),
    {
      title: 'Make the store persistent and seed the watermark',
      how: 'In the logs find the last line Watermark is now SO-..., and note that order ID. Settings, Properties: watermark.persistent is true, watermark.initial is that order ID. Apply Changes. On CloudHub 2.0 a persistent store is kept in Object Store v2, outside the replica.',
      done: (s) => propsValue(app(s, NAME), 'watermark.persistent') === 'true' && orderNumber(propsValue(app(s, NAME), 'watermark.initial')) !== null && app(s, NAME).status === 'Running',
    },
    ask('Why a guard as well', 'The watermark now survives a redeploy. Why add an Idempotent Message Validator on the order ID too?', ['It makes the job faster', 'A run can send orders and fail before it stores the new watermark, and then the next run reads them again', 'The ERP refuses orders without it', 'It replaces the watermark'], 1, 'The watermark is written after the orders are sent. Anything that breaks between the two, or a watermark that someone resets, sends orders again. The validator remembers each order ID it let through and rejects a repeat with MULE:DUPLICATE_MESSAGE.'),
    {
      title: 'Add the idempotency guard',
      how: 'Settings, Properties: idempotency.enabled is true, Apply Changes. In this application it turns on an Idempotent Message Validator with idExpression #[payload.orderId] inside the For Each, with its own persistent object store. An On Error Continue for MULE:DUPLICATE_MESSAGE skips the repeat. Without its own store the validator uses an in memory store with a 5 minute TTL, which would forget too.',
      done: (s) => propsValue(app(s, NAME), 'idempotency.enabled') === 'true' && app(s, NAME).status === 'Running',
    },
    { title: 'Check the first run after the switch', how: 'Move the clock 10 minutes. The log says Reading after watermark.initial, and the first order sent is the one right after the last order sent before. If it starts lower, the seed was too low and orders went twice again.', done: (s) => fixed(s) && Boolean(seededRun(s)) },
    {
      title: 'Redeploy and prove nothing is sent twice',
      how: 'Settings, Apply Changes again, which redeploys the application. Move the clock 10 minutes. The log says the watermark was found in the object store, and each run sends only the orders that are new.',
      done: (s) => {
        const a = app(s, NAME)
        if (!fixed(s) || !seededRun(s)) return false
        const runs = runsOf(a)
        const now = runs.filter((r) => r.config === a.config)
        const sent = now.filter((r) => r.last !== undefined)
        return a.config > seededRun(s).config && now.some((r) => r.from === 'found') && now.every((r) => r.from === 'found') && sent.length > 0 && sent.every((r) => continues(runs, r))
      },
    },
  ],
  why: 'A watermark is only as durable as the store that holds it. Keep it in a persistent object store, give the flow a known starting point for an empty store, and guard the send with an idempotency check on a business key, so a reset watermark cannot create the same order twice. This lab models the stores with a property; in a real application persistent is an attribute of os:object-store.',
  docs: DOCS,
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${NAME}`)
    const a = app(s, NAME)
    s = change(s, NAME, { props: { ...a.props, 'watermark.persistent': 'true', 'idempotency.enabled': 'true', 'watermark.initial': a.store.watermark } })
    s = advance(s, 10 * MINUTE)
    s = change(s, NAME, {})
    return advance(s, 10 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
