// The guided lab mq-poison. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform, sendMessage } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { handles, LAB_ATTEMPTS, maxRedelivery, POISON_BODY, POISON_ID } from './mq-poison.pkg.js'

const NAME = 'shipment-label-consumer'
const QUEUE = 'shipment-requests'

const consumer = (s) => app(s, NAME)
const props = (s) => ({ ...consumer(s)?.props, ...consumer(s)?.secrets })
const running = (s) => consumer(s)?.status === 'Running'
const limitOk = (s) => running(s) && maxRedelivery(props(s)) !== null && maxRedelivery(props(s)) >= 1 && maxRedelivery(props(s)) <= 10
// only bad data is logged and acknowledged; a carrier that is down is still nacked for redelivery
const handlerOk = (s) => running(s) && handles(props(s), 'onError.badData') && !handles(props(s), 'onError.temporary')
const since = (list, s) => (list ?? []).filter((x) => x.t > consumer(s).updated)

const lab = {
  id: 'p-mq-poison',
  group: 'Databases and queues',
  title: 'One bad message that comes back forever',
  minutes: 20,
  scenario:
    'shipment-label-consumer takes shipment requests from the Anypoint MQ queue shipment-requests and creates a shipping label at the parcel carrier for each one. The queue has no dead letter queue. Since 08:01 the warehouse gets its labels late, about 7 seconds each where half a second is normal. Find the cause, stop it, and make sure a bad message can never do this again, without losing labels when the carrier has a short outage.',
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      nextId: 10,
      apps: [newApp(NAME, { props: { 'carrier.host': 'labels.parcelcarrier.lab', 'queue.name': QUEUE, 'mq.maxRedeliveryCount': '', 'onError.badData': 'propagate', 'onError.temporary': 'propagate' }, store: {} })],
      queues: [{ name: QUEUE, type: 'Standard queue', dlq: '', attempts: LAB_ATTEMPTS, messages: [{ id: POISON_ID, body: POISON_BODY, deliveries: 0, t: at(1, 8) }] }],
      queueTraffic: [
        { queue: QUEUE, everyMinutes: 1 },
        { queue: QUEUE, everyMinutes: 1 },
      ],
      mail: [
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Shipping labels are slow',
          body: 'Since about 08:00 each label takes around 7 seconds to arrive at the dock printers. Normal is under a second. The carrier says its side is fine. The trucks leave at 11:00, so please look at it this morning.',
          source: 'Brightmart Warehouse',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the warehouse', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      ...sawLogs(NAME),
      how: `Runtime Manager, Applications, ${NAME}, Logs. Look for the same Message Id in many error blocks. The lab keeps that message in flight on the consumer, so the Message Browser does not show it.`,
    },
    ask(
      'One message, hundreds of deliveries',
      `Message ${POISON_ID} fails each minute with MULE:EXPRESSION, and its delivery attempt is in the hundreds. What kind of failure is this?`,
      ['The carrier is down', 'A bad message: its payload is cut off, so it fails the same way on every delivery and a retry can never work', 'The queue is full', 'The acknowledgement timeout is too short'],
      1,
      'The payload ends in the middle of the address, so the transform fails before any call is made. Nothing about it changes between deliveries. With AUTO the error nacks the message, it returns to the queue, and with no limit and no dead letter queue it comes back again and again, taking threads from the good messages.',
    ),
    ask(
      'Bad message or temporary failure',
      'Now and then a good order fails once with HTTP:SERVICE_UNAVAILABLE from the carrier and works at Delivery Count 2. What is the difference to the bad message?',
      [
        'There is none, both should go to the dead letter queue at once',
        'A temporary failure can work on a retry, so nack it for redelivery. A bad message fails every time, so take it out of the flow at once and keep it for a person to look at',
        'A temporary failure should be acknowledged and dropped',
        'A bad message should be retried until it works',
      ],
      1,
      'Ask whether a retry can change the result. A 503, a timeout or a lost connection can pass on a later delivery. A payload that cannot be read, or a field that fails validation, fails the same way every time. Retrying it only wastes capacity.',
    ),
    {
      title: 'Put a limit on redelivery',
      how: `Runtime Manager, ${NAME}, Settings, Properties. mq.maxRedeliveryCount is the redelivery policy of the Subscriber. Set a small number such as 5, then Apply Changes. After that many failed deliveries Mule raises MULE:REDELIVERY_EXHAUSTED, and the flow has an on-error-continue for it that logs the message and acknowledges it. This stops any message that keeps failing, whatever the cause.`,
      done: limitOk,
    },
    {
      title: 'Handle bad data in the error handler',
      how: 'Set onError.badData to continue: an on-error-continue for MULE:EXPRESSION logs the whole payload and acknowledges the message at once. Keep onError.temporary at propagate, so a carrier outage still nacks the message for redelivery. Apply Changes.',
      done: handlerOk,
    },
    ask(
      'Why not continue for every error',
      'A colleague wants on-error-continue for every error type, to be sure nothing loops again. What goes wrong?',
      ['Nothing, that is the safest setting', 'A short carrier outage would acknowledge good orders without a label, and those labels are lost', 'Mule does not allow on-error-continue on a Subscriber flow', 'The bad message would still loop'],
      1,
      'on-error-continue ends the flow as a success, so AUTO acknowledges the message and it is gone. That is right for data that can never work and wrong for a failure that a retry would fix. Handle the two by error type.',
    ),
    ask(
      'A dead letter queue as well',
      `${QUEUE} has no dead letter queue. What does assigning one with Delivery attempts before reroute set to 5 add?`,
      [
        'Nothing, the redelivery policy does the same',
        'Anypoint MQ moves any message that fails 5 deliveries to the DLQ. A failure that no handler catches stops there, and the message is kept for someone to look at and replay',
        'Messages go to the DLQ on their first failure',
        'It makes the queue keep messages in order',
      ],
      1,
      'The queue setting is a backstop on the broker side that works for every consumer. The value ranges from 1 to 1000 and the default is 10, and the DLQ must be the same type of queue in the same region. Many teams also publish the bad message to the DLQ from the error handler, so the payload is kept outside the logs. The lab queue cannot be changed here, so this lab logs the payload instead.',
    ),
    {
      title: 'Send a bad message and watch it',
      how: `MQ, ${QUEUE}, Message Sender. Send a payload that is cut off, such as { "order": "O-2001", "total": . Then move the clock 5 minutes after the last change. The log shows ${POISON_ID} and your message logged and acknowledged, labels back at 0.4 s, and a 503 that works on Delivery Count 2.`,
      done: (s) => {
        if (!limitOk(s) || !handlerOk(s) || s.clock < consumer(s).updated + 5 * MINUTE) return false
        const store = consumer(s).store ?? {}
        const rejected = since(store.rejected, s)
        return !store.stuck && rejected.some((x) => x.id === POISON_ID) && rejected.some((x) => x.id !== POISON_ID) && since(store.recovered, s).length > 0 && since(store.lost, s).length === 0
      },
    },
  ],
  why: 'A poison message fails every time it is delivered. With AUTO the error nacks it, it returns to the queue, and without a limit it comes back again and again and takes capacity from good messages. Set a limit on deliveries: maxRedeliveryCount on the Subscriber raises MULE:REDELIVERY_EXHAUSTED, and a dead letter queue on the queue moves the message aside after its delivery attempts. In the flow, sort errors by type. Bad data, such as a payload that cannot be read, gets on-error-continue: log it or publish it to a DLQ, and acknowledge it. A temporary failure, such as a 503 or a timeout, propagates so the message is nacked and redelivered. In the lab the error handler choices and the redelivery policy are properties, the queue settings cannot be changed, and the bad message is kept in flight by the lab and redelivered 12 times a minute.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/redelivery-policy',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${NAME}`)
    s = change(s, NAME, { props: { ...consumer(s).props, 'mq.maxRedeliveryCount': '5', 'onError.badData': 'continue' } })
    s = sendMessage(s, QUEUE, '{ "order": "O-2001", "total": ')
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 6: 1, 7: 1 },
}

export const LABS = [lab]
