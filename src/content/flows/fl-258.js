import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'TARIFF_20261113.csv'
const file = `/tariffs/in/${name}`
const clean = 'lane,weight_band,rate\nLDS-BRS,0-100,42.00\nLDS-BRS,100-500,118.50\nMAN-GLA,0-100,51.25'
const oneBad = 'lane,weight_band,rate\nLDS-BRS,0-100,42.00\nLDS-BRS,,118.50\nMAN-GLA,0-100,51.25'
const tables = {
  job_lock: { key: 'job_name', columns: ['job_name', 'locked', 'locked_at'], rows: [{ job_name: 'TARIFF_LOAD', locked: 0, locked_at: '2026-11-12T02:00:00Z' }] },
  tariff_rate: { key: ['lane', 'weight_band'], columns: ['lane', 'weight_band', 'rate', 'job_id'], rows: [{ lane: 'LDS-BRS', weight_band: '0-100', rate: 40.0, job_id: 610 }] },
  tariff_rejects: { columns: ['job_id', 'lane', 'weight_band', 'reason'], rows: [] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'loaded', 'failed'], rows: [{ job_id: 610, job_name: 'TARIFF_LOAD', status: 'COMPLETED', loaded: 88000, failed: 0 }] },
}
const held = { ...tables, job_lock: { ...tables.job_lock, rows: [{ job_name: 'TARIFF_LOAD', locked: 1, locked_at: '2026-11-13T01:40:00Z' }] } }
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', loaded: null, failed: null })
    return { job_id: id }
  },
}
const release = (target) => ({ database: 'SQL Server', sql: 'UPDATE dbo.job_lock SET locked = 0 WHERE job_name = :jobName', inputParameters: '#[{ jobName: "TARIFF_LOAD" }]', ...(target ? { target } : {}) })
const merge =
  'MERGE INTO dbo.tariff_rate AS t\nUSING (SELECT :lane AS lane, :weight_band AS weight_band, :rate AS rate, :job_id AS job_id) AS s\nON t.lane = s.lane AND t.weight_band = s.weight_band\nWHEN MATCHED THEN UPDATE SET rate = s.rate, job_id = s.job_id\nWHEN NOT MATCHED THEN INSERT (lane, weight_band, rate, job_id) VALUES (s.lane, s.weight_band, s.rate, s.job_id);'

