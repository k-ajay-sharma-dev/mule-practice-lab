// The guided lab setup-anypoint-mq. See platform-labs.js for the shape of a lab.
//
// A new integration from nothing: a dead letter queue and its queue, a client app, the app deployed from its jar with
// the client ID and secret as protected properties, then test requests, a bad request that reaches the DLQ, and an
// alert. The runtime checks the client credentials (mqAuthError in platform.js), and the steps compare them with the client app too.
import { addMonAlert, advance, at, deployApp, finishDeploys, MINUTE, mark, newPlatform, sendMessage } from '../platform.js'
import { app, ask, call, called, until } from '../platform-kit.js'
import { addClientApp, clientApps, createQueue, DEFAULT_LOCK_TTL, DEFAULT_TTL, isFifo } from '../platform-mq.js'
import { APP, CLIENT, DLQ, MQ_URL, QUEUE } from './setup-anypoint-mq.pkg.js'

const ALERTS = 'returns-support@brightmart.example'
const OPS = 'ops@brightmart.example'
const ATTEMPTS = 3

const queue = (s, name) => s.queues.find((q) => q.name === name)
const running = (s) => app(s, APP)?.status === 'Running'
const client = (s) => (s.mqClients ?? []).some((c) => c.env === 'Sandbox' && c.name === CLIENT) && clientApps(s, 'Sandbox').find((c) => c.name === CLIENT)
const queuesOk = (s) => {
  const q = queue(s, QUEUE)
  const d = queue(s, DLQ)
  return Boolean(q && d) && !isFifo(q) && !isFifo(d) && q.dlq === DLQ && q.attempts === ATTEMPTS
}
// the client ID and secret are the ones of the new client app, both protected, and not the platform credentials
const credsOk = (s) => {
  const a = app(s, APP)
  const c = client(s)
  if (!a || !c) return false
  const plain = ['mq.clientId', 'mq.clientSecret'].some((k) => String(a.props?.[k] ?? '').trim())
  return !plain && a.secrets?.['mq.clientId'] === c.clientId && a.secrets?.['mq.clientSecret'] === c.clientSecret && c.clientId !== s.creds.Sandbox.id
}
const deployOk = (s) => running(s) && credsOk(s) && app(s, APP).props?.['mq.url'] === MQ_URL && app(s, APP).props?.['mq.queue'] === QUEUE
const tested = (s) => app(s, APP)?.store?.test ?? []
const flowOk = (s) => {
  const done = new Set(app(s, APP)?.store?.done ?? [])
  return deployOk(s) && queuesOk(s) && tested(s).length >= 10 && tested(s).every((id) => done.has(id)) && queue(s, QUEUE).messages.length === 0
}
const deadOk = (s) => flowOk(s) && Boolean(s.seen[`mq:${DLQ}`]) && queue(s, DLQ).messages.some((m) => m.from === QUEUE && m.deliveries >= ATTEMPTS)
const alertOk = (s) => s.monAlerts.some((a) => a.enabled && a.name_ === APP && a.metric === 'Message Error Count' && ((a.operator === 'Above' && Number(a.threshold) === 0) || (a.operator === 'Above or equal to' && Number(a.threshold) === 1)) && String(a.recipients ?? '').includes(ALERTS))

