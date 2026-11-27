// The guided lab aws-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, callApi, deployApp, finishDeploys, mark, MINUTE, newPlatform } from '../platform.js'
import { app, ask, called } from '../platform-kit.js'
import {
  allowed, arnBucket, arnQueue, createAccessKey, createBucket, createQueue, createUser, newAwsAccount, pollFromConsole, putPolicy, policyDoc, queueUrl, REGION, sendFromConsole,
} from '../platform-aws.js'
import { POD_BRIDGE, POD_JAR, POD_SAMPLE } from './aws-setup.pkg.js'

const BUCKET = 'harbor-pod-archive'
const QUEUE = 'harbor-pod-events'
const DLQ = 'harbor-pod-events-dlq'
const USER = 'svc-pod-bridge'
const KMS_ALIAS = 'alias/harbor-logistics'
const ALERT_TO = 'logistics-integration@harbor.example'
const POISON = '{"type":"PodReceived","shipment":"SL-4'

const y = (s) => s.aws ?? {}
const keyArn = (s) => Object.values(y(s).keys ?? {}).find((k) => k.alias === KMS_ALIAS)?.arn ?? ''
const a = (s) => app(s, POD_BRIDGE)
const word = (v) => String(v ?? '').trim()
const bucket = (s) => y(s).buckets?.[BUCKET]
const bucketOk = (s) => {
  const b = bucket(s)
  return Boolean(b) && Object.values(b.bpa).every(Boolean) && b.encryption.type === 'SSE-KMS' && b.encryption.key === KMS_ALIAS
}
const queuesOk = (s) => {
  const q = y(s).queues?.[QUEUE]
  const d = y(s).queues?.[DLQ]
  return Boolean(q && d) && !q.fifo && !d.fifo && q.visibility === 60 && q.wait === 20 && q.redrive?.dlq === DLQ && q.redrive.max === 3
}
// least privilege: what the app does is allowed, and nothing next to it
const POD_KEY = arnBucket(BUCKET, 'pod/2026/11/03/SL-40021.json')
const NEEDS = (s) => [
  ['s3:PutObject', POD_KEY],
  ['s3:ListBucket', arnBucket(BUCKET)],
  ['sqs:SendMessage', arnQueue(QUEUE)],
  ['sqs:ReceiveMessage', arnQueue(QUEUE)],
  ['sqs:DeleteMessage', arnQueue(QUEUE)],
  ['sqs:GetQueueAttributes', arnQueue(QUEUE)],
  ['kms:GenerateDataKey', keyArn(s)],
]
const NOT = (s) => [
  ['s3:DeleteObject', POD_KEY],
  ['s3:PutObject', arnBucket('harbor-web-assets', 'index.html')],
  ['s3:DeleteBucket', arnBucket(BUCKET)],
  ['s3:PutBucketPolicy', arnBucket(BUCKET)],
  ['sqs:DeleteQueue', arnQueue(QUEUE)],
  ['sqs:PurgeQueue', arnQueue(QUEUE)],
  ['sqs:SendMessage', arnQueue('harbor-orders')],
  ['kms:ScheduleKeyDeletion', keyArn(s)],
  ['iam:CreateAccessKey', '*'],
]
const leastOk = (s) => Boolean(y(s).users?.[USER]) && bucketOk(s) && queuesOk(s) && NEEDS(s).every(([act, res]) => allowed(y(s), `user:${USER}`, act, res)) && !NOT(s).some(([act, res]) => allowed(y(s), `user:${USER}`, act, res))
const activeKey = (s) => (y(s).users?.[USER]?.keys ?? []).find((k) => k.status === 'Active')
const deployedOk = (s) => {
  const x = a(s)
  const k = activeKey(s)
  if (!x || x.status !== 'Running' || !k || !leastOk(s)) return false
  const p = x.props
  return word(p['aws.region']) === REGION && word(p['aws.accessKeyId']) === k.id && x.secrets['aws.secretAccessKey'] === k.secret && p['aws.secretAccessKey'] === undefined && word(p['s3.bucket']) === BUCKET && word(p['sqs.queueUrl']) === queueUrl(QUEUE)
}
const podObjects = (s) => Object.entries(bucket(s)?.objects ?? {}).filter(([k, o]) => k.startsWith('pod/') && o.by === USER && o.sse === 'aws:kms').length
const poisoned = (s) => (y(s).queues?.[DLQ]?.messages ?? []).some((m) => m.src === arnQueue(QUEUE) && (() => {
  try {
    return JSON.parse(m.body)?.type !== 'PodReceived'
  } catch {
    return true
  }
})())

