// The end to end lab of AWS. See platform-labs.js for the shape of a lab.
// Proofs of delivery go from the carrier through S3 and SQS to the order database: design, build, SQS, IAM and database
// setup, API Manager, deployment, one POD traced to the order, a POD for an unknown order through the dead-letter queue
// and a redrive, an alert and Production, which in the lab has its own bucket, queues, IAM user and order database.
import {
  addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createProject, deployApp, finishDeploys, importSpec, mark, MINUTE, mockCall, newPlatform, packageJar, pairing, promoteApi, publish, ramlErrors,
  requestAccess, saveProject, setStudio,
} from '../platform.js'
import { ask, OPS } from '../platform-kit.js'
import { newSqlServer, runSql, tablesOf } from '../platform-db.js'
import { allowed, arnBucket, arnQueue, createAccessKey, createQueue, createUser, newAwsAccount, pollFromConsole, policyDoc, putPolicy, queueUrl, REGION, startRedrive } from '../platform-aws.js'
import { AWS_FLOW, AWS_PKG, POD_BODY } from './e2e-aws.pkg.js'

const ASSET = 'proof-of-delivery-api'
const KMS_ALIAS = 'alias/brightmart-logistics'
const BUCKET = 'brightmart-pod-archive-sbx'
const QUEUE = 'brightmart-pod-events-sbx'
const DLQ = 'brightmart-pod-events-sbx-dlq'
const USER = 'svc-pod-papi-sbx'
const DB_USER = 'mule_pod'
const DB_PASSWORD = 'Pod-Db-Lab-2026'
const SRC = 'brightmart-sql'
const SRC_PRD = 'brightmart-sql-prd'
const CALLER = { name: 'Swiftline Freight', clientId: 'swiftline-90a4f2', clientSecret: 'swiftline-secret-37' }
const ALERT_TO = 'logistics-integration@brightmart.example'
const CID = 'pod-test-0001'
const PRD = { bucket: 'brightmart-pod-archive', queue: 'brightmart-pod-events', dlq: 'brightmart-pod-events-dlq', user: 'svc-pod-papi', dbHost: 'sql-prd.brightmart.lab', dbPassword: 'Pod-Db-Prd-6624' }
const LATE_ORDER = "INSERT INTO dbo.orders (order_id, customer_id, status, total, created_at, shipped_at) VALUES ('O-1012', 'C-102', 'PAID', 48.00, '2026-11-02 17:55:00', NULL)"

