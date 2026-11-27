// The guided lab jms-transaction. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { AMQ, AMQ_URL, brokerOf, defaultJms, sendTo } from '../platform-jms.js'
import { FEED, IN, maxRedelivery, propagates, RELAY, REPLY, skipsExisting, transacted, WRITER } from './jms-transaction.pkg.js'

const LOGIN = { 'jms.url': AMQ_URL, 'jms.user': 'mule-orders', 'jms.password': 'orders-lab-1' }
const BAD = '{"orderId":"WO-BAD", "total": 12,,}'

const writer = (s) => app(s, WRITER)
const props = (s) => ({ ...writer(s)?.props, ...writer(s)?.secrets })
const running = (s) => writer(s)?.status === 'Running'
const txOk = (s) => running(s) && transacted(props(s)) && propagates(props(s))
const limitOk = (s) => running(s) && maxRedelivery(props(s)) !== null && maxRedelivery(props(s)) >= 1 && maxRedelivery(props(s)) <= 10
const dlq = (s) => brokerOf(s, AMQ)?.queues['ORDERS.DLQ']?.messages ?? []
const isJson = (body) => {
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

const lab = {
  id: 'p-jms-transaction',
  group: 'ActiveMQ',
  title: 'Orders booked with no confirmation',
  minutes: 25,
  scenario: `${FEED} puts web orders on the ActiveMQ Classic queue ${IN} of brightmart-amq. ${WRITER} takes each order with a JMS listener (ackMode AUTO, no transaction), inserts a row in the orders database and publishes a confirmation to ${REPLY}, which ${RELAY} mails to the customer. Customer service says some customers never got a confirmation, though their orders are in the database. Find out why, make the flow all or nothing, make sure a message that can never work stops in a dead letter queue, and prove it with a bad order of your own.`,
  start() {
    const clock = at(1, 7)
    const jms = defaultJms(clock)
    const b = jms.brokers[AMQ]
    // the broker answers a full destination with an error instead of blocking the producer
    b.config.sendFailIfNoSpace = true
    // lab-made: at peak minutes ORDERS.REPLY reaches its memory limit and refuses every fourth send
    b.faults = { [`queue://${REPLY}`]: { every: 4, n: 0 } }
    const s = newPlatform({
      clock,
      apps: [
        newApp(FEED, { props: { ...LOGIN }, store: {} }),
        newApp(WRITER, {
          props: { ...LOGIN, 'jms.replyQueue': REPLY, 'jms.ackMode': 'AUTO', 'jms.transactionalAction': 'NONE', 'jms.transactionType': 'LOCAL', 'jms.maxRedelivery': '-1', 'onError.publish': 'continue', 'order.skipExisting': 'false' },
          store: {},
        }),
        newApp(RELAY, { props: { ...LOGIN }, store: {} }),
      ],
      jms,
    })
    const later = until(s, at(1, 8, 50))
    const missing = (writer(later).store.noReply ?? []).map((x) => x.id)
    later.mail.push({
      t: at(1, 8, 50),
      to: OPS,
      subject: 'Orders without a confirmation mail',
      body: `Since 07:00 ${missing.length} web orders were booked but the customer got no confirmation, for example ${missing.slice(0, 3).join(', ')}. The orders are in the database, so the warehouse ships them, but customers call us to ask whether the order went through. Can you find out what happens?`,
      source: 'Brightmart Customer Service',
    })
    return until(later, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of customer service', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      ...sawLogs(WRITER),
      how: `Runtime Manager, ${WRITER}, Logs. Look for JMS:PUBLISHING with javax.jms.ResourceAllocationException on ${REPLY}, and the line after it. Then ActiveMQ, brightmart-amq, Queues: ${IN} has no pending messages, so the broker considers each of those orders done.`,
    },
    ask(
      'Where the confirmation went',
      `The publish to ${REPLY} failed, on-error-continue logged it, and the listener runs with ackMode AUTO and no transaction. What happened to the order message?`,
      [
        'The broker keeps it until the publish works',
        'The flow ended with success, so AUTO acknowledged the message and the broker deleted it. The row was already inserted and the confirmation was never sent, so the work is half done and nothing will try again',
        'It went to ActiveMQ.DLQ',
        'The relay app took it',
      ],
      1,
      'With AUTO the Mule JMS listener acknowledges the message when the flow ends with success, and on-error-continue makes the flow end with success. The insert and the publish are two separate pieces of work with no transaction around them, so a failure between them leaves the database and the queues out of step.',
    ),
    {
      title: 'Make the listener transacted',
      how: `Runtime Manager, ${WRITER}, Settings, Properties. Set jms.transactionalAction to ALWAYS_BEGIN, so each message is taken inside a local JMS transaction and the publish on the same JMS config joins it. Set onError.publish to propagate: with on-error-continue the flow ends with success and the transaction commits without the reply. Apply Changes.`,
      done: txOk,
    },
    ask(
      'What the rollback does not undo',
      'Now a failed publish rolls the transaction back and the order message comes again. The database insert ran before the publish. What happens on the redelivery?',
      [
        'The rollback removes the row too',
        'The row stays: the database is not part of a local JMS transaction. The redelivery inserts the order a second time unless the flow checks for it',
        'The redelivery skips the insert on its own',
        'Mule waits until the database confirms the rollback',
      ],
      1,
      'A local transaction covers one resource, here the JMS session. The database runs its own work and commits it at once. So every step before the failure runs again on the redelivery. Make it idempotent: look up the order first, use a unique key and an upsert, or keep processed message IDs.',
    ),
    {
      title: 'Make the insert safe to repeat',
      how: 'Set order.skipExisting to true and Apply Changes. The flow then looks up the order ID first and skips the insert when the row exists, so a redelivered order books one row and sends one reply.',
      done: (s) => running(s) && skipsExisting(props(s)),
    },
    {
      title: 'Put a limit on redelivery',
      how: `jms.maxRedelivery is -1, which means no limit. Set it to a small number such as 3 and Apply Changes. It is maxRedelivery of the ActiveMQ factory configuration, which sets maximumRedeliveries of the client RedeliveryPolicy. The ActiveMQ client on its own uses 6, and waits initialRedeliveryDelay, 1000 ms, before a redelivery. Past the limit the client sends a poison ack, and the broker moves the message to the dead letter queue of its policy: ORDERS.DLQ for ORDERS.>, ActiveMQ.DLQ otherwise.`,
      done: limitOk,
    },
    ask(
      'XA or local',
      'A colleague wants an XA transaction instead, so the insert and the publish commit together. What is true?',
      [
        'XA is free, so always use it',
        'XA makes the database and the broker commit together through two phase commit, but every message needs more round trips, locks are held longer, the transaction manager keeps a log, and an in doubt transaction needs recovery. An idempotent flow with a local transaction is often enough',
        'XA only works with Anypoint MQ',
        'XA removes the need for a dead letter queue',
      ],
      1,
      'With transactionType XA, Bitronix as the transaction manager and an XA capable driver and connection factory, Mule commits both resources in two phases. It costs throughput and adds failure cases of its own, such as a coordinator that stops between prepare and commit. Many teams use a local JMS transaction, idempotent writes and a dead letter queue instead.',
    ),
    {
      title: 'Send a bad order and watch it',
      how: `ActiveMQ, brightmart-amq, Send. Destination ${IN}, a queue, and a body that is not valid JSON, such as ${BAD}. Keep Persistent Delivery checked: by default ActiveMQ Classic moves only persistent messages to a dead letter queue and drops a non persistent one. Send it, then move the clock 5 minutes. The log shows the transaction rolled back a few times and the message moved to ORDERS.DLQ, and every new order has one row and one confirmation.`,
      done: (s) => {
        const a = writer(s)
        if (!txOk(s) || !limitOk(s) || !skipsExisting(props(s)) || s.clock < a.updated + 5 * MINUTE) return false
        if (!dlq(s).some((m) => m.origin === `queue://${IN}` && m.ts > a.updated && !isJson(m.body))) return false
        const sent = (app(s, FEED).store.sent ?? []).filter((x) => x.t > a.updated && x.t <= s.clock - 2 * MINUTE)
        const replied = app(s, RELAY).store.replied ?? {}
        const rows = a.store.rows ?? {}
        return sent.length > 5 && sent.every((x) => rows[x.id] === 1 && replied[x.id] === 1)
      },
    },
  ],
  why: 'A JMS listener with AUTO acknowledges when the flow ends with success, so an error that on-error-continue swallows still deletes the message. Work that spans a database and a queue needs a plan for the moment between them. A transacted listener (ALWAYS_BEGIN) makes the JMS side all or nothing: the publish joins the transaction, an error rolls back and the broker redelivers. The database is outside a local transaction, so make the writes idempotent. A redelivery limit (maxRedelivery on the ActiveMQ client, max-delivery-attempts on Artemis) sends a message that can never work to a dead letter queue instead of blocking the queue. XA joins both resources at a real cost. In the lab the database is part of the app store and ORDERS.REPLY refuses every fourth send, a stand in for its memory limit at peaks.',
  docs: 'https://docs.mulesoft.com/jms-connector/latest/',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${WRITER}`)
    s = change(s, WRITER, { props: { ...writer(s).props, 'jms.transactionalAction': 'ALWAYS_BEGIN', 'onError.publish': 'propagate', 'order.skipExisting': 'true', 'jms.maxRedelivery': '3' } })
    s = sendTo(s, AMQ, { dest: IN, type: 'queue', body: BAD }).state
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 7: 1 },
}

export const LABS = [lab]
