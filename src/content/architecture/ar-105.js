import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-105',
  category: 'architecture',
  title: 'Customer-Hosted Mule Across Two Data Centres: One Cluster per Site, Standby Choices and External State',
  level: 'ADVANCED',
  tags: ['deployment', 'high-availability', 'disaster-recovery', 'hybrid', 'clustering', 'environments'],
  estMinutes: 45,
  diagram: {
    task: 'draw a customer-hosted Mule estate in two data centres, with each client entering through a load balancer that reaches Experience APIs in both sites, each site running its own API-led stack, the core banking system reached only through System APIs, and shared state kept in a replicated external database and a message broker rather than in a cluster spanning the sites.',
    checks: [
      { label: 'Every client enters through the load balancer', rule: { type: 'each', of: ['partner', 'internal-app', 'web-app', 'mobile-app'], edgeTo: 'load-balancer' } },
      { label: 'Two sites: at least two Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'The load balancer sends traffic to every Experience API', rule: { type: 'each', of: 'experience-api', edgeFrom: 'load-balancer' } },
      { label: 'Each Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: ['legacy', 'erp'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'State is kept outside the runtimes, in a database', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['database', 'sql-server', 'oracle-db'] } },
      { label: 'Work between layers can use an external broker', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
    ],
    reference: diagram(
      {
        partners: ['partner', 'Payment partners'],
        branch: ['internal-app', 'Branch teller app'],
        mobile: ['mobile-app', 'Banking mobile app'],
        lb: ['load-balancer', 'Global load balancer'],
        expA: ['experience-api', 'exp-payments (site A cluster)'],
        expB: ['experience-api', 'exp-payments (site B cluster)'],
        prcA: ['process-api', 'prc-payments (site A cluster)'],
        prcB: ['process-api', 'prc-payments (site B cluster)'],
        broker: ['queue', 'External broker: payment.events'],
        sysA: ['system-api', 'sys-core-banking (site A cluster)'],
        sysB: ['system-api', 'sys-core-banking (site B cluster)'],
        core: ['legacy', 'Core banking'],
        state: ['database', 'Replicated state database'],
        logs: ['monitoring', 'Central log platform'],
      },
      [
        'partners -> lb', 'branch -> lb', 'mobile -> lb', 'lb -> expA', 'lb -> expB',
        'expA -> prcA', 'expB -> prcB', 'prcA ~> broker', 'prcB ~> broker',
        'prcA -> sysA', 'prcB -> sysB', 'sysA -> core', 'sysB -> core',
        'prcA -> state', 'prcB -> state', 'prcA -> logs', 'prcB -> logs',
      ],
    ),
  },
  description: `
A regional bank must keep Mule in its own two data centres, 60 km apart, with a measured latency of 12 ms between them. It will manage the runtimes from Anypoint Platform as Hybrid Standalone instances. Twelve apps handle payments for partners, branch staff and a mobile app, at about 400 requests per second at peak.

Requirements and constraints:
- **Availability:** the loss of a server must not cause any loss of service.
- **Disaster recovery:** RTO of 15 minutes and RPO of near zero for a site failure.
- **State:** two apps use idempotency, and one runs a nightly reconciliation job.
- **Budget:** the CFO asks why the second site cannot simply stay switched off.
- **Proposal from the infrastructure team:** one six-node cluster, three nodes per site.

**Questions:**
- Draw the target architecture.
- Respond to the six-node proposal.
- Compare the standby options against the RTO, and choose one.
- Who is responsible for what in DR?
- How do you handle state, scheduled work and capacity for the loss of a site?
- How do you prove that the design works?
`,
  answerTemplate: `## Target architecture

## The six-node proposal

## Standby options

## Responsibilities

## State, scheduled work and capacity

## Proving it
`,
  keyPoints: [
    'HA and DR differ: a cluster keeps serving when a server fails; DR restores service after a disaster and usually incurs a brief loss of service.',
    'A single cluster that spans locations requires latency below 10 ms. At 12 ms, the six-node proposal does not qualify.',
    'WAN clusters risk split brain, duplicate processing and several primaries. Quorum is manual-only and limited to Object Store operations.',
    'Use one cluster per site, each on one LAN, with a load balancer across them: this is the load-balanced clustered environments form of active-active.',
    'Cold, warm and hot standby trade cost against recovery time: cold costs the least and hot the most of the three. Active-active has no downtime.',
    'On customer-hosted runtimes, you own DR. MuleSoft keeps the control plane available, and that plane holds no business data.',
    'Keep integrations stateless and externalise state. Object Store persistence does not support one database across clusters.',
    'A cluster has no built-in load balancer. Test failover and restore regularly, and size each site for full load if the SLA requires it.',
  ],
  solution: `
**Target architecture.**
\`\`\`
 Partners / Branch app / Mobile ─► Global load balancer
   ├─► Site A cluster: exp-payments ─► prc-payments ─► sys-core-banking ─┐
   │                                    ├─~► External broker             ├─► Core banking
   │                                    └─► Replicated state database    │
   └─► Site B cluster: exp-payments ─► prc-payments ─► sys-core-banking ─┘
\`\`\`
Each site has its own cluster of at least two nodes, on different machines and on one LAN. Clusters and sites are shown as labels, since they are not diagram components. Both sites use the same artifacts and versions.

**The six-node proposal.** Reject it. The on-premises HA guide says that a single cluster spanning locations requires latency below 10 ms, and the bank measures 12 ms. The docs also warn about WAN clusters: failed links can cause duplicates after reconnection, inconsistent Object Store data, and several nodes acting as primary. For payments, that is not acceptable. Quorum would not rescue it. It can only be configured manually, and covers Object Store operations only. The docs describe the portion with the most nodes continuing, but not an even 3 + 3 split. The docs' way of surviving a site loss with quorum requires at least three data centres with equal node counts.

**Standby options.**
| Option | State of standby | Downtime |
|---|---|---|
| Cold | Installed and configured, OS stopped | Some: start the environment and route traffic |
| Warm | OS running, Mule stopped | Little: start Mule and route traffic |
| Hot (active-passive) | Fully running, no requests | Minimal to none: route traffic |
| Active-active | Two or more environments serving | None |

The CFO's option is cold standby. It costs the least but takes the longest, and that has to be tested against the 15-minute RTO, along with a near-zero RPO that depends on data replication. Because partners need high availability, choose active-active with a cluster per site. Hot standby is the fallback if the budget or the apps cannot support two active sites.

**Responsibilities.** Under the shared-responsibility model, the bank backs up and restores the runtime plane, fails over apps and runs DR procedures with its own tooling. It backs up apps, runtime configuration and data to storage outside the primary environment, and platform configuration with Anypoint CLI or the platform APIs. MuleSoft keeps the control plane available across multiple availability zones. The control plane stores operational metadata and configuration, not business data. It is not in the request path, so traffic continues if it is unreachable.

**State, scheduled work and capacity.**
- Keep integrations stateless and externalise state to a database or a messaging queue. Cluster memory does not span sites: Object Store and VM data live in one cluster's grid.
- For idempotency across sites, use a table in the replicated database, not the Object Store. Object Store persistence does not support one database across different clusters.
- Each cluster has its own primary, so a Scheduler would run in both sites. Enable the reconciliation job in one site, with a runbook step or property to move it. Make it idempotent as well.
- Each node must be able to absorb the load after failure. The guide's sizing example shows that if the acceptable impact matches normal operation, you need more nodes. Size each site for the full 400 requests per second if a site loss must not degrade service.

**Proving it.**
- The HA guide says to test failover and restore procedures regularly.
- Rehearse a node failure, a site failure and a link failure, and measure RTO and RPO.
- Keep identical Mule, agent and Java versions on all nodes in a cluster.
- Patch nodes one at a time, and use the second site for side-by-side releases: drain a site, upgrade it, and then move traffic back.
`,
  followUps: [
    { q: 'What if the sites were 5 km apart, with 2 ms latency?', a: 'A load-balanced single clustered environment becomes allowed, as latency is below 10 ms. The WAN risks remain, though, so the docs still prefer one LAN or availability zone, and you must plan for split brain.' },
    { q: 'Why does an external load balancer matter so much?', a: 'An on-premises cluster creates no virtual IP and has no built-in load balancer. Without one, or client-side failover, HTTP traffic does not move when a node fails.' },
    { q: 'Would you pick a different target if self-hosting was not mandatory?', a: 'Compare it with a platform that manages the runtime for you, such as CloudHub 2.0 or Runtime Fabric, which reduces the work that this design leaves to the bank. The rule requiring own data centres is what makes Hybrid Standalone the choice here.' },
  ],
}
