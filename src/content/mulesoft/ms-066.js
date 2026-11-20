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
      prompt: 'What does `watermarkColumn="SHIPPED_AT"` on a `db:listener` do?',
      options: [
        'Mule stores the highest value seen and selects only newer rows',
        'Oracle marks rows as processed by updating SHIPPED_AT',
        'It sorts each poll\'s result set by SHIPPED_AT',
        'It deletes rows older than the watermark after each poll',
      ],
      answer: 0,
      explain: 'Mule remembers the highest SHIPPED_AT value it has processed and only picks up rows with a greater value on the next poll. The listener keeps the watermark in an object store and adds a condition on the column; nothing is written back to the table.',
    },
    {
      type: 'single',
      prompt: 'Some shipments are never sent to the TMS. The WMS inserts rows inside transactions that can take 30 seconds, and SHIPPED_AT is set at the start of the transaction. Why are rows missed?',
      options: [
        'A late commit can carry a SHIPPED_AT below the stored watermark',
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
      prompt: 'What is the `idColumn` of the db:listener for?',
      options: [
        'To skip rows that are still being processed by an earlier poll',
        'To define the primary key of the table for inserts',
        'To set which column the watermark is taken from',
        'To split rows across cluster nodes by key',
      ],
      answer: 0,
      explain: 'The idColumn lets the listener track rows that are in flight, so a row picked up by one poll is not dispatched again while it is still being processed.',
    },
    {
      type: 'multi',
      prompt: 'You replace the listener with Scheduler + select + status column. Which elements make it robust?',
      options: [
        'Select rows WHERE STATUS = \'NEW\', not by timestamp',
        'Mark each row SENT (or ERROR with a reason) after the TMS call',
        'Claim rows with FOR UPDATE SKIP LOCKED or a PROCESSING update',
        'Poll every 1 ms so rows are picked up as soon as possible',
      ],
      answer: [0, 1, 2],
      explain: 'Selecting by status finds late commits. Claiming rows (SELECT ... FOR UPDATE SKIP LOCKED inside a transaction, or UPDATE ... SET STATUS = \'PROCESSING\') stops parallel pollers from taking the same row. A status column is independent of commit order, gives an audit trail and allows retries of ERROR rows. Polling extremely often only adds DB load.',
    },
    {
      type: 'single',
      prompt: 'The app runs on 2 CloudHub 2.0 replicas with **clustering enabled**. What does setting `primaryNodeOnly="true"` on the db:listener achieve?',
      options: [
        'Only the primary node polls, so rows are not taken twice',
        'Each replica polls, but rows are split evenly between them',
        'The listener does not start at all in a cluster',
        'It makes the watermark safe against late commits',
      ],
      answer: 0,
      explain: 'The connector docs say Primary Node Only must be enabled in a cluster to prevent duplicate record processing. Without clustering each replica is a separate app and polls on its own regardless, which is why the scheduler design also needs row claiming.',
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
