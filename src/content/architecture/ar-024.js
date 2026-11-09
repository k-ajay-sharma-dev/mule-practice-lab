import { diagram } from '../../arch/dsl.js'

const BROKER = ['queue', 'topic', 'cloud-queue', 'event-stream']
const STATE = ['database', 'sql-server', 'oracle-db']
const BACKEND = ['crm', 'external-api', 'oracle-db', 'database', 'erp', 'legacy', 'payment', 'saas']
const APIS = ['experience-api', 'process-api', 'system-api']

export default {
  id: 'ar-024',
  category: 'architecture',
  title: 'Distributed Transactions: Saga vs 2PC',
  level: 'EXPERT',
  tags: ['saga', 'eventual-consistency', 'two-phase-commit', 'compensation'],
  estMinutes: 40,
  diagram: {
    task: 'draw the orchestrated saga for a new subscription: one orchestrator that owns the order, its durable saga state, the queue that drives each step, a DLQ for failed compensations, and a System API for each of the six systems it calls.',
    checks: [
      { label: 'The online shop reaches an Experience API', rule: { type: 'path', from: ['web-app', 'mobile-app'], to: 'experience-api' } },
      { label: 'The Experience API hands the order to the orchestrator', rule: { type: 'each', of: 'experience-api', edgeTo: ['process-api', ...BROKER] } },
      { label: 'One orchestrator calls all six System APIs (Salesforce, bureau, numbers, billing, provisioning, payment)', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 6, some: true } },
      { label: 'The orchestrator keeps saga state in a durable database', rule: { type: 'edge', from: 'process-api', to: STATE } },
      { label: 'The orchestrator sends each next step as a queue message', rule: { type: 'edge', from: 'process-api', to: BROKER, kind: 'async' } },
      { label: 'Step messages are consumed again, so another replica can resume the saga', rule: { type: 'path', from: 'process-api', via: BROKER, to: 'process-api' } },
      { label: 'Failed compensations go to a DLQ', rule: { type: 'edge', from: ['process-api', ...BROKER], to: 'dlq', kind: 'async' } },
      { label: 'Every System API is called by the orchestrator', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: BACKEND } },
      { label: 'Salesforce, the bureau, billing, provisioning and the payment provider are reached only through System APIs', rule: { type: 'only-via', target: ['crm', 'external-api', 'erp', 'legacy', 'payment', 'saas'], from: 'system-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'APIs call each other, the saga state and the REST backends with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'mobile-app', ...APIS], to: [...APIS, ...STATE, 'crm', 'external-api', 'erp', 'payment'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: [...BROKER, 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Online shop (sees order in progress)'],
        exp: ['experience-api', 'exp-subscription-orders (202 Accepted and a status endpoint)'],
        orc: ['process-api', 'prc-subscription-saga (orchestrator)'],
        state: ['database', 'Saga state per order (step, status, external IDs)'],
        q: ['queue', 'Saga steps (Anypoint MQ)'],
        dlq: ['dlq', 'Compensation DLQ (alert and manual task)'],
        scr: ['system-api', 'sys-credit-bureau'],
        cb: ['external-api', 'Credit bureau'],
        ssf: ['system-api', 'sys-salesforce-customer'],
        sf: ['crm', 'Salesforce'],
        snum: ['system-api', 'sys-number-inventory'],
        num: ['oracle-db', 'Number inventory (on-prem Oracle)'],
        spay: ['system-api', 'sys-payments (authorize, then capture last)'],
        pay: ['payment', 'Payment provider'],
        sbil: ['system-api', 'sys-billing-contract'],
        brim: ['erp', 'SAP BRIM'],
        sprov: ['system-api', 'sys-provisioning'],
        net: ['legacy', 'Network provisioning (callback in 1 to 10 min)'],
      },
      [
        'web -> exp', 'exp -> orc', 'orc -> state', 'orc ~> q', 'q ~> orc', 'orc ~> dlq',
        'orc -> scr', 'scr -> cb', 'orc -> ssf', 'ssf -> sf', 'orc -> snum', 'snum -> num', 'orc -> spay', 'spay -> pay', 'orc -> sbil', 'sbil -> brim', 'orc -> sprov', 'sprov -> net',
      ],
    ),
  },
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is XA/2PC not viable for the subscription order?',
      options: [
        'Mule 4 does not support XA at all',
        'The participants are HTTP services (Salesforce, bureau, billing API, payment provider, async provisioning), not XA resource managers — and locks held for 30 s to 10 minutes would kill availability',
        'XA is too slow for 2-second calls but fine otherwise',
        'XA only works with Anypoint MQ',
      ],
      answer: 1,
      explain: 'XA needs every participant to join a transaction under one transaction manager. In Mule it fits local XA-capable resources such as a database plus JMS/IBM MQ, not REST services.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Orchestration or choreography for this saga?',
      options: [
        'Choreography: each system reacts to events, no central owner',
        'Orchestration: an order process/orchestrator owns the state machine, giving one status and clear compensations',
        'Neither — use a single synchronous flow with retries',
        'Both at once for redundancy',
      ],
      answer: 1,
      explain: 'Many steps, strict ordering and the need to answer "where is order 123?" favour a central orchestrator. Choreography would scatter logic across systems you do not control.',
    },
    {
      type: 'order',
      prompt: 'Order the saga steps: reduce risk first, irreversible steps last.',
      items: [
        'Credit check (read-only)',
        'Reserve the phone number (with expiry)',
        'Authorize the payment (hold, no capture)',
        'Create the contract in billing in pending state',
        'Activate the SIM and wait for the callback',
        'Capture the payment and activate the contract',
      ],
      explain: 'Read-only and reversible steps go first; capturing money comes last. Moving the charge to the end fixes the "billed but no working SIM" incident.',
    },
    {
      type: 'match',
      prompt: 'Match each step to its compensation.',
      pairs: [
        ['Reserve phone number', 'Release the number'],
        ['Authorize payment', 'Void the authorization'],
        ['Create pending contract', 'Cancel the contract'],
        ['Activate SIM', 'Deactivate the SIM'],
      ],
      explain: 'Every step that changes state needs a defined undo. Authorizing instead of charging makes the payment compensation a cheap void rather than a refund.',
    },
    {
      type: 'multi',
      prompt: 'A saga is a long business process made of separate steps, each with its own undo action. A Mule orchestrator is halfway through one when its replica crashes. Which three things together let another replica resume the saga safely?',
      options: [
        'A saga record per order in a durable database, written before and after each step',
        'Steps driven by queue messages, so unfinished work is redelivered to another replica',
        'Idempotent step calls, so running a step a second time is safe',
        'Saga state kept in flow variables, so every step can read it',
        'An XA transaction held open across the HTTP calls, so a crash rolls them all back',
      ],
      answer: [0, 1, 2],
      explain: 'Durable state, redelivery and idempotency together let any replica resume the saga. Idempotency keys or external IDs make the repeat safe, and a scheduler can also find sagas stuck past their timeout. Flow variables die with the replica. XA does not help because HTTP services cannot join a transaction.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Cancelling the contract fails because billing is down. What happens?',
      options: [
        'Ignore it; the saga is over',
        'Retry with backoff; if it still fails, send it to a compensation DLQ with alert and a manual task carrying all context',
        'Retry immediately in a tight loop until it works',
        'Charge the customer anyway',
      ],
      answer: 1,
      explain: 'Compensations can fail too. They are never dropped silently: retries first, then a human with full context.',
    },
  ],
  description: `
A telecom operator sells a **new mobile subscription** online. One customer order must:

1. Create/verify the customer in **Salesforce** (SaaS, REST).
2. Run a **credit check** (external bureau, REST, ~2 s, sometimes times out).
3. Reserve a **phone number** in the number inventory (on-prem Oracle DB).
4. Create the **contract** in the billing system (SAP BRIM, via API; can take up to 30 s).
5. **Activate the SIM** in the network provisioning system (async, completes in 1–10 minutes, sends a callback).
6. Charge the **first month** via the payment provider.

Today a single Mule flow calls them in sequence. When step 5 fails, the customer is billed for a contract with no working SIM, and the reserved number is never released. A developer proposes "use XA transactions so it is all-or-nothing".

**Questions:**
- Why is 2PC/XA not viable here? When *would* XA be appropriate in Mule?
- Design a saga: orchestration or choreography? What are the steps, compensations, and their order?
- How do you persist saga state and survive Mule app restarts mid-saga?
- How do you handle compensations that fail, and what does the customer see during the process?
`,
  answerTemplate: `## Why not 2PC/XA

## Saga style and step order

## Compensations

## Saga state and recovery

## Failure of compensations and customer experience
`,
  keyPoints: [
    'XA/2PC requires all participants to be XA-capable resource managers under one transaction manager; SaaS REST APIs, external bureaus and async provisioning are not, and long locks over minutes are unacceptable.',
    'XA in Mule is appropriate only for local XA-capable resources (e.g. a database plus JMS/IBM MQ in the same transaction), not for HTTP services.',
    'An orchestrated saga (a central Order Process/orchestrator owning the state machine) fits better than choreography because there are many steps, strict ordering and visibility needs.',
    'Steps are ordered to do cheap, reversible or risk-reducing steps first (credit check, reservations) and hard-to-undo ones (payment capture, activation) last; each step has a defined compensating action.',
    'Saga state is persisted in a durable store per order with each step\'s status; steps and compensations are idempotent and retried, so the orchestrator can resume after a crash.',
    'Failed compensations go to a retry queue and then to manual handling with alerting; the customer sees an "order in progress" status rather than a false success or failure.',
  ],
  solution: `
**Why not 2PC/XA.** XA needs every participant to be an **XA resource manager** coordinated by one transaction manager (prepare/commit). Salesforce, the credit bureau, SAP BRIM's API, the payment provider and an async provisioning callback are **HTTP services**, not XA resources — they cannot join a transaction. Even if they could, holding locks for 30 s to 10 minutes would destroy availability. XA in Mule (via the Bitronix-based transaction manager) is for **local resources**: e.g. consume from IBM MQ/JMS and write to a database atomically. Here: not applicable.

**Saga style.** **Orchestration**: a *Subscription Order Process API* (or a dedicated orchestrator app) runs a state machine. Choreography (each service reacting to events) would scatter the logic over systems we don't control and make "where is order 123?" hard. Orchestration gives one owner, one status, clear compensations.

**Step order (reduce risk first, irreversible last).**
| # | Step | Compensation |
|---|---|---|
| 1 | Credit check | none (read-only) |
| 2 | Create/verify customer in Salesforce | usually none (customer record may stay; mark order failed) |
| 3 | Reserve number (with expiry) | release number |
| 4 | **Authorize** payment (hold, not capture) | void authorization |
| 5 | Create contract in billing in *pending* state | cancel contract |
| 6 | Activate SIM (async, wait for callback with timeout) | deactivate SIM |
| 7 | **Capture** payment, set contract *active* | refund (only if needed later) |

Moving charge from "early" to authorize-then-capture-at-the-end fixes the "billed but no SIM" incident.

**Saga state and recovery.** Persist a saga record per order in a **durable database** (orderId, current step, per-step status, external IDs, attempts, timestamps) — written **before** and **after** each step. Drive steps via **Anypoint MQ** messages (one message per next step) so a crashed replica's work is redelivered to another. Each step call is **idempotent** (idempotency keys/external IDs), so re-executing after a crash is safe. The async SIM callback is correlated by orderId; a scheduler detects sagas stuck past their timeout and triggers compensation or retry.

**Failed compensations and the customer.**
- Compensations are retried with backoff; if they still fail (e.g. billing down) → **compensation DLQ + alert + manual task** with all context. Never silently drop.
- Customer sees **"Order received — activating your SIM"** (202 Accepted + status endpoint/notifications), then success or a clear failure with "you have not been charged".

**Trade-offs.** Sagas give availability and loose coupling but accept **temporary inconsistency** (e.g. a number reserved for a failed order for minutes) and require careful design of every compensation. Business must accept that some states are "pending" — that's an explicit product decision.
`,
  followUps: [
    { q: 'When would you choose choreography instead?', a: 'When there are few steps, independent services owned by different teams react to a business event, and no single process needs strict ordering. It avoids a central orchestrator but makes end-to-end status and compensation logic harder to see.' },
    { q: 'Isn\'t a saga just reinventing a workflow engine? Why build it in Mule?', a: 'For a few sagas with moderate complexity, a Mule orchestrator with a state table and queues is reasonable. If there are many long-running, human-in-the-loop processes, a BPM/workflow engine is a better tool, with Mule integrating the systems.' },
    { q: 'What if traffic grows 10x on launch day?', a: 'The queue-driven orchestrator scales by adding consumers; slow backends (billing, provisioning) are the limit, so the queue absorbs the peak and the order status stays "in progress" longer instead of failing.' },
  ],
}
