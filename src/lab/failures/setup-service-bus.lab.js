// The guided lab setup-service-bus. See platform-labs.js for the shape of a lab.
//
// A new integration from nothing on Azure Service Bus: a queue with a lock duration above the processing time, a max
// delivery count and duplicate detection, a Send policy and a Listen policy on that queue, the two connection strings
// as protected properties, then test pickups sent twice, a bad message that is dead lettered, and an alert.
import { addMonAlert, advance, at, deployApp, finishDeploys, MINUTE, mark, newPlatform } from '../platform.js'
import { app, ask, call, called, until } from '../platform-kit.js'
import { addEntityPolicy, createQueue, entityConnectionString, entityPoliciesOf, explorerSend, namespaceOf, newNamespace, SB_TIME } from '../platform-servicebus.js'
import { APP, LISTEN_POLICY, QUEUE, SEND_POLICY, WORK_MS } from './setup-service-bus.pkg.js'

const NS = 'brightmart-bus'
const ALERTS = 'stores-oncall@brightmart.example'
const OPS = 'ops@brightmart.example'
const HOUR = 60 * MINUTE
const MAX_DELIVERY = 5

const queue = (s) => namespaceOf(s, NS)?.queues?.[QUEUE]
const running = (s) => app(s, APP)?.status === 'Running'
const queueOk = (s) => {
  const q = queue(s)
  return Boolean(q) && q.lockMs > WORK_MS && q.lockMs <= 5 * MINUTE && q.maxDelivery === MAX_DELIVERY && q.dupDetect && q.dupWindowMs >= HOUR && !q.sessions
}
const policy = (s, name) => entityPoliciesOf(queue(s)).find((p) => p.name === name)
const policiesOk = (s) => policy(s, SEND_POLICY)?.claims.join() === 'Send' && policy(s, LISTEN_POLICY)?.claims.join() === 'Listen'
const stringOf = (s, name) => ['primary', 'secondary'].map((w) => entityConnectionString(s, NS, QUEUE, name, w))
const deployOk = (s) => {
  const a = app(s, APP)
  if (!running(s) || a.props?.['sb.queue'] !== QUEUE) return false
  const plain = ['sb.sendConnectionString', 'sb.listenConnectionString'].some((k) => String(a.props?.[k] ?? '').trim())
  return !plain && policiesOk(s) && stringOf(s, SEND_POLICY).includes(a.secrets?.['sb.sendConnectionString']) && stringOf(s, LISTEN_POLICY).includes(a.secrets?.['sb.listenConnectionString'])
}
const flowOk = (s) => {
  const st = app(s, APP)?.store ?? {}
  const test = st.test ?? []
  return deployOk(s) && queueOk(s) && test.length >= 10 && (st.duplicates ?? 0) >= test.length && test.every((id) => st.notified?.[id] === 1) && queue(s).messages.length === 0
}
const deadOk = (s) => flowOk(s) && Boolean(s.seen[`sb-dlq:${QUEUE}`]) && queue(s).dlq.some((m) => m.deadLetterReason === 'MaxDeliveryCountExceeded' && m.deliveryCount === MAX_DELIVERY)
const alertOk = (s) => s.monAlerts.some((a) => a.enabled && a.name_ === APP && a.metric === 'Message Error Count' && ((a.operator === 'Above' && Number(a.threshold) === 0) || (a.operator === 'Above or equal to' && Number(a.threshold) === 1)) && String(a.recipients ?? '').includes(ALERTS))

