// The guided lab setup-kafka. See platform-labs.js for the shape of a lab.
//
// A new integration from nothing: the topic and its dead letter topic, ACLs for two SCRAM users, the value schema, the
// producer and the consumer deployed from their jars with protected passwords, then test data, a poison event and an
// alert. The lab builds its own state: one cluster with an authorizer and SCRAM users, and two jars to deploy.
import { addMonAlert, advance, at, deployApp, finishDeploys, MINUTE, mark, newPlatform } from '../platform.js'
import { app, ask, call, called, until } from '../platform-kit.js'
import { addAcl, authorized, createTopic, lagOf, newCluster, newKafka, produceMessage, registerSchema } from '../platform-kafka.js'
import { ackModeOf, acksOf, BOOTSTRAP, CLUSTER, clusterOf, CONSUMER, CONSUMER_PW, CONSUMER_USER, DLT, GROUP, keyed, PRODUCER, PRODUCER_PW, PRODUCER_USER, resetOf, TOPIC } from './setup-kafka.pkg.js'

const ALERTS = 'warehouse-oncall@harbor.example'
const OPS = 'ops@harbor.example'
const SUBJECT = `${TOPIC}-value`
const RETENTION = '259200000'

const cluster = (s) => s.kafka?.clusters?.[CLUSTER]
const topic = (s, name = TOPIC) => cluster(s)?.topics?.[name]
const running = (s, name) => app(s, name)?.status === 'Running'
const props = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const secret = (s, name, key, value) => app(s, name)?.secrets?.[key] === value && !String(app(s, name)?.props?.[key] ?? '').trim()

const topicOk = (s) => {
  const t = topic(s)
  return Boolean(t) && t.partitions.length >= 6 && t.partitions.length <= 12 && t.partitions[0].replicas.length === 3 && t.config['min.insync.replicas'] === '2' && t.config['retention.ms'] === RETENTION
}
const can = (s, user, resource, name, op) => Boolean(cluster(s)) && authorized(cluster(s), `User:${user}`, resource, name, op)
// each user gets what it needs and nothing else: no ALL, no wildcard, no cluster rights
const aclsOk = (s) => {
  const c = cluster(s)
  if (!c || !topic(s, DLT)) return false
  const wide = (c.acls ?? []).some((a) => a.permission === 'ALLOW' && (a.operation === 'ALL' || a.name === '*' || a.principal === 'User:*' || a.resource === 'CLUSTER'))
  return (
    !wide &&
    can(s, PRODUCER_USER, 'TOPIC', TOPIC, 'WRITE') &&
    can(s, CONSUMER_USER, 'TOPIC', TOPIC, 'READ') &&
    can(s, CONSUMER_USER, 'GROUP', GROUP, 'READ') &&
    can(s, CONSUMER_USER, 'TOPIC', DLT, 'WRITE') &&
    !can(s, PRODUCER_USER, 'TOPIC', TOPIC, 'READ') &&
    !can(s, CONSUMER_USER, 'TOPIC', TOPIC, 'WRITE')
  )
}
const schemaOk = (s) => {
  const v = cluster(s)?.schemaRegistry?.subjects?.[SUBJECT]?.versions?.at(-1)
  try {
    return Boolean(v) && JSON.parse(v.schema).fields.some((f) => f.name === 'orderId' && f.type === 'string')
  } catch {
    return false
  }
}
const connected = (s, name, user, pw) => running(s, name) && clusterOf(props(s, name)) === CLUSTER && props(s, name)['kafka.username'] === user && secret(s, name, 'kafka.password', pw)
const producerOk = (s) => connected(s, PRODUCER, PRODUCER_USER, PRODUCER_PW) && props(s, PRODUCER)['kafka.topic'] === TOPIC && acksOf(props(s, PRODUCER)) === 'ALL' && keyed(props(s, PRODUCER))
const consumerOk = (s) => {
  const p = props(s, CONSUMER)
  return connected(s, CONSUMER, CONSUMER_USER, CONSUMER_PW) && p['kafka.topic'] === TOPIC && p['kafka.groupId'] === GROUP && p['kafka.dlt'] === DLT && ackModeOf(p) === 'MANUAL' && resetOf(p) === 'EARLIEST' && app(s, CONSUMER).replicas === 3
}
const stable = (s) => {
  const g = cluster(s)?.groups?.[GROUP]
  return g?.state === 'Stable' && g.members.length === 3
}
const lagZero = (s) => {
  const l = lagOf(cluster(s), TOPIC, GROUP)
  return l.ok && l.partitions.every((p) => p.committed !== null) && l.total === 0
}
const tested = (s) => app(s, PRODUCER)?.store?.test ?? []
const flowOk = (s) => {
  const done = new Set(app(s, CONSUMER)?.store?.done ?? [])
  const keys = new Set(topic(s)?.partitions.flatMap((p) => p.messages.map((m) => m.key)) ?? [])
  return producerOk(s) && consumerOk(s) && tested(s).length >= 20 && tested(s).every((id) => done.has(id) && keys.has(id)) && lagZero(s)
}
const deadOk = (s) => {
  const dead = topic(s, DLT)?.partitions.flatMap((p) => p.messages) ?? []
  return consumerOk(s) && (app(s, CONSUMER).store?.dlt ?? []).length > 0 && dead.some((m) => m.headers?.['x-original-topic'] === TOPIC) && lagZero(s)
}
const alertOk = (s) => s.monAlerts.some((a) => a.enabled && a.name_ === CONSUMER && a.metric === 'Message Error Count' && ((a.operator === 'Above' && Number(a.threshold) === 0) || (a.operator === 'Above or equal to' && Number(a.threshold) === 1)) && String(a.recipients ?? '').includes(ALERTS))

