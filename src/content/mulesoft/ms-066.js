export default {
  id: 'ms-066',
  category: 'mulesoft',
  title: 'Polling Oracle for Shipment Confirmations: db:listener Watermark vs Scheduler with a Status Column',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'supply-chain', 'oracle', 'database', 'db-listener', 'watermark', 'polling', 'shipment'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'With `watermarkColumn="SHIPPED_AT"`, the WMS corrects a confirmation that was already sent: it UPDATEs the row\'s PAYLOAD and LOAD_ID but leaves SHIPPED_AT as it was. Does the listener send the correction to the TMS?',
      options: [
        'Yes, the listener spots changed rows by comparing them per idColumn',
        'No, it only selects rows whose SHIPPED_AT is above the stored value',
        'Yes, the update resets the row\'s processed flag in the table',
        'Only if the update commits within the 30 second polling interval',
      ],
      answer: 1,
      explain: 'Mule remembers the highest SHIPPED_AT value it has processed and only picks up rows with a greater value on the next poll. The listener keeps the watermark in an object store and adds a condition on the column; nothing is written back to the table, so there is no processed flag to reset. The idColumn only tracks rows in flight, it does not detect changes. The polling interval plays no part: an updated row with an old SHIPPED_AT is never selected again.',
    },
    {
      type: 'single',
      prompt: 'Some shipments are never sent to the TMS. The WMS inserts rows inside transactions that can take 30 seconds, and SHIPPED_AT is set at the start of the transaction. Why are rows missed?',
      options: [
        'Such rows commit after the poll has already moved past their time',
        'db:listener skips rows inserted inside long transactions',
        'The listener reads only the first 100 rows of each poll',
        'Rows still locked by the WMS make the poll fail and skip them',
      ],
      answer: 0,
      explain: 'A watermark assumes values only grow in commit order. A long transaction commits a row "in the past" relative to rows other sessions committed meanwhile, so the poll already moved beyond it. Sequences have the same problem.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A single-replica app has a `db:listener` with no watermark on a view that shows only rows with STATUS = \'NEW\'. The flow sets STATUS = \'SENT\' at the end. Polls run every 30 s, but a slow TMS call can take 45 s, and some shipments are sent twice. Which change stops a row in flight from being dispatched again?',
      options: [
        'Set primaryNodeOnly="true", so only one poll runs at a time',
        'Poll every 60 s, so each TMS call ends before the next poll',
        'Wrap the TMS call in a transactional Try, so the row stays locked',
        'Set idColumn="SHIPMENT_ID", so rows still in flight are skipped',
      ],
      answer: 3,
      explain: 'The idColumn lets the listener track rows that are in flight, so a row picked up by one poll is not dispatched again while it is still being processed. primaryNodeOnly only matters in a cluster; one replica still runs overlapping polls. A longer interval treats the symptom, as a TMS call can still run longer than the poll. In Oracle a row lock does not block a plain SELECT, so the next poll still reads the row.',
    },
    {
      type: 'multi',
      prompt: 'You replace the listener with Scheduler + select + status column. Which elements make it robust?',
      options: [
        'Select rows WHERE STATUS = \'NEW\', not by timestamp',
        'Mark each row SENT (or ERROR with a reason) after the TMS call',
        'Claim rows with FOR UPDATE SKIP LOCKED or a PROCESSING update',
        'Keep a SHIPPED_AT watermark and move it forward after each poll',
        'Poll every second so rows committed late are picked up sooner',
        'Delete each row from the table once the TMS call returns',
      ],
      answer: [0, 1, 2],
      explain: 'Selecting by status finds late commits. Claiming rows (SELECT ... FOR UPDATE SKIP LOCKED inside a transaction, or UPDATE ... SET STATUS = \'PROCESSING\') stops parallel pollers from taking the same row. A status column is independent of commit order, gives an audit trail and allows retries of ERROR rows. A SHIPPED_AT watermark keeps the old bug: a row committed late has a time already behind the mark. Polling extremely often only adds DB load. Deleting rows from the WMS table loses the audit trail and any chance to retry.',
    },
    {
      type: 'single',
      prompt: 'The app runs on 2 CloudHub 2.0 replicas with **clustering enabled**. What does setting `primaryNodeOnly="true"` on the db:listener achieve?',
      options: [
        'One replica at a time runs the poll, so two replicas do not read the same rows',
        'The primary node polls and splits the rows it finds evenly across both replicas',
        'Both replicas poll, and the primary node keeps one shared watermark for them',
        'The primary node waits for open transactions, so late commits are not missed',
      ],
      answer: 0,
      explain: 'The connector docs say Primary Node Only must be enabled in a cluster to prevent duplicate record processing: the listener runs on one node, and another node takes over if it fails. The source does not split the rows it reads across replicas, and the other replica does not poll at all. It does nothing about late commits, so a watermark still misses a row committed with a value behind the mark. Without clustering each replica is a separate app and polls on its own regardless, which is why the scheduler design also needs row claiming.',
    },
  ],
  description: `
A regional grocery distributor's **WMS** writes a row to the Oracle table \`SHIPMENT_CONFIRMATIONS\` when a truck is loaded. A Mule app must send each confirmation to the **TMS** (to start carrier tracking) and to stores (expected delivery).

\`\`\`sql
SHIPMENT_CONFIRMATIONS (SHIPMENT_ID NUMBER PK, LOAD_ID VARCHAR2(20), STORE_ID VARCHAR2(6),
                        SHIPPED_AT TIMESTAMP, PAYLOAD CLOB)
\`\`\`

The current implementation:
\`\`\`xml
<db:listener config-ref="oracleWms" table="SHIPMENT_CONFIRMATIONS"
             watermarkColumn="SHIPPED_AT" idColumn="SHIPMENT_ID">
  <scheduling-strategy><fixed-frequency frequency="30" timeUnit="SECONDS"/></scheduling-strategy>
</db:listener>
\`\`\`

Problems:
- Each week a few shipments never reach the TMS; stores get trucks they did not expect. The DBA says the WMS sets \`SHIPPED_AT\` at the start of a load transaction that can take 30+ seconds.
- When the TMS is down, failed rows are not retried, because the watermark has already moved.
- The team wants to scale to 2 replicas and is not sure if rows will be processed twice.

**Questions**
1. How does the db:listener use \`watermarkColumn\` and \`idColumn\`?
2. Why are some shipments missed?
3. Design a Scheduler + select + status column alternative, including retries and parallel replicas.
4. When is the db:listener still a good choice?
`,
  answerTemplate: `## How the listener works

## Why rows are missed

## Scheduler + status column design

## When db:listener is fine
`,
  keyPoints: [
    'db:listener polls a table (Table is a required parameter; it takes no custom query); watermarkColumn stores the highest value processed (in an object store) and only newer rows are selected.',
    'idColumn prevents the same row from being processed again while it is still in flight.',
    'Watermarks assume monotonically increasing values in commit order; long transactions, clock skew and sequence caching break that and rows are missed.',
    'A status column (NEW → PROCESSING → SENT/ERROR) selected by a Scheduler is independent of commit order, supports retries and gives an audit trail.',
    'Claim rows atomically (FOR UPDATE SKIP LOCKED or UPDATE ... RETURNING / update by batch ID) so several pollers or replicas never take the same row.',
    'In a Mule cluster, enable primaryNodeOnly on the db:listener so only the primary node polls; without clustering each replica polls independently.',
  ],
  solution: `
**1. Listener.** On every poll the listener runs a select on the table and, with a \`watermarkColumn\`, adds a condition so only rows with a value **greater** than the stored watermark are returned. After processing it stores the new maximum in an object store. \`idColumn\` tracks rows currently being processed so overlapping polls do not dispatch them again.

**2. Missed rows.** Session A starts loading at 10:00:00 and sets \`SHIPPED_AT = 10:00:00\`, but commits at 10:00:35. Session B inserts a row with 10:00:20 and commits at once. The 10:00:30 poll sees B and moves the watermark to 10:00:20. When A commits, its row is **below** the watermark and is never selected. Failed rows can have the same fate: once the watermark has moved past a row that failed in the TMS call, no later poll selects it, and the docs describe no retry for it.

**3. Scheduler + status column.** Add \`STATUS\` (NEW/PROCESSING/SENT/ERROR), \`ATTEMPTS\` and \`LAST_ERROR\`.
\`\`\`xml
<flow name="poll-shipments">
  <scheduler><scheduling-strategy><fixed-frequency frequency="30" timeUnit="SECONDS"/></scheduling-strategy></scheduler>
  <try transactionalAction="ALWAYS_BEGIN">
    <db:select config-ref="oracleWms">
      <db:sql>SELECT shipment_id, load_id, store_id, payload FROM shipment_confirmations
              WHERE status IN ('NEW','ERROR') AND attempts &lt; 5
                AND ROWNUM &lt;= 200
              FOR UPDATE SKIP LOCKED</db:sql>
    </db:select>
    <!-- mark the batch PROCESSING with db:bulk-update, then commit -->
  </try>
  <foreach>
    <!-- call TMS, then UPDATE status = 'SENT' or 'ERROR', attempts = attempts + 1 -->
  </foreach>
</flow>
\`\`\`
- Rows are found by **status**, so late commits are picked up on the next poll.
- \`FOR UPDATE SKIP LOCKED\` in a short transaction lets several replicas poll without taking the same rows (each skips rows locked by another). Commit right after marking PROCESSING so locks are not held during the TMS call; a recovery job resets rows stuck in PROCESSING too long.
- Failed rows become ERROR and are retried up to N attempts, then alerted.
- Make the TMS call idempotent with \`SHIPMENT_ID\` in case a row is sent twice after a crash.

**4. When db:listener is fine.** Append-only tables whose watermark value is assigned at commit time or strictly increasing (e.g. an insert-only log written in short transactions), where you cannot add a status column, and where losing retries is handled elsewhere. It is also handy for prototypes. Alternatives for high volumes are CDC tools (e.g. GoldenGate/Debezium into Kafka) or an outbox table written by the WMS.
`,
  followUps: [
    {
      q: 'Where is the watermark stored and how do you reset it?',
      a: 'In an object store used by the listener, so it survives restarts when persistent. Resetting means clearing that object store entry (or the app object store), which causes rows to be read again, so processing must be idempotent.',
    },
    {
      q: 'Why limit the select to 200 rows, and why ROWNUM rather than FETCH FIRST?',
      a: 'The limit bounds the work per poll, keeps the transaction and locks short, and stops a backlog after an outage from loading everything at once. Oracle does not allow the FETCH FIRST row-limiting clause together with FOR UPDATE, so a ROWNUM condition is the usual workaround (it may return fewer rows when some are skipped as locked).',
    },
    {
      q: 'Could a trigger on the table push events instead of polling?',
      a: 'A trigger could write to an outbox table or Oracle AQ, but it adds logic and latency to the WMS transaction; polling an outbox or using CDC keeps the WMS unaffected.',
    },
  ],
}
