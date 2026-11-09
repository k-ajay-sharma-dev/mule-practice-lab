import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-094',
  category: 'case-studies',
  title: 'Health Plan Receiving X12 837 Claims From Clearinghouses',
  level: 'INTERMEDIATE',
  tags: ['healthcare', 'claims', 'edi', 'x12', 'sftp', 'async', 'idempotency', 'dlq', 'pii'],
  estMinutes: 45,
  diagram: {
    task: 'draw claims intake: clearinghouse 837 files on SFTP read by a file intake job, provider portal claims through an Experience API, both feeding one claims queue, a Process API that checks duplicates and submits to the claims engine through a System API, a dead-letter queue, and claim status events turned into 277CA files for the clearinghouses.',
    checks: [
      { label: 'Clearinghouses drop 837 files on the SFTP server', rule: { type: 'edge', from: 'partner', to: 'sftp-server' } },
      { label: 'A file intake job reads the SFTP folder', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The intake job puts each claim on a queue as an async message', rule: { type: 'edge', from: 'batch-job', to: 'queue', kind: 'async' } },
      { label: 'Portal claims and file claims share one claims queue', rule: { type: 'each', of: 'queue', edgeFrom: ['batch-job', 'experience-api'], count: 2, some: true } },
      { label: 'No synchronous route from intake to the claims engine', rule: { type: 'no-path', from: ['batch-job', 'experience-api'], to: 'legacy', kind: 'sync' } },
      { label: 'A Process API takes claims off the queue and submits them to the claims engine', rule: { type: 'path', from: 'queue', via: 'process-api', to: 'legacy' } },
      { label: 'The claims engine is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Duplicate claims are caught with a key store', rule: { type: 'link', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'Claims that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Claim status is published as an event', rule: { type: 'edge', from: 'process-api', to: 'topic', kind: 'async' } },
      { label: 'Status events become 277CA files on SFTP for the clearinghouses', rule: { type: 'path', from: 'topic', via: 'process-api', to: 'sftp-server' } },
    ],
    reference: diagram(
      {
        ch: ['partner', 'Clearinghouses (3)'],
        inb: ['sftp-server', 'Inbound SFTP (837P / 837I batches)'],
        outb: ['sftp-server', 'Outbound SFTP (999 / 277CA)'],
        intake: ['batch-job', 'claims-file-intake (validate X12, split, 999)'],
        portal: ['web-app', 'Provider portal'],
        exp: ['experience-api', 'exp-provider-claims-api'],
        q: ['queue', 'claims-in'],
        dlq: ['dlq', 'claims-in-dlq'],
        prc: ['process-api', 'prc-claim-submission'],
        keys: ['cache', 'Claim keys (Object Store)'],
        sclm: ['system-api', 'sys-claims-engine-api'],
        eng: ['legacy', 'Claims adjudication engine (mainframe)'],
        st: ['topic', 'claim-status-events'],
        ack: ['process-api', 'prc-277ca-builder'],
      },
      [
        'ch -> inb', 'intake -> inb', 'intake -> outb', 'intake ~> q', 'portal -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq',
        'prc -> keys', 'prc -> sclm', 'sclm -> eng', 'prc ~> st', 'st ~> ack', 'ack -> outb',
      ],
    ),
  },
  description: `
**Context.** A regional health plan covers 1.2 million members and receives about 9 million medical claims a year. Most arrive as X12 837P (professional) and 837I (institutional) batch files from three clearinghouses. About 8% come from small providers who key them into a provider portal. Adjudication runs on a mainframe claims engine that accepts one claim at a time through a CICS transaction.

**The problem today.** A nightly COBOL job reads the clearinghouse files and feeds the engine. When one claim in a batch is malformed, the whole file is rejected and resent the next day. Providers wait up to four days to learn whether a claim was accepted, and duplicate submissions are paid twice a few times a month.

**Goals**
- Return a 999 acknowledgement for every file within 1 hour of receipt.
- Return a 277CA (claim acknowledgement) for every claim within 24 hours.
- Reject a bad claim on its own, never the whole file.
- Stop duplicate claims before they reach adjudication.

**Constraints**
| Item | Detail |
|---|---|
| Volume | About 35,000 claims a day; Monday peaks of 120,000; files from 10 KB to 400 MB |
| Mainframe | CICS transaction, safe at about 25 claims a second; batch window 01:00 to 03:00 |
| Partners | Clearinghouses connect by SFTP only and expect 999 and 277CA files back |
| Privacy | Claims carry PHI; HIPAA rules on minimum necessary access, encryption and audit apply |
| Duplicates | A duplicate is the same provider, member, service date and billed lines |

**Your task.** Design the intake from file and portal to adjudication, and the acknowledgements back to clearinghouses.
`,
  answerTemplate: `## Channels and volumes

## File intake and 999 acknowledgements

## Queueing and pacing for the mainframe

## Duplicate detection

## Errors and the dead-letter queue

## Claim status and 277CA

## PHI protection and audit
`,
  keyPoints: [
    'Separates file receipt (validate X12 envelope, return 999, split into claims) from claim processing, so a bad claim never blocks the file.',
    'Both channels put claims on one queue, so pacing, duplicate checks and error handling exist once.',
    'The Process API drains the queue at a rate the mainframe can take (prefetch and concurrency set to stay under 25 a second), and the engine is reached only through a System API.',
    'Duplicates are found with a hash of provider, member, service date and lines stored in Object Store or a database, before the claim reaches adjudication.',
    'Claim status is published as an event and turned into 277CA files, so other consumers (portal status, analytics) can subscribe later.',
    'PHI stays encrypted in transit and at rest; logs hold claim ids only; queues use encrypted Anypoint MQ or a broker with encryption at rest.',
  ],
  solution: `
**File intake.** \`claims-file-intake\` polls the inbound SFTP folder. It streams each file, validates the ISA/GS envelope and the 837 structure with the X12 module, and writes a 999 to the outbound SFTP within minutes. It then splits the file into single claims (one per CLM loop with its subscriber and provider context) and publishes each to \`claims-in\` with the file id and claim control number. A 400 MB file is streamed and never loaded into memory.

**Portal.** \`exp-provider-claims-api\` validates the portal claim, maps it to the same canonical claim and publishes it to \`claims-in\`. The provider gets a tracking id at once (HTTP 202).

**Processing.** \`prc-claim-submission\` consumes \`claims-in\` with a fixed number of consumers so the rate stays under 25 claims a second. It computes a duplicate key (hash of provider NPI, member id, service dates and billed lines) and checks the key store. A duplicate gets status "rejected as duplicate" and never reaches the engine. Otherwise it calls \`sys-claims-engine-api\`, which owns the CICS call and maps the mainframe responses.

**Errors.** Transient mainframe errors are retried with backoff. A claim that fails three deliveries lands on \`claims-in-dlq\` and an operator is alerted. Validation failures produce a rejected status, not a dead letter.

**Status.** Every outcome (accepted, rejected, duplicate) is published to \`claim-status-events\`. \`prc-277ca-builder\` groups them per clearinghouse and writes 277CA files every hour.

**Mainframe window.** During the 01:00 to 03:00 batch window the consumers pause and the queue holds the claims.

**Privacy.** SFTP with key-based auth and PGP on files, TLS everywhere, encrypted queues, logs with ids only, and an access audit on the key store and the DLQ.
`,
  followUps: [
    { q: 'Why split the 837 file into single claims before processing?', a: 'One malformed claim then fails alone, while the rest of the file carries on. It also lets several consumers process claims in parallel at a controlled rate.' },
    { q: 'How do you keep the mainframe under 25 claims a second?', a: 'Limit the number of queue consumers and the prefetch on the Process API. The queue absorbs Monday peaks and the batch window, and claims wait instead of failing.' },
    { q: 'What is the difference between the 999 and the 277CA?', a: 'The 999 confirms that the file was syntactically valid X12. The 277CA says, claim by claim, whether the plan accepted it into adjudication or rejected it.' },
    { q: 'Where would you put a duplicate check and why there?', a: 'In the Process API before the engine call, keyed on a hash of provider, member, dates and lines. Both channels pass through it, so a claim sent by portal and file is still caught.' },
  ],
}
