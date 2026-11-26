// The guided lab mq-ack-timeout. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { ackMs, callLimit, CAPTURE_MS, idempotent, REST_MS } from './mq-ack-timeout.pkg.js'

const NAME = 'payment-capture-consumer'
const QUEUE = 'payment-captures'
const DLQ = 'payment-captures-dlq'
const MAX_LOCK = 12 * 60 * MINUTE // the largest acknowledgement timeout of a queue

const consumer = (s) => app(s, NAME)
const props = (s) => ({ ...consumer(s)?.props, ...consumer(s)?.secrets })
const running = (s) => consumer(s)?.status === 'Running'
// the lock is longer than one message really takes
const lockOk = (s) => running(s) && ackMs(props(s)) > CAPTURE_MS + REST_MS && ackMs(props(s)) <= MAX_LOCK
// the capture call has a limit that lets a normal capture finish and keeps the whole flow inside the lock
const boundOk = (s) => running(s) && callLimit(props(s)) > CAPTURE_MS && callLimit(props(s)) + REST_MS < ackMs(props(s))
const guardOk = (s) => running(s) && idempotent(props(s))
const fixed = (s) => lockOk(s) && boundOk(s) && guardOk(s)

const lab = {
  id: 'p-fail-mq-ack-timeout',
  group: 'More production failures',
  title: 'Payments captured twice because the lock ran out',
  minutes: 15,
  scenario:
    'payment-capture-consumer runs on 2 replicas. It takes payment messages from the Anypoint MQ queue payment-captures and captures each payment at the payment gateway of Harbor Foods. Since the gateway release on Monday a capture takes about 95 seconds. This morning Finance sees customers charged twice, while Monitoring shows no errors at all. Find out why and make sure no payment is captured twice.',
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [
        newApp(NAME, {
          replicas: 2,
          props: {
            'gateway.host': 'pay-gw.harbor.lab',
            'queue.name': QUEUE,
            'dlq.name': DLQ,
            'mq.ackTimeout': '60',
            'mq.ackTimeoutUnit': 'SECONDS',
            'gateway.responseTimeout': '300000',
            'idempotency.enabled': 'false',
          },
        }),
      ],
      queues: [
        { name: QUEUE, type: 'Standard queue', dlq: DLQ, attempts: 5, messages: [] },
        { name: DLQ, type: 'Standard queue', dlq: '', attempts: 10, messages: [] },
      ],
      queueTraffic: [{ queue: QUEUE, everyMinutes: 2 }],
      mail: [
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Customers charged twice for one order',
          body: 'Since this morning the gateway report shows two captures for many payment IDs, each pair about a minute apart. Every order exists once in our system. Please stop this before the noon settlement run. We will refund the extra captures.',
          source: 'Harbor Foods Finance',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of Finance', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(NAME),
    ask(
      'Same message, two deliveries',
      'Two log lines have the same Message Id. The second has Delivery Count 2 and comes from the other replica. There is no error in between. What happened?',
      ['The publisher sent the payment twice', 'One message was delivered twice, and both replicas captured it', 'The gateway retried the capture on its own', 'Replica 2 read a copy from the dead letter queue'],
      1,
      'The Message Id is the same, so it is one message. Delivery Count counts the times the message was delivered. A count of 2 with no error in between means it came back without any failure.',
    ),
    ask(
      'Why the message came back',
      'acknowledgementMode is AUTO and acknowledgementTimeout is 60 SECONDS. A capture takes about 95 seconds. Why is the message delivered again?',
      [
        'AUTO acknowledges only failed messages',
        'The timer starts when the message is consumed. After 60 seconds the message returns to the queue for redelivery, while replica 1 is still waiting for the gateway',
        'The queue has too few delivery attempts',
        'Two replicas always get every message',
      ],
      1,
      'AUTO acknowledges when the flow ends without an error, here after about 100 seconds. The lock lasts 60 seconds, so the message is free again before that and another consumer takes it. The flow succeeds both times, so Monitoring shows no error.',
    ),
    ask(
      'Would IMMEDIATE help',
      'A colleague wants to switch acknowledgementMode to IMMEDIATE. What does that change?',
      [
        'Nothing, IMMEDIATE is the same as AUTO',
        'IMMEDIATE makes the lock last forever',
        'The message is acknowledged as it is consumed, before processing. No repeat, but a payment is lost if the replica fails during the capture',
        'IMMEDIATE keeps the message until the flow ends',
      ],
      2,
      'IMMEDIATE acknowledges on receipt, so the message is gone from the queue. A crash or restart in the middle of the capture then loses the payment. AUTO with a lock that fits the work keeps the message safe.',
    ),
    {
      title: 'Give the lock more time than the work',
      how: `Runtime Manager, ${NAME}, Settings, Properties. mq.ackTimeout and mq.ackTimeoutUnit feed acknowledgementTimeout and acknowledgementTimeoutUnit of the Subscriber. Set a lock above the real processing time of about 100 seconds, such as 180 and SECONDS, then Apply Changes. The largest acknowledgement timeout of a queue is 12 hours.`,
      done: lockOk,
    },
    {
      title: 'Put a limit on the capture call',
      how: 'gateway.responseTimeout is the responseTimeout of the HTTP Request in ms. Today it is 300000, longer than the lock. Set a value above the 95 seconds a capture takes and with room below the lock, such as 120000, then Apply Changes. Now the flow always ends before the lock runs out.',
      done: boundOk,
    },
    {
      title: 'Make the consumer idempotent',
      how: 'Set idempotency.enabled to true and Apply Changes. The flow then keeps the payment IDs it has captured and skips one it has seen before. A delivery can still repeat after a crash, so the consumer has to be safe with a repeat.',
      done: guardOk,
    },
    {
      title: 'Prove that no payment is captured twice',
      how: 'Move the clock 5 minutes after the last change. In the logs of the new version every Message Id appears once, with Delivery Count 1, and each payment has one capture.',
      done: (s) => {
        const a = consumer(s)
        if (!fixed(s) || s.clock < a.updated + 5 * MINUTE) return false
        const logs = a.logs.filter((l) => l.config === a.config && l.t > a.updated)
        const since = s.events.filter((e) => e.k === 'msg' && e.app === NAME && e.t > a.updated)
        return logs.some((l) => /captured at the gateway/.test(l.text)) && !logs.some((l) => /Delivery Count ([2-9]|\d\d)/.test(l.text)) && since.length > 0 && since.every((e) => e.s === 'ok')
      },
    },
  ],
  why: 'Anypoint MQ locks a message while a consumer works on it. With AUTO the message is acknowledged when the flow ends without an error. If the flow takes longer than acknowledgementTimeout, the message returns to the queue for redelivery, a second consumer takes it, and the work is done twice with no error anywhere. Set the lock above the real processing time, give the slow call a limit that fits inside the lock, and make the consumer idempotent, because delivery is at least once. In the lab each message is delivered twice at most and the clock does not wait 95 seconds. A real queue can deliver it again each time the lock runs out. The prefetch buffer can also extend the timeout, so the real timing is less exact.',
  docs: 'https://docs.mulesoft.com/anypoint-mq-connector/latest/anypoint-mq-ack',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${NAME}`)
    s = change(s, NAME, { props: { ...consumer(s).props, 'mq.ackTimeout': '180', 'mq.ackTimeoutUnit': 'SECONDS', 'gateway.responseTimeout': '120000', 'idempotency.enabled': 'true' } })
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 4: 2 },
}

export const LABS = [lab]
