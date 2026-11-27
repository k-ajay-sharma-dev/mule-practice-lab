// The guided lab kafka-consumer-lag. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { createTopic, lagOf, newCluster, newKafka } from '../platform-kafka.js'
import { CLUSTER, GROUP, PARTITIONS, TOPIC } from './kafka-consumer-lag.pkg.js'

const PUB = 'sale-orders-publisher'
const NAME = 'warehouse-pick-consumer'
const KAFKA = { 'kafka.cluster': CLUSTER, 'kafka.topic': TOPIC }

const consumer = (s) => app(s, NAME)
const running = (s) => consumer(s)?.status === 'Running'
const group = (s) => s.kafka?.clusters?.[CLUSTER]?.groups?.[GROUP]
const scaled = (s) => running(s) && consumer(s).replicas === PARTITIONS
const lagZero = (s) => {
  const lag = lagOf(s.kafka?.clusters?.[CLUSTER], TOPIC, GROUP)
  return lag.ok && lag.partitions.every((p) => p.committed !== null) && lag.total === 0
}
const onePerMember = (s) => {
  const g = group(s)
  return g?.state === 'Stable' && g.members.length === PARTITIONS && g.members.every((m) => m.partitions.length === 1)
}

const lab = {
  id: 'p-kafka-consumer-lag',
  group: 'Kafka',
  title: 'Orders that reach the warehouse later and later',
  minutes: 20,
  scenario: `sale-orders-publisher puts every web shop order on the Kafka topic ${TOPIC} of the cluster ${CLUSTER}. ${NAME} reads them in the consumer group ${GROUP} and hands each one to the pick system of the warehouse. The autumn sale started at 08:30 and orders went from 4 to 12 a minute. Now the pickers see each order half an hour late, and the delay grows. Find out why, fix it without paying for capacity that does nothing, and prove the warehouse is back in real time.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7, 45),
      apps: [newApp(PUB, { props: { ...KAFKA }, store: {} }), newApp(NAME, { props: { ...KAFKA, 'kafka.groupId': GROUP }, store: {} })],
      kafka: newKafka({ clusters: { [CLUSTER]: newCluster(CLUSTER, 3) } }),
      mail: [
        {
          t: at(1, 8, 55),
          to: OPS,
          subject: 'Pick lists are half an hour behind',
          body: 'Before the sale an order was on the pick list within a minute. Since the sale started the orders arrive later and later, and now it is close to half an hour. The web shop is fast and the pickers are waiting. Please look at it before the 10:00 courier run.',
          source: 'Brightmart Warehouse',
        },
      ],
    })
    s = createTopic(s, CLUSTER, { name: TOPIC, partitions: PARTITIONS, replicationFactor: 3, config: { 'min.insync.replicas': '2' } }).state
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the warehouse', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Open the consumer group',
      how: `Kafka, Consumers, ${GROUP}. Read the members, the partition each one owns, and the lag of each partition. The log of ${NAME} in Runtime Manager shows the lag each minute too.`,
      done: (s) => Boolean(s.seen[`kafka-group:${GROUP}`]),
    },
    ask(
      'What limits the speed',
      `The group has one member, and it owns ${TOPIC}-0 to ${TOPIC}-5. The lag grows on every partition. The brokers are fine. What limits the group?`,
      [
        'The brokers cannot send records fast enough',
        'Kafka gives each partition to one member of the group. One member owns all six, so the group moves only as fast as one consumer, about 6 orders a minute for 12 coming in',
        'The retention of the topic is too short',
        'The producer uses acks ALL',
      ],
      1,
      'Inside one consumer group a partition is read by one member at a time. That keeps the records of a partition in order. The work of the group is spread by partition, so more members help until each partition has its own member.',
    ),
    ask(
      'How many replicas',
      `${TOPIC} has ${PARTITIONS} partitions. A colleague wants 8 replicas of ${NAME} to be on the safe side. What happens with 8?`,
      [
        '8 replicas are faster than 6',
        'Six members get one partition each and two get none. The two sit idle, cost vCores and add nothing',
        'Kafka refuses the extra members',
        'Kafka splits each partition into smaller parts for the extra members',
      ],
      1,
      'The partition count is the upper limit of parallel consumers in one group. A member with no partition stays idle and takes over only when another member leaves. One or two spare members can make a failover faster, but they never add speed.',
    ),
    {
      title: 'One consumer per partition',
      how: `Runtime Manager, ${NAME}, Settings, Runtime. Set Replicas to ${PARTITIONS} and Apply Changes. Each replica joins ${GROUP} as one member, and the group rebalances so that each member owns one partition.`,
      done: scaled,
    },
    ask(
      'Plan the partitions',
      'Next year the sale may bring twice as many orders. Why choose the partition count ahead of time instead of adding partitions on the day?',
      [
        'There is no reason, partitions can be added and removed at any time',
        'Adding partitions changes which partition a key goes to, so the events of one order can come out of order, and partitions can never be removed again',
        'Adding partitions deletes the records of the topic',
        'Kafka allows at most 6 partitions per topic',
      ],
      1,
      'A keyed record goes to the hash of its key modulo the partition count. With more partitions the same key lands in another partition, and the order between the old and the new records of that key is lost. Pick a count that leaves room to grow, then scale the consumers up to it.',
    ),
    {
      title: 'Watch the lag fall to 0',
      how: `Move the clock about 15 minutes and open ${GROUP} again. Each of the ${PARTITIONS} members owns one partition, and the consumer lag of every partition is 0.`,
      done: (s) => scaled(s) && s.clock >= consumer(s).updated + 3 * MINUTE && onePerMember(s) && lagZero(s),
    },
  ],
  why: 'Consumer lag is the end offset of a partition less the committed offset of the group. It grows when records come in faster than the group handles them. Kafka gives each partition to one member of a group, so the group scales by partition: add members up to the partition count and each one owns a partition. Members above that count stay idle. Adding partitions also raises the limit, but it moves keys to other partitions and cannot be undone, so choose the count with room to grow. If one member is slow while the others are fine, look at that replica or at a hot key, because more members do not split one partition. In the lab each replica is one member that hands over about 6 orders a minute.',
  docs: 'https://kafka.apache.org/documentation/',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `kafka-group:${GROUP}`)
    s = change(s, NAME, { replicas: PARTITIONS })
    return advance(s, 20 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 5: 1 },
}

export const LABS = [lab]
