export default {
  id: 'inc-130',
  category: 'incidents',
  title: 'Duplicate Orders After Weekend Patching: A Persistent Object Store Comes Back Empty on a Mule Cluster',
  level: 'ADVANCED',
  tags: ['deployment', 'clustering', 'object-store', 'on-prem', 'idempotency', 'environments'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: 'Sat 23:02:11 INFO  [change-4471] stopping Mule on mule-prd-01, mule-prd-02, mule-prd-03 for OS patching', relevant: true, why: 'Every node of the cluster was stopped, which is the event that empties the shared grid.' },
      { text: 'Sat 23:58:40 INFO  [mule_ee] mule-prd-01 Started app \'prc-partner-orders\'', relevant: false },
      { text: 'Sun 00:00:03 INFO  [mule_ee] cluster formed, members=3', relevant: false },
      { text: 'Mon 06:00:14 INFO  [prc-partner-orders] Partner PO-77120 received from retry feed, status=ACCEPTED', relevant: true, why: 'The order was already handled on Friday. Acceptance shows that the validator no longer knows this ID.' },
      { text: 'Mon 06:00:15 INFO  [sys-erp-orders] Sales order 5001883 created for PO-77120', relevant: true, why: 'The duplicate has reached SAP, so this has business impact.' },
      { text: 'Mon 06:04:51 INFO  [prc-partner-orders] Partner PO-77121 rejected: DUPLICATE_MESSAGE (received twice today)', relevant: true, why: 'Validation works for IDs seen since the restart, so the validator is healthy but its earlier data is gone.' },
      { text: 'Mon 06:05:02 INFO  [health] GET /api/health 200 (4 ms)', relevant: false },
      { text: 'Mon 06:11:37 INFO  [config] os:object-store name="seenOrders" persistent="true" entryTtl=7 DAYS', relevant: true, why: 'The app asked for persistence and a seven-day TTL, so neither a code change nor TTL expiry explains the loss.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'All cluster nodes were stopped. Without a centralized JDBC store, object store content is lost, whatever the `persistent` setting says',
          'The TTL of seven days expired over the weekend',
          'The idempotent validator does not work in a cluster',
          'SAP lost its duplicate check during patching',
        ],
        answer: 0,
        explain: 'In a cluster, object store content lives in the distributed memory grid, even when `persistent` is true. It survives app redeploys and restarts while the cluster stays up, but not a stop of every node.',
      },
      {
        type: 'single',
        prompt: 'What do you do first?',
        options: [
          'Pause the partner retry feed, so no more old IDs pass the empty store, and list the orders created since the restart',
          'Restart the cluster again to reload the store',
          'Set the validator to reject all messages until Friday',
          'Delete all orders created today in SAP',
        ],
        answer: 0,
        explain: 'Stop the damage first. A restart cannot bring data back, and blanket deletion would remove valid orders.',
      },
      {
        type: 'multi',
        prompt: 'Which permanent changes are sound?',
        options: [
          'Configure a centralized JDBC store for cluster object store persistence',
          'Restart nodes one at a time during OS patching, rather than stopping all of them together',
          'Add a business-level uniqueness check on the partner order number in the target system',
          'Point several clusters at the same object store database to share the seen IDs',
          'Rely on `persistent="true"`, and raise the TTL',
        ],
        answer: [0, 1, 2],
        explain: 'Object Store persistence does not support sharing one database across different clusters. A longer TTL does not help, as the content is lost by the shutdown and not by expiry.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Pause the retry feed',
          'Confirm from the change record that all nodes were stopped',
          'List orders processed since the restart and match them with earlier orders',
          'Reverse duplicates with the business, then resume the feed with checks in place',
          'Introduce a JDBC store and test a full-cluster stop in a lower environment',
          'Update the patching runbook',
        ],
        explain: 'Contain, confirm, repair, and only then change the design.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 06:00: partner \`NorthWay\` sends its usual retry feed, which repeats the last five days of purchase orders.