const RAML = `#%RAML 1.0
title: Proof of Delivery API
version: v1
mediaType: application/json
types:
  Pod:
    properties:
      shipment: string
      order: string
      deliveredAt: datetime
      signedBy: string
      signature?: string
/pods:
  post:
    description: The carrier posts one proof of delivery. 202 means stored and queued.
    body:
      type: Pod
      example: |
        { "shipment": "SL-40031", "order": "O-1006", "deliveredAt": "2026-11-03T08:41:00Z", "signedBy": "R. Moreau", "signature": "iVBORw0KGgo..." }
    responses:
      202:
        body:
          example: |
            { "shipment": "SL-40031", "s3Key": "pod/2026/11/03/SL-40031.json", "correlationId": "pod-test-0001" }
  /{shipment}:
    get:
      description: The stored POD and the status of its order
      responses:
        200:
          body:
            example: |
              { "shipment": "SL-40031", "order": "O-1006", "deliveredAt": "2026-11-03T08:41:00Z", "signedBy": "R. Moreau", "orderStatus": "DELIVERED" }
        404:
          body:
            example: |
              { "message": "No POD for shipment SL-40099" }
`
const FLOW_CODE = `<!-- Global elements: every value is a property, the secrets are secure properties -->
<s3:config name="Amazon_S3_Configuration">
  <s3:connection accessKey="\${aws.accessKeyId}" secretKey="\${secure::aws.secretAccessKey}" region="\${aws.region}"/>
</s3:config>
<sqs:config name="Amazon_SQS_Configuration">
  <sqs:basic-connection accessKey="\${aws.accessKeyId}" secretKey="\${secure::aws.secretAccessKey}" region="\${aws.region}"/>
</sqs:config>
<db:config name="Orders_Database_Config">
  <db:mssql-connection host="\${db.host}" port="1433" databaseName="\${db.database}" user="\${db.user}" password="\${secure::db.password}"/>
</db:config>

<!-- POST /pods: store the document, queue a small event with its key (claim check), answer 202 -->
<flow name="post:\\pods:application\\json:proof-of-delivery-api-config">
  <set-variable variableName="key" value="#['pod/' ++ (payload.deliveredAt as Date as String {format: 'yyyy/MM/dd'}) ++ '/' ++ payload.shipment ++ '.json']"/>
  <s3:put-object config-ref="Amazon_S3_Configuration" bucketName="\${s3.bucket}" key="#[vars.key]"/>
  <ee:transform doc:name="POD event">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ type: "PodReceived", shipment: vars.pod.shipment, order: vars.pod.order, s3Key: vars.key, correlationId: correlationId }]]></ee:set-payload></ee:message>
  </ee:transform>
  <sqs:send-message config-ref="Amazon_SQS_Configuration" queueUrl="\${sqs.queueUrl}"/>
  <set-variable variableName="httpStatus" value="202"/>
</flow>

<!-- the listener: read the POD back from S3, mark the order delivered; a failure leaves the message for a redelivery -->
<flow name="${AWS_FLOW}">
  <sqs:receivemessages config-ref="Amazon_SQS_Configuration" queueUrl="\${sqs.queueUrl}" numberOfConsumers="2"/>
  <s3:get-object config-ref="Amazon_S3_Configuration" bucketName="\${s3.bucket}" key="#[read(payload, 'application/json').s3Key]"/>
  <db:update config-ref="Orders_Database_Config">
    <db:sql>UPDATE dbo.orders SET status = 'DELIVERED' WHERE order_id = :order</db:sql>
    <db:input-parameters>#[{ order: payload.order }]</db:input-parameters>
  </db:update>
  <validation:is-true expression="#[payload.affectedRows == 1]" message="Order not in the order system"/>
</flow>`

const y = (s) => s.aws ?? {}
const word = (v) => String(v ?? '').trim()
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.env === env && a.pkg === AWS_PKG && a.status !== 'Stopped')
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const resourcesOk = (raml) => ramlErrors(raml ?? '').length === 0 && mockCall(raml, 'POST', '/pods').status < 300 && mockCall(raml, 'GET', '/pods/SL-40031').status < 300
const designed = (s) => s.projects.some((p) => /delivery/i.test(p.name) && resourcesOk(p.raml))
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === AWS_PKG)
const props = (a) => ({ ...a?.props, ...a?.secrets })
const order = (s, id, name = SRC) => (s.databases?.servers?.[name] ? tablesOf(s.databases.servers[name])['dbo.orders'].rows.find((r) => r.order_id === id) : null)
const keyArn = (s) => Object.values(y(s).keys ?? {}).find((k) => k.alias === KMS_ALIAS)?.arn ?? ''

