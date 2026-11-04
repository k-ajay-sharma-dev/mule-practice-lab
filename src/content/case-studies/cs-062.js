export default {
  id: 'cs-062',
  category: 'case-studies',
  title: 'Global Retailer Choosing Its Supply Chain Messaging Standard: ActiveMQ Artemis, Anypoint MQ or Kafka',
  level: 'EXPERT',
  tags: ['retail', 'supply-chain', 'activemq', 'artemis', 'anypoint-mq', 'kafka', 'jms', 'oracle', 'decision-record'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      prompt: 'Which requirement in this scenario most clearly points to a log-based event stream (Kafka) rather than a queue broker?',
      options: [
        'DC flows must keep running when the WAN link to the cloud is down',
        'The forecasting and analytics teams need to re-read the last 7 days of stock movements whenever they deploy a new model',
        'Some DC flows read Oracle and publish a message as one unit of work',
        'Cloud-hosted Mule apps need a simple managed queue between them',
      ],
      answer: 1,
      explain: 'Replaying retained history for new or rebuilt consumers is what a log-based stream is designed for. Queue brokers remove messages once consumed, so replay would need a separate store. WAN independence and transactional DC flows point to a local broker instead.',
    },
    {
      type: 'single',
      prompt: 'A DC flow updates Oracle stock tables and must publish a stock-movement message only if the update commits. What is the best design recommendation?',
      options: [
        'Use Anypoint MQ inside an XA transaction with the Oracle Database connector',
        'Write the movement to an outbox table in the same Oracle transaction, then publish from the outbox with an idempotent consumer downstream',
        'Publish first, then update Oracle, and ignore failures because the nightly reconciliation will fix them',
        'Use a Kafka producer inside a Mule XA transaction with the Database connector',
      ],
      answer: 1,
      explain: 'The outbox keeps the business change and the event in one local database transaction and avoids distributed transactions. XA with a JMS broker such as ActiveMQ/Artemis is possible in Mule (Bitronix) but adds cost and operational complexity; Anypoint MQ and the Kafka connector do not take part in XA transactions.',
    },
    {
      type: 'multi',
      prompt: 'Which are valid reasons to keep a broker (ActiveMQ Artemis) running inside each distribution centre? (choose all that apply)',
      options: [
        'Picking and shipping must continue during a WAN outage',
        'Local WMS and conveyor systems already use JMS and need low-latency messaging on the site network',
        'Some legacy DC applications rely on JMS features such as message groups for ordered processing',
        'On-premises Mule runtimes cannot connect to Anypoint MQ',
        'Kafka cannot store messages for more than a few minutes',
      ],
      answer: [0, 1, 2],
      explain: 'Site resilience, latency and existing JMS dependencies justify a local broker. On-premises runtimes can use Anypoint MQ over HTTPS (but then depend on the WAN), and Kafka retention is configurable for days or longer, so the last two are false.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the best-fit messaging option in the proposed standard.',
      pairs: [
        ['Order hand-off between CloudHub apps with a DLQ and no infrastructure to run', 'Anypoint MQ queue'],
        ['High-volume POS sales and stock events retained for replay by analytics and forecasting', 'Managed Kafka topic'],
        ['DC flows that must keep working when the WAN is down', 'ActiveMQ Artemis in the DC'],
        ['Price change fanned out to several cloud consumers', 'Anypoint MQ exchange'],
      ],
      explain: 'The standard is "fit for purpose, from a short approved list": Anypoint MQ for managed cloud queues and exchanges, managed Kafka for retained high-volume streams, and Artemis where a site must be self-sufficient.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for moving off the ageing ActiveMQ Classic estate onto the new standard.',
      items: [
        'Inventory every destination, producer, consumer, volume and owner on the Classic brokers',
        'Agree selection criteria and the approved options in a decision record',
        'Build the target platforms with HA, monitoring, DLQ and naming conventions',
        'Migrate one low-risk flow end to end, using a bridge so old consumers still receive messages',
        'Migrate the remaining flows domain by domain, removing bridges as consumers move',
        'Decommission the Classic brokers once destinations are empty and unused',
      ],
      explain: 'You cannot choose or migrate safely without knowing what uses the brokers. A decision record and platform foundations come before the pilot, and bridges allow consumers to move independently before decommissioning.',
    },
    {
      type: 'single',
      prompt: 'Stock events must be processed in order per SKU and location while handling about 20,000 events per second at peak. Which design fits?',
      options: [
        'A Kafka topic with a single partition so every event is in one global order',
        'A Kafka topic partitioned by a key of SKU + location, so order is kept per key and consumers scale across partitions',
        'One Anypoint MQ FIFO queue for all stock events',
        'A JMS topic with one non-durable subscriber per consumer application',
      ],
      answer: 1,
      explain: 'Kafka guarantees order within a partition, and keying by SKU + location keeps related events together while spreading load. A single partition or a single FIFO queue serialises all traffic, and non-durable subscribers lose messages while disconnected.',
    },
  ],
  description: `
**Context.** A global home and electronics retailer (1,100 stores in 12 countries, 18 DCs, e-commerce in every country) runs four ActiveMQ Classic 5.x broker clusters that are out of support, plus a small Anypoint MQ footprint used by newer CloudHub apps. The data team has started a self-managed Kafka cluster for clickstream data. Every new project asks "which messaging should we use?" and gets a different answer. The CTO wants one architecture decision record for the supply chain and retail estate.

**Current flows (examples)**
| Flow | Volume / need |
|---|---|
| POS sales and stock movements from stores | ~20,000 events/s at peak; analytics and forecasting want to re-read recent history |
| DC WMS ↔ conveyors, put-away, picking | Low latency on site; must survive WAN loss; legacy apps use JMS message groups |
| E-commerce orders → order management → DCs | Cloud apps; DLQ and retries; moderate volume |
| Price and promotion changes | Fan-out to stores, web, marketplaces, analytics |
| Oracle stock updates in DCs | Must publish a message only if the DB update commits |

**Constraints**
- The integration team is 25 people; the platform team will not take on running Kafka clusters themselves (managed services are acceptable).
- Licence and run cost must not grow faster than volume.
- Regional data residency applies to customer data (not to stock data).

**Your task.** Write the messaging decision: options, criteria, the standard you recommend for each type of flow, and the migration from ActiveMQ Classic.
`,
  answerTemplate: `## Decision criteria

## Options compared (ActiveMQ Artemis, Anypoint MQ, Kafka)

## Recommendation by flow type

## Transactions, ordering and replay

## Migration from ActiveMQ Classic

## Governance (standards, exceptions, review)

## Risks and consequences
`,
  keyPoints: [
    'Decide by criteria (delivery semantics, replay, ordering, site independence, transactions, operating model, cost), not by product preference.',
    'A short approved list: managed Kafka for high-volume retained streams with replay, Anypoint MQ for managed cloud queues and exchanges, ActiveMQ Artemis where a site must work without the WAN.',
    'Avoid distributed transactions by default: outbox plus idempotent consumers; XA only where a local JMS broker and the business case justify it.',
    'Ordering is designed per key (Kafka partition key, JMS message groups or exclusive queues), never by forcing a single global sequence.',
    'Migrate from Classic using an inventory, a decision record, platform foundations, a pilot with bridges and domain-by-domain moves, with an exception process for cases outside the standard.',
  ],
  solution: `
**Criteria.** Delivery and retention (consume-once vs replay), ordering scope, throughput, site independence, transactional needs, operational model (managed vs self-run), skills, cost and data residency.

**Recommendation**
| Flow type | Standard | Why |
|---|---|---|
| High-volume business events with replay (sales, stock, clickstream) | Managed Kafka | Retention and replay, partitioned scale, many consumer groups |
| Cloud app-to-app commands and work queues (orders, returns) | Anypoint MQ queues and exchanges | Managed, DLQ, simple for CloudHub apps |
| DC and site messaging | ActiveMQ Artemis per site (HA pair) | Works without the WAN, JMS features, low latency |
| Bridges between site and cloud | Mule flows (or broker bridges) publishing canonical events | One place to transform and monitor |

**Transactions and ordering.** Outbox tables in Oracle for "publish only if committed"; idempotent consumers keyed on business IDs. Order per SKU + location (Kafka key), per line or order (JMS message groups) — never global.

**Migration.** Inventory Classic destinations and consumers; pilot with a low-risk flow; per-domain migration with bridges; DC sites upgraded to Artemis during planned windows; Classic switched off when empty. Expect 12–18 months.

**Governance.** Decision record published and reviewed yearly; exceptions require design-authority approval; naming, DLQ and schema conventions; event schemas in a catalogue; cost and usage reported per business domain.

**Risks.** Three platforms to operate (mitigated by managed services and a small list), teams choosing by habit (design reviews), cross-platform bridges becoming bottlenecks (monitoring, scaling), and data residency for customer events (regional clusters or exchanges where needed).
`,
  followUps: [
    { q: 'Why not standardise on just one product?', a: 'No single option covers replayable high-volume streams, managed cloud queues and WAN-independent sites well. A short list with clear criteria limits sprawl without forcing a poor fit.' },
    { q: 'When would you accept XA in this estate?', a: 'Rarely: for a site flow where a local Artemis broker and Oracle must change atomically and an outbox is not possible, accepting the extra operational complexity of a transaction manager.' },
    { q: 'How do you stop the self-managed Kafka cluster from becoming a second standard?', a: 'Record the decision to move to a managed service, migrate its topics as part of the programme, and route new stream requests only to the approved platform.' },
  ],
}
