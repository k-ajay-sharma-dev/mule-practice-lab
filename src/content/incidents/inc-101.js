export default {
  id: 'inc-101',
  category: 'incidents',
  title: 'A Partner Sends Three Times Its Quota on a Hybrid Server Group Although Distributed Is Ticked',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-management', 'rate-limiting', 'sla-tiers', 'runtime-manager', 'deployment', 'hybrid'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: 'Vendor invoice: credit-check calls for October 2.9x the volume allowed by the partner plans', relevant: true, why: 'The extra calls passed the gateway, so the limit is not holding across the estate.' },
      { text: '10:00:04 INFO  [node-1 proxy] client lendfast 200, X-RateLimit-Limit: 1000, X-RateLimit-Remaining: 12', relevant: true, why: 'Node 1 has counted about 988 requests in this window.' },
      { text: '10:00:04 INFO  [node-2 proxy] client lendfast 200, X-RateLimit-Limit: 1000, X-RateLimit-Remaining: 31', relevant: true, why: 'Node 2 has its own count at the same moment, which shows separate quotas.' },
      { text: '10:00:04 INFO  [node-3 proxy] client lendfast 200, X-RateLimit-Limit: 1000, X-RateLimit-Remaining: 44', relevant: true, why: 'Three nodes with three counters: about 2,900 requests in one window.' },
      { text: '10:00:05 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: 'Policy config: Rate Limiting SLA, Distributed: true, Expose Headers: true', relevant: true, why: 'The option is ticked, which is why the team believed the quota was shared.' },
      { text: 'Runtime Manager: target "credit-proxy-group", type Server Group, 3 servers Running', relevant: true, why: 'A server group is not a Mule HA cluster. Instances run in isolation.' },
      { text: '10:02:11 INFO  [runtime] Agent heartbeat OK', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why is the quota not shared?',
        options: [
          'Distributed shares the quota only when the runtime runs in Mule HA cluster mode; on a server group it has no effect and each node enforces the quota on its own',
          'Distributed works, but it needs 24 hours to synchronize',
          'The contract was created for one node only',
          'X-RateLimit headers disable the shared counter',
        ],
        answer: 0,
        explain: 'The policy page states this in a note. The logs show three separate counters, and Runtime Manager shows a server group, where application instances run in isolation.',
      },
      {
        type: 'single',
        prompt: 'What quick change reduces the overrun today, with no change in infrastructure?',
        options: [
          'Lower the tier limit to about a third, so that the three nodes together stay near the agreed volume',
          'Tick Distributed again and redeploy',
          'Remove the proxy from two nodes without telling anyone',
          'Turn off Expose Headers',
        ],
        answer: 0,
        explain: 'Each node enforces the tier limit, so the total is about three times the limit when traffic is balanced. It is an approximation: with unbalanced traffic, a client can be limited early on one node.',
      },
      {
        type: 'multi',
        prompt: 'Which statements about the long-term fix with a Mule cluster are correct?',
        options: [
          'In a cluster with Distributed on, the whole cluster accepts the quota once',
          'Distributed counters can add latency, so the docs recommend windows longer than one minute in a cluster',
          'All servers in a cluster need the same Mule runtime and agent versions',
          'A cluster can have up to eight servers',
          'Spike Control would also share its window across the cluster',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Spike Control cannot be clustered; it protects each gateway instance. The window recommendation means a per-minute quota should be reviewed when the design moves to a cluster.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm the separate counters from the X-RateLimit headers on each node',
          'Confirm that the target is a server group, not a cluster',
          'Lower the tier limit as a stop-gap, after telling partners',
          'Decide between a Mule cluster and per-node limits as the permanent design',
          'Test the agreed quota under load across all nodes before go-live',
        ],
        explain: 'Prove the cause, reduce the cost, then fix the design and test it across nodes.',
      },
    ],
  },
  description: `
## Symptoms
- A credit-check vendor charges per call. October's invoice is about **2.9 times** what the partner plans should allow.
- Partner \`lendfast\` has a Gold tier of **1,000 requests per minute** and appears to be sending about 2,900 per minute with no 429s.
- The API looks healthy.

## Change / Context
- \`credit-check-proxy\` is a Mule API proxy in front of the vendor. It has run on-premises in a Runtime Manager **server group** of three servers, behind a round-robin load balancer, since a capacity upgrade in September.
- Before September it ran on a single server, and the limits held.
- The policy is **Rate Limiting SLA** with **Distributed** ticked. The engineer who ticked it says: "That makes the three nodes share the quota."

## Logs
\`\`\`
10:00:04 [node-1] client lendfast 200, X-RateLimit-Limit: 1000, X-RateLimit-Remaining: 12
10:00:04 [node-2] client lendfast 200, X-RateLimit-Limit: 1000, X-RateLimit-Remaining: 31
10:00:04 [node-3] client lendfast 200, X-RateLimit-Limit: 1000, X-RateLimit-Remaining: 44
Policy: Rate Limiting SLA, Distributed: true
Runtime Manager: target "credit-proxy-group", type Server Group, 3 servers
\`\`\`

## Your tasks
1. What is the root cause?
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
    'Distributed shares a quota only in a Mule HA cluster. Otherwise it has no effect, and each node enforces the quota on its own.',
    'A server group is one deployment target, but its application instances run in isolation.',
    'Three nodes with balanced traffic allow about three times the limit.',
    'X-RateLimit headers on each node show separate counters, and this is quick evidence.',
    'Stop-gap: set the tier to about a third. It is approximate, because the load balancer may not split traffic evenly.',
    'Permanent options: a Mule cluster with Distributed, or keep separate nodes with per-node limits and accept the approximation.',
    'In a cluster, distributed counters add latency, and the docs recommend windows longer than one minute.',
  ],
  solution: `
