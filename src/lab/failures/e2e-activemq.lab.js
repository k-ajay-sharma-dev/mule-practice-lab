// The end to end lab of ActiveMQ. See platform-labs.js for the shape of a lab.
//
// One integration from the request mail to Production: the Refunds System API is designed, published, built in Studio
// (state.studioPkgs), protected in API Manager and deployed. It sends each refund as a persistent JMS message to an
// ActiveMQ Classic queue. The refund writer of the finance team takes it and writes it into the finance database. Its
// jar comes with a Mule configuration that loses a refund the database refuses; the learner fixes the XML in the Flow
// editor (a transacted listener, a redelivery limit, an error that leaves the flow), sees the refund land in its own
// dead letter queue, fixes the cause and retries it. Production has its own broker pair and database.
import { addMonAlert, advance, at, deployXml, mark, MINUTE, newPlatform } from '../platform.js'
import { ask, call, called, OPS, until } from '../platform-kit.js'
import { addAuthEntry, addPolicyEntry, addUser, allowed, AMQ, brokerOf, classicBroker, createDestination, dlqNameOf, parseUrl, restartNode, retryMessage } from '../platform-jms.js'
import { parseMule } from '../platform-xml.js'
import { runSql } from '../platform-db.js'
import { alerted, appOf, contracted, e2e, isSecret, linked, propsOf, PRD, rowsOf, SBX, sqlServer } from '../platform-e2e-kit.js'
import { AMQ_PRD, API_PKG, ASSET, CAD, CURRENCIES, DATABASE, DB, DB_PRD, DB_USER, DLQ, FIXED_XML, GROUPS, QUEUE, REFUND, START_XML, TABLE, URL_PRD, URL_SBX, USERS, WRITER_PKG, writerConfig } from './e2e-activemq.pkg.js'

const ALERTS = 'finance-integration@brightmart.example'
const NAME = 'Refunds System API'
const CLIENT = 'Brightmart Returns Service'
const HOST = 'sql.brightmart.lab'
const HOST_PRD = 'sql-prd.brightmart.lab'
const DB_PW = { sbx: 'Finance-Lab-2026', prd: 'Finance-Prd-Lab-2026' }
const PRD_PW = { api: 'Refunds-Prd-Lab-26', writer: 'Finance-Prd-Lab-26' }
// the passwords the solution gives the two users; the learner chooses their own
const SBX_PW = { api: 'Refunds-Lab-2026', writer: 'Finance-Lab-26' }

const RAML = `#%RAML 1.0
title: Refunds System API
version: v1
mediaType: application/json
types:
  Refund:
    properties:
      refundId: string
      returnId: string
      orderId: string
      amount: number
      currency: string
  Submitted:
    properties:
      refundId: string
      status: string
/refunds:
  post:
    description: Send a refund to finance. It is booked in the ledger later.
    body:
      type: Refund
    responses:
      202:
        body:
          type: Submitted
          example: |
            { "refundId": "RF-90001", "status": "SUBMITTED" }
  /{refundId}:
    get:
      description: Whether a refund was sent
      responses:
        200:
          body:
            type: Submitted
            example: |
              { "refundId": "RF-90001", "status": "SUBMITTED" }
        404:
          body:
            example: |
              { "message": "No refund RF-90001" }
`

const CODE = `<!-- global element: the failover URL keeps the app working when amq2 takes over from amq1 -->
<jms:config name="Refunds_AMQ_Config">
  <jms:active-mq-connection username="\${jms.user}" password="\${jms.password}">
    <jms:factory-configuration brokerUrl="\${jms.url}"/>
  </jms:active-mq-connection>
</jms:config>

<!-- post:\\refunds: one persistent message per refund, the refundId as JMSCorrelationID -->
<ee:transform doc:name="Refund to message">
  <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
  refundId: payload.refundId,
  returnId: payload.returnId,
  orderId:  payload.orderId,
  amount:   payload.amount as Number,
  currency: upper(payload.currency)
}]]></ee:set-payload></ee:message>
</ee:transform>
<jms:publish config-ref="Refunds_AMQ_Config" destination="\${jms.queue}" persistentDelivery="true" doc:name="Send refund">
  <jms:message correlationId="#[payload.refundId]">
    <jms:properties>#[{ correlationId: correlationId }]</jms:properties>
  </jms:message>
</jms:publish>
<set-variable variableName="httpStatus" value="202"/>`

