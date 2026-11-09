import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-120',
  category: 'use-cases',
  title: 'Shared Event Platform for 40 Teams: Kafka Topics, Schemas, Outbox and CDC',
  level: 'EXPERT',
  tags: ['kafka', 'event-driven', 'governance', 'consumer-groups', 'outbox', 'cdc'],
  estMinutes: 50,
  diagram: {
    task: 'draw the event platform: the shipment service with its outbox and relay, the AS/400 billing system with its CDC connector, the domain topics, the schema registry, two consumer apps each in its own group with dead-letter topics, the warehouse sink, the partner event store and Experience API, and the partner webhooks sent by a consumer.',
    checks: [
      { label: 'The shipment service publishes only through its outbox (every route to Kafka passes its database)', rule: { type: 'no-path', from: { type: 'process-api', label: 'shipment' }, to: 'event-stream', unless: 'database' } },
      { label: 'An outbox relay reads the shipment database', rule: { type: 'link', from: { type: ['process-api', 'batch-job'], label: ['relay', 'outbox'] }, to: 'database' } },
      { label: 'The outbox relay publishes the events to Kafka', rule: { type: 'edge', from: { type: ['process-api', 'batch-job'], label: ['relay', 'outbox'] }, to: 'event-stream', kind: 'async' } },
      { label: 'AS/400 changes enter Kafka through a CDC connector', rule: { type: 'path', from: 'legacy', to: 'event-stream' } },
      { label: 'Nothing polls the AS/400 with queries', rule: { type: 'no-edge', from: ['process-api', 'batch-job', 'system-api', 'experience-api'], to: 'legacy' } },
      { label: 'Producers and consumers use the schema registry', rule: { type: 'edge', to: { label: 'schema' }, min: 3 } },
      { label: 'At least two consumer apps read the same topic', rule: { type: 'each', of: 'event-stream', edgeTo: 'process-api', kind: 'async', count: 2, some: true } },
      { label: 'Each consumer group has a dead-letter topic', rule: { type: 'each', of: { type: 'process-api', label: 'group' }, edgeTo: 'dlq', min: 2 } },
      { label: 'Partners never connect to Kafka', rule: { type: 'no-path', from: 'partner', to: 'event-stream' } },
      { label: 'The shipment service never calls partners', rule: { type: 'no-path', from: { type: 'process-api', label: 'shipment' }, to: 'partner', kind: 'sync' } },
      { label: 'The warehouse is fed from the topics', rule: { type: 'path', from: 'event-stream', to: 'data-warehouse' } },
      { label: 'Every line into or out of Kafka is async', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        shp: ['process-api', 'prc-shipment-service'],
        shpdb: ['database', 'Shipment DB + outbox table'],
        relay: ['process-api', 'Outbox relay'],
        as400: ['legacy', 'AS/400 billing (DB2 journal)'],
        cdc: ['batch-job', 'CDC connector (journal reader)'],
        k1: ['event-stream', 'logistics.shipment-events.v1'],
        k2: ['event-stream', 'finance.invoices.v1'],
        reg: ['saas', 'Schema registry (Avro, backward compatible)'],
        c1: ['process-api', 'prc-customer-notify (group customer-notify)'],
        c2: ['process-api', 'prc-partner-events (group partner-feed)'],
        dlt: ['dlq', 'DLT per consumer group'],
        dw: ['data-warehouse', 'Warehouse (sink connector)'],
        notif: ['notification', 'Customer email and SMS'],
        store: ['database', 'Partner event store (30 days)'],
        exp: ['experience-api', 'exp-partner-events-api'],
        part: ['partner', 'Partner shippers and marketplaces'],
      },
      [
        'shp -> shpdb', 'relay -> shpdb', 'relay ~> k1', 'relay -> reg', 'as400 ~> cdc', 'cdc ~> k2', 'cdc -> reg',
        'k1 ~> c1', 'k1 ~> c2', 'k2 ~> c2', 'c1 -> reg', 'c2 -> reg', 'k1 ~> dw', 'k2 ~> dw',
        'c1 -> notif', 'c1 ~> dlt', 'c2 ~> dlt', 'c2 -> store', 'c2 -> part', 'part -> exp', 'exp -> store',
      ],
    ),
  },
  description: `
A logistics group has grown by acquisition. **40 development teams** build integrations, 12 of them with Mule. Each team has wired its own events: some use Anypoint MQ, some call each other's APIs in loops, two have their own Kafka clusters. Last year:
- a renamed field in one team's JSON events broke **6 consumers** over a weekend;
- a team found out that its "events" were lost when its app crashed between a database write and a publish;
- partners asked for shipment events and got **three different formats** from three teams;
- the AS/400 billing system is polled every 5 minutes by **4 different jobs**.

The CTO funds a shared **event platform** on a managed Kafka service (Confluent Cloud or similar) and asks you, as the integration architect, to design it and its rules.

Facts:
- About **25 million events per day** across all domains; the biggest topic (shipment events) peaks at 1,500 per second.
- The AS/400 (DB2 for i) can expose its journal to a CDC tool; no code changes are possible.
- Partners (shippers, marketplaces) want shipment events by webhook or by pulling an API. They must not get access to the internal cluster.
- Events must be kept **7 days** on Kafka for replay, and 2 years in the warehouse.
- Mule apps run on CloudHub 2.0 and Runtime Fabric.

**Design the platform:**
- Topic naming, ownership, partitions and keys.
- How schemas are agreed and changed without breaking consumers.
- How producers publish reliably (services with a database, and the AS/400).
- Rules for consumers: groups, offsets, retries and dead letters.
- How partners get events.
- What the platform team owns, and what each domain team owns.
`,
  answerTemplate: `## Topics and ownership

## Schemas and compatibility

## Reliable producers

## Consumer rules

## Partner access

## Platform governance
`,
  keyPoints: [
    'Topics are named <domain>.<entity>-events.v<major>, owned by one producing team, keyed by the business ID that needs ordering, with partitions sized for peak and growth.',
    'Every topic has a registered schema (Avro or JSON Schema) with backward compatibility enforced by the registry, so a breaking change is rejected at publish time and needs a new major topic.',
    'Services with a database publish through a transactional outbox and relay; the AS/400 is captured with log-based CDC, which replaces the four polling jobs.',
    'Each consuming app has its own consumer group, commits after processing, is idempotent by event ID, and sends poison events to its own dead-letter topic.',
    'Partners get events through a partner consumer that stores them and calls webhooks, plus an Experience API to pull; they never see Kafka.',
    'The platform team owns the cluster, registry, naming rules, ACLs, monitoring and templates; domain teams own their topics, schemas and consumers.',
  ],
  solution: `
\`\`\`
 prc-shipment-service -> Shipment DB + outbox  <- outbox relay ~> logistics.shipment-events.v1
 AS/400 ~> CDC connector ~> finance.invoices.v1
 relay, CDC connector, consumers -> schema registry
 topics ~> prc-customer-notify (group customer-notify) -> email / SMS     ~> DLT
        ~> prc-partner-events  (group partner-feed)    -> partner event store, partner webhooks ~> DLT
        ~> warehouse sink
 partners -> exp-partner-events-api -> partner event store
\`\`\`

**Topics and ownership.** One topic per domain event stream: \`logistics.shipment-events.v1\`, \`finance.invoices.v1\`. Exactly one team produces to a topic (enforced with ACLs). The key is the ID whose events must stay ordered (\`shipmentId\`). Partitions: sized for peak with room to grow (48 for shipments), because adding partitions later changes key placement. Events carry an envelope: \`eventId\`, \`type\`, \`occurredAt\`, \`source\`, \`schemaVersion\`, \`correlationId\`.

**Schemas and compatibility.** Every topic has a schema in the **schema registry**; producers serialise with it and consumers read with it. Compatibility is **BACKWARD** (consumers on the new schema can read old events), so adding optional fields is allowed, while renaming or removing a field is rejected. A real breaking change gets a new topic \`...v2\`, and the producer writes both for an agreed period. Schemas are reviewed in pull requests and published in Exchange next to the AsyncAPI document.

**Reliable producers.**
- Services with a database use the **transactional outbox**: the business row and the outbox row in one transaction, a relay publishes and marks rows. The crash-between-write-and-publish loss is gone.
- The AS/400 uses **log-based CDC** on the DB2 journal. One connector replaces the four polling jobs; billing events become a topic everyone can use.
- Producers use \`acks=all\` and idempotent producer settings.

**Consumer rules.**
- One consumer group per application, named after it. Never share a group across apps.
- Commit after processing; be idempotent by \`eventId\` because replays happen.
- Retry a few times in-process, then write to the app's own dead-letter topic with the error, and commit. One bad event must not stop a partition.
- Monitor lag per group; alerts go to the owning team.

**Partner access.** A partner-feed consumer filters events per partner contract, stores them for 30 days, and sends **signed webhooks**. Partners that prefer pulling use \`GET /events?after={cursor}\` on exp-partner-events-api, with client ID enforcement and SLA tiers in API Manager. One format for all partners, versioned like any API.

**Platform governance.** The platform team owns the cluster, registry, naming rules, ACLs, Mule and non-Mule producer and consumer templates (outbox relay, consumer with DLT), dashboards and the topic request process. Domain teams own their topics, schemas and consumers, and their on-call. A topic catalogue in Exchange lists owner, schema, key, retention and consumers.
`,
  followUps: [
    { q: 'Why enforce backward compatibility in the schema registry?', a: 'A breaking change is rejected when the producer tries to register it. Consumers are protected before any event is published.' },
    { q: 'Why should two different apps never share a consumer group?', a: 'They would split the partitions between them. Each app would see only part of the events.' },
    { q: 'Why not give partners read access to the Kafka topics?', a: 'It exposes internal events, formats and the cluster to outside parties. An API and webhooks give a stable contract with security policies.' },
    { q: 'How does CDC on the AS/400 help beyond removing polling?', a: 'It captures every change including deletes from the journal. The billing events become one shared topic instead of four private copies.' },
    { q: 'When does a schema change need a new topic version?', a: 'When old consumers cannot read the new events, such as a removed or renamed field. The producer then writes both versions for a migration period.' },
  ],
}
