import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-039',
  category: 'flows',
  title: 'Customer Migration Batch Job with Accept Policies and On Complete Report',
  level: 'INTERMEDIATE',
  tags: ['batch', 'migration', 'salesforce', 'accept-policy', 'on-complete'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The migration runs as a Batch Job', rule: { type: 'exists', component: 'batch-job' } },
    {
      label: 'The job has separate steps (validate/enrich, load, record failures)',
      rule: { type: 'routes', component: 'batch-job', min: 3 },
    },
    { label: 'Records are validated inside a batch step', rule: { type: 'inside', component: 'validation', within: 'batch-job' } },
    {
      label: 'Salesforce is loaded in bulk through a Batch Aggregator',
      rule: { type: 'inside', component: 'sf-upsert', within: 'batch-aggregator' },
    },
    {
      label: 'The job does not stop on bad records (max failed records = -1)',
      rule: { type: 'exists', component: 'batch-job', where: { maxFailedRecords: { lte: -1 } } },
    },
    {
      label: 'Failed records are persisted for re-run from within the job',
      rule: { type: 'inside', component: ['db-insert', 'db-bulk-insert', 'os-store', 'file-write'], within: 'batch-job' },
    },
    { label: 'A migration report is emailed from the job (On Complete)', rule: { type: 'inside', component: 'email-send', within: 'batch-job' } },
  ],
  referenceFlow: design(
    flow(
      'customer-migration',
      source('http-listener', { path: '/admin/migrations/customers', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'waveId', value: '#[attributes.queryParams.wave default "W1"]' }),
        step('db-select', {
          sql: "SELECT c.*, a.street, a.city, a.postcode, a.country FROM legacy_customer c LEFT JOIN legacy_address a ON a.customer_id = c.id WHERE c.migration_wave = :waveId AND c.migrated = 'N'",
        }),
        router(
          'batch-job',
          { jobName: 'customer-migration', blockSize: 200, maxFailedRecords: -1 },
          [
            route({ name: 'validate-and-map', acceptPolicy: 'NO_FAILURES' }, [
              step('validation', { check: 'is-not-blank-string', expression: '#[payload.customer_no]', message: 'Missing customer number' }),
              step('validation', { check: 'is-email', expression: '#[payload.email]', message: 'Invalid email' }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/java\n---\n{\n  Legacy_Customer_No__c: payload.customer_no,\n  Name: trim(payload.company_name),\n  BillingStreet: payload.street,\n  BillingCity: payload.city,\n  BillingPostalCode: payload.postcode,\n  BillingCountry: upper(payload.country default ""),\n  Email__c: lower(payload.email)\n}',
              }),
            ]),
            route({ name: 'load-salesforce', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 200 }, [
                step('sf-upsert', { objectType: 'Account', externalIdField: 'Legacy_Customer_No__c' }),
                step('transform', {
                  script:
                    '%dw 2.0\noutput application/java\n---\npayload.items filter ((r) -> not r.successful) map ((r) -> r.message)',
                }),
              ]),
            ]),
            route({ name: 'mark-migrated', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 500 }, [
                step('db-bulk-insert', {
                  sql: "INSERT INTO migration_log (customer_no, wave_id, status) VALUES (:Legacy_Customer_No__c, :waveId, 'MIGRATED')",
                }),
              ]),
            ]),
            route({ name: 'record-failures', acceptPolicy: 'ONLY_FAILURES' }, [
              step('db-insert', {
                sql: 'INSERT INTO migration_errors (customer_no, wave_id, error_message, failed_at) VALUES (:customerNo, :waveId, :error, CURRENT_TIMESTAMP)',
              }),
            ]),
          ],
          {
            onComplete: [
              step('transform', {
                script:
                  '%dw 2.0\noutput text/plain\n---\n"Customer migration wave " ++ vars.waveId ++ "\\nTotal: " ++ (payload.totalRecords as String) ++ "\\nSucceeded: " ++ (payload.successfulRecords as String) ++ "\\nFailed: " ++ (payload.failedRecords as String) ++ "\\nElapsed ms: " ++ (payload.elapsedTimeInMillis as String)',
              }),
              step('email-send', { toAddresses: 'migration-team@example.com', subject: 'Customer migration report' }),
              step('logger', { level: 'INFO', message: '#[payload]' }),
            ],
          },
        ),
        step('set-payload', { value: '#[output application/json --- { status: "STARTED", wave: vars.waveId }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Could not start migration: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A company is retiring its legacy CRM (Oracle) and moving **1.2 million customers** into **Salesforce Accounts** over four weekend "waves" of ~300k each.

- Source: \`legacy_customer\` joined with \`legacy_address\`, filtered by \`migration_wave\`.
- Target: Salesforce \`Account\`, external ID \`Legacy_Customer_No__c\` (so a wave can be re-run safely).
- Data quality is poor: ~2% of records have no customer number or a broken email. **Bad records must not stop the wave** — they are logged for the data-stewards to fix and re-run.
- Each wave must finish inside a **6-hour window**; Salesforce API limits favour bulk calls.
- After each wave, the migration team gets an **email report**: total, succeeded, failed, duration.
- The wave is started manually by an admin call.

**Design the flow(s):** batch job structure, steps and their accept policies, how Salesforce is loaded, how failures are captured, and the end-of-job report.
`,
  answerTemplate: `## Trigger and input

## Batch job configuration

## Step 1 – validate and map

## Step 2 – load Salesforce

## Step 3 – mark migrated

## Step 4 – failures

## On Complete report
`,
  keyPoints: [
    'Batch Job with max failed records = -1 so bad records are skipped instead of stopping the job; block size tuned for throughput.',
    'Validation and mapping in the first step; a failed validation marks only that record as failed.',
    'Salesforce Upsert on the external ID inside a Batch Aggregator (200) so each call carries a chunk and re-runs are idempotent.',
    'Accept policies: load/mark steps use NO_FAILURES, a final step with ONLY_FAILURES writes failed records and their error to an error table.',
    'On Complete uses the BatchJobResult (totalRecords, successfulRecords, failedRecords, elapsedTimeInMillis) to email the report.',
  ],
  solution: `
**Trigger:** admin \`POST /admin/migrations/customers?wave=W1\` → Database Select (streaming) for the wave → **Batch Job** \`customer-migration\` (block size 200, **max failed records -1**). The HTTP call returns immediately with "STARTED" — the batch job runs asynchronously.

**Steps**
1. \`validate-and-map\` (NO_FAILURES) — Validate customer number and email; DataWeave maps the row to the Account shape. A failure here marks just that record as failed.
2. \`load-salesforce\` (NO_FAILURES) — **Batch Aggregator size 200** → Salesforce **Upsert** \`Account\` on \`Legacy_Customer_No__c\`. Check the per-item results: the connector reports record-level failures in its result instead of failing the whole group. So a rejected Account does not count as a failed batch record by itself and must be logged from here. (For 300k records, the Salesforce Bulk API v2 is an alternative.)
3. \`mark-migrated\` (NO_FAILURES) — aggregator → Database Bulk Insert into \`migration_log\` (audit and cutover proof).
4. \`record-failures\` (**ONLY_FAILURES**) — insert the record plus its error into \`migration_errors\` for the data-stewards.

**On Complete:** DataWeave builds the summary from the BatchJobResult — \`totalRecords\`, \`successfulRecords\`, \`failedRecords\`, \`elapsedTimeInMillis\` — and **Email Send** delivers it.

**Re-runs:** fixed records are re-selected (\`migrated = 'N'\`) and upserted again; the external ID makes this idempotent.
`,
  followUps: [
    {
      q: 'What does accept policy ALL give you, and when would you use it?',
      a: 'The step receives both successful and failed records — useful for an audit/logging step that must see every record, e.g. writing each record outcome to a reconciliation table.',
    },
    {
      q: 'Where does the batch job keep its records, and what happens if the worker restarts mid-wave?',
      a: 'Records are queued in persistent batch queues on the worker; after a restart the job instance resumes from the remaining records. Upsert on an external ID keeps any reprocessed blocks idempotent.',
    },
    {
      q: 'How would you speed the wave up if it does not fit in 6 hours?',
      a: 'Tune block size and the job max concurrency, use larger aggregator sizes or the Salesforce Bulk API, scale the worker vertically, and keep each step light (no per-record remote calls outside aggregators).',
    },
  ],
}
