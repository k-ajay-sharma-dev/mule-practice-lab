import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-046',
  category: 'use-cases',
  title: 'Core Banking Migration with Parallel Run',
  level: 'EXPERT',
  tags: ['migration', 'strangler-fig', 'dual-write', 'reconciliation', 'banking', 'cdc'],
  estMinutes: 45,
  diagram: {
    task: 'draw the strangler-fig integration for the core migration: channels on core-agnostic Experience and Process APIs, the routing table, System APIs for the mainframe and the new core, the canonical event feed for downstream systems, and the reconciliation job.',
    checks: [
      { label: 'Every channel calls an Experience API (never a core)', rule: { type: 'each', of: ['mobile-app', 'web-app', 'internal-app'], edgeTo: 'experience-api' } },
      { label: 'Experience APIs call core-agnostic Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Process APIs look up which core owns the customer in a routing table', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['rout', 'wave'] } } },
      { label: 'The mainframe is reached only through its System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The new SaaS core is reached only through its System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Both cores publish canonical events for downstream feeds (async)', rule: { type: 'edge', from: 'system-api', to: ['event-stream', 'topic', 'queue'], kind: 'async', min: 2 } },
      { label: 'A reconciliation job compares balances, interest and fees in both cores', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking'],
        br: ['internal-app', 'Branch system'],
        em: ['experience-api', 'exp-mobile-banking-api'],
        eb: ['experience-api', 'exp-branch-api'],
        pacc: ['process-api', 'prc-accounts-api'],
        ppay: ['process-api', 'prc-payments-api'],
        route: ['database', 'Routing table (customer → core, by wave)'],
        rec: ['batch-job', 'Parallel-run reconciliation'],
        ev: ['event-stream', 'canonical-core-events'],
        sold: ['system-api', 'sys-mainframe-core-api'],
        snew: ['system-api', 'sys-new-core-api'],
        mf: ['legacy', 'Mainframe core (CICS via MQ)'],
        nc: ['saas', 'New cloud core'],
        dw: ['data-warehouse', 'Data warehouse / AML / regulatory'],
      },
      [
        'mob -> em', 'br -> eb', 'em -> pacc', 'em -> ppay', 'eb -> pacc', 'eb -> ppay', 'pacc -> route', 'ppay -> route',
        'pacc -> sold', 'pacc -> snew', 'ppay -> sold', 'ppay -> snew', 'sold -> mf', 'snew -> nc',
        'sold ~> ev', 'snew ~> ev', 'ev ~> dw', 'rec -> sold', 'rec -> snew',
      ],
    ),
  },
  description: `
A mid-size retail bank is replacing its **20-year-old mainframe core banking system** with a **modern cloud core** (vendor SaaS). About **60 channels and internal systems** use the mainframe today: mobile app, online banking, branch system, card processor, payments hub, CRM, AML monitoring, data warehouse, regulatory reporting.

Facts:
- 1.5 million customers, 2.2 million accounts. Today systems connect through a mix of **CICS transactions via MQ**, nightly **batch files**, and a few REST services built in Mule 3 years ago.
- The bank wants to migrate **customer segments in waves** (e.g. staff accounts first, then 50,000 customers, then the rest) over **18 months**, not in one big bang.
- During migration, a channel must **not need to know** which core holds a given customer.
- Regulator requirement: before each wave, a **parallel run** showing that interest, fees and balances computed by the new core match the old core (within agreed tolerance) for at least one full month-end cycle.
- **Zero tolerance** for lost or duplicated payments. Mobile banking target: 99.95% availability, p95 < 500 ms for balance inquiries.
- Night batch window on the mainframe ends at 05:00; the new core is API-first with events.

**Describe your solution:**
- What integration architecture lets channels stay unaware of the migration?
- How do you route requests per customer during waves?
- How do you run the parallel run and compare results?
- How do you migrate a wave of customers (data, in-flight transactions, cut-over)?
- How do you handle payments and other money movements so nothing is lost or duplicated?
`,
  answerTemplate: `## Target integration architecture

## Routing by migration wave

## API contracts and canonical model

## Parallel run and reconciliation

## Wave cut-over

## Payments integrity

## NFRs, security and governance
`,
  keyPoints: [
    'Channels move first onto stable core-agnostic Experience/Process APIs (strangler façade); System APIs for both the mainframe and the new core sit behind them.',
    'A routing service (customer/account → core, cached, versioned) decides per request which core System API to call; changes switch with the wave.',
    'Canonical banking model (customer, account, balance, transaction) hides differences; both System APIs map to it.',
    'Parallel run: replay/shadow transactions into the new core (or feed both via CDC/events) and reconcile balances, interest and fees daily with tolerances and break reports.',
    'Wave cut-over: freeze window, final delta migration, reconciliation sign-off, routing switch, and a tested rollback; in-flight items drained or redirected.',
    'Payments idempotent end-to-end (unique payment IDs, exactly-once effect via dedupe), with no dual-write without an owner; continuous reconciliation of postings.',
  ],
  solution: `
**Target integration architecture (strangler fig).**
1. **Phase 0 — façade first:** build core-agnostic **Experience APIs** (mobile, branch, partners) and **Process APIs** (Accounts, Customers, Payments, Cards) and move channels to them while they still only call the **Mainframe System API** (MQ/CICS via the IBM MQ connector or JMS; batch files via SFTP). Channels are now decoupled from the core.
2. Add the **New Core System API** (REST/events of the SaaS core).
3. Process APIs call a **Routing service** to pick the right core per customer/account.

Downstream feeds (data warehouse, AML, regulatory) consume **canonical events** from both cores via an event backbone so they also become core-agnostic.

**Routing by migration wave.** A routing table: customer ID / account number → core (+ wave, effective time). Held in a highly available store, cached in the Process APIs with short TTL and invalidation on wave cut-over. For operations involving two customers (internal transfer between a migrated and non-migrated customer), the Payments Process API orchestrates debit on one core and credit on the other as a saga with compensation, or routes through the payments hub with a clearing/suspense account.

**API contracts and canonical model.** Canonical resources (Customer, Account, Balance, Transaction, Payment) versioned in Exchange. Both System APIs map to them (DataWeave: COBOL copybook / fixed-width → canonical; new core JSON → canonical). Differences (e.g. product codes, transaction type codes) handled by mapping tables owned by the business, not hard-coded.

**Parallel run and reconciliation.**
- Migrate the wave's data to the new core in **shadow mode** (not live).
- Feed the same daily activity to the new core: capture mainframe postings (CDC on the mainframe DB or the daily posting file) and replay them via the new core's API.
- After each end-of-day, extract balances, accrued interest and fees from both cores; a **reconciliation job** (Batch Job) compares per account with tolerances and produces a **break report** (by category: interest rounding, fee rule difference, missing transaction). Must include one **month-end** cycle. Breaks are analysed and product configs fixed until the regulator-agreed threshold is met.

**Wave cut-over.**
1. Announce maintenance window for the wave (e.g. Saturday 22:00–04:00).
2. Block/queue new transactions for affected accounts; drain in-flight items (pending payments, standing orders due) on the old core.
3. Final delta migration and **closing balance reconciliation** (must match exactly).
4. **Switch routing** for the wave's customers; mainframe accounts set to read-only/closed-migrated.
5. Smoke tests with test customers in the wave; monitor intensively.
6. **Rollback plan**: routing can switch back if verification fails before the window ends (new core postings during the window are reversed or replayed back — rehearsed in dress rehearsals).

**Payments integrity.** Every payment carries a unique **end-to-end ID**; the Payments Process API stores payment state and dedupes on that ID, so retries never post twice. No uncontrolled dual-writes: at any time exactly one core owns an account's ledger. Inbound payments from clearing arriving during cut-over are held in a queue and posted to the owning core after the switch. Continuous reconciliation between the payments hub and both cores (counts and sums by day) with alerts on breaks.

**NFRs, security and governance.**
- Balance inquiry < 500 ms p95: cache-free reads from the new core's APIs or a read model; mainframe reads via MQ within budget; routing lookup cached in memory.
- HA: multi-AZ deployment, autoscaling on CloudHub 2.0/Runtime Fabric, circuit breakers per core so a core outage affects only its customers.
- Security: mTLS between layers, OAuth2 for channels, PII masking in logs, full audit trail.
- Governance: migration control board, dress rehearsals per wave, runbooks, and dashboards per wave (traffic split, errors, reconciliation status).
`,
  followUps: [
    { q: 'Why not migrate all customers in one big bang?', a: 'One weekend for 2.2 million accounts and 60 integrations is a huge risk with no easy rollback. Waves limit blast radius, allow learning, and satisfy the regulator\'s parallel-run expectation per product set.' },
    { q: 'Where would you be careful with Mule specifically?', a: 'Mainframe connectivity (MQ message formats, EBCDIC/copybooks), large reconciliation batches (streaming, worker sizing), and keeping routing logic in one place rather than duplicated in each Process API.' },
    { q: 'How do downstream batch consumers like the data warehouse cope?', a: 'Give them one canonical feed built from events of both cores, with a core-of-origin attribute, so they do not need two pipelines and see migrated accounts continuously.' },
  ],
}
