import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-067',
  category: 'case-studies',
  title: 'Truck Manufacturer Taking Warranty Claims From 1,200 Dealers',
  level: 'INTERMEDIATE',
  tags: ['automotive', 'manufacturing', 'partners', 'api-management', 'async', 'legacy', 'sap', 'documents'],
  estMinutes: 45,
  diagram: {
    task: 'draw the warranty claims design: dealer systems and the dealer portal entering through the gateway, a claims Experience API and Process API that store attachments in S3 and queue the claim, a loader that writes to the IBM i warranty system through a System API, and claim decisions published as an event for dealer credits in SAP and dealer notifications.',
    checks: [
      { label: 'Dealer systems and the dealer portal both enter through the API gateway', rule: { type: 'each', of: ['partner', 'web-app'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'The gateway forwards to the claims Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api', kind: 'sync' } },
      { label: 'Photos and diagnostic files are stored in object storage', rule: { type: 'edge', from: 'process-api', to: ['s3-bucket', 'file-store', 'azure-blob'] } },
      { label: 'An accepted claim is put on a queue', rule: { type: 'edge', from: 'process-api', to: 'queue', kind: 'async' } },
      { label: 'The dealer call never waits on the IBM i warranty system', rule: { type: 'no-path', from: 'experience-api', to: 'legacy', kind: 'sync' } },
      { label: 'The IBM i warranty system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Claim decisions are published once and used by at least two Process APIs', rule: { type: 'each', of: 'topic', edgeTo: 'process-api', kind: 'async', count: 2 } },
      { label: 'Approved claims become dealer credits in SAP', rule: { type: 'path', from: 'topic', to: 'erp', via: 'process-api' } },
      { label: 'Claims that cannot be loaded go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
    ],
    reference: diagram(
      {
        dms: ['partner', 'Dealer DMS systems'],
        portal: ['web-app', 'Dealer portal'],
        gw: ['api-gateway', 'API Manager (client ID per dealer group)'],
        exp: ['experience-api', 'exp-dealer-claims-api'],
        pc: ['process-api', 'prc-warranty-claims'],
        s3: ['s3-bucket', 'Claim attachments bucket'],
        q: ['queue', 'warranty-claims'],
        dlq: ['dlq', 'warranty-claims DLQ'],
        pl: ['process-api', 'prc-claim-loader'],
        swar: ['system-api', 'sys-warranty-api'],
        ibmi: ['legacy', 'Warranty system (IBM i)'],
        poll: ['batch-job', 'Claim decision poller (every 15 min)'],
        dec: ['topic', 'claim-decided'],
        pcr: ['process-api', 'prc-dealer-credits'],
        pn: ['process-api', 'prc-dealer-notifications'],
        ssap: ['system-api', 'sys-sap-billing-api'],
        sap: ['erp', 'SAP S/4HANA'],
        mail: ['notification', 'Dealer email and portal alerts'],
      },
      [
        'dms -> gw', 'portal -> gw', 'gw -> exp', 'exp -> pc', 'pc -> s3', 'pc ~> q', 'q ~> pl', 'q ~> dlq', 'pl -> swar', 'swar -> ibmi',
        'poll -> swar', 'poll ~> dec', 'dec ~> pcr', 'dec ~> pn', 'pcr -> ssap', 'ssap -> sap', 'pn -> mail',
      ],
    ),
  },
  description: `
**Context.** A heavy truck manufacturer sells through 1,200 independent dealers in 40 countries. Dealers repair trucks under warranty and claim labour and parts back from the manufacturer.

**Volumes.** About 3,500 claims a day, with peaks of 900 an hour on Monday mornings. Each claim has 2 to 10 photos (5 to 20 MB in total) and often a diagnostic log file from the truck.

**Systems**
| System | Notes |
|---|---|
| Warranty system | RPG application on IBM i, 25 years old. Decides claims (rules plus a team of 40 reviewers). Accepts claims through a DB2 staging table and a stored procedure; about 5 claims per second at most. No attachment storage. |
| SAP S/4HANA | Pays dealers by credit note against their parts account |
| Dealer portal | Salesforce Experience Cloud, used by small dealers |
| Dealer DMS | Larger dealer groups use 6 different Dealer Management Systems and want a system-to-system API |

**Today.** Dealers email photos to a shared mailbox, and reviewers match them to claims by hand. Claims wait 11 days on average, and 18% are rejected for "missing evidence" that was sent.

**Goals**
- One claims API for the portal and dealer systems, with attachments sent with the claim.
- Dealers get a claim number at once and a notification when the claim is decided.
- Approved claims are credited within 2 days.

**Constraints**
- The IBM i system will be replaced in about 4 years; the dealer API must not change when it is.
- Each dealer group must only see its own claims.

**Your task.** Design the warranty claims integration.
`,
  answerTemplate: `## Dealer API and security

## Accepting a claim and its attachments

## Loading claims into the IBM i system

## Decisions, credits and notifications

## Preparing for the IBM i replacement
`,
  keyPoints: [
    'Dealer systems and the portal call one claims Experience API behind API Manager, with a client ID per dealer group and the dealer ID taken from the credentials.',
    'The claims Process API stores attachments in S3 and answers with a claim number and 202, then queues the claim.',
    'A loader Process API feeds the IBM i system through a System API at no more than 5 claims per second; failures go to a DLQ.',
    'Decisions are polled from the IBM i system and published as an event; one consumer credits the dealer in SAP, another notifies the dealer.',
    'The System API hides the IBM i system, so its replacement changes one System API and not the dealer contract.',
  ],
  solution: `
**Dealer API.** \`exp-dealer-claims-api\` behind API Manager:
- \`POST /claims\` with claim data and pre-signed upload links for attachments
- \`GET /claims/{id}\`
- client ID enforcement and a rate limit per dealer group

The dealer ID comes from the client application, never from the request body, so one dealer cannot claim for another.

**Accepting a claim.** \`prc-warranty-claims\` validates the VIN, the repair code and the parts, stores the attachments in the S3 bucket (one folder per claim, encrypted) and returns \`202 Accepted\` with a claim number. It then publishes the claim to \`warranty-claims\`. The Monday peak of 900 an hour is absorbed by the queue.

**Loading.** \`prc-claim-loader\` reads the queue and calls \`sys-warranty-api\`, which inserts the claim into the DB2 staging table and calls the stored procedure. One consumer with a 5 per second limit protects the IBM i. The claim carries a link to its attachments, which reviewers open from a viewer. After 5 failed attempts the claim goes to the DLQ for the warranty support team.

**Decisions.** A poller reads decided claims every 15 minutes through \`sys-warranty-api\` and publishes \`claim-decided\`.
- \`prc-dealer-credits\` posts the credit note through \`sys-sap-billing-api\` for approved amounts.
- \`prc-dealer-notifications\` emails the dealer and updates the portal.

**Replacement.** When the IBM i system is replaced, only \`sys-warranty-api\` and the poller change. The dealer API stays the same.
`,
  followUps: [
    { q: 'Why not send attachments to the IBM i system with the claim?', a: 'It has no attachment storage and large files would slow it down. Storing them in S3 and passing a link keeps the claim small.' },
    { q: 'How do you make sure one dealer cannot see another dealer claims?', a: 'The dealer ID comes from the client credentials, and every query is filtered by it. The request body cannot override it.' },
    { q: 'Why poll for decisions instead of having the IBM i system call out?', a: 'The RPG application is not built to make HTTP calls. A poller on a staging table is low risk and 15 minutes is well inside the 2 day goal.' },
    { q: 'What happens to a claim that the IBM i system rejects as malformed?', a: 'After a few retries the loader moves it to the dead-letter queue. The support team fixes it and replays it, and the dealer sees the status in the meantime.' },
  ],
}
