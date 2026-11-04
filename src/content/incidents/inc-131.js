export default {
  id: 'inc-131',
  category: 'incidents',
  title: 'Settlement Export Runs Twice After a WAN Failure Splits a Mule Cluster Stretched Across Two Data Centres',
  level: 'ADVANCED',
  tags: ['deployment', 'clustering', 'high-availability', 'on-prem', 'scheduler', 'observability'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '01:58:02 WARN  [network] dc-a <-> dc-b WAN link down', relevant: true, why: 'The nodes in each data centre can no longer see the others, which sets up the partition.' },
      { text: '01:58:21 WARN  [mule_ee] mule-a1 member mule-b1 removed from cluster, members=2', relevant: true, why: 'Site A believes site B has gone.' },
      { text: '01:58:22 WARN  [mule_ee] mule-b1 member mule-a1 removed from cluster, members=2', relevant: true, why: 'Site B believes the same about site A. Each side now acts as if it is the whole cluster.' },
      { text: '02:00:00 INFO  [mule-a1] prc-settlement-export scheduler fired, batch=20261103', relevant: true, why: 'A Scheduler only runs on a primary node, so site A has a primary.' },
      { text: '02:00:00 INFO  [mule-b1] prc-settlement-export scheduler fired, batch=20261103', relevant: true, why: 'The same scheduler fires in site B, so two nodes are primary at once.' },
      { text: '02:00:30 INFO  [health] GET /api/health 200 (5 ms)', relevant: false },
      { text: '02:06:40 INFO  [network] dc-a <-> dc-b WAN link up', relevant: false },
      { text: '02:07:12 WARN  [mule_ee] mule-b2 has not rejoined the cluster', relevant: true, why: 'The docs warn that evicted nodes might not rejoin automatically and can need a manual restart.' },
      { text: '02:09:15 INFO  [prc-payment-status] Message P-40881 processed (second delivery after resynchronisation)', relevant: true, why: 'Resynchronisation after a link failure can cause messages to be processed twice.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'A split brain: the WAN failure cut the cluster in two, each side believed it was the sole cluster, and each had its own primary',
          'The cron expression in the scheduler was wrong',
          'Two copies of the app were deployed to site B',
          'The Scheduler runs on every node by default',
        ],
        answer: 0,
        explain: 'Schedulers run only on the primary node. The docs warn that with nodes across a WAN, several nodes can become primary, each believing it is the sole node.',
      },
      {
        type: 'single',
        prompt: 'What do you do first, now that the link is back?',
        options: [
          'Stop further settlement output, tell the bank about the duplicate file, restart the node that has not rejoined, and check cluster membership',
          'Restart all four nodes at the same time to force a clean state',
          'Delete the shared object stores',
          'Leave it, as the cluster resolves itself',
        ],
        answer: 0,
        explain: 'The duplicate file has business impact. Evicted nodes can need a manual restart, but restart one at a time: concurrent restarts can take apps offline.',
      },
      {
        type: 'single',
        prompt: 'Someone proposes enabling quorum on this 2 + 2 cluster. What is the problem with that proposal?',
        options: [
          'Quorum applies only to Object Store operations and can only be configured manually, so it does not fit a cluster created in Runtime Manager',
          'Quorum is not available on Mule 4',
          'Quorum makes all nodes stop if one fails',
          'Quorum needs an external Hazelcast licence',
        ],
        answer: 0,
        explain: 'Quorum has real limits: no distributed locking support, no in-memory messaging such as VM, and the portion with the most nodes continues. To survive a site loss, the docs call for at least three data centres with the same number of nodes.',
      },
      {
        type: 'multi',
        prompt: 'Which long-term changes are sound?',
        options: [
          'Keep each cluster inside one data centre, on the same LAN or subnet, and use a separate cluster per site behind a load balancer',
          'Make the settlement export idempotent, so a repeat for the same batch has no effect',
          'Handle duplicates in application logic wherever a cluster does span sites',
          'Keep one stretched cluster only if latency stays below 10 ms and the side effects are planned for',
          'Rely on Runtime Manager to detect and stop the second primary',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The docs describe no such control by Runtime Manager. With two clusters, each has its own primary, so scheduled work needs a design that gives it one owner.',
      },
    ],
  },
  description: `
## Symptoms
- 02:00: the bank's gateway receives **two settlement files** for the same business date, with the same amounts.
- The operations dashboard shows four nodes again by 02:10, then three: \`mule-b2\` stays out of the cluster.
- A few payment status messages were processed twice shortly after the link recovered.

## Change / Context
- A payments company stretched one Mule cluster across two data centres last year, for DR: two nodes in \`dc-a\` and two in \`dc-b\`.
- The cluster was created in Runtime Manager as unicast. Average latency between sites is 14 ms, and the WAN has two carrier links, which share a duct.
- \`prc-settlement-export\` uses a Scheduler at 02:00 and writes a file to the bank's SFTP server.
- At 01:58 an excavator cut the duct. The WAN was down for about nine minutes.

## Logs
\`\`\`
01:58:02 WARN  [network] dc-a <-> dc-b WAN link down
01:58:21 WARN  [mule_ee] mule-a1 member mule-b1 removed from cluster, members=2
01:58:22 WARN  [mule_ee] mule-b1 member mule-a1 removed from cluster, members=2
02:00:00 INFO  [mule-a1] prc-settlement-export scheduler fired, batch=20261103
02:00:00 INFO  [mule-b1] prc-settlement-export scheduler fired, batch=20261103
02:07:12 WARN  [mule_ee] mule-b2 has not rejoined the cluster
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
    'A Scheduler runs only on the primary node, so two runs in one minute means two primaries.',
    'A WAN between cluster nodes adds points of failure. Nodes can each believe they are the sole node, and several become primary.',
    'Reconnection can cause messages to be processed twice, and Object Store state can become inconsistent.',
    'Evicted nodes might not rejoin automatically and can require a manual restart.',
    'A cluster spanning locations needs latency below 10 ms; the docs advise the same LAN, subnet or availability zone where possible.',
    'Quorum can only be configured manually, applies to Object Store operations, and needs at least three equal sites to survive a site loss.',
    'A separate cluster per site, behind a load balancer, gives active-active service without cross-site cluster traffic.',
    'Scheduled jobs with external effects must be idempotent.',
  ],
  solution: `
