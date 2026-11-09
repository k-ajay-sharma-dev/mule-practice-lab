import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-001',
  category: 'flows',
  title: 'SFTP CSV to Salesforce Upsert',
  level: 'INTERMEDIATE',
  tags: ['sftp', 'salesforce', 'batch', 'csv'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Triggered by an SFTP listener on the inbound folder', rule: { type: 'source', component: 'sftp-listener' } },
    { label: 'Large files are processed with a Batch Job', rule: { type: 'exists', component: 'batch-job' } },
    {
      label: 'Rows are validated inside a batch step',
      rule: { type: 'inside', component: ['validation', 'raise-error'], within: 'batch-job' },
    },
    {
      label: 'Rows are validated before they are upserted',
      rule: { type: 'before', first: ['validation', 'raise-error'], then: 'sf-upsert' },
    },
    {
      label: 'Failed rows do not stop the job, so every row is counted (Max failed records -1)',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'batch-job', where: { maxFailedRecords: -1 } },
          { type: 'exists', component: 'batch-job', where: { maxFailedRecords: { gte: 50000 } } },
        ],
      },
    },
    {
      label: 'Salesforce Upsert runs inside a Batch Aggregator (bulk chunks)',
      rule: { type: 'inside', component: 'sf-upsert', within: 'batch-aggregator' },
    },
    {
      label: 'Upsert targets Contact and is keyed on the External_Id__c field',
      rule: { type: 'exists', component: 'sf-upsert', where: { objectType: 'Contact', externalIdField: 'External_Id__c' } },
    },
    {
      label: 'The upsert step accepts only rows that passed (NO_FAILURES)',
      rule: { type: 'inside', component: 'sf-upsert', within: 'batch-job', routeWhere: { acceptPolicy: { is: 'NO_FAILURES' } } },
    },
    {
      label: 'Failed rows are collected for the attachment in a step that accepts ONLY_FAILURES',
      rule: {
        type: 'inside',
        component: ['os-store', 'db-insert', 'db-bulk-insert', 'file-write', 'sftp-write', 'vm-publish', 'mq-publish', 'jms-publish'],
        within: 'batch-job',
        routeWhere: { acceptPolicy: { is: 'ONLY_FAILURES' } },
      },
    },
    {
      label: 'Summary email is sent once, from the batch job On Complete phase',
      rule: { type: 'inside', component: 'email-send', within: 'batch-job', inSlot: 'onComplete' },
    },
    {
      label: 'The file is moved to /archive after the batch job, on the main path',
      rule: { type: 'before', first: 'batch-job', then: 'sftp-move', thenWhere: { targetPath: 'archive' }, outside: true },
    },
    {
      label: 'A flow-level error handler moves a failed file to /error',
      rule: { type: 'inside', component: 'sftp-move', where: { targetPath: 'error' }, within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'contacts-sftp-import',
      source('sftp-listener', { directory: '/inbound/contacts', matcher: '*.csv', postAction: 'none' }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('transform', { script: '%dw 2.0\ninput payload application/csv\noutput application/java\n---\npayload' }),
        router(
          'batch-job',
          { jobName: 'contacts-import', blockSize: 100, maxFailedRecords: -1 },
          [
            route({ name: 'validate-row', acceptPolicy: 'NO_FAILURES' }, [
              step('validation', { check: 'is-email', expression: '#[payload.email]', message: 'Invalid email' }),
              step('validation', { check: 'is-not-blank-string', expression: '#[payload.externalId]', message: 'Missing externalId' }),
            ]),
            route({ name: 'upsert-contacts', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 200 }, [
                step('sf-upsert', { objectType: 'Contact', externalIdField: 'External_Id__c' }),
              ]),
            ]),
            route({ name: 'collect-failures', acceptPolicy: 'ONLY_FAILURES' }, [
              step('os-store', { key: '#[uuid()]', value: '#[payload]' }),
            ]),
          ],
          {
            onComplete: [
              step('transform', {
                script:
                  '%dw 2.0\noutput text/plain\n---\n"Processed: " ++ (payload.processedRecords as String) ++ ", failed: " ++ (payload.failedRecords as String)',
              }),
              step('email-send', { toAddresses: 'ops@example.com', subject: 'Contact import summary' }),
            ],
          },
        ),
        step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/archive' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/error' }),
          step('logger', { level: 'ERROR', message: '#[error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A supplier drops a CSV of contacts (5k–50k rows) on SFTP every night in \`/inbound/contacts/\`.

**Requirements**
- Pick up each new file once; move it to \`/archive/\` on success, \`/error/\` on failure.
- Validate each row (email format, mandatory \`externalId\`).
- Upsert valid rows to Salesforce \`Contact\` on \`External_Id__c\`.
- Email a summary (processed / failed counts) to the ops team; attach failed rows as CSV.

**Design the flow(s):** sources, processors, scopes, error handling, and where DataWeave is used.
`,
  answerTemplate: `## Trigger

## Processing

## Salesforce upsert

## Error handling and file moves

## Summary email
`,
  keyPoints: [
    'SFTP On New or Updated File with a post-action (move/rename) or explicit Move operation to avoid re-processing.',
    'Batch Job (or streaming) for 50k rows instead of loading everything in memory.',
    'Validation in a batch step with an accept policy, or filter into valid/invalid sets with DataWeave.',
    'Salesforce Upsert in a Batch Aggregator (chunks up to 200) on External_Id__c.',
    'On Complete phase builds the summary from batch result counts and sends the email.',
    'Failed rows collected and written as CSV attachment; file moved to /error/ on job-level failure.',
  ],
  solution: `
1. **Trigger:** SFTP *On New or Updated File* on \`/inbound/contacts/\`, matcher \`*.csv\`, with *Auto delete* off. Stream the content (repeatable file-store stream).
2. **Parse:** DataWeave reads the CSV (\`input payload application/csv\`) and maps rows to objects.
3. **Batch Job**
   - *Step 1 – Validate:* check email regex and \`externalId\`; invalid records raise an error and become failed records. Set \`maxFailedRecords="-1"\` so the job keeps going: by default it stops at the first failed record.
   - *Step 2 – Upsert* (accept \`NO_FAILURES\`): **Batch Aggregator size 200** → Salesforce *Upsert* \`Contact\` on \`External_Id__c\`.
   - *Step 3 – Collect failures* (accept \`ONLY_FAILURES\`): append failed rows to an Object Store / temp file.
   - *On Complete:* build summary from \`payload.successfulRecords\` / \`failedRecords\`, generate the failures CSV, send via Email connector.
4. **File handling:** after the job is dispatched, move the file to \`/archive/\`; a flow-level On Error Propagate moves it to \`/error/\` and alerts if parsing fails.
5. **Idempotency:** the file move prevents double pick-up; Salesforce upsert on an external ID makes reruns safe.
`,
}
