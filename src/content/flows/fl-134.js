import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const entry = (employeeId, workDate, hours, projectCode) => ({ employeeId, workDate, hours, projectCode })
const upload = (entries) => ({ http: { method: 'POST', path: '/timesheets', body: { teamLead: 'r.adeyemi', weekStart: '2026-11-16', entries } } })
const clean = [entry('E-201', '2026-11-16', 7.5, 'PRJ-OAK'), entry('E-201', '2026-11-17', 8, 'PRJ-OAK'), entry('E-305', '2026-11-16', 6, 'PRJ-ELM')]

export default {
  id: 'fl-134',
  category: 'flows',
  title: 'Timesheet Upload: Report Every Bad Row at Once, Then Save All the Rows in One Transaction or None of Them',
  level: 'ADVANCED',
  tags: ['myproject', 'validation', 'database', 'transaction', 'try', 'foreach', 'http-status', 'hr'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The API is a POST on /timesheets', rule: { type: 'source', component: 'http-listener', where: { path: '/timesheets', allowedMethods: 'POST' } } },
    {
      label: 'Every row is checked first, and the bad rows answer 400 from a Choice route',
      rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '400' } },
    },
    {
      label: 'Rows are saved only in the otherwise branch, once no row is bad',
      rule: { type: 'inside', component: ['db-insert', 'db-bulk-insert'], within: 'choice', inSlot: 'otherwise', where: { sql: 'timesheet_entries' } },
    },
    {
      label: 'The inserts run inside a Try that begins a transaction',
      rule: { type: 'inside', component: ['db-insert', 'db-bulk-insert'], within: 'try', withinWhere: { transactionalAction: { oneOf: ['ALWAYS_BEGIN', 'BEGIN_OR_JOIN'] } } },
    },
    {
      label: 'A saved upload answers 201',
      rule: { type: 'inside', component: 'set-variable', within: 'choice', inSlot: 'otherwise', where: { variableName: 'httpStatus', value: '201' } },
    },
    {
      label: 'A row that is already in the table answers 409 from a handler for DB:QUERY_EXECUTION',
      rule: { type: 'inside', component: 'set-variable', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: 'QUERY_EXECUTION' }, where: { variableName: 'httpStatus', value: '409' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          timesheet_entries: {
            key: ['employee_id', 'work_date', 'project_code'],
            rows: [{ employee_id: 'E-305', work_date: '2026-11-17', hours: 7, project_code: 'PRJ-ELM' }],
          },
        },
      },
    },
    tests: [
      {
        name: 'A clean week',
        about: 'Three good rows. All three are saved and the answer is 201 with the number saved.',
        trigger: upload(clean),
        expect: { status: 201, bodyHas: { saved: 3 }, db: { timesheet_entries: { count: 4, has: [{ employee_id: 'E-201', work_date: '2026-11-17', hours: 8 }] } } },
      },
      {
        name: 'Two bad rows',
        about: 'Row 2 has 30 hours and row 4 has no project code. The answer is 400 and names both rows at once. Nothing is saved, not even the good rows.',
        trigger: upload([clean[0], entry('E-201', '2026-11-17', 30, 'PRJ-OAK'), clean[2], entry('E-412', '2026-11-16', 4, '')]),
        expect: { status: 400, bodyHas: { code: 'INVALID_ROWS', rows: [{ row: 2 }, { row: 4 }] }, db: { timesheet_entries: { count: 1 } } },
      },
      {
        name: 'Row three is already in the table',
        about: 'Rows 1 and 2 are new, row 3 was sent last week. The database refuses row 3. Rows 1 and 2 are rolled back, so the table is as it was, and the answer is 409.',
        trigger: upload([clean[0], clean[1], entry('E-305', '2026-11-17', 7, 'PRJ-ELM')]),
        expect: { status: 409, bodyHas: { code: 'ALREADY_SUBMITTED' }, db: { timesheet_entries: { count: 1, lacks: [{ employee_id: 'E-201' }] } } },
      },
      {
        name: 'The same upload sent twice',
        about: 'The team lead presses Upload twice. The first saves three rows. The second gets 409 and saves nothing more.',
        triggers: [upload(clean), { ...upload(clean), afterMs: 2000 }],
        expect: { status: 409, db: { timesheet_entries: { count: 4 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'upload-timesheets',
      source('http-listener', { path: '/timesheets', allowedMethods: 'POST' }),
      [
        step('set-variable', {
          variableName: 'badRows',
          value:
            '#[(payload.entries map (e, i) -> { row: i + 1, reason: if (e.hours == null or e.hours <= 0 or e.hours > 24) "hours must be more than 0 and at most 24" else if (isBlank(e.projectCode)) "projectCode is missing" else "" }) filter ($.reason != "")]',
        }),
        router('choice', {}, [
          route({ expression: '#[!isEmpty(vars.badRows)]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '400' }),
            step('set-payload', { value: '#[output application/json --- { code: "INVALID_ROWS", rows: vars.badRows }]' }),
          ]),
        ], {
          otherwise: [
            scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
              scope('foreach', { collection: '#[payload.entries]' }, [
                step('db-insert', {
                  database: 'PostgreSQL',
                  sql: 'INSERT INTO timesheet_entries (employee_id, work_date, hours, project_code) VALUES (:employeeId, :workDate, :hours, :projectCode)',
                  inputParameters: '#[payload]',
                }),
              ]),
            ]),
            step('set-variable', { variableName: 'httpStatus', value: '201' }),
            step('set-payload', { value: '#[output application/json --- { saved: sizeOf(payload.entries), weekStart: payload.weekStart }]' }),
          ],
        }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "duplicate key"]' }, [
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('set-payload', { value: '#[output application/json --- { code: "ALREADY_SUBMITTED", message: "One of these days is already in a timesheet. Nothing was saved." }]' }),
        ]),
      ],
    ),
  ),
  description: `
A building contractor's team leads upload a week of timesheets from a tablet. The tablet calls:

\`POST /timesheets\` with \`{ "teamLead": "r.adeyemi", "weekStart": "2026-11-16", "entries": [ { "employeeId": "E-201", "workDate": "2026-11-16", "hours": 7.5, "projectCode": "PRJ-OAK" }, ... ] }\`

Entries go into the PostgreSQL table \`timesheet_entries\`. Its primary key is **(employee_id, work_date, project_code)**, so the same person, day and project cannot be saved twice.

Payroll has two complaints about the old API:
- It stopped at the first bad row. A team lead fixed row 2, uploaded again, and was told about row 9. Then row 14.
- It saved rows one by one. When row 12 failed, rows 1 to 11 were already saved. The team lead uploaded the whole week again, and rows 1 to 11 were refused as duplicates.

**Requirements**
- A row is bad if its hours are missing, 0 or less, or more than 24, or if it has no project code.
- If any row is bad, answer **400** with \`{ "code": "INVALID_ROWS", "rows": [ { "row": 2, "reason": "..." }, ... ] }\` listing **every** bad row, counted from 1. Save nothing.
- If every row is good, save them all and answer **201** with \`{ "saved": 3, ... }\`.
- If the database refuses any row as a duplicate, save **none** of the upload and answer **409** with \`{ "code": "ALREADY_SUBMITTED" }\`.

When PostgreSQL refuses a row because of the primary key, the Database Insert raises **DB:QUERY_EXECUTION** with a description that contains \`duplicate key value violates unique constraint\`.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, also when an error handler built the answer.

**Design the flow.**
`,
  answerTemplate: `## The endpoint

## Finding every bad row

## Saving all or nothing

## The duplicate case

## What the team lead sees
`,
  keyPoints: [
    'Check every row before saving any. One DataWeave expression with map and filter gives the full list of bad rows.',
    'Give the row number from the index in map, plus one, so it matches what the team lead sees.',
    'Put the inserts in a Try with the transactional action ALWAYS_BEGIN. The inserts then share one database transaction.',
    'When an error leaves that Try, the transaction is rolled back, so the rows already inserted are undone.',
    'Map the duplicate error to 409 in the flow\'s error handler. The rollback has already happened by then.',
    'A check in the flow cannot replace the primary key. The key is what catches a row sent last week or by a second upload.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /timesheets\`.
2. **Set Variable** \`badRows\`:
   \`\`\`dataweave
   (payload.entries map (e, i) -> {
     row: i + 1,
     reason: if (e.hours == null or e.hours <= 0 or e.hours > 24) "hours must be more than 0 and at most 24"
             else if (isBlank(e.projectCode)) "projectCode is missing"
             else ""
   }) filter ($.reason != "")
   \`\`\`
3. **Choice**:
   - \`#[!isEmpty(vars.badRows)]\`: \`httpStatus\` = \`400\`, body \`{ code: "INVALID_ROWS", rows: vars.badRows }\`.
   - Otherwise:
     - **Try**, Transactional action \`ALWAYS_BEGIN\`, holding a **For Each** over \`#[payload.entries]\` with a **Database Insert**:
       \`\`\`sql
       INSERT INTO timesheet_entries (employee_id, work_date, hours, project_code)
       VALUES (:employeeId, :workDate, :hours, :projectCode)
       \`\`\`
     - \`httpStatus\` = \`201\`, body \`{ saved: sizeOf(payload.entries), weekStart: payload.weekStart }\`.
4. **On Error Propagate** for \`DB:QUERY_EXECUTION\`, When \`#[error.description contains "duplicate key"]\`: \`httpStatus\` = \`409\`, code \`ALREADY_SUBMITTED\`.

**Why the transaction.** Without it, each insert is committed on its own. Row 3 fails after rows 1 and 2 are in the table, and the next upload of the same week fails on row 1. With the Try beginning a transaction, all inserts commit together when the Try ends, or none do. The table never holds half an upload.

**Why validate first.** The database would also refuse 30 hours if it had a check constraint, but it would stop at the first one. The team lead wants the whole list in one answer.
`,
  followUps: [
    {
      q: 'Could a Bulk Insert replace the For Each?',
      a: 'Yes, and it sends the rows in fewer round trips. Keep it inside the same transactional Try, so a refused row still undoes the rest.',
    },
    {
      q: 'Why does a transactional Try need care with other connectors inside it?',
      a: 'A local transaction belongs to one resource, here the database. An HTTP call or a message sent inside the Try is not undone by a rollback.',
    },
    {
      q: 'What if payroll wants the good rows saved and only the bad ones reported?',
      a: 'That is a different contract. Save the good rows, answer 207 or 200 with a list of rejected rows, and make the client able to resend only those. Agree it with payroll first, because a half-saved week is what they complained about.',
    },
  ],
}
