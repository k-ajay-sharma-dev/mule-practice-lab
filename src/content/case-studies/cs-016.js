export default {
  id: 'cs-016',
  category: 'case-studies',
  title: 'Moving 60 Applications From CloudHub 1.0 to CloudHub 2.0',
  level: 'INTERMEDIATE',
  tags: ['cloudhub-2', 'migration', 'networking', 'deployment', 'ci-cd'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'The apps need a VPN to the data centre, custom certificates and custom domains. What CloudHub 2.0 target do you choose?',
      options: [
        'A private space connected to the data centre by VPN, with ingress configured for the custom domains and TLS',
        'The shared space, because it is the default for CloudHub 2.0',
        'A Dedicated Load Balancer, exactly as on CloudHub 1.0',
        'Runtime Fabric on the developers’ laptops',
      ],
      answer: 0,
      explain: 'Private connectivity (VPN) and custom ingress need a private space. The shared space cannot connect to the data centre, and the CloudHub 1.0 DLB does not exist in CloudHub 2.0 — its job moves to private space ingress.',
    },
    {
      type: 'match',
      prompt: 'Match each CloudHub 1.0 feature to how you handle it on CloudHub 2.0.',
      pairs: [
        ['Workers', 'Replicas (size and count)'],
        ['Dedicated Load Balancer with mapping rules', 'Private space ingress with custom domains, TLS and path rules'],
        ['CloudHub persistent queues', 'Redesign with Anypoint MQ'],
        ['VPC with VPN to the data centre', 'Private space network with VPN (or Transit Gateway)'],
      ],
      explain: 'Each CloudHub 1.0 concept has a CloudHub 2.0 counterpart, except persistent queues, which are not offered and must be redesigned, typically on Anypoint MQ.',
    },
    {
      type: 'single',
      prompt: 'Partners have whitelisted the current outbound IPs. When do you deal with this?',
      options: [
        'First — get the private space static outbound IPs and share them with partners early so whitelists are updated before cutover',
        'On cutover day, by phoning each partner',
        'Never — CloudHub 2.0 keeps the CloudHub 1.0 IPs automatically',
        'After all apps are migrated, if partners complain',
      ],
      answer: 0,
      explain: 'Partner whitelist changes are often the slowest dependency, so they start first. The IPs change with the new private space; assuming they carry over causes a partner outage at cutover.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for cutting over one app.',
      items: [
        'Upgrade the app to a supported Mule 4.x runtime and update the mule-maven-plugin config for CloudHub 2.0',
        'Deploy to CloudHub 2.0 alongside the CloudHub 1.0 app',
        'Test through the new URL',
        'Switch DNS / partner traffic to the new deployment',
        'Keep the CloudHub 1.0 app for a rollback period, then stop it',
      ],
      explain: 'Prepare, deploy in parallel, test, switch, then decommission after a rollback window. Stopping the old app at the moment of switching removes the rollback option.',
    },
    {
      type: 'multi',
      prompt: 'Which items must you check in each app before moving it?',
      options: [
        'It listens on the port property the platform expects, not a hard-coded port',
        'Whether it uses CloudHub persistent queues',
        'Log forwarding and retention still meet needs',
        'API Manager autodiscovery points to the new deployment after cutover',
        'Its DataWeave scripts must be rewritten in DataWeave 1.0',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Ports, persistent queues, logging and API Manager pairing all change with the platform. DataWeave versions are unrelated to the CloudHub move — Mule 4 apps already use DataWeave 2.0.',
    },
    {
      type: 'single',
      prompt: 'How do you sequence the waves of ~10 apps?',
      options: [
        'Pilot 2–3 low-risk internal apps first, then group waves by dependency, migrating System APIs before the APIs that call them',
        'Start with the most critical partner-facing apps to get the hard part done',
        'Move all 60 apps in one weekend to avoid running two platforms',
        'Pick apps alphabetically so nothing is forgotten',
      ],
      answer: 0,
      explain: 'A low-risk pilot proves the private space, ingress and pipeline; dependency-based waves keep call chains working. Starting with the critical partner apps puts the biggest risk on the least-proven setup.',
    },
  ],
  description: `
**Context.** An insurance broker runs 60 Mule 4 applications on CloudHub 1.0 in a VPC with a VPN to its data centre and a Dedicated Load Balancer (DLB) with custom certificates and URL mapping rules. Several apps use persistent queues, some rely on static IPs whitelisted by partners, and deployments are done with the mule-maven-plugin from a CI pipeline. Leadership wants to move to CloudHub 2.0.

**Goals**
- Move all apps with no partner-visible changes where possible.
- Improve deployment and scaling practices on the way.
- Complete within two quarters.

**Constraints**
- Partners have whitelisted the current outbound IPs and call the DLB hostname.
- Some apps are on older Mule 4.x runtime versions.
- The networking team must approve all changes to VPN and firewall rules.

**Your task.** Plan the migration: target design, differences to handle, sequencing and cutover.
`,
  answerTemplate: `## Target CloudHub 2.0 design

## Differences to handle (networking, queues, IPs, deployment)

## Migration waves and cutover

## Risks
`,
  keyPoints: [
    'Target is a CloudHub 2.0 private space (not a shared space) because of the VPN, private connectivity and custom ingress needs.',
    'DLB functionality (custom domains, certificates, routing) is re-created with the private space ingress/TLS configuration, and DNS is switched per app at cutover.',
    'Apps using CloudHub 1.0 persistent queues are redesigned (e.g. Anypoint MQ) since CloudHub 2.0 does not offer that feature.',
    'Partners are given the private space static outbound IPs in advance so whitelists can be updated before cutover.',
    'CI/CD deployment config moves to the CloudHub 2.0 target (replicas, replica size, private space) in the mule-maven-plugin; apps are upgraded to a supported runtime version first.',
    'Migration in waves with a parallel deployment and DNS-based cutover/rollback per app.',
  ],
  solution: `
**Target design.** One or more **private spaces** (e.g. non-prod and prod) in the same region, connected to the data centre via VPN (or Transit Gateway if the company has AWS). Environments associated with the private space. Ingress configured with custom domains and the company certificates (TLS context) to replace the DLB.

**Differences to handle.**
- **Workers → replicas.** Size apps by replica size and count; enable clustering where needed.
- **Persistent queues** (a CloudHub 1.0 feature) are not available — move to Anypoint MQ or redesign the flow; check VM queues usage.
- **Object Store v2** is available, but check keys/TTL behaviour and that data migrates or can be rebuilt.
- **Static IPs** — private spaces provide outbound static IPs; share them with partners early.
- **Ports and URLs** — apps must listen on the port the platform expects (use the \`http.port\` property, never a hard-coded port); DLB mapping rules become ingress/path rules; decide where TLS terminates (ingress only, or end to end).
- **Logging** — confirm log forwarding/appenders and retention meet needs.
- **Deployment** — update the mule-maven-plugin config to the CloudHub 2.0 deployment type (target, provider, replicas, vCores), use connected apps for credentials. Upgrade older runtimes first.

**Waves and cutover.**
1. Build private space, VPN, ingress, DNS plan; migrate 2–3 low-risk internal apps as a pilot.
2. Migrate in waves of ~10, grouped by dependency (System APIs before the APIs that call them).
3. Per app: deploy to CloudHub 2.0 alongside the CH1 app, test via the new URL, switch DNS/partner traffic, keep CH1 running for a rollback period, then stop it.
4. API Manager: re-point API instances/autodiscovery to the new deployments.

**Risks.** Partner IP whitelist delays (start the conversation first), network approvals, persistent-queue redesign effort, and cost changes from different sizing.
`,
  followUps: [
    { q: 'Shared space or private space — when would shared be enough?', a: 'Shared space suits public internet-facing apps with no private connectivity or custom ingress needs. Anything needing a VPN, static IPs or custom certificates/domains belongs in a private space.' },
    { q: 'How do you avoid a big-bang cutover for partners?', a: 'Give partners the new IPs and keep the same hostname; switch DNS per app behind that hostname so they see no change, and keep the old app ready for rollback.' },
    { q: 'What is your biggest risk?', a: 'External dependencies — partner whitelists and network approvals — because they are outside the team’s control. Start them in week one and track them as critical-path items.' },
  ],
}
