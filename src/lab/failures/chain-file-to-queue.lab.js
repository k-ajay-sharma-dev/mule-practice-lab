// The guided lab chain-file-to-queue. See platform-labs.js for the shape of a lab.
//
// One root cause, three systems: a slow consumer with the default prefetch lets STOCK.UPDATES fill the small store of
// brightmart-amq; producer flow control then stalls the nightly importer half way; the importer has no checkpoint, so the
// file stays in /in and is read from line 1 on every poll. Half the SKUs are sent again and again, the rest never, and
// the web shop shows yesterday's stock. The lab builds its own state: one Classic broker and one SFTP server.
import { addMonAlert, advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, call, called, change, OPS, until } from '../platform-kit.js'
import { AMQ, AMQ_URL, brokerOf, classicBroker } from '../platform-jms.js'
import { fileRec, newServerSys, systemsOf } from '../platform-systems.js'
import { alertSize, API, consumersOf, HOST, idempotent, IMPORT_FLOW, IMPORTER, MSG_BYTES, modeOf, prefetchOf, QUEUE, WATCH } from './chain-file-to-queue.pkg.js'

const SKUS = 300
const TODAY = '2026-11-03'
const YESTERDAY = '2026-11-02'
const FILE = `stock-${TODAY}.csv`
const sku = (i) => `H-${1001 + i}`
// the two SKUs the web shop mails about: sold out in the warehouse, still in stock in the shop
const SOLD_OUT = [249, 286]
const before = (i) => ((i * 37) % 29) + 3
const now_ = (i) => (SOLD_OUT.includes(i) || i % 9 === 0 ? 0 : (i * 53) % 31)
const csv = (n) => `sku,warehouse,available\n${Array.from({ length: SKUS }, (_, i) => `${sku(i)},${i % 3 ? 'DUB-1' : 'ROT-2'},${n(i)}`).join('\n')}\n`

const props = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, name) => app(s, name)?.status === 'Running'
const server = (s) => s.systems?.servers?.[HOST]
const consumerOk = (s) => running(s, API) && prefetchOf(props(s, API)) <= 10 && consumersOf(props(s, API)) >= 2
const importerOk = (s) => running(s, IMPORTER) && modeOf(props(s, IMPORTER)) !== 'restart'
const idempotentOk = (s) => running(s, API) && idempotent(props(s, API))
const alertOk = (s) =>
  s.monAlerts.some((a) => a.enabled && a.name_ === IMPORTER && a.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(a.operator) && Number(a.threshold) <= (a.operator === 'Above' ? 0 : 1) && a.recipients) &&
  running(s, WATCH) &&
  alertSize(props(s, WATCH)) !== null

// the store of brightmart-amq is 10 MB in the lab (lab-made, a real one has gigabytes): 160 stock messages fill it
function broker(clock) {
  const b = classicBroker(clock)
  b.config.storeLimit = 160 * MSG_BYTES
  b.queues = { [QUEUE]: { name: QUEUE, created: clock, messages: [], enqueued: 0, dequeued: 0, expired: 0 }, 'ActiveMQ.DLQ': { name: 'ActiveMQ.DLQ', created: clock, messages: [], enqueued: 0, dequeued: 0, expired: 0 } }
  b.topics = { 'ActiveMQ.Advisory.Connection': b.topics['ActiveMQ.Advisory.Connection'] }
  b.config.policies = []
  // the warehouse group sends stock updates, the stock group reads them
  b.auth.push({ type: 'queue', match: 'STOCK.>', read: 'stock', write: 'warehouse', admin: 'warehouse,stock' })
  return { created: clock, brokers: { [AMQ]: b } }
}

function systems(clock) {
  const sftp = newServerSys(HOST, {
    ip: '10.20.5.21',
    users: { mule_stock: { password: 'lab', home: '/' }, wms: { password: 'wms-drop-26', home: '/in' } },
    dirs: ['/', '/in', '/archive'],
    files: {
      [`/archive/stock-${YESTERDAY}.csv`]: fileRec(csv(before), { t: clock - 22 * 60 * MINUTE, owner: 'mule_stock' }),
      [`/in/${FILE}`]: fileRec(csv(now_), { t: clock - 9 * MINUTE, owner: 'wms' }),
    },
  })
  return systemsOf({ servers: [sftp] })
}

