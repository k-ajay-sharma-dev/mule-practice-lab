import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-110',
  category: 'architecture',
  title: 'Multi-Region Runtime DR on CloudHub 2.0: Hot Standby Claims APIs, a Global Load Balancer and the Regional Services That Do Not Fail Over',
  level: 'EXPERT',
  tags: ['cloudhub-2', 'deployment', 'disaster-recovery', 'multi-region', 'anypoint-mq', 'object-store', 'healthcare'],
  estMinutes: 50,
  diagram: {
    task: 'draw a hot standby design for the claims platform across two CloudHub 2.0 regions, with a bring-your-own global load balancer in front of both private spaces, a full API-led stack in each region, a queue in each region, and the reconciliation job keeping its watermark in an external Redis store.',
    checks: [
      { label: 'A global load balancer plus an ingress load balancer for each region', rule: { type: 'node', match: 'load-balancer', min: 3 } },
      { label: 'Every consumer enters through a load balancer', rule: { type: 'each', of: ['web-app', 'partner'], edgeTo: 'load-balancer' } },
      { label: 'The global load balancer routes to both regions', rule: { type: 'edge', from: 'load-balancer', to: 'load-balancer', min: 2 } },
      { label: 'Experience APIs are deployed in both regions', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Process APIs are deployed in both regions', rule: { type: 'node', match: 'process-api', min: 2 } },
      { label: 'System APIs are deployed in both regions', rule: { type: 'node', match: 'system-api', min: 2 } },
      { label: 'The claims database is reached only through System APIs', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Claims are handed off asynchronously to a queue in each region', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: 'queue', kind: 'async', min: 2 } },
      { label: 'No replication is drawn between queues, because Anypoint MQ does not replicate messages', rule: { type: 'no-edge', from: 'queue', to: 'queue' } },
      { label: 'The batch job keeps its watermark in an external store such as Redis', rule: { type: 'edge', from: 'batch-job', to: { type: ['cache', 'database'], label: ['redis', 'watermark'] } } },
      { label: 'Health and recovery points reach a monitoring system', rule: { type: 'node', match: 'monitoring', min: 1 } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Member portal'],
        prt: ['partner', 'Hospitals and clearing houses'],
        glb: ['load-balancer', 'Global load balancer (Route 53, health checks)'],
        ingP: ['load-balancer', 'Ingress: private space us-east-2 (primary)'],
        ingB: ['load-balancer', 'Ingress: private space us-west-2 (hot standby)'],
        expP: ['experience-api', 'exp-claims (primary)'],
        expB: ['experience-api', 'exp-claims (backup)'],
        q: ['queue', 'claims.intake (us-east-2)'],
        qfb: ['queue', 'claims.intake_fb (fallback, us-west-2)'],
        prcP: ['process-api', 'prc-claims (primary)'],
        prcB: ['process-api', 'prc-claims (backup)'],
        sysP: ['system-api', 'sys-claims-db (primary)'],
        sysB: ['system-api', 'sys-claims-db (backup)'],
        db: ['database', 'Claims database (cross-region, owned by the DBA team)'],
        jobP: ['batch-job', 'prc-reconciliation (primary, DR flag on)'],
        jobB: ['batch-job', 'prc-reconciliation (backup, DR flag off)'],
        redis: ['cache', 'Redis: watermarks and DR flag, reachable from both regions'],
        mon: ['monitoring', 'Health alerts and recovery points'],
      },
      [
        'web -> glb', 'prt -> glb', 'glb -> ingP', 'glb -> ingB',
        'ingP -> expP', 'ingB -> expB',
        'expP ~> q', 'expB ~> qfb', 'q ~> prcP', 'qfb ~> prcB',
        'prcP -> sysP', 'prcB -> sysB', 'sysP -> db', 'sysB -> db',
        'jobP -> sysP', 'jobB -> sysB', 'jobP -> redis', 'jobB -> redis',
        'expP -> mon', 'expB -> mon',
      ],
    ),
  },
  description: `
A health insurer runs its claims platform on **CloudHub 2.0**, on the **US Cloud** control plane. After a regional cloud outage at a competitor, the board asks for a cross-region design. Hospitals and clearing houses submit about 60,000 claims a day through an API, and members use a portal.

Today everything runs in one private space in \`us-east-1\`, the same region as the control plane.

Requirements:
- **Claims submission** is high impact and may tolerate only brief downtime during failover.
- **Claim status for members** is medium impact, and a short outage is acceptable.
- **Provider directory sync**, a low-impact job, can wait for hours.
- \`prc-reconciliation\` polls the claims database on a schedule and must not run in both regions at once. It uses a watermark, currently held in Object Store v2.
- Tokens for an outbound clearing house API are cached in an object store.
- The APIs use rate-limiting policies, agreed per partner.
- The organization has the **Global Deployment** entitlement. Finance wants to pay for standby capacity only where it is justified.

**Questions:**
- Draw the target architecture for claims submission.
- Which regions do you choose, and why not \`us-east-1\`?
- Which DR tier fits each workload, and what does each tier consume?
- What does not fail over by itself, and how do you handle it?
- How does failover start if the control plane is not available?
`,
  answerTemplate: `## Target architecture

## Region choice

## DR tier for each workload

## Regional services and state

## Failover and failback
`,
  keyPoints: [
    'MuleSoft manages in-region infrastructure, and you own the cross-region DR strategy.',
    'Choose primary and backup runtime regions that differ from the control plane region, which is us-east-1 for the US and eu-central-1 for the EU.',
    'A bring-your-own global load balancer or DNS routing, such as Route 53, uses health checks to switch traffic.',
    'Active-active and fully scaled hot standby suit high-impact APIs. Scaled-down hot standby or warm standby suit medium impact. Cold standby suits low impact and has the longest RTO.',
    'Warm and cold standby, and scaled-down hot standby that scales through redeployment, depend on the control plane during recovery.',
    'Warm standby consumes private space and API Manager entitlements in the DR region, but no extra vCores, flows, messages or throughput until apps start. Cold standby consumes none of these until it is built.',
    'Object Store v2 is regional and has no failover, so use an external store such as a database or Redis for watermarks across regions.',
    'Anypoint MQ failover works for standard queues, and it does not replicate messages.',
    'Rate-limiting policies apply at the replica level, so a DR playbook must cover rate limits.',
    'For schedulers in a hot standby, externalize a DR flag and enable or disable flows in the runtime plane with a Groovy script.',
    'Canada and Japan do not support cross-region runtime plane DR.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Portal, hospitals ─► Global LB (health checks) ─┬─► Ingress us-east-2 ─► exp-claims ─~► claims.intake    ─~► prc-claims ─► sys-claims-db ─┐
                                                 │                                                                                         ├─► Claims DB
                                                 └─► Ingress us-west-2 ─► exp-claims ─~► claims.intake_fb ─~► prc-claims ─► sys-claims-db ─┘
 prc-reconciliation (DR flag on in one region only) ─► Redis (watermark and flag)
\`\`\`

**Regions.** Move the primary from \`us-east-1\` to \`us-east-2\` and use \`us-west-2\` as the backup. The docs advise primary and backup regions that differ from the control plane region, so that runtime availability is decoupled from it. Applications already deployed keep running if the control plane is unavailable. \`us-west-2\` is also the Anypoint MQ fallback region for \`us-east-2\`, though the pairing is not mutual: the fallback for \`us-west-2\` is \`ca-central-1\`.

**Tiers.**
- **Claims submission: hot standby, fully scaled.** Downtime covers only the time to route traffic. Active-active is an alternative if the database design supports writes from both regions.
- **Claim status: hot standby with fewer or smaller replicas, or warm standby.** With warm standby, deploy with \`<autoStart>false</autoStart>\`, and configure the private space, networking and API Manager in advance. Starting the apps needs the control plane.
- **Provider sync: cold standby.** Keep a plan or script, with artifacts in Exchange and source control, outside the primary region. It builds the private space, connectivity, apps and policies. This tier also needs the control plane and has the longest RTO.

**Regional services and state.**
- **Object Store v2** has no failover, and an app in another region cannot access it. Move the watermark to Redis or a database reachable from both regions. Cached tokens are region-specific, so let the backup region fetch its own.
- **Anypoint MQ** fails over to a fallback region for standard queues. Apps keep naming \`claims.intake\`: with failover on, the connector manages \`claims.intake_fb\` and rejects direct use of it. In-flight messages stay in the primary region until it recovers. If the RTO cannot accept that, have systems resend events during the switch. The docs warn that data for a few minutes can be lost during backup with VM queues and Anypoint MQ.
- **Rate limits** apply per replica, so document the adjustments in the playbook. If limits must hold across regions, the docs point to custom policies on an external multi-region store.
- **Claims database.** Its cross-region design is the job of the database team, and it often sets the real RPO. MuleSoft does not replicate it.

**Failover.** Health checks detect the outage, and the load balancer switches routing. For \`prc-reconciliation\`, a Groovy script flips the externalized DR flag in the runtime plane, so that activation does not depend on the control plane. Capture recovery points in logs and monitoring so that systems can resend in-flight data.

**Failback.** Let fallback queues drain, confirm which region owns the job, reverse the flag, then switch routing. Rehearse the whole cycle.
`,
  followUps: [
    { q: 'What does hot standby cost under usage-based pricing?', a: 'It consumes no messages or throughput until traffic switches, and it consumes fewer flows with CPU-based HPA. Flows are still counted for running replicas. Without usage-based pricing, it consumes extra vCores.' },
    { q: 'Why is a scaled-down hot standby weaker if the control plane is down?', a: 'Scaled-down apps rely on the control plane to redeploy, start or scale up. CPU-based HPA is the documented option to configure where your organization supports it.' },
    { q: 'Could this design work on the Canada or Japan control plane?', a: 'No. Those control planes use a 1:1 ratio of control plane region to runtime plane region, and they do not support cross-region runtime plane DR.' },
    { q: 'Why not back up the Object Store data to the second region?', a: 'The docs say Object Store v2 does not retrieve data for regular backups and cannot be transferred to a secondary region. Bring your own external storage.' },
  ],
}
