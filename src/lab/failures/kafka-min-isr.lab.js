// The guided lab kafka-min-isr. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { createTopic, newCluster, newKafka, startBroker, stopBroker } from '../platform-kafka.js'
import { acksOf, CLUSTER, ORDERS, STOCK } from './kafka-min-isr.pkg.js'

const ORDERS_APP = 'order-events-publisher'
const STOCK_APP = 'stock-updates-publisher'

const props = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, name) => app(s, name)?.status === 'Running'
const cluster = (s) => s.kafka?.clusters?.[CLUSTER]
const allUp = (s) => Boolean(cluster(s)?.brokers.every((b) => b.up))
const stockSafe = (s) => running(s, STOCK_APP) && acksOf(props(s, STOCK_APP)) === 'ALL'
const since = (list, t) => (list ?? []).filter((x) => x.t > t)
const lastRun = (s, name, flow) => app(s, name)?.schedules.find((x) => x.flow === flow)?.last

const lab = {
  id: 'p-kafka-min-isr',
  group: 'Kafka',
  title: 'Order events refused, stock updates gone',
  minutes: 20,
  scenario: `The Kafka cluster ${CLUSTER} has 3 brokers. ${ORDERS_APP} publishes order events from an outbox table to ${ORDERS}, which has replication factor 3 and min.insync.replicas 2. ${STOCK_APP} publishes stock counts to ${STOCK}, a topic created long ago with replication factor 1. Broker 3 went down at 07:30 for a disk change, and broker 2 was stopped for patching at 08:10. Since then order events fail, and the warehouse says some stock counts have not changed all morning, though the stock log shows every update as sent. Find both causes, get the orders moving without giving up their safety, and make sure a stock update can never vanish without an error again.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7, 20),
      apps: [
        newApp(ORDERS_APP, { props: { 'kafka.cluster': CLUSTER, 'kafka.topic': ORDERS, 'kafka.acks': 'ALL' }, store: {} }),
        newApp(STOCK_APP, { props: { 'kafka.cluster': CLUSTER, 'kafka.topic': STOCK }, store: {} }),
      ],
      kafka: newKafka({ clusters: { [CLUSTER]: newCluster(CLUSTER, 3) } }),
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Order events failing, stock counts stuck',
          body: 'Since 08:10 the order service reports that order events cannot be published, and the shipping team sees no new orders. The warehouse also says the stock counts of several items in the pick app have not changed since about 07:30, though stock-updates-publisher logs each update as sent. The broker team stopped broker 2 for patching at 08:10 and is still on the disk change of broker 3.',
          source: 'Harbor Foods Operations',
        },
      ],
    })
    s = createTopic(s, CLUSTER, { name: ORDERS, partitions: 3, replicationFactor: 3, config: { 'min.insync.replicas': '2' } }).state
    s = createTopic(s, CLUSTER, { name: STOCK, partitions: 3, replicationFactor: 1 }).state
    s = stopBroker(until(s, at(1, 7, 30)), CLUSTER, 3).state
    s = stopBroker(until(s, at(1, 8, 10)), CLUSTER, 2).state
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of Operations', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(ORDERS_APP), how: `Runtime Manager, Applications, ${ORDERS_APP}, Logs. Read the error block and the line about the outbox.` },
    ask(
      'Read the error',
      `The error is NotEnoughReplicasException for ${ORDERS}, ISR 1, min.insync.replicas 2. The app uses acks ALL. What does the broker say?`,
      [
        'The topic was deleted',
        'The partition has only one replica in sync. With acks ALL a write needs at least min.insync.replicas replicas in sync, the leader included, so the leader refuses it',
        'The record is larger than max.message.bytes',
        'The app has no permission to write to the topic',
      ],
      1,
      `${ORDERS} keeps 3 copies of each partition, one per broker. With broker 3 down the in sync replicas were 2, which still met min.insync.replicas 2, so orders kept flowing. With broker 2 down too only one copy is in sync, and an acks ALL write is refused. The rows stay in the outbox, so nothing is lost.`,
    ),
    {
      title: 'Bring the brokers back',
      how: 'Kafka, Brokers. Start broker 2 and broker 3. The Under replicated and Offline partitions go back to 0. In the lab a broker that starts is in sync again at once; a real one first copies what it missed.',
      done: allUp,
    },
    ask(
      'Lower the bar',
      `At 08:15 a colleague wanted to set min.insync.replicas of ${ORDERS} to 1, or acks to NONE on ${ORDERS_APP}, to get the orders moving. Why is that a bad trade for orders?`,
      [
        'It is fine, the brokers come back anyway',
        'Each order would then live on one broker only. If that broker fails before the others are back, the order is gone, and with NONE the app would never even hear of it',
        'Kafka does not allow min.insync.replicas 1',
        'It makes the topic read only',
      ],
      1,
      'Replication factor 3 with min.insync.replicas 2 and acks ALL is the usual setting for data you cannot lose: one broker can fail with no effect, and a second failure stops writes instead of risking data. A refused write is visible and can be retried. A lost write is not.',
    ),
    ask(
      'The silent loss',
      `${STOCK_APP} logged every update as sent, yet the warehouse misses some. ${STOCK} has replication factor 1, and the app sets no kafka.acks. What happened?`,
      [
        'The consumer of the warehouse is slow',
        `The default Acknowledge Mode of the Kafka connector is NONE, so the app waits for no answer. The partitions of ${STOCK} that lived on brokers 2 and 3 had no leader, those records went nowhere, and nothing raised an error`,
        'Kafka compacted the records away',
        'With NONE the records are kept on disk and sent later',
      ],
      1,
      `With replication factor 1 each partition lives on one broker, so a stopped broker takes its partitions offline. With acks NONE (acks=0 in Kafka) the producer does not wait for any answer, retries have no effect, and the Kafka documentation says the client generally does not know of a failure. A write that fails looks like a success. acks ALL turns it into an error the flow can retry. The lasting fix is replication factor 3 for ${STOCK}, which needs a partition reassignment outside this lab.`,
    ),
    {
      title: 'Make the stock publisher wait for the broker',
      how: `Runtime Manager, ${STOCK_APP}, Settings, Properties. Set kafka.acks to ALL and Apply Changes. A publish that fails now raises an error, and the update is sent again the next minute.`,
      done: stockSafe,
    },
    {
      title: 'Prove both',
      how: `Move the clock 5 minutes after the last change. The outbox of ${ORDERS_APP} is empty and each run publishes with acks ALL, ${ORDERS} keeps min.insync.replicas 2, and every stock update since the change reached ${STOCK}.`,
      done: (s) => {
        const o = app(s, ORDERS_APP)
        const k = app(s, STOCK_APP)
        const after = Math.max(o?.updated ?? 0, k?.updated ?? 0)
        if (!allUp(s) || !stockSafe(s) || !running(s, ORDERS_APP) || s.clock < after + 5 * MINUTE) return false
        const ordersOk = acksOf(props(s, ORDERS_APP)) === 'ALL' && cluster(s).topics[ORDERS]?.config['min.insync.replicas'] === '2' && o.store?.waiting === 0 && Boolean(lastRun(s, ORDERS_APP, 'publish-outbox-flow')?.ok)
        const stockOk = since(k.store?.sent, k.updated).length > 0 && since(k.store?.lost, k.updated).length === 0 && !(k.store?.retry ?? []).length
        return ordersOk && stockOk
      },
    },
  ],
  why: 'Replication factor is how many brokers keep a copy of each partition. The in sync replicas (ISR) are the copies that are up to date with the leader. min.insync.replicas is the smallest ISR a write with acks ALL accepts, so RF 3 with min.insync.replicas 2 survives one broker down and refuses writes when two are down. The producer acks choose how long the app waits: NONE waits for nothing and never sees a failure, LEADER_ONLY waits for the leader, which can lose a record when the leader fails before the followers copy it, ALL waits for the ISR. The Mule Kafka connector default is NONE, so set ALL for data that matters and keep the record until the publish succeeds, as the outbox does. Do not lower min.insync.replicas or acks to get writes through an outage. Bring the brokers back instead, and give important topics replication factor 3.',
  docs: 'https://kafka.apache.org/documentation/#producerconfigs',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${ORDERS_APP}`)
    s = startBroker(startBroker(s, CLUSTER, 2).state, CLUSTER, 3).state
    s = change(s, STOCK_APP, { props: { ...app(s, STOCK_APP).props, 'kafka.acks': 'ALL' } })
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 5: 1 },
}

export const LABS = [lab]