**Diagnosis.** Each node reports its own \`X-RateLimit-Remaining\` at the same moment, so each has its own counter. The policy page says the **Distributed** option shares the quota only when Mule runs as part of a Mule high-availability cluster. If not, enabling it has no effect, and each node enforces the quota independently. The target is a server group, where application instances run in isolation from each other. So 1,000 per minute became up to 3,000 per minute.

**Immediate mitigation.**
- Lower the Gold limit to about 333 per minute, and the other tiers in the same way. Tier edits apply immediately. Tell partners that they may see 429s earlier on a busy node.
- Tell finance about the overrun.

**Root cause.** The scale-out in September changed the meaning of every limit. The option's name suggested it would work on any multi-node target, and nobody tested the quota across nodes.

**Permanent fix.** There are two documented paths.
1. **Mule cluster.** Create a cluster and deploy the proxy to it, with Distributed on. The whole cluster then accepts the quota once. Plan for latency: the docs say distributed counters can add it, and they recommend windows longer than one minute in a cluster. Check that the servers have the same Mule runtime, agent and Java versions, and choose unicast or multicast with the network team.
2. **Separate nodes.** The Rate Limiting page says that with several servers, one backend and a load balancer, you do not need a cluster. But it says you must set the limit below the capacity of the backend. This fits protection, but it is weak for a per-client commercial limit like this one.

Because the vendor charges per call and the contract limit matters, the cluster is the better fit. Note that the Rate Limiting SLA page says a Mule cluster cannot be configured on CloudHub; this feature is for Runtime Fabric, hybrid and standalone setups.

**Prevention.** Add to the scale-out checklist: "Review every limit that assumes a number of nodes." Test quotas across all nodes before go-live. Reconcile vendor invoices with gateway counts each month.
`,
  followUps: [
    { q: 'Would Spike Control have stopped this?', a: 'Not as a commercial limit. It protects each gateway instance, has no per-client quota, and cannot be clustered. In a three-node setup, each node has its own window.' },
    { q: 'Why did the limits hold before September?', a: 'With one server there was one counter, so Distributed made no difference. The problem appeared only when there were several nodes.' },
    { q: 'What happens to the counters on a restart?', a: 'On Mule, persistence is on by default and saves the policy state, every 10 seconds by default, so algorithms can be recreated from the last saved state. The docs say persistence is not available on CloudHub.' },
  ],
}
