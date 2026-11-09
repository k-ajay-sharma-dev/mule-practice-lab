import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-111',
  category: 'case-studies',
  title: 'Airline Loyalty Programme Taking Mileage Accruals From 180 Partners',
  level: 'INTERMEDIATE',
  tags: ['airline', 'loyalty', 'partners', 'b2b', 'anypoint-mq', 'idempotency', 'sap', 'batch'],
  estMinutes: 40,
  diagram: {
    task: 'draw partner accruals arriving by API (through the gateway) and by SFTP file, both landing on one queue, an accrual Process API that removes duplicates and posts miles to the loyalty platform, and a nightly billing job that sends partner totals to SAP.',
    checks: [
      { label: 'Partner API calls reach the Experience API only through the gateway (client ID and rate limit per partner)', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'API partners call the gateway', rule: { type: 'path', from: 'partner', via: 'api-gateway', to: 'experience-api' } },
      { label: 'The file loader reads the partner SFTP drop', rule: { type: 'link', from: 'batch-job', to: 'sftp-server' } },
      { label: 'API and file accruals land on the same queue', rule: { type: 'each', of: 'queue', edgeFrom: ['experience-api', 'batch-job'], count: 2, some: true } },
      { label: 'Accepting an accrual never waits for the loyalty platform (no synchronous chain)', rule: { type: 'no-path', from: 'partner', to: 'saas', kind: 'sync' } },
      { label: 'Duplicate partner transactions are detected before miles are posted', rule: { type: 'edge', from: { type: 'process-api', label: 'accrual' }, to: ['cache', 'database'] } },
      { label: 'The loyalty platform is reached only through its System API', rule: { type: 'only-via', target: { type: 'saas', label: 'loyalty' }, from: 'system-api' } },
      { label: 'SAP is not called once per accrual', rule: { type: 'no-path', from: { type: 'process-api', label: 'accrual' }, to: 'erp' } },
      { label: 'The nightly billing job sends partner totals to SAP through a System API', rule: { type: 'path', from: { type: 'batch-job', label: 'billing' }, via: 'system-api', to: 'erp' } },
      { label: 'Accruals that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        part: ['partner', 'Hotel, car rental and bank partners (API)'],
        sftp: ['sftp-server', 'Partner file drop (SFTP)'],
        gw: ['api-gateway', 'Client ID + rate limit per partner'],
        exp: ['experience-api', 'exp-partner-accrual-api'],
        job: ['batch-job', 'accrual-file-loader'],
        q: ['queue', 'accruals'],
        dlq: ['dlq', 'accruals DLQ'],
        prc: ['process-api', 'prc-mileage-accrual-api'],
        ids: ['cache', 'Processed partner transaction IDs'],
        sloy: ['system-api', 'sys-loyalty-platform-api'],
        loy: ['saas', 'Loyalty platform'],
        bill: ['batch-job', 'partner-billing-nightly'],
        sfin: ['system-api', 'sys-sap-finance-api'],
        sap: ['erp', 'SAP S/4HANA finance'],
      },
      [
        'part -> gw', 'gw -> exp', 'exp ~> q', 'job -> sftp', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> ids',
        'prc -> sloy', 'sloy -> loy', 'bill -> sloy', 'bill -> sfin', 'sfin -> sap',
      ],
    ),
  },
  description: `
**Context.** An airline's frequent flyer programme has 14 million members. Members earn miles with about **180 partners**: hotel chains, car rental companies, co-brand credit card banks and retailers. Partners pay the airline for every mile they award, so accruals are both a member promise and revenue.

| Partner type | Count | Channel | Volume |
|---|---|---|---|
| Large hotel and car partners | 25 | REST API, real time | Peak 40 accruals per second |
| Co-brand card banks | 6 | Monthly fixed-width file, SFTP | Up to 2 million rows per file |
| Small partners | about 150 | Weekly CSV, SFTP | 100 to 20,000 rows |

The **loyalty platform** is a SaaS product with a REST API (limit 200 calls per second). Finance runs **SAP S/4HANA** and invoices partners monthly from miles awarded.

**Problems today**
- A custom Java service takes API accruals and calls the loyalty platform inside the partner's request. When the platform is slow, partners time out and resend: 0.8% of miles are awarded twice.
- Card bank files are loaded by a DBA script into the loyalty platform's bulk import, which locks member accounts for hours.
- Finance posts one SAP document per accrual, about 3 million documents a month, which the SAP team says must stop.

**Rules**
- An accrual is valid only if the member number exists and the surname matches.
- Each accrual carries a partner transaction ID, unique per partner.
- Members must see API accruals within 15 minutes and file accruals within 48 hours of the file arriving.

**Your task.** Design partner accrual intake and partner billing.
`,
  answerTemplate: `## Intake channels (API and files)

## Processing and validation

## Duplicates

## Partner billing to SAP

## Partner onboarding and access
`,
  keyPoints: [
    'API partners call an Experience API through the gateway with client ID enforcement and a rate limit per partner; the API validates the shape and answers 202 after queuing.',
    'Files are read by a batch loader and split into one message per accrual on the same queue, so both channels share one processing path.',
    'The accrual Process API checks the member and surname, removes duplicates using partner ID plus partner transaction ID, and posts to the loyalty platform through its System API within its 200 calls per second limit.',
    'Billing is aggregated: a nightly job totals miles per partner and sends summary postings to SAP, instead of one document per accrual.',
    'Rejected accruals are reported back to the partner; repeated technical failures go to a DLQ.',
  ],
  solution: `
**Intake.**
- API: \`exp-partner-accrual-api\` behind Client ID Enforcement and an SLA tier per partner. It validates the request against the RAML type, writes the accrual to the \`accruals\` queue and returns \`202 Accepted\` with a receipt ID. Partner response time no longer depends on the loyalty platform.
- Files: \`accrual-file-loader\` picks up files from SFTP, streams them with a batch job, and writes one message per row to the same queue. A 2 million row file becomes a steady flow instead of a bulk import that locks accounts.

**Processing.** \`prc-mileage-accrual-api\` consumes the queue with a concurrency that keeps calls under 200 per second. For each accrual it checks the key \`partnerId|partnerTransactionId\` in Object Store (TTL 400 days). New ones are validated (member and surname) and posted through \`sys-loyalty-platform-api\`. Business rejections are written to a rejection report sent back to the partner. Technical failures are retried, then moved to the DLQ.

**Billing.** \`partner-billing-nightly\` reads the day's awarded miles per partner from the loyalty platform and posts one summary document per partner to SAP through \`sys-sap-finance-api\`. Monthly invoices come from these summaries. SAP volume drops from 3 million to about 5,000 documents a month.

**Onboarding.** API partners register in the Exchange portal; file partners get an SFTP folder and a file spec. Both are configuration, not new code.
`,
  followUps: [
    { q: 'Why return 202 instead of 201 to the partner?', a: 'The accrual is accepted for processing, not yet posted. The partner keeps the receipt ID and learns about rejections from the report.' },
    { q: 'Why is the duplicate key partner ID plus transaction ID?', a: 'Transaction IDs are unique only within one partner. Two partners can use the same number for different stays.' },
    { q: 'How do you protect the loyalty platform from a 2 million row file?', a: 'Each row becomes a message, and the consumer concurrency caps calls per second. The file is processed over hours within the 48 hour promise, leaving room for real-time API traffic.' },
    { q: 'What does finance lose by aggregating postings?', a: 'Line-level detail stays in the loyalty platform and the data warehouse. SAP keeps what it needs for invoicing, which is the total per partner and day.' },
  ],
}
