import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-093',
  category: 'case-studies',
  title: 'School District Syncing Class Rosters From Its SIS to the LMS',
  level: 'BEGINNER',
  tags: ['education', 'system-api', 'process-api', 'scheduler', 'batch', 'idempotency', 'pii'],
  estMinutes: 30,
  diagram: {
    task: 'draw the roster sync: a scheduled job starts a Process API that reads changed enrolments from the SIS and writes classes and members into the LMS, each through its own System API, keeps a last-run watermark, and reports rejected records to the IT help desk.',
    checks: [
      { label: 'A scheduled job starts the roster sync Process API', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'The job does not call the System APIs or the systems itself', rule: { type: 'no-edge', from: 'batch-job', to: ['system-api', 'sql-server', 'database', 'legacy', 'saas'] } },
      { label: 'The Process API calls a System API for the SIS and another for the LMS', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The SIS database is reached only through a System API', rule: { type: 'only-via', target: ['sql-server', 'database', 'legacy'], from: 'system-api' } },
      { label: 'The LMS is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'A watermark in Object Store lets each run read only the changes since the last run', rule: { type: 'link', from: 'process-api', to: 'cache' } },
      { label: 'Rejected records are reported to the IT help desk', rule: { type: 'path', from: 'process-api', to: 'notification' } },
      { label: 'Calls from the Process API to the System APIs are synchronous', rule: { type: 'lines', from: 'process-api', to: 'system-api', kind: 'sync' } },
      { label: 'Data flows one way: nothing from the LMS writes back into the SIS', rule: { type: 'no-path', from: 'saas', to: ['sql-server', 'database', 'legacy'] } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'roster-sync scheduler (every 15 min)'],
        prc: ['process-api', 'prc-roster-sync'],
        ssis: ['system-api', 'sys-sis-api'],
        slms: ['system-api', 'sys-lms-api'],
        sis: ['sql-server', 'Student information system (SQL Server)'],
        lms: ['saas', 'LMS (OneRoster REST API)'],
        os: ['cache', 'Last-run watermark (Object Store)'],
        help: ['notification', 'IT help desk email'],
      },
      ['job -> prc', 'prc -> ssis', 'ssis -> sis', 'prc -> slms', 'slms -> lms', 'prc -> os', 'prc -> help'],
    ),
  },
  description: `
**Context.** A school district runs 62 schools with 45,000 students and 3,600 teachers. Students and timetables live in an on-premises student information system (SIS) on SQL Server. Teaching happens in a cloud LMS that accepts classes, users and enrolments through a OneRoster style REST API.

**The problem today.** An administrator exports CSV files from the SIS every night and uploads them to the LMS by hand. In the first two weeks of term, students change classes hundreds of times a day. Teachers find students missing from their LMS course, and students who left a class can still see its work.

**Goals**
- A class change in the SIS appears in the LMS within 30 minutes.
- No manual uploads.
- Problems with single records are visible to IT, without stopping the whole sync.

**Constraints**
| Item | Detail |
|---|---|
| Volume | 45,000 students, 2,900 classes, about 180,000 enrolments; up to 6,000 changes a day at term start |
| SIS | SQL Server database with a \`last_modified\` column on enrolment tables; no events or webhooks |
| LMS | REST API, 100 requests per 10 seconds per API key |
| Privacy | Student records are protected by law; only name, school email, grade and class membership go to the LMS |
| Team | Two integration developers, new to MuleSoft |

**Your task.** Design the first version of the roster sync. Show the layers, how a run knows what changed, and how errors are reported.
`,
  answerTemplate: `## Trigger and frequency

## Layers and APIs

## Reading only what changed

## Writing to the LMS within its limits

## Errors and reporting

## Privacy
`,
  keyPoints: [
    'A scheduler starts a Process API every 15 minutes; the Process API holds the sync logic, and the job holds none.',
    'Separate System APIs wrap the SIS database and the LMS, so other projects (for example attendance or grades) can reuse them later.',
    'A watermark (last successful run time) kept in Object Store means each run reads only enrolments changed since then, with a nightly full comparison as a safety net.',
    'Writes to the LMS are upserts keyed on the SIS ids, so a rerun after a failure does not create duplicates.',
    'Bad records are logged and reported to IT while the rest of the run continues; the watermark moves only after a run completes.',
    'Only the fields the LMS needs are sent: name, school email, grade and class membership.',
  ],
  solution: `
**Trigger.** A Mule scheduler (every 15 minutes, and a full run at 02:00) calls \`prc-roster-sync\`. Using a fixed frequency scheduler with no overlap is enough here: the SIS offers no events.

**Reading changes.** \`prc-roster-sync\` reads the watermark from Object Store and asks \`sys-sis-api\` for students, classes and enrolments with \`last_modified\` after it. The System API owns the SQL and returns a clean JSON model, so the Process API never knows table names.

**Writing.** The Process API maps the records to the OneRoster model and calls \`sys-lms-api\`. The System API owns the API key and keeps to the rate limit (about 8 requests a second, with backoff on HTTP 429). Each write is an upsert keyed on the SIS \`sourcedId\`, so a rerun is safe. Enrolments removed in the SIS are marked inactive in the LMS.

**Errors.** A record that fails validation (no school email, unknown class) is skipped and collected. At the end of the run the Process API emails the IT help desk a summary with record ids, never full student records. The watermark is saved only after the run finishes, so a crash means the next run reads the same changes again.

**Nightly full run.** Compares all active enrolments in both systems and fixes drift, for example after someone edits a class in the LMS by hand.

**Privacy.** Only the agreed fields leave the SIS. Logs carry ids, not names. Both System APIs are protected with client ID enforcement in API Manager.

**Later.** Grades flowing back from the LMS can reuse \`sys-lms-api\` and \`sys-sis-api\` with a new Process API, without changing this one.
`,
  followUps: [
    { q: 'Why keep a watermark instead of sending everything every 15 minutes?', a: 'A full sync of 180,000 enrolments every 15 minutes would hit the LMS rate limit and take too long. The watermark limits each run to the few hundred records that changed.' },
    { q: 'What happens if the run fails halfway through?', a: 'The watermark only moves after a complete run, so the next run reads the same changes again. Upserts keyed on SIS ids make the repeated writes harmless.' },
    { q: 'Why not let the scheduler flow call the LMS directly?', a: 'The mapping and error logic would sit in a trigger that no one else can reuse. A Process API and two System APIs let a later grades or attendance project reuse the same connections.' },
    { q: 'How do you protect student privacy in this design?', a: 'Send only name, school email, grade and class membership to the LMS. Keep ids rather than names in logs and error reports, and secure both System APIs with client credentials.' },
  ],
}
