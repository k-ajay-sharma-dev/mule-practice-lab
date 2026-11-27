// The guided lab chain-mail-to-kafka. See platform-labs.js for the shape of a lab.
// One root cause, three systems: the mail intake never marks a mail as read, so every restart publishes the unread ship
// notices again, Kafka keeps each copy as a new record, and the WMS consumer books the same inbound stock again.
import { advance, at, finishDeploys, mark, MINUTE, newApp, newPlatform, startApp, stopApp } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { createTopic, newCluster, newKafka, produceMessage } from '../platform-kafka.js'
import { mailMsg, newAccount, newMailServer } from '../platform-mailserver.js'
import { acksOf, afterPublish, BOX, CLUSTER, GROUP, idempotent, INTAKE, TOPIC, truthOf, WMS } from './chain-mail-to-kafka.pkg.js'

const SUPPLIER = 'Tidewell Foods Dispatch <dispatch@tidewell-foods.example>'
const APP_PASSWORD = 'asn-mule-3e17'
const asnText = (a) => `Advance ship notice\nASN: ${a.asn}\nPO: ${a.po}\nSKU: ${a.sku}\nQty: ${a.qty}\nWarehouse: ${a.wh}\nETA: ${a.eta}\nCarrier: Gull Road Freight\nTidewell Foods dispatch`
const ASNS = [
  { t: at(0, 16, 10), asn: 'ASN-88231', po: 'PO-4410', sku: 'H-300', qty: 240, wh: 'DUB-1', eta: '2026-11-03 07:00' },
  { t: at(0, 18, 40), asn: 'ASN-88232', po: 'PO-4411', sku: 'H-100', qty: 120, wh: 'DUB-1', eta: '2026-11-03 09:00' },
  { t: at(1, 1, 30), asn: 'ASN-88233', po: 'PO-4413', sku: 'H-200', qty: 60, wh: 'ROT-2', eta: '2026-11-03 13:00' },
  { t: at(1, 7, 45), asn: 'ASN-88234', po: 'PO-4416', sku: 'H-300', qty: 96, wh: 'DUB-1', eta: '2026-11-03 15:00' },
]

// a mail from the supplier lands in the INBOX of the shared mailbox
function deliver(state, a) {
  const s = structuredClone(state)
  const acc = s.mailServer.accounts[BOX]
  const m = mailMsg({ from: SUPPLIER, to: BOX, subject: `ASN ${a.asn} / ${a.po}`, text: asnText(a), date: a.t })
  acc.folders.INBOX.push({ ...m, uid: acc.uidNext++, messageId: `<${a.asn.toLowerCase()}.${a.po.slice(3)}@mx.tidewell-foods.example>` })
  return s
}
// CloudHub restarts the replica; the note is what the platform writes to the log
function restart(state, why) {
  let s = structuredClone(state)
  app(s, INTAKE).logs.push({ t: s.clock, level: 'WARN', text: why, logger: 'com.mulesoft.cloudhub.runtime', config: app(s, INTAKE).config })
  s = finishDeploys(startApp(stopApp(s, INTAKE), INTAKE))
  app(s, INTAKE).restarts = (app(s, INTAKE).restarts ?? 0) + 1
  return s
}
function mailServer() {
  const y = newMailServer({ accounts: { [BOX]: newAccount('Inbound ship notices', 'Asn-Desk-2611', { appPasswords: [{ name: INTAKE, value: APP_PASSWORD }], uidNext: 7301 }), [OPS]: newAccount('Operations', 'Ops-2611') } })
  // the supplier keeps sending notices in the day
  y.feeds = [
    {
      to: BOX,
      every: 25,
      at: at(1, 9, 10),
      n: 35,
      hours: [6, 20],
      mails: [
        { from: SUPPLIER, subject: 'ASN ASN-882{n} / PO-44{n}', text: 'Advance ship notice\nASN: ASN-882{n}\nPO: PO-44{n}\nSKU: H-100\nQty: 48\nWarehouse: DUB-1\nETA: 2026-11-04 08:00\nCarrier: Gull Road Freight\nTidewell Foods dispatch' },
        { from: SUPPLIER, subject: 'ASN ASN-882{n} / PO-44{n}', text: 'Advance ship notice\nASN: ASN-882{n}\nPO: PO-44{n}\nSKU: H-200\nQty: 30\nWarehouse: ROT-2\nETA: 2026-11-04 10:00\nCarrier: Gull Road Freight\nTidewell Foods dispatch' },
      ],
    },
  ]
  return y
}

