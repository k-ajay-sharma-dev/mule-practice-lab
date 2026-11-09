import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-080',
  category: 'case-studies',
  title: 'Card Issuer Automating Card Disputes and Chargebacks',
  level: 'INTERMEDIATE',
  tags: ['banking', 'cards', 'disputes', 'orchestration', 'events', 'api-led', 'third-party-apis'],
  estMinutes: 45,
  diagram: {
    task: 'draw the dispute design: the app and chat assistant on one Experience API, a dispute Process API that raises the chargeback with the card processor, opens a case and posts provisional credit, and dispute status changes published to a topic that feeds customer notifications and reporting.',
    checks: [
      { label: 'The banking app and the chat assistant both use an Experience API', rule: { type: 'each', of: ['mobile-app', 'chatbot'], min: 2, edgeTo: 'experience-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The card processor is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Case management is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Provisional credit is posted to the core ledger through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'legacy' } },
      { label: 'Dispute status changes are published to a topic', rule: { type: 'edge', from: ['process-api', 'batch-job', 'system-api'], to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'One status event fans out to at least two consumers', rule: { type: 'edge', from: ['topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'Customers are notified from the status events', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'notification' } },
      { label: 'The Process API never calls the notification service synchronously', rule: { type: 'no-path', from: 'process-api', to: 'notification', kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Banking app'],
        bot: ['chatbot', 'Chat assistant'],
        exp: ['experience-api', 'exp-disputes-api'],
        prc: ['process-api', 'prc-card-dispute-api'],
        job: ['batch-job', 'Dispute status poll (every 30 min)'],
        evt: ['topic', 'dispute-status-changed'],
        sproc: ['system-api', 'sys-card-processor-api'],
        scase: ['system-api', 'sys-case-mgmt-api'],
        sled: ['system-api', 'sys-core-ledger-api'],
        sntf: ['system-api', 'sys-customer-notify-api'],
        proc: ['external-api', 'Card processor dispute API'],
        case: ['crm', 'Salesforce Service Cloud (cases)'],
        core: ['legacy', 'Core banking ledger'],
        notif: ['notification', 'Push / SMS / email'],
        dw: ['data-warehouse', 'Disputes reporting'],
      },
      [
        'mob -> exp', 'bot -> exp', 'exp -> prc', 'prc -> sproc', 'prc -> scase', 'prc -> sled', 'prc ~> evt',
        'job -> sproc', 'job ~> evt', 'sproc -> proc', 'scase -> case', 'sled -> core',
        'evt ~> sntf', 'sntf -> notif', 'evt ~> dw',
      ],
    ),
  },
  description: `
**Context.** A card issuer with 4 million Visa and Mastercard debit and credit cards handles 18,000 disputes a month (unrecognised payments, goods not received, double charges). Card processing is outsourced to a processor that exposes a REST dispute API and the scheme dispute workflows behind it.

**The problem today**
- Customers phone the contact centre. Agents fill in a web form at the processor and copy the details into Salesforce Service Cloud by hand.
- Provisional credit is posted by a back-office team from a spreadsheet, often days late, which breaks the regulator's expectations for unauthorised transactions.
- Scheme deadlines are missed: a chargeback raised after the scheme window is lost, about 400,000 EUR a year.
- Customers do not know the status and call again.

**Goals**
- Customers raise a dispute in the app or with the chat assistant in under 3 minutes.
- The chargeback is raised at the processor and a case opened the same minute; provisional credit posted the same day.
- Customers are told when the status changes (merchant responded, credit made final, dispute lost).

**Constraints**
- The processor API allows 50 requests per second and does not send webhooks. Status changes must be polled.
- Core banking posts ledger entries through a CICS transaction wrapped in a SOAP service.
- Card numbers must not be stored outside the processor; the bank uses the processor's card reference.

**Your task.** Design the dispute integration, including status tracking, deadlines and notifications.
`,
  answerTemplate: `## Dispute journey and states

## API layers

## Raising the chargeback and the case

## Provisional credit

## Tracking status changes

## Notifications and reporting

## Risks
`,
  keyPoints: [
    'One Experience API serves the app and the chat assistant, and one dispute Process API owns the journey and its deadlines.',
    'The Process API raises the dispute at the processor, opens the case and posts provisional credit, each through its own System API, using the dispute ID as the idempotency key.',
    'Because the processor has no webhooks, a scheduled job polls changed disputes and publishes status events.',
    'Status changes go to a topic so notifications, case updates and reporting consume them independently; the Process API never waits on SMS or push.',
    'Card numbers stay at the processor; the bank stores only the processor card reference and transaction ID.',
  ],
  solution: `
**States.** \`RAISED → SUBMITTED_TO_PROCESSOR → CREDIT_PROVISIONAL → MERCHANT_RESPONDED → WON | LOST | WITHDRAWN\`.

**Layers**
- \`exp-disputes-api\`: \`GET /cards/{cardRef}/transactions\` (recent transactions to pick from), \`POST /disputes\`, \`GET /disputes/{id}\`.
- \`prc-card-dispute-api\`: validates eligibility (transaction age against the scheme window, amount, reason code), raises the dispute, opens the case, posts credit, publishes events.
- System APIs: \`sys-card-processor-api\`, \`sys-case-mgmt-api\`, \`sys-core-ledger-api\`, \`sys-customer-notify-api\`.

**Raising.** The Process API creates its own dispute ID first, then calls the processor with it as a reference, then opens the Salesforce case with the processor dispute ID. If the processor call fails, the dispute stays \`RAISED\` and a retry job resubmits it; the reference prevents a double submission.

**Provisional credit.** Posted through \`sys-core-ledger-api\` with the dispute ID as the idempotency key. If the dispute is lost later, a reversal entry uses the same key plus a suffix.

**Status tracking.** \`Dispute status poll\` runs every 30 minutes, asks the processor for disputes changed since the last watermark (paged, well under 50 requests per second), and publishes \`dispute-status-changed\` events. A deadline check flags disputes close to the scheme window that have no evidence attached.

**Fan-out.** The topic feeds the notification System API (push, SMS or email by customer preference), the reporting warehouse and a case updater. Each consumer has its own subscription queue and DLQ.

**Risks.** Polling lag (30 minutes is acceptable for disputes; shorten during the pilot if needed), processor API limits during month-end (back off on 429), duplicate events after a poll retry (consumers deduplicate on dispute ID plus status), and card data creeping into logs (log only references).
`,
  followUps: [
    { q: 'The processor has no webhooks. How do you avoid missing a status change?', a: 'Poll by a last-modified watermark saved after each successful page. If the job fails, the next run starts from the saved watermark, and consumers deduplicate repeated events.' },
    { q: 'Why publish status changes instead of calling the notification API from the poll job?', a: 'Several consumers need the same change. A topic lets notifications, reporting and case updates scale and fail independently.' },
    { q: 'How do you make sure provisional credit is not posted twice?', a: 'Send the dispute ID as an idempotency key to the ledger System API. A repeat returns the earlier posting instead of creating another entry.' },
    { q: 'What do you store about the card?', a: 'Only the processor card reference and the transaction ID. The full card number stays at the processor, which keeps the bank systems out of PCI scope for this flow.' },
  ],
}
