// The guided lab amq-prefetch. See platform-labs.js for the shape of a lab.
import { advance, at, finishDeploys, MINUTE, mark, newApp, newPlatform, startApp } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { AMQ, AMQ_URL, brokerOf, defaultJms } from '../platform-jms.js'
import { INVOICER, prefetchOf, QUEUE, RENDERER } from './amq-prefetch.pkg.js'

const LOGIN = { 'jms.url': AMQ_URL, 'jms.user': 'mule-billing', 'jms.password': 'billing-lab-1' }
const renderer = (s) => app(s, RENDERER)
const props = (s) => ({ ...renderer(s)?.props, ...renderer(s)?.secrets })
const running = (s) => renderer(s)?.status === 'Running'
const pending = (s) => brokerOf(s, AMQ)?.queues[QUEUE]?.messages.length ?? 0

const lab = {
  id: 'p-amq-prefetch',
  group: 'ActiveMQ',
  title: 'Three replicas and only one works',
  minutes: 20,
  scenario: `At 06:00 ${INVOICER} put 200 month end invoice jobs on the ActiveMQ Classic queue ${QUEUE}. ${RENDERER} renders one PDF in about 30 seconds. It was deployed at 07:00 with 3 replicas so the invoices are out by 08:30. It is 07:40, and the logs show that only one replica renders while the other two get nothing. Find out why and make all three share the work.`,
  start() {
    const clock = at(1, 5, 55)
    const s = newPlatform({
      clock,
      apps: [newApp(INVOICER, { props: { ...LOGIN }, store: {} }), newApp(RENDERER, { status: 'Stopped', replicas: 3, props: { ...LOGIN }, store: {} })],
      jms: defaultJms(clock),
    })
    let later = until(s, at(1, 7))
    later = finishDeploys(startApp(later, RENDERER))
    later = until(later, at(1, 7, 35))
    const done = (renderer(later).store.done ?? []).length
    later.mail.push({
      t: at(1, 7, 35),
      to: OPS,
      subject: 'Month end invoices are too slow',
      body: `Only ${done} of 200 invoice PDFs are done after 35 minutes. At this pace the last ones are out after 09:00, and the customers must have them by 08:30. We added replicas for this, so why is it still slow?`,
      source: 'Brightmart Billing',
    })
    return until(later, at(1, 7, 40))
  },
  steps: [
    { title: 'Read the mail of billing', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Look at the consumers of ${QUEUE}`,
      how: `ActiveMQ, brightmart-amq, Queues, ${QUEUE}, Active Consumers. Compare Dispatched Queue and Prefetch of the three consumers, and the Messages in flight on the queue.`,
      done: (s) => Boolean(s.seen[`jms-dest:${QUEUE}`]),
    },
    ask(
      'Why two replicas sit idle',
      'Replica 1 was ready first and has about 120 messages dispatched to it. Replicas 2 and 3 have none. Why?',
      [
        'The broker sends every message to the oldest connection',
        'The ActiveMQ client prefetches up to 1000 messages per queue consumer. Replica 1 was the only consumer when it connected, so the broker pushed all waiting messages into its buffer. They count as in flight and no other consumer can get them until replica 1 acknowledges or disconnects',
        'Replicas 2 and 3 have the wrong password',
        'The queue is exclusive',
      ],
      1,
      'Prefetch saves a round trip per message, which is good for many small and fast messages. For slow work it is a trap: one consumer holds far more than it can handle, while others wait. The Active Consumers page shows it as Dispatched Queue near the queue depth for one consumer and 0 for the rest.',
    ),
    {
      title: 'Lower the prefetch',
      how: `Runtime Manager, ${RENDERER}, Settings, Properties. Add the prefetch policy to the broker URL in jms.url: ${AMQ_URL}?jms.prefetchPolicy.queuePrefetch=1. Apply Changes. The restart closes the old connections, the messages replica 1 held go back to the queue, and each consumer now takes one at a time.`,
      done: (s) => running(s) && prefetchOf(props(s)) >= 1 && prefetchOf(props(s)) <= 5,
    },
    ask(
      'Prefetch or more consumers',
      'A colleague wants to set numberOfConsumers to 8 on the listener instead. Would that have helped?',
      [
        'Yes, more consumers always share the work',
        'Not with prefetch 1000: the first consumer that connects still takes the whole backlog. More consumers help only when each holds few messages. For slow work use prefetch 1, or 0 for a pull consumer; for fast small messages a larger prefetch gives more throughput',
        'Yes, because numberOfConsumers turns the prefetch off',
        'No, the JMS connector allows only one consumer',
      ],
      1,
      'Throughput comes from consumers that can work in parallel; prefetch only decides how many messages each one reserves ahead. The Mule JMS listener has 4 consumers by default, each with its own prefetch. Size the prefetch by how long one message takes.',
    ),
    ask(
      'What the restart did to the held messages',
      `When ${RENDERER} restarted, replica 1 had one message in work and many in its buffer. What happened to them?`,
      [
        'They were lost',
        'They went back to the queue. A message that was handed to the flow and not acknowledged comes again with JMSRedelivered true and a higher delivery count, so the flow must be safe to run twice',
        'They went to ActiveMQ.DLQ',
        'Replica 1 kept them after the restart',
      ],
      1,
      'Unacknowledged messages belong to the broker. When the consumer closes, the broker gives them to the next consumer. The one that was in work may have been half done, so renderers and other flows should check for work already done, for example a PDF that exists.',
    ),
    {
      title: 'Watch the three replicas work',
      how: `Move the clock 10 minutes. The logs show each replica rendering about 2 PDFs a minute, and Queues, ${QUEUE} shows the pending count falling three times as fast.`,
      done: (s) => {
        const a = renderer(s)
        if (!running(s) || prefetchOf(props(s)) > 5 || s.clock < a.updated + 8 * MINUTE) return false
        const after = (a.store.done ?? []).filter((x) => x.t > a.updated)
        return [1, 2, 3].every((r) => after.filter((x) => x.r === r).length >= 3) && pending(s) < 200
      },
    },
  ],
  why: 'An ActiveMQ Classic consumer prefetches messages: the broker pushes up to the prefetch limit (1000 for a queue, 32766 for a topic, 100 for a durable topic subscriber) into the client buffer, and those messages are in flight for that consumer only. A consumer that connects first, or one that is slow, can hold a whole backlog while others are idle. Set the prefetch from the broker URL (jms.prefetchPolicy.queuePrefetch, or jms.prefetchPolicy.all for every kind) by the cost of one message: 1 for slow work, more for fast and small messages. Adding consumers helps only when each one holds few. On Artemis the same idea is consumerWindowSize, in bytes, 1 MiB by default and 0 for no buffer. In the lab each consumer renders 2 PDFs a lab minute and the replicas of a deploy start two minutes apart.',
  docs: 'https://activemq.apache.org/components/classic/documentation',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `jms-dest:${QUEUE}`)
    s = change(s, RENDERER, { props: { ...renderer(s).props, 'jms.url': `${AMQ_URL}?jms.prefetchPolicy.queuePrefetch=1` } })
    return advance(s, 10 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 5: 1 },
}

export const LABS = [lab]
