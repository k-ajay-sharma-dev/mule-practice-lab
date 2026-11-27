// The guided lab jms-durable. See platform-labs.js for the shape of a lab.
import { advance, at, finishDeploys, MINUTE, mark, newApp, newPlatform, startApp, stopApp } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { ARTEMIS_BROKER, ARTEMIS_URL, brokerOf, defaultJms, deleteSubscription, subActive } from '../platform-jms.js'
import { clientIdOf, durable, FEED, shared, SYNC, TOPIC } from './jms-durable.pkg.js'

const SUB = 'stock-sync'
const sync = (s) => app(s, SYNC)
const props = (s) => ({ ...sync(s)?.props, ...sync(s)?.secrets })
const running = (s) => sync(s)?.status === 'Running'
const broker = (s) => brokerOf(s, ARTEMIS_BROKER)
const plainDurable = (s) => (broker(s)?.subs ?? []).filter((x) => x.durable && !x.shared && x.topic === TOPIC)
const sharedSub = (s) => (broker(s)?.subs ?? []).find((x) => x.durable && x.shared && x.topic === TOPIC)
const missedOf = (s, from, to) => (app(s, FEED).store.sent ?? []).filter((x) => x.t > from && x.t <= to && !sync(s).store.got?.[x.id])
// a deployment with the Recreate model: the app is stopped for `minutes`, then starts with its new version
const deployWithDowntime = (s, minutes) => finishDeploys(startApp(advance(stopApp(s, SYNC), minutes * MINUTE), SYNC))

