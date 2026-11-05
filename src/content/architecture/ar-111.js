export default {
  id: 'ar-111',
  category: 'architecture',
  title: 'Shared or Private Space? Placing 40 Applications, Budgeting Entitlements and Sizing the Estate',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'cloudhub', 'deployment', 'private-space', 'shared-space', 'sizing', 'cost'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each application to the need that decides its placement.',
      pairs: [
        ['`sys-sap-orders` calls SAP in the company data centre', 'Network connection: VPN or transit gateway attachment'],
        ['`exp-partner-api` must answer at `api.northwind-foods.example`', 'Vanity domain name, which needs a private space'],
        ['`sys-bank-payments` calls a bank that allowlists its callers', 'Static application source IP addresses, which need a private space'],
        ['`exp-store-hours` is public, uses `cloudhub.io` and calls only SaaS', 'None of these: a shared space is enough'],
      ],
      explain: 'A shared space fits if you need no isolation from the public cloud, no connection to an on-premises data centre, no vanity domain and no custom certificates. Single-tenancy, private endpoints and the needs above all require a private space.',
    },
    {
      type: 'single',
      prompt: 'The organization has a network connection entitlement of four. CloudHub 1.0 already uses three VPNs. The migration team wants two new VPN connections for CloudHub 2.0. What happens with the second one?',
      options: [
        'It is refused with an error such as `Connections limit has been reached (max=4, used=4)`, because CloudHub 1.0 and 2.0 share entitlement quotas',
        'It succeeds, because each version of CloudHub gets four connections',
        'It succeeds, and the excess is billed monthly',
        'CloudHub 1.0 VPNs are converted automatically',
      ],
      answer: 0,
      explain: 'The docs say you do not get four network connections for each version of CloudHub. During a migration, plan for double entitlements, and work with your account representative. The error text comes from the CloudHub 1.0 transit gateway troubleshooting page, which refers to VPC/VPN licenses.',
    },
    {
      type: 'single',
      prompt: 'The private space will hold 40 apps now. The three-year plan is 350 apps and 450 vCores. Which is the smallest CIDR block that fits the reference table?',
      options: [
        '`/22`, listed as less than 600 vCores and less than 500 applications',
        '`/24`, because the block can be resized later',
        '`/23`, listed as less than 300 vCores and less than 200 applications',
        '`/20`, the only block that allows more than 100 apps',
      ],
      answer: 0,
      explain: 'You cannot resize or change the CIDR block after creating the private space, so size it for the plan, not for today. MuleSoft also recommends `/22`. Note that the reference sizes are subject to change.',
    },
    {
      type: 'single',
      prompt: 'Under usage-based pricing, app A has 5 flows and 2 replicas all month. App B has 8 flows. It runs 2 replicas, except for one peak hour in which it runs 4. What flow usage is reported for the month?',
      options: ['42', '26', '13', '34'],
      answer: 0,
      explain: 'Flows are multiplied by replicas, and the month uses the Max Concurrent model: the highest number in a single hour. In the peak hour that is (5 x 2) + (8 x 4) = 42. Assume here that all these flows are countable. A high `maxReplicas` on autoscaled apps therefore matters for cost.',
    },
    {
      type: 'multi',
      prompt: 'An organization on usage-based pricing reaches the limit of its global resource pool. Which statements are correct?',
      options: [
        'Actions that consume more resources, such as deploying new apps or starting stopped apps, are blocked until resources are available',
        'You can free resources by stopping or deleting unused apps, or by reducing replica sizes',
        'Apps configured with HPA are not affected by this limit, so you can continue to deploy them',
        'Granular replica sizes help you allocate only what you need',
        'Running apps are stopped at random to free capacity',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The pool is shared across all business groups and environments for CloudHub and CloudHub 2.0. You get warnings as you approach the limit, and Support handles exception requests.',
    },
    {
      type: 'single',
      prompt: 'Under usage-based pricing, a memory-hungry transformation app needs more heap but no more compute. What does the sizing model offer?',
      options: [
        'Replica sizes with the `.mem` suffix, which are memory-intensive options with the same compute',
        'A larger Object Store',
        'A `/20` CIDR block',
        'Only a move to a private space',
      ],
      answer: 0,
      explain: 'The pricing page describes `.mem` sizes this way, and it shows each offering with its equivalent vCore size, total memory and heap memory.',
    },
    {
      type: 'match',
      prompt: 'Match each DR tier to what it consumes in the DR region before an outage.',
      pairs: [
        ['Active-active', 'Traffic is split, and flows or vCores are consumed for replicas in both regions'],
        ['Hot standby', 'No messages or throughput until traffic switches, but running replicas still count'],
        ['Warm standby', 'Private space and API Manager entitlements only, with apps stopped'],
        ['Cold standby', 'Nothing until the plan or script builds the environment'],
      ],
      explain: 'This is why a mixed estate often uses several tiers. Match the cost to the impact of each app, and remember that warm and cold standby need the control plane to recover.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about limits should shape the private space design?',
      options: [
        'A single region can hold several private spaces, so production and non-production can be separate networks',
        'Connections per private space are limited to 5, or 10 if the connections are not redundant',
        'A private space allows a maximum of 95 route table entries, so consolidate networks before configuring routing',
        'Private cloud quotas cover both CloudHub 1.0 VPCs and CloudHub 2.0 private spaces',
        'Each environment needs its own organization',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The limits page also lists 100 private spaces per organization, 10 VPNs per private space and 5 transit gateway connections per private space. Environments and business groups are associated with a private space, so no extra organization is needed.',
    },
  ],
  description: `
Northwind Foods is moving **40 applications** to CloudHub 2.0. Some are public and simple. Others reach SAP in a data centre, call a bank from a fixed address, or face partners on a branded domain.

Other facts:
- The company is on a usage-based pricing contract.
- It still runs some CloudHub 1.0 apps during the migration.
- Finance wants a defensible budget.

Each question is a decision that the platform architect must make, and every answer rests on a documented rule or limit.
`,
  answerTemplate: `## Placement decisions

## Entitlements and quotas

## Network sizing

## Cost and capacity
`,
  keyPoints: [
    'Use a shared space only if you need no isolation, no data centre connection, no vanity domain and no custom certificates.',
    'Single-tenancy, VPN or transit gateway connections, vanity domains, custom certificates, private endpoints and static source IPs require a private space.',
    'CloudHub 1.0 and 2.0 share entitlement quotas for private clouds, network connections and vCores.',
    'Size the CIDR block for the plan, because it cannot be changed. /22 is recommended.',
    'Mule flows are counted as flows times replicas, and the month uses the highest single hour.',
    'When the global resource pool runs out, new deployments and starts are blocked, except for apps with HPA.',
    'DR tiers differ in what they consume, so assign them by the impact of each app.',
  ],
  solution: `
**Placement.** Start from the documented list of features that need a private space. Apps that need none of them can use a shared space, with no setup and no private space to run. In practice, most of an estate that reaches back-end systems will land in private spaces.

**Entitlements.** Count connections across both CloudHub versions, and plan for double entitlements during migration. Decommission CloudHub 1.0 resources to release them.

**Network sizing.** Choose the CIDR block from the long-term plan, make sure that it does not overlap with other networks, and consolidate routes, as the limit is 95 entries.

**Cost and capacity.** Review replica counts and \`maxReplicas\`, because the highest hour sets the monthly flow figure. Use granular replica sizes, and \`.mem\` sizes for memory-heavy apps. Watch the warnings for the global resource pool.

**DR.** Give high-impact apps a running standby, and let low-impact apps rely on a tested script.
`,
  followUps: [
    { q: 'Can a shared space app use a custom endpoint?', a: 'No. CloudHub 2.0 supports customizing endpoints only for apps deployed to private spaces.' },
    { q: 'Does a VPC endpoint consume a network connection entitlement?', a: 'Yes. Each VPC endpoint consumes one network connection entitlement per availability zone, and each endpoint service consumes one from your quota.' },
    { q: 'Are vCores still allocated to business groups under usage-based pricing?', a: 'No. Flows, messages and throughput are the entitlements, and they are available only at the root organization level.' },
  ],
}
