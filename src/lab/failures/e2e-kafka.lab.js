// The end to end lab of Kafka. See platform-labs.js for the shape of a lab.
//
// One integration from the request mail to Production: the Order Events API is designed in Design Center, published,
// built in Studio (state.studioPkgs gives the project the package of the team), protected in API Manager and deployed.
// It publishes each order to a Kafka topic, keyed by orderId. The warehouse consumer reads the topic in a group and
// writes the order into the warehouse database. An order of a region nobody routes goes to the dead letter topic and is
// replayed after the fix. Production has its own cluster and database, set up by the platform team.
//
// The first half of this file is a small kit the end to end labs of Kafka, Anypoint MQ, ActiveMQ and Service Bus share.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, createClient, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, pairing, projectRaml, promoteApi, publish, ramlErrors, requestAccess, runNow, saveProject, setStudio } from '../platform.js'
import { ask, call, called, creds, OPS, until, withProp } from '../platform-kit.js'
import { addAcl, authorized, createTopic, newCluster, newKafka } from '../platform-kafka.js'
import { newSqlServer, runSql, serverOf, tablesOf } from '../platform-db.js'
import { API_PKG, API_USER, ASSET, bootstrapOf, CLUSTER, CLUSTER_PRD, CONSUMER_PKG, DATABASE, DB, DB_PRD, DB_USER, DLT, GROUP, NORTH, ORDER, PW, REPLAY_GROUP, ROUTES, routesOf, TABLE, TOPIC, WMS_USER, clusterOf } from './e2e-kafka.pkg.js'

import { SBX, PRD, apiOf, appOf, propsOf, isSecret, specOk, linked, contracted, clientIdOn, alerted, rowsOf, sqlServer, e2e } from '../platform-e2e-kit.js'

// ---------- the lab ----------

const ALERTS = 'warehouse-oncall@brightmart.example'
const NAME = 'Order Events API'
const CLIENT = 'Brightmart Web Shop'
const RETENTION = '604800000'
const SBX_HOST = 'sql.brightmart.lab'
const PRD_HOST = 'sql-prd.brightmart.lab'

const RAML = `#%RAML 1.0
title: Order Events API
version: v1
mediaType: application/json
types:
  Line:
    properties:
      sku: string
      qty: integer
  Order:
    properties:
      orderId: string
      customerId: string
      shipTo:
        properties:
          region: string
          city: string
      lines: Line[]
      total: number
  Published:
    properties:
      orderId: string
      topic: string
      partition: integer
      offset: integer
/order-events:
  post:
    description: Publish the event of a new order for the warehouse
    body:
      type: Order
    responses:
      202:
        body:
          type: Published
          example: |
            { "orderId": "O-50017", "topic": "order-events.v1", "partition": 3, "offset": 1042 }
  /{orderId}:
    get:
      description: Where the event of one order went
      responses:
        200:
          body:
            type: Published
            example: |
              { "orderId": "O-50017", "topic": "order-events.v1", "partition": 3, "offset": 1042 }
        404:
          body:
            example: |
              { "message": "No event was published for O-50017" }
`

const CODE = `<!-- global elements: every value that changes per environment is a property -->
<kafka:producer-config name="Kafka_Producer_Config">
  <kafka:producer-sasl-scram-connection username="\${kafka.username}" password="\${kafka.password}"
      encryptionType="SHA_512" acks="ALL">
    <kafka:bootstrap-servers>
      <kafka:bootstrap-server value="\${kafka.bootstrapServers}"/>
    </kafka:bootstrap-servers>
  </kafka:producer-sasl-scram-connection>
</kafka:producer-config>

<!-- post:\\order-events: the order becomes an event, keyed by orderId -->
<set-variable variableName="orderId" value="#[payload.orderId]"/>
<ee:transform doc:name="Order to event">
  <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
  orderId:    payload.orderId,
  customerId: payload.customerId,
  region:     lower(payload.shipTo.region),
  lineCount:  sizeOf(payload.lines),
  total:      payload.total,
  status:     "CREATED",
  occurredAt: now()
}]]></ee:set-payload></ee:message>
</ee:transform>
<kafka:publish config-ref="Kafka_Producer_Config" topic="\${kafka.topic}" key="#[vars.orderId]"
    doc:name="Publish order event">
  <kafka:headers>#[{ correlationId: correlationId }]</kafka:headers>
</kafka:publish>

<!-- in wms-order-consumer: the listener commits by hand once the row is written -->
<kafka:message-listener config-ref="Kafka_Consumer_Config" ackMode="MANUAL"/>
<db:insert config-ref="Wms_Database_Config" doc:name="Insert order">
  <db:sql>INSERT INTO dbo.wms_orders (order_id, customer_id, region, warehouse, line_count, total, status)
          VALUES (:orderId, :customerId, :region, :warehouse, :lineCount, :total, 'RECEIVED')</db:sql>
</db:insert>
<kafka:commit config-ref="Kafka_Consumer_Config" commitKey="#[attributes.consumerCommitKey]"/>`