const lab = {
  id: 'p-jms-durable',
  group: 'ActiveMQ',
  title: 'Stock drifts after every deploy',
  minutes: 25,
  scenario: `${FEED} publishes every stock change to the topic ${TOPIC} on the ActiveMQ Artemis broker harbor-artemis. ${SYNC} subscribes to the topic and applies each change to the warehouse system. This morning a deploy of ${SYNC} took 20 minutes, and since then the warehouse counts are off. Find out why, make the subscription keep events while the app is down, then run it on two replicas without losing or repeating an event.`,
  start() {
    const clock = at(1, 7, 30)
    const s = newPlatform({
      clock,
      apps: [
        newApp(FEED, { props: { 'jms.url': ARTEMIS_URL, 'jms.user': 'mule-stock', 'jms.password': 'stock-lab-1' }, store: {} }),
        newApp(SYNC, {
          model: 'Recreate',
          props: { 'jms.url': ARTEMIS_URL, 'jms.user': 'mule-warehouse', 'jms.password': 'warehouse-lab-1', 'jms.clientId': '', 'jms.durable': 'false', 'jms.shared': 'false', 'jms.subscriptionName': '', 'jms.specification': 'JMS_1_1', 'app.release': '2.3.0' },
          store: {},
        }),
      ],
      jms: defaultJms(clock),
    })
    let later = until(s, at(1, 8, 10))
    later = deployWithDowntime(later, 20)
    later = until(later, at(1, 8, 55))
    const missed = missedOf(later, at(1, 8, 9), at(1, 8, 31))
    later.mail.push({
      t: at(1, 8, 55),
      to: OPS,
      subject: 'Stock counts are wrong since the deploy',
      body: `The warehouse system is off for several items since about 08:30, for example the stock change ${missed[0]?.id ?? 'SE-9122'} never arrived. The stock system shows ${missed.length} changes between 08:10 and 08:30 that we do not have. Pickers go to empty bins. Please fix it before the next deploy.`,
      source: 'Harbor Foods Warehouse',
    })
    return until(later, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the warehouse', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Look at the address ${TOPIC}`,
      how: `ActiveMQ, choose harbor-artemis at the top, Addresses, ${TOPIC}. It is a MULTICAST address: each subscriber has its own queue under it. The queue of ${SYNC} has a random name and is not durable.`,
      done: (s) => Boolean(s.seen[`jms-dest:${TOPIC}`]),
    },
    ask(
      'Where the 20 minutes went',
      `${SYNC} subscribes as a plain, non durable topic subscriber. What happened to the events published while it was stopped?`,
      [
        'The broker kept them in the DLQ',
        'A non durable subscription exists only while its consumer is connected. When the app stopped, its subscription queue was deleted, and the events of those 20 minutes were copied to no one',
        'They were delivered to the next app on the topic',
        'The publisher kept them until the app came back',
      ],
      1,
      'A topic copies each message to the subscriptions that exist at that moment. A non durable subscription goes away with its connection, so anything published in between is gone for that subscriber. A durable subscription stays on the broker and keeps messages until the subscriber comes back.',
    ),
    {
      title: 'Make the subscription durable',
      how: `Runtime Manager, ${SYNC}, Settings, Properties. Set jms.durable to true, jms.subscriptionName to ${SUB} and jms.clientId to a fixed name such as ${SYNC}. A durable subscription is known by client ID and subscription name, so both must stay the same across deploys. Apply Changes.`,
      done: (s) => running(s) && durable(props(s)) && (broker(s)?.made ?? []).some((x) => !x.shared && x.clientId),
    },
    {
      title: 'Stop the app and start it again',
      how: `Runtime Manager, ${SYNC}: Stop, move the clock 5 minutes, then Start. While it is stopped, Addresses, ${TOPIC} shows the durable queue ${SYNC}.${SUB} with messages waiting. After the start the app takes them all.`,
      done: (s) => (broker(s)?.catchUps ?? []).some((c) => c.pending > 0 && !c.key.startsWith('shared')),
    },
    {
      title: 'Run two replicas',
      how: `${SYNC}, Settings, Replicas: 2, Apply Changes. Then move the clock 2 minutes and read the logs. The second replica cannot connect with the same client ID.`,
      done: (s) => (sync(s)?.replicas ?? 1) >= 2 && (broker(s)?.refused ?? []).some((r) => r.app === SYNC && /InvalidClientIDException/.test(r.text)),
    },
    ask(
      'Topic or queue',
      'Why did the first version use a topic at all, and when is a queue the better choice?',
      [
        'They are the same thing with two names',
        'A topic gives a copy to every subscription, so the stock system can feed the warehouse, the web shop and the reports at once. A queue gives each message to one consumer, which is what replicas of one app need. Use a topic for many different readers and a queue, or a shared subscription, for the copies of one reader',
        'A queue is faster because it has no subscribers',
        'Topics keep messages for ever and queues do not',
      ],
      1,
      'Publish and subscribe means one copy per subscription; point to point means one consumer per message. Replicas of one app are one logical reader, so they must share one subscription or one queue. Otherwise each replica applies every change and the stock moves twice.',
    ),
    ask(
      'Classic or Artemis',
      'harbor-amq runs ActiveMQ Classic 5.18 and harbor-artemis runs Artemis. Which is true?',
      [
        'They have the same address model and the same defaults',
        'Artemis keeps each subscription as a queue under a MULTICAST address, supports JMS 2.0 shared subscriptions, and counts deliveries on the broker with max-delivery-attempts, 10 by default, before the DLQ. Classic 5.18 has no JMS 2.0 shared subscriptions, uses virtual topics for the same need, and counts redeliveries in the client with maximumRedeliveries, 6 by default',
        'Classic supports shared subscriptions and Artemis does not',
        'Only Classic has a dead letter queue',
      ],
      1,
      'In Artemis an address with routing type ANYCAST is a JMS queue and MULTICAST is a topic; the queues under a MULTICAST address are its subscriptions. Address settings such as dead-letter-address DLQ, expiry-address ExpiryQueue and max-delivery-attempts apply by match. Classic keeps queues and topics apart, its RedeliveryPolicy lives on the connection factory, and its default DLQ is ActiveMQ.DLQ.',
    ),
    {
      title: 'Share one durable subscription',
      how: `Set jms.shared to true, jms.specification to JMS_2_0 and clear jms.clientId: a shared subscription is known by its name, and two connections cannot have one client ID. Keep jms.durable true and 2 replicas. Apply Changes. The changes of the minute of the switch stay on the old subscription, so in a real move create the shared one first. Then delete the old queue ${SYNC}.${SUB} in Queues, or it keeps every event and fills the disk. Move the clock 5 minutes.`,
      done: (s) => {
        const a = sync(s)
        const sub = sharedSub(s)
        if (!running(s) || !shared(props(s)) || clientIdOf(props(s)) || (a.replicas ?? 1) < 2 || !sub || !subActive(broker(s), sub) || plainDurable(s).length || s.clock < a.updated + 5 * MINUTE) return false
        const consumers = new Set(broker(s).consumers.filter((k) => k.box === `s:${sub.key}`).map((k) => k.replica))
        const from = a.updated + MINUTE
        const sent = (app(s, FEED).store.sent ?? []).filter((x) => x.t > from && x.t <= s.clock - MINUTE)
        return consumers.size >= 2 && sent.length > 5 && sent.every((x) => a.store.got?.[x.id] === 1)
      },
    },
  ],
  why: 'A topic copies a message to the subscriptions that exist when it arrives. A non durable subscriber misses everything while it is down, so a deploy or a crash opens a gap. A durable subscription, known by client ID and subscription name, keeps the messages on the broker until the subscriber returns. The client ID must be unique per connection, so a second replica with the same one is refused. For several replicas of one app, use a JMS 2.0 shared durable subscription (Artemis supports it; the Mule topic consumer sets shared="true" and the connection needs specification JMS_2_0), or have them read a queue, such as a Classic virtual topic queue: the publisher sends to VirtualTopic.STOCK.EVENTS and each app reads its own queue, such as Consumer.warehouse.VirtualTopic.STOCK.EVENTS, as a plain queue. Delete subscriptions you stop using, or they keep every message. In the lab each replica runs one listener once a lab minute.',
  docs: 'https://docs.mulesoft.com/jms-connector/latest/',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `jms-dest:${TOPIC}`)
    s = change(s, SYNC, { props: { ...sync(s).props, 'jms.durable': 'true', 'jms.subscriptionName': SUB, 'jms.clientId': SYNC } })
    s = advance(s, 2 * MINUTE)
    s = deployWithDowntime(s, 5)
    s = advance(s, 2 * MINUTE)
    s = change(s, SYNC, { replicas: 2 })
    s = advance(s, 2 * MINUTE)
    s = change(s, SYNC, { props: { ...sync(s).props, 'jms.shared': 'true', 'jms.specification': 'JMS_2_0', 'jms.clientId': '' } })
    s = advance(s, 2 * MINUTE)
    s = deleteSubscription(s, ARTEMIS_BROKER, `${SYNC}:${SUB}`).state
    return advance(s, 5 * MINUTE)
  },
  answers: { 2: 1, 6: 1, 7: 1 },
}

export const LABS = [lab]
