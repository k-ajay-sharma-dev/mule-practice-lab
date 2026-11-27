// The guided lab mq-dlq-redrive. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform, runNow, viewMessages } from '../platform.js'
import { app, ask, call, change, OPS, sawLogs } from '../platform-kit.js'
import { customerMap, idempotent, MERGED_FROM, MERGED_INTO, outageLogs } from './mq-dlq-redrive.pkg.js'

const NAME = 'invoice-sync-consumer'
const QUEUE = 'invoice-events'
const DLQ = 'invoice-events-dlq'
const HOST = 'billing.harbor.lab'
const COUNT = 300
const CUSTOMERS = ['C-0102', 'C-0233', 'C-0389', 'C-0471', 'C-0518', 'C-0640']
const MERGED_AT = [41, 162, 255] // the invoices of the merged customer
const invoiceOf = (i) => `INV-${70001 + i}`
// billing wrote these, but answered after the timeout while it slowed down before the upgrade
const written = (i) => i % 15 === 7

const consumer = (s) => app(s, NAME)
const props = (s) => ({ ...consumer(s)?.props, ...consumer(s)?.secrets })
const running = (s) => consumer(s)?.status === 'Running'
const billing = (s) => consumer(s)?.store?.billing ?? {}
const queue = (s, name) => s.queues.find((q) => q.name === name)
const redrive = (s) => consumer(s)?.schedules.find((x) => x.flow === 'redrive-dlq-flow')?.last
const healthAt = (s) => (s.lastCalls ?? []).filter((c) => c.app === NAME && c.status === 200 && /^\/health/.test(c.path)).map((c) => c.t)
const checkedFirst = (s) => Boolean(redrive(s)?.ok) && healthAt(s).some((t) => t <= redrive(s).t)
const guarded = (s) => running(s) && idempotent(props(s))
const mapped = (s) => running(s) && customerMap(props(s))[MERGED_FROM] === MERGED_INTO
const created = (s) => Array.from({ length: COUNT }, (_, i) => billing(s)[invoiceOf(i)] ?? 0)

function deadLetters() {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: `m-${i + 1}`,
    body: JSON.stringify({ invoice: invoiceOf(i), customer: MERGED_AT.includes(i) ? MERGED_FROM : CUSTOMERS[i % CUSTOMERS.length], amount: 40 + ((i * 37) % 900) + 0.5 }),
    deliveries: 5,
    t: at(1, 9) + Math.floor((i * 60 * MINUTE) / COUNT),
    from: QUEUE,
  }))
}