const lab = {
  id: 'p-chain-file-to-queue',
  group: 'Chained incidents',
  title: 'The shop sells stock it does not have',
  minutes: 35,
  scenario: `Every night the warehouse system drops a stock file in /in on ${HOST}. ${IMPORTER} reads it and publishes one message per SKU to the ActiveMQ Classic queue ${QUEUE} on brightmart-amq. ${API} takes the messages and keeps the availability that the web shop shows. It is Tuesday 08:00. The web shop shows items in stock that the warehouse has sold out, and those orders fail at the warehouse. Nothing was deployed last night. Start where the shop looks and follow the trail down to the cause. Then fix the cause and each weak point that let it spread, and load the night file again.`,
  start() {
    const clock = at(1, 1, 59)
    const avail = Object.fromEntries(Array.from({ length: SKUS }, (_, i) => [sku(i), [before(i), YESTERDAY, 0]]))
    const s = newPlatform({
      clock,
      apps: [
        newApp(IMPORTER, {
          props: { 'sftp.host': HOST, 'sftp.user': 'mule_stock', 'sftp.inDir': '/in', 'archive.dir': '/archive', 'jms.url': `${AMQ_URL}?jms.sendTimeout=30000`, 'jms.user': 'mule-warehouse', 'import.mode': 'restart' },
          secrets: { 'sftp.password': 'lab', 'jms.password': 'warehouse-lab-1' },
          store: {},
        }),
        newApp(API, { props: { 'jms.url': AMQ_URL, 'jms.user': 'mule-stock', 'jms.consumers': '1', 'stock.idempotent': 'false' }, secrets: { 'jms.password': 'stock-lab-1' }, store: { avail } }),
        newApp(WATCH, { props: { 'jms.url': AMQ_URL, 'watch.queues': `${QUEUE},ActiveMQ.DLQ`, 'alert.to': OPS, 'queue.alertSize': '' }, store: {} }),
      ],
      traffic: [{ app: API, env: 'Sandbox', perMinute: 1, method: 'POST', path: '/reservations', body: '{"qty":1}' }],
      jms: broker(clock),
      systems: systems(clock),
    })
    const later = until(s, at(1, 7, 40))
    later.mail.push({
      t: at(1, 7, 40),
      to: OPS,
      subject: 'Shop shows sold out items in stock',
      body: `Since the shop opened, ${sku(SOLD_OUT[0])} and ${sku(SOLD_OUT[1])} show as in stock, and every order for them is rejected by the warehouse as sold out. Some busy items such as ${sku(6)} were also sold more often than we have them. The stock file of last night should have fixed all of this. Brightmart Web Shop team`,
      source: 'Brightmart Web Shop',
    })
    return until(later, at(1, 8))
  },
  steps: [
    {
      title: 'See what the shop sees',
      how: `Read the mail in the Inbox. Then API client, ${API}, GET /availability/${sku(SOLD_OUT[0])}. Look at available and asOf: the shop still has the count of ${YESTERDAY}. Try a busy SKU such as ${sku(6)} too.`,
      done: (s) => called(s, API, 200, 'GET', /^\/availability\//),
    },
    {
      title: 'Look at the broker',
      how: `ActiveMQ, brightmart-amq, Home: read Store percent used. Then Queues, ${QUEUE}: compare Pending, the consumers and Messages in flight, and open Active Consumers to see Prefetch and Dispatched Queue. One consumer holds every message and works through 8 a minute, and the store is full, so producer flow control holds every new send.`,
      done: (s) => Boolean(s.seen[`jms:${AMQ}`]) && Boolean(s.seen[`jms-dest:${QUEUE}`]),
    },
    {
      title: 'Follow it to the file',
      how: `Runtime Manager, ${IMPORTER}, Logs. Each poll publishes lines 1 to about 120, then the send times out under flow control and the file stays. Then SFTP and FTP from the console menu, ${HOST} as mule_stock: ${FILE} is still in /in, and /archive has only the file of ${YESTERDAY}.`,
      done: (s) => Boolean(s.seen[`logs:${IMPORTER}`]) && Boolean(s.seen[`sftp:${HOST}`]),
    },
    {
      title: 'Let the consumer keep up',
      how: `Runtime Manager, ${API}, Settings, Properties. Add the prefetch policy to jms.url: ${AMQ_URL}?jms.prefetchPolicy.queuePrefetch=1, and set jms.consumers (numberOfConsumers) to 4. Apply Changes. The restart gives the held messages back to the queue, and four consumers share them.`,
      done: consumerOk,
    },
    ask(
      'A batch of messages',
      `${IMPORTER} sends 300 messages for one file, each on its own. What does a transacted JMS session give you here?`,
      [
        'Faster sends and nothing more',
        'The messages of the session reach the queue only at commit, all together, and a rollback drops them all. Commit every 50 lines and save the line of the last commit, so a failure resends at most one batch and nobody sees half of one',
        'Exactly once delivery to the consumer, so the consumer needs no duplicate check',
        'It turns producer flow control off for the session',
      ],
      1,
      'A transaction makes a group of sends all or nothing. One transaction for a whole large file holds broker resources for a long time, so batches with a checkpoint are the usual choice. It does not make delivery exactly once: the commit can succeed while the app crashes before it saves the checkpoint, so the batch is sent again, and the consumer must still cope with duplicates. In Mule, put the publish operations in a try scope with transactionalAction ALWAYS_BEGIN.',
    ),
    {
      title: 'Make the importer go on where it stopped',
      how: `Runtime Manager, ${IMPORTER}, Settings, Properties. Set import.mode to resume (a checkpoint after each message, kept in the object store) or transacted (batches of 50 in one transacted session, a checkpoint after each commit). Apply Changes. The file is moved to /archive only after the last line is sent.`,
      done: importerOk,
    },
    {
      title: 'Make stock updates idempotent',
      how: `The queue still holds repeated messages, and the first read with a checkpoint starts again at line 1. ${API}, Properties: set stock.idempotent to true and Apply Changes. The update then keeps the file date per SKU and applies a message only when its file date is newer than the stored one, so a repeat of the same file changes nothing.`,
      done: idempotentOk,
    },
    ask(
      'Order per SKU',
      `With four consumers, two messages for the same SKU can be worked on at the same time, for example the night file and a correction the warehouse sends at 09:00. What keeps them in order?`,
      [
        'Nothing, a queue is first in first out for all its consumers',
        'Set JMSXGroupID to the SKU. ActiveMQ then sends every message of a group to the same consumer, in order, while different SKUs still spread over all consumers. Keep the file date check as well, for when a group moves to another consumer',
        'Use one consumer for the whole queue',
        'Give the later message a higher priority',
      ],
      1,
      'A queue dispatches in order, but with several consumers two messages can be in work at once and finish in either order. Message groups keep the order per key without giving up parallel work. An exclusive consumer keeps the whole queue in order, at the cost of one consumer doing all the work. When a consumer closes, its groups move to another consumer, so the date check in the update stays the last guard.',
    ),
    {
      title: 'Hear about it at night',
      how: `Monitoring, Alerts, Create Alert: Application ${IMPORTER}, Message Error Count, Above 0 for 1 minute, with a recipient. Then Runtime Manager, ${WATCH}, Properties: set queue.alertSize to a number such as 100. It already reads QueueSize of ${QUEUE} and ActiveMQ.DLQ over Jolokia every minute. Apply Changes.`,
      done: alertOk,
    },
    {
      title: 'Load the night file again',
      how: `Runtime Manager, ${IMPORTER}, Schedules, ${IMPORT_FLOW}, Run, or wait for the next poll. The store holds 160 messages, so it may take two runs: the second goes on from the checkpoint. Move the clock until ${FILE} is in /archive and the queue is empty. Then GET /availability/${sku(SOLD_OUT[0])} answers 0 as of ${TODAY}.`,
      done: (s) => {
        if (!consumerOk(s) || !importerOk(s) || !idempotentOk(s)) return false
        const files = server(s)?.files ?? {}
        const avail = app(s, API).store.avail ?? {}
        const fixedAt = app(s, API).updated
        return (
          !files[`/in/${FILE}`] &&
          Boolean(files[`/archive/${FILE}`]) &&
          (brokerOf(s, AMQ)?.queues[QUEUE]?.messages.length ?? 1) === 0 &&
          Array.from({ length: SKUS }, (_, i) => avail[sku(i)]?.[1]).every((d) => d === TODAY) &&
          !(app(s, API).store.oversold ?? []).some((x) => x.t > fixedAt)
        )
      },
    },
  ],
  why: `The symptom was in the shop, the cause in the broker, and the damage in the file. One consumer with the default prefetch of 1000 held every message and worked slowly, so ${QUEUE} filled the store. Producer flow control then blocked the importer half way. Without a checkpoint and with the file still in /in, every poll sent the first lines again and never the rest. Fix it at each link: prefetch 1 and more consumers for slow work, a checkpoint or transacted batches in the producer, an idempotent update keyed by SKU and file date, message groups when order per key matters, and alerts on failed runs and on queue size, so the night does not end in a silent stall. In the lab the store is small and each consumer takes 8 messages a minute.`,
  docs: 'https://activemq.apache.org/components/classic/documentation/producer-flow-control',
  solve(start) {
    let s = mark(mark(mark(mark(start, `jms:${AMQ}`), `jms-dest:${QUEUE}`), `logs:${IMPORTER}`), `sftp:${HOST}`)
    s = call(s, API, null, `/availability/${sku(SOLD_OUT[0])}`, 'GET').state
    s = change(s, API, { props: { ...app(s, API).props, 'jms.url': `${AMQ_URL}?jms.prefetchPolicy.queuePrefetch=1`, 'jms.consumers': '4', 'stock.idempotent': 'true' } })
    s = change(s, IMPORTER, { props: { ...app(s, IMPORTER).props, 'import.mode': 'resume' } })
    s = change(s, WATCH, { props: { ...app(s, WATCH).props, 'queue.alertSize': '100' } })
    s = addMonAlert(s, { title: 'Stock import failed', resource: 'Application', name_: IMPORTER, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    return advance(s, 45 * MINUTE)
  },
  answers: { 4: 1, 7: 1 },
}

export const LABS = [lab]
