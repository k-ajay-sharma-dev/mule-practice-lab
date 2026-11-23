import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const tables = {
  items: { key: 'item_id', rows: [{ item_id: 'TENT-2P-OLV', description: 'Two person tent', dept: 'CAMP' }, { item_id: 'JKT-RAIN-M', description: 'Rain jacket M', dept: 'APPAREL' }, { item_id: 'BOTTLE-1L', description: 'Steel bottle', dept: 'CAMP' }] },
  locations: { key: 'location_id', rows: [{ location_id: '0101', location_type: 'STORE', region: 'NORTH' }, { location_id: 'DC-01', location_type: 'DC', region: 'NORTH' }] },
  suppliers: { key: 'supplier_id', rows: [{ supplier_id: 'SUP-HAYDEN', supplier_name: 'Hayden Textiles', lead_days: 21 }] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'detail'], rows: [{ job_id: 7, job_name: 'MASTER_DATA_OUT', status: 'COMPLETED', detail: 'ITEMS=3 LOCATIONS=2 SUPPLIERS=1' }] },
}
const procedures = {
  // inserts the job row and returns its new key (an OUTPUT INSERTED.job_id inside the procedure)
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', detail: null })
    return { job_id: id }
  },
}

export default {
  id: 'fl-209',
  category: 'flows',
  title: 'The Nightly Master Data Bundle to the Planning Platform Over FTP: Three Files Under Temporary Names, a Control File Last, a Job Log Row, and an Email Report That Never Holds Up the Run',
  level: 'EXPERT',
  tags: ['myproject', 'ftp', 'master-data', 'control-file', 'job-log', 'async', 'email', 'planning'],
  estMinutes: 55,
  flowChecks: [
    { label: 'The run starts by creating a job log row through dbo.usp_job_start', rule: { type: 'exists', component: 'db-stored-procedure', where: { sql: 'usp_job_start' } } },
    {
      label: 'Items, locations and suppliers are each read from SQL Server',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'db-select', where: { sql: 'dbo.items' } },
          { type: 'exists', component: 'db-select', where: { sql: 'dbo.locations' } },
          { type: 'exists', component: 'db-select', where: { sql: 'dbo.suppliers' } },
        ],
      },
    },
    { label: 'Each data file is written as .tmp and renamed, inside a For Each', rule: { type: 'all', rules: [{ type: 'inside', component: 'ftp-write', within: 'foreach', where: { path: '.tmp' } }, { type: 'inside', component: 'ftp-rename', within: 'foreach' }] } },
    { label: 'The control file is written after every data file is renamed', rule: { type: 'before', first: 'ftp-rename', then: 'ftp-write', thenWhere: { path: '.ctl' }, outside: true } },
    { label: 'The job is marked COMPLETED after the control file', rule: { type: 'before', first: 'ftp-write', firstWhere: { path: '.ctl' }, then: 'db-update', thenWhere: { sql: 'COMPLETED' }, outside: true } },
    { label: 'The report email is sent from an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
    { label: 'A failed run marks the job FAILED and emails support', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: 'FAILED' } }, { type: 'inside', component: 'email-send', within: 'on-error-propagate' }] } },
  ],
  simulation: {
    systems: { db: { tables, procedures } },
    tests: [
      {
        name: 'The nightly bundle',
        about: 'Three data files and a control file listing each with its row count. Job 8 is COMPLETED and support gets the report.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            '/inbound/master/ITEMS_*.csv': { count: 1, has: 'JKT-RAIN-M' },
            '/inbound/master/LOCATIONS_*.csv': { count: 1, has: 'DC-01' },
            '/inbound/master/SUPPLIERS_*.csv': { count: 1, has: 'SUP-HAYDEN' },
            '/inbound/master/*.tmp': { count: 0 },
            '/inbound/master/MASTER_*.ctl': { count: 1, has: '.csv|3' },
          },
          db: { job_log: { has: [{ job_id: 8, status: 'COMPLETED' }, { job_id: 7, status: 'COMPLETED' }] } },
          emails: [{ to: 'planning-support@brindle.example', subject: 'COMPLETED', count: 1 }],
        },
      },
      {
        name: 'The FTP server is down',
        about: 'No file can be written, so no control file appears and the platform loads nothing. Job 8 is FAILED and support is told.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: {
          error: 'FTP:CONNECTIVITY',
          files: { '/inbound/master/*.ctl': { count: 0 } },
          db: { job_log: { has: [{ job_id: 8, status: 'FAILED' }] } },
          emails: [{ to: 'planning-support@brindle.example', subject: 'FAILED', count: 1 }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'master-data-bundle-out',
      source('scheduler', { strategy: 'cron', expression: '0 30 23 * * ?' }),
      [
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "MASTER_DATA_OUT" }]', target: 'job' }),
        step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
        step('set-variable', { variableName: 'stamp', value: '#[now() as String {format: "yyyyMMddHHmm"}]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT item_id, description, dept FROM dbo.items ORDER BY item_id', target: 'items' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT location_id, location_type, region FROM dbo.locations ORDER BY location_id', target: 'locations' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT supplier_id, supplier_name, lead_days FROM dbo.suppliers ORDER BY supplier_id', target: 'suppliers' }),
        step('set-variable', {
          variableName: 'bundle',
          value: '#[[{ entity: "ITEMS", rows: vars.items }, { entity: "LOCATIONS", rows: vars.locations }, { entity: "SUPPLIERS", rows: vars.suppliers }]]',
        }),
        scope('foreach', { collection: '#[vars.bundle]' }, [
          step('set-variable', { variableName: 'fileName', value: '#[payload.entity ++ "_" ++ vars.stamp ++ ".csv"]' }),
          step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload.rows' }),
          step('ftp-write', { path: '#["/inbound/master/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
          step('ftp-rename', { path: '#["/inbound/master/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
        ]),
        step('set-payload', { value: '#[(vars.bundle map ((b) -> b.entity ++ "_" ++ vars.stamp ++ ".csv|" ++ (sizeOf(b.rows) as String))) joinBy "\\n"]' }),
        step('ftp-write', { path: '#["/inbound/master/MASTER_" ++ vars.stamp ++ ".ctl"]', mode: 'OVERWRITE' }),
        step('db-update', {
          database: 'SQL Server',
          sql: "UPDATE dbo.job_log SET status = 'COMPLETED', detail = :detail WHERE job_id = :jobId",
          inputParameters: '#[{ jobId: vars.jobId, detail: (vars.bundle map ((b) -> b.entity ++ "=" ++ (sizeOf(b.rows) as String))) joinBy " " }]',
        }),
        scope('async', {}, [
          step('email-send', {
            toAddresses: 'planning-support@brindle.example',
            subject: '#["Master data job " ++ (vars.jobId as String) ++ " COMPLETED"]',
            content: '#[(vars.bundle map ((b) -> b.entity ++ ": " ++ (sizeOf(b.rows) as String) ++ " rows")) joinBy "\\n"]',
            contentType: 'text/plain',
          }),
        ]),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', {
            database: 'SQL Server',
            sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId",
            inputParameters: '#[{ jobId: vars.jobId, detail: error.description }]',
          }),
          step('email-send', {
            toAddresses: 'planning-support@brindle.example',
            subject: '#["Master data job " ++ ((vars.jobId default "?") as String) ++ " FAILED"]',
            content: '#[error.description]',
            contentType: 'text/plain',
          }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends three master data files to the planning platform every night: items, locations and suppliers. The platform reads them from its **FTP server**, folder \`/inbound/master\`.

The platform's loading rule: it starts only when a control file \`MASTER_<stamp>.ctl\` appears. The control file has one line per data file, \`<file name>|<row count>\`, and the platform checks each count. It ignores \`.tmp\` files.

The data is in SQL Server: \`dbo.items\`, \`dbo.locations\`, \`dbo.suppliers\`. Every run must have a row in \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`detail\`). The DBA team gives you \`dbo.usp_job_start(@jobName)\`, which inserts the row with status \`STARTED\` and returns the new \`job_id\`.

Support at \`planning-support@brindle.example\` wants an email after every run: the counts on success, the reason on failure. Last month the mail server was slow and held up the run by four minutes.

**Requirements**
- Start a job row, then read the three tables.
- Write each file as \`<ENTITY>_<stamp>.csv\` under a \`.tmp\` name and rename it.
- Write the control file only after all three data files are in place.
- Mark the job \`COMPLETED\` with the counts. Send the report without holding up the run.
- On any failure, mark the job \`FAILED\` and email support.

**Facts**
- Run at 23:30. Call the procedure with the job name \`MASTER_DATA_OUT\`. It returns a row with \`job_id\`.
- The entities are \`ITEMS\`, \`LOCATIONS\` and \`SUPPLIERS\`. Use one \`<stamp>\` (\`yyyyMMddHHmm\`) for every file in the run. Write the three data files from one **For Each**.
- The control file is \`/inbound/master/MASTER_<stamp>.ctl\`, with lines such as \`ITEMS_202611132330.csv|3\`.
- The email subject contains \`COMPLETED\` or \`FAILED\`. Send the success email from an **Async** scope.
- Handle a failure in an On Error Propagate: update the job, email support, and let the run fail.

**What each system sends back**
- \`dbo.usp_job_start\` answers one row, \`{ "job_id": 8 }\` on the test night. Store it in a target variable and read \`vars.job.job_id\`.
- Each select answers a list of rows with the column names in lower case, for example \`{ "item_id": "TENT-2P-OLV", "description": "Two person tent", "dept": "CAMP" }\`, \`{ "location_id": "DC-01", "location_type": "DC", "region": "NORTH" }\` and \`{ "supplier_id": "SUP-HAYDEN", "supplier_name": "Hayden Textiles", "lead_days": 21 }\`.

**What failures look like**
- The FTP server is down: the first FTP Write raises \`FTP:CONNECTIVITY\`. No control file is written, the handler marks the job \`FAILED\` and emails support, and the run ends with that error.

**Design the flow.**
`,
  answerTemplate: `## The job row

## Three files, one pattern

## The control file is the commit

## Reporting

## Failure
`,
  keyPoints: [
    'The control file is the "commit" for the bundle. Until it appears, the platform loads nothing, so three files can be written one by one.',
    'A For Each over a small list of { entity, rows } writes three files with one set of steps.',
    'The job ID comes back from the procedure (OUTPUT INSERTED inside it), so the final update hits exactly this run\'s row.',
    'The success email goes in an Async scope. A slow mail server then delays the email, not the job.',
    'In the error handler the email is not async: the run is over anyway, and you want the failure mail sent before the error is reported.',
  ],
  solution: `
1. **Scheduler**, cron \`0 30 23 * * ?\`.
2. **Stored Procedure** \`{ call dbo.usp_job_start(:jobName) }\` into \`vars.job\`. **Set Variable** \`jobId\` and \`stamp\`.
3. Three **Database Select** steps into \`items\`, \`locations\`, \`suppliers\`. **Set Variable** \`bundle\`.
4. **For Each** \`vars.bundle\`: \`fileName\`, **Transform** to CSV, **FTP Write** \`.tmp\`, **FTP Rename**.
5. **Set Payload** the control lines, **FTP Write** \`MASTER_<stamp>.ctl\`.
6. **Database Update** the job to \`COMPLETED\` with the counts.
7. **Async**: **Email Send** the report.
8. Flow **On Error Propagate**: update the job to \`FAILED\`, **Email Send** the reason.

**Orphan files.** A failure after one data file leaves it on the server with no control file. The platform never loads it, and the next run writes a new stamp. A cleanup of files older than a week keeps the folder tidy.
`,
  followUps: [
    {
      q: 'The platform wants the files to be consistent: items and suppliers from the same moment. How?',
      a: 'Read the three tables in one transaction with snapshot isolation, or from a database snapshot taken at 23:30, so changes made during the reads do not mix two moments.',
    },
    {
      q: 'Why not one transaction around the FTP writes?',
      a: 'FTP is not transactional. The control file plays that role: it is written last, and only its presence tells the platform the bundle is whole.',
    },
  ],
}
