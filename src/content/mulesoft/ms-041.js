export default {
  id: 'ms-041',
  category: 'mulesoft',
  title: 'CloudHub 2.0 in Practice: Replicas, Ingress and Private Spaces (vs CloudHub 1.0 VPC)',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'private-space', 'ingress', 'replicas', 'networking'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each CloudHub 1.0 concept to its CloudHub 2.0 replacement.',
      pairs: [
        ['Anypoint VPC', 'Private space'],
        ['Dedicated Load Balancer + mapping rules', 'Private space ingress (custom domains, TLS contexts, path routing)'],
        ['Workers', 'Replicas'],
        ['Shared worker cloud', 'Shared space'],
      ],
      explain: 'The private space combines the network (VPC), private connectivity and ingress (DLB). Workers become replicas.',
    },
    {
      type: 'single',
      prompt: 'How do you scale an app horizontally on CloudHub 2.0?',
      options: [
        'Increase the replica count',
        'Increase the vCore size',
        'Add a second DLB',
        'Deploy a copy of the app with another name',
      ],
      answer: 0,
      explain: 'Replica count is horizontal scaling; changing the vCore size is vertical scaling.',
    },
    {
      type: 'single',
      prompt: 'A Scheduler-driven job runs on 2 replicas with clustering **disabled**. What happens?',
      options: [
        'Only the first replica runs the job',
        'Every replica runs the scheduler, so the job must be idempotent — or enable clustering / use a lock',
        'CloudHub 2.0 disables schedulers on multiple replicas',
        'The job alternates between replicas',
      ],
      answer: 1,
      explain: 'Without clustering, application schedules run on all replicas independently. With clustering they run once, on the primary replica. Do not carry this over from CloudHub 1.0: the Scheduler docs say a multi-worker CloudHub deployment runs it only on the primary node.',
    },
    {
      type: 'multi',
      prompt: 'Which application changes are typically needed when moving these apps to CloudHub 2.0?',
      options: [
        'Remove `mule-worker-` URLs and DLB mapping assumptions',
        'Move in-memory state to Object Store v2 or an external store',
        'Keep using `${http.port}` instead of hard-coding the port',
        'Drop the separate HTTPS listener on 8082 when TLS now terminates at ingress',
        'Write logs to local files on the replica',
      ],
      answer: [0, 1, 2, 3],
      explain: 'In-memory state is lost when replicas restart and local log files are not the way to log — use platform logging or supported log forwarding.',
    },
    {
      type: 'single',
      prompt: 'The partner allowlists the old CH1 static IPs. What should you do?',
      options: [
        'Nothing — CloudHub 2.0 keeps the CH1 static IPs',
        'Reserve the private space egress IPs early, have the partner add them, and run both in parallel during cutover',
        'Route partner calls through the CH1 DLB forever',
        'Ask the partner to disable the allowlist',
      ],
      answer: 1,
      explain: 'Outbound traffic now comes from the private space egress IPs, so the partner\'s rules must be updated before cutover.',
    },
    {
      type: 'single',
      prompt: 'With the default **rolling update** strategy, why must the code tolerate two versions running briefly during a deployment?',
      options: [
        'CloudHub 2.0 always runs blue and green versions for a day',
        'Replicas are updated incrementally, so old and new replicas serve traffic at the same time',
        'Ingress caches responses from the old version',
        'It does not — a rolling update stops all replicas first',
      ],
      answer: 1,
      explain: 'A rolling update replaces replicas incrementally, which also means long-running work on an old replica can be interrupted. The alternative Recreate strategy terminates the replicas before redeploying.',
    },
  ],
  description: `
A company is migrating 40 apps from **CloudHub 1.0** to **CloudHub 2.0**. Today on CH1 they use:

- An **Anypoint VPC** with an **IPsec VPN** to the data centre (Oracle, SAP).
- A **Dedicated Load Balancer (DLB)** with a custom domain \`api.acme.com\` and mapping rules.
- 2 workers per Experience API, apps listening on \`$\{http.port}\` (8081).
- Static IPs whitelisted by a partner's firewall.

The migration team asks:

1. What replaces the VPC, VPN and DLB in CloudHub 2.0?
2. What is a replica, how do you scale, and what changes compared to workers?
3. How does traffic reach an app (public vs private endpoints, custom domains, TLS)?
4. Which application changes are typically needed (ports, persistence, clustering, scheduler behaviour)?
5. What happens to the partner's IP allowlist?
`,
  answerTemplate: `## What replaces VPC, VPN and DLB

## Replicas and scaling

## Ingress and endpoints

## Application changes

## Outbound IPs for the partner
`,
  keyPoints: [
    'CloudHub 2.0 runs apps as replicas in a shared space or in a private space; the private space replaces the CH1 VPC + DLB combination.',
    'A private space has its own network (CIDR), private connectivity to on-prem (VPN / transit gateway), ingress with custom domains and TLS contexts, and firewall rules.',
    'Replicas scale horizontally (count) and vertically (vCore size); the default rolling update replaces replicas incrementally, and Recreate is the alternative.',
    'Apps keep listening on the platform HTTP port property; ingress routes public/private endpoints and paths to them.',
    'Outbound traffic from a private space can use static/egress IPs that partners can allowlist — verify and update partner rules during migration.',
  ],
  solution: `
**Replacement map**
| CloudHub 1.0 | CloudHub 2.0 |
|---|---|
| Shared worker cloud | **Shared space** |
| Anypoint VPC | **Private space** (its own network, chosen CIDR, region) |
| Anypoint VPN / VPC peering / Transit Gateway | Private network connectivity of the private space (VPN, transit gateway) |
| Dedicated Load Balancer + mapping rules | **Ingress** of the private space: custom domains, TLS contexts, path routing |
| Workers | **Replicas** |
| Static IPs per app | Private space egress / static IPs |

**Replicas:** a replica is an isolated container running one instance of the app with a chosen vCore size. Scale out by increasing replica count, scale up by changing size. The default rolling update replaces replicas incrementally, so code must tolerate two versions running briefly (the Recreate strategy terminates replicas before redeploying instead). Replicas can be **clustered** (Mule clustering option) when you need cluster features such as primary-node-only schedulers or shared VM queues; otherwise each replica is independent and application schedules run on all of them. That differs from a multi-worker CH1 app, where the Scheduler docs say it runs only on the primary node, so a scheduled job can start running twice after migration.

**Ingress:** each app can have a public endpoint (platform-generated URL) and, in a private space, private endpoints. The ingress terminates TLS (with your certificates in a TLS context for \`api.acme.com\`), routes by host/path to the app, and can optionally re-encrypt to the app (last-mile security). The app itself keeps listening on the expected HTTP port — keep using \`$\{http.port}\` rather than hard-coding.

**Typical app changes**
- Remove CH1-specific assumptions: \`mule-worker-\` URLs, DLB mapping rules, port 8082 HTTPS listeners when TLS now terminates at ingress.
- **Persistence:** in-memory state is lost when replicas restart; use Object Store v2 or external stores.
- **Schedulers:** without clustering, every replica runs the scheduler — make jobs idempotent or enable clustering / use a lock.
- Logging: use platform logging or supported log forwarding; don't write to local files.
- Properties/secure properties set per deployment in Runtime Manager, as before.

**Partner allowlist:** outbound calls will come from the private space's egress IPs, not the old CH1 static IPs. Reserve the new IPs early, have the partner add them, and run both in parallel during cutover.
`,
  followUps: [
    {
      q: 'How did a CloudHub 1.0 DLB differ from the shared load balancer?',
      a: 'The shared LB provided app-name.cloudhub.io URLs with a platform certificate; a DLB gave a dedicated load balancer inside the VPC with custom certificates, custom domains, mapping rules and options like mutual TLS and IP allowlisting.',
    },
    {
      q: 'Why would you choose a shared space over a private space?',
      a: 'For apps that only need public endpoints and call public SaaS APIs — it is simpler and has no network to manage. Anything needing private connectivity or custom domains belongs in a private space.',
    },
    {
      q: 'What is the effect of a rolling update on a long-running batch job?',
      a: 'The old replica is stopped when the new one is ready, which can interrupt in-flight work. Do not count on an interrupted job resuming by itself: design jobs to be restartable and schedule deployments outside batch windows.',
    },
  ],
}
