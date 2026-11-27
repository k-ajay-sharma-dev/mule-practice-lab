// The guided lab setup-activemq. See platform-labs.js for the shape of a lab.
//
// A new integration from nothing on ActiveMQ Classic: the queue, a policyEntry with its own dead letter queue, a user
// and an authorizationEntry for that one queue, a restart so the broker reads activemq.xml, then the app with the
// failover URL, a prefetch, the redelivery policy and a transacted listener. Test refunds flow, and a bad one lands in
// the dead letter queue after its redeliveries. The lab builds its own state: the brightmart-amq pair and one jar.
import { addMonAlert, advance, at, deployApp, finishDeploys, MINUTE, mark, newPlatform } from '../platform.js'
import { app, ask, call, called, until } from '../platform-kit.js'
import { addAuthEntry, addPolicyEntry, addUser, allowed, AMQ, AMQ_FAILOVER, brokerOf, classicBroker, CLASSIC_DEFAULTS, createDestination, dlqNameOf, parseUrl, restartNode, sendTo } from '../platform-jms.js'
import { APP, GROUP, prefetchOf, QUEUE, redeliveriesOf, transacted, USER } from './setup-activemq.pkg.js'

const ALERTS = 'finance-integration@brightmart.example'
const OPS = 'ops@brightmart.example'
const DLQ = `DLQ.${QUEUE}`
const REDELIVERIES = 3
const PASSWORD = 'Refunds-Lab-2026'
const URL = `${AMQ_FAILOVER}&jms.prefetchPolicy.queuePrefetch=1`

const broker = (s) => brokerOf(s, AMQ)
const running = (s) => app(s, APP)?.status === 'Running'
const props = (s) => ({ ...app(s, APP)?.props, ...app(s, APP)?.secrets })
const queueOk = (s) => Boolean(broker(s)?.queues[QUEUE])
// applied: the broker runs with it, not only saved for the next restart
const dlqOk = (s) => {
  const b = broker(s)
  return Boolean(b) && !b.pending?.policies && dlqNameOf(b, QUEUE) !== CLASSIC_DEFAULTS.deadLetterQueue
}
// the user may read and write this one queue: no admins group, no wildcard entry, no admin right
const userOk = (s) => {
  const b = broker(s)
  const u = b?.users[USER]
  if (!u || b.pending?.users || b.pending?.auth) return false
  const mine = b.auth.filter((e) => [e.read, e.write, e.admin].some((x) => String(x ?? '').split(',').map((g) => g.trim()).some((g) => u.groups.includes(g))))
  return !u.groups.includes('admins') && mine.length > 0 && mine.every((e) => e.type === 'queue' && e.match === QUEUE) && allowed(b, USER, 'queue', QUEUE, 'read') && allowed(b, USER, 'queue', QUEUE, 'write') && !allowed(b, USER, 'queue', QUEUE, 'admin')
}
const failover = (p) => {
  const u = parseUrl(p['jms.url'])
  const hosts = u.hosts.map((h) => h.host)
  return u.failover && hosts.includes('amq1.brightmart.lab') && hosts.includes('amq2.brightmart.lab')
}
const deployOk = (s) => {
  const p = props(s)
  const a = app(s, APP)
  return running(s) && p['jms.queue'] === QUEUE && p['jms.user'] === USER && Boolean(a.secrets?.['jms.password']) && !String(a.props?.['jms.password'] ?? '').trim() && a.secrets['jms.password'] === broker(s)?.users[USER]?.password && failover(p) && prefetchOf(p) >= 1 && prefetchOf(p) <= 10 && redeliveriesOf(p) === REDELIVERIES && transacted(p)
}
const tested = (s) => app(s, APP)?.store?.test ?? []
const flowOk = (s) => {
  const done = new Set(app(s, APP)?.store?.done ?? [])
  return deployOk(s) && tested(s).length >= 20 && tested(s).every((id) => done.has(id)) && (broker(s)?.queues[QUEUE]?.messages.length ?? 1) === 0
}
const deadOk = (s) => flowOk(s) && Boolean(s.seen[`jms-dest:${dlqNameOf(broker(s), QUEUE)}`]) && (broker(s).queues[dlqNameOf(broker(s), QUEUE)]?.messages ?? []).some((m) => m.origin === `queue://${QUEUE}` && m.redeliveries === REDELIVERIES + 1)
const alertOk = (s) => s.monAlerts.some((a) => a.enabled && a.name_ === APP && a.metric === 'Message Error Count' && ((a.operator === 'Above' && Number(a.threshold) === 0) || (a.operator === 'Above or equal to' && Number(a.threshold) === 1)) && String(a.recipients ?? '').includes(ALERTS))

