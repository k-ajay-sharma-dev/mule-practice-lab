import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-007',
  category: 'case-studies',
  title: 'University Syncing Student Records Across Campus Systems',
  level: 'BEGINNER',
  tags: ['education', 'system-api', 'scheduler', 'batch', 'reuse'],
  estMinutes: 25,
  diagram: {
    task: 'draw the enrolment sync: the Student System API over the SIS, the scheduled change poller with its watermark, one delivery path per target system, and how failures become visible.',
    checks: [
      { label: 'The SIS is reached only through a Student System API', rule: { type: 'only-via', target: { type: ['saas', 'legacy', 'database', 'erp'], label: ['sis', 'student info'] }, from: 'system-api' } },
      { label: 'A scheduled poller reads changes through the System API', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'system-api' } },
      { label: 'The poller keeps its last-modified watermark in a persistent store (Object Store)', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['cache', 'database'] } },
      { label: 'Changes are published to one queue per target (LMS, library, ID card)', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['queue', 'topic'], kind: 'async', min: 3 } },
      { label: 'Every queue has its own consumer', rule: { type: 'each', of: 'queue', edgeTo: ['process-api', 'batch-job'] } },
      { label: 'Changes reach the LMS through a queue', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'legacy', 'database', 'external-api'], label: ['lms', 'learning'] }, via: ['queue', 'topic'] } },
      { label: 'Records that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Failures raise an alert the same day', rule: { type: 'edge', to: ['monitoring', 'notification'] } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'enrolment-sync poller (every 5–10 min)'],
        wm: ['cache', 'Watermark (Object Store)'],
        ssis: ['system-api', 'students-sapi'],
        sis: ['saas', 'SIS (REST API + DB view)'],
        qlms: ['queue', 'enrolments-lms'],
        qlib: ['queue', 'enrolments-library'],
        qid: ['queue', 'enrolments-idcard'],
        clms: ['process-api', 'lms-consumer (upsert by student ID)'],
        clib: ['process-api', 'library-consumer'],
        cid: ['process-api', 'idcard-consumer'],
        lms: ['saas', 'LMS'],
        lib: ['saas', 'Library system'],
        idc: ['saas', 'ID-card system'],
        dlq: ['dlq', 'enrolments-dlq'],
        mon: ['monitoring', 'Alerts (DLQ not empty, poller stopped)'],
      },
      [
        'job -> wm', 'job -> ssis', 'ssis -> sis',
        'job ~> qlms', 'job ~> qlib', 'job ~> qid',
        'qlms ~> clms', 'qlib ~> clib', 'qid ~> cid',
        'clms -> lms', 'clib -> lib', 'cid -> idc',
        'qlms ~> dlq', 'qlib ~> dlq', 'qid ~> dlq', 'dlq ~> mon',
      ],
    ),
  },
  description: `
**Context.** A university runs a Student Information System (SIS) as the source of truth for enrolments. The learning management system (LMS), the library system and the campus ID-card system each get a nightly CSV export from the SIS, built by different teams with different scripts.

**The problem today**
- Students who enrol late wait up to 24 hours for LMS and library access.
- The scripts fail silently about once a week.

**Goals**
- New and changed enrolments reach the LMS, library and ID-card systems within 15 minutes.
- One way of reading student data instead of three scripts.
- Failures are visible to the IT team the same day.

**Constraints**
- The SIS has a read-only database view and a basic REST API; no events.
- Small team (2 developers new to MuleSoft), CloudHub already licensed.
- Peak load at the start of term: ~20,000 changes in a week.

**Your task.** Propose a simple MuleSoft design:
- which APIs/apps you build
- how changes are detected and delivered
- how you handle errors
`,
  answerTemplate: `## APIs and applications

## Detecting changes in the SIS

## Delivering to LMS, library and ID-card systems

## Error handling and monitoring

## Risks
`,
  keyPoints: [
    'A Student System API (e.g. students-sapi) wraps the SIS and is the single, reusable way to read student and enrolment data.',
    'Changes are detected with a scheduler polling on a last-modified timestamp (watermark) stored in Object Store, not by re-reading everything.',
    'Each target system gets its own delivery path so one slow or failing target does not block the others (e.g. one queue or one flow per target).',
    'Upserts are idempotent (keyed on student ID) so a re-run or retry does not create duplicates.',
    'Failed records go to a retry/dead-letter path and trigger an alert; nightly CSV jobs are kept in parallel until the new flow is proven.',
  ],
  solution: `
**APIs.**
- \`students-sapi\`: \`GET /students?modifiedSince=...\`, \`GET /students/{id}/enrolments\` over the SIS REST API (DB view as a fallback for bulk reads).
- \`enrolment-sync\` process app: polls for changes and fans out to targets.
- Small System APIs or connectors for the LMS, library and ID-card systems (start with direct connector calls inside the process app if the team is small; extract them into System APIs once a second consumer appears).

**Change detection.** A Scheduler runs every 5–10 minutes. It reads the last watermark from Object Store, calls \`students-sapi\` for records modified since then, and stores the new watermark only after the batch is handed off. Overlap the window by a minute to avoid missing records written during the poll.

**Delivery.** Publish each change to one Anypoint MQ queue per target (or use a scatter-gather with independent error handling for a very small first version). Each consumer upserts by student ID — so replays are safe. At term start, process in pages and use a Batch Job or \`foreach\` with sensible block size to stay within target API limits.

**Errors and monitoring.** \`until-successful\` or MQ redelivery for transient errors; after N attempts move to a dead-letter queue. Alert (Anypoint Monitoring alert or email from an error flow) when the DLQ is non-empty or the poller has not run. Log student ID and correlation ID, not personal data.

**Rollout.** Run alongside the CSV jobs for a few weeks, compare counts daily, then switch off the scripts one target at a time.

**Risks.** SIS API rate limits at term start (page and throttle), timestamp gaps (overlap window), team inexperience (use templates and code reviews).
`,
  followUps: [
    { q: 'Why not just have the LMS call the SIS directly?', a: 'Then every consumer re-implements SIS access and auth, and an SIS change breaks all of them. A System API isolates that change and is reused by the library, ID-card and future consumers.' },
    { q: 'How would you prove the new sync works before turning off the CSV jobs?', a: 'Run both in parallel and reconcile daily: counts of active enrolments per target and a sample diff of records. Switch off one script only after a clean week.' },
    { q: 'What if the SIS later offers events or webhooks?', a: 'Replace the poller with an event listener that publishes to the same queues; the downstream consumers do not change. That is the benefit of decoupling detection from delivery.' },
  ],
}
