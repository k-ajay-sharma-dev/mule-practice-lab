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
      prompt: 'An app runs on CloudHub 2.0 as 1 replica of 0.5 vCore. At peak its CPU is maxed out, and the business now also wants the API to stay up when a replica fails. Which change covers both needs?',
      options: [
        'Raise the vCore size to 1, and rely on CloudHub 2.0 to restart a failed replica',
        'Enable clustering on the replica, so a standby node takes over on failure',
        'Run 2 or more replicas of 0.5 vCore behind the same ingress',
        'Raise the vCore size to 2, which also places the app on two nodes',
      ],
      answer: 2,
      explain: 'More replicas is horizontal scaling: it adds capacity and also removes the single point of failure. A larger vCore is vertical scaling, so it helps CPU but one replica is still one failure away from an outage. Any vCore size is still one replica in one place. Clustering coordinates several replicas, and one replica gets no standby from it. CloudHub 2.0 does restart a failed replica, but the API is down until it is back.',
    },
    {
      type: 'single',
      prompt: 'A Scheduler-driven job runs on 2 replicas with clustering **disabled**. What happens?',
      options: [
        'Only the first replica to start runs the job',
        'Each replica runs its own copy of the schedule',
        'CloudHub 2.0 pauses schedulers when there are 2+ replicas',
        'The ingress hands each run to one replica in turn',
      ],
      answer: 1,
      explain: 'So the job must be idempotent, or you enable clustering or use a lock. Without clustering, application schedules run on all replicas independently. With clustering they run once, on the primary replica. Do not carry this over from CloudHub 1.0: the Scheduler docs say a multi-worker CloudHub deployment runs it only on the primary node.',
    },
    {
      type: 'single',
      prompt: 'An app moves from CloudHub 1.0 to CloudHub 2.0. It keeps some state in memory that must survive a restart. What should change?',
      options: [
        'Hold it in a persistent VM queue, which survives a replica restart',
        'Put it in Object Store v2 or an external database',
        'Write it to a file under `/tmp`, which the replica keeps across restarts',
        'Keep it in memory, and add replicas so that a copy survives',
      ],
      answer: 1,
      explain: 'In-memory state is lost when replicas restart, so use Object Store v2 or an external store. CloudHub 2.0 does not support persistent VM queues, a replica\'s local disk does not survive a restart, and each replica holds its own memory, so extra replicas keep no shared copy. Other typical changes: remove `mule-worker-` URLs and DLB mapping assumptions, keep using `${http.port}` instead of hard-coding the port, and drop the separate HTTPS listener on 8082 when TLS now terminates at ingress. Local log files are not the way to log either: use platform logging or supported log forwarding.',
    },
    {
      type: 'single',
      prompt: 'The partner allowlists the old CH1 static IPs. What should you do?',
      options: [
        'Nothing, because CloudHub 2.0 keeps the CH1 static IPs',
        'Have the partner add the private space egress IPs first',
        'Keep routing partner calls through the old CH1 DLB',
        'Use the shared space, whose IPs the partner already allows',
      ],
      answer: 1,
      explain: 'Outbound traffic now comes from the private space egress IPs, so the partner\'s rules must be updated before cutover. Reserve the new IPs early and allow both sets during cutover. The shared space has no IPs the partner knows.',
    },
    {
      type: 'single',
      prompt: 'With the default **rolling update** strategy, why must the code tolerate two versions running briefly during a deployment?',
      options: [
        'CloudHub 2.0 keeps blue and green versions for a day',
        'Replicas are replaced one at a time, so old and new overlap',
        'Ingress caches responses from the old version for a while',
        'It does not, because a rolling update stops all replicas first',
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
    'Outbound traffic from a private space can use static/egress IPs that partners can allowlist. Verify and update partner rules during migration.',
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

**Ingress:** each app can have a public endpoint (platform-generated URL) and, in a private space, private endpoints. The ingress terminates TLS (with your certificates in a TLS context for \`api.acme.com\`), routes by host/path to the app, and can optionally re-encrypt to the app (last-mile security). The app itself keeps listening on the expected HTTP port. Keep using \`$\{http.port}\` rather than hard-coding.

**Typical app changes**
- Remove CH1-specific assumptions: \`mule-worker-\` URLs, DLB mapping rules, port 8082 HTTPS listeners when TLS now terminates at ingress.
- **Persistence:** in-memory state is lost when replicas restart; use Object Store v2 or external stores.
- **Schedulers:** without clustering, every replica runs the scheduler. Make jobs idempotent or enable clustering / use a lock.
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
      a: 'For apps that only need public endpoints and call public SaaS APIs. It needs less setup and has no network to manage. Anything needing private connectivity or custom domains belongs in a private space.',
    },
    {
      q: 'What is the effect of a rolling update on a long-running batch job?',
      a: 'The old replica is stopped when the new one is ready, which can interrupt in-flight work. Do not count on an interrupted job resuming by itself: design jobs to be restartable and schedule deployments outside batch windows.',
    },
  ],
}