const broker = (s, env = SBX) => brokerOf(s, env === SBX ? AMQ : AMQ_PRD)
const groupsOf = (b, user) => b?.users[user]?.groups ?? []
// the entries that name a group of this user
const entriesOf = (b, user) => b.auth.filter((e) => [e.read, e.write, e.admin].some((x) => String(x ?? '').split(',').map((g) => g.trim()).some((g) => groupsOf(b, user).includes(g))))
const brokerOk = (s) => {
  const b = broker(s)
  if (!b?.queues[QUEUE] || b.pending || dlqNameOf(b, QUEUE) !== DLQ) return false
  const narrow = (user) => groupsOf(b, user).length > 0 && !groupsOf(b, user).includes('admins') && entriesOf(b, user).length > 0 && entriesOf(b, user).every((e) => e.type === 'queue' && e.match === QUEUE) && !allowed(b, user, 'queue', QUEUE, 'admin')
  return narrow(USERS.api) && narrow(USERS.writer) && allowed(b, USERS.api, 'queue', QUEUE, 'write') && !allowed(b, USERS.api, 'queue', QUEUE, 'read') && allowed(b, USERS.writer, 'queue', QUEUE, 'read') && !allowed(b, USERS.writer, 'queue', QUEUE, 'write')
}
const failover = (p, env) => {
  const u = parseUrl(p['jms.url'])
  const hosts = u.hosts.map((h) => h.host)
  const suffix = env === SBX ? '' : '-prd'
  return u.failover && hosts.includes(`amq1${suffix}.brightmart.lab`) && hosts.includes(`amq2${suffix}.brightmart.lab`)
}
const jmsOk = (s, a, env, user) => {
  const p = propsOf(a)
  return Boolean(a) && failover(p, env) && p['jms.queue'] === QUEUE && p['jms.user'] === user && isSecret(a, 'jms.password', broker(s, env)?.users[user]?.password)
}
const sapi = (s, env = SBX) => appOf(s, API_PKG, env)
const writer = (s, env = SBX) => appOf(s, WRITER_PKG, env)
const apiOk = (s, env = SBX) => linked(s, ASSET, API_PKG, env) && jmsOk(s, sapi(s, env), env, USERS.api)
const writerOk = (s, env = SBX) => {
  const a = writer(s, env)
  const p = propsOf(a)
  return jmsOk(s, a, env, USERS.writer) && String(p['db.host']).trim() === (env === SBX ? HOST : HOST_PRD) && p['db.database'] === DATABASE && p['db.user'] === DB_USER && isSecret(a, 'db.password', env === SBX ? DB_PW.sbx : DB_PW.prd)
}
// the deployed configuration: transacted listener, 1 to 5 redeliveries, the DB error leaves the flow, the insert does not join
const xmlFixed = (s, env = SBX) => {
  const a = writer(s, env)
  const m = a?.xml ? parseMule(a.xml) : null
  if (!m?.ok) return false
  const c = writerConfig(m, propsOf(a))
  return c.ok && c.queue === QUEUE && c.transacted && !c.swallows && c.maxRedelivery >= 1 && c.maxRedelivery <= 5 && !c.insertJoins
}
const refunds = (s, server = DB) => rowsOf(s, server, TABLE)
const failedTimes = (s, id) => writer(s)?.store?.failed?.[id] ?? 0
const inDlq = (s) => (broker(s)?.queues[DLQ]?.messages ?? []).some((m) => m.origin === `queue://${QUEUE}` && /"currency":"CAD"/.test(m.body))
const cadBooked = (s) => refunds(s).some((r) => r.refund_id === 'RF-90002' && r.currency_code === 'CAD')