const cluster = (s, name = CLUSTER) => s.kafka?.clusters?.[name]
const topicOf = (s, name, c = CLUSTER) => cluster(s, c)?.topics?.[name]
const can = (s, user, resource, name, op) => Boolean(cluster(s)) && authorized(cluster(s), `User:${user}`, resource, name, op)
const topicsOk = (s) => {
  const t = topicOf(s, TOPIC)
  const d = topicOf(s, DLT)
  return Boolean(t && d) && t.partitions.length >= 6 && t.partitions.length <= 12 && t.partitions[0].replicas.length === 3 && t.config['min.insync.replicas'] === '2' && d.partitions[0].replicas.length === 3
}
const aclsOk = (s) => {
  const c = cluster(s)
  if (!c || !topicsOk(s)) return false
  const wide = (c.acls ?? []).some((a) => a.permission === 'ALLOW' && (a.operation === 'ALL' || a.name === '*' || a.principal === 'User:*' || a.resource === 'CLUSTER'))
  return (
    !wide &&
    can(s, API_USER, 'TOPIC', TOPIC, 'WRITE') &&
    can(s, WMS_USER, 'TOPIC', TOPIC, 'READ') &&
    can(s, WMS_USER, 'GROUP', GROUP, 'READ') &&
    can(s, WMS_USER, 'GROUP', REPLAY_GROUP, 'READ') &&
    can(s, WMS_USER, 'TOPIC', DLT, 'WRITE') &&
    can(s, WMS_USER, 'TOPIC', DLT, 'READ') &&
    !can(s, API_USER, 'TOPIC', TOPIC, 'READ') &&
    !can(s, WMS_USER, 'TOPIC', TOPIC, 'WRITE')
  )
}
const apiApp = (s, env = SBX) => appOf(s, API_PKG, env)
const wms = (s, env = SBX) => appOf(s, CONSUMER_PKG, env)
const apiOk = (s, env = SBX) => {
  const a = apiApp(s, env)
  const p = propsOf(a)
  return linked(s, ASSET, API_PKG, env) && clusterOf(p) === (env === SBX ? CLUSTER : CLUSTER_PRD) && p['kafka.topic'] === TOPIC && p['kafka.username'] === API_USER && isSecret(a, 'kafka.password', env === SBX ? PW.api : PW.apiPrd)
}
const wmsOk = (s, env = SBX) => {
  const a = wms(s, env)
  const p = propsOf(a)
  const sbx = env === SBX
  return Boolean(a) && clusterOf(p) === (sbx ? CLUSTER : CLUSTER_PRD) && p['kafka.topic'] === TOPIC && p['kafka.dlt'] === DLT && p['kafka.groupId'] === GROUP && p['kafka.username'] === WMS_USER && isSecret(a, 'kafka.password', sbx ? PW.wms : PW.wmsPrd) && String(p['db.host']).trim() === (sbx ? SBX_HOST : PRD_HOST) && p['db.database'] === DATABASE && p['db.user'] === DB_USER && isSecret(a, 'db.password', sbx ? PW.db : PW.dbPrd) && routesOf(p).east === 'WH-E1' && routesOf(p).west === 'WH-W2'
}
const published = (s, env = SBX) => Object.keys(apiApp(s, env)?.store?.published ?? {})
const stored = (s, server = DB) => rowsOf(s, server, TABLE)
const followed = (s) => {
  const ids = new Set(published(s))
  const row = stored(s).find((r) => ids.has(r.order_id) && r.region !== 'north')
  return Boolean(row) && Boolean(s.seen[`logs:${wms(s)?.name}`]) && Boolean(s.seen[`kafka-topic:${TOPIC}`]) && (s.seen[`db-select:${DB}:${TABLE}`] ?? -1) >= 0
}
const deadLetters = (s) => topicOf(s, DLT)?.partitions.flatMap((p) => p.messages) ?? []
const northDead = (s) => deadLetters(s).some((m) => m.headers?.['x-original-topic'] === TOPIC && /"region":"north"/.test(m.value ?? ''))
const northStored = (s) => stored(s).some((r) => r.region === 'north' && r.warehouse === 'WH-N3')