const MAIL = {
  t: at(1, 8, 40),
  to: 'ops@harbor.example',
  subject: 'Swiftline proof of delivery goes to AWS',
  body: [
    'Hello integration team,',
    `From next week our carrier Swiftline Freight posts every proof of delivery (POD) to us. The app ${POD_BRIDGE} is built and its jar waits in Runtime Manager. Please set up the AWS side in account 210987654321, region ${REGION}:`,
    `1. A bucket ${BUCKET} for the POD documents. No public access at all. Encrypted with our KMS key ${KMS_ALIAS}.`,
    `2. A standard queue ${QUEUE} for the POD events, with a dead-letter queue ${DLQ}. A message that fails 3 times goes to the dead-letter queue. Visibility timeout 60 seconds, long polling of 20 seconds.`,
    `3. An IAM user ${USER} for the app. It writes PODs under pod/ and uses the queue, nothing else.`,
    '4. Its keys never in plain properties.',
    `5. Failures alert ${ALERT_TO}.`,
    'Please send three test PODs and one broken event before you call it done.',
    'Harbor logistics platform team',
  ].join('\n\n'),
  source: 'Harbor logistics platform team',
}

const lab = {
  id: 'p-aws-setup',
  group: 'Data and cloud',
  title: 'Set up the AWS integration for proof of delivery',
  minutes: 35,
  scenario: `It is 09:00. Harbor's carrier Swiftline Freight will post a proof of delivery for every parcel. ${POD_BRIDGE} stores each one in S3 and puts an event on SQS, and a listener in the same app marks the order delivered. The app is built and its jar is in Runtime Manager, but nothing exists on the AWS side yet: no bucket, no queues, no IAM user, no properties. Done means three PODs arrive end to end, a broken event lands in the dead-letter queue, and failures raise an alert. The Inbox has the request.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      jars: [{ pkg: POD_BRIDGE, jar: POD_JAR }],
      aws: newAwsAccount(at(1, 9), {
        keys: [{ alias: KMS_ALIAS, created: at(-120, 10) }],
        buckets: [{ name: 'harbor-web-assets', created: at(-300, 9) }],
        queues: [{ name: 'harbor-orders', visibility: 60, wait: 20, created: at(-200, 9) }],
      }),
      mail: [MAIL],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of the logistics platform team. Note the bucket, the queues, the user, the key and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the bucket',
      how: `AWS from the console menu, S3 tab, Create bucket. Bucket name ${BUCKET}. Keep Block all public access on, with its four settings. Default encryption SSE-KMS with the key ${KMS_ALIAS}. Create bucket.`,
      done: bucketOk,
    },
    {
      title: 'Create the queue and its dead-letter queue',
      how: `SQS tab, Create queue. First ${DLQ}, type Standard. Then ${QUEUE}, type Standard, Visibility timeout 60, Receive message wait time 20. Under Dead-letter queue pick Enabled, the queue ${DLQ} and Maximum receives 3. Create queue.`,
      done: queuesOk,
    },
    {
      title: 'Create the IAM user with the least rights',
      how: `IAM tab, Users, Create user ${USER}. Open it, Permissions, Create inline policy. Allow s3:PutObject on ${arnBucket(BUCKET, 'pod/*')}, s3:ListBucket on ${arnBucket(BUCKET)}, sqs:SendMessage, sqs:ReceiveMessage, sqs:DeleteMessage and sqs:GetQueueAttributes on ${arnQueue(QUEUE)}, and kms:GenerateDataKey on the ARN of ${KMS_ALIAS} from the KMS tab. Policy simulator checks it: s3:DeleteObject or sqs:PurgeQueue must come out denied.`,
      done: leastOk,
    },
    ask(
      'Least privilege',
      `A colleague suggests attaching AmazonS3FullAccess and AmazonSQSFullAccess to ${USER}, to save time. What do you answer?`,
      [
        'Fine for a service user, since nobody logs in with it',
        `No. Those policies allow every action on every bucket and queue of the account. A leaked key could delete the archive or read the queues of other teams. The inline policy grants the few actions the app runs, on this bucket path, this queue and this key`,
        'Better to attach AdministratorAccess, so no deploy fails later',
        'Use the access key of harbor-admin instead of a new user',
      ],
      1,
      'Least privilege means the actions the code calls, on the resources it uses: Put Object needs s3:PutObject on the key path and, with SSE-KMS, kms:GenerateDataKey on the key; Head bucket needs s3:ListBucket; the listener needs ReceiveMessage and DeleteMessage. The IAM policy simulator, or the Access Analyzer policy generation from CloudTrail, confirms the set.',
    ),
    {
      title: 'Create the access key and deploy the app',
      how: `IAM tab, ${USER}, Security credentials, Create access key, and copy both values. Then Runtime Manager, Deploy application, name ${POD_BRIDGE}, file ${POD_JAR}. Properties: aws.region ${REGION}, aws.accessKeyId the key ID, s3.bucket ${BUCKET}, sqs.queueUrl ${queueUrl(QUEUE)}, and aws.secretAccessKey with Protect on. Deploy Application.`,
      done: deployedOk,
    },
    {
      title: 'Test the connection',
      how: `API client from the console menu, application ${POD_BRIDGE}, GET /health. It answers 200 with {"s3":"ok","sqs":"ok"} once the bucket, the queue and the rights are right. A 503 names the AWS error code.`,
      done: (s) => deployedOk(s) && called(s, POD_BRIDGE, 200, 'GET', /^\/health/),
    },
    {
      title: 'Send three PODs end to end',
      how: `API client, POST /pod with the sample body, three times with the shipments SL-40021, SL-40022 and SL-40023. Move the clock 2 minutes. S3 tab, ${BUCKET}, Objects: three files under pod/2026/11/03/ with SSE-KMS. The logs show each order marked delivered, and ${QUEUE} is empty.`,
      done: (s) => deployedOk(s) && podObjects(s) >= 3 && (a(s).store?.delivered ?? []).length >= 3 && Boolean(s.seen[`aws:s3:${BUCKET}:Objects`]),
    },
    {
      title: 'Send a broken event',
      how: `SQS tab, ${QUEUE}, Send and receive messages. Message body ${POISON} (cut off on purpose), Send message. The listener fails on it, SQS gives it again after 60 seconds, and after the third receive it moves to ${DLQ}. Move the clock 5 minutes, then Poll for messages on ${DLQ}.`,
      done: (s) => deployedOk(s) && poisoned(s) && Boolean(s.seen[`aws:poll:${DLQ}`]),
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${POD_BRIDGE}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO}.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === POD_BRIDGE && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    ask(
      'Visibility timeout, long polling and receives',
      'Why a visibility timeout of 60 seconds, long polling of 20 seconds and 3 receives?',
      [
        'They are the defaults of SQS',
        'The visibility timeout must exceed the time the flow needs per message, or the message is delivered twice. Long polling waits up to 20 seconds for a message, which cuts empty receives and cost. 3 receives retry a passing error, and then move a poison message aside instead of blocking the consumers for its whole retention',
        'Long polling makes SQS deliver in order',
        'Maximum receives 3 means SQS keeps 3 copies of each message',
      ],
      1,
      'The SQS defaults are 30 seconds visibility, short polling (0 seconds) and no dead-letter queue. A poison message without a redrive policy comes back until the retention period ends, 4 days by default. Set the dead-letter queue retention longer than the source queue, so a moved message is not lost early.',
    ),
  ],
  why: `The AWS setup checklist: create the resources the way the mail says (a bucket with Block Public Access and SSE-KMS, a queue with a dead-letter queue and a redrive policy, a visibility timeout above the processing time and long polling), then an IAM user or role with a policy that names the actions and the ARNs the app uses, including kms:GenerateDataKey for an SSE-KMS bucket. Put the secret access key in a protected property, deploy, and prove it with a health call, data end to end, and a poison message that ends in the dead-letter queue. Add an alert on the error count. In the lab the key policy of ${KMS_ALIAS} lets IAM decide, and the console user harbor-admin has full rights.`,
  docs: 'https://docs.mulesoft.com/amazon-sqs-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createBucket(s, { name: BUCKET, encryption: { type: 'SSE-KMS', key: KMS_ALIAS } }).state
    s = createQueue(s, { name: DLQ, visibility: 30, retention: 1209600, wait: 20, delay: 0 }).state
    s = createQueue(s, { name: QUEUE, visibility: 60, retention: 345600, wait: 20, delay: 0, dlq: DLQ, maxReceives: 3 }).state
    s = createUser(s, USER).state
    const key = Object.values(s.aws.keys).find((k) => k.alias === KMS_ALIAS).arn
    const policy = policyDoc(
      { Sid: 'WritePods', Effect: 'Allow', Action: 's3:PutObject', Resource: arnBucket(BUCKET, 'pod/*') },
      { Sid: 'CheckBucket', Effect: 'Allow', Action: 's3:ListBucket', Resource: arnBucket(BUCKET) },
      { Sid: 'PodEvents', Effect: 'Allow', Action: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'], Resource: arnQueue(QUEUE) },
      { Sid: 'EncryptPods', Effect: 'Allow', Action: 'kms:GenerateDataKey', Resource: key },
    )
    s = putPolicy(s, 'user', USER, 'pod-bridge', policy).state
    const k = createAccessKey(s, USER)
    s = k.state
    const form = { name: POD_BRIDGE, pkg: POD_BRIDGE, jar: POD_JAR, replicas: 1, vCores: 0.1, props: { 'aws.region': REGION, 'aws.accessKeyId': k.result.id, 's3.bucket': BUCKET, 'sqs.queueUrl': queueUrl(QUEUE) }, secrets: { 'aws.secretAccessKey': k.result.secret } }
    s = finishDeploys(deployApp(s, form).state)
    s = callApi(s, { env: 'Sandbox', app: POD_BRIDGE, method: 'GET', path: '/health', body: '' }).state
    for (const n of ['SL-40021', 'SL-40022', 'SL-40023']) s = callApi(s, { env: 'Sandbox', app: POD_BRIDGE, method: 'POST', path: '/pod', body: POD_SAMPLE.replace('SL-40021', n) }).state
    s = mark(advance(s, 2 * MINUTE), `aws:s3:${BUCKET}:Objects`)
    s = addMonAlert(s, { title: 'POD bridge errors', resource: 'Application', name_: POD_BRIDGE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = sendFromConsole(s, QUEUE, { body: POISON }).state
    s = advance(s, 5 * MINUTE)
    return pollFromConsole(s, DLQ).state
  },
  answers: { 4: 1, 10: 1 },
}

export const LABS = [lab]
