import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-033',
  category: 'case-studies',
  title: 'E-Learning Platform Surviving Exam Season',
  level: 'INTERMEDIATE',
  tags: ['education', 'scalability', 'async', 'autoscaling', 'load-testing'],
  estMinutes: 35,
  diagram: {
    task: 'draw the exam-season target state: gateway spike protection, pre-provisioned proctoring sessions, autosave kept off the LMS, and submissions accepted durably then written to the LMS at a controlled rate.',
    checks: [
      { label: 'The learning web app goes through a gateway that applies spike control / rate limits', rule: { type: 'path', from: 'web-app', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Proctoring sessions are pre-created by a scheduled job before the exam window', rule: { type: 'path', from: 'batch-job', to: 'external-api' } },
      { label: 'Exam start reads a pre-created session from a fast store', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: { type: ['cache', 'database'], label: ['session'] } } },
      { label: 'Autosaves go to a fast store, not the LMS', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: { type: ['cache', 'database'], label: ['autosave', 'answer'] } } },
      { label: 'Final submissions are accepted durably on a queue (202 + receipt)', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: 'queue', kind: 'async' } },
      { label: 'A throttled queue consumer writes submissions to the LMS', rule: { type: 'path', from: 'queue', to: 'saas' } },
      { label: 'The LMS is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Failed submissions go to a dead-letter queue for replay', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Learning web app'],
        gw: ['api-gateway', 'Gateway (spike control, Retry-After)'],
        eapi: ['experience-api', 'exp-exam-api'],
        prc: ['process-api', 'prc-exam-api'],
        pre: ['batch-job', 'Pre-provision proctoring sessions'],
        writer: ['process-api', 'prc-lms-writer (limited concurrency)'],
        q: ['queue', 'exam-submissions'],
        dlq: ['dlq', 'exam-submissions-dlq'],
        sproc: ['system-api', 'sys-proctoring-api'],
        slms: ['system-api', 'sys-lms-api'],
        sess: ['cache', 'Pre-created proctoring sessions'],
        auto: ['database', 'Autosave store (key-value)'],
        proc: ['external-api', 'Proctoring vendor'],
        lms: ['saas', 'LMS'],
      },
      [
        'web -> gw', 'gw -> eapi', 'eapi -> prc', 'prc -> sess', 'prc -> auto', 'prc ~> q', 'q ~> writer', 'q ~> dlq',
        'writer -> slms', 'slms -> lms', 'pre -> sproc', 'sproc -> proc', 'pre -> sess',
      ],
    ),
  },
  description: `
**Context.** An online learning company provides courses and proctored exams to universities and professional bodies. Its Mule APIs sit between the learning web app and several back ends: a learning-management system (LMS), a proctoring vendor, a payments provider, an identity provider and a results database. During the two-week exam season traffic rises 15x. Last year exam submissions timed out, students re-submitted, and some got duplicate results or none at all.

**Goals**
- No lost or duplicated exam submissions.
- Exam start must succeed for all scheduled candidates (peak 40,000 starts in a 15-minute window).
- Results published to institutions within 24 hours.

**Constraints**
- The LMS can handle ~200 writes/second; the proctoring vendor allows 100 session creations/second.
- Budget allows extra capacity only during exam season.
- The current APIs are synchronous end to end.

| Operation | Normal peak | Exam peak |
| --- | --- | --- |
| Exam start | 10/s | ~45/s (bursts to 150/s) |
| Answer autosave | 50/s | 2,000/s |
| Final submission | 2/s | 300/s (end of exam) |

**Your task.** Propose changes to make exam season reliable and cost-effective.
`,
  answerTemplate: `## Where the current design breaks

## Exam start

## Autosave and submission

## Capacity and scaling plan

## Testing and operational readiness

## Risks
`,
  keyPoints: [
    'Identify the bottlenecks (LMS writes, proctoring session creation) and design around their limits instead of only adding Mule replicas.',
    'Exam sessions are pre-provisioned before the exam window (proctoring sessions created in advance) to flatten the start-time burst.',
    'Submissions are accepted durably (persisted/queued) with an idempotency key and acknowledged quickly; downstream writes are throttled to what the LMS can take.',
    'Autosave traffic is kept off the LMS hot path (written to a fast store, only the final answer set goes to the LMS).',
    'Scale replicas up on a schedule before exam season and back down after; prove it with load tests at realistic peak shapes.',
  ],
  solution: `
**Why it broke.** Synchronous chains meant every student request waited on the LMS and proctoring vendor; when they slowed, Mule threads and client timeouts piled up, students re-submitted, and non-idempotent writes duplicated results.

**Exam start.** A scheduled job creates proctoring sessions for all registered candidates in the hours before each exam, respecting the vendor's 100/s limit. At start time \`exam-papi\` only looks up a pre-created session (cached) and returns it — fast and independent of the vendor's burst capacity.

**Autosave.** Autosave writes go to a fast key-value store (e.g. a managed cache/database sized for 2,000 writes/s) keyed by attempt ID, not to the LMS. This is the main load reduction.

**Submission.**
1. Client sends final submission with an attempt ID (idempotency key).
2. \`exam-eapi\` validates, writes it durably (database or persistent queue) and returns \`202 Accepted\` with a receipt.
3. Consumers write to the LMS at a controlled rate (queue consumers with limited concurrency) — 300/s peaks drain in minutes at 200/s.
4. Duplicate submissions with the same attempt ID return the original receipt.
5. Failures go to a DLQ with alerting and a replay process; a reconciliation report compares receipts to LMS records before results are released.

**Capacity.** Use CloudHub 2.0 replicas (or the platform's equivalent) and scale up by schedule via the CI/CD pipeline or Platform APIs a few days before exams, then scale down. Size from load test results, not guesswork. Apply rate limiting/spike control at the API gateway to protect the platform from client retry storms, with clear \`Retry-After\` responses.

**Readiness.** Load test with the real peak shape (burst at start, burst at end), chaos-test a slow LMS, agree a change freeze during exam weeks, and staff an on-call rota with dashboards for queue depth, latency, and error rates.

**Risks.** Hidden limits in the identity provider (include it in load tests), client-side retries amplifying load (exponential backoff in the web app), and data loss (durable acceptance before acknowledgement).
`,
  followUps: [
    { q: 'Why not just scale Mule to 20 replicas?', a: 'Mule is not the bottleneck; the LMS and proctoring vendor are. More replicas would only push more concurrent load onto them and fail faster. Buffering and pre-provisioning address the real limits.' },
    { q: 'How does the student know the submission was received if you return 202?', a: 'The response includes a receipt ID and timestamp shown to the student; a status endpoint confirms when it is recorded in the LMS.' },
    { q: 'What do you monitor during the exam?', a: 'Queue depth and age, LMS write latency, 4xx/5xx rates, submissions received vs recorded, and replica CPU/memory — with alerts tied to a runbook.' },
  ],
}
