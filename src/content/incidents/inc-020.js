export default {
  id: 'inc-020',
  category: 'incidents',
  title: 'Salesforce Bulk Job "Succeeds" but Thousands of Records Are Missing',
  level: 'ADVANCED',
  tags: ['salesforce', 'bulk-api', 'error-handling', 'reconciliation'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '02:00:04.551 INFO  [contact-sync] Created Bulk API 2.0 job 7508d00000AbCdE upsert Contact on Ext_Id__c', relevant: false },
      { text: '02:03:10.220 INFO  [contact-sync] Upload complete, job closed (UploadComplete)', relevant: false },
      { text: '02:10:00.003 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '02:21:47.090 INFO  [contact-sync] Job 7508d00000AbCdE state=JobComplete numberRecordsProcessed=251,880 numberRecordsFailed=6,412', relevant: true, why: 'JobComplete means processing finished, not that all records succeeded: 6,412 failed.' },
      { text: '02:21:47.093 INFO  [contact-sync] Contact sync finished successfully', relevant: true, why: 'The flow only checks the job state and reports success, so failures are silently dropped.' },
      { text: 'failedResults.csv: sf__Error=FIELD_CUSTOM_VALIDATION_EXCEPTION: Country code is not valid', relevant: true, why: 'Data errors from the new validation rule; they will not succeed on retry.' },
      { text: 'failedResults.csv: sf__Error=UNABLE_TO_LOCK_ROW: unable to obtain exclusive access to this record', relevant: true, why: 'Transient lock errors: parallel batches update the same parent Account through the new automation.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the dashboard show SUCCESS while contacts are missing?',
        options: [
          'The flow treats JobComplete as success and ignores numberRecordsFailed',
          'Salesforce deletes contacts after the sync',
          'The Bulk job timed out',
          'Mule logs are filtered at INFO level',
        ],
        answer: 0,
        explain: 'JobComplete only means Salesforce finished processing. The failed count is right there in the job info, but no one reads it.',
      },
      {
        type: 'match',
        prompt: 'Match each error to how it should be handled.',
        pairs: [
          ['UNABLE_TO_LOCK_ROW', 'Retry in a follow-up job with backoff, sorted by AccountId'],
          ['FIELD_CUSTOM_VALIDATION_EXCEPTION', 'Route to the ERP data owners to fix the data'],
          ['Job state Failed or Aborted', 'Mark the run failed and alert'],
        ],
        explain: 'Lock errors are transient; validation errors are bad data that a retry will not fix; a failed job means the whole run needs attention.',
      },
      {
        type: 'single',
        prompt: 'What is the most urgent first step?',
        options: [
          'Download the failed results for every run since the change, before they are no longer available',
          'Disable the validation rule',
          'Re-run the full sync of 250,000 contacts',
          'Switch to Bulk API 1.0',
        ],
        answer: 0,
        explain: 'Failed results are kept only for a limited time; without them you cannot tell which records failed and why.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'After JobComplete, if numberRecordsFailed > 0, fetch, classify and handle failed results and mark the run PARTIAL',
          'Sort records by AccountId to reduce lock contention',
          'Validate country codes in Mule before sending',
          'Alert on failed record count and reconcile ERP vs Salesforce daily',
          'Re-submit the whole file in a loop until numberRecordsFailed is 0',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Record-level error handling, smarter ordering, early validation and monitoring close the gap. Looping the whole file never ends for validation errors, which no retry can fix.',
      },
    ],
  },
  description: `
## Symptoms
- Every night \`contact-sync\` upserts ~250,000 Contacts from the ERP into Salesforce with **Bulk API 2.0**.
- Sales reps report that new contacts from last week are **missing** in Salesforce, and some address changes never arrived.
- The integration dashboard shows every nightly run as **SUCCESS**. No errors in the Mule logs.

## Change / Context
- The flow creates the Bulk 2.0 ingest job, uploads the CSV, closes it, then polls job info until the state is \`JobComplete\` and logs success.
- Two weeks ago the Salesforce admins added a **validation rule** (Contacts must have a valid country code) and a **Process Builder / Flow** that updates the parent Account when a Contact changes.
- Contacts are sent in ERP order (by contact id), so contacts of the same Account are spread across the file.

## Logs
\`\`\`
02:00:04.551 INFO  [contact-sync] Created Bulk API 2.0 job 7508d00000AbCdE upsert Contact on Ext_Id__c
02:03:10.220 INFO  [contact-sync] Upload complete, job closed (UploadComplete)
02:21:47.090 INFO  [contact-sync] Job 7508d00000AbCdE state=JobComplete
  numberRecordsProcessed=251,880 numberRecordsFailed=6,412
02:21:47.093 INFO  [contact-sync] Contact sync finished successfully
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Explains that JobComplete only means Salesforce finished processing the job; record-level failures are reported separately (numberRecordsFailed=6,412) and the flow ignores them.',
    'Retrieves the failed records (Bulk API 2.0 failed results for the job) and classifies the errors, e.g. validation-rule failures (bad data) vs UNABLE_TO_LOCK_ROW (contention on parent Accounts).',
    'Explains lock contention: contacts of the same Account processed in parallel batches, plus the new automation updating the parent Account, cause row-lock errors.',
    'Immediate: pull failed results for recent jobs, re-submit the retryable failures, and send validation failures to the data owners to fix in the ERP.',
    'Permanent fix: treat numberRecordsFailed > 0 as partial success with failed-results handling (retry transient, report data errors), and sort the file by AccountId to reduce lock contention.',
    'Prevention: alert/dashboard on failed record count, reconciliation counts between ERP and Salesforce, and change notification from Salesforce admins.',
  ],
  solution: `
