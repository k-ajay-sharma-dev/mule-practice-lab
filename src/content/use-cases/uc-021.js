import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-021',
  category: 'use-cases',
  title: 'Subscription Billing for a SaaS Company',
  level: 'ADVANCED',
  tags: ['subscriptions', 'billing', 'salesforce-cpq', 'erp', 'event-driven'],
  estMinutes: 35,
  diagram: {
    task: 'draw the subscription integration: the closed-won event into a Subscription Process API, billing and tenant provisioning via System APIs, the daily usage upload, billing events driving entitlements, and the finance feed to NetSuite.',
    checks: [
      { label: 'Closed-won is published as an event (no nightly batch)', rule: { type: 'edge', from: 'crm', kind: 'async' } },
      { label: 'A closed-won deal leads to a subscription in the billing platform', rule: { type: 'path', from: 'crm', to: { type: ['saas', 'erp', 'external-api'], label: ['billing', 'zuora', 'subscription'] } } },
      { label: 'A closed-won deal leads to a provisioned tenant in the product platform', rule: { type: 'path', from: 'crm', to: { type: ['saas', 'database', 'external-api'], label: ['product', 'tenant', 'platform'] } } },
      { label: 'Usage is aggregated by a batch job and bulk-uploaded to billing', rule: { type: 'path', from: { type: 'batch-job', label: 'usage' }, to: { type: ['saas', 'erp', 'external-api'], label: ['billing', 'zuora', 'subscription'] } } },
      { label: 'Billing events (overdue / paid) drive entitlement changes asynchronously', rule: { type: 'path', from: { type: ['saas', 'erp', 'external-api'], label: ['billing', 'zuora', 'subscription'] }, via: ['queue', 'topic', 'event-stream'], to: { type: ['saas', 'database', 'external-api'], label: ['product', 'tenant', 'platform'] } } },
      { label: 'A daily finance feed reaches NetSuite', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'NetSuite is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Process APIs never call SaaS, CRM or ERP systems directly', rule: { type: 'no-edge', from: 'process-api', to: ['saas', 'erp', 'crm'] } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce Sales Cloud + CPQ'],
        q: ['queue', 'closed-won-q'],
        p: ['process-api', 'prc-subscription-api'],
        ssf: ['system-api', 'sys-salesforce-cpq-api'],
        sbill: ['system-api', 'sys-billing-api'],
        bill: ['saas', 'Subscription billing (Zuora-like)'],
        sprod: ['system-api', 'sys-product-platform-api (entitlements, usage)'],
        prod: ['saas', 'Product platform'],
        usage: ['batch-job', 'Daily usage aggregation & bulk upload'],
        bq: ['queue', 'billing-events-q'],
        dun: ['process-api', 'prc-dunning-entitlements'],
        fin: ['batch-job', 'Daily finance sync'],
        sns: ['system-api', 'sys-netsuite-api'],
        ns: ['erp', 'NetSuite'],
      },
      [
        'sf ~> q', 'q ~> p', 'p -> ssf', 'ssf -> sf', 'p -> sbill', 'sbill -> bill', 'p -> sprod', 'sprod -> prod', 'usage -> sprod',
        'usage -> sbill', 'bill ~> bq', 'bq ~> dun', 'dun -> sbill', 'dun -> sprod', 'fin -> sbill', 'fin -> sns', 'sns -> ns',
      ],
    ),
  },
  description: `
A B2B software company sells **annual and monthly subscriptions** with usage-based add-ons (API calls above an included quota).

Systems:
- **Salesforce Sales Cloud + CPQ**: quotes and closed-won opportunities (new deals, upgrades, renewals, cancellations).
- A **subscription billing platform** (Zuora-like, REST API): subscriptions, invoices, payment collection.
- The company's own **product platform**: provisions tenants, enforces plan limits, and produces **usage records** (~8 million API-call usage events/day across 4,000 customers).
- **NetSuite** (ERP): general ledger, revenue recognition, financial reporting.

Requirements:
- When a deal is closed-won, the customer must be **provisioned within 15 minutes** and billing must start on the contract start date.
- Mid-term upgrades are **prorated**; downgrades take effect at renewal.
- Usage over quota is billed **monthly in arrears**.
- If an invoice is unpaid for 30 days, the product must switch the tenant to **read-only**; payment restores it.
- Finance needs invoices, payments and credit memos in NetSuite daily, reconciled.

**Design the integration:**
- Which system owns which data (customer, subscription, invoice, entitlement)?
- The flow from closed-won to provisioning and billing, including amendments.
- How do you get 8M usage events/day into billing?
- How do dunning/suspension and the NetSuite feed work?
`,
  answerTemplate: `## Systems of record

## Closed-won to provisioning and billing

## Amendments (upgrade, downgrade, cancellation)

## Usage

## Dunning and entitlements

## Finance feed and reconciliation
`,
  keyPoints: [
    'Clear ownership: Salesforce owns the commercial deal, billing platform owns the subscription and invoices, product platform owns entitlements/usage, NetSuite owns the ledger; shared customer/account ID maintained across them.',
    'Closed-won event (Platform Event/CDC) triggers an orchestration: create/update billing account and subscription from CPQ quote lines (product catalog mapped by SKU), then provision tenant with entitlements; idempotent by opportunity/quote ID.',
    'Amendments map to billing-platform amendment operations (proration done by the billing platform, not hand-calculated in DataWeave); provisioning updated on effective date.',
    'Usage aggregated before sending (per customer, per day or month) and uploaded via bulk usage import, not 8M individual API calls; counts reconciled.',
    'Payment/overdue events from billing drive entitlement changes (read-only after 30 days, restore on payment) through an Entitlement API.',
    'Daily finance sync to NetSuite with idempotent external IDs plus a control-total reconciliation between billing and NetSuite.',
  ],
  solution: `
**Systems of record.**
- Account, opportunity, quote, contract terms → **Salesforce/CPQ**
- Subscription, rate plans, invoices, payments → **billing platform**
- Tenant, entitlements, usage → **product platform**
- GL, revenue recognition → **NetSuite**

A common **customer ID** (Salesforce Account ID) is stored as external ID in every system; product catalog SKUs are mapped centrally (CPQ product ↔ billing rate plan ↔ product plan).

**Closed-won to provisioning and billing.**
1. Salesforce emits an event on closed-won (Platform Event from a Flow, or CDC on Opportunity/Order) → Mule subscribes (Salesforce connector) and enqueues.
2. **Subscription Process API**: reads quote lines from CPQ and maps them with DataWeave to the billing platform's account + subscription payload (start date, term, rate plans, quantities). It then creates them, idempotent by quote ID (check the external reference before create).
3. Calls the **Entitlement System API** of the product platform to provision the tenant with plan limits (included API quota, features).
4. Writes back to Salesforce: billing account/subscription numbers, tenant ID, status. Failures at any step → retry, then alert the deal desk with the exact step; completed steps are not repeated.
15-minute SLA: event-driven, no nightly batch.

**Amendments.** An upgrade quote (CPQ amendment) becomes an **amendment** in the billing platform (add/update product effective on date) — **proration is calculated by the billing platform**, not in Mule. Entitlements upgrade immediately. Downgrades are scheduled at the renewal date (the billing platform holds the future-dated change; Mule or a scheduler applies the entitlement change on that date). Cancellations stop renewal and schedule deprovisioning at term end.

**Usage.** 8M raw events/day must not become 8M API calls:
- The product platform writes usage events to its own store/stream; a **daily Mule batch** reads aggregated counts per customer per metric (aggregation done at the source via a query, or in a Batch Job with streaming).
- Upload as a **bulk usage file/import** to the billing platform (most platforms support CSV usage uploads or bulk usage APIs). Key it by customer + date + metric so a re-run replaces rather than duplicates.
- Reconcile: total units sent = total units accepted; monthly invoices in arrears use these records.

**Dunning and entitlements.** The billing platform runs dunning (reminders, retries). Its events/callouts (invoice overdue, payment received) go to Mule → **Entitlement API**: overdue 30 days → tenant *read-only*; payment applied → *active*. Use the billing platform's state as truth: before switching to read-only, re-check the invoice balance (avoids suspending a customer who paid minutes ago). Notify the account owner in Salesforce.

**Finance feed and reconciliation.** Daily: invoices, payments, credit memos and refunds from the billing platform → NetSuite (NetSuite connector), mapped to customers, items and GL accounts; billing platform IDs as **external IDs** (upsert, so reruns are safe). Revenue schedules are created in NetSuite based on item configuration. A reconciliation report compares counts and totals per day between billing and NetSuite and highlights differences to finance.
`,
  followUps: [
    { q: 'Sales edits the opportunity after closed-won. Do you resend everything?', a: 'No. Changes after booking must go through an amendment quote; the integration ignores edits to booked opportunities (or flags them) so billing is not silently overwritten.' },
    { q: 'Usage arrives late for the previous month after invoices were generated. What then?', a: 'Agree a usage cut-off (e.g. 2 days after month end) before bill run; late usage goes into the next period or a manual adjustment, never a silent re-invoice.' },
    { q: 'How do you test the end-to-end flow?', a: 'Salesforce sandbox + billing platform sandbox + product staging tenant; scripted scenarios (new, upgrade mid-term, downgrade, cancel, overdue, payment) checked in each system, with MUnit for mappings and idempotency.' },
  ],
}