const SCHEMA = JSON.stringify({ type: 'record', name: 'OrderEvent', namespace: 'lab.harbor.orders', fields: [{ name: 'orderId', type: 'string' }, { name: 'customerId', type: 'string' }, { name: 'status', type: 'string' }, { name: 'total', type: 'double' }] })

const lab = {
  id: 'p-setup-kafka',
  group: 'Kafka',
  title: 'Set up the Kafka integration for order events to the warehouse',
  minutes: 40,
  scenario: `From Monday the warehouse system takes new orders from Kafka instead of polling the order database. The team built two apps: ${PRODUCER} publishes an event for each order, and ${CONSUMER} stores each one in the warehouse system. Their jars are ready in Runtime Manager. The cluster ${CLUSTER} runs, with SCRAM users and an authorizer that denies everything without an ACL, and nothing is set up for this flow yet. Build it from the mail of the architect, prove that events flow and that a bad one is kept, and make sure someone hears about failures.`,
  start() {
    const clock = at(1, 8, 30)
    const c = newCluster(CLUSTER, 3, { authorizer: true, scram: { admin: 'admin-lab-26', [PRODUCER_USER]: PRODUCER_PW, [CONSUMER_USER]: CONSUMER_PW } })
    const s = newPlatform({
      clock,
      jars: [PRODUCER, CONSUMER],
      kafka: newKafka({ clusters: { [CLUSTER]: c } }),
      mail: [
        {
          t: at(1, 8, 25),
          to: OPS,
          subject: 'New integration: order events to the warehouse over Kafka',
          body: `Please set up the order events in Sandbox today.\n\nTopic ${TOPIC} on ${CLUSTER} (bootstrap ${BOOTSTRAP}). The warehouse consumer starts with 3 replicas and may scale to 6 at peak, so give the topic room for that. Replication factor 3, min.insync.replicas 2, keep events 3 days (${RETENTION} ms). Events of one order must stay in order, and no event may be lost when a broker goes down.\n\nEvents the warehouse cannot read go to ${DLT}. One partition is enough there.\n\n${PRODUCER} logs in as ${PRODUCER_USER}. ${CONSUMER} logs in as ${CONSUMER_USER}, consumer group ${GROUP}, and must read the topic from the start the first time. SCRAM passwords from the vault: ${PRODUCER_USER} ${PRODUCER_PW}, ${CONSUMER_USER} ${CONSUMER_PW}. Each user gets only the rights it needs.\n\nRegister the value schema of the topic in the Schema Registry, with orderId as a string.\n\nFailures of the consumer go to ${ALERTS}.\n\nPriya, Integration Architecture`,
          source: 'Harbor Integration Architecture',
        },
      ],
    })
    return until(s, at(1, 8, 40))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the topic, the users, the group, the retention and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Create the topic ${TOPIC}`,
      how: `Kafka, Topics, Add a topic. Topic name ${TOPIC}, Number of partitions 6, Replication factor 3, Min in sync replicas 2, Time to retain data ${RETENTION}. Create topic.`,
      done: topicOk,
    },
    ask(
      'Partitions and consumers',
      'The consumer starts with 3 replicas. Why give the topic 6 partitions and not 3?',
      [
        'More partitions make each record smaller',
        'In one group each partition goes to one member, so the partition count is the most consumers that can work at once. 6 lets the consumer scale to 6 replicas, and adding partitions later moves keys to other partitions and breaks the order of an order',
        'Kafka needs twice as many partitions as replicas',
        'The replication factor of 3 needs 6 partitions',
      ],
      1,
      'Choose the partition count for the peak, not for today: members above the partition count stay idle, and a topic can gain partitions but never lose them. With 3 members and 6 partitions each member owns 2 partitions, and at 6 members each owns one.',
    ),
    {
      title: 'Add the dead letter topic and the ACLs',
      how: `Topics, Add a topic: ${DLT}, 1 partition, Replication factor 3. Then ACLs, Create ACL, one entry at a time, all LITERAL and ALLOW: User:${PRODUCER_USER} WRITE on TOPIC ${TOPIC}; User:${CONSUMER_USER} READ on TOPIC ${TOPIC}; User:${CONSUMER_USER} READ on GROUP ${GROUP}; User:${CONSUMER_USER} WRITE on TOPIC ${DLT}. No ALL, no * and no CLUSTER rights: the step is met only when each user has what it needs and nothing more.`,
      done: aclsOk,
    },
    {
      title: 'Register the value schema',
      how: `Schema Registry, Create a subject. Subject ${SUBJECT}, and an Avro record with orderId (string), customerId (string), status (string) and total (double), for example ${SCHEMA}. Create subject.`,
      done: schemaOk,
    },
    {
      title: `Deploy ${PRODUCER} and call its health check`,
      how: `Runtime Manager, Deploy application. Name ${PRODUCER}, Application File ${PRODUCER}-1.0.0-mule-application.jar. Properties: kafka.bootstrapServers=${BOOTSTRAP}, kafka.topic=${TOPIC}, kafka.username=${PRODUCER_USER}, kafka.acks=ALL, kafka.key=#[payload.orderId], and kafka.password as a protected property. Deploy. When it is Running, API client: GET /health on ${PRODUCER} answers 200 with the partitions of the topic.`,
      done: (s) => producerOk(s) && called(s, PRODUCER, 200, 'GET', /^\/health$/),
    },
    {
      title: `Deploy ${CONSUMER} and see it join the group`,
      how: `Deploy application: Name ${CONSUMER}, its jar, Replicas 3. Properties: kafka.bootstrapServers, kafka.topic=${TOPIC}, kafka.groupId=${GROUP}, kafka.username=${CONSUMER_USER}, kafka.ackMode=MANUAL, kafka.autoOffsetReset=EARLIEST, kafka.dlt=${DLT}, and kafka.password as a protected property. Deploy, move the clock 2 minutes, and read its Logs: each replica gets its partitions. Kafka, Consumers, ${GROUP} shows 3 members and the state Stable.`,
      done: (s) => consumerOk(s) && Boolean(s.seen[`logs:${CONSUMER}`]) && Boolean(s.seen[`kafka-group:${GROUP}`]) && stable(s),
    },
    ask(
      'Why MANUAL',
      `${CONSUMER} uses ackMode MANUAL and commits the offset after the order is stored in the warehouse system. What does that protect against?`,
      [
        'Nothing, AUTO and MANUAL do the same',
        'The offset moves only once the order is stored. If the replica dies half way, the event is read again from the last committed offset, so nothing is lost. The cost is that an event can come twice, so the warehouse insert must be idempotent by orderId',
        'MANUAL makes Kafka deliver each event exactly once',
        'MANUAL lets two members read the same partition',
      ],
      1,
      'Committing after the work is at least once: a crash between the work and the commit gives a duplicate, never a loss. IMMEDIATE commits before the flow runs, which is at most once. With AUTO the connector commits when the flow ends well, which is close to MANUAL for a simple flow; MANUAL gives the flow the exact moment, for example after an async step or a batch.',
    ),
    {
      title: 'Send test events and check the lag',
      how: `API client: POST /orders/test-events?count=20 on ${PRODUCER}. Move the clock 2 minutes. Kafka, Topics, ${TOPIC}, Messages: 20 events, each with its orderId as the key. Consumers, ${GROUP}: the lag of every partition is 0. The log of ${CONSUMER} says it stored them.`,
      done: flowOk,
    },
    {
      title: 'Send a poison event',
      how: `Kafka, Topics, ${TOPIC}, Produce message. Key bad-1 and a value that is not an order, for example {"orderId": 42 (cut off). Move the clock 2 minutes. The log of ${CONSUMER} sends it to ${DLT}, ${DLT} holds it with x-original-topic, x-original-partition, x-original-offset and x-exception headers, and the lag of ${GROUP} is 0 again: the partition is not stuck.`,
      done: deadOk,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert: Application ${CONSUMER}, Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: alertOk,
    },
  ],
  why: `A Kafka integration from nothing: size the topic for the peak number of consumers, with replication factor 3 and min.insync.replicas 2 so a write with acks ALL survives one broker down. Add a dead letter topic, and ACLs that give each SCRAM user only its operations: WRITE for the producer, READ on the topic and the group for the consumer, WRITE on the dead letter topic. Register the value schema. Key the events by orderId so one order stays in one partition and in order. Store the passwords as protected properties. Commit after the work (MANUAL) and make the work idempotent. Then prove it: a health check, test events with lag 0, a poison event that lands on the dead letter topic without blocking its partition, and an alert. In the lab the authorizer checks ACLs on produce, fetch and commit, and the console acts as a super user.`,
  docs: 'https://docs.mulesoft.com/kafka-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createTopic(s, CLUSTER, { name: TOPIC, partitions: 6, replicationFactor: 3, config: { 'min.insync.replicas': '2', 'retention.ms': RETENTION } }).state
    s = createTopic(s, CLUSTER, { name: DLT, partitions: 1, replicationFactor: 3, config: {} }).state
    const allow = (principal, resource, name, operation) => ({ principal: `User:${principal}`, resource, name, pattern: 'LITERAL', operation, permission: 'ALLOW', host: '*' })
    for (const a of [allow(PRODUCER_USER, 'TOPIC', TOPIC, 'WRITE'), allow(CONSUMER_USER, 'TOPIC', TOPIC, 'READ'), allow(CONSUMER_USER, 'GROUP', GROUP, 'READ'), allow(CONSUMER_USER, 'TOPIC', DLT, 'WRITE')]) s = addAcl(s, CLUSTER, a).state
    s = registerSchema(s, CLUSTER, SUBJECT, SCHEMA).state
    const base = { 'kafka.bootstrapServers': BOOTSTRAP, 'kafka.topic': TOPIC }
    s = finishDeploys(deployApp(s, { name: PRODUCER, pkg: PRODUCER, jar: `${PRODUCER}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props: { ...base, 'kafka.username': PRODUCER_USER, 'kafka.acks': 'ALL', 'kafka.key': '#[payload.orderId]' }, secrets: { 'kafka.password': PRODUCER_PW } }).state)
    s = call(s, PRODUCER, null, '/health', 'GET').state
    s = finishDeploys(deployApp(s, { name: CONSUMER, pkg: CONSUMER, jar: `${CONSUMER}-1.0.0-mule-application.jar`, replicas: 3, vCores: 0.1, props: { ...base, 'kafka.groupId': GROUP, 'kafka.username': CONSUMER_USER, 'kafka.ackMode': 'MANUAL', 'kafka.autoOffsetReset': 'EARLIEST', 'kafka.dlt': DLT }, secrets: { 'kafka.password': CONSUMER_PW } }).state)
    s = advance(s, 2 * MINUTE)
    s = mark(mark(s, `logs:${CONSUMER}`), `kafka-group:${GROUP}`)
    s = call(s, PRODUCER, null, '/orders/test-events?count=20', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = produceMessage(s, CLUSTER, TOPIC, { key: 'bad-1', value: '{"orderId": 42' }).state
    s = advance(s, 2 * MINUTE)
    return addMonAlert(s, { title: 'Warehouse consumer failed', resource: 'Application', name_: CONSUMER, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
  },
  answers: { 2: 1, 7: 1 },
}

export const LABS = [lab]
