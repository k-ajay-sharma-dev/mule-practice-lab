import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-117',
  category: 'architecture',
  title: 'Runtime Fabric Across Two Regions: Cold, Warm and Hot Standby, What a Backup Really Covers and Where State Must Live',
  level: 'EXPERT',
  tags: ['deployment', 'runtime-fabric', 'disaster-recovery', 'high-availability', 'kubernetes', 'rpo-rto', 'environments'],
  estMinutes: 60,
  diagram: {
    task: 'draw a Runtime Fabric estate in two regions, with clients entering through a global load balancer (put "global" in its name) that reaches a separate ingress load balancer in each region, an API-led stack in each region with the ERP reached only through System APIs, state kept in an external replicated database, and scheduled backups written to storage outside the cluster.',
    checks: [
      { label: 'Every client enters through a load balancer', rule: { type: 'each', of: ['web-app', 'partner', 'mobile-app', 'internal-app'], edgeTo: 'load-balancer' } },
      { label: 'A global load balancer plus an ingress in each region', rule: { type: 'node', match: 'load-balancer', min: 3 } },
      { label: 'Two regions: at least two Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Every Experience API sits behind a load balancer or ingress', rule: { type: 'each', of: 'experience-api', edgeFrom: 'load-balancer' } },
      { label: 'Each Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: ['erp', 'legacy'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Both regions keep business state in an external database', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['database', 'sql-server', 'oracle-db'], min: 2 } },
      { label: 'A scheduled job writes backups outside the cluster', rule: { type: 'edge', from: 'batch-job', to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'The global load balancer routes to the ingress in each region', rule: { type: 'edge', from: { type: 'load-balancer', label: ['global', 'glb', 'route 53', 'dns'] }, to: 'load-balancer', min: 2 } },
      { label: 'Two regions: at least two Process APIs', rule: { type: 'node', match: 'process-api', min: 2 } },
      { label: 'Two regions: at least two System APIs', rule: { type: 'node', match: 'system-api', min: 2 } },
      { label: 'Every Process API calls a System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'legacy'] } },
      { label: 'Load balancers forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: 'load-balancer', kind: 'sync' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['experience-api', 'process-api'], to: ['process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'sql-server', 'oracle-db'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer portal'],
        partner: ['partner', 'Broker partners'],
        glb: ['load-balancer', 'Global load balancer (your own)'],
        ingA: ['load-balancer', 'Region A ingress'],
        ingB: ['load-balancer', 'Region B ingress'],
        expA: ['experience-api', 'exp-claims (region A fabric)', { replicas: 2, vCores: '0.2' }],
        expB: ['experience-api', 'exp-claims (region B fabric)', { replicas: 2, vCores: '0.2' }],
        prcA: ['process-api', 'prc-claims (region A fabric)', { replicas: 2, vCores: '0.2' }],
        prcB: ['process-api', 'prc-claims (region B fabric)', { replicas: 2, vCores: '0.2' }],
        sysA: ['system-api', 'sys-policy (region A fabric)', { replicas: 2, vCores: '0.2' }],
        sysB: ['system-api', 'sys-policy (region B fabric)', { replicas: 2, vCores: '0.2' }],
        erp: ['erp', 'Policy administration ERP'],
        db: ['database', 'Replicated claims database'],
        job: ['batch-job', 'rtfctl backup, hourly'],
        store: ['file-store', 'External backup storage'],
        mon: ['monitoring', 'Anypoint Monitoring and log platform'],
      },
      [
        'web -> glb', 'partner -> glb', 'glb -> ingA', 'glb -> ingB', 'ingA -> expA', 'ingB -> expB',
        'expA -> prcA', 'expB -> prcB', 'prcA -> sysA', 'prcB -> sysB', 'sysA -> erp', 'sysB -> erp',
        'prcA -> db', 'prcB -> db', 'job -> store', 'prcA -> mon', 'prcB -> mon',
      ],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 400 },
        { match: 'database', latencyMs: 50 },
      ],
      tests: [
        {
          name: 'A zone fails at the claims peak',
          about: 'Broker partners submit 60 claims a second at peak, and one availability zone is lost for the whole run. Every app keeps a replica in another zone, so claims are still answered.',
          traffic: [{ name: 'claims', from: 'partner', rps: 60, kind: 'write', to: ['erp', 'database'] }],
          incidents: [{ zone: true }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Claims peak within the budget',
          about: 'The same 60 claims a second with every zone up. Every claim is answered, and the claims stack in both regions uses at most 4 vCores.',
          traffic: [{ name: 'claims', from: 'partner', rps: 60, kind: 'write', to: ['erp', 'database'] }],
          expect: { answers: [{ minSuccess: 0.99 }], vCores: { max: 4 } },
        },
      ],
    },
  },
  description: `
A reinsurer runs **Runtime Fabric on managed Kubernetes in one region**, with about 90 apps. The board asks for a plan to survive the loss of that region.

Tiering from the business:
- **Tier 1, claims intake:** RTO 15 minutes, RPO 5 minutes.
- **Tier 2, partner reporting:** RTO 4 hours, RPO 1 hour.
- **Tier 3, internal batch:** RTO 1 day.

Current facts:
- Apps use Persistence Gateway with PostgreSQL for dedup keys and watermarks, and the claims database has cross-region replication available.
- The ERP is hosted separately and remains reachable from both regions. It answers in about 400 ms, and the claims database in 50 ms.
- At peak broker partners submit 60 claims a second. Each region must keep serving them when one of its availability zones fails.
- Finance caps the claims stack at 4 vCores across both regions.
- An engineer proposes VM snapshots of worker nodes. Another proposes restoring last night's \`rtfctl\` backup into region B now and running both copies, "so that we have a hot standby for free".

**Questions:**
- Draw the target architecture.
- Compare cold, warm and hot standby and active-active for Runtime Fabric, and assign them to tiers.
- What does an \`rtfctl\` backup cover, and what does it leave out?
- Evaluate the two proposals.
- Where must state live? How do you meet the RPO?
- Write the failover steps for a restore and the testing plan.
`,
  answerTemplate: `## Target architecture

## Standby options per tier

## What a backup covers

## Evaluating the proposals

## State and RPO

## Failover steps and testing
`,
  keyPoints: [
    'High availability handles node and zone failure with no loss of service; DR handles larger disasters and usually means a brief loss of service.',
    'On Runtime Fabric you own backup, restore and DR. Cross-region recovery is not built in: you fail over to a standby cluster in another region.',
    'Cold standby costs the least and has the longest RTO; warm has a shorter RTO; hot covers only the time to route traffic; active-active costs the most and has no downtime.',
    'Schedule `rtfctl` backups, hourly as recommended, on storage outside the cluster.',
    'A backup covers cluster configuration such as services, secrets, ingress and ConfigMaps. It does not cover application state, Ops Center data or control plane data.',
    'Application deployments are reconciled from the control plane on restore, with recent `rtfctl` and agent versions.',
    'Cluster configuration changes and agent upgrades made after a backup are not restored, so reapply them.',
    'Do not use backup and restore to run two concurrent instances of one fabric. Backups through VM snapshots per node are not supported.',
    'Restore to the same cluster that the control plane lists, or a new cluster with the same configuration, with the same `rtfctl` version.',
    'Back up Anypoint configuration with the Anypoint CLI or platform APIs; application metrics are not restored.',
    'Keep integrations stateless, and put state in an external store with its own replication.',
    'Test restore procedures regularly and measure actual RTO.',
    'Sizing: 2 replicas of 0.2 vCore per claims app in each region survive a zone outage at 60 claims a second, and the stack uses about 2.5 vCores, inside the 4 vCore cap.',
  ],
  solution: `
**Target architecture.**
\`\`\`
 Clients ─► Global load balancer ─► Region A ingress ─► exp ─► prc ─► sys ─► ERP
                                └─► Region B ingress ─► exp ─► prc ─► sys ─► ERP
 prc (both) ─► Replicated claims database
 rtfctl backup (hourly) ─► External backup storage
\`\`\`
The global load balancer is your own. Each region has its ingress and a fabric. Runtime Fabric provides no built-in cross-region failover.

**Standby options per tier.** These are the general definitions, applied to this platform. The Runtime Fabric page describes failover to a standby cluster; the mapping below is a design choice.
| Type | On this platform | RTO | Tier |
|---|---|---|---|
| Cold | Create the cluster from code, then \`rtfctl restore\` | Longest | 3 |
| Warm | Region B cluster built and configured, apps started on it only after an outage | Shorter | 2 |
| Hot | A separate fabric in region B with apps deployed and running, receiving no traffic | Time to route traffic | 1 |
| Active-active | Both fabrics serve traffic | None | Only if the state design allows it |

Tier 1, with a 15-minute RTO, should not rely on a restore, which takes several minutes before deployments even synchronize. It needs a separately activated fabric, kept current by the release pipeline. Size region B for the load that it will take.

**Sizing.** In the model answer every claims app runs 2 replicas of 0.2 vCore in each region. One replica serves about 100 requests a second, so losing a zone still leaves room for 60 claims a second. Region B is sized like region A, because a hot standby must take the whole load at once; a scaled-down standby with one replica fails at the first zone outage. The stack uses about 2.5 vCores, inside the 4 vCore cap.

**What a backup covers.** Cluster configuration: services, secrets, ingress and ConfigMaps, plus data in the Runtime Fabric and application namespaces. With \`rtfctl\` 1.0.70 and later and an agent above 2.6.52, Mule app deployments are not in the bundle; they are synchronized from the control plane on restore. Not covered: application state, Ops Center data and control plane data. Changes stored outside the control plane, like updated cluster configuration and agent upgrades, must be reapplied. The docs differ on apps: the HA page says created and deleted apps are reconciled on restore, while the backup page lists them among changes that are not restored, so check every deployment after a restore. Application monitoring metrics are not restored. Anypoint configuration, such as connections, is backed up separately with the Anypoint CLI or platform APIs.

**Evaluating the proposals.**
- *VM snapshots:* creating a backup per node, such as via a VM snapshot, is not supported.
- *Restored copy running beside the original:* the docs warn against this. Do not back up fabric A and use it to create fabric B while A is active: it creates application deployment issues. A hot standby must be a separately activated fabric with its own deployments.

**State and RPO.** An hourly backup gives an RPO of at most an hour for cluster configuration, and nothing for business data. Business state must live in an external store whose replication meets the target: the claims database with a lag well within 5 minutes. Persistence Gateway needs thought. Its data is in your PostgreSQL, so you must replicate it with database tools. Its documented migration is to copy the two tables with apps not deployed on both clusters, which does not suit a live hot standby. Keep Tier 1 dedup keys and watermarks in the replicated claims database, or make processing safely repeatable after failover. The 30-day TTL also limits what it should hold.

**Failover steps (restore path, Tier 2).**
1. Declare the disaster, and stop traffic to region A at the global load balancer.
2. Make sure the original fabric cannot act: scale its agent to zero if it is still reachable.
3. Prepare the target cluster without running the \`rtfctl\` install command, and use the same \`rtfctl\` version as the backup.
4. Copy the backup, set the \`kubectl\` context and run \`rtfctl restore <path>\`.
5. Confirm that apps have synchronized, then reapply post-backup changes.
6. Route traffic, and verify with real transactions and reconciliation.

**Testing.** Test restore procedures regularly, measure actual RTO and RPO against each tier, and run a full failover at least on a schedule the business approves. Record what you had to do by hand, and automate it.
`,
  followUps: [
    {
      q: 'Do you need a new fabric entry in Runtime Manager for a restore?',
      a: 'The restore must be on the same Runtime Fabric cluster that is listed in Runtime Manager. A new Kubernetes cluster with the same configuration is allowed, but it represents the same fabric. For OpenShift the docs describe regenerating activation data for a move. That differs from a separately activated standby fabric.',
    },
    {
      q: 'What about the control plane in a disaster?',
      a: 'MuleSoft manages it and keeps it resilient. Running apps do not depend on it for request traffic, but deployments and restores do, so a plan that needs a deployment during a control plane problem has a risk to record.',
    },
    {
      q: 'Would a Mule cluster across the two regions help?',
      a: 'No. Cluster nodes should be on one LAN or at least below 10 ms, and clusters across sites risk split brain. Keep each region independent, and share state through external systems.',
    },
    {
      q: 'How do replicas relate to all this?',
      a: 'They solve a different problem. Run at least two replicas per app across zones for HA inside a region. Topology spread constraints keep them balanced. None of that protects you from losing a region.',
    },
  ],
}