**Diagnosis.** Two nodes logged the same scheduler firing at the same second. Since a Scheduler source only runs on the primary polling node, two primaries existed. The membership lines show each side removing the other at 01:58, two minutes before the job. This is the split-brain behaviour that the docs describe for clusters across data centres.

**Immediate mitigation.**
- Tell the bank at once, so that it holds or rejects the second file. Use the batch ID to identify it.
- Pause other outbound batch jobs until membership is confirmed.
- Restart \`mule-b2\`, as evicted nodes can need a manual restart. Restart one node at a time.
- Compare payment status records from 01:58 to 02:10 to find messages processed twice, and check Object Store values written on both sides.

**Root cause.** The cluster was stretched over a WAN, which the docs warn introduces failure points that prevent synchronization. When the link failed, each side continued alone. Each had a primary, so the Scheduler fired twice. On reconnection, synchronization can cause messages to be processed twice. Latency of 14 ms was also above the 10 ms limit for a single cluster spanning locations. The design treated a cluster as a DR tool, whereas it is an HA tool that depends on reliable, fast connectivity.

**Permanent fix.**
- Split the estate: one cluster per data centre, on the same LAN, with a load balancer across them. The HA guide lists this as active-active with load-balanced clustered environments.
- Each cluster now has its own primary, so decide who owns scheduled work. For example, enable the settlement Scheduler in one site only, and make the failover a runbook step or a controlled property change.
- Make the export idempotent: record each batch date in the database, and skip a batch that exists.
- Quorum is not a simple fix. It can only be configured manually (\`mule.cluster.quorumsize\`), so it does not fit a cluster managed in Runtime Manager, and tools must not be mixed. It covers Object Store operations only. The docs describe the portion with the most nodes continuing, but they do not describe an even 2 + 2 split, so do not design on an assumed outcome. And a partition without enough nodes still reacts to external calls, while its Object Store operations fail.

**Prevention.**
- Add alerts for cluster visibility and node connection events.
- Run a link-failure test, not only a node-failure test.
- Put the rule in design standards: clusters stay within one LAN or availability zone unless there is a reviewed exception.
- Check that "diverse" carrier links really take different routes.
`,
  followUps: [
    { q: 'What if the company had three data centres?', a: 'The docs say that to prevent an outage with quorum, you must create the cluster in at least three data centres with the same number of nodes, so one site can be lost. All other quorum limits still apply.' },
    { q: 'Do batch jobs benefit from cluster HA?', a: 'The docs list that batch jobs do not use high availability features. Design restart and duplicate handling for them explicitly.' },
    { q: 'What exception might you see when quorum is no longer met?', a: 'QuorumException for Object Store operations, which the docs tell you to catch. NoDataMemberInClusterException is described as occurring after node loss, split brain or a quorum that is no longer met.' },
  ],
}