**Diagnosis.** The job reached **\`JobComplete\`** — which means Salesforce *finished* processing, **not** that every record succeeded. The job info clearly says \`numberRecordsFailed=6,412\`, but the flow only checks the state, so it reports success and the failed records are silently dropped every night. Pulling the job's **failed results** (CSV with \`sf__Error\` per row) will show two main groups:
- **Validation errors** from the new country-code rule (e.g. \`FIELD_CUSTOM_VALIDATION_EXCEPTION\`) — bad data, won't succeed on retry.
- **\`UNABLE_TO_LOCK_ROW\`** — Bulk API processes batches **in parallel**; contacts of the same Account land in different batches, and the new automation updates the **parent Account**, so parallel batches fight for the same Account lock. These are transient.

**Immediate mitigation.**
1. For each run since the change, download the failed results (they are only kept for a limited time — do it now).
2. Re-submit the \`UNABLE_TO_LOCK_ROW\` rows as a new, smaller job (sorted by AccountId).
3. Send the validation failures to the ERP data owners with the record ids and reason; fix and re-sync.
4. Tell sales which contacts were affected and when they'll be fixed.

**Root cause.** The integration treated job state as the outcome and had **no record-level error handling**. A Salesforce change (validation rule + automation on Account) turned a previously clean load into a partial failure nobody saw.

**Permanent fix.**
- After \`JobComplete\`, if \`numberRecordsFailed > 0\`: fetch failed results and **classify** errors. **Retry** transient ones (lock errors) with backoff in a follow-up job. Route data errors to an error report/queue with an owner. Mark the run **PARTIAL**, not SUCCESS. Also handle \`Failed\`/\`Aborted\` job states.
- **Sort by AccountId** (parent) so children of one parent are in the same batch, reducing lock contention.
- Validate data in Mule before sending (e.g. country code) to fail early with clearer messages.

**Prevention.** Dashboard and alert on failed record count/percentage per run; a daily reconciliation (counts or checksums ERP vs Salesforce); an agreement that Salesforce admins announce validation rules/automation changes that affect integration objects, and test them in a sandbox with a full sync.
`,
  followUps: [
    { q: 'Why do UNABLE_TO_LOCK_ROW errors happen with bulk loads?', a: 'Salesforce locks the parent record (and records touched by automation or roll-ups) while updating a child. Parallel batches updating children of the same parent compete for that lock and some time out.' },
    { q: 'Bulk API vs REST/Composite API: when would you use each?', a: 'Bulk for large volumes (tens of thousands+) that can be processed asynchronously; REST/Composite (or sObject collections) for small, near-real-time changes where you need immediate per-record results.' },
    { q: 'What would you put in the post-mortem?', a: 'Impact (number of contacts missing, since when), root cause (state checked instead of record results), contributing factor (unannounced Salesforce changes), detection gap (dashboard showed SUCCESS), and actions: partial-failure handling, alerting on failed counts, reconciliation, change notification.' },
  ],
}
