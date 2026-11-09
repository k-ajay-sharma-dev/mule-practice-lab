import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-115',
  category: 'use-cases',
  title: 'Change Data Capture from a Vendor Policy Database to Salesforce and Search',
  level: 'ADVANCED',
  tags: ['cdc', 'kafka', 'sql-server', 'salesforce', 'event-driven', 'reconciliation'],
  estMinutes: 40,
  diagram: {
    task: 'draw the CDC pipeline: the vendor policy database, the CDC connector, the Kafka change topics, the Mule consumer that builds the policy and updates Salesforce through a System API (reading full policies from a replica through a System API), the search and warehouse sinks, the dead-letter topic, and the reconciliation job.',
    checks: [
      { label: 'Changes flow from the policy database into Kafka', rule: { type: 'path', from: { type: ['sql-server', 'database'], label: 'policy admin' }, to: 'event-stream' } },
      { label: 'No integration queries the vendor primary database', rule: { type: 'no-edge', from: ['process-api', 'system-api', 'batch-job', 'experience-api'], to: { type: ['sql-server', 'database'], label: 'policy admin' } } },
      { label: 'Every line into or out of Kafka is async', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
      { label: 'Mule consumes the change topics', rule: { type: 'edge', from: 'event-stream', to: 'process-api', kind: 'async' } },
      { label: 'Full policies are read from the replica only through a System API', rule: { type: 'only-via', target: { type: ['sql-server', 'database'], label: 'replica' }, from: 'system-api' } },
      { label: 'Salesforce is updated only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Search and the warehouse are fed from the same change stream', rule: { type: 'path', from: 'event-stream', to: ['saas', 'data-warehouse'], min: 2 } },
      { label: 'Failed Salesforce updates are parked in a dead-letter topic', rule: { type: 'path', from: 'process-api', to: 'dlq' } },
      { label: 'A reconciliation job compares Salesforce with the source', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
    ],
    reference: diagram(
      {
        pas: ['sql-server', 'Policy admin DB (SQL Server 2019, CDC on)'],
        dbz: ['process-api', 'Debezium CDC connector (Kafka Connect)'],
        k: ['event-stream', 'Kafka cdc.policy.* (key policyId)'],
        agg: ['process-api', 'prc-policy-change-sync'],
        sread: ['system-api', 'sys-policy-read-api'],
        rep: ['sql-server', 'Policy DB read replica'],
        ssf: ['system-api', 'sys-salesforce-policy-api'],
        sf: ['crm', 'Salesforce Financial Services Cloud'],
        srch: ['saas', 'Search index (sink connector)'],
        dw: ['data-warehouse', 'Data warehouse (sink connector)'],
        dlq: ['dlq', 'cdc.policy.sync.DLT'],
        recon: ['batch-job', 'Nightly reconciliation'],
      },
      [
        'pas ~> dbz', 'dbz ~> k', 'k ~> agg', 'agg -> sread', 'sread -> rep', 'agg -> ssf', 'ssf -> sf', 'k ~> srch', 'k ~> dw', 'agg ~> dlq',
        'recon -> sread', 'recon -> ssf',
      ],
    ),
  },
  description: `
An insurer runs a **vendor policy administration system** on **SQL Server 2019**. The vendor does not allow code changes or triggers, and its own API has no events. Today a Mule job polls a \`last_modified\` column every 15 minutes.

Problems with polling:
- Some tables (coverages, beneficiaries) have **no reliable \`last_modified\`**, so changes are missed.
- Deletes are never seen.
- Each poll runs a heavy query on the production database at peak hours.

Targets:
- **Salesforce Financial Services Cloud** must show policy changes within **1 minute** (agents see them while on the phone).
- A **search index** for the call centre and the **data warehouse** need every change too.

Facts:
- About 2 million policies, **150,000 row changes per day**, peaks of 50 per second during the nightly renewal batch.
- A policy is spread over 9 tables. One business change often touches 4 or 5 of them in one transaction.
- The DBA team agrees to enable **SQL Server CDC** and allows a read replica (Always On secondary).
- Salesforce API limit: 1 million calls per 24 hours shared with other integrations.

**Describe your solution:**
- How are changes captured and published?
- How do you turn row changes from 9 tables into one Salesforce update per policy?
- How do you do the initial load, and what about schema changes from vendor upgrades?
- How do you know nothing was missed?
`,
  answerTemplate: `## Capture

## Topics and keys

## Building the policy update

## Initial load and schema changes

## Errors and reconciliation
`,
  keyPoints: [
    'SQL Server CDC reads the transaction log, so it sees every insert, update and delete without triggers or code changes, and with little load on the database.',
    'A Debezium connector on Kafka Connect publishes one topic per table, keyed by policyId (or the row key mapped to it), so changes of one policy stay in order.',
    'Mule does not merge raw rows: it treats a change as "policy X changed", waits a short window to collect the 4 or 5 rows of one transaction, then reads the full policy from the replica.',
    'The Salesforce update is an upsert by external ID, so replays and repeated changes are safe and cost one call per policy per window.',
    'The initial load uses the connector snapshot (or a bulk load) before streaming starts; vendor schema changes are handled with a schema registry and compatibility rules.',
    'A nightly job compares counts and checksums between the replica and Salesforce, and fixes differences.',
  ],
  solution: `
\`\`\`
 Policy admin DB (CDC) ~> Debezium connector ~> Kafka cdc.policy.<table> (key policyId)
   Kafka ~> prc-policy-change-sync -> sys-policy-read-api -> read replica
                                   -> sys-salesforce-policy-api -> Salesforce FSC
                                   ~> DLT
   Kafka ~> search sink, warehouse sink
 nightly reconciliation -> replica, Salesforce
\`\`\`

**Capture.** Enable SQL Server CDC on the 9 tables. **Debezium** (Kafka Connect) reads the change tables and publishes each insert, update and delete with before and after images and the transaction ID. Mule does not poll the vendor database any more. The Mule Database connector could read CDC tables too, but Debezium already handles offsets, snapshots and restarts.

**Topics and keys.** One topic per table, keyed by \`policyId\` (child tables are keyed by their policy, using a message transform). All changes of one policy then land in one partition per topic and are read in order.

**Building the policy update.** A change to 5 rows must not become 5 Salesforce calls with half-updated data. prc-policy-change-sync:
1. consumes all \`cdc.policy.*\` topics and collects policy IDs for a 10 second window (Object Store or an in-flow batch);
2. for each policy reads the **current full policy** from the read replica through sys-policy-read-api;
3. maps it and **upserts** in Salesforce by \`Policy_Number__c\` using a composite request (up to 25 policies per call).
At 150,000 rows per day this is about 40,000 policy updates and under 2,000 composite calls, well inside the API limit.

**Initial load and schema changes.** Debezium takes a consistent **snapshot** first, then streams from the log position it recorded. For 2 million policies, the Salesforce side is loaded with Bulk API 2.0 from the snapshot. Vendor upgrades add or rename columns: register schemas in a schema registry with backward compatibility, and test the upgrade in a lower environment with CDC on. SQL Server needs a new capture instance after a column change.

**Errors and reconciliation.** A policy that fails mapping or Salesforce validation goes to \`cdc.policy.sync.DLT\` after 3 retries. The search and warehouse sinks are independent consumer groups and do not wait for Salesforce. Every night a job compares policy counts and a checksum of key fields per product between the replica and Salesforce, and re-queues any difference.
`,
  followUps: [
    { q: 'What does log-based CDC give you that polling a last_modified column does not?', a: 'It sees deletes and changes in tables without timestamps. It reads the log, so it adds no heavy queries on the production tables.' },
    { q: 'Why read the full policy from the replica instead of merging change events in Mule?', a: 'Rebuilding a 9 table policy from partial row events is complex and fragile. Reading the committed state after a short window gives one consistent update.' },
    { q: 'What happens if the CDC connector is down for a few hours?', a: 'It resumes from its stored log position, as long as the CDC cleanup job has not removed those changes. Set CDC retention longer than the longest expected outage.' },
    { q: 'Why upsert by external ID in Salesforce?', a: 'Changes can be replayed after a failure. An upsert by policy number updates the same record instead of creating duplicates.' },
  ],
}