const lab = {
  id: 'p-setup-anypoint-mq',
  group: 'Databases and queues',
  title: 'Set up the Anypoint MQ integration for return refunds',
  minutes: 30,
  scenario: `Brightmart starts paying refunds for returned goods within the hour. The returns portal hands each return request to ${APP}, which puts it on an Anypoint MQ queue, and the Subscriber of the same app books the refund. The app is built and its jar is ready in Runtime Manager. Anypoint MQ has nothing for it yet: no queue, no dead letter queue and no client app. Set it up from the mail, prove that refunds flow and that a bad request is kept, and make sure the returns team hears about failures.`,
  start() {
    const s = newPlatform({
      clock: at(1, 9, 20),
      jars: [APP],
      mail: [
        {
          t: at(1, 9, 10),
          to: OPS,
          subject: 'Refunds through Anypoint MQ: what we need',
          body: `Hello, please set up the refund queue in Sandbox (US East).\n\nQueue ${QUEUE}. A refund that fails must be tried ${ATTEMPTS} times in all and then kept in ${DLQ} for us to look at, never dropped. Each refund is on its own: the order between two returns does not matter, and booking the same return twice is caught by the returnId.\n\nThe app needs its own client app in Anypoint MQ, named ${CLIENT}. Broker URL ${MQ_URL}. Treat the client ID and secret as secrets.\n\nAlerts for failed refunds to ${ALERTS}.\n\nMarta, Returns team`,
          source: 'Brightmart Returns',
        },
      ],
    })
    return until(s, at(1, 9, 30))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the queue, the number of tries, the client app and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the dead letter queue and the queue',
      how: `MQ, Destinations, + Add, Queue. First ${DLQ}, Type Standard queue, Create Queue. Then + Add, Queue again for ${QUEUE}, Standard queue: check Assign a Dead Letter Queue, Dead Letter Queue Name ${DLQ}, Delivery attempts before reroute ${ATTEMPTS}. Keep the Message TTL and the Default Acknowledgment Timeout. Create Queue.`,
      done: queuesOk,
    },
    ask(
      'Standard or FIFO',
      `Should ${QUEUE} be a FIFO queue?`,
      [
        'Yes, a FIFO queue is always safer',
        'No. Each refund stands on its own and a second booking is caught by the returnId, so a standard queue fits: it has the higher throughput, and at least once delivery is fine with an idempotent consumer. FIFO is for messages whose order inside a group matters, such as the status changes of one order',
        'Yes, because only a FIFO queue can have a dead letter queue',
        'No, because a FIFO queue cannot be used from Mule',
      ],
      1,
      'A FIFO queue keeps the order inside a message group and delivers exactly once, at up to 300 transactions a second, and its dead letter queue must be FIFO as well. The type cannot change after the queue is made, so decide by the data: independent messages with an idempotent consumer go on a standard queue.',
    ),
    {
      title: `Create the client app ${CLIENT}`,
      how: `MQ, Client Apps, + Add. App Name ${CLIENT}, Save. It gets a Client ID and a Client Secret for Sandbox. Copy the Client ID, and Show the Client Secret to copy it.`,
      done: (s) => Boolean(client(s)) && Boolean(s.seen['mq-clients']),
    },
    ask(
      'Its own client app',
      'A colleague offers the client ID and secret of the connected app with Organization Administrator rights, which can reach Anypoint MQ too. Why make a client app of its own?',
      [
        'There is no difference, any credentials work',
        'Least privilege and a small blast radius: a client app only sends and receives in its environment and can manage nothing, and its secret can be regenerated without touching other apps. Admin credentials in an app property could change or delete every queue of the organization',
        'A connected app cannot be used in Sandbox',
        'Client apps are faster',
      ],
      1,
      'Anypoint MQ client apps are per environment and reach the destinations of that environment, so give each app its own one in each environment. The secret goes in a protected property or a vault, and a rotation means Regenerate Secret and a redeploy of that one app.',
    ),
    {
      title: `Deploy ${APP}`,
      how: `Runtime Manager, Deploy application. Name ${APP}, Application File ${APP}-1.0.0-mule-application.jar. Properties: mq.url=${MQ_URL}, mq.queue=${QUEUE}, and mq.clientId and mq.clientSecret from ${CLIENT}, both as protected properties. Deploy, wait for Running, and read the Logs.`,
      done: (s) => deployOk(s) && Boolean(s.seen[`logs:${APP}`]),
    },
    {
      title: 'Test the connection',
      how: `API client: GET /health on ${APP} answers 200 with the broker URL and the queue. MQ, Destinations, ${QUEUE}: Used by now names ${APP}.`,
      done: (s) => deployOk(s) && called(s, APP, 200, 'GET', /^\/health$/),
    },
    {
      title: 'Send test refunds',
      how: `API client: POST /returns/test?count=10 on ${APP}. Move the clock a minute. The log books 10 refunds and acknowledges each message, ${QUEUE} shows 0 messages ready and 0 in flight, and MQ, Usage counts them as Acknowledged.`,
      done: flowOk,
    },
    {
      title: 'Send a bad request',
      how: `MQ, Destinations, ${QUEUE}, Message Sender. Send a payload that is not a return, such as { "returnId": "R-1", "amount": . The Subscriber fails with MULE:EXPRESSION on each of the ${ATTEMPTS} deliveries, and then the message moves to ${DLQ}. Open ${DLQ}, Message Browser, Get Messages, and find it there.`,
      done: deadOk,
    },
    {
      title: 'Alert on failed refunds',
      how: `Monitoring, Alerts, Create Alert: Application ${APP}, Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: alertOk,
    },
  ],
  why: `An Anypoint MQ integration from nothing: create the dead letter queue first, then the queue with the DLQ assigned and Delivery attempts before reroute set to the number of tries the business wants. Choose standard or FIFO by the data, since the type cannot change. Give the app its own client app per environment and keep the client ID and secret in protected properties. Then prove it: a health check, test messages that are acknowledged and counted, a bad message that lands in the DLQ after its deliveries instead of looping or being lost, and an alert on errors. Wrong client credentials fail at the token call with 401 invalid_client, so the app neither sends nor receives.`,
  docs: 'https://docs.mulesoft.com/mq/mq-queues',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createQueue(s, { name: DLQ, fifo: false, ttl: DEFAULT_TTL, lockTtl: DEFAULT_LOCK_TTL })
    s = createQueue(s, { name: QUEUE, fifo: false, ttl: DEFAULT_TTL, lockTtl: DEFAULT_LOCK_TTL, dlq: DLQ, attempts: ATTEMPTS })
    s = mark(addClientApp(s, 'Sandbox', CLIENT), 'mq-clients')
    const c = clientApps(s, 'Sandbox').find((x) => x.name === CLIENT)
    s = finishDeploys(deployApp(s, { name: APP, pkg: APP, jar: `${APP}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props: { 'mq.url': MQ_URL, 'mq.queue': QUEUE }, secrets: { 'mq.clientId': c.clientId, 'mq.clientSecret': c.clientSecret } }).state)
    s = mark(s, `logs:${APP}`)
    s = call(s, APP, null, '/health', 'GET').state
    s = call(s, APP, null, '/returns/test?count=10', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = mark(sendMessage(s, QUEUE, '{ "returnId": "R-1", "amount": '), `mq:${DLQ}`)
    return addMonAlert(s, { title: 'Refund failed', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
  },
  answers: { 2: 1, 4: 1 },
}

export const LABS = [lab]
