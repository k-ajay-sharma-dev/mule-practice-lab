// The guided lab kafka-rebalance. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { createTopic, newCluster, newKafka } from '../platform-kafka.js'
import { CLUSTER, GROUP, perRecord, skipsExisting, TOPIC } from './kafka-rebalance.pkg.js'

const IMPORTER = 'store-orders-import'
const NAME = 'erp-invoice-consumer'
const KAFKA = { 'kafka.cluster': CLUSTER, 'kafka.topic': TOPIC }

const consumer = (s) => app(s, NAME)
const props = (s) => ({ ...consumer(s)?.props, ...consumer(s)?.secrets })
const running = (s) => consumer(s)?.status === 'Running'
const group = (s) => s.kafka?.clusters?.[CLUSTER]?.groups?.[GROUP]
const since = (list, t) => (list ?? []).filter((x) => x.t > t)
const release = (s, version) => change(s, NAME, { props: { ...consumer(s).props, 'app.release': version } })

const lab = {
  id: 'p-kafka-rebalance',
  group: 'Kafka',
  title: 'Invoices sent twice after every release',
  minutes: 25,
  scenario: `Every 10 minutes ${IMPORTER} puts 12 store orders on the Kafka topic ${TOPIC}. ${NAME} reads them in the consumer group ${GROUP} and posts one invoice for each order to the ERP. The ERP is slow, so an import takes about 4 minutes to work through. This morning the team released ${NAME} twice, and Finance found customers who got the same invoice twice. Find out why each release does this, fix it so a release or a rebalance never sends an invoice twice, and prove it with one more release.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7),
      apps: [
        newApp(IMPORTER, { props: { ...KAFKA }, store: {} }),
        newApp(NAME, {
          props: { ...KAFKA, 'app.release': '1.4.0', 'kafka.groupId': GROUP, 'erp.host': 'erp.harbor.lab', 'kafka.listener': 'batch', 'kafka.ackMode': 'AUTO', 'invoice.skipExisting': 'false' },
          store: {},
        }),
      ],
      kafka: newKafka({ clusters: { [CLUSTER]: newCluster(CLUSTER, 3) } }),
    })
    s = createTopic(s, CLUSTER, { name: TOPIC, partitions: 3, replicationFactor: 3, config: { 'min.insync.replicas': '2' } }).state
    s = release(until(s, at(1, 8, 12)), '1.4.1')
    s = release(until(s, at(1, 8, 42)), '1.4.2')
    s = until(s, at(1, 9))
    const twice = Object.entries(consumer(s).store.invoices ?? {}).filter(([, n]) => n > 1).map(([key]) => key)
    s.mail.push({
      t: at(1, 8, 55),
      to: OPS,
      subject: 'Customers got the same invoice twice',
      body: `This morning ${twice.length} orders were invoiced twice, for example ${twice.slice(0, 3).join(', ')}. They all came in with the 08:10 and the 08:40 imports. The team told us there were releases at 08:12 and 08:42. Please stop this before the next release, and tell us which orders to credit.`,
      source: 'Harbor Foods Finance',
    })
    return s
  },
  steps: [
    { title: 'Read the mail of Finance', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Read the logs and the group events',
      how: `Runtime Manager, ${NAME}, Logs: look at the minutes after the release of 08:42, and find an order that has two invoice numbers, such as INV-7109-1 and INV-7109-2. Then Kafka, Consumers, ${GROUP}: the group events show each member that left and joined.`,
      done: (s) => Boolean(s.seen[`logs:${NAME}`]) && Boolean(s.seen[`kafka-group:${GROUP}`]),
    },
    ask(
      'Why twice',
      `${NAME} uses the Batch Message Listener with ackMode AUTO, so the offsets are committed when the flow run of the whole batch ends. What happens when a release stops the replica in the middle of a batch?`,
      [
        'Kafka sends each record to two members',
        'The offsets of the records already invoiced were never committed. The new consumer starts from the last committed offset after the rebalance, reads those records again and invoices them again',
        'The producer sends each order twice during a release',
        'The ERP repeats the call on its own',
      ],
      1,
      'Kafka keeps one committed offset per partition for the group. Records read after it and not yet committed are delivered again to whoever owns the partition after a rebalance. The longer the batch runs before it commits, the more records come again. This is at least once delivery.',
    ),
    ask(
      'Commit when the records arrive',
      'A colleague suggests ackMode IMMEDIATE, so the offsets are committed the moment the records arrive. Why is that wrong for invoices?',
      [
        'It is right, it removes every duplicate with no other change',
        'The offsets move before the invoices are posted. If the replica stops in the middle, the records it did not post are never read again, and those customers get no invoice',
        'IMMEDIATE commits only once a day',
        'IMMEDIATE works only with one partition',
      ],
      1,
      'Committing before the work gives at most once delivery: no duplicates, but a crash or a release loses records. For invoices a lost one is worse than a duplicate that the flow can detect. Commit after the work, and make the work safe to repeat.',
    ),
    {
      title: 'Commit after each record',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set kafka.listener to record, so each record is one flow run, and kafka.ackMode to MANUAL, so the flow calls the Commit operation after the ERP accepts the invoice. Apply Changes. A rebalance then repeats at most the record that was in flight.`,
      done: (s) => running(s) && perRecord(props(s)),
    },
    {
      title: 'Make the invoice safe to repeat',
      how: 'Set invoice.skipExisting to true and Apply Changes. The flow then looks up the order ID in the ERP first and skips an order that has an invoice. The key of the record is the order ID, so a record that comes again does no harm.',
      done: (s) => running(s) && skipsExisting(props(s)),
    },
    ask(
      'Reset the offsets',
      `To clean up, a colleague opens Kafka, Consumers, ${GROUP}, Reset offsets and chooses latest while ${NAME} runs. Kafka answers GROUP_NOT_INACTIVE: Assignments can only be reset if the group is inactive, but the current state is Stable. What is true?`,
      [
        'Kafka UI has a bug, try again',
        `Offsets can be reset only for a group with no active members. Stop ${NAME} first, reset, then start it. And latest would also skip the orders that have no invoice yet`,
        'The reset needs a restart of the brokers',
        'Only the producer can move the offsets of a group',
      ],
      1,
      'A running member owns its partitions and commits its own offsets, so Kafka refuses a reset while the group is Stable. Stop the application, wait until the group is Empty, reset to the offset you want, and start it again. Here the fix is the commit and the duplicate check, not a reset.',
    ),
    {
      title: 'Release again and check',
      how: `Release once more: Settings, Properties, set app.release to 1.5.0 and Apply Changes, or stop and start the application. Then move the clock 15 minutes so an import runs through. The log shows the consumer leaving and joining ${GROUP}, any order read again is skipped, and no order gets a second invoice.`,
      done: (s) => {
        const a = consumer(s)
        if (!running(s) || !perRecord(props(s)) || !skipsExisting(props(s)) || s.clock < a.updated + 12 * MINUTE) return false
        const st = a.store ?? {}
        return (group(s)?.history ?? []).some((h) => h.t > a.updated) && since(st.posted, a.updated).length > 0 && since(st.dupes, a.updated).length === 0 && since(st.lost, a.updated).length === 0
      },
    },
  ],
  why: 'A consumer group delivers at least once: after a rebalance a partition continues from the last committed offset, and every record read after that commit comes again. A release, a replica that restarts, a scale out or a slow poll all start a rebalance. A long batch that commits at the end repeats the whole part it already did. Commit after each record that succeeded, with the Message Listener and AUTO or MANUAL with a Commit after the work, so a rebalance repeats at most the record in flight. Then make the work idempotent by key: check whether the order has an invoice, or keep the processed keys in an object store. Committing on arrival with IMMEDIATE trades duplicates for lost records. A reset of offsets needs a group with no active members. In the lab the ERP is part of the application store, and a release is the moment the consumer closes and joins again.',
  docs: 'https://docs.mulesoft.com/kafka-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${NAME}`), `kafka-group:${GROUP}`)
    s = change(s, NAME, { props: { ...consumer(s).props, 'kafka.listener': 'record', 'kafka.ackMode': 'MANUAL', 'invoice.skipExisting': 'true' } })
    return advance(s, 15 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 6: 1 },
}

export const LABS = [lab]