const lab = {
  id: 'p-setup-activemq',
  group: 'ActiveMQ',
  title: 'Set up the ActiveMQ integration for refunds to the ledger',
  minutes: 40,
  scenario: `Finance wants every refund of the returns system booked in the ledger through ActiveMQ. The returns system sends one JMS message per refund, and ${APP} books each one. The app is built and its jar is ready in Runtime Manager. The broker ${AMQ} is the ActiveMQ Classic 5.18 pair amq1 and amq2 on a shared store, and it has nothing for this flow: no queue, no user, no dead letter policy. Set it up from the mail of finance, prove that refunds flow and survive a bad message, and make sure finance hears about failures.`,
  start() {
    const clock = at(1, 13, 50)
    const s = newPlatform({
      clock,
      jars: [APP],
      jms: { created: clock, brokers: { [AMQ]: classicBroker(clock) } },
      mail: [
        {
          t: at(1, 13, 45),
          to: OPS,
          subject: 'Refund ledger feed on ActiveMQ',
          body: `Please set up the refund feed on ${AMQ} in Sandbox.\n\nQueue ${QUEUE}. Create it up front: apps must not create queues on this broker.\n\nA refund that fails is tried again ${REDELIVERIES} times, ${REDELIVERIES + 1} deliveries in all, and is then parked in a dead letter queue of its own, ${DLQ}. Not in ActiveMQ.DLQ, which every team shares.\n\nThe app connects as a new user ${USER} in a new group ${GROUP}. It may send to and read from ${QUEUE} and nothing else. Choose a password of at least 8 characters and keep it out of plain properties.\n\nThe app must keep working when the broker fails over from amq1 to amq2. A ledger write takes about 2 seconds, so one consumer must not hoard messages. A refund is booked whole or not at all.\n\nAlerts to ${ALERTS}.\n\nTom, Finance Systems`,
          source: 'Brightmart Finance Systems',
        },
      ],
    })
    return until(s, at(1, 14))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the queue, the dead letter queue, the user and group, and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Create the queue ${QUEUE}`,
      how: `ActiveMQ, ${AMQ}, Queues. Queue Name ${QUEUE}, Create. Classic would also make it on the first send, but only for a user with admin rights, and this broker gives apps none.`,
      done: queueOk,
    },
    {
      title: 'Give the queue its own dead letter queue',
      how: `Broker config (lab page), Add a policyEntry: queue ${QUEUE}, Dead letter strategy individualDeadLetterStrategy, queuePrefix DLQ. so the dead letter queue is ${DLQ}. Add policyEntry. Classic reads activemq.xml when it starts, so the change waits for a restart. Do the next step first and restart once for both.`,
      done: dlqOk,
    },
    {
      title: `Add the user ${USER} with rights on one queue`,
      how: `Users (lab page). Add user: User name ${USER}, a password of at least 8 characters, Groups ${GROUP}. Add entry: Type queue, Destination ${QUEUE}, read ${GROUP}, write ${GROUP}, admin empty. Now Home, Nodes, Restart on amq1, the master. amq2 takes the lock on the shared store at once and starts with the new activemq.xml, policyEntry, user and entry included. The step is met only when the group has read and write on ${QUEUE} and nothing else: no admins group, no wildcard and no admin right.`,
      done: userOk,
    },
    ask(
      'Rights on the dead letter queue',
      `Does ${USER} need read or write on ${DLQ}?`,
      [
        'Yes, write, because the app moves the bad message there',
        'No. After the last redelivery the client sends a poison ack and the broker itself moves the message to the dead letter queue. The app never touches it. People who replay from the DLQ use their own user or the web console',
        'Yes, admin, or the dead letter queue cannot be made',
        'Yes, read, so the app can retry the messages there',
      ],
      1,
      'Keep the app to the destinations it uses. The broker makes the dead letter queue on its own when the first message arrives. On a real broker every user also needs read, write and admin on ActiveMQ.Advisory.>, the topics the client uses to learn about destinations; most activemq.xml files give that to all groups. The lab allows the advisory topics for everyone.',
    ),
    {
      title: `Deploy ${APP}`,
      how: `Runtime Manager, Deploy application. Name ${APP}, Application File ${APP}-1.0.0-mule-application.jar. Properties: jms.url=${URL}, jms.user=${USER}, jms.queue=${QUEUE}, jms.maxRedelivery=${REDELIVERIES}, jms.transactionalAction=ALWAYS_BEGIN, and jms.password as a protected property with the password you gave ${USER}. Deploy, wait for Running, and read the Logs.`,
      done: (s) => deployOk(s) && Boolean(s.seen[`logs:${APP}`]),
    },
    ask(
      'What the transaction gives',
      `The listener runs with transactionalAction ALWAYS_BEGIN. What does that give the refund flow, and what does it not?`,
      [
        'Exactly once booking in the ledger, with nothing else to do',
        'The message is acknowledged only when the flow commits. An error rolls back, the message comes again with JMSRedelivered true, and after the redeliveries it goes to the dead letter queue. The ledger write is not in the JMS transaction, so book by refundId in a way that ignores a refund booked already',
        'It makes the broker keep the message in memory',
        'It turns the failover transport on',
      ],
      1,
      'A local JMS transaction covers the JMS session only: the receive, and any publish on the same config. A database write beside it can succeed while the commit fails, so the message comes again. XA would join both, at a cost, so most teams make the write idempotent instead. Without a transaction, AUTO also acknowledges after the flow ends well; the transaction matters most when the flow publishes on the same connection.',
    ),
    {
      title: 'Test the connection',
      how: `API client: GET /health on ${APP}. It answers 200 and names the broker node it reached through the failover transport. Connections on ${AMQ} shows the connection of ${USER}.`,
      done: (s) => deployOk(s) && called(s, APP, 200, 'GET', /^\/health$/),
    },
    {
      title: 'Send test refunds',
      how: `API client: POST /refunds/test?count=20 on ${APP}. Move the clock 2 minutes. The log books 20 refunds, each in its own transaction, and Queues shows ${QUEUE} with 0 pending and 20 enqueued and dequeued.`,
      done: flowOk,
    },
    {
      title: 'Send a bad refund',
      how: `ActiveMQ, Send. Destination ${QUEUE}, Queue or Topic Queue, keep Persistent Delivery checked, Message body { "refundId": "RF-1", "amount": (cut off). Send, and move the clock a minute. The log shows MULE:EXPRESSION and the message going to ${DLQ} after ${REDELIVERIES + 1} deliveries. Queues, ${DLQ}, Browse: open it and read dlqDeliveryFailureCause.`,
      done: deadOk,
    },
    {
      title: 'Alert on failed refunds',
      how: `Monitoring, Alerts, Create Alert: Application ${APP}, Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: alertOk,
    },
  ],
  why: `An ActiveMQ Classic integration from nothing: create the queue up front, give it a policyEntry with an individualDeadLetterStrategy so its failures do not mix in ActiveMQ.DLQ, add a user and an authorizationEntry with read and write on that one queue, and restart the broker because Classic reads activemq.xml when it starts. In the app use the failover: URL with both nodes so a master change does not stop it, a small prefetch for slow work, the client redelivery policy for the number of tries, and a transacted listener so a message is acknowledged only on commit. Keep the password in a protected property. Then prove it: a health check, test messages that drain the queue, a bad message that reaches the dead letter queue after its redeliveries, and an alert. Persistent messages only: Classic drops a non persistent message instead of sending it to the DLQ. In the lab the redeliveries come at once, without the redelivery delay.`,
  docs: 'https://docs.mulesoft.com/jms-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createDestination(s, AMQ, 'queue', QUEUE).state
    s = addPolicyEntry(s, AMQ, { match: QUEUE, strategy: 'individual', queuePrefix: 'DLQ.' }).state
    s = addUser(s, AMQ, { name: USER, password: PASSWORD, groups: GROUP }).state
    s = addAuthEntry(s, AMQ, { type: 'queue', match: QUEUE, read: GROUP, write: GROUP, admin: '' }).state
    s = restartNode(s, AMQ, 'amq1', 1).state
    s = finishDeploys(deployApp(s, { name: APP, pkg: APP, jar: `${APP}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props: { 'jms.url': URL, 'jms.user': USER, 'jms.queue': QUEUE, 'jms.maxRedelivery': String(REDELIVERIES), 'jms.transactionalAction': 'ALWAYS_BEGIN' }, secrets: { 'jms.password': PASSWORD } }).state)
    s = mark(s, `logs:${APP}`)
    s = call(s, APP, null, '/health', 'GET').state
    s = call(s, APP, null, '/refunds/test?count=20', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = sendTo(s, AMQ, { dest: QUEUE, type: 'queue', body: '{ "refundId": "RF-1", "amount": ', persistent: true }).state
    s = mark(advance(s, MINUTE), `jms-dest:${DLQ}`)
    return addMonAlert(s, { title: 'Refund failed', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
  },
  answers: { 4: 1, 6: 1 },
}

export const LABS = [lab]
