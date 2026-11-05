import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-026',
  category: 'case-studies',
  title: 'Energy Trader Integrating Trading, Risk and Settlement Systems',
  level: 'EXPERT',
  tags: ['energy-trading', 'event-driven', 'ordering', 'reconciliation', 'high-availability'],
  estMinutes: 60,
  diagram: {
    task: 'draw the trade integration architecture: ingestion from the ETRM and exchanges into an ordered event backbone, the independent consumers for risk, scheduling, settlement and reporting, version tracking and exception parking, and the reconciliation job.',
    checks: [
      { label: 'Trades from the ETRM enter as messages and are published to the event backbone', rule: { type: 'path', from: 'legacy', to: ['event-stream', 'topic', 'queue'] } },
      { label: 'Ingestion publishes canonical trade events asynchronously', rule: { type: 'edge', from: 'process-api', to: ['event-stream', 'topic', 'queue'], kind: 'async' } },
      { label: 'Risk, scheduling, settlement and reporting each consume the backbone independently (at least four consumers)', rule: { type: 'edge', from: ['event-stream', 'topic', 'queue'], to: ['process-api', 'system-api'], kind: 'async', min: 4 } },
      { label: 'Consumers store the last applied version per trade (idempotent, in order)', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'], min: 2 } },
      { label: 'Trades with version gaps or failures are parked in an exception queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Nominations reach the grid/pipeline operators through the scheduling Process API', rule: { type: 'path', from: ['event-stream', 'topic', 'queue'], to: { type: ['external-api', 'saas', 'partner'], label: ['operator', 'grid', 'pipeline'] }, via: 'process-api' } },
      { label: 'Downstream systems (risk engine, GL, reporting service, operators) are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'erp', 'external-api'], from: 'system-api' } },
      { label: 'A reconciliation job compares trade versions across systems', rule: { type: 'edge', from: 'batch-job', to: ['system-api', 'database'] } },
    ],
    reference: diagram(
      {
        ingest: ['process-api', 'trade-ingestion (canonical TradeEvent)'],
        psched: ['process-api', 'scheduling-papi'],
        psett: ['process-api', 'settlement-papi'],
        prep: ['process-api', 'trade-reporting-papi'],
        recon: ['batch-job', 'trade-reconciliation (intraday + EOD)'],
        ks: ['event-stream', 'trade-events (partitioned by tradeId)'],
        exq: ['dlq', 'parked-trades'],
        strades: ['system-api', 'trades-sapi'],
        srisk: ['system-api', 'risk-engine-sapi'],
        ssched: ['system-api', 'nominations-sapi'],
        sgl: ['system-api', 'gl-sapi'],
        srep: ['system-api', 'reporting-sapi'],
        etrm: ['legacy', 'ETRM (system of record)'],
        exch: ['external-api', 'Exchange APIs / drop-copy'],
        ver: ['database', 'Last applied version per trade'],
        risk: ['saas', 'Risk engine'],
        ops: ['external-api', 'Grid / pipeline operators'],
        gl: ['erp', 'General ledger'],
        repo: ['external-api', 'Trade reporting service'],
      },
      [
        'etrm ~> ingest', 'exch ~> ingest', 'ingest ~> ks',
        'ks ~> srisk', 'ks ~> psched', 'ks ~> psett', 'ks ~> prep',
        'psched -> ver', 'psett -> ver', 'prep -> ver', 'psched ~> exq', 'prep ~> exq',
        'psched -> ssched', 'psett -> sgl', 'prep -> srep',
        'srisk -> risk', 'ssched -> ops', 'sgl -> gl', 'srep -> repo',
        'recon -> strades', 'recon -> ver', 'strades -> etrm',
      ],
    ),
  },
  description: `
**Context.** An energy company trades power and gas on exchanges and bilaterally. Trades are captured in an Energy Trading and Risk Management (ETRM) system and on exchange platforms (via exchange APIs and drop-copy feeds).

Trades must flow to:
- the risk engine (positions, limits)
- scheduling/nomination systems (which tell grid/pipeline operators what will be delivered)
- settlement and invoicing
- the general ledger
- regulatory trade reporting (rules kept generic)

**The problem today.** A mix of database triggers, nightly files and spreadsheets connects them. Position views are hours old, and reporting errors have triggered regulator queries.

**Goals**
- Positions in the risk engine within seconds of trade capture.
- Every trade and amendment reported correctly and on time to the regulator/reporting service.
- Nominations sent before market gate-closure deadlines, every time.
- One auditable trade lifecycle: capture → amend/cancel → confirm → schedule → settle.

**Constraints**
- Trade amendments and cancellations are frequent; order of events per trade matters.
- Peaks at market open/close and during volatile days (5–10x normal).
- 24/7 operation for some markets; downtime around gate closure has direct financial and regulatory cost.
- Existing systems are a mix of vendor products (on-premises) and SaaS; the ETRM vendor provides a message-based outbound interface.

**Your task.** Propose the integration architecture. Include:
- how you guarantee correctness (ordering, no loss, no duplicates)
- availability
- reconciliation
- where MuleSoft fits and where it should not be used
`,
  answerTemplate: `## Trade event model and lifecycle

## Integration architecture (event backbone, APIs, consumers)

## Correctness: ordering, delivery guarantees, idempotency

## Deadline-critical flows (nominations, reporting)

## Availability and disaster recovery

## Reconciliation and audit

## Where MuleSoft fits — and where it does not

## Roll-out and risks
`,
  keyPoints: [
    'A canonical trade event model with trade ID and version/sequence number; every amendment or cancellation is a new versioned event, and consumers apply them in order per trade.',
    'An event backbone (e.g. Kafka partitioned by trade ID, or Anypoint MQ FIFO queues with the trade ID as message group) gives per-trade ordering and lets each consumer (risk, scheduling, settlement, reporting) process independently.',
    'At-least-once delivery plus idempotent consumers (keyed on trade ID + version) gives effectively-once outcomes; out-of-order or stale versions are detected and handled.',
    'Deadline-critical flows (nominations, regulatory reports) are monitored against deadlines with alerts well before cut-off, and have a manual fallback procedure.',
    'High availability across zones/data centres with tested failover; no single Mule app or broker is a single point of failure for gate-closure flows.',
    'Continuous reconciliation between ETRM, risk, settlement and reporting (counts and versions per trade), with exceptions routed to an operations team.',
  ],
  solution: `
**Event model.** \`TradeEvent { tradeId, version, eventType (NEW/AMEND/CANCEL/CONFIRM), timestamp, source, economics, delivery profile, counterparties }\`. The ETRM is the system of record; exchange drop-copy trades are captured into the ETRM (or matched against it) so there is one trade identity.

**Architecture.**
- **Ingestion**: Mule apps consume the ETRM's outbound messages and exchange drop-copy/APIs, validate and map to the canonical model (DataWeave), and publish to the **event backbone**.
- **Backbone**: an enterprise streaming platform (e.g. Kafka) partitioned by \`tradeId\`, or Anypoint MQ FIFO queues per consumer if volume and retention needs are modest. Requirements: durable, ordered per trade, replayable.
- **Consumers**: risk engine adapter (low latency), \`scheduling-papi\` (aggregates trades into delivery positions → nominations to operators via their APIs/B2B channels), \`settlement-papi\`, \`gl-sapi\`, \`trade-reporting-papi\` (to the reporting service/repository).
- **APIs**: \`trades-sapi\` for queries and corrections; operations UI for exceptions.

**Correctness.** At-least-once delivery from the backbone; each consumer stores the last applied \`version\` per trade and ignores duplicates or older versions; if a gap is detected (v5 after v3) it parks the trade and requests a replay/lookup from the ETRM. Transactional outbox or equivalent at the ETRM boundary so events are not lost between DB commit and publish. No distributed transactions; consistency through ordered, idempotent processing plus reconciliation.

**Deadline-critical flows.** Nomination and reporting deadlines modelled explicitly: each item has a due time; dashboards show items not yet acknowledged; alerts at T-60 and T-15 minutes; a documented manual submission fallback (operator portals) tested regularly. Reporting includes acknowledgement handling and resubmission of rejects.

**Availability and DR.** Runtimes in multiple availability zones (CloudHub 2.0 replicas across zones, or Runtime Fabric spanning data centres for on-prem proximity); backbone replicated; active/active for ingestion where ordering allows, active/passive with fast failover where single-writer is needed. Regular failover drills near — but not during — gate closure.

**Reconciliation and audit.** Intraday reconciliation of trade count and latest version per trade across ETRM, risk, settlement and reporting; end-of-day full recon. Every event stored with its processing history for audit; correlation by trade ID.

**Where MuleSoft fits.** Connectivity to vendor systems, exchanges and operators, transformation to/from canonical and partner formats, orchestration of nominations and reporting, API exposure and policies, operational monitoring. **Not** the right place for the event store itself, sub-millisecond algorithmic trading paths, or heavy risk calculations — those belong to the streaming platform, the trading systems and the risk engine.

**Roll-out.** Start with read-only real-time positions (risk feed) running in parallel with the nightly process; then regulatory reporting (high value, high risk, with parallel run and reconciliation); then nominations and settlement. Never cut over around a regulatory change date.

**Risks.** Ordering bugs causing wrong positions (version checks, replay tests), missed deadlines (alerting + manual fallback), ETRM vendor interface limits, and volatility peaks (load testing at 10x).
`,
  followUps: [
    { q: 'How do you guarantee ordering if you scale consumers horizontally?', a: 'Partition by trade ID so all events for one trade go to the same partition/consumer (or use FIFO with a group key). Keep version checks in the consumer as a safety net.' },
    { q: 'What happens if the backbone is down 20 minutes before gate closure?', a: 'Alerts fire at the predefined thresholds and operations switch to the tested manual fallback for nominations, while the platform fails over; afterwards the backlog is replayed and reconciled.' },
    { q: 'Why not just use Mule with VM queues for everything?', a: 'VM queues are in-app and not a durable, replayable, cross-application event log; for an auditable trade lifecycle with replay and per-trade ordering you need a proper broker or streaming platform, with Mule as the connectivity and transformation layer.' },
    { q: 'How do you measure success?', a: 'Trade-to-risk latency, reporting rejection and late-report rates, nominations submitted before deadline (target 100%), and reconciliation breaks per day trending to zero.' },
  ],
}
