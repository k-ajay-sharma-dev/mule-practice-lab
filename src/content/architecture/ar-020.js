import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-020',
  category: 'architecture',
  title: 'Integrating a Mainframe Core System',
  level: 'ADVANCED',
  tags: ['mainframe', 'legacy', 'cobol-copybook', 'cdc'],
  estMinutes: 30,
  diagram: {
    task: 'draw the portal and broker architecture: where policy reads are served from, how the read store is kept current, and how address changes reach the mainframe.',
    checks: [
      { label: 'The customer portal and brokers each call an Experience API', rule: { type: 'each', of: ['web-app', 'partner'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Policy reads are served from an off-mainframe read store', rule: { type: 'edge', from: 'system-api', to: ['database', 'cache'] } },
      { label: 'Consumers reach the read store through the Policy System API', rule: { type: 'path', from: 'web-app', to: 'database', via: 'system-api' } },
      { label: 'Changes leave the mainframe asynchronously (CDC or MQ)', rule: { type: 'edge', from: 'legacy', to: ['event-stream', 'queue', 'topic'], kind: 'async' } },
      { label: 'The read store is fed from the mainframe changes', rule: { type: 'path', from: 'legacy', to: 'database' } },
      { label: 'Address changes (writes) go to the mainframe through the System API', rule: { type: 'edge', from: 'system-api', to: ['legacy', 'queue'] } },
      { label: 'Only the System API (or its MQ request queue) touches the mainframe', rule: { type: 'only-via', target: 'legacy', from: ['system-api', 'queue'] } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Customer portal'],
        brk: ['partner', 'Brokers'],
        ep: ['experience-api', 'exp-customer-portal-api'],
        eb: ['experience-api', 'exp-broker-api'],
        pp: ['process-api', 'prc-policy-claims-api'],
        spol: ['system-api', 'sys-policy-api (canonical JSON)'],
        rs: ['database', 'Policy read store'],
        mf: ['legacy', 'Mainframe (CICS / DB2)'],
        cdc: ['event-stream', 'CDC change stream'],
        upd: ['process-api', 'prc-read-store-sync'],
      },
      [
        'portal -> ep', 'brk -> eb', 'ep -> pp', 'eb -> pp', 'pp -> spol',
        'spol -> rs', 'spol -> mf',
        'mf ~> cdc', 'cdc ~> upd', 'upd -> rs',
      ],
    ),
  },
  description: `
A regional insurer's **policy administration** runs on an IBM z/OS mainframe (CICS transactions, DB2, COBOL batch). The business wants a modern **customer portal** and a **broker API** showing policies and claims, and allowing address changes.

Facts:
- Mainframe CPU is billed by usage (MIPS/MSU); the mainframe team warns that the portal could **double the online transaction load**.
- Existing interfaces: a few CICS transactions (COMMAREA, fixed-width records described by **COBOL copybooks**), **IBM MQ** queues used by an older system, and nightly **fixed-width files** via SFTP.
- The mainframe team has 3 people, a 6-month change backlog and releases quarterly.
- The mainframe will be replaced "in about 5 years".

**Questions:**
- Which integration options do you consider (CICS calls, IBM MQ, DB2 direct, files, CDC), and which do you pick for reads vs writes?
- How do you keep portal traffic from driving up mainframe cost?
- How do you hide mainframe details so the 5-year replacement does not break consumers?
- What do you need from the mainframe team, and how do you work around their backlog?
`,
  answerTemplate: `## Integration options

## Reads vs writes

## Controlling mainframe load and cost

## Insulating consumers (replacement readiness)

## Working with the mainframe team
`,
  keyPoints: [
    'Options are compared explicitly: synchronous CICS calls (e.g. via IBM CTG or MQ-CICS bridge), IBM MQ messaging, DB2 via JDBC, file transfer, and CDC replication — each with latency, coupling and cost trade-offs.',
    'Heavy reads are served from an off-mainframe read store fed by CDC or the nightly files plus deltas, so portal traffic does not consume mainframe MIPS.',
    'Writes (address change) go to the mainframe as the system of record through an existing transaction/MQ interface, never by writing DB2 tables directly.',
    'Copybook-based fixed-width records are parsed/generated in DataWeave (flat file schema from the copybook) inside a Mainframe System API, which exposes a canonical JSON model.',
    'The System API contract hides all mainframe concepts so the future replacement only changes the System API implementation (strangler pattern).',
  ],
  solution: `
**Options.**
| Option | Pros | Cons |
|---|---|---|
| CICS transaction (IBM CTG connector / MQ-CICS bridge) | Real-time, reuses validated business logic | Each call costs MIPS; COMMAREA/copybook mapping |
| IBM MQ (existing queues) | Async, decoupled, mainframe team knows it | Request/reply over MQ adds complexity; still MIPS |
| DB2 direct (JDBC) | Easy reads | Couples to physical schema; **writes bypass business rules** |
| Nightly files | No online load | Up to 24 h stale |
| CDC (replication tool on DB2 logs) | Near-real-time copy, low MIPS impact | Extra product/licence, ops effort |

**Reads vs writes.**
- **Reads (policies, claims)** — the bulk of portal traffic — come from an **operational read store** (e.g. a cloud/on-prem database) loaded initially from the files and kept current via **CDC** or MQ change events. The Policy System API reads from this store. Freshness: seconds to minutes, acceptable for viewing; show "last updated".
- **Writes (address change)** go to the mainframe as the **system of record**, via an existing CICS transaction or MQ request (async with confirmation). After success, update the read store (or let CDC bring it back). Never write DB2 tables directly — business rules live in COBOL.

**Controlling load and cost.** The read store absorbs portal and broker traffic; the mainframe sees only writes and CDC. Add **rate limiting** on the System API paths that hit CICS, and caching for reference data. Measure MIPS before/after with the mainframe team.

**Insulating consumers.**
- A **Policy System API** (and Claims SAPI) exposes canonical JSON resources (\`/policies/{id}\`, \`/policies/{id}/address\`). Copybook fixed-width ↔ JSON conversion happens inside it with DataWeave flat-file schemas generated from the **COBOL copybooks** (watch EBCDIC encoding, packed decimals/COMP-3, signed fields — test with real samples).
- Process/Experience APIs never see copybooks or transaction codes. When the new platform arrives in 5 years, re-implement the System API against it (**strangler pattern**), migrating capability by capability; consumers don't change.

**Working with the mainframe team.** Prefer interfaces that already exist (the CICS transactions and MQ queues) to avoid their backlog. Ask early for: copybooks, test region access, transaction volumes, MIPS budget, CDC approval. Agree an interface contract and a test data set. Schedule the one unavoidable change (e.g. enabling CDC) into their quarterly release now.

**Trade-off:** the read store introduces **eventual consistency** and another component to run. But it is the only way to add a high-traffic digital channel without paying for (and risking) the mainframe at peak.
`,
  followUps: [
    { q: 'The business says customers must see their address change immediately. How?', a: 'After the mainframe confirms the write, the System API updates the read store (write-through) or the portal shows the confirmed value from the write response. CDC then reconciles; the user never sees the stale value.' },
    { q: 'CDC tooling is not approved in the budget. What is plan B?', a: 'Nightly full files plus intra-day deltas published by the mainframe over MQ for changed policies, or a cache-aside approach with long TTLs. Freshness is worse, so discuss which data truly needs to be current.' },
    { q: 'How do you test copybook mappings safely?', a: 'Get real (masked) sample records from the mainframe test region, include edge cases like negative packed decimals and empty fields, and build MUnit tests comparing DataWeave output to expected JSON; involve the mainframe team to confirm field semantics.' },
  ],
}