const props = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, name) => app(s, name)?.status === 'Running'
const wms = (s) => app(s, WMS)?.store ?? {}
const consumerOk = (s) => running(s, WMS) && idempotent(props(s, WMS))
const intakeOk = (s) => running(s, INTAKE) && ['seen', 'move'].includes(afterPublish(props(s, INTAKE))) && acksOf(props(s, INTAKE)) === 'ALL'
const corrected = (s) => {
  const st = wms(s)
  const truth = truthOf(st)
  const skus = new Set([...Object.keys(truth), ...Object.keys(st.inbound ?? {})])
  return (st.adjusted ?? []).length > 0 && [...skus].every((k) => (st.inbound?.[k] ?? 0) === (truth[k] ?? 0))
}
const proved = (s) => {
  if (!consumerOk(s) || !intakeOk(s) || !corrected(s)) return false
  const fixed = Math.max(app(s, WMS).updated, app(s, INTAKE).updated)
  if (s.clock < fixed + 10 * MINUTE) return false
  const st = wms(s)
  const inbox = s.mailServer?.accounts?.[BOX]?.folders?.INBOX ?? []
  const waiting = inbox.some((m) => !m.flags.includes('\\Seen') && !m.flags.includes('\\Deleted') && m.date < s.clock - 2 * MINUTE)
  const twice = (st.booked ?? []).some((b) => b.t > app(s, WMS).updated && b.n > 1)
  const fresh = Object.entries(st.asns ?? {}).some(([id, a]) => a.t > fixed && st.bookings[id] === 1)
  return !waiting && !twice && fresh
}

