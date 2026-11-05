export default {
  id: 'inc-043',
  category: 'incidents',
  title: 'Watermark Sync Finds Zero Changes After Moving to CloudHub',
  level: 'ADVANCED',
  tags: ['watermark', 'timezones', 'database', 'data-integrity', 'polling'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '09:55:00.012 INFO  [crm-sync] Poll start lastRun=2026-10-14 09:50:00', relevant: false },
      { text: '10:00:00.010 INFO  [crm-sync] Poll start lastRun=2026-10-14 09:55:00', relevant: true, why: 'The watermark is a zone-less string from the CloudHub clock (UTC), about 4 hours ahead of the CRM local time.' },
      { text: '10:00:00.390 INFO  [crm-sync] Selected 0 rows', relevant: true, why: 'Every poll selects nothing with no error: the comparison is against a future watermark.' },
      { text: '10:00:00.391 INFO  [crm-sync] Watermark updated to 2026-10-14 10:00:00', relevant: true, why: 'The watermark is set to now(), not to the max last_modified actually read, so it keeps moving forward past unread data.' },
      { text: 'DB: SELECT max(last_modified) FROM customers -> 2026-10-14 05:58:41', relevant: true, why: 'The CRM writes New York local time; the newest change is ~4 hours behind the watermark, so it will never be selected.' },
      { text: '10:00:30.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '[crm-batch] job price-tier-update started 02:00:00, committed 4,210 rows at 02:07:12 (last_modified=02:00:00)', relevant: true, why: 'Batch jobs stamp their start time but commit later; rows committed after a poll with an earlier timestamp fall behind a now()-based watermark (the historic ~3%).' },
      { text: '10:05:00.008 INFO  [salesforce] Bulk API job limit usage 12%', relevant: false },
    ],
    questions: [
      {
        type: 'match',
        prompt: 'Match each problem to its cause.',
        pairs: [
          ['0 rows since the move to CloudHub', 'Zone-less watermark from a UTC clock compared with New York local timestamps'],
          ['~3% missing before the migration', 'Watermark = now() skips rows committed late with an earlier last_modified'],
          ['No errors in the logs', 'A watermark bug never selects the rows, so each run looks successful'],
        ],
        explain: 'Two independent bugs: an implicit timezone that broke when the server clock changed, and a watermark based on the server clock instead of the data.',
      },
      {
        type: 'single',
        prompt: 'How do you repair the data already missed?',
        options: [
          'Reset the watermark to before the gap and re-sync with upsert by external ID, then confirm with a reconciliation report',
          'Insert the missing customers manually in Salesforce',
          'Delete all customers in Salesforce and do a full insert',
          'Wait: the next polls will catch up automatically',
        ],
        answer: 0,
        explain: 'Upsert by external ID makes re-sending already synced customers harmless; reconciliation proves the gap is closed. The poller will never catch up on its own.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **correct watermark design**?',
        options: [
          'Watermark = max(last_modified) of the rows processed (e.g. the DB listener watermark)',
          'Explicit time zones: store UTC or convert with a known zone such as America/New_York',
          '`>=` with a small overlap window plus idempotent upserts',
          'Set the CloudHub app timezone to New York so now() matches again',
        ],
        answer: [0, 1, 2],
        explain: 'Base the watermark on the data and make zones explicit. Changing the server timezone restores the accident but still loses the late-committed rows.',
      },
      {
        type: 'single',
        prompt: 'Which control would have detected this **silent** loss?',
        options: [
          'Scheduled source-vs-target reconciliation and an alert on "0 rows for hours during business time"',
          'Alerting on ERROR log lines',
          'CPU alerts on the worker',
          'Health check on /health',
        ],
        answer: 0,
        explain: 'The job never errors; only reconciliation or volume alerts reveal data that was never selected.',
      },
    ],
  },
  description: `
## Symptoms
- \`crm-sync\` polls the CRM database every 5 minutes and pushes changed customers to Salesforce.
- Since the app was **migrated from an on-prem server to CloudHub on Monday**, **no** customer changes reach Salesforce. Every poll "succeeds" and selects 0 rows. No errors.
- While investigating, a reconciliation of the last quarter (before the migration) also finds **~3%** of updated customers that never reached Salesforce.

## Change / Context
- The DB Select uses a watermark: \`SELECT ... FROM customers WHERE last_modified > :lastRun\`.
- After each run, the flow stores \`now() as String {format: "yyyy-MM-dd HH:mm:ss"}\` (Mule server time, **no zone**) in Object Store as the new watermark — not the max \`last_modified\` from the result set.
- \`last_modified\` is a **DATETIME without timezone**, written by the CRM in **New York local time (UTC−4 in summer)**. The old on-prem Mule server also ran in New York time; CloudHub runs in **UTC**.
- Some CRM batch jobs commit rows minutes after the time they write into \`last_modified\` (they stamp the job's start time).

## Logs
\`\`\`
10:00:00.010 INFO  [crm-sync] Poll start lastRun=2026-10-14 09:55:00
10:00:00.390 INFO  [crm-sync] Selected 0 rows
10:00:00.391 INFO  [crm-sync] Watermark updated to 2026-10-14 10:00:00
# DB at the same moment
SELECT max(last_modified) FROM customers -> 2026-10-14 05:58:41
\`\`\`

## Your tasks
1. Explain both problems: why nothing is selected since Monday, and why ~3% went missing before.
2. How do you repair the data already missed?
3. What is the correct watermark design?
4. How do you prevent silent data loss?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Timezone mismatch: the zone-less watermark is now written in UTC but compared with New York local timestamps, so it is always ~4 hours ahead of the data and selects nothing.',
    'Using now() as the watermark also skips rows committed late with an earlier last_modified — the cause of the historic ~3% loss; the watermark must be the max value actually read.',
    'Repair: reset the watermark and re-sync a safe window idempotently (upsert by external ID), then verify with reconciliation.',
    'Fix: explicit time zones (store UTC or convert with a known zone), watermark = max(last_modified) processed, >= with a small overlap plus idempotent processing.',
    'Prevention: scheduled source-vs-target reconciliation with alerts; "0 rows, no errors" for hours during business time should alert.',
  ],
  solution: `
