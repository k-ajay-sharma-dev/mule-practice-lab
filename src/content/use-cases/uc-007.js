import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-007',
  category: 'use-cases',
  title: 'Student Enrolments from SIS to the Learning Platform',
  level: 'BEGINNER',
  tags: ['scheduler', 'csv', 'upsert', 'education'],
  estMinutes: 20,
  diagram: {
    task: 'draw the enrolment sync: the scheduled job, its watermark store, the SIS audit table it reads, the rate-limited LMS it writes to, and where errors and the summary go.',
    checks: [
      { label: 'A scheduled batch job drives the sync', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The watermark is kept in a persistent store', rule: { type: 'edge', from: 'batch-job', to: { type: ['cache', 'database'], label: ['watermark', 'object store', 'state'] } } },
      { label: 'The job reads changes from the SIS (audit table)', rule: { type: 'path', from: 'batch-job', to: { type: ['database', 'erp', 'legacy'], label: ['sis', 'student', 'audit', 'enrol', 'oracle'] } } },
      { label: 'The job writes users, sections and enrolments to the LMS', rule: { type: 'path', from: 'batch-job', to: ['saas', 'external-api'] } },
      { label: 'The LMS is called through one System API (10 req/s throttle)', rule: { type: 'only-via', target: ['saas', 'external-api'], from: 'system-api' } },
      { label: 'Failures and the morning summary are reported', rule: { type: 'edge', from: 'batch-job', to: ['notification', 'monitoring'] } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Enrolment sync (nightly, hourly in add/drop)'],
        wm: ['cache', 'Watermark (persistent Object Store)'],
        ssis: ['system-api', 'sys-sis-enrolments-api'],
        sis: ['database', 'SIS (Oracle) ENROLMENT_AUDIT'],
        slms: ['system-api', 'sys-lms-api (≤ 10 req/s)', { rateLimit: 10 }],
        lms: ['saas', 'LMS (Moodle)'],
        err: ['database', 'Error report table'],
        mail: ['notification', 'Morning summary email'],
      },
      ['job -> wm', 'job -> ssis', 'ssis -> sis', 'job -> slms', 'slms -> lms', 'job -> err', 'job -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 100 },
        { match: 'saas', latencyMs: 300, maxRps: 10 },
      ],
      tests: [
        {
          name: 'A night in add/drop',
          about: 'The job sends 6 LMS calls a second for 20 minutes. The LMS allows 10 a second, so every change is in place by the morning.',
          traffic: [{ name: 'changes', from: 'batch-job', rps: 6, forMin: 20, to: 'saas', kind: 'write' }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Too many threads in the job',
          about: 'A change to the job sends 25 LMS calls a second for 10 minutes. The System API answers what is over 10 a second with 429, so the LMS never sees more than its limit.',
          traffic: [{ name: 'changes', from: 'batch-job', rps: 25, forMin: 10, to: 'saas', kind: 'write' }],
          durationMin: 15,
          expect: { peakRps: [{ node: 'saas', max: 10 }], answers: [{ minLimited: 0.3 }] },
        },
      ],
    },
  },
  description: `
A university keeps students, courses and enrolments in its **Student Information System (SIS)** (an Oracle database). Teaching happens in a **Moodle-style LMS** that exposes a REST API.

Facts:
- ~40,000 students, ~2,500 course sections, ~180,000 enrolment rows per semester.
- During the 3-week **add/drop period**, ~5,000 enrolment changes happen per day; otherwise a few hundred.
- The LMS API can create/update users, create course sections and enrol/unenrol a user in a section. It allows **10 requests/second** per API token.
- On an add/drop night the job sends about 6 LMS calls a second. A wrong thread setting in the job could send 25 a second, so all LMS calls go through one System API with a rate limit that keeps the LMS at or under its 10 requests a second.
- Students must see a new course in the LMS **by the next morning** at the latest; drops must remove access the same way.
- The SIS has an \`ENROLMENT_AUDIT\` table recording inserts, updates and deletes with a timestamp.

**Describe your solution:**
- How do you trigger the sync and find what changed (including drops)?
- In what order do you call the LMS so enrolments never fail because a user or section is missing?
- How do you respect the rate limit?
- What happens if one student record is invalid?
`,
  answerTemplate: `## Trigger and change detection

## Processing order

## Rate limiting

## Error handling
`,
  keyPoints: [
    'Scheduler (e.g. nightly, plus more often during add/drop) reads changes from ENROLMENT_AUDIT since a watermark stored in a persistent Object Store.',
    'Deletes in the audit table become unenrol calls, so drops are handled explicitly and not left as missing rows.',
    'Dependencies first: upsert users and course sections before enrolments (or check-and-create on demand).',
    'Calls throttled to stay under 10 req/s (limited concurrency, e.g. maxConcurrency on foreach/batch, or a rate-limiting step) with retry on 429/5xx.',
    'One bad record is logged and reported without stopping the rest; the watermark advances only after the run completes.',
  ],
  solution: `
**Trigger and change detection.** A Scheduler runs nightly at 01:00 (and hourly during the add/drop weeks, with a cron expression or a property switch). It reads the last watermark from a **persistent Object Store** and queries \`ENROLMENT_AUDIT WHERE changed_at > :watermark ORDER BY changed_at\`. Each row has an operation (I/U/D): inserts and updates become *enrol*, deletes become *unenrol*. Because the audit table records deletes, dropped courses are not silently missed (a pure \`last_modified\` query cannot see deleted rows).

**Processing order.** Enrolment needs both a user and a section in the LMS:
1. Upsert changed **students** (match on student number as the LMS external ID).
2. Upsert changed **course sections** (match on section code).
3. Apply **enrolments / unenrolments**.

If an enrolment references a user not yet in the LMS (e.g. a student created minutes ago), the flow creates the user on demand and retries the enrolment once.

**Rate limiting.** 10 req/s ≈ 36k calls/hour, enough for 5,000 daily changes. Use a For Each or Batch Job with **limited concurrency** (e.g. Batch Step with \`maxConcurrency\` of 4 and a small aggregator), and an Until Successful / retry with backoff on **429** and 5xx. Where the LMS offers bulk enrol endpoints, prefer them. As a safety net, all calls go through **sys-lms-api** with a **Rate Limiting policy of 10 requests a second**, so a wrong thread setting gets 429s back instead of overloading the LMS.

**Error handling.** Validation errors (missing email, unknown section) are business errors: log with the student number, write to an error table/report, and continue. One bad student must not block 4,999 others. The watermark is updated **only after the run completes**, so a crash mid-run means the next run reprocesses from the old watermark. That is safe because user/section upserts and enrolments are idempotent (enrolling an already-enrolled student is a no-op). A summary email (processed / failed counts) goes to the registry team each morning.
`,
  followUps: [
    { q: 'How would you do the very first full load at the start of term?', a: 'Run a one-off full sync (all active enrolments for the semester) through the same flow with the watermark set to the start of time, in off-hours, then switch to incremental. Compare counts in SIS and LMS afterwards.' },
    { q: 'What if the job did not run for two days?', a: 'Nothing is lost: the watermark has not moved, so the next run picks up all changes since then. Order by changed_at so a later drop overrides an earlier add for the same student and section.' },
    { q: 'How do you test it?', a: 'MUnit tests with mocked DB and LMS calls for insert/update/delete and the 429 retry path, plus an integration test against an LMS sandbox with a small set of real-looking students.' },
  ],
}
