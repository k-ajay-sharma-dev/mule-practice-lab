// The guided lab aws-sqs-visibility. See platform-labs.js for the shape of a lab.
import { at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { arnQueue, editQueue, newAwsAccount, policyDoc, pollFromConsole, queueUrl, REGION, startRedrive } from '../platform-aws.js'
import { INTAKE, REFUND_SECONDS, REFUNDS } from './aws-sqs-visibility.pkg.js'

const QUEUE = 'brightmart-returns'
const DLQ = 'brightmart-returns-dlq'
const USER = 'svc-returns'
const KEY_ID = 'AKIA_LAB_0003310'
const SECRET = 'lab-only/returns-3310'

const q = (s) => s.aws?.queues?.[QUEUE]
const dlq = (s) => s.aws?.queues?.[DLQ]
const r = (s) => app(s, REFUNDS)
const running = (s) => r(s)?.status === 'Running'
const prop = (s, k) => String(r(s)?.props?.[k] ?? '').trim()
// the visibility timeout each receive of the listener uses
const visibility = (s) => (prop(s, 'sqs.visibilityTimeout') === '' ? Number(q(s)?.visibility ?? 0) : Number(prop(s, 'sqs.visibilityTimeout')))
const visOk = (s) => running(s) && visibility(s) >= 90 && visibility(s) <= 43200 && Number(q(s)?.visibility ?? 0) >= 90
const idemOk = (s) => running(s) && prop(s, 'idempotency.enabled').toLowerCase() === 'true'
const fixedAt = (s) => Math.max(r(s)?.updated ?? 0, q(s)?.changed ?? 0)
const redriven = (s) => visOk(s) && idemOk(s) && (dlq(s)?.lastRedrive?.t ?? -1) >= fixedAt(s) && dlq(s).lastRedrive.moved > 0

const lab = {
  id: 'p-aws-sqs-visibility',
  group: 'Data and cloud',
  title: 'Every return refunded three times',
  minutes: 25,
  scenario: `Approved returns go from ${INTAKE} to the SQS queue ${QUEUE}. ${REFUNDS} listens with 4 consumers and refunds each return, which takes about ${REFUND_SECONDS} seconds. The queue has a redrive policy to ${DLQ}. Since the queue went live this morning, finance sees customers refunded three times, and returns that were refunded pile up in the dead-letter queue. Find out why, stop the double refunds and clean up the dead-letter queue safely.`,
  start() {
    const s = newPlatform({
      clock: at(1, 7, 30),
      apps: [
        newApp(INTAKE, { props: { 'aws.region': REGION, 'aws.accessKeyId': KEY_ID, 'sqs.queueUrl': queueUrl(QUEUE) }, secrets: { 'aws.secretAccessKey': SECRET } }),
        newApp(REFUNDS, { props: { 'aws.region': REGION, 'aws.accessKeyId': KEY_ID, 'sqs.queueUrl': queueUrl(QUEUE), 'sqs.numberOfConsumers': '4', 'sqs.visibilityTimeout': '', 'idempotency.enabled': 'false' }, secrets: { 'aws.secretAccessKey': SECRET }, store: {} }),
      ],
      traffic: [{ app: INTAKE, env: 'Sandbox', method: 'POST', path: '/returns', body: '{"amount":59.9}', perMinute: 1, every: 2 }],
      aws: newAwsAccount(at(1, 7, 30), {
        users: [{ name: USER, keys: [{ id: KEY_ID, secret: SECRET, created: at(-3, 14) }], policies: { 'returns-queue': policyDoc({ Sid: 'ReturnsQueue', Effect: 'Allow', Action: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility', 'sqs:GetQueueAttributes'], Resource: arnQueue(QUEUE) }) } }],
        queues: [
          { name: DLQ, retention: 1209600, created: at(1, 6, 50) },
          { name: QUEUE, visibility: 30, wait: 20, redrive: { dlq: DLQ, max: 3 }, created: at(1, 6, 55) },
        ],
      }),
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Returns refunded three times',
          body: 'Hello. Since this morning the payment provider shows three refunds for most returns, for example RMA-5101 and RMA-5102. We stopped the payout batch for now. Please find the cause before 11:00. Brightmart finance',
          source: 'Brightmart finance',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    sawLogs(REFUNDS),
    {
      title: 'Read the queue settings',
      how: `AWS from the console menu, SQS tab, ${QUEUE}. Details shows Visibility timeout 30 seconds, Receive message wait time 20 seconds and the redrive policy to ${DLQ} with Maximum receives 3. Monitoring shows more messages received than sent, and almost none deleted.`,
      done: (s) => Boolean(s.seen[`aws:sqs:${QUEUE}`]),
    },
    {
      title: 'Look into the dead-letter queue',
      how: `SQS tab, ${DLQ}, Send and receive messages, Poll for messages. Open a message: the body is a return such as RMA-5101, and DeadLetterQueueSourceArn names ${QUEUE}. The logs of ${REFUNDS} show the same RMA refunded three times before it got there.`,
      done: (s) => Boolean(s.seen[`aws:poll:${DLQ}`]),
    },
    ask(
      'Why each return is refunded three times',
      `A refund takes about ${REFUND_SECONDS} seconds and the queue has a visibility timeout of 30 seconds. What happens?`,
      [
        'SQS standard queues send each message to every consumer',
        `After 30 seconds the message is visible again while the first consumer still works. Another consumer receives it, with a new receipt handle. The first delete then uses an old receipt handle, which succeeds but deletes nothing. After the third receive the redrive policy moves the message to ${DLQ}`,
        'The intake app sends each return three times',
        'The dead-letter queue sends the messages back to the queue',
      ],
      1,
      `A receive hides a message for the visibility timeout. If the work takes longer, the message is delivered again, and only the newest receipt handle can delete it. Each receive counts toward maxReceiveCount, so a message that was processed three times still lands in the dead-letter queue. The fix is a visibility timeout above the longest processing time, and a consumer that is safe to run twice, because a standard queue delivers at least once anyway.`,
    ),
    {
      title: 'Make the visibility timeout longer than the work',
      how: `SQS tab, ${QUEUE}, Edit. Set Visibility timeout to 180 seconds and Save. Leave sqs.visibilityTimeout of ${REFUNDS} empty, so the app uses the queue value, or set it to 180 too. Any value from 90 seconds on covers the ${REFUND_SECONDS} seconds of a refund.`,
      done: visOk,
    },
    {
      title: 'Make the refund safe to run twice',
      how: `Runtime Manager, ${REFUNDS}, Settings, Properties. Set idempotency.enabled to true and Apply Changes. The Idempotent message validator then skips an RMA that was refunded already.`,
      done: idemOk,
    },
    ask(
      'What to do with the dead-letter queue',
      `${DLQ} holds returns that were refunded, maybe more than once. What do you do with them?`,
      [
        'Purge the dead-letter queue, they were all refunded',
        'Leave them, the queue deletes them after 4 days',
        'Redrive them to the source queue after both fixes. The idempotent consumer skips the RMAs that were refunded, and refunds any that never was. Nothing is lost and nothing is paid twice',
        'Send them again with a new RMA number',
      ],
      2,
      'A message in a dead-letter queue is a record of work that may or may not have happened. With an idempotent consumer, sending it back is safe: the validator decides per RMA. Purging is safe only when you know every message is done. Here the retention of the dead-letter queue is 14 days, and redrive keeps the message body and attributes.',
    ),
    {
      title: 'Redrive the dead-letter queue',
      how: `After both fixes, move the clock 5 minutes so the messages in flight settle. Then SQS tab, ${DLQ}, Start DLQ redrive. The messages go back to ${QUEUE}, and the logs of ${REFUNDS} show refunded already, skipped for each of them.`,
      done: redriven,
    },
    {
      title: 'Prove each return is refunded once',
      how: `Move the clock 10 minutes after the redrive. The logs show one refund per new RMA, Monitoring of ${QUEUE} shows the messages deleted, and no new message reaches ${DLQ}.`,
      done: (s) => {
        if (!redriven(s) || s.clock < dlq(s).lastRedrive.t + 10 * MINUTE) return false
        const since = (r(s).store?.refunds ?? []).filter((x) => x.t >= fixedAt(s))
        const rmas = since.map((x) => x.rma)
        return rmas.length >= 3 && new Set(rmas).size === rmas.length && !(dlq(s).messages ?? []).some((m) => (m.moved ?? 0) >= fixedAt(s) + 3 * MINUTE)
      },
    },
  ],
  why: `An SQS receive hides the message for the visibility timeout; it is not a lock that lasts until the work ends. When the work takes longer, the message is visible again and another consumer receives it with a new receipt handle, and a delete with the old handle succeeds without deleting. Every receive counts toward maxReceiveCount of the redrive policy, so even work that succeeded ends in the dead-letter queue. Set the visibility timeout above the longest processing time (or extend it with ChangeMessageVisibility), and make the consumer idempotent, because a standard queue delivers at least once. Only then redrive the dead-letter queue, so its messages run once more without paying twice.`,
  docs: 'https://docs.mulesoft.com/amazon-sqs-connector/latest/',
  solve(start) {
    let s = [`logs:${REFUNDS}`, `aws:sqs:${QUEUE}`].reduce(mark, start)
    s = pollFromConsole(s, DLQ).state
    const x = s.aws.queues[QUEUE]
    s = editQueue(s, QUEUE, { visibility: 180, retention: x.retention, wait: x.wait, delay: x.delay, dlq: DLQ, maxReceives: 3 }).state
    s = change(s, REFUNDS, { props: { ...r(s).props, 'idempotency.enabled': 'true' } })
    s = until(s, s.clock + 5 * MINUTE)
    s = startRedrive(s, DLQ).state
    return until(s, s.clock + 11 * MINUTE)
  },
  answers: { 3: 1, 6: 2 },
}

export const LABS = [lab]