const lab = {
  id: 'p-e2e-activemq',
  group: 'End to end by system',
  title: 'End to end: refunds, the returns service to the finance database over ActiveMQ',
  minutes: 60,
  scenario: `Finance wants every refund the returns service approves booked in the finance database, with nothing lost and nothing booked twice. The path: the returns service calls the ${NAME} (a Mule app you design and build), which sends one persistent JMS message per refund to ${QUEUE} on the ActiveMQ Classic pair ${AMQ}. The ${WRITER_PKG} app of the finance team takes each message and writes it into ${TABLE} on SQL Server. Its Mule configuration came with the jar, and you will read it closely. You take it from the request mail to Production.`,
  start() {
    const clock = at(1, 13, 40)
    const base = classicBroker(clock)
    const node = (name, role) => ({ name, host: `${name}-prd.brightmart.lab`, aliases: [], port: 61616, web: 8161, role, up: true, since: clock, downUntil: null })
    const prd = classicBroker(clock, {
      name: AMQ_PRD,
      nodes: [node('amq1', 'master'), node('amq2', 'slave')],
      users: { admin: { password: 'admin-prd-lab', groups: ['admins'] }, [USERS.api]: { password: PRD_PW.api, groups: [GROUPS.api] }, [USERS.writer]: { password: PRD_PW.writer, groups: [GROUPS.writer] } },
      auth: [...base.auth.filter((e) => e.read === 'admins'), { type: 'queue', match: QUEUE, read: GROUPS.writer, write: GROUPS.api, admin: '' }],
      config: { ...base.config, policies: [{ match: QUEUE, strategy: 'individual', queuePrefix: 'DLQ.', useQueueForQueueMessages: true, memoryLimit: 0 }] },
      history: [{ t: clock, text: `Broker ${AMQ_PRD} started on amq1. amq2 waits for the lock on the shared store.` }],
    })
    let s = newPlatform({
      clock,
      jars: [{ pkg: WRITER_PKG, xml: START_XML }],
      studioPkgs: { [ASSET]: API_PKG },
      jms: { created: clock, brokers: { [AMQ]: base, [AMQ_PRD]: prd } },
      databases: { created: clock, servers: { [DB]: sqlServer(DB, HOST, DATABASE, DB_USER, DB_PW.sbx), [DB_PRD]: sqlServer(DB_PRD, HOST_PRD, DATABASE, DB_USER, DB_PW.prd) } },
      mail: [
        {
          t: at(1, 13, 30),
          to: OPS,
          subject: 'Refunds to the finance database over ActiveMQ',
          body: `Hello, here is the refund feed we need in Sandbox.\n\nTrigger: the returns service approves a refund, about 900 a day, and calls a new ${NAME} (POST /refunds). It must get an answer at once, also while the finance database is in its nightly maintenance. The API sends one persistent message per refund to ${QUEUE} on ${AMQ} (${URL_SBX}). Create the queue up front: apps do not create queues on this broker.\n\nFields: refundId, returnId, orderId, amount, currency. The database stores refund_id, return_id, order_id, amount and currency_code (upper case).\n\nErrors: a refund that fails is tried 4 times in all, then parked in its own dead letter queue ${DLQ}, not in ActiveMQ.DLQ. Never lost, never booked twice.\n\nUsers: ${USERS.api} in group ${GROUPS.api} may only send to ${QUEUE}; ${USERS.writer} in group ${GROUPS.writer} may only read it. Choose passwords of at least 8 characters and keep them protected. The writer jar of my team is in Runtime Manager: ${WRITER_PKG}. Finance database: ${HOST}, database ${DATABASE}, login ${DB_USER}, password ${DB_PW.sbx}.\n\nThe Canada stores open next week. We add CAD to ${CURRENCIES} once the ledger team approves it.\n\nThe returns service must use a client ID. Alerts to ${ALERTS}.\n\nProduction: broker ${AMQ_PRD} (${URL_PRD}), queue, policy and users made by the middleware team: ${USERS.api} ${PRD_PW.api}, ${USERS.writer} ${PRD_PW.writer}. Database ${HOST_PRD}, ${DB_USER} ${DB_PW.prd}.\n\nTom, Finance Systems`,
          source: 'Brightmart Finance Systems',
        },
      ],
    })
    s = createDestination(s, AMQ_PRD, 'queue', QUEUE).state
    return until(s, at(1, 13, 50))
  },
  steps: [
    e2e.read('the trigger, the fields, the number of tries and the dead letter queue, the two users and their rights, the database login, the note about CAD and who gets the alerts'),
    ...e2e.design({ name: NAME, assetId: ASSET, raml: RAML, routes: [['POST', '/refunds'], ['GET', '/refunds/RF-90001']], tryIt: 'POST /refunds', why: 'POST answers 202: the refund is accepted now and booked later.' }),
    e2e.studio({ name: NAME, assetId: ASSET, code: CODE, how: 'The JMS config takes the failover URL and the user from properties, and the publish sends a persistent message with the refundId as its JMSCorrelationID.' }),
    ask(
      'Persistent and failover',
      'Why does the API send persistent messages over a failover: URL?',
      [
        'Both make the broker faster',
        'A persistent message is written to the store before the broker confirms the send, so it survives a broker restart, and ActiveMQ Classic moves only persistent messages to a dead letter queue by default. The failover transport reconnects to amq2 when it takes over the shared store, so the API keeps sending',
        'Failover makes every message go to both brokers',
        'Persistent messages never expire, so the dead letter queue is not needed',
      ],
      1,
      'Non persistent messages live in memory and are lost when the broker stops; Classic also drops them instead of sending them to the dead letter queue unless processNonPersistent is set. A plain tcp:// URL points at one node, so a master change stops the app until someone changes the URL.',
    ),
    {
      title: 'Set up the queue, its dead letter queue and two users',
      how: `ActiveMQ, ${AMQ}, Queues: Queue Name ${QUEUE}, Create. Broker config (lab page), Add a policyEntry: queue ${QUEUE}, Dead letter strategy individualDeadLetterStrategy, queuePrefix DLQ. so the dead letter queue is ${DLQ}. Users (lab page), Add user: ${USERS.api}, a password, Groups ${GROUPS.api}; Add user: ${USERS.writer}, a password, Groups ${GROUPS.writer}. Add entry: Type queue, Destination ${QUEUE}, read ${GROUPS.writer}, write ${GROUPS.api}, admin empty. Classic reads activemq.xml when it starts, so Home, Nodes, Restart on amq1: amq2 takes the lock and starts with all of it.`,
      done: brokerOk,
    },
    e2e.manage({ name: NAME, assetId: ASSET, label: 'refunds-sbx' }),
    e2e.export({ assetId: ASSET }),
    {
      title: `Deploy the ${NAME} and see the instance Active`,
      how: `Runtime Manager, Deploy application. Name refunds-sapi, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: jms.url=${URL_SBX}, jms.queue=${QUEUE}, jms.user=${USERS.api}, api.id=the API Instance ID, anypoint.platform.client_id, and as protected properties jms.password and anypoint.platform.client_secret. Deploy. API Manager shows the instance Active.`,
      done: (s) => apiOk(s),
    },
    {
      title: `Deploy ${WRITER_PKG}`,
      how: `Deploy application: Name finance-refund-writer, Application File ${WRITER_PKG}-1.0.0-mule-application.jar. Properties: jms.url, jms.queue=${QUEUE}, jms.user=${USERS.writer}, db.host=${HOST}, db.database=${DATABASE}, db.user=${DB_USER}, and as protected properties jms.password and db.password. Its configuration uses \${} placeholders for all of them, so a missing one stops the start. Then open it in Lab tools, Flow editor, and read refund-writer-flow on the Message Flow and Configuration XML tabs.`,
      done: (s) => writerOk(s),
    },
    {
      title: 'Send one refund and follow it to the finance database',
      how: `Exchange, ${NAME}, Request access: the Sandbox instance, Create a new application named ${CLIENT}. API client: refunds-sapi, Send as ${CLIENT}, POST /refunds with ${REFUND} and an X-Correlation-ID such as rf-test-1: 202. Move the clock a minute. Logs of refunds-sapi: sent with your correlation ID. Logs of finance-refund-writer: the same ID, booked in ${TABLE}. ActiveMQ, Queues: ${QUEUE} has 0 pending, 1 enqueued, 1 dequeued. Databases, ${DB}, New Query: SELECT * FROM ${TABLE} WHERE refund_id = 'RF-90001'; Execute.`,
      done: (s) => contracted(s, ASSET) && Boolean(sapi(s)) && called(s, sapi(s).name, 202, 'POST', /^\/refunds$/) && refunds(s).some((r) => r.refund_id === 'RF-90001') && Boolean(s.seen[`logs:${writer(s)?.name}`]) && (s.seen[`db-select:${DB}:${TABLE}`] ?? -1) >= 0,
    },
    {
      title: 'Watch a refund get lost',
      how: `A Canada store sent a refund early. API client: POST /refunds as ${CLIENT} with ${CAD}. Move the clock a minute. The writer log shows DB:QUERY_EXECUTION, a FOREIGN KEY conflict on currency_code, handled by On Error Continue, and the message acknowledged. ${QUEUE} is empty, no dead letter queue has it, and ${TABLE} has no RF-90002.`,
      done: (s) => (writer(s)?.store?.lost ?? []).some((x) => x.refundId === 'RF-90002'),
    },
    ask(
      'Why it is gone',
      'Why did the broker delete a refund that was never booked?',
      [
        'The broker deletes every message after 1 minute',
        'The listener runs with ackMode AUTO and no transaction, and AUTO acknowledges when the flow ends with success. On Error Continue for DB:QUERY_EXECUTION turns the error into a success, so the message was acknowledged and deleted, and nothing will try again',
        'The message was not persistent',
        'The writer user has no right to read the queue',
      ],
      1,
      'On Error Continue is right when the error is handled for good, for example by writing the refund somewhere else. Here it only logs, so the error is swallowed. For a queue listener the error must leave the flow (On Error Propagate, or no handler), so the message is not acknowledged and comes again.',
    ),
    {
      title: 'Fix the flow in the Mule XML',
      how: `Flow editor, finance-refund-writer, Configuration XML. Three changes: on the jms:listener add transactionalAction="ALWAYS_BEGIN", so the message is acknowledged only when the flow commits; on jms:factory-configuration add maxRedelivery="3", so the 4th delivery is the last; change on-error-continue to on-error-propagate (both tags). The db:insert cannot join a local JMS transaction of another config: give it transactionalAction="NOT_SUPPORTED", and its IF NOT EXISTS keeps a redelivery from booking twice. Deploy to Sandbox. A typo shows up as a Failed to deploy artifact line, and the running config keeps working.`,
      done: (s) => xmlFixed(s),
    },
    {
      title: 'Send the CAD refund again and find it in the dead letter queue',
      how: `API client: POST /refunds as ${CLIENT} with ${CAD} again. Move the clock a minute. The writer log shows the transaction rolled back on deliveries 1 to 3, then on delivery 4 the poison ack and the move to ${DLQ}. ActiveMQ, Queues, ${DLQ}, Browse: the message is there, and its dlqDeliveryFailureCause names the error.`,
      done: (s) => xmlFixed(s) && Boolean(s.seen[`jms-dest:${DLQ}`]) && failedTimes(s, 'RF-90002') >= 2 && (inDlq(s) || cadBooked(s)),
    },
    {
      title: 'Add CAD and retry the refund',
      how: `The ledger team approved CAD. Databases, ${DB}, New Query: INSERT INTO ${CURRENCIES} (currency_code, name) VALUES ('CAD', 'Canadian dollar'); Execute. Then ActiveMQ, Queues, ${DLQ}, Browse, open the message, Retry: it goes back to ${QUEUE} with its redelivery count reset. Move the clock a minute. The log books RF-90002, and SELECT * FROM ${TABLE} WHERE refund_id = 'RF-90002'; shows it with currency_code CAD.`,
      done: (s) => xmlFixed(s) && cadBooked(s) && !inDlq(s),
    },
    ask(
      'Local transaction, XA or idempotent',
      'The JMS transaction does not cover the database insert. What keeps a refund from being lost or booked twice?',
      [
        'Nothing, only XA is safe',
        'The JMS transaction makes sure the message is acknowledged only after the flow worked, so nothing is lost. If the insert commits and the JMS commit then fails, the message comes again, and the IF NOT EXISTS on refund_id makes that second delivery a no-op. XA would commit both together, at the cost of a transaction manager, slower commits and in doubt transactions',
        'The dead letter queue removes duplicates',
        'Persistent messages are delivered exactly once',
      ],
      1,
      'A local transaction is bound to one connector config. JMS plus an idempotent write gives at least once delivery with exactly once effect, which is what most teams run. XA (transactionType XA with an XA connection factory and driver) joins both resources in a two phase commit and is kept for cases that cannot be made idempotent.',
    ),
    {
      title: 'Alert finance on failures',
      how: `Monitoring, Alerts, Create Alert: Resource type Application, finance-refund-writer, Metric Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: (s) => alerted(s, WRITER_PKG, ALERTS),
    },
    e2e.promote({ name: NAME, assetId: ASSET }),
    {
      title: 'Deploy both apps to Production',
      how: `Runtime Manager in Production. refunds-sapi from the same jar: jms.url=${URL_PRD}, the Production jms.password of ${USERS.api}, api.id = the Production instance ID, the Production client ID and secret. finance-refund-writer from its jar with the Production broker, password, db.host=${HOST_PRD} and db.password. The jar still has the old XML: open the Flow editor in Production and deploy the same three changes. In a real project the fix goes into the source and a new jar version, so both environments run the same build.`,
      done: (s) => apiOk(s, PRD) && writerOk(s, PRD) && xmlFixed(s, PRD),
    },
    {
      title: 'See one refund arrive in Production',
      how: `Exchange, Request access for ${CLIENT} on the Production instance. API client in Production: POST /refunds as ${CLIENT} with ${REFUND}. Move the clock a minute. Databases, ${DB_PRD}: SELECT * FROM ${TABLE}; shows the refund.`,
      done: (s) => contracted(s, ASSET, PRD) && refunds(s, DB_PRD).some((r) => Object.keys(sapi(s, PRD)?.store?.sent ?? {}).includes(r.refund_id)),
    },
  ],
  why: `Finance needed every approved refund booked once, so the returns service calls a Refunds System API that I designed in Design Center with POST /refunds answering 202, tried on the mock and published to Exchange. In Studio the API maps the refund in DataWeave and sends a persistent JMS message over a failover: URL, with the refundId as JMSCorrelationID. On ActiveMQ Classic I created the queue up front, a policyEntry with an individual dead letter queue, and two users whose groups can only send or only read that one queue, then restarted so the broker read activemq.xml. In API Manager the instance has Client ID Enforcement and the app is linked by API Autodiscovery, with passwords as protected properties. I followed one refund by its correlation ID from the API log to the queue counts, the writer log and the row in the finance database. A refund in a new currency then vanished: the writer had On Error Continue and an AUTO ack with no transaction, so the error was swallowed and the message acknowledged. I fixed the Mule XML: a transacted listener, maxRedelivery 3, On Error Propagate, and the insert outside the JMS transaction with an IF NOT EXISTS so a redelivery cannot book twice. The next one rolled back four times and went to its dead letter queue; once finance added the currency I retried it and it was booked. An alert on errors goes to finance, and Production runs the same jars with its own broker, database, instance ID and credentials. In the lab the redeliveries come at once, without the redelivery delay.`,
  docs: 'https://docs.mulesoft.com/jms-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = e2e.designSolve(s, { name: NAME, assetId: ASSET, raml: RAML })
    s = createDestination(s, AMQ, 'queue', QUEUE).state
    s = addPolicyEntry(s, AMQ, { match: QUEUE, strategy: 'individual', queuePrefix: 'DLQ.' }).state
    s = addUser(s, AMQ, { name: USERS.api, password: SBX_PW.api, groups: GROUPS.api }).state
    s = addUser(s, AMQ, { name: USERS.writer, password: SBX_PW.writer, groups: GROUPS.writer }).state
    s = addAuthEntry(s, AMQ, { type: 'queue', match: QUEUE, read: GROUPS.writer, write: GROUPS.api, admin: '' }).state
    s = restartNode(s, AMQ, 'amq1', 1).state
    s = e2e.manageSolve(s, ASSET, 'refunds-sbx')
    s = e2e.exportSolve(s, ASSET)
    const jms = (url, user, pw) => ({ props: { 'jms.url': url, 'jms.queue': QUEUE, 'jms.user': user }, secrets: { 'jms.password': pw } })
    const writerOf = (url, pw, host, dbPw) => {
      const j = jms(url, USERS.writer, pw)
      return { props: { ...j.props, 'db.host': host, 'db.database': DATABASE, 'db.user': DB_USER }, secrets: { ...j.secrets, 'db.password': dbPw } }
    }
    s = e2e.deployStudio(s, { name: 'refunds-sapi', assetId: ASSET, ...jms(URL_SBX, USERS.api, SBX_PW.api) })
    s = e2e.deployJar(s, { name: 'finance-refund-writer', pkg: WRITER_PKG, ...writerOf(URL_SBX, SBX_PW.writer, HOST, DB_PW.sbx) })
    s = e2e.accessSolve(s, ASSET, CLIENT)
    const client = () => s.clients.find((c) => c.name === CLIENT)
    s = advance(call(s, 'refunds-sapi', client(), '/refunds', 'POST', REFUND).state, MINUTE)
    s = mark(mark(s, 'logs:refunds-sapi'), 'logs:finance-refund-writer')
    s = runSql(s, DB, `SELECT * FROM ${TABLE} WHERE refund_id = 'RF-90001';`).state
    s = advance(call(s, 'refunds-sapi', client(), '/refunds', 'POST', CAD).state, MINUTE)
    s = deployXml(mark(s, 'xml:finance-refund-writer'), 'finance-refund-writer', FIXED_XML).state
    s = advance(call(s, 'refunds-sapi', client(), '/refunds', 'POST', CAD).state, MINUTE)
    s = mark(s, `jms-dest:${DLQ}`)
    s = runSql(s, DB, `INSERT INTO ${CURRENCIES} (currency_code, name) VALUES ('CAD', 'Canadian dollar');`).state
    const dead = brokerOf(s, AMQ).queues[DLQ].messages.find((m) => /CAD/.test(m.body))
    s = advance(retryMessage(s, AMQ, DLQ, dead.id).state, MINUTE)
    s = addMonAlert(s, { title: 'Refund not booked', resource: 'Application', name_: 'finance-refund-writer', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
    s = e2e.promoteSolve(s, ASSET)
    s = e2e.deployStudio(s, { name: 'refunds-sapi', assetId: ASSET, ...jms(URL_PRD, USERS.api, PRD_PW.api) })
    s = e2e.deployJar(s, { name: 'finance-refund-writer', pkg: WRITER_PKG, ...writerOf(URL_PRD, PRD_PW.writer, HOST_PRD, DB_PW.prd) })
    s = deployXml(s, 'finance-refund-writer', FIXED_XML).state
    s = e2e.accessSolve(s, ASSET, CLIENT)
    return advance(call(s, 'refunds-sapi', client(), '/refunds', 'POST', REFUND).state, MINUTE)
  },
  answers: { 5: 1, 13: 1, 17: 1 },
}

export const LABS = [lab]