const lab = {
  id: 'p-setup-service-bus',
  group: 'Azure Service Bus',
  title: 'Set up the Service Bus integration for click and collect notices',
  minutes: 35,
  scenario: `Brightmart stores start click and collect. When an order is ready at the store, the order API calls ${APP}, which puts a notice on an Azure Service Bus queue, and the listener of the same app sends the customer an SMS and marks the pickup in the store system. The app is built and its jar is ready in Runtime Manager. The namespace ${NS} exists with its RootManageSharedAccessKey and nothing else. Set it up from the mail of the stores team, prove that each customer gets exactly one SMS and that a bad message is kept, and make sure the stores hear about failures.`,
  start() {
    const clock = at(2, 10, 20)
    const s = newPlatform({
      clock,
      jars: [APP],
      serviceBus: { created: clock, namespaces: { [NS]: newNamespace(NS, clock) } },
      mail: [
        {
          t: at(2, 10, 15),
          to: OPS,
          subject: 'Click and collect notices on Service Bus',
          body: `Please set up the pickup notices on ${NS} in Sandbox.\n\nQueue ${QUEUE}, no sessions. Sending the SMS and updating the store system takes up to 40 seconds per notice. A notice that keeps failing is tried ${MAX_DELIVERY} times in all and then kept for us to look at. The order API may send the same notice again within the hour, and a customer must get one SMS per pickup.\n\nThe sending flow gets a key that can only send, the listener a key that can only listen, both on this queue only. Name them ${SEND_POLICY} and ${LISTEN_POLICY}. Never the RootManageSharedAccessKey, and no key in a plain property.\n\nAlerts to ${ALERTS}.\n\nLena, Brightmart Stores`,
          source: 'Brightmart Stores',
        },
      ],
    })
    return until(s, at(2, 10, 30))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the processing time, the number of tries, the resend window, the policy names and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Create the queue ${QUEUE}`,
      how: `Service Bus, ${NS}, Queues, + Queue. Name ${QUEUE}. Max delivery count ${MAX_DELIVERY}. Lock duration above the 40 seconds of work, for example 1 minute (at most 5). Check Enable duplicate detection with a window of 1 hour. Leave Enable sessions off. Create. Sessions and duplicate detection cannot be changed later.`,
      done: queueOk,
    },
    ask(
      'Lock duration and processing time',
      'The default lock duration is 30 seconds and the work takes 40. What would happen with the default?',
      [
        'Nothing, the lock only matters for sessions',
        'The lock ends before the flow completes the message. The complete fails with MessageLockLost, the message comes again to a receiver, the customer gets a second SMS, and after the max delivery count a notice that worked lands in the dead letter queue',
        'Service Bus waits for the flow whatever the lock duration',
        'The message is deleted when the lock ends',
      ],
      1,
      'In PeekLock the receiver has the message only while the lock holds. Set the lock duration above the longest processing time, up to 5 minutes, or renew the lock while the flow runs. Keep it short enough that a crashed receiver gives the message back soon.',
    ),
    {
      title: 'Add a Send policy and a Listen policy on the queue',
      how: `Open ${QUEUE}, Settings, Shared access policies, Add. Policy name ${SEND_POLICY} with only Send. Create. Add again: ${LISTEN_POLICY} with only Listen. Open each one to copy its Primary connection string: it ends with EntityPath=${QUEUE} and works for this queue only.`,
      done: policiesOk,
    },
    {
      title: `Deploy ${APP}`,
      how: `Runtime Manager, Deploy application. Name ${APP}, Application File ${APP}-1.0.0-mule-application.jar. Properties: sb.queue=${QUEUE}, and as protected properties sb.sendConnectionString (the string of ${SEND_POLICY}) and sb.listenConnectionString (the string of ${LISTEN_POLICY}). Deploy, wait for Running, and read the Logs.`,
      done: (s) => deployOk(s) && Boolean(s.seen[`logs:${APP}`]),
    },
    {
      title: 'Test the connection',
      how: `API client: GET /health on ${APP} answers 200: the sender link opens with the Send key and the receiver link with the Listen key. With the keys swapped it answers 503 with Unauthorized access and the claim it misses.`,
      done: (s) => deployOk(s) && called(s, APP, 200, 'GET', /^\/health$/),
    },
    {
      title: 'Send the test pickups twice',
      how: `API client: POST /pickups/test?count=10 on ${APP}, then the same call again. The second answer says 10 were dropped as duplicates. Move the clock 2 minutes. The log sends 10 SMS, one per pickup, and ${QUEUE} shows 0 active messages.`,
      done: flowOk,
    },
    ask(
      'What duplicate detection covers',
      'Duplicate detection drops the second send of each MessageId. Does that make the listener safe from sending a second SMS?',
      [
        'Yes, Service Bus delivers each message exactly once now',
        'No. It works on the send side, inside the window, by MessageId. A message that is delivered again after a lost lock or a crash before complete is the same message, not a new send, so the listener must still check the pickup ID before it sends an SMS',
        'Yes, as long as the window is 7 days',
        'No, duplicate detection only works for sessions',
      ],
      1,
      'Duplicate detection keeps the MessageIds of the window and drops a repeat at send time. Delivery is still at least once, so the receiver stays idempotent. Set the MessageId from a business key, here the pickup ID, or the detection has nothing to compare.',
    ),
    {
      title: 'Send a bad message',
      how: `Open ${QUEUE}, Service Bus Explorer, Send messages. Body { "pickupId": "PU-1", (cut off). Send. Move the clock a minute. The listener abandons it on each delivery, and after ${MAX_DELIVERY} it moves to the dead letter queue. Open the Dead-letter tab and Peek: DeadLetterReason is MaxDeliveryCountExceeded.`,
      done: deadOk,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert: Application ${APP}, Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: alertOk,
    },
  ],
  why: `An Azure Service Bus integration from nothing: create the queue with a lock duration above the longest processing time, a max delivery count for the number of tries, and duplicate detection with a window that covers the resends, because sessions and duplicate detection are set at create. Give the sender a policy with Send and the listener one with Listen, on the queue itself so the keys reach nothing else, and never use RootManageSharedAccessKey. Keep the connection strings in protected properties. Then prove it: a health check that opens both links, test messages where repeats are dropped and each one is handled once, a bad message that is dead lettered with MaxDeliveryCountExceeded, and an alert. In the lab the listener takes the messages once a lab minute.`,
  docs: 'https://docs.mulesoft.com/azure-service-bus-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createQueue(s, NS, { name: QUEUE, lockMs: MINUTE, maxDelivery: MAX_DELIVERY, ttlMs: 14 * SB_TIME.DAY, dupDetect: true, dupWindowMs: HOUR, maxSizeMb: 1024, sessions: false, dlOnExpire: false })
    s = addEntityPolicy(s, NS, QUEUE, SEND_POLICY, ['Send'])
    s = addEntityPolicy(s, NS, QUEUE, LISTEN_POLICY, ['Listen'])
    const secrets = { 'sb.sendConnectionString': entityConnectionString(s, NS, QUEUE, SEND_POLICY), 'sb.listenConnectionString': entityConnectionString(s, NS, QUEUE, LISTEN_POLICY) }
    s = finishDeploys(deployApp(s, { name: APP, pkg: APP, jar: `${APP}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props: { 'sb.queue': QUEUE }, secrets }).state)
    s = mark(s, `logs:${APP}`)
    s = call(s, APP, null, '/health', 'GET').state
    s = call(s, APP, null, '/pickups/test?count=10', 'POST').state
    s = call(s, APP, null, '/pickups/test?count=10', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = explorerSend(s, NS, QUEUE, { body: '{ "pickupId": "PU-1", ', contentType: 'application/json' }).state
    s = mark(advance(s, MINUTE), `sb-dlq:${QUEUE}`)
    return addMonAlert(s, { title: 'Pickup notice failed', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
  },
  answers: { 2: 1, 7: 1 },
}

export const LABS = [lab]
