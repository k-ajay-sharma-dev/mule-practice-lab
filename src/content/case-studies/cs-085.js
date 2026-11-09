import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-085',
  category: 'case-studies',
  title: 'Bank Building a Payment Hub on ISO 20022',
  level: 'ADVANCED',
  tags: ['banking', 'payments', 'iso-20022', 'payment-hub', 'canonical-model', 'events', 'api-led'],
  estMinutes: 55,
  diagram: {
    task: 'draw the payment hub: online banking and corporate pain.001 files both feed one hub Process API that screens for sanctions and fraud, reserves funds in the core, sends instant payments synchronously, hands SWIFT and Bacs payments to queues, and publishes payment status to a topic.',
    checks: [
      { label: 'Online banking reaches the hub through an Experience API', rule: { type: 'path', from: 'web-app', via: 'experience-api', to: { type: 'process-api', label: ['hub'] } } },
      { label: 'Online banking never calls the hub directly', rule: { type: 'no-edge', from: 'web-app', to: 'process-api' } },
      { label: 'Corporate pain.001 files feed the same hub', rule: { type: 'path', from: 'batch-job', to: { type: 'process-api', label: ['hub'] } } },
      { label: 'The hub screens every payment for sanctions and fraud', rule: { type: 'each', of: { type: 'system-api', label: ['sanction', 'fraud'] }, min: 2, edgeFrom: { type: 'process-api', label: ['hub'] } } },
      { label: 'Screening engines are reached only through System APIs', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Instant payments are sent by a synchronous call from the hub', rule: { type: 'edge', from: { type: 'process-api', label: ['hub'] }, to: { type: 'system-api', label: ['instant'] }, kind: 'sync' } },
      { label: 'SWIFT and Bacs payments are handed over through queues', rule: { type: 'each', of: { type: 'system-api', label: ['swift', 'bacs'] }, min: 2, edgeFrom: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'Payment schemes are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Payment status events fan out to at least two consumers', rule: { type: 'edge', from: ['topic', 'event-stream'], kind: 'async', min: 2 } },
    ],
    reference: diagram(
      {
        olb: ['web-app', 'Online banking'],
        corp: ['partner', 'Corporate clients (host to host)'],
        sftp: ['sftp-server', 'H2H SFTP (pain.001 files)'],
        fjob: ['batch-job', 'pain.001 file intake'],
        qin: ['queue', 'payments.inbound-bulk'],
        exp: ['experience-api', 'exp-payment-initiation-api'],
        hub: ['process-api', 'prc-payment-hub (canonical pacs.008)'],
        qsw: ['queue', 'route.swift'],
        qbacs: ['queue', 'route.bacs'],
        st: ['topic', 'payment-status (pacs.002)'],
        ssan: ['system-api', 'sys-sanctions-api'],
        sfr: ['system-api', 'sys-fraud-scoring-api'],
        sled: ['system-api', 'sys-core-ledger-api'],
        sinst: ['system-api', 'sys-instant-scheme-api'],
        sswift: ['system-api', 'sys-swift-api'],
        sbacs: ['system-api', 'sys-bacs-api'],
        snot: ['system-api', 'sys-customer-notify-api'],
        san: ['saas', 'Sanctions filter'],
        fraud: ['saas', 'Fraud scoring engine'],
        core: ['legacy', 'Core banking (debit and reserve)'],
        inst: ['external-api', 'Instant payments scheme'],
        swift: ['external-api', 'SWIFT Alliance gateway (MX)'],
        bacs: ['external-api', 'Bacs bureau'],
        notif: ['notification', 'Customer notifications'],
        dw: ['data-warehouse', 'Payments data warehouse'],
      },
      [
        'olb -> exp', 'exp -> hub', 'corp -> sftp', 'fjob -> sftp', 'fjob ~> qin', 'qin ~> hub',
        'hub -> ssan', 'hub -> sfr', 'hub -> sled', 'hub -> sinst', 'hub ~> qsw', 'hub ~> qbacs', 'hub ~> st',
        'qsw ~> sswift', 'qbacs ~> sbacs', 'sswift ~> st', 'ssan -> san', 'sfr -> fraud', 'sled -> core',
        'sinst -> inst', 'sswift -> swift', 'sbacs -> bacs', 'st ~> snot', 'snot -> notif', 'st ~> dw',
      ],
    ),
  },
  description: `
**Context.** A mid-size European bank sends 3.5 million payments a month: instant domestic payments, SWIFT cross-border payments and bulk Bacs payroll for corporate clients. Each channel has its own path today:
- Online banking calls a stored procedure in core banking that writes to scheme-specific tables.
- Corporate clients upload pain.001 files to an SFTP server. A Java job converts them to Bacs Standard 18 and MT103.
- SWIFT messages are built in a 20 year old payment engine that only speaks MT.

**Drivers**
- SWIFT cross-border payments moved to ISO 20022 (MX) messages and the coexistence period ended in November 2025. The old engine cannot produce rich pacs.008 data.
- Sanctions screening is done three different ways and one channel screens after release.
- Customers cannot see the status of a payment across channels.

**Requirements**
- One hub that holds every payment in a canonical model based on pacs.008, whatever the channel.
- Every payment screened for sanctions and scored for fraud before funds leave.
- Instant payments complete within 5 seconds end to end, 24/7.
- SWIFT and Bacs have cut-off times and batch windows; the hub must keep accepting payments when those gateways are slow or closed.
- Payment status (accepted, rejected, settled) as pacs.002 events for notifications and reporting.
- Corporate files of up to 50,000 payments must not block online payments.

**Your task.** Design the payment hub integration.
`,
  answerTemplate: `## Canonical model and why pacs.008

## Channels into the hub

## Hub processing steps

## Routing per scheme: sync or async

## Status events

## Non-functional design (5 seconds, 24/7, bulk files)

## Migration from the current paths

## Risks
`,
  keyPoints: [
    'Every channel maps into one canonical payment based on pacs.008; corporate pain.001 files are split into single payments and fed to the same hub through a queue.',
    'The hub validates, screens for sanctions, scores for fraud and reserves funds in core banking, each through a System API, before routing.',
    'Instant payments go to the scheme by a synchronous call within the 5 second budget; SWIFT and Bacs payments wait on queues, so cut-offs and gateway outages do not stop intake.',
    'Scheme responses become pacs.002 status events on a topic that drives notifications, reporting and the customer status view.',
    'Bulk files run on their own workers and queue so a 50,000 payment file cannot starve the instant path.',
  ],
  solution: `
**Canonical model.** pacs.008 is the interbank format all three schemes now use or map to, and it carries structured party and remittance data. The hub stores a canonical payment with a hub ID, the end-to-end ID from the customer, and a status history.

**Channels**
- Online banking → \`exp-payment-initiation-api\` → hub, synchronously, so the customer sees the result.
- Corporate files: \`pain.001 file intake\` validates the file against the XSD, acknowledges it with pain.002, splits it into payments and puts them on \`payments.inbound-bulk\`. The hub consumes them with a limited number of workers.

**Hub steps.** Validate and enrich (BIC, IBAN checks), deduplicate on end-to-end ID, sanctions screen, fraud score, reserve funds in core, route, publish status.

**Routing**
| Scheme | Hand-off | Why |
|---|---|---|
| Instant | Synchronous call to \`sys-instant-scheme-api\` | 5 second end-to-end budget; the result is needed now |
| SWIFT (pacs.008 MX) | \`route.swift\` queue | Gateway sessions, cut-offs, store and forward |
| Bacs | \`route.bacs\` queue | Daily submission windows |

**Status.** The instant result, SWIFT pacs.002 and Bacs reports become \`payment-status\` events. Consumers: notifications, the warehouse and the status API.

**Non-functional.** Instant path budget: screening 800 ms, fraud 150 ms, reserve 300 ms, scheme 2 s, with timeouts set below those. Hub replicas spread over zones on CloudHub 2.0 or Runtime Fabric. Bulk workers are separate so instant traffic always has capacity.

**Migration.** Start with SWIFT (the deadline), then corporate files, then online banking. Keep the old paths per channel until volumes are moved; compare outputs in shadow mode first.

**Risks.** A screening outage blocks all payments (run screening in two zones, hold rather than skip), duplicate payments from file resubmission (dedupe on file and end-to-end ID), and data truncation when mapping rich MX to older formats (log truncation and inform the customer).
`,
  followUps: [
    { q: 'Why is the instant route synchronous while SWIFT goes through a queue?', a: 'The instant scheme gives a few seconds for an answer and the customer waits for it. SWIFT works with cut-offs and store-and-forward gateways, so a queue absorbs outages and windows.' },
    { q: 'How do you stop a 50,000 payment file from slowing down instant payments?', a: 'Bulk payments run from their own queue with a fixed worker count, and the instant path has dedicated replicas. File processing then fills spare capacity only.' },
    { q: 'Where do you deduplicate payments?', a: 'In the hub on the end-to-end ID with the debtor account, plus a file-level check on name and hash for corporate uploads.' },
    { q: 'What does the canonical model gain you if every scheme already uses ISO 20022?', a: 'Channels and the hub logic depend on one model. Scheme versions and usage guidelines differ, and only the System API for that scheme changes when they do.' },
  ],
}