const queuesOk = (s) => {
  const q = y(s).queues?.[QUEUE]
  const d = y(s).queues?.[DLQ]
  return Boolean(q && d) && !q.fifo && !d.fifo && q.visibility === 60 && q.wait === 20 && q.redrive?.dlq === DLQ && q.redrive.max === 3
}
const POD_KEY = arnBucket(BUCKET, 'pod/2026/11/03/SL-40031.json')
const NEEDS = (s) => [
  ['s3:PutObject', POD_KEY],
  ['s3:GetObject', POD_KEY],
  ['sqs:SendMessage', arnQueue(QUEUE)],
  ['sqs:ReceiveMessage', arnQueue(QUEUE)],
  ['sqs:DeleteMessage', arnQueue(QUEUE)],
  ['kms:GenerateDataKey', keyArn(s)],
  ['kms:Decrypt', keyArn(s)],
]
const NOT = (s) => [
  ['s3:DeleteObject', POD_KEY],
  ['s3:PutObject', arnBucket(PRD.bucket, 'pod/2026/11/03/SL-40031.json')],
  ['s3:GetObject', arnBucket(PRD.bucket, 'pod/2026/11/03/SL-40031.json')],
  ['s3:PutBucketPolicy', arnBucket(BUCKET)],
  ['sqs:SendMessage', arnQueue(PRD.queue)],
  ['sqs:PurgeQueue', arnQueue(QUEUE)],
  ['sqs:DeleteQueue', arnQueue(QUEUE)],
  ['kms:ScheduleKeyDeletion', keyArn(s)],
  ['iam:CreateAccessKey', '*'],
]
const leastOk = (s) => Boolean(y(s).users?.[USER]) && queuesOk(s) && NEEDS(s).every(([act, res]) => allowed(y(s), `user:${USER}`, act, res)) && !NOT(s).some(([act, res]) => allowed(y(s), `user:${USER}`, act, res))
const activeKey = (s, user = USER) => (y(s).users?.[user]?.keys ?? []).find((k) => k.status === 'Active')
const dbUserOk = (s) => {
  const x = s.databases?.servers?.[SRC]
  const login = x?.logins?.find((l) => l.name.toLowerCase() === DB_USER)
  const user = x?.users?.find((u) => u.login.toLowerCase() === DB_USER)
  const g = user?.grants ?? {}
  return Boolean(login && !login.disabled && user && user.roles.length === 0 && Object.keys(g).length === 1 && g['dbo.orders']?.length === 2 && ['SELECT', 'UPDATE'].every((v) => g['dbo.orders'].includes(v)))
}
const apiOk = (s) => {
  const api = apiOf(s)
  return Boolean(api && api.policies.some((p) => p.type === 'client-id') && api.contracts.some((c) => c.client === CALLER.name && c.status === 'approved') && s.seen['env:Sandbox'])
}
const deployedOk = (s) => {
  const a = appOf(s)
  const k = activeKey(s)
  if (a?.status !== 'Running' || !k || !leastOk(s) || !dbUserOk(s)) return false
  const p = props(a)
  return (
    word(p['aws.region']) === REGION && word(p['aws.accessKeyId']) === k.id && a.secrets['aws.secretAccessKey'] === k.secret && a.props['aws.secretAccessKey'] === undefined && word(p['s3.bucket']) === BUCKET && word(p['sqs.queueUrl']) === queueUrl(QUEUE) &&
    word(p['db.host']) === 'sql.brightmart.lab' && word(p['db.database']) === 'BrightmartOrders' && word(p['db.user']).toLowerCase() === DB_USER && a.secrets['db.password'] === s.databases.servers[SRC].logins.find((l) => l.name.toLowerCase() === DB_USER).password && a.props['db.password'] === undefined &&
    pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s)) === 'Active'
  )
}
const podStored = (s, shipment, bucket = BUCKET) => Boolean(y(s).buckets?.[bucket]?.objects?.[`pod/2026/11/03/${shipment}.json`])
const posted = (s, status, env = 'Sandbox') => (s.lastCalls ?? []).some((c) => c.env === env && c.app === appOf(s, env)?.name && c.status === status && c.method === 'POST' && /^\/pods/.test(c.path))
const listenerSaw = (s, re) => (appOf(s)?.logs ?? []).some((l) => re.test(l.text))
const inDlq = (s) => (y(s).queues?.[DLQ]?.messages ?? []).some((m) => /O-1012/.test(m.body))

