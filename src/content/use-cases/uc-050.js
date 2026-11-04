import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-050',
  category: 'use-cases',
  title: 'API-Led: Telco Self-Service Plan Change',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'application-network', 'telecom', 'orchestration', 'process-api'],
  estMinutes: 30,
  diagram: {
    task: 'draw the API-led network for self-service plan changes: the three channels and their Experience APIs, the eligibility and plan-change Process APIs, the four System APIs and back ends, the async provisioning callback, saga state and the plan-changed event.',
    checks: [
      { label: 'App, website and store tablets each call their own Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The plan-change Process API reuses the eligibility Process API (rules live in one place)', rule: { type: 'edge', from: { type: 'process-api', label: ['change'] }, to: { type: 'process-api', label: ['eligib'] } } },
      { label: 'CRM, billing, catalogue and the OSS gateway are reached only through System APIs', rule: { type: 'only-via', target: ['crm', 'legacy', 'saas', 'erp', 'external-api'], from: 'system-api' } },
      { label: 'Provisioning completes asynchronously via a callback to the plan-change Process API', rule: { type: 'edge', from: ['legacy', 'erp', 'saas', 'external-api', 'system-api'], to: 'process-api', kind: 'async' } },
      { label: 'The plan-change saga state is persisted', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'A "plan changed" event is published asynchronously for notifications', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'My Account app'],
        web: ['web-app', 'Website'],
        store: ['internal-app', 'Retail store tablet'],
        ea: ['experience-api', 'exp-myaccount-app'],
        ew: ['experience-api', 'exp-web-selfservice'],
        es: ['experience-api', 'exp-retail-store'],
        pel: ['process-api', 'prc-plan-eligibility'],
        pchg: ['process-api', 'prc-plan-change'],
        state: ['database', 'Plan-change saga state'],
        t: ['topic', 'plan-changed'],
        ssf: ['system-api', 'sys-salesforce-customer'],
        sbill: ['system-api', 'sys-billing-subscriptions'],
        scat: ['system-api', 'sys-product-catalogue'],
        sprov: ['system-api', 'sys-network-provisioning'],
        sf: ['crm', 'Salesforce'],
        bill: ['legacy', 'Billing (SOAP)'],
        cat: ['saas', 'Product catalogue'],
        oss: ['legacy', 'OSS provisioning gateway (async)'],
      },
      [
        'app -> ea', 'web -> ew', 'store -> es', 'ea -> pel', 'ew -> pel', 'es -> pel', 'ea -> pchg', 'ew -> pchg', 'es -> pchg',
        'pchg -> pel', 'pel -> sbill', 'pel -> ssf', 'pel -> scat', 'pchg -> sbill', 'pchg -> ssf', 'pchg -> sprov', 'pchg -> state', 'pchg ~> t',
        'ssf -> sf', 'sbill -> bill', 'scat -> cat', 'sprov -> oss', 'oss ~> pchg',
      ],
    ),
  },
  description: `
A mobile operator wants customers to **change their tariff plan** themselves, instead of calling the contact centre.

| Channel | Needs |
|---|---|
| **My Account app** (iOS/Android) | See eligible plans with price difference, change plan, see confirmation |
| **Website** (logged-in area) | Same journey |
| **Retail store tablets** | Staff change plans on behalf of customers, can override eligibility with a reason |

| System | Role | Interface |
|---|---|---|
| **Salesforce** (CRM) | Customer, contract, commitment end date, interaction history | REST |
| **Billing** (Amdocs / CSG-style) | Current plan, rating, bill cycle, outstanding debt | SOAP |
| **Product catalogue** | Plans, prices, eligibility rules (device, contract type) | REST |
| **Network provisioning** (HSS/PCRF via an OSS gateway) | Activates data allowances, roaming flags | Async — accepts job, calls back in 5 s–10 min |

Business rules:
- Upgrades are effective **immediately**; downgrades only at the **next bill cycle**, and not during a commitment period.
- Customers with **debt > 30 days** cannot change plan.
- Billing must be updated **before** provisioning; if provisioning fails, the billing change must be **compensated** and the customer told.
- ~8,000 plan changes/day, browsing eligible plans ~30 req/s.

**Questions:**
1. Decompose into Experience, Process and System APIs (names, resources).
2. Describe the sequence for "customer upgrades plan in the app", including the async provisioning.
3. Where do eligibility rules live, and how does the store "override" work without duplicating logic?
4. How do you handle provisioning failure?
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Interactions & sequence

## Eligibility and store override

## Failure handling / compensation

## Reuse and NFRs
`,
  keyPoints: [
    'System APIs: sys-salesforce-customer, sys-billing-subscriptions, sys-product-catalogue, sys-network-provisioning (async with callback).',
    'Two Process APIs: prc-plan-eligibility (read side: which plans can this subscription move to?) and prc-plan-change (write side: orchestrate the change as a saga).',
    'Experience APIs per channel (app, web, store); the store one passes an override flag + reason, only allowed for the store client and staff role, but the rule check itself stays in the Process API.',
    'Plan change is long-running: return 202 Accepted with an orderId, track state in a persistent store, complete via the provisioning callback, notify the customer.',
    'Compensation: if provisioning fails, revert the billing change and update CRM; idempotency keys prevent double changes from retries.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-myaccount-app** | \`GET /me/subscriptions/{msisdn}/plan-options\`, \`POST /me/subscriptions/{msisdn}/plan-changes\`, \`GET /me/plan-changes/{id}\` | App shaping, customer from token | Mobile app |
| Experience | **exp-web-selfservice** | same resources, web payloads | Web shaping | Website |
| Experience | **exp-retail-store** | \`POST /subscriptions/{msisdn}/plan-changes\` (with \`override\` + \`reason\`) | Staff identity, store ID, override permission | Store tablets |
| Process | **prc-plan-eligibility** | \`GET /subscriptions/{msisdn}/eligible-plans\` | Combine catalogue + current plan + contract + debt → eligible plans with price delta and effective date | All Experience APIs, prc-plan-change |
| Process | **prc-plan-change** | \`POST /plan-changes\`, \`GET /plan-changes/{id}\`, \`POST /plan-changes/{id}/provisioning-callback\` | Saga: re-check eligibility, update billing, request provisioning, complete/compensate, log CRM interaction, trigger notification | All Experience APIs |
| System | **sys-salesforce-customer** | \`GET /contracts?msisdn=\`, \`POST /interactions\` | CRM access | both Process APIs |
| System | **sys-billing-subscriptions** | \`GET /subscriptions/{msisdn}\`, \`PUT /subscriptions/{msisdn}/plan\`, \`GET /accounts/{id}/debt\` | Wrap SOAP billing | both Process APIs |
| System | **sys-product-catalogue** | \`GET /plans\`, \`GET /plans/{code}/rules\` | Catalogue access (cacheable) | prc-plan-eligibility |
| System | **sys-network-provisioning** | \`POST /provisioning-jobs\`, callback to caller | Wrap OSS gateway async jobs | prc-plan-change |

\`\`\`
 [App]          [Web]            [Store tablet]
   |              |                    |
 exp-myaccount  exp-web-          exp-retail-store            Experience
 -app           selfservice            |
   +--------------+---------+----------+
                            v
       prc-plan-eligibility <---- prc-plan-change              Process
         |        |      |          |      |       |
         |        |      +----------+      |       |
  sys-product  sys-billing-     sys-salesforce  sys-network-   System
  -catalogue   subscriptions    -customer       provisioning
\`\`\`

**Sequence — customer upgrades in the app**
1. App → exp-myaccount-app \`GET .../plan-options\` → prc-plan-eligibility: reads current plan + debt (billing), contract end date (CRM), plans + rules (catalogue, cached 1 h). Returns eligible plans, price delta and effective date (immediate for upgrades).
2. App → exp-myaccount-app \`POST .../plan-changes\` with header \`Idempotency-Key\`.
3. exp-myaccount-app → prc-plan-change \`POST /plan-changes\` (channel = APP, customer from token).
4. prc-plan-change **re-checks eligibility** (never trust the earlier screen), stores the change in state \`PENDING\` (DB or persistent Object Store), calls sys-billing-subscriptions \`PUT /plan\` → state \`BILLING_UPDATED\`.
5. Calls sys-network-provisioning \`POST /provisioning-jobs\` → job accepted; responds **202 Accepted** \`{ id, status: "IN_PROGRESS" }\` to the app.
6. OSS gateway calls back → prc-plan-change \`/provisioning-callback\` → state \`COMPLETED\`, logs an interaction in Salesforce, publishes a "plan changed" event (Anypoint MQ) for SMS/email notification.
7. App polls \`GET /me/plan-changes/{id}\` or receives a push.

**Eligibility and override.** All rules live in prc-plan-eligibility (debt, commitment, downgrade timing, device compatibility). The store Experience API may send \`override: true, reason\` only if the caller is the store client app **and** the staff JWT has the \`plan-override\` role (checked in exp-retail-store). prc-plan-change then skips only the overridable rules (e.g. commitment period) — debt rules stay mandatory — and records who overrode and why.

**Failure handling.**
- Provisioning failure callback or timeout (no callback in 15 min, scheduled sweep) → **compensate**: \`PUT /plan\` back to the old plan in billing, state \`FAILED_COMPENSATED\`, CRM interaction + customer notification.
- Billing call fails → nothing to compensate, state \`FAILED\`, error returned synchronously.
- Retries with Until Successful only for transient errors; idempotency key + stored state make retries and duplicate submissions safe.

**Reuse.** prc-plan-eligibility is reused by the upcoming *upgrade-offer* marketing campaign; sys-billing-subscriptions and sys-salesforce-customer are core assets for every future telco journey (SIM swap, add-ons).

**NFRs.** Cache catalogue data; Spike Control on sys-billing-subscriptions (legacy SOAP); SLA tiers per Experience consumer; correlation ID from Experience through the callback so a single plan change can be traced end to end.
`,
  followUps: [
    { q: 'Why split eligibility and plan change into two Process APIs?', a: 'They have different consumers and characteristics: eligibility is a high-volume, cacheable read used also by marketing; plan change is a low-volume, stateful write saga. Splitting keeps each simple and independently scalable.' },
    { q: 'Why does prc-plan-change re-check eligibility when the screen already showed eligible plans?', a: 'State can change between browsing and submitting (a payment becomes overdue), and a client could call the POST directly. Business rules must be enforced at write time on the server.' },
    { q: 'Could you use a distributed XA transaction instead of compensation?', a: 'No — billing SOAP, an async OSS gateway and Salesforce do not take part in a shared XA transaction. Long-running cross-system changes need a saga with compensating actions.' },
    { q: 'Downgrades take effect at the next bill cycle — what changes?', a: 'prc-plan-change schedules the billing change for the cycle date (many billing systems accept a future-dated plan change) and provisioning is triggered at that date by a scheduler or a billing event, with the same state machine.' },
  ],
}
