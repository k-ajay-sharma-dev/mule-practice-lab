import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-097',
  category: 'case-studies',
  title: 'Tax Authority Accepting E-Filed Returns From Software Vendors at the Deadline',
  level: 'INTERMEDIATE',
  tags: ['public-sector', 'government', 'peak-traffic', 'async', 'anypoint-mq', 'api-management', 'rate-limiting', 'legacy'],
  estMinutes: 45,
  diagram: {
    task: 'draw e-filing: vendor software calls the filing Experience API through the gateway; the API stores the return, queues it and answers at once; a Process API drains the queue into the mainframe through a System API at the pace it can take and writes each result to a status store; vendors poll the status store through the same Experience API; failing returns go to a dead-letter queue.',
    checks: [
      { label: 'Vendors reach the filing API only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The original return is stored before processing', rule: { type: 'edge', from: 'experience-api', to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'The Experience API queues the return as an async message', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'No synchronous route from vendors to the mainframe', rule: { type: 'no-path', from: 'partner', to: 'legacy', kind: 'sync' } },
      { label: 'A Process API drains the queue into the mainframe', rule: { type: 'path', from: 'queue', via: 'process-api', to: 'legacy' } },
      { label: 'The mainframe is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Processing results are written to a status store', rule: { type: 'path', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'Vendors read filing status from the status store, not the mainframe', rule: { type: 'edge', from: 'experience-api', to: ['database', 'cache'] } },
      { label: 'Returns that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        sw: ['partner', 'Tax software vendors (40)'],
        gw: ['api-gateway', 'API gateway (client ID, mTLS, rate limit per vendor)'],
        exp: ['experience-api', 'exp-efile-api'],
        store: ['file-store', 'Submitted returns (encrypted)'],
        q: ['queue', 'returns-in'],
        dlq: ['dlq', 'returns-in-dlq'],
        prc: ['process-api', 'prc-return-processing'],
        stax: ['system-api', 'sys-tax-mainframe-api'],
        mf: ['legacy', 'Tax processing mainframe (CICS)'],
        sdb: ['database', 'Submission status'],
      },
      ['sw -> gw', 'gw -> exp', 'exp -> store', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> stax', 'stax -> mf', 'prc -> sdb', 'exp -> sdb'],
    ),
  },
  description: `
**Context.** A national tax authority receives 11 million individual returns a year. About 85% are filed through commercial tax software from 40 accredited vendors. The software sends each return (an XML document of 50 KB to 2 MB) to the authority's e-filing service and then shows the citizen whether it was accepted.

**The problem today.** The e-filing service is a SOAP gateway that calls the mainframe synchronously for every return. On the last filing day traffic rises to 400 returns a second against a mainframe that handles 60. Last year the gateway timed out for six hours, vendors retried aggressively, and the authority had to extend the deadline by two days, which made the national news.

**Goals**
- Accept every well-formed return on the deadline day within 2 seconds, even at 500 a second.
- Give each return a submission id and a status the vendor can check (received, accepted, rejected with reasons).
- Process every accepted submission within 48 hours.
- Keep the mainframe within its safe rate.

**Constraints**
| Item | Detail |
|---|---|
| Mainframe | CICS transaction validates and posts a return; safe at 60 a second; offline 00:00 to 02:00 |
| Vendors | Accredited vendors use client certificates; they must not be able to see one another's submissions |
| Legal | The filing time that counts is the time the authority received the return, not when it was processed |
| Retention | Submitted returns are kept unchanged for 7 years as legal evidence |
| Peak | Deadline day is 9% of the year's volume; the last 6 hours carry half of that |

**Your task.** Design the new e-filing intake and the status flow.
`,
  answerTemplate: `## Vendor access and security

## Accepting a return

## Queueing and pacing

## Status and acknowledgements

## Errors and retries

## Peak planning
`,
  keyPoints: [
    'The Experience API validates the XML, stores the original, queues it and returns 202 with a submission id; the legal receipt time is recorded at that moment.',
    'A queue separates the 500 a second arrival rate from the 60 a second mainframe rate; a Process API drains it with a fixed number of consumers.',
    'The mainframe is reached only through a System API, and it is never on the synchronous path of a vendor call.',
    'Vendors poll a status store (or receive a callback) instead of waiting for the mainframe; status reads never touch the mainframe.',
    'Per-vendor client ID, mTLS and rate limits in API Manager stop one vendor\'s retry storm from hurting others.',
    'Failed returns go to a dead-letter queue with a reason, and are reprocessed or rejected with a clear status.',
  ],
  solution: `
**Access.** Vendors call \`exp-efile-api\` through the gateway with mTLS and client ID. A rate limit per vendor (with a burst allowance) and a spike control policy protect the API. Each vendor can only read submissions it filed, enforced by the client id stored with every submission.

**Accepting.** \`exp-efile-api\` checks the XML against the schema and size limit, writes the original to encrypted storage (write once, 7 years), records the received time, and publishes a small message (submission id, storage key, vendor) to \`returns-in\`. It answers 202 with the submission id in well under 2 seconds. Duplicate submissions from vendor retries are found by a vendor-supplied idempotency key.

**Processing.** \`prc-return-processing\` consumes \`returns-in\` with enough consumers to stay at about 55 a second. It loads the return from storage, calls \`sys-tax-mainframe-api\` and writes the result to the status store. During the 00:00 to 02:00 window the consumers stop and the queue holds the returns. At 500 a second for 6 hours the backlog is about 10 million messages at most; at 55 a second it clears well inside 48 hours.

**Status.** Vendors call \`GET /submissions/{id}\` on the same Experience API, which reads the status store only. Results with rejection reasons are kept for 90 days.

**Errors.** Mainframe timeouts are retried with backoff. A return that fails three times goes to \`returns-in-dlq\` and gets status "under review", so the citizen is not told it failed when it was received on time.

**Peak planning.** Load tests at 2x the forecast peak; Anypoint MQ or broker capacity sized for the backlog; vendors told the polling interval to use (no more than once a minute per submission).
`,
  followUps: [
    { q: 'Why is the receipt time recorded by the Experience API and not by the mainframe?', a: 'The law counts the time the authority received the return. A return that waits in the queue past midnight must still count as filed on time.' },
    { q: 'How big can the queue backlog get and is that a problem?', a: 'At 500 a second for 6 hours the backlog reaches about 10 million small messages. That is fine for a durable queue if messages carry a storage key and not the full return.' },
    { q: 'Why not let vendors wait for the mainframe result in the same call?', a: 'The call would last as long as the backlog. Timeouts would trigger vendor retries, which add load and recreate last year\'s outage.' },
    { q: 'How do you stop one vendor\'s retries from hurting others?', a: 'Apply a rate limit and spike control per client id in API Manager. Idempotency keys turn a retried return into the same submission instead of a new one.' },
  ],
}
