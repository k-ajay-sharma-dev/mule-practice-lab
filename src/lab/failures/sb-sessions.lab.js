// The guided lab sb-sessions. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { connectionString, createQueue, defaultServiceBus, NAMESPACE, namespaceOf, resolve } from '../platform-servicebus.js'
import { OLD_QUEUE, postedOk, SENDER, sessionIdOf, sessionReceiver, WORKER } from './sb-sessions.pkg.js'

const NEW_QUEUE = 'invoice-lines-ordered'
const props = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, name) => app(s, name)?.status === 'Running'
const queueOf = (s, name) => {
  const ns = namespaceOf(s, NAMESPACE)
  const r = ns && resolve(ns, name)
  return r?.kind === 'queue' ? r.entity : null
}
const senderQueue = (s) => queueOf(s, props(s, SENDER)['sb.queue'])
const senderOk = (s) => running(s, SENDER) && Boolean(senderQueue(s)?.sessions) && sessionIdOf(props(s, SENDER), 'INV-1') === 'INV-1'
const workerOk = (s) => senderOk(s) && running(s, WORKER) && sessionReceiver(props(s, WORKER)) && queueOf(s, props(s, WORKER)['sb.queue'])?.name === senderQueue(s).name
const lastChange = (s) => Math.max(app(s, SENDER)?.updated ?? 0, app(s, WORKER)?.updated ?? 0)

