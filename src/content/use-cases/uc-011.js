import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-011',
  category: 'use-cases',
  title: 'Marketing Consent Sync between CRM and Email Platform',
  level: 'INTERMEDIATE',
  tags: ['consent', 'bidirectional-sync', 'salesforce', 'conflict-resolution'],
  estMinutes: 25,
  diagram: {
    task: 'draw the two-way consent sync: how Salesforce changes are captured as events, how SFMC unsubscribes are pulled, the queue both land on, the Consent Process API, the System APIs and the audit log.',
    checks: [
      { label: 'Salesforce consent changes are captured as events (CDC / Platform Events)', rule: { type: 'edge', from: 'crm', kind: 'async' } },
      { label: 'SFMC unsubscribes are pulled incrementally by a scheduled job', rule: { type: 'path', from: 'batch-job', to: ['saas', 'external-api'] } },
      { label: 'Both directions land on a queue to absorb unsubscribe spikes', rule: { type: 'edge', from: ['system-api', 'batch-job', 'process-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'A Consent Process API consumes the queue and applies the conflict rules', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api' } },
      { label: 'Salesforce is updated only through a System API (integration user)', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'SFMC is updated only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: ['sfmc', 'marketing'] }, from: 'system-api' } },
      { label: 'Every consent change is written to an append-only audit log', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'data-warehouse', 'file-store'], label: ['audit', 'log', 'consent'] } } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce Sales/Service Cloud'],
        cdc: ['event-stream', 'Salesforce CDC / Platform Events'],
        ssf: ['system-api', 'sys-salesforce-consent-api'],
        sfmc: ['saas', 'Marketing Cloud (SFMC)'],
        ssfmc: ['system-api', 'sys-sfmc-api'],
        poll: ['batch-job', 'SFMC unsubscribe poller (every few min)'],
        q: ['queue', 'consent-changes-q'],
        p: ['process-api', 'prc-consent-sync (opt-out wins)'],
        log: ['database', 'Consent audit log (append-only)'],
      },
      ['sf ~> cdc', 'cdc ~> ssf', 'ssf ~> q', 'poll -> ssfmc', 'ssfmc -> sfmc', 'poll ~> q', 'q ~> p', 'p -> ssf', 'p -> ssfmc', 'ssf -> sf', 'p -> log'],
    ),
  },
  description: `
A fashion retailer stores customers in **Salesforce Sales/Service Cloud** and sends campaigns from **Salesforce Marketing Cloud (SFMC)**. Consent can change in both places:

- In Salesforce: store staff and the call centre update a customer's email/SMS opt-in fields.
- In SFMC: customers click **unsubscribe** links or update preferences in the preference centre.
- The web shop also captures opt-ins at checkout and writes them to Salesforce.

Facts:
- 3 million contacts; ~20,000 consent changes/day; after a big campaign up to 50,000 unsubscribes in an hour.
- Legal requirement (GDPR/ePrivacy): an **unsubscribe must be honoured within 24 hours** and no marketing email may go to a contact who opted out; the company wants it within **15 minutes**.
- Auditors want to see **who changed consent, when, through which channel**.

**Describe your solution:**
- How do you capture changes on each side?
- How do you avoid infinite update loops between the two systems?
- Which change wins when both sides change at nearly the same time?
- How do you provide the audit trail?
`,
  answerTemplate: `## Capturing changes

## Loop prevention

## Conflict resolution

## Audit and compliance
`,
  keyPoints: [
    'Salesforce changes captured as events (Change Data Capture / Platform Events via the Salesforce connector) instead of polling 3M records.',
    'SFMC unsubscribes captured via its event mechanism or a frequent incremental extract (by modified date), within the 15-minute target.',
    'Loop prevention: updates written by the integration are tagged (integration user / source field) and the resulting change events are ignored.',
    'Conflict rule defined with the business: timestamp of the original consent action wins, and opt-out always wins over opt-in within a short conflict window.',
    'Every consent change stored as an immutable event (contact, channel, old/new value, source, timestamp, actor) in a consent log for auditors.',
  ],
  solution: `
**Capturing changes.**
- *Salesforce → SFMC:* subscribe to **Change Data Capture** on Contact (or a Platform Event fired by a flow when consent fields change) using the Salesforce connector's subscribe/listener operation. Store the replay ID so no events are lost during a restart. Map to SFMC's subscriber status / publication lists via the **Salesforce Marketing Cloud connector** (or its REST/SOAP API).
- *SFMC → Salesforce:* unsubscribes and preference-centre changes are pulled every few minutes as an incremental extract (unsubscribe events / subscriber status changed since the last watermark). Alternatively, they are pushed by SFMC automation to a Mule endpoint where available. Write them to Salesforce with a bulk/composite update keyed by Contact ID / subscriber key.
- Both sides land on an **Anypoint MQ** queue first so the 50k-unsubscribes-per-hour spike is absorbed and processed at a pace each API accepts.

(Note: Marketing Cloud Connect also synchronises some data natively; in an interview, mention you would first check what the product already does before building custom sync.)

**Loop prevention.** When Mule updates Salesforce from SFMC, it does so as a dedicated **integration user** and sets a \`Consent_Source__c = 'SFMC'\` field. The CDC listener ignores changes made by the integration user (CDC change headers include the user who made the change). Same idea on the SFMC side: only forward changes not originated by the sync. Additionally, skip updates where the target already has the same value.

**Conflict resolution.** Agree a rule with legal/marketing and implement it in the Process API:
- Each change carries the **time the customer actually acted** (not the time it reached Mule).
- The newer action wins; **but opt-out wins over opt-in** if they occur within a short window (e.g. 10 minutes), because sending to someone who opted out is the legal risk.
- Keep the last applied timestamp per contact/channel to discard stale, out-of-order events.

**Audit and compliance.** Every consent event — regardless of direction — is written to an **append-only consent log** (database table or object in Salesforce): contact ID, channel (email/SMS), old → new, source system, actor (user ID or "customer via link"), timestamps. Auditors query this log. Monitor end-to-end lag: alert if any unsubscribe is older than 15 minutes without being applied in SFMC.
`,
  followUps: [
    { q: 'Mule was down for 2 hours. Did we lose consent changes?', a: 'No: CDC events can be replayed from the stored replay ID within the retention window (72 hours for standard CDC), and the SFMC side uses a watermark, so both catch up. The audit log shows the delay.' },
    { q: 'What if SFMC rejects an update because the subscriber does not exist?', a: 'Treat it as a business error: create the subscriber with the opted-out status if the rule requires, otherwise park it with the reason. Never drop an opt-out silently.' },
    { q: 'How do you prove the 15-minute target is met?', a: 'Measure lag per event (customer action time vs applied time) and publish it in a dashboard with an alert threshold.' },
  ],
}