const lab = {
  id: 'p-e2e-kafka',
  group: 'End to end by system',
  title: 'End to end: order events, the order API to the warehouse over Kafka',
  minutes: 60,
  scenario: `Brightmart moves the warehouse off the nightly order file. Each new order of the web shop must reach the warehouse database within a minute. The path: the web shop calls the ${NAME} (a Mule app you design and build), which publishes an order event to the Kafka topic ${TOPIC} on ${CLUSTER}, keyed by orderId. The ${CONSUMER_PKG} app of the warehouse team reads the topic in the consumer group ${GROUP} and writes each order into ${TABLE} on SQL Server. You take it from the request mail to Production: design, build, Kafka setup, API Manager, deployment, one order followed end to end, a failure, an alert and the go live.`,
  start() {
    const clock = at(1, 8, 50)
    const prd = newCluster(CLUSTER_PRD, 3, { authorizer: true, scram: { admin: 'admin-prd-lab', [API_USER]: PW.apiPrd, [WMS_USER]: PW.wmsPrd } })
    let s = newPlatform({
      clock,
      jars: [CONSUMER_PKG],
      studioPkgs: { [ASSET]: API_PKG },
      kafka: newKafka({ clusters: { [CLUSTER]: newCluster(CLUSTER, 3, { authorizer: true, scram: { admin: 'admin-lab-26', [API_USER]: PW.api, [WMS_USER]: PW.wms } }), [CLUSTER_PRD]: prd } }),
      databases: { created: clock, servers: { [DB]: sqlServer(DB, SBX_HOST, DATABASE, DB_USER, PW.db), [DB_PRD]: sqlServer(DB_PRD, PRD_HOST, DATABASE, DB_USER, PW.dbPrd) } },
      mail: [
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Order events to the warehouse: Kafka integration',
          body: `Hello, here is what we agreed for the warehouse feed.\n\nTrigger: every order the web shop creates, about 4000 a day and up to 15 a second at peak. The web shop calls a new ${NAME} (POST /order-events) and gets 202 back at once. The API publishes one event per order to ${TOPIC} on ${CLUSTER} (bootstrap ${bootstrapOf(CLUSTER)}). Events of one order must stay in order, and none may be lost when a broker goes down: replication factor 3, min.insync.replicas 2, keep events 7 days (${RETENTION} ms). The warehouse consumer runs 2 replicas today and up to 6 at peak.\n\nFields: orderId, customerId, shipTo.region, the lines and the total. The warehouse stores order_id, customer_id, region, warehouse, line_count and total. Routing (wms.warehouses): ${ROUTES}.\n\nThe consumer jar of my team is in Runtime Manager: ${CONSUMER_PKG}. It reads in the group ${GROUP}, and its replay flow uses ${REPLAY_GROUP}. An event it cannot route goes to ${DLT} (1 partition) and must never block the others.\n\nSCRAM users from the vault: ${API_USER} ${PW.api}, ${WMS_USER} ${PW.wms}. Each gets only the rights it needs. Warehouse database: ${SBX_HOST}, database ${DATABASE}, login ${DB_USER}, password ${PW.db}.\n\nCallers need a client ID. Failures of the consumer go to ${ALERTS}.\n\nProduction (next week): cluster ${CLUSTER_PRD} (bootstrap ${bootstrapOf(CLUSTER_PRD)}), topics and ACLs made by the platform team, passwords ${API_USER} ${PW.apiPrd} and ${WMS_USER} ${PW.wmsPrd}; database ${PRD_HOST}, ${DB_USER} ${PW.dbPrd}.\n\nPriya, Integration Architecture`,
          source: 'Brightmart Integration Architecture',
        },
      ],
    })
    // Production: the platform team made the topics and the ACLs
    s = createTopic(s, CLUSTER_PRD, { name: TOPIC, partitions: 6, replicationFactor: 3, config: { 'min.insync.replicas': '2', 'retention.ms': RETENTION } }).state
    s = createTopic(s, CLUSTER_PRD, { name: DLT, partitions: 1, replicationFactor: 3, config: {} }).state
    const allow = (user, resource, name, operation, pattern = 'LITERAL') => ({ principal: `User:${user}`, resource, name, pattern, operation, permission: 'ALLOW', host: '*' })
    for (const a of [allow(API_USER, 'TOPIC', TOPIC, 'WRITE'), allow(WMS_USER, 'TOPIC', TOPIC, 'READ'), allow(WMS_USER, 'GROUP', GROUP, 'READ', 'PREFIXED'), allow(WMS_USER, 'TOPIC', DLT, 'WRITE'), allow(WMS_USER, 'TOPIC', DLT, 'READ')]) s = addAcl(s, CLUSTER_PRD, a).state
    return until(s, at(1, 9))
  },
  steps: [
    e2e.read('the trigger and volumes, the fields, the topic settings, the users, the routing, the dead letter topic and who gets the alerts'),
    ...e2e.design({ name: NAME, assetId: ASSET, raml: RAML, routes: [['POST', '/order-events'], ['GET', '/order-events/O-50017']], tryIt: 'POST /order-events', why: 'POST answers 202, not 201: the API accepts the event, and the warehouse stores it later.' }),
    e2e.studio({ name: NAME, assetId: ASSET, code: CODE, how: 'The connector config holds only ${} placeholders, the DataWeave maps the order to the event, and the publish uses orderId as the key.' }),
    ask(
      'Key and partitions',
      'Why is the event keyed by orderId, and why does the topic need at least 6 partitions?',
      [
        'The key makes the event smaller, and Kafka needs 6 partitions for replication factor 3',
        'Records with the same key go to the same partition, and Kafka keeps order only inside a partition, so the events of one order stay in order. In one group each partition goes to one consumer, so 6 partitions let the warehouse scale to 6 replicas. Adding partitions later moves keys to other partitions, so size for the peak now',
        'Without a key the consumer cannot read the record',
        'The partition count must match the number of brokers',
      ],
      1,
      'The default partitioner hashes the key (murmur2) to pick the partition, so one orderId always lands in the same one while the partition count stays the same. Consumers above the partition count sit idle. With no key the records spread and the order of one order can break.',
    ),
    {
      title: `Create ${TOPIC} and its dead letter topic`,
      how: `Kafka, cluster ${CLUSTER}, Topics, Add a topic. Topic name ${TOPIC}, Number of partitions 6, Replication factor 3, Min in sync replicas 2, Time to retain data ${RETENTION}. Create topic. Add a topic again: ${DLT}, 1 partition, Replication factor 3.`,
      done: topicsOk,
    },
    {
      title: 'Give each user only the rights it needs',
      how: `Kafka, ACLs, Create ACL, one entry at a time, all ALLOW: User:${API_USER} WRITE on TOPIC ${TOPIC}; User:${WMS_USER} READ on TOPIC ${TOPIC}; User:${WMS_USER} READ on GROUP ${GROUP} with pattern PREFIXED, which covers ${REPLAY_GROUP} too; User:${WMS_USER} WRITE and READ on TOPIC ${DLT}. No ALL, no * and no CLUSTER rights. The cluster denies everything that has no ACL.`,
      done: aclsOk,
    },
    e2e.manage({ name: NAME, assetId: ASSET, label: 'order-events-sbx' }),
    e2e.export({ assetId: ASSET }),
    {
      title: `Deploy the ${NAME} and see the instance Active`,
      how: `Runtime Manager, Deploy application. Name order-events-api, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: kafka.bootstrapServers=${bootstrapOf(CLUSTER)}, kafka.topic=${TOPIC}, kafka.username=${API_USER}, api.id=the API Instance ID, anypoint.platform.client_id, and as protected properties kafka.password and anypoint.platform.client_secret. Deploy. When it runs, API Manager shows the instance Active.`,
      done: (s) => apiOk(s),
    },
    {
      title: `Deploy ${CONSUMER_PKG}`,
      how: `Deploy application: Name wms-order-consumer, Application File ${CONSUMER_PKG}-1.0.0-mule-application.jar, Replicas 2. Properties: kafka.bootstrapServers, kafka.topic=${TOPIC}, kafka.dlt=${DLT}, kafka.groupId=${GROUP}, kafka.username=${WMS_USER}, db.host=${SBX_HOST}, db.database=${DATABASE}, db.user=${DB_USER}, wms.warehouses=${ROUTES}, and as protected properties kafka.password and db.password. Deploy and move the clock a minute: Kafka, Consumers, ${GROUP} shows 2 members.`,
      done: (s) => wmsOk(s),
    },
    ask(
      'Commit after the write',
      `The consumer commits the offset by hand (ackMode MANUAL) after the row is written, and skips an order_id that is in the table already. Why both?`,
      [
        'MANUAL is faster than AUTO',
        'A commit after the write means a crash between the two reads the event again, so nothing is lost: that is at least once. The price is a possible second delivery, so the write must be idempotent: the lookup by order_id makes a second delivery harmless',
        'MANUAL makes Kafka deliver each event exactly once',
        'The lookup is needed because Kafka sends each event to every replica',
      ],
      1,
      'Kafka keeps the committed offset per group and partition. Commit before the work (IMMEDIATE) and a crash loses the event; commit after it and a crash repeats it. Exactly once across Kafka and a database needs the write and the offset in one transaction, which a plain JDBC insert does not give, so teams pair at least once with an idempotent write.',
    ),
    {
      title: 'Send one order through the API',
      how: `Exchange, ${NAME}, Request access: the Sandbox instance, Create a new application named ${CLIENT}. Then API client: application order-events-api, Send as ${CLIENT}, POST /order-events with the body ${ORDER}, and an X-Correlation-ID of your own such as wh-test-1. You get 202 with the partition and offset. Without a client application the policy answers 401.`,
      done: (s) => contracted(s, ASSET) && Boolean(apiApp(s)) && called(s, apiApp(s).name, 202, 'POST', /^\/order-events$/),
    },
    {
      title: 'Follow the order to the warehouse database',
      how: `Move the clock a minute. Runtime Manager, order-events-api, Logs: the publish line has your correlation ID, the partition and the offset. Kafka, Topics, ${TOPIC}: the record is in that partition with O-50017 as its key and correlationId in its headers. Logs of wms-order-consumer: the same correlation ID, stored in ${TABLE} with warehouse WH-E1. Databases, ${DB}, New Query: SELECT * FROM ${TABLE} WHERE order_id = 'O-50017'; and Execute. The row has the mapped values. SELECT COUNT(*) FROM ${TABLE}; matches the events sent, and Consumers, ${GROUP} shows lag 0.`,
      done: followed,
    },
    {
      title: 'Send an order nobody can route',
      how: `The new north store opened this week, and nobody added it to the routing. API client: POST /order-events as ${CLIENT} with ${NORTH}. Move the clock a minute. The consumer log shows MULE:EXPRESSION "No warehouse for region 'north'" and the event going to ${DLT}. Kafka, Topics, ${DLT}: the record has x-original-topic, x-original-partition, x-original-offset and x-exception headers. The lag of ${GROUP} is 0 again: one bad event does not block its partition.`,
      done: (s) => northDead(s) && (wms(s)?.store?.dlt ?? []).length > 0,
    },
    {
      title: 'Fix the routing and replay the dead letter',
      how: `The warehouse team says north ships from WH-N3. Runtime Manager, wms-order-consumer, Settings, Properties: wms.warehouses=${ROUTES},north:WH-N3, Apply Changes. Then Schedules, replay-dlt-flow (disabled on purpose, run by hand), Run. The log shows the order replayed into ${TABLE} with warehouse WH-N3. Check it with a SELECT in Databases.`,
      done: (s) => wmsOk(s) && routesOf(propsOf(wms(s))).north === 'WH-N3' && northStored(s) && Boolean(wms(s)?.schedules.find((x) => x.flow === 'replay-dlt-flow')?.last?.ok),
    },
    {
      title: 'Alert the warehouse on failures',
      how: `Monitoring, Alerts, Create Alert: Resource type Application, wms-order-consumer, Metric Message Error Count, Above 0 for 1 minute, recipient ${ALERTS} from the mail.`,
      done: (s) => alerted(s, CONSUMER_PKG, ALERTS),
    },
    e2e.promote({ name: NAME, assetId: ASSET }),
    {
      title: 'Deploy both apps to Production',
      how: `Runtime Manager in Production. Deploy order-events-api from the same jar with kafka.bootstrapServers=${bootstrapOf(CLUSTER_PRD)}, the Production kafka.password, api.id = the Production instance ID, and the Production client ID and secret. Deploy wms-order-consumer with the Production cluster and password, db.host=${PRD_HOST}, the Production db.password, and wms.warehouses with north included. Same jars, other properties. The Production instance turns Active.`,
      done: (s) => apiOk(s, PRD) && wmsOk(s, PRD) && routesOf(propsOf(wms(s, PRD))).north === 'WH-N3',
    },
    {
      title: 'See one order arrive in Production',
      how: `Exchange, ${NAME}, Request access for ${CLIENT} on the Production instance: contracts do not travel with a promotion. API client in Production: POST /order-events as ${CLIENT}. Move the clock a minute. Databases, ${DB_PRD}: SELECT * FROM ${TABLE}; shows the row.`,
      done: (s) => contracted(s, ASSET, PRD) && stored(s, DB_PRD).some((r) => published(s, PRD).includes(r.order_id)),
    },
    ask(
      'What changes per environment',
      'Between Sandbox and Production, what changed and what stayed the same?',
      [
        'Everything is rebuilt for Production from the source',
        'The jars stayed the same. The properties changed: bootstrap servers, SCRAM passwords, database host and password, api.id and the client ID and secret of the environment. The API instance was promoted with its policy, but contracts are asked for again',
        'Only api.id changed',
        'Nothing changes: Mule finds the Production values by itself',
      ],
      1,
      'Build once, deploy many: the same artifact moves through the environments and only its configuration changes, kept in properties with the secrets protected. Each environment has its own API instance ID and its own client credentials, so a Sandbox value in Production leaves the API Unregistered or pointing at the wrong cluster.',
    ),
  ],
  why: `The warehouse needed each new order within a minute, so I designed an Order Events API in Design Center with POST /order-events answering 202, tried it on the mock and published it to Exchange. In Studio I imported the spec, mapped the order to an event in DataWeave and published it with the Kafka connector, keyed by orderId so the events of one order stay in order in one partition. On the cluster I made the topic with 6 partitions for the peak number of consumers, replication factor 3 and min.insync.replicas 2 with acks ALL, a dead letter topic, and ACLs that give each SCRAM user only its operations. In API Manager I made the instance with Client ID Enforcement and linked the app with API Autodiscovery, then deployed with the passwords as protected properties. I followed one order by its correlation ID from the API log to the partition and offset, to the consumer log and to the row in the warehouse database. The consumer commits after the write and skips an order it has, so a redelivery is harmless. An order of a new region could not be routed, so it went to the dead letter topic without blocking the partition; after the routing fix the replay flow stored it. An alert on errors goes to the warehouse team, and Production used the same jars with its own cluster, database, instance ID and credentials. In the lab the consumer polls once a lab minute.`,
  docs: 'https://docs.mulesoft.com/kafka-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = e2e.designSolve(s, { name: NAME, assetId: ASSET, raml: RAML })
    s = createTopic(s, CLUSTER, { name: TOPIC, partitions: 6, replicationFactor: 3, config: { 'min.insync.replicas': '2', 'retention.ms': RETENTION } }).state
    s = createTopic(s, CLUSTER, { name: DLT, partitions: 1, replicationFactor: 3, config: {} }).state
    const allow = (user, resource, name, operation, pattern = 'LITERAL') => ({ principal: `User:${user}`, resource, name, pattern, operation, permission: 'ALLOW', host: '*' })
    for (const a of [allow(API_USER, 'TOPIC', TOPIC, 'WRITE'), allow(WMS_USER, 'TOPIC', TOPIC, 'READ'), allow(WMS_USER, 'GROUP', GROUP, 'READ', 'PREFIXED'), allow(WMS_USER, 'TOPIC', DLT, 'WRITE'), allow(WMS_USER, 'TOPIC', DLT, 'READ')]) s = addAcl(s, CLUSTER, a).state
    s = e2e.manageSolve(s, ASSET, 'order-events-sbx')
    s = e2e.exportSolve(s, ASSET)
    const kafkaOf = (c, user, pw) => ({ props: { 'kafka.bootstrapServers': bootstrapOf(c), 'kafka.topic': TOPIC, 'kafka.username': user }, secrets: { 'kafka.password': pw } })
    const wmsOf = (c, pw, host, dbPw, routes) => {
      const k = kafkaOf(c, WMS_USER, pw)
      return { props: { ...k.props, 'kafka.dlt': DLT, 'kafka.groupId': GROUP, 'db.host': host, 'db.database': DATABASE, 'db.user': DB_USER, 'wms.warehouses': routes }, secrets: { ...k.secrets, 'db.password': dbPw } }
    }
    s = e2e.deployStudio(s, { name: 'order-events-api', assetId: ASSET, ...kafkaOf(CLUSTER, API_USER, PW.api) })
    s = e2e.deployJar(s, { name: 'wms-order-consumer', pkg: CONSUMER_PKG, replicas: 2, ...wmsOf(CLUSTER, PW.wms, SBX_HOST, PW.db, ROUTES) })
    s = advance(s, MINUTE)
    s = e2e.accessSolve(s, ASSET, CLIENT)
    const client = () => s.clients.find((c) => c.name === CLIENT)
    s = call(s, 'order-events-api', client(), '/order-events', 'POST', ORDER).state
    s = advance(s, MINUTE)
    s = mark(mark(mark(s, 'logs:order-events-api'), 'logs:wms-order-consumer'), `kafka-topic:${TOPIC}`)
    s = runSql(s, DB, `SELECT * FROM ${TABLE} WHERE order_id = 'O-50017';`).state
    s = advance(call(s, 'order-events-api', client(), '/order-events', 'POST', NORTH).state, MINUTE)
    s = withProp(s, 'wms-order-consumer', 'wms.warehouses', `${ROUTES},north:WH-N3`)
    s = runNow(s, 'wms-order-consumer', 'replay-dlt-flow')
    s = addMonAlert(s, { title: 'Warehouse consumer failed', resource: 'Application', name_: 'wms-order-consumer', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
    s = e2e.promoteSolve(s, ASSET)
    s = e2e.deployStudio(s, { name: 'order-events-api', assetId: ASSET, ...kafkaOf(CLUSTER_PRD, API_USER, PW.apiPrd) })
    s = e2e.deployJar(s, { name: 'wms-order-consumer', pkg: CONSUMER_PKG, replicas: 2, ...wmsOf(CLUSTER_PRD, PW.wmsPrd, PRD_HOST, PW.dbPrd, `${ROUTES},north:WH-N3`) })
    s = e2e.accessSolve(s, ASSET, CLIENT)
    s = call(s, 'order-events-api', client(), '/order-events', 'POST', ORDER).state
    return advance(s, MINUTE)
  },
  answers: { 5: 1, 12: 1, 21: 1 },
}

export const LABS = [lab]