- By 06:30, the SAP team reports **about 900 duplicate sales orders**.
- \`prc-partner-orders\` has not been released for three weeks. It has always rejected these repeats.
- Repeats of orders first seen since Sunday are still rejected correctly.

## Change / Context
- Mule 4 cluster of three on-premises nodes.
- The app uses an idempotent message validator with an Object Store named \`seenOrders\`, with \`persistent="true"\` and a seven-day TTL.
- No JDBC store is configured for the cluster.
- On Saturday night the infrastructure team stopped **all three nodes** to apply OS patches, then started them again. Apps came back without errors.

## Logs
\`\`\`
Sat 23:02:11 INFO  [change-4471] stopping Mule on mule-prd-01, -02, -03
Sun 00:00:03 INFO  [mule_ee] cluster formed, members=3
Mon 06:00:14 INFO  [prc-partner-orders] PO-77120 received from retry feed, ACCEPTED
Mon 06:00:15 INFO  [sys-erp-orders] Sales order 5001883 created for PO-77120
Mon 06:04:51 INFO  [prc-partner-orders] PO-77121 rejected: DUPLICATE_MESSAGE
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
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
    'In a cluster, object store content, in-memory and persistent, is stored in the distributed memory grid.',
    'The data survives app redeploys and restarts while the cluster keeps quorum.',
    'Shutting down all cluster nodes loses the content unless a centralized JDBC store is configured, regardless of the persistent setting.',
    'The validator itself is healthy: new IDs are tracked correctly after the restart.',
    'Contain first, by pausing the feed. A restart cannot recover lost entries.',
    'Do not restart several nodes at once during OS patching; this can also take apps offline.',
    'Do not share one object store database between different clusters.',
    'Keep state in an external store where possible, and add a business uniqueness check in the system of record.',
  ],
  solution: `
**Diagnosis.** The app did not change, so look at what did: all three nodes were stopped on Saturday. Old IDs pass, and IDs seen since Sunday are rejected. That pattern means the validator works but has forgotten everything from before the restart. TTL does not explain it, because Friday's entries are well within seven days.

**Immediate mitigation.**
- Pause the retry feed or stop the consuming flow.
- Extract orders processed since Saturday and match them with SAP by partner order number.
- Work with the SAP team and the business to cancel the duplicates. Do not delete in bulk without checking.
- Before restarting the feed, pre-load \`seenOrders\` with the last seven days of order IDs from SAP or a report. Or ask the partner to hold the repeats until the entries are rebuilt.

**Root cause.** The on-premises cluster docs state that persistent object stores are not shared across a full cluster shutdown unless you configure a centralized JDBC store. The in-grid copy does not survive stopping every node, even when \`persistent\` is true. The team read \`persistent="true"\` as "written to durable storage", which is not how a cluster behaves. The docs also say that all nodes must be stopped to clear the store, so the change did exactly that.

**Permanent fix.**
- Configure a centralized JDBC store that all nodes can reach. The manual cluster page lists MySQL 5.5+, PostgreSQL 9 and Microsoft SQL Server 2014, 2019 and 2022. The values go in \`{MULE_HOME}/.mule/mule-cluster.properties\`, and the Runtime Manager docs say to create the cluster manually for Object Store persistence.
- Do not share that database between clusters, as this is not supported.
- Add a business-level uniqueness rule on the partner order number, so an empty store cannot cause duplicates in SAP.

**Prevention.**
- Change the patching runbook: nodes one at a time, never all together. The HA guide warns that concurrent restarts can trigger eviction and take apps offline.
- If a full stop is unavoidable, list the apps that hold state in advance.
- Include a full-cluster stop in failover tests.
- Review all apps that use Object Store, idempotency or Scheduler watermarks for the same assumption.
`,
  followUps: [
    { q: 'Would a redeploy of the app have caused this?', a: 'No. As long as the cluster maintains quorum, the data survives application redeploys or restarts. The loss comes from stopping all the nodes.' },
    { q: 'Does the same apply to VM queues?', a: 'VM queues also use the shared grid. The docs advise the JMS connector for apps where data needs to be saved after the entire cluster exits.' },
    { q: 'How would this differ on a single non-clustered runtime?', a: 'This failure is specific to the cluster grid described in the docs. Check the behaviour for your own topology, and do not carry the rule over without testing.' },
  ],
}