const lab = {
  id: 'p-chain-mail-to-kafka',
  group: 'Chained incidents',
  title: 'Stock that never arrived',
  minutes: 30,
  scenario: `Tuesday 08:54 at Harbor. The stores of Dublin see far more stock of H-300 and H-100 on its way than the trucks of Tidewell Foods bring, and promise it to customers. Tidewell mails an advance ship notice (ASN) for each truck to ${BOX}. ${INTAKE} reads that mailbox and publishes each ASN to the Kafka topic ${TOPIC}. ${WMS} books it as inbound stock in the WMS. Trace the extra stock back to its cause, stop it at every layer, and correct the stock.`,
  start() {
    let s = newPlatform({
      clock: at(0, 15),
      apps: [
        newApp(INTAKE, {
          props: { 'mail.protocol': 'imaps', 'mail.host': 'mail.harbor.lab', 'mail.port': '993', 'mail.user': BOX, 'kafka.cluster': CLUSTER, 'kafka.topic': TOPIC, 'kafka.acks': 'NONE', 'after.publish': 'none' },
          secrets: { 'mail.password': APP_PASSWORD },
          store: {},
        }),
        newApp(WMS, { props: { 'kafka.cluster': CLUSTER, 'kafka.topic': TOPIC, 'kafka.groupId': GROUP, 'wms.url': 'https://wms.harbor.lab/api/v2', 'idempotency.key': 'none' }, store: {} }),
      ],
      kafka: newKafka({ clusters: { [CLUSTER]: newCluster(CLUSTER, 3) } }),
      mailServer: mailServer(),
    })
    s = createTopic(s, CLUSTER, { name: TOPIC, partitions: 3, replicationFactor: 3, config: { 'min.insync.replicas': '2' } }).state
    for (const a of ASNS.slice(0, 2)) s = deliver(until(s, a.t), a)
    s = restart(until(s, at(0, 23, 30)), 'The replica is restarted for platform maintenance of the region.')
    for (const a of ASNS.slice(2)) s = deliver(until(s, a.t), a)
    s = until(s, at(1, 8, 40))
    const inbound = wms(s).inbound ?? {}
    s.mail.push({
      t: s.clock,
      to: OPS,
      subject: 'Dublin stores: inbound stock does not match the trucks',
      body: `Good morning. The store app shows ${inbound['H-300'] ?? 0} cases of H-300 and ${inbound['H-100'] ?? 0} of H-100 on the way to DUB-1 today. The Tidewell notices say 336 of H-300 (240 and 96) and 120 of H-100. Stores have promised the difference to customers. Please fix the numbers before the lunch orders. Harbor store operations`,
      source: 'Harbor store operations',
    })
    s = restart(until(s, at(1, 8, 52)), 'JVM exited after OutOfMemoryError. The replica is restarted.')
    return until(s, at(1, 8, 54))
  },
  steps: [
    {
      title: 'See the double bookings',
      how: `Runtime Manager, Applications, ${WMS}, Logs. The WMS made a new inbound receipt each time ASN-88231 came in, and the same for ASN-88232. Each line names the topic, the partition and the offset of the record.`,
      done: (s) => Boolean(s.seen[`logs:${WMS}`]),
    },
    {
      title: 'Look at the lag of the consumer',
      how: `Console, Kafka UI, ${CLUSTER}, Consumers, ${GROUP}. Records are still waiting: the consumer takes one a minute, and more copies came in at 08:53. Each of them books stock again when it is read.`,
      done: (s) => Boolean(s.seen[`kafka-group:${GROUP}`]),
    },
    {
      title: 'Find the copies in the topic',
      how: `Kafka UI, Topics, ${TOPIC}, Messages. The key ASN-88231 is there 3 times, in the same partition, at different offsets: 16:11 yesterday, 23:31 and 08:53. The headers carry the same messageId each time, so the copies came from one mail.`,
      done: (s) => Boolean(s.seen[`kafka-topic:${TOPIC}`]),
    },
    {
      title: 'Look at the mailbox flags',
      how: `Mail server, mailbox ${BOX}. Every ASN mail is still in INBOX and still unread: nothing ever marked it as read or moved it. The Server log tab shows each poll as UID SEARCH UNSEEN with a BODY.PEEK fetch, which sets no flag. Do not open the mails in the webmail before the fix, because opening one marks it as read.`,
      done: (s) => Boolean(s.seen[`mail:${BOX}`]),
    },
    ask(
      'Find the root cause',
      'Why does each ASN reach Kafka more than once?',
      [
        'Kafka repeats a record when a consumer is slow',
        `${INTAKE} never changes the mail on the server. It skips mails it published only by a list in an in memory Object Store, and each restart (23:30 maintenance, 08:52 OutOfMemoryError) empties that list, so every unread ASN is published again`,
        'Tidewell sent each notice three times',
        'The topic has 3 partitions, so each record is written 3 times',
      ],
      1,
      'The mail is the source of truth for what is done, and it says nothing is done: every ASN is still unread. The memory of the app is the only thing that stops a repeat, and memory goes with the replica. Kafka then holds each publish as a new record, with a new offset, and the consumer has no reason to doubt any of them.',
    ),
    {
      title: 'Stop the double bookings at the consumer',
      how: `Runtime Manager, ${WMS}, Settings, Properties. Set idempotency.key to asnId and Apply Changes. The flow then keeps the ASN number of each booking in a persistent Object Store and skips a record whose ASN is there, so the copies still in the topic do no harm. Do this first: it protects the WMS from any cause of duplicates.`,
      done: consumerOk,
    },
    {
      title: 'Fix the intake',
      how: `Runtime Manager, ${INTAKE}, Settings, Properties. Set after.publish to seen or move, so a mail is marked or moved to Processed after its publish returned. Set kafka.acks to ALL: with NONE the publish returns before any broker has the record, so a mail could be marked as done for a record that was lost. Apply Changes. The first poll after the restart publishes the old unread mails one last time; the consumer now skips them.`,
      done: intakeOk,
    },
    {
      title: 'Correct the booked stock',
      how: `Runtime Manager, ${WMS}, Object Store: inbound has what the WMS booked per SKU. The ASNs announce 336 of H-300, 120 of H-100 and 60 of H-200 (plus any new ASN booked once). Then Kafka UI, ${TOPIC}, Produce message, with a value such as {"type":"StockAdjustment","adjustmentId":"ADJ-1103-1","reason":"duplicate ASNs","lines":[{"sku":"H-300","qty":-480},{"sku":"H-100","qty":-240}]} using your own numbers. A compensating event keeps the history; editing the WMS by hand would hide it. Move the clock until the consumer has read it.`,
      done: corrected,
    },
    ask(
      'Idempotency or exactly once',
      'A teammate wants Kafka exactly once semantics (an idempotent producer and transactions) instead of the asnId check in the consumer. Why is that not enough here?',
      [
        'Exactly once is slower, that is all',
        'Exactly once covers writes and offsets inside Kafka. The copies here are separate publishes of one mail, which Kafka rightly sees as separate records, and the booking happens in the WMS outside Kafka. Only a business key checked where the effect happens makes the whole chain idempotent',
        'Exactly once needs a topic with one partition',
        'It is enough, the asnId check can then go',
      ],
      1,
      'The idempotent producer removes duplicates that its own retries make, and transactions tie a write to the offsets of a read, both within Kafka. Across a mailbox, Kafka and a WMS there is no transaction. So every step is at least once, and the side effect must be idempotent on a key that means the same business event: the ASN number. Mark the mail only after the publish is acknowledged, so the worst case is a repeat that the key absorbs, never a loss.',
    ),
    {
      title: 'Prove the chain holds',
      how: `Move the clock at least 10 minutes after your last change, past the next ASN of Tidewell (every 25 minutes from 09:10). The mailbox has no unread mail older than 2 minutes, the new ASN is booked once, no ASN is booked twice since the consumer fix, and the inbound stock matches the ASNs.`,
      done: proved,
    },
  ],
  why: 'A side effect that is not idempotent turns every repeat upstream into wrong data downstream. The intake treated its memory as the record of what was done, and the mailbox said nothing was done, so each restart published every unread notice again. Kafka kept each copy as a new record and the WMS booked each one. Fix it at each layer. Change the source after the work is safe: mark or move a mail only after a publish that acks ALL confirmed. Make the consumer idempotent on the business key, here the ASN number in a persistent store, because no transaction spans a mailbox, Kafka and a WMS. Kafka exactly once covers Kafka only. Then correct the data with a compensating event, so the history shows what happened and why. In the lab the WMS takes one record a minute, the in memory store of the intake is emptied by any start of the app, and acks NONE never loses a record by itself.',
  docs: 'https://docs.mulesoft.com/kafka-connector/latest/kafka-connector-reference',
  solve(start) {
    let s = mark(mark(mark(mark(start, `logs:${WMS}`), `kafka-group:${GROUP}`), `kafka-topic:${TOPIC}`), `mail:${BOX}`)
    s = change(s, WMS, { props: { ...app(s, WMS).props, 'idempotency.key': 'asnId' } })
    s = change(s, INTAKE, { props: { ...app(s, INTAKE).props, 'after.publish': 'move', 'kafka.acks': 'ALL' } })
    s = advance(s, 2 * MINUTE)
    const st = wms(s)
    const truth = truthOf(st)
    const lines = Object.keys(st.inbound).map((sku) => ({ sku, qty: (truth[sku] ?? 0) - st.inbound[sku] })).filter((l) => l.qty !== 0)
    s = produceMessage(s, CLUSTER, TOPIC, { key: 'ADJ-1103-1', value: JSON.stringify({ type: 'StockAdjustment', adjustmentId: 'ADJ-1103-1', reason: 'duplicate ASNs', lines }) }).state
    return advance(s, 30 * MINUTE)
  },
  answers: { 4: 1, 8: 1 },
}

export const LABS = [lab]
