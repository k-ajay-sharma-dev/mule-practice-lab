export default {
  id: 'ms-019',
  category: 'mulesoft',
  title: 'Salesforce Connector: Query vs QueryAll, Upsert and Bulk API',
  level: 'ADVANCED',
  tags: ['salesforce', 'bulk-api', 'upsert', 'soql', 'api-limits'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you replace "create, then update on duplicate failure" for the nightly Account load?',
      options: [
        'Mark `ERP_Account_Number__c` as an External ID and use upsert with `externalIdFieldName`',
        'Query each Account by name first, then create or update',
        'Delete all Accounts and recreate them nightly',
        'Use `update` only — it creates missing records automatically',
      ],
      answer: 0,
      explain: 'Upsert on an External ID matches and inserts-or-updates in one idempotent call; reruns do not create duplicates.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which API fits the nightly load of ~2 million records?',
      options: [
        'Bulk API v2 — asynchronous jobs designed for large volumes, far fewer API calls',
        'SOAP upsert, one record per call',
        'SOAP upsert with 2,000 records per call',
        'The REST query API',
      ],
      answer: 0,
      explain: 'SOAP create/update/upsert accept at most **200** records per call (≈10,000 calls for 2M). Bulk API v2 processes the data in the background; Mule polls the job and fetches successful/failed results.',
    },
    {
      type: 'single',
      prompt: 'Some records fail but the flow "succeeds". Why?',
      options: [
        'Salesforce returns per-record results; record-level errors do not make the operation fail',
        'The connector swallows all errors by default',
        'On Error Continue is the default handler',
        'Salesforce retries failed records later automatically',
      ],
      answer: 0,
      explain: 'Inspect each result (success flag + errors) — or the Bulk job failed results — and route failures somewhere visible, or raise a custom error.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The hourly sync must also send **deleted** Accounts. Which operation do you use?',
      options: [
        '`queryAll`, which also returns deleted (IsDeleted = true) and archived records',
        '`query` with `WHERE IsDeleted = true`',
        '`query` — it returns deleted records by default',
        '`retrieve` by ID',
      ],
      answer: 0,
      explain: '`query` skips deleted and archived records. `queryAll` includes those still in the recycle bin, so the sync must run within its retention period.',
    },
    {
      type: 'multi',
      prompt: 'A Mule app syncs accounts with Salesforce one record per call, and the org is close to its daily API request limit. Which three changes reduce the number of API calls?',
      options: [
        'Use the Bulk API for large volumes',
        'Send batches of records per SOAP call, not one at a time',
        'Use Change Data Capture in place of hourly polling',
        'Describe the object metadata before every record',
        'Create each record, then update it if the create fails as a duplicate',
      ],
      answer: [0, 1, 2],
      explain: 'The Bulk API, up to 200 records per SOAP call and Change Data Capture all mean fewer calls. Querying only the fields you need also helps. Describing metadata on every record burns calls, so cache reference data instead. Create then update spends extra calls where one upsert would do.',
    },
  ],
  description: `
You integrate an ERP with **Salesforce Sales Cloud** using the Mule 4 Salesforce connector:

- **Nightly load:** ~**2 million** Account records from the ERP must be created or updated in Salesforce. The ERP key is \`ERP_Account_Number\`.
- **Hourly sync back:** Accounts changed in Salesforce must be sent to the ERP — including **deleted** accounts, so the ERP can deactivate them.
- The Salesforce org is shared with other integrations and has been close to its **daily API request limit**.

A first version uses For Each + \`create\`, then \`update\` when create fails with a duplicate, one record per call. It takes all night, burns API calls, and some failures go unnoticed because the flow "succeeded".

**Questions**
1. How do you avoid "create, then update on failure"? What must exist in Salesforce?
2. SOAP-based upsert vs Bulk API (v2): when do you use which here, and how does each behave?
3. Why do failures go unnoticed even though the flow succeeds?
4. Query vs queryAll — which one do you use for the hourly sync, and how do you detect changes?
5. Name at least three things that reduce API limit consumption.
`,
  answerTemplate: `## Upsert on external ID

## SOAP upsert vs Bulk API

## Hidden failures

## Query vs queryAll

## Saving API calls
`,
  keyPoints: [
    'Mark ERP_Account_Number__c as an External ID (ideally unique) and use upsert with externalIdFieldName — one idempotent call creates or updates.',
    'SOAP-based create/update/upsert accept up to 200 records per call; Bulk API (v2) is asynchronous and designed for very large volumes like 2M records.',
    'Salesforce returns per-record results (success flag + errors); the operation itself does not fail for record-level errors, so you must inspect the results.',
    'query skips deleted and archived records; queryAll includes them (IsDeleted = true), so it is needed to capture deletions (within the recycle bin retention).',
    'Detect changes with SystemModstamp/LastModifiedDate > watermark, or event-driven Change Data Capture via the connector\'s Replay Channel Listener.',
    'Save API calls: Bulk API, batching 200 per SOAP call, selecting only needed fields, CDC instead of polling.',
  ],
  solution: `
**Upsert on external ID:** create a custom field \`ERP_Account_Number__c\` marked **External ID** (and Unique). Then use **upsert** with \`objectType="Account"\` and \`externalIdFieldName="ERP_Account_Number__c"\`: Salesforce matches on that field and inserts or updates in one call. It's idempotent — reruns don't create duplicates. Lookups to parents can also use external IDs, so you don't need to query Salesforce IDs first.

**SOAP upsert vs Bulk API**
- **SOAP upsert** (synchronous): up to **200 records per call**. 2M records ≈ 10,000 calls — workable but heavy on API limits and slow. Good for near-real-time, small batches.
- **Bulk API v2** (asynchronous): create a job with *Create Job Bulk Api V2* (operation upsert + external ID), which takes the CSV data as its sObjects parameter; Salesforce splits and processes it in the background. Mule must then **poll the job status** and fetch **successful/failed results**. Best for the nightly 2M load — far fewer API calls.
- Bulk jobs can hit **record locking** on parent records (many children of the same Account); ordering data by parent reduces it. Serial mode is a Bulk API v1 option, so verify it before relying on it with v2.

**Hidden failures:** Salesforce returns **per-record results** — each with a success flag, ID, and errors. A partially failed upsert is still a successful *operation*, so Mule doesn't raise an error. After each call (or from the Bulk job's failed results), filter the failures in DataWeave and route them to an error file/queue/table. Or raise a custom error if the business requires it.

**Query vs queryAll:** \`query\` returns only active records. \`queryAll\` also returns **deleted** (in recycle bin, \`IsDeleted = true\`) and **archived** records — required to propagate deletions. The connector reference now marks the Query operation as deprecated in favour of **Query Xml Stream**, so use that for new work; the active-records difference from \`queryAll\` is the point here:
\`\`\`sql
SELECT Id, ERP_Account_Number__c, Name, IsDeleted, SystemModstamp
FROM Account WHERE SystemModstamp > :lastRun
\`\`\`
Store \`lastRun\` (the max \`SystemModstamp\` processed) in a persistent Object Store. Deleted records are purged from the recycle bin after its retention period, so the sync must run often. **Better:** subscribe to **Change Data Capture** (\`AccountChangeEvent\`) with the connector's Replay Channel Listener — it delivers create/update/delete events with a replay ID, no polling.

**Saving API calls**
- Bulk API for large volumes; 200 records per SOAP call, never one.
- Query only the fields you need, and use relationship queries instead of N+1 lookups.
- CDC/Platform Events instead of hourly polling.
- Cache reference data (record types, picklists) instead of describing it on every run.
- Use a dedicated integration user and monitor limits (e.g. the limits REST resource) to alert before exhaustion.
`,
  followUps: [
    {
      q: 'What happens if two ERP rows share the same external ID in one upsert batch?',
      a: 'Salesforce reports an error for the duplicated records in that batch. De-duplicate in DataWeave before sending (e.g. groupBy the key and keep the latest).',
    },
    {
      q: 'How do you replay CDC events after the Mule app was down for an hour?',
      a: 'Persist the last processed replay ID and start the subscription from it; events are retained only for a limited window, after which you must fall back to a full or queryAll-based resync.',
    },
    {
      q: 'Bulk API v1 vs v2?',
      a: 'v2 simplifies the flow — you upload data to a job and Salesforce manages batching — while v1 requires you to create and manage batches yourself. v1 still exists for features like explicit batch control.',
    },
  ],
}