const lab = {
  id: 'p-mq-dlq-redrive',
  group: 'Databases and queues',
  title: '300 invoices waiting in the dead letter queue',
  minutes: 25,
  scenario:
    'invoice-sync-consumer takes invoice events from the Anypoint MQ queue invoice-events and creates each invoice in the billing system of Harbor Foods. Billing was down for an upgrade from 09:00 to 10:00. Every invoice of that hour failed 5 times and went to the dead letter queue invoice-events-dlq. Billing says it is back. Bring all 300 invoices in, each one exactly once.',
  start() {
    const times = [at(1, 9, 1), at(1, 9, 31), at(1, 9, 59)]
    return newPlatform({
      clock: at(1, 10, 5),
      nextId: COUNT + 100,
      apps: [
        newApp(NAME, {
          replicas: 2,
          props: { 'billing.host': HOST, 'queue.name': QUEUE, 'dlq.name': DLQ, 'idempotency.enabled': 'false', 'billing.customerMap': '' },
          store: { billing: Object.fromEntries(Array.from({ length: COUNT }, (_, i) => i).filter(written).map((i) => [invoiceOf(i), 1])) },
          logs: outageLogs(times, HOST, [invoiceOf(0), invoiceOf(150), invoiceOf(299)]),
        }),
      ],
      queues: [
        { name: QUEUE, type: 'Standard queue', dlq: DLQ, attempts: 5, messages: [] },
        { name: DLQ, type: 'Standard queue', dlq: '', attempts: 10, messages: deadLetters() },
      ],
      mail: [
        {
          t: at(1, 10, 2),
          to: OPS,
          subject: 'Billing 7.2 is live again',
          body: 'The upgrade is done and billing takes invoices again since 10:00. Two notes. Shortly before 09:00 billing was slow: some invoices were written, but the answer came after your timeout, so you may hold those as failed too. During the upgrade we also merged duplicate customer accounts. Please do not send the whole hour as new invoices without a check, because customers get every invoice by mail.',
          source: 'Harbor Foods Billing',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the mail of Billing', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(NAME),
    { title: 'Look at the dead letter queue', how: `MQ, ${DLQ}, Message Browser, Get Messages. Each message shows 5 deliveries and comes from ${QUEUE}. Open one to see the invoice.`, done: (s) => Boolean(s.seen[`mq:${DLQ}`]) },
    ask(
      'Why not purge',
      `A colleague says the outage is over, so purge ${DLQ} and move on. Why is that wrong?`,
      ['Purge only hides the messages for an hour', 'Purge deletes the messages for good. These are 300 real invoices that billing never received', 'Purge sends the messages to billing without a check', 'Purge is not allowed on a dead letter queue'],
      1,
      'A dead letter queue holds work that is not done yet. Purge deletes every message for good, so 300 invoices would never reach billing and nobody would know which ones. Purge only after you have looked at each message and decided it is not needed.',
    ),
    {
      title: 'Check that the cause is fixed',
      how: `API client, application ${NAME}, GET /health. It asks billing for its status. A redrive while billing is still down sends every message back to the dead letter queue after 5 more deliveries. Read the notes in the answer too.`,
      done: (s) => healthAt(s).length > 0,
    },
    ask(
      'Why idempotency matters on a redrive',
      'Billing wrote some invoices before 09:00 but answered after the timeout, so those messages also failed. What happens to them on a redrive if the consumer does not check?',
      ['Billing rejects them on its own', 'They are created a second time, and the customers get the same invoice twice', 'The redrive skips messages that were delivered before', 'Anypoint MQ removes duplicates from a standard queue'],
      1,
      'Delivery is at least once, and a redrive publishes the messages again. A message whose work already reached billing must not create it again. The consumer has to recognise an invoice number that billing has, and skip it. A standard queue does not remove duplicates.',
    ),
    {
      title: 'Turn on the duplicate check',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set idempotency.enabled to true and Apply Changes. Do this before the redrive: in the lab an invoice created twice cannot be taken back, so you would need to start the lab again.`,
      done: guarded,
    },
    {
      title: 'Redrive the dead letters',
      how: `Anypoint MQ has no built in replay from a dead letter queue, so ${NAME} has its own redrive-dlq-flow. Schedules of ${NAME}, select redrive-dlq-flow, Run. It publishes each message of ${DLQ} again on ${QUEUE}. The step counts when the health check came first.`,
      done: (s) => checkedFirst(s) && guarded(s),
    },
    {
      title: 'Watch the invoices go through',
      how: `The consumer takes 30 messages a minute per replica, so billing is not flooded. Move the clock a minute at a time and look at ${QUEUE} in MQ and at the logs. After about 5 minutes the queue is empty. Invoices that billing has are skipped.`,
      done: (s) => checkedFirst(s) && queue(s, QUEUE).messages.length === 0 && created(s).filter((n) => n > 0).length >= COUNT - MERGED_AT.length,
    },
    ask(
      'Three are back in the dead letter queue',
      `Three messages failed again, 5 deliveries each, and are back in ${DLQ}. The error says bad request (400) for customer ${MERGED_FROM}. What is the right next move?`,
      ['Redrive them again until they work', 'Purge them, three invoices do not matter', 'Read the error, fix the cause of these three, then redrive only them', 'Raise the delivery attempts of the queue to 1000'],
      2,
      'A message that fails again after the outage has a cause of its own. Here billing merged the customer, so a retry gives the same 400 each time. Find the cause, fix it, then redrive. More attempts or more redrives only repeat the failure.',
    ),
    {
      title: 'Map the merged customer',
      how: `The health answer said ${MERGED_FROM} was merged into ${MERGED_INTO}. Set billing.customerMap of ${NAME} to ${MERGED_FROM}=${MERGED_INTO} and Apply Changes.`,
      done: mapped,
    },
    {
      title: 'Redrive the rest and prove every invoice is in once',
      how: `Run redrive-dlq-flow again and move the clock 1 minute. Both queues are empty, and billing holds each of the 300 invoices exactly once.`,
      done: (s) => mapped(s) && guarded(s) && Boolean(redrive(s)?.ok) && redrive(s).t >= consumer(s).updated && s.queues.every((q) => q.messages.length === 0) && created(s).every((n) => n === 1),
    },
  ],
  why: 'A dead letter queue holds messages that failed the maximum number of deliveries. After an outage, fix or confirm the cause first, then move the messages back. Anypoint MQ has no built in replay from a DLQ, so a flow or a script consumes the DLQ and publishes each message again. Redrive at a pace the downstream system can take, and make the consumer idempotent, because some messages may have done their work before they failed. Purge deletes messages for good, so it is not a way to clear a backlog. A message that fails again after the redrive has its own cause: read the error, fix it, then redrive those few. In the lab the redrive flow moves every message at once and the consumer limits the pace to 30 a minute per replica. The billing data lives in the store of the consumer.',
  docs: 'https://docs.mulesoft.com/mq/mq-faq',
  solve(start) {
    let s = mark(viewMessages(mark(start, 'inbox'), DLQ), `logs:${NAME}`)
    s = call(s, NAME, null, '/health').state
    s = change(s, NAME, { props: { ...consumer(s).props, 'idempotency.enabled': 'true' } })
    s = advance(runNow(s, NAME, 'redrive-dlq-flow'), 6 * MINUTE)
    s = change(s, NAME, { props: { ...consumer(s).props, 'billing.customerMap': `${MERGED_FROM}=${MERGED_INTO}` } })
    return advance(runNow(s, NAME, 'redrive-dlq-flow'), MINUTE)
  },
  answers: { 3: 1, 5: 1, 9: 2 },
}

export const LABS = [lab]