export default {
  id: 'fl-258',
  category: 'flows',
  title: 'A Nightly Tariff Load That Survives Overlaps, Reruns and Bad Rows: a Run Lock, a Job Log, MERGE From the Aggregator, an ONLY_FAILURES Reject Step, and Everything Closed From On Complete',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'sql-server', 'run-lock', 'merge', 'job-log', 'reject-table', 'sftp', 'scheduler'],
  estMinutes: 70,
  flowChecks: [
    { label: 'The lock is taken with an update that only works when the lock is free', rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['job_lock', 'SET locked = 1', 'AND locked = 0'] } } } },
    { label: 'The Batch Job runs only on the route where the lock was taken', rule: { type: 'inside', component: 'batch-job', within: 'choice', routeWhere: { expression: 'affectedRows' } } },
    { label: 'A Batch Aggregator MERGEs the rates into dbo.tariff_rate', rule: { type: 'inside', component: ['db-bulk-update', 'db-bulk-insert'], within: 'batch-aggregator', where: { sql: { all: ['MERGE INTO dbo.tariff_rate', 'WHEN MATCHED', 'WHEN NOT MATCHED'] } } } },
    { label: 'An ONLY_FAILURES step writes dbo.tariff_rejects', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' }, where: { sql: 'tariff_rejects' } } },
    {
      label: 'On Complete closes the job row, archives the file and releases the lock',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: 'job_log' } },
          { type: 'inside', component: 'sftp-move', within: 'batch-job', inSlot: 'onComplete', where: { targetPath: '/tariffs/done' } },
          { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['job_lock', 'SET locked = 0'] } } },
        ],
      },
    },
    { label: 'The error handler releases the lock', rule: { type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: { all: ['job_lock', 'SET locked = 0'] } } } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables, procedures } },
    tests: [
      {
        name: 'A normal night',
        about: 'The lock is free. LDS-BRS 0-100 is updated to 42.00 and two rates are added under job 611. Job 611 is COMPLETED, the file is archived and the lock is free again.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: {
            tariff_rate: { count: 3, has: [{ lane: 'LDS-BRS', weight_band: '0-100', rate: 42, job_id: 611 }, { lane: 'MAN-GLA', job_id: 611 }] },
            job_log: { has: [{ job_id: 611, status: 'COMPLETED', loaded: 3, failed: 0 }] },
            job_lock: { has: [{ locked: 0 }] },
          },
          files: { [`/tariffs/done/${name}`]: { exists: true }, [file]: { exists: false } },
        },
      },
      {
        name: 'Last night\'s run is still going',
        about: 'The lock is held. This run logs a WARN and touches nothing: no job row, no rates, the file stays for the next run.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: held } } },
        expect: { noError: true, db: { job_log: { count: 1 }, tariff_rate: { has: [{ rate: 40 }] }, job_lock: { has: [{ locked: 1 }] } }, files: { [file]: { exists: true } }, logs: [{ level: 'WARN', has: 'lock' }] },
      },
      {
        name: 'A row with no weight band',
        about: 'One rate has no weight band and fails its check. It goes to the reject table under job 611, the other two are merged, and job 611 is COMPLETED_WITH_REJECTS.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: {
          db: { tariff_rate: { count: 2 }, tariff_rejects: { count: 1, has: [{ job_id: 611, lane: 'LDS-BRS' }] }, job_log: { has: [{ job_id: 611, status: 'COMPLETED_WITH_REJECTS', loaded: 2, failed: 1 }] }, job_lock: { has: [{ locked: 0 }] } },
        },
      },
      {
        name: 'No file tonight',
        about: 'The carrier sent nothing. The run gives the lock back and logs a WARN, and no job row is started.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [file]: null } } },
        expect: { noError: true, db: { job_log: { count: 1 }, job_lock: { has: [{ locked: 0 }] } }, logs: [{ level: 'WARN', has: 'No tariff file' }] },
      },
      {
        name: 'The job row cannot be started',
        about: 'The job start procedure fails after the lock was taken. The error handler frees the lock, so tomorrow\'s run is not blocked.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { failWhen: [{ match: 'usp_job_start', fault: 'QUERY_EXECUTION' }] } } },
        expect: { error: 'DB:QUERY_EXECUTION', db: { job_lock: { has: [{ locked: 0 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'tariff-load',
      source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }),
      [
        step('db-update', {
          database: 'SQL Server',
          sql: 'UPDATE dbo.job_lock SET locked = 1, locked_at = :lockedAt WHERE job_name = :jobName AND locked = 0',
          inputParameters: '#[{ jobName: "TARIFF_LOAD", lockedAt: now() as String }]',
          target: 'lock',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.lock.affectedRows == 1]' }, [
              step('sftp-list', { directoryPath: '/tariffs/in', matcher: 'TARIFF_*.csv', recursive: 'false' }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'WARN', message: 'No tariff file tonight' }), step('db-update', release('released'))]),
                ],
                {
                  otherwise: [
                    step('set-variable', { variableName: 'filePath', value: '#[payload[0].attributes.path]' }),
                    step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "TARIFF_LOAD" }]', target: 'job' }),
                    step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
                    step('sftp-read', { path: '#[vars.filePath]', outputMimeType: 'application/csv' }),
                    router(
                      'batch-job',
                      { jobName: 'tariff-load', blockSize: 500, maxFailedRecords: -1 },
                      [
                        route({ name: 'merge-rate', acceptPolicy: 'NO_FAILURES' }, [
                          step('validation', { check: 'is-not-blank-string', expression: '#[payload.weight_band]', message: 'NO_WEIGHT_BAND' }),
                          step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ lane: payload.lane, weight_band: payload.weight_band, rate: payload.rate as Number, job_id: vars.jobId }' }),
                          scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-update', { database: 'SQL Server', sql: merge })]),
                        ]),
                        route({ name: 'reject', acceptPolicy: 'ONLY_FAILURES' }, [
                          step('db-insert', {
                            database: 'SQL Server',
                            sql: 'INSERT INTO dbo.tariff_rejects (job_id, lane, weight_band, reason) VALUES (:jobId, :lane, :band, :reason)',
                            inputParameters: '#[{ jobId: vars.jobId, lane: payload.lane, band: payload.weight_band, reason: "LOAD_FAILED" }]',
                          }),
                        ]),
                      ],
                      {
                        onComplete: [
                          step('db-update', {
                            database: 'SQL Server',
                            sql: 'UPDATE dbo.job_log SET status = :status, loaded = :loaded, failed = :failed WHERE job_id = :jobId',
                            inputParameters:
                              '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: if (payload.failedRecords == 0) "COMPLETED" else if (payload.successfulRecords == 0) "FAILED" else "COMPLETED_WITH_REJECTS" }]',
                            target: 'jobRow',
                          }),
                          step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/tariffs/done', overwrite: 'true' }),
                          step('db-update', release('released')),
                        ],
                      },
                    ),
                  ],
                },
              ),
            ]),
          ],
          { otherwise: [step('logger', { level: 'WARN', message: 'The tariff lock is held by another run, skipping' })] },
        ),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('db-update', release()), step('logger', { level: 'ERROR', message: '#["Tariff load failed: " ++ error.description]' })])],
    ),
  ),
  description: `
Thornbury Freight, a fictional freight carrier, loads its partner carriers' tariffs every night. A partner drops \`TARIFF_<date>.csv\` on the **SFTP server**, folder \`/tariffs/in\`, with about **3 million rates**:

\`\`\`
lane,weight_band,rate
LDS-BRS,0-100,42.00
\`\`\`

The quoting system reads \`dbo.tariff_rate\` (key \`lane\` + \`weight_band\`, \`rate\`, \`job_id\`). A new tariff replaces the rate of a known lane and band.

The DBA team has set up \`dbo.job_lock\` (\`job_name\`, \`locked\`, \`locked_at\`) with a row \`TARIFF_LOAD\`, \`dbo.job_log\` with \`dbo.usp_job_start(@jobName)\`, and \`dbo.tariff_rejects\` (\`job_id\`, \`lane\`, \`weight_band\`, \`reason\`).

What went wrong this quarter:
- A run that took over two hours overlapped the next night's run on the second replica.
- A rerun after a crash failed on the key for every rate already loaded.
- One rate without a weight band failed a group of 500.
- A failure before the job left the lock set, and three nights were skipped.

**Requirements**
- At 02:00 take the lock; if it is held, log a WARN and stop.
- If there is no file, log a WARN, release the lock and stop.
- Start a job row \`TARIFF_LOAD\`, read the file, and load it through a Batch Job:
  - a rate with no weight band fails on its own;
  - the others are MERGEd in groups;
  - each failed rate goes to the reject table with reason \`LOAD_FAILED\`.
- When the job ends: job row with \`COMPLETED\`, \`COMPLETED_WITH_REJECTS\` or \`FAILED\` and the counts, file to \`/tariffs/done\`, lock released.
- Any failure before the job: release the lock and log an ERROR.

**Facts**
- Take the lock with \`UPDATE dbo.job_lock SET locked = 1, locked_at = ... WHERE job_name = 'TARIFF_LOAD' AND locked = 0\`. Release it with \`UPDATE dbo.job_lock SET locked = 0 WHERE job_name = 'TARIFF_LOAD'\`. Decide on the update's \`affectedRows\` in a Choice.
- The WARN for a held lock mentions the lock. The WARN for a missing file starts \`No tariff file\`.
- Find the file with SFTP **List** on \`/tariffs/in\`, matcher \`TARIFF_*.csv\`, then read the first one.
- \`dbo.usp_job_start\` returns \`{ job_id }\`. \`dbo.job_log\` has \`status\`, \`loaded\` and \`failed\`.
- Write the rates with \`MERGE INTO dbo.tariff_rate\`.
- Status is \`COMPLETED\` when nothing failed, \`FAILED\` when nothing loaded, else \`COMPLETED_WITH_REJECTS\`.
- Release the lock on failure in an On Error Propagate, so the run still ends with the original error.

**Design the flow.**
`,
  answerTemplate: `## The lock

## Finding the file and the job row

## The Batch Job

## On Complete

## Failure before the job
`,
  keyPoints: [
    'The lock stops overlap across replicas and slow runs. A conditional update makes taking it atomic.',
    'MERGE makes a rerun harmless: a rate loaded before the crash is written again with the same value.',
    'A check before the aggregator fails one record. The group of 500 behind it carries on.',
    'Every exit path releases the lock: no file, the end of the job, and the error handler. A lock left set skips nights silently.',
    'The file is archived in On Complete. Until the job ends it stays in /tariffs/in, so a lost job leaves it for the next run.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 2 * * ?\`.
2. **Database Update** take the lock (target \`lock\`).
3. **Choice** on \`vars.lock.affectedRows == 1\`, otherwise **Logger** WARN.
4. Inside: **SFTP List** \`/tariffs/in\`. **Choice**: empty: WARN and release. Otherwise:
   - **Set Variable** \`filePath\`; **Stored Procedure** \`usp_job_start\`; **Set Variable** \`jobId\`; **SFTP Read** the file.
   - **Batch Job** (max failed records -1):
     - Step \`merge-rate\`: **Validation** weight band not blank; **Transform**; **Batch Aggregator** (size 500) with **Bulk Update** MERGE.
     - Step \`reject\` (ONLY_FAILURES): **Insert** into \`dbo.tariff_rejects\`.
     - **On Complete**: **Update** the job row; **SFTP Move** to \`/tariffs/done\`; **Update** release the lock.
5. Flow **On Error Propagate**: release the lock, **Logger** ERROR.

**A lock that outlives its run.** If the app dies mid job, On Complete never runs. Let a run take a lock older than four hours, with an alert, or support will find the lock set in the morning.
`,
  followUps: [
    {
      q: 'Why read the file with SFTP Read after a list, instead of an SFTP listener?',
      a: 'The load must run at 02:00 after the lock, not whenever a file appears. A listener would start the flow on arrival, and the lock would then need to sit in a different place.',
    },
    {
      q: 'The partner sends two files on the same night. What does this design do?',
      a: 'It loads the first one listed and leaves the second for the next night. Sort the list by name or time and loop over the files inside the lock, or reject the second as unexpected.',
    },
  ],
}