const lab = {
  id: 'p-sb-sessions',
  group: 'Azure Service Bus',
  title: 'Invoice totals that come out wrong',
  minutes: 25,
  scenario: `Billing sends each invoice to the Azure Service Bus queue ${OLD_QUEUE} as 3 InvoiceLine messages and one InvoiceClosed message. ${WORKER} runs on 3 replicas. It adds each line to the running total of its invoice in the ERP and posts the invoice when the InvoiceClosed message comes. Finance says most invoice totals this morning are too low. Find out why, and make the lines of one invoice go through one at a time and in order, without giving up the 3 replicas.`,
  start() {
    let s = newPlatform({ clock: at(1, 8, 20), nextId: 10 })
    s.serviceBus = defaultServiceBus(at(1, 6))
    s = createQueue(s, NAMESPACE, { name: OLD_QUEUE, lockMs: 30000, maxDelivery: 10, ttlMs: 14 * 24 * 60 * MINUTE, maxSizeMb: 1024 })
    const secrets = (policy) => ({ 'sb.connectionString': connectionString(s, NAMESPACE, policy) })
    // the worker is listed first, so a batch the sender puts on the queue at an even minute waits there for a minute
    s.apps = [
      newApp(WORKER, { replicas: 3, props: { 'sb.queue': OLD_QUEUE, 'sb.sessions': 'false', 'erp.host': 'erp.harbor.lab' }, secrets: secrets('app-listen'), store: {} }),
      newApp(SENDER, { props: { 'sb.queue': OLD_QUEUE, 'sb.sessionId': '' }, secrets: secrets('app-send'), store: {} }),
    ]
    s = until(s, at(1, 9))
    const wrong = (app(s, WORKER).store.posted ?? []).filter((p) => !postedOk(app(s, SENDER).store.sent, p))
    s.mail.push({
      t: at(1, 8, 52),
      to: OPS,
      subject: 'Invoice totals are too low',
      body: `Since about 08:20 most invoices in the ERP have a total that is lower than the sum of their lines, for example ${wrong.slice(0, 3).map((p) => `${p.invoice} with ${p.total.toFixed(2)}`).join(', ')}. Billing says it sends every line. We hold the invoices until this is fixed. Please look at it this morning.`,
      source: 'Harbor Foods Finance',
    })
    return s
  },
  steps: [
    { title: 'Read the mail of Finance', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      ...sawLogs(WORKER),
      how: `Runtime Manager, Applications, ${WORKER}, Logs. Look at the lines that say how many of the 3 lines were counted, and at which replica handled each message of one invoice.`,
    },
    {
      title: `Look at the messages in ${OLD_QUEUE}`,
      how: `Azure Service Bus, harbor-bus, Queues, ${OLD_QUEUE}. Open Service Bus Explorer and peek from start. The batch that billing sent last waits there. Look at the Session ID column, and at Properties: Requires session.`,
      done: (s) => Boolean(s.seen[`sb-entity:${OLD_QUEUE}`]),
    },
    ask(
      'Why the totals are low',
      `The 3 replicas take messages from ${OLD_QUEUE} at the same time. What makes the totals too low?`,
      [
        'Billing sends some lines twice',
        'Competing consumers: lines of one invoice go to different replicas at once. Two replicas read the same running total and each writes its own sum, so one line is lost, and the closing message can be handled before a line is counted',
        'The lock duration of 30 seconds is too short',
        'The ERP rounds the totals down',
      ],
      1,
      'A plain queue hands each message to whichever receiver asks next. With 3 replicas, messages of one invoice are worked on in parallel, and nothing keeps them in order across receivers. A read, add and write on a shared total then loses updates. One replica would hide the problem and lose the scale out.',
    ),
    ask(
      'Turn on sessions',
      `Sessions keep the messages of one session ID in order and give them to one receiver at a time. Can you turn on Requires session for ${OLD_QUEUE}?`,
      [
        'Yes, in Properties, and the messages that wait get a session ID',
        `No. Sessions, like duplicate detection and partitioning, are set when the queue is created. Create a new queue with sessions enabled, send to it with the invoice ID as the session ID, switch the worker to it, and let ${OLD_QUEUE} drain`,
        'Yes, but only on the Premium tier',
        'No, sessions exist only on topics',
      ],
      1,
      'The portal shows Requires session as fixed on an existing queue. A session queue also refuses a message without a SessionId, and a plain receiver cannot read from it, so the sender and the worker move together to the new queue.',
    ),
    {
      title: 'Create a session queue and send to it with the invoice ID',
      how: `Azure Service Bus, harbor-bus, Queues, + Queue. Name it ${NEW_QUEUE}, check Enable sessions, keep the rest, Create. Then Runtime Manager, ${SENDER}, Settings, Properties: set sb.queue to the new queue and sb.sessionId to #[payload.invoiceId], Apply Changes. A message without a SessionId would be refused by the new queue.`,
      done: senderOk,
    },
    {
      title: 'Make the worker a session receiver on the new queue',
      how: `Runtime Manager, ${WORKER}, Settings, Properties: set sb.queue to the same queue and sb.sessions to true, Apply Changes. Keep 3 replicas. Each replica then accepts one free session, reads its messages in order, and takes the next session when it is done.`,
      done: workerOk,
    },
    ask(
      'Sessions and ActiveMQ message groups',
      'In ActiveMQ you kept the messages of one order together with JMSXGroupID. How does a Service Bus session compare?',
      [
        'They are the same feature with another name and work the same way',
        'Both keep one group in order on one consumer. In ActiveMQ the broker pins the group to a consumer it picks, with no setting on the queue. In Service Bus the queue must require sessions from its creation, and a receiver accepts a session and holds a session lock that times out, so a dead receiver frees the session for another one',
        'Service Bus sessions give exactly once delivery, ActiveMQ groups do not',
        'ActiveMQ message groups only work on topics',
      ],
      1,
      'Both are the competing consumer pattern with ordering per key. ActiveMQ assigns a group to a consumer and keeps it there until that consumer closes or the group is closed with JMSXGroupSeq set to -1. Service Bus receivers pull: AcceptNextSession locks a free session, and the session lock is renewed or expires like a message lock. Anypoint MQ FIFO queues with message groups give the same kind of order per group. Delivery is at least once in all three, so the worker should still be safe to repeat.',
    ),
    {
      title: 'Watch the next invoices',
      how: `Move the clock 6 minutes after your last change. The log shows each replica accepting a session such as INV-4145, every invoice posted with 3 of 3 lines counted, and no total missing a line.`,
      done: (s) => {
        if (!workerOk(s) || s.clock < lastChange(s) + 6 * MINUTE) return false
        const sent = app(s, SENDER).store.sent
        const fresh = (app(s, WORKER).store.posted ?? []).filter((p) => p.t > lastChange(s))
        return fresh.length >= 2 && fresh.every((p) => postedOk(sent, p))
      },
    },
  ],
  why: 'A plain Service Bus queue spreads messages over all receivers, so related messages are worked on in parallel and out of order. When the work depends on order or on a shared running value, use sessions: the sender sets SessionId to the key, here the invoice ID, and a session receiver locks one session at a time and gets its messages in order, while other receivers take other sessions. Sessions must be chosen when the queue or subscription is created, so turning them on means a new entity and a switch of sender and receiver. A session queue refuses messages without a SessionId. ActiveMQ message groups with JMSXGroupID and Anypoint MQ FIFO message groups solve the same problem in their own way. In the lab the ERP totals live in the application store, and each replica takes one message at a time in steps.',
  docs: 'https://learn.microsoft.com/azure/service-bus-messaging/message-sessions',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${WORKER}`), `sb-entity:${OLD_QUEUE}`)
    s = createQueue(s, NAMESPACE, { name: NEW_QUEUE, lockMs: 30000, maxDelivery: 10, ttlMs: 14 * 24 * 60 * MINUTE, maxSizeMb: 1024, sessions: true })
    s = change(s, SENDER, { props: { ...app(s, SENDER).props, 'sb.queue': NEW_QUEUE, 'sb.sessionId': '#[payload.invoiceId]' } })
    s = change(s, WORKER, { props: { ...app(s, WORKER).props, 'sb.queue': NEW_QUEUE, 'sb.sessions': 'true' } })
    return advance(s, 7 * MINUTE)
  },
  answers: { 3: 1, 4: 1, 7: 1 },
}

export const LABS = [lab]
