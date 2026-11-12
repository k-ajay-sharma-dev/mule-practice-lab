import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-089',
  category: 'flows',
  title: 'Nightly Product Load to Salesforce with Bulk API v2 and a Separate Job Monitor Flow',
  level: 'ADVANCED',
  tags: ['salesforce', 'bulk-api', 'sftp', 'csv', 'object-store', 'scheduler', 'retail'],
  estMinutes: 40,
  flowChecks: [
    { label: 'A scheduled flow reads the product file and a second scheduled flow monitors the job', rule: { type: 'exists', component: 'scheduler', min: 2 } },
    {
      label: 'The load is one Bulk API v2 upsert of Product2 keyed on PIM_Product_Id__c',
      rule: { type: 'exists', component: 'sf-create-job-v2', where: { objectType: 'Product2', operation: 'upsert', externalIdFieldName: 'PIM_Product_Id__c' } },
    },
    {
      label: 'No single-record Salesforce calls are used for the load',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'sf-create-job-v2' },
          { type: 'absent', component: ['sf-create', 'sf-upsert', 'sf-update'] },
        ],
      },
    },
    { label: 'The data is transformed before the job is created', rule: { type: 'before', first: 'transform', then: 'sf-create-job-v2' } },
    { label: 'The job ID is kept in the Object Store after the job is created', rule: { type: 'before', first: 'sf-create-job-v2', then: 'os-store', outside: true } },
    {
      label: 'The submit flow does not wait for the job: the job state is asked for only in a separate flow',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'sf-get-job-state-v2' },
          { type: 'absent', component: 'sf-get-job-state-v2', inFlowWith: { component: 'sf-create-job-v2' } },
        ],
      },
    },
    { label: 'The monitor flow reads the stored job ID before asking for the job state', rule: { type: 'before', first: 'os-retrieve', then: 'sf-get-job-state-v2' } },
    { label: 'Failed results are fetched only when the job has finished (inside a Choice)', rule: { type: 'inside', component: 'sf-retrieve-failed-v2', within: 'choice' } },
    { label: 'Unprocessed rows are also fetched', rule: { type: 'exists', component: 'sf-retrieve-unprocessed-v2' } },
    {
      label: 'Rejected rows are written to /pim/rejected/ for the product team',
      rule: { type: 'before', first: 'sf-retrieve-failed-v2', then: 'sftp-write', thenWhere: { path: '/pim/rejected/' } },
    },
    {
      label: 'A failed or aborted job sends an alert email from the monitor flow',
      rule: { type: 'inside', component: 'email-send', within: 'choice', where: { toAddresses: { set: true } } },
    },
    {
      label: 'On both the finished and the failed route, the monitor clears the stored job ID so the job is reported only once',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'os-remove', within: 'choice', min: 2 },
          { type: 'inside', component: 'os-store', within: 'choice', min: 2 },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'product-load-submit',
      source('scheduler', { strategy: 'cron', expression: '0 30 1 * * ?' }),
      [
        step('sftp-read', { path: '/pim/outbound/products.json', outputMimeType: 'application/json' }),
        // The job's Line Ending defaults to LF, so the CSV must use the same line ending.
        step('transform', {
          script:
            '%dw 2.0\noutput application/csv lineSeparator="\\n"\n---\npayload map (p) -> {\n  PIM_Product_Id__c: p.id,\n  Name: p.name,\n  ProductCode: p.sku,\n  IsActive: p.status == "ACTIVE"\n}',
        }),
        step('sf-create-job-v2', { objectType: 'Product2', operation: 'upsert', externalIdFieldName: 'PIM_Product_Id__c', lineEnding: 'LF', columnDelimiter: 'COMMA' }),
        // Output type is Bulk Job State; confirm the ID field in Studio metadata.
        step('os-store', { key: 'product-load-job', value: '#[payload.id]', objectStore: 'bulkJobStore' }),
        step('logger', { level: 'INFO', message: '#["Bulk job created: " ++ payload.id]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Product load not submitted: " ++ error.description]' }),
          step('email-send', { toAddresses: 'pim-support@example.com', subject: 'Product load not submitted', content: '#[error.description]' }),
        ]),
      ],
    ),
    flow(
      'product-load-monitor',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }),
      [
        step('os-retrieve', { key: 'product-load-job', defaultValue: "#['']", objectStore: 'bulkJobStore' }),
        step('set-variable', { variableName: 'jobId', value: '#[payload]' }),
        router(
          'choice',
          {},
          [
            route({ expression: "#[vars.jobId != '']" }, [
              step('sf-get-job-state-v2', { jobId: '#[vars.jobId]' }),
              step('set-variable', { variableName: 'jobState', value: '#[payload.state]' }),
              router(
                'choice',
                {},
                [
                  route({ expression: "#[vars.jobState == 'JobComplete']" }, [
                    step('sf-retrieve-failed-v2', { jobId: '#[vars.jobId]' }),
                    step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
                    step('sftp-write', { path: "/pim/rejected/products-failed.csv", mode: 'OVERWRITE' }),
                    step('sf-retrieve-unprocessed-v2', { jobId: '#[vars.jobId]' }),
                    step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
                    step('sftp-write', { path: '/pim/rejected/products-unprocessed.csv', mode: 'OVERWRITE' }),
                    step('logger', { level: 'INFO', message: '#["Bulk job " ++ vars.jobId ++ " finished"]' }),
                    step('os-remove', { key: 'product-load-job', objectStore: 'bulkJobStore' }),
                  ]),
                  route({ expression: "#[vars.jobState == 'Failed' or vars.jobState == 'Aborted']" }, [
                    step('logger', { level: 'ERROR', message: '#["Bulk job " ++ vars.jobId ++ " ended as " ++ vars.jobState]' }),
                    step('email-send', { toAddresses: 'pim-support@example.com', subject: 'Product load failed', content: '#[vars.jobId]' }),
                    step('os-remove', { key: 'product-load-job', objectStore: 'bulkJobStore' }),
                  ]),
                ],
                { otherwise: [step('logger', { level: 'DEBUG', message: '#["Bulk job still running: " ++ vars.jobState]' })] },
              ),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: 'No bulk job to monitor' })] },
        ),
      ],
    ),
  ),
  description: `
A retailer keeps its product data in a **PIM**. Every night at 01:00 the PIM drops a JSON export of about **350,000 products** on an SFTP server. Salesforce needs these as \`Product2\` records for sales and service teams.

**Requirements**
- Create or update products in **one idempotent load**, keyed on the external ID field \`PIM_Product_Id__c\`.
- Use the connector's **Bulk API v2** operations. The team has been told not to use a For Each with single-record calls.
- Salesforce processes the job in the background, and a load can take from a few minutes to over an hour. **No flow may wait** for it.
- When the job ends, rejected rows must go to \`/pim/rejected/\` on the SFTP server for the product team. Rows Salesforce did not process must also be visible.
- A failed or aborted job must alert the PIM support mailbox.
- Each job that has ended is reported only once, not again on every poll.
- A restart of the app during a running load must not lose track of the job.

**Design the flows.** Say which job states you handle and how you size and schedule the polling.
`,
  answerTemplate: `## Submitting the job

## Tracking the job

## Results and rejected rows

## Alerts and restarts
`,
  keyPoints: [
    'Create Job Bulk Api V2 takes the object type, the operation (insert, update, delete, hardDelete or upsert), the external ID field and the data as sObjects.',
    'Line Ending defaults to LF and Column Delimiter to COMMA, so the CSV written by DataWeave must match.',
    'The job runs asynchronously, so a separate scheduled flow polls Get Job State Bulk Api V2 instead of holding a flow open.',
    'A persistent Object Store keeps the job ID, so a restart does not lose it.',
    'Job states are a Salesforce API concept, and the connector reference does not list them: JobComplete, Failed and Aborted are final and others mean still running, but verify the names in the Salesforce docs.',
    'A completed job can still have rejected rows, so always read the failed and unprocessed results.',
  ],
  solution: `
**Submit flow (\`product-load-submit\`).**
1. **Scheduler** with a cron expression after the export, at 01:30.
2. **SFTP Read** of the export.
3. **Transform Message** to CSV. Column headers are the Salesforce field API names. The line separator matches the job's default of LF.
4. **Create Job Bulk Api V2**: \`Product2\`, \`upsert\`, \`PIM_Product_Id__c\`.
5. **Object Store Store** of the job ID, and a **Logger**.

**Monitor flow (\`product-load-monitor\`).**
1. **Scheduler** every 5 minutes. A job can take over an hour, so a short wait in a flow would be wasteful. Each poll is one API call, which is cheap.
2. **Object Store Retrieve** with an empty default. Nothing stored means nothing to do.
3. **Get Job State Bulk Api V2**, then a **Choice**:
   - \`JobComplete\`: **Retrieve Job Failed Results Bulk V2** and write the CSV to \`/pim/rejected/\`. Then **Retrieve Job Unprocessed Results Bulk V2** and write that CSV to the same folder. Log the result and remove the job ID.
   - \`Failed\` or \`Aborted\`: log, email the support mailbox and remove the job ID.
   - Anything else: the job is still running, so do nothing.

**Notes.**
- Job state values and the 150 MB limit per job come from the Salesforce Bulk API v2, not the connector docs. Verify both in the current Salesforce docs, and check the file size of your export against the limit.
- Output field names (\`payload.id\`, \`payload.state\`) should be confirmed in Studio metadata for the Bulk Job State type.
- A partly failed job still ends as \`JobComplete\`, so the rejected rows are the real result to check (see inc-020).
`,
  followUps: [
    {
      q: 'Why two flows instead of a loop with a delay?',
      a: 'A waiting flow holds a thread and is lost on a restart. A scheduled monitor with the job ID in an Object Store survives restarts and needs no running state.',
    },
    {
      q: 'What if tonight\'s load starts while last night\'s job is still running?',
      a: 'Check the stored job ID first and refuse or queue the new load. With one key, a new job ID would overwrite the old one and that job would never be reported.',
    },
    {
      q: 'How do you stop a job that was started with the wrong file?',
      a: 'Use Abort Job Bulk Api V2 with the job ID. Records already processed stay changed, so a rerun of the correct file is still required.',
    },
    {
      q: 'Parent records are locked during the load. What helps?',
      a: 'Sort rows so that children of one parent stay together, or split the load. Bulk API v2 processes data in parallel, so lock contention on shared parents is a known risk.',
    },
  ],
}