const lab = {
  id: 'p-e2e-aws',
  group: 'End to end by system',
  title: 'End to end: proof of delivery, carrier to the order system through S3 and SQS',
  minutes: 60,
  scenario: `The carrier Swiftline Freight will post a proof of delivery (POD) for every parcel, and the order must show DELIVERED. You build it end to end: the Proof of Delivery API in Design Center, the Mule app in Studio on that spec, the SQS queues, the IAM user and the database login, API Manager with the carrier as a client, the deployment, one POD traced from the POST to dbo.orders, a POD for an order the system does not know yet that waits in the dead-letter queue and comes back with a redrive, an alert, and Production. The record path: POST /pods, the document to S3, an event with its key to SQS, the listener reads S3 and updates the order. The Inbox has the request.`,
  start() {
    let s = newPlatform({
      clock: at(1, 9),
      aws: newAwsAccount(at(1, 9), {
        keys: [{ alias: KMS_ALIAS, created: at(-120, 10) }],
        buckets: [
          { name: BUCKET, encryption: { type: 'SSE-KMS', key: KMS_ALIAS }, created: at(-10, 9) },
          { name: PRD.bucket, encryption: { type: 'SSE-KMS', key: KMS_ALIAS }, created: at(-10, 9) },
        ],
        queues: [
          { name: PRD.dlq, retention: 1209600, created: at(-2, 9) },
          { name: PRD.queue, visibility: 60, wait: 20, redrive: { dlq: PRD.dlq, max: 3 }, created: at(-2, 9) },
        ],
      }),
      studioPkgs: { [ASSET]: AWS_PKG },
      clients: [CALLER],
    })
    // Production, made by the platform team: its IAM user with the same rights on the Production resources
    s = createUser(s, PRD.user).state
    const key = Object.values(s.aws.keys).find((k) => k.alias === KMS_ALIAS).arn
    s = putPolicy(s, 'user', PRD.user, 'pod-papi', policyDoc(
      { Sid: 'Pods', Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: arnBucket(PRD.bucket, 'pod/*') },
      { Sid: 'PodEvents', Effect: 'Allow', Action: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage'], Resource: arnQueue(PRD.queue) },
      { Sid: 'PodKey', Effect: 'Allow', Action: ['kms:GenerateDataKey', 'kms:Decrypt'], Resource: key },
    )).state
    const k = createAccessKey(s, PRD.user)
    s = k.state
    s.aws.trail = []
    let d = { ...s, databases: { created: 0, servers: { [SRC]: newSqlServer(), [SRC_PRD]: newSqlServer(SRC_PRD, { host: PRD.dbHost }) } } }
    d = runSql(d, SRC_PRD, `CREATE LOGIN ${DB_USER} WITH PASSWORD = '${PRD.dbPassword}'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT, UPDATE ON dbo.orders TO ${DB_USER}`).state
    d.seen = {}
    d.mail = [
      {
        t: at(1, 8, 40),
        to: OPS,
        subject: 'Proof of delivery from Swiftline into the order system',
        body: [
          'Hello integration team,',
          `From Monday our carrier Swiftline Freight posts a proof of delivery (POD) for every parcel, about 1,500 a day. Each POD carries the signature image, up to 400 KB. The order in SQL Server BrightmartOrders (dbo.orders on sql.brightmart.lab) must turn DELIVERED. Please build it in AWS account 210987654321, region ${REGION}:`,
          `1. An API for Swiftline (client app ${CALLER.name}): POST /pods and GET /pods/{shipment}. Only known client apps.`,
          `2. Keep each POD document in the bucket ${BUCKET} (exists, SSE-KMS with ${KMS_ALIAS}) and queue an event for the order update: a standard queue ${QUEUE} with a dead-letter queue ${DLQ}, visibility timeout 60 seconds, long polling 20 seconds, 3 receives before the dead-letter queue.`,
          `3. An IAM user ${USER} that may write and read PODs under pod/, use that queue and the key for it. Nothing else, and none of the Production resources.`,
          `4. A database login ${DB_USER} that may read and update dbo.orders only.`,
          '5. A POD for an order we do not have yet must not be lost. Stores with an offline till sync their orders late.',
          `6. Failures alert ${ALERT_TO}.`,
          `7. Production is ready: bucket ${PRD.bucket}, queue ${PRD.queue} with ${PRD.dlq}, IAM user ${PRD.user} with the access key ${k.result.id} and the secret ${k.result.secret}, order database ${PRD.dbHost} with the login ${DB_USER} and the password ${PRD.dbPassword}. All lab values.`,
          'Brightmart logistics platform team',
        ].join('\n\n'),
        source: 'Brightmart logistics platform team',
      },
    ]
    return d
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar. Note the caller, the size of a POD, the bucket, the queues and their settings, the user, the login, the rule for an unknown order, the alert recipient and the Production values.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Design the Proof of Delivery API', how: 'Design Center, Create new, New API Specification, name Proof of Delivery API. Write POST /pods and GET /pods/{shipment} with examples. You can use this RAML.', code: RAML, done: designed },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the mocking service, choose POST /pods, Try it, Send. Swiftline can build against the 202 before the app exists.', done: (s) => designed(s) && Boolean(s.seen.mock) },
    { title: 'Publish to Exchange', how: `Publish at the top right. Asset id ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => s.assets.some((a) => a.assetId === ASSET) },
    {
      title: 'Build the flows in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project carries the flows of the team: POST /pods with Put Object and Send message, and the listener with Get Object and the Database update. Read the important part below.`,
      code: FLOW_CODE,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'Why S3 and SQS',
      'Why does the app put the POD in S3 and only a small event with the S3 key on SQS?',
      [
        'SQS cannot hold JSON',
        'A POD with its signature is up to 400 KB and an SQS message holds at most 256 KB. The claim check keeps the document in S3, where it is encrypted and kept for audits, and the queue carries only the key. The carrier gets 202 at once, and the order update runs and retries on its own',
        'S3 is faster than SQS',
        'The order database reads S3 directly',
      ],
      1,
      'SQS messages are limited to 256 KB, and large payloads on a queue cost time and money on every receive. The claim check pattern stores the payload and passes a reference. It also decouples the API from the order system: the POST succeeds when S3 and SQS have it, even if the database is slow.',
    ),
    {
      title: 'Add API Autodiscovery and export the jar',
      how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then choose Export.`,
      done: (s) => Boolean(project(s)?.autodiscovery?.apiId && project(s).autodiscovery.flowRef === `${ASSET}-main` && project(s).jar),
    },
    {
      title: 'Create the queue and its dead-letter queue',
      how: `AWS from the console menu, SQS tab, Create queue. First ${DLQ}, type Standard. Then ${QUEUE}, type Standard, Visibility timeout 60, Receive message wait time 20. Under Dead-letter queue pick Enabled, the queue ${DLQ} and Maximum receives 3. Create queue.`,
      done: queuesOk,
    },
    {
      title: 'Create the IAM user with the least rights',
      how: `IAM tab, Users, Create user ${USER}. Open it, Permissions, Create inline policy: allow s3:PutObject and s3:GetObject on ${arnBucket(BUCKET, 'pod/*')}, sqs:SendMessage, sqs:ReceiveMessage and sqs:DeleteMessage on ${arnQueue(QUEUE)}, and kms:GenerateDataKey and kms:Decrypt on the ARN of ${KMS_ALIAS} from the KMS tab. Then Security credentials, Create access key, and copy both values. Policy simulator: s3:DeleteObject or anything on ${PRD.bucket} must come out denied.`,
      done: (s) => leastOk(s) && Boolean(activeKey(s)),
    },
    {
      title: 'Create the database login',
      how: `Database console from the menu, Server ${SRC}, New Query: CREATE LOGIN ${DB_USER} WITH PASSWORD = 'a password of yours'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT, UPDATE ON dbo.orders TO ${DB_USER}; Execute. No INSERT, no DELETE, no role.`,
      done: dbUserOk,
    },
    {
      title: 'Create the API instance and give Swiftline access',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), the API ${ASSET}, Save & Deploy. Policies, Add policy, Client ID Enforcement. Open Environment information. Then Exchange, Proof of Delivery API, Request access: the Sandbox instance and the application ${CALLER.name}.`,
      done: apiOk,
    },
    {
      title: 'Deploy the app',
      how: `Runtime Manager, Deploy application, name ${AWS_PKG}, the exported jar. Properties: aws.region ${REGION}, aws.accessKeyId the key ID, s3.bucket ${BUCKET}, sqs.queueUrl ${queueUrl(QUEUE)}, db.host sql.brightmart.lab, db.database BrightmartOrders, db.user ${DB_USER}, api.id, anypoint.platform.client_id. Protect aws.secretAccessKey, db.password and anypoint.platform.client_secret. The app is Running and the API Active.`,
      done: deployedOk,
    },
    {
      title: 'Post a POD as Swiftline',
      how: `API client, application ${AWS_PKG}, Send as ${CALLER.name}, X-Correlation-ID header ${CID}, POST /pods with the sample body (shipment SL-40031, order O-1006). The answer is 202 with the S3 key. AWS, S3 tab, ${BUCKET}, Objects shows pod/2026/11/03/SL-40031.json with SSE-KMS.`,
      done: (s) => deployedOk(s) && posted(s, 202) && podStored(s, 'SL-40031') && Boolean(s.seen[`aws:s3:${BUCKET}:Objects`]),
    },
    {
      title: 'Follow it to the order',
      how: `Move the clock 2 minutes. Logs of ${AWS_PKG}: the POST line and the listener line carry correlationId=${CID}, and the listener read the POD from S3 and marked O-1006 DELIVERED. Database console, ${SRC}: SELECT order_id, status FROM dbo.orders WHERE order_id = 'O-1006'; shows DELIVERED. SQS shows ${QUEUE} empty: one POD in, one order updated.`,
      done: (s) => deployedOk(s) && order(s, 'O-1006')?.status === 'DELIVERED' && listenerSaw(s, new RegExp(`correlationId=${CID} POD .* order O-1006 marked DELIVERED`)) && Boolean(s.seen[`logs:${appOf(s).name}`]) && (s.seen[`db-select:${SRC}:dbo.orders`] ?? -1) >= (appOf(s).store?.delivered?.find((x) => x.order === 'O-1006')?.t ?? Infinity),
    },
    ask(
      'At least once',
      'SQS delivers a message at least once, and the visibility timeout is 60 seconds. What must the listener be, and why 60?',
      [
        'Nothing special: SQS never delivers twice',
        'Idempotent: setting DELIVERED again changes nothing, so a second delivery is harmless. The visibility timeout must be longer than the time the flow needs per message, or a slow run makes the message visible again and a second consumer takes it too. Long polling of 20 seconds cuts empty receives',
        'The listener must use a FIFO queue to be correct',
        '60 seconds is the SQS default',
      ],
      1,
      'Standard queues deliver at least once and in no fixed order. Design the consumer to be idempotent (an UPDATE to a final state, or a check by the shipment ID), set the visibility timeout above the processing time, and delete the message only after the work is done. The SQS default is 30 seconds visibility and short polling.',
    ),
    {
      title: 'A POD for an order the system does not have',
      how: `API client as ${CALLER.name}, POST /pods with the shipment SL-40077 and the order O-1012. The answer is 202: the POD is safe in S3. The listener finds no O-1012 and fails, SQS gives the message again after 60 seconds, and after the third receive the redrive policy moves it to ${DLQ}. Move the clock 5 minutes, then SQS tab, ${DLQ}, Send and receive messages, Poll for messages.`,
      done: (s) => podStored(s, 'SL-40077') && Boolean(s.seen[`aws:poll:${DLQ}`]) && listenerSaw(s, /Order O-1012 .* is not in the order system/),
    },
    {
      title: 'Fix it and redrive',
      how: `The order of the offline till of Pier 01 store arrives late. Database console, ${SRC}: ${LATE_ORDER}; Execute. Then SQS tab, ${DLQ}, Start DLQ redrive; a message you polled is in flight until its visibility timeout ends, so wait a minute after the poll. Move the clock 2 minutes: the listener marks O-1012 DELIVERED and both queues are empty.`,
      done: (s) => order(s, 'O-1012')?.status === 'DELIVERED' && !inDlq(s) && Boolean(y(s).queues?.[DLQ]?.lastRedrive),
    },
    ask(
      'Why 202',
      'Why does POST /pods answer 202 Accepted and not wait for the order update?',
      [
        'Because 200 is not allowed for a POST',
        'The carrier needs to know the POD is safe, which it is once S3 and SQS have it. The order update can fail, wait for a late order or retry for minutes; holding the carrier on that would cause timeouts and resends. 202 says accepted for processing, and GET /pods/{shipment} shows the result',
        'Because the order database is read only',
        'So Swiftline does not retry',
      ],
      1,
      '202 Accepted is the honest answer of an asynchronous design: the request is valid and stored, the work happens later. It keeps the API fast and the partner decoupled from the backend, and a status resource lets the partner check the outcome.',
    ),
    {
      title: 'Alert the logistics integration team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${AWS_PKG}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO} from the mail. A POD that fails in the listener reaches a person before it reaches the dead-letter queue.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === appOf(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    {
      title: 'Promote the API instance to Production',
      how: `API Manager, switch to Production with the environment button at the top of the left menu. Add API, Promote API from environment, source Sandbox, include Policies. Then Exchange, Proof of Delivery API, Request access for the Production instance and the application ${CALLER.name}: a contract does not travel with the promotion.`,
      done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id') && apiOf(s, 'Production').contracts.some((c) => c.client === CALLER.name && c.status === 'approved')),
    },
    {
      title: 'Deploy to Production and post one POD',
      how: `Runtime Manager in Production, Deploy application, the same jar. aws.region ${REGION}, the access key of ${PRD.user} from the mail with the secret protected, s3.bucket ${PRD.bucket}, sqs.queueUrl ${queueUrl(PRD.queue)}, db.host ${PRD.dbHost}, db.database BrightmartOrders, db.user ${DB_USER} with the protected db.password from the mail, api.id of the Production instance and the Production client ID and secret. Then API client in Production as ${CALLER.name}: POST /pods with shipment SL-50001 and order O-1007, move the clock 2 minutes. O-1007 is DELIVERED in ${SRC_PRD}.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const p = props(a)
        const k = activeKey(s, PRD.user)
        return a?.status === 'Running' && word(p['s3.bucket']) === PRD.bucket && word(p['sqs.queueUrl']) === queueUrl(PRD.queue) && word(p['aws.accessKeyId']) === k?.id && a.secrets['aws.secretAccessKey'] === k.secret && word(p['db.host']) === PRD.dbHost && a.secrets['db.password'] === PRD.dbPassword && pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s, 'Production')) === 'Active' && posted(s, 202, 'Production') && order(s, 'O-1007', SRC_PRD)?.status === 'DELIVERED'
      },
    },
  ],
  why: `I built the proof of delivery integration from the carrier to the order system end to end. The request gave the caller, the volume, the size of a POD with its signature and the rule that a POD for an unknown order must not be lost. I designed the Proof of Delivery API with POST /pods and GET /pods/{shipment}, mocked it for the carrier and published it to Exchange. In Studio the POST flow writes the document to S3 with SSE-KMS and sends a small event with the key to SQS, a claim check because SQS holds 256 KB, and answers 202. A listener with two consumers reads the event, gets the POD from S3 and updates the order to DELIVERED, an idempotent write. On AWS I made the queue with a dead-letter queue (visibility 60, long polling 20, 3 receives) and an IAM user whose inline policy names only the actions and ARNs the code uses, including the KMS key; in SQL Server a login with SELECT and UPDATE on one table. API Manager got the instance with Client ID Enforcement and a contract for the carrier, and the app was deployed with secure properties and autodiscovery. I posted a POD with my own correlation ID and followed it through S3, the listener log and the order row. A POD for a late order failed three times and waited in the dead-letter queue; once the order was there I started a DLQ redrive and it went through. Then an alert and Production with its own bucket, queues, user, key and database, and one real POD there.`,
  docs: 'https://docs.mulesoft.com/amazon-sqs-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, 'Proof of Delivery API')
    s = saveProject(s, s.projects.at(-1).id, RAML)
    s = mark(s, 'mock')
    s = publish(s, s.projects.at(-1).id, { assetId: ASSET, name: 'Proof of Delivery API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = createQueue(s, { name: DLQ, visibility: 30, retention: 1209600, wait: 20, delay: 0 }).state
    s = createQueue(s, { name: QUEUE, visibility: 60, retention: 345600, wait: 20, delay: 0, dlq: DLQ, maxReceives: 3 }).state
    s = createUser(s, USER).state
    s = putPolicy(s, 'user', USER, 'pod-papi', policyDoc(
      { Sid: 'Pods', Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: arnBucket(BUCKET, 'pod/*') },
      { Sid: 'PodEvents', Effect: 'Allow', Action: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage'], Resource: arnQueue(QUEUE) },
      { Sid: 'PodKey', Effect: 'Allow', Action: ['kms:GenerateDataKey', 'kms:Decrypt'], Resource: keyArn(s) },
    )).state
    const k = createAccessKey(s, USER)
    s = k.state
    s = runSql(s, SRC, `CREATE LOGIN ${DB_USER} WITH PASSWORD = '${DB_PASSWORD}'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT, UPDATE ON dbo.orders TO ${DB_USER}`).state
    s = addApi(s, { assetId: ASSET, label: 'pod-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = applyPolicy(s, id, 'client-id')
    s = requestAccess(mark(s, 'env:Sandbox'), id, CALLER.name)
    const p = project(s)
    const jar = { pkg: p.pkg, jar: p.jar, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1 }
    s = finishDeploys(deployApp(s, { name: AWS_PKG, ...jar, props: { 'aws.region': REGION, 'aws.accessKeyId': k.result.id, 's3.bucket': BUCKET, 'sqs.queueUrl': queueUrl(QUEUE), 'db.host': 'sql.brightmart.lab', 'db.database': 'BrightmartOrders', 'db.user': DB_USER, 'api.id': id, 'anypoint.platform.client_id': s.creds.Sandbox.id }, secrets: { 'aws.secretAccessKey': k.result.secret, 'db.password': DB_PASSWORD, 'anypoint.platform.client_secret': s.creds.Sandbox.secret } }).state)
    const post = (x, body, env = 'Sandbox', cid = '') => callApi(x, { env, app: AWS_PKG, method: 'POST', path: '/pods', body, cid, client: CALLER.name, clientId: CALLER.clientId, clientSecret: CALLER.clientSecret }).state
    s = post(s, POD_BODY('SL-40031', 'O-1006'), 'Sandbox', CID)
    s = mark(s, `aws:s3:${BUCKET}:Objects`)
    s = advance(s, 2 * MINUTE)
    s = runSql(mark(s, `logs:${AWS_PKG}`), SRC, "SELECT order_id, status FROM dbo.orders WHERE order_id = 'O-1006'").state
    s = post(s, POD_BODY('SL-40077', 'O-1012'))
    s = pollFromConsole(advance(s, 5 * MINUTE), DLQ).state
    s = runSql(s, SRC, LATE_ORDER).state
    s = startRedrive(advance(s, MINUTE), DLQ).state
    s = advance(s, 2 * MINUTE)
    s = addMonAlert(s, { title: 'POD errors', resource: 'Application', name_: AWS_PKG, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: false, alerts: false })
    const prd = s.lastApi
    s = requestAccess(mark(s, 'env:Production'), prd, CALLER.name)
    const pk = activeKey(s, PRD.user)
    s = finishDeploys(deployApp(s, { name: AWS_PKG, ...jar, props: { 'aws.region': REGION, 'aws.accessKeyId': pk.id, 's3.bucket': PRD.bucket, 'sqs.queueUrl': queueUrl(PRD.queue), 'db.host': PRD.dbHost, 'db.database': 'BrightmartOrders', 'db.user': DB_USER, 'api.id': prd, 'anypoint.platform.client_id': s.creds.Production.id }, secrets: { 'aws.secretAccessKey': pk.secret, 'db.password': PRD.dbPassword, 'anypoint.platform.client_secret': s.creds.Production.secret } }).state)
    s = post(s, POD_BODY('SL-50001', 'O-1007'), 'Production')
    return advance(s, 2 * MINUTE)
  },
  answers: { 5: 1, 14: 1, 17: 1 },
}

export const LABS = [lab]