## Diagnosis
Two independent problems:
1. **Timezone mismatch (since Monday).** The watermark is a string with **no zone** built from \`now()\`. On-prem, the server clock was New York time, the same as the CRM, so it worked by accident. On CloudHub the clock is **UTC**, so the stored watermark (10:00) is ~4 hours **ahead** of the CRM's local timestamps (latest 05:58). \`last_modified > '09:55'\` matches nothing, the watermark moves forward again, and every change is skipped permanently.
2. **Watermark = \`now()\` (the old 3%).** Even with matching clocks, the flow advances the watermark to the time of the poll, not to the data it read. Rows committed **after** the poll but stamped with an **earlier** \`last_modified\` (batch jobs stamp their start time) fall behind the watermark and are never selected. No error — just missing data.

## Immediate mitigation
Hotfix the watermark (see below). Reset it to a point before Monday's migration (and, for the old gap, before the reconciliation period). Re-sync to Salesforce using **upsert by external ID** so re-sending already synced customers is harmless. Confirm with a reconciliation report (counts per day) that the gap is closed.

## Root cause
A watermark based on the integration server's clock instead of the source data, plus an implicit timezone assumption in zone-less values that broke when the runtime's default timezone changed.

## Permanent fix
- Watermark = **max(last_modified)** of the rows processed (the DB listener's built-in watermark does this, or store it yourself).
- Make time zones explicit: have the CRM store UTC, or convert in DataWeave/SQL with a known zone (e.g. treat values as \`America/New_York\`) — never rely on the server's default timezone.
- Use \`>=\` with a small overlap window and idempotent upserts so boundary and late rows aren't lost.
- Longer term: CDC or an outbox/event from the CRM instead of timestamp polling.

## Prevention
- Scheduled reconciliation between source and target with alerting on mismatches.
- Alert when a poller returns 0 rows for an unusually long time during business hours.
- Migration checklist item: anything depending on server timezone/locale.
`,
  followUps: [
    { q: 'Why is "no errors in the logs" not reassuring for a sync job?', a: 'Watermark bugs lose data by never selecting it, which looks like a quiet successful run; only reconciliation between source and target (or volume alerts) reveals it.' },
    { q: 'How does the Mule DB listener watermark work?', a: 'You specify a watermark column; the listener remembers the highest value it processed (in an object store) and only returns rows greater than it on the next poll.' },
    { q: 'Why use >= with overlap instead of >?', a: 'Several rows can share the same timestamp or commit slightly later; overlapping and upserting is safer than risking a missed row on the boundary.' },
  ],
}
