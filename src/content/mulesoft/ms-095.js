export default {
  id: 'ms-095',
  category: 'mulesoft',
  title: 'CloudHub 2.0 Scaling: Replicas, Autoscaling, Clustering and What Actually Persists',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'replicas', 'clustering', 'autoscaling', 'object-store', 'deployment'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'An app runs with 3 replicas and **Run in Runtime Cluster Mode** off. Which statement is true?',
      options: [
        'It is highly available, but the replicas do not share data with each other',
        'The replicas share memory because they belong to the same app',
        'Only the first replica receives HTTP traffic',
        'It is not highly available until clustering is enabled',
      ],
      answer: 0,
      explain: 'High availability means multiple replicas that do not share data. Clustering is what lets replicas communicate and share data, through a distributed shared memory grid.',
    },
    {
      type: 'single',
      prompt: 'A sync job keeps its watermark in an Object Store with `persistent="true"`. It worked for months in Studio and on a standalone runtime. What happens on CloudHub 2.0 when the app restarts?',
      options: [
        'The data is lost, because `persistent="true"` writes to local disk and CloudHub 2.0 clears local storage on restart or redeploy',
        'The data is kept, because persistent object stores survive restarts on every target',
        'The data is copied to the replacement replica',
        'The app refuses to start until Object Store v2 is enabled',
      ],
      answer: 0,
      explain: 'Replica storage is volatile. Use Object Store v2, an external database or a queue for state that must survive a restart. This matters because restarts are routine: monthly patching and replica moves are both normal.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the configuration suggested by the Clustering page.',
      pairs: [
        ['Scale out, and schedules may run on every replica because the flows are idempotent', 'Two or more replicas, clustering not enabled'],
        ['Protect against message loss, avoid service interruption and handle large loads', 'Two or more replicas, clustering enabled'],
        ['No special needs for processing load or message loss', 'One replica, clustering not enabled'],
      ],
      explain: 'With clustering, schedules run once on the primary replica and object stores are shared. Without it, schedules run on all replicas and object stores are per replica unless Cloud Object Store is used.',
    },
    {
      type: 'single',
      prompt: 'A batch job takes 4 hours on 1 replica. The owner scales to 4 replicas to finish in 1 hour. What do the docs say?',
      options: [
        'Batch jobs run on a single replica at a time and cannot be distributed across replicas, so this will not shorten the job',
        'Records are spread evenly across the four replicas',
        'Batch jobs are spread only when clustering is enabled',
        'Each replica processes a quarter of the records if Object Store v2 is enabled',
      ],
      answer: 0,
      explain: 'Extra replicas help traffic that the load balancer can distribute. If the whole app is updated or redeployed during a run, the rest of the batch job does not continue.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about CPU-based horizontal autoscaling on CloudHub 2.0 are correct?',
      options: [
        'MuleSoft owns the policy, which targets 70% average CPU utilization',
        'Scale-up can happen at most every 180 seconds, adding up to 100% of the running replicas',
        'Scale-down uses a stabilization window of 1800 seconds',
        'Batch jobs and schedulers without re-entrance are poor candidates',
        'You can set your own CPU target per app in Runtime Manager',
      ],
      answer: [0, 1, 2, 3],
      explain: 'You choose the minimum and maximum replica count, not the policy. The feature depends on your licence model, and scaling can raise flow usage, so set the maximum carefully.',
    },
    {
      type: 'single',
      prompt: 'The cluster-mode app also has **Use Object Store V2** on, and finance reports unexpected Object Store usage. Why might that be?',
      options: [
        'With both enabled, all Object Store access routes to Object Store v2, including internal runtime, policy and connector usage',
        'Clustering copies every message into Object Store v2 for durability',
        'Object Store v2 is billed per replica, regardless of usage',
        'The app must have been deployed twice',
      ],
      answer: 0,
      explain: 'The Clustering page warns that this can create metered, billable usage even if your app does not explicitly use Object Store. Object Store v2 is also rate limited.',
    },
    {
      type: 'single',
      prompt: 'An app with 4 replicas is hit by platform replica rebalancing. According to the rebalancing table on the Automatic App Restarts page, how many replicas can be disrupted at once?',
      options: ['2', '1', '3', 'All 4'],
      answer: 0,
      explain: 'A maximum of 30% of replicas are rebalanced concurrently, rounded up, so 4 replicas gives 2. Even a 2-replica app has 1 disrupted, which is why apps must tolerate restarts. The same page also says at least two thirds of replicas stay available, which does not fit 2 of 4, so plan for the table figure.',
    },
  ],
  description: `
A travel company runs its booking integrations on CloudHub 2.0 and is preparing for a sale that lifts traffic about eightfold for 48 hours. The platform owner has listed the apps and asks you how each should scale.

| App | Behaviour | Today | Owner's idea |
|---|---|---|---|
| \`exp-booking\` | Stateless REST API, DataWeave transforms | 2 replicas | Enable autoscaling |
| \`prc-inventory-sync\` | Scheduler every minute, keeps a watermark in a \`persistent="true"\` object store | 1 replica | Add replicas "for safety" |
| \`prc-settlement-batch\` | Nightly batch job, 4 hours | 1 replica | 4 replicas to finish in 1 hour |
| \`prc-payment-events\` | Must not lose or double-process messages, needs a shared idempotency store | 2 replicas | Enable clustering |

A support engineer also asks why apps "randomly" restarted on a Saturday morning, and whether that is an outage.

**Questions**
1. What is the difference between scaling up, scaling out, high availability and clustering?
2. Recommend a configuration for each app.
3. What survives a restart on CloudHub 2.0, and what does not?
4. When is autoscaling a good fit? What are its rules?
5. Why do apps restart without anyone deploying them? How should you design for that?
`,
  answerTemplate: `## Scaling concepts

## Recommendation per app

## What survives a restart

## Autoscaling

## Automatic restarts
`,
  keyPoints: [
    'Replica size is vertical scaling, replica count is horizontal scaling. HTTP load balancing distributes requests round-robin across replicas.',
    'Multiple replicas give high availability without shared data. Clustering lets replicas share data through a distributed memory grid; it needs at least two replicas and a suitable subscription.',
    'CloudHub 2.0 replica storage is volatile: persistent="true", files on local disk and local caches do not survive a restart. Use Object Store v2 or external storage.',
    'Without clustering, schedules run on every replica and object stores are per replica unless Cloud Object Store is used. With clustering, schedules run on the primary replica and can be missed during lead election.',
    'Batch jobs run on a single replica at a time and cannot be distributed across replicas. Persistent VM queues are not supported on CloudHub 2.0.',
    'CPU-based autoscaling follows a MuleSoft-owned policy (70% target, scale-up at most every 180 s, 1800 s scale-down window). You set minimum and maximum replicas.',
    'Restarts come from infrastructure maintenance, monthly security patching, crashes and rebalancing. Karpenter node downscaling can restart apps in a weekly window in private spaces.',
  ],
  solution: `
**Concepts.**
- **Scale up:** a larger replica size for more CPU, memory and storage.
- **Scale out:** more replicas. The load balancer distributes HTTP requests round-robin, and replicas are spread across two or more availability zones.
- **High availability:** multiple replicas. If an availability zone fails, the app is restarted in another one. Replicas do not share data.
- **Clustering:** replicas act as a unit and share data through a distributed shared memory grid. It requires at least two replicas and the relevant subscription, and an already deployed app must be redeployed for the setting to take effect.

The maximum replica count depends on your subscription; the Clustering page gives the current figures.

**Recommendation per app.**
- \`exp-booking\`: a good fit for CPU-based autoscaling, as stateless HTTP and DataWeave workloads scale with CPU. Set a realistic maximum, and load test before the sale. Scale-up takes time, so raise the minimum ahead of a planned peak.
- \`prc-inventory-sync\`: do **not** add plain replicas, because the schedule would then run on every replica. Move the watermark to Object Store v2 or a database. If you want more than one replica, enable clustering so the schedule runs on the primary replica, accepting that a run can be missed during lead election.
- \`prc-settlement-batch\`: more replicas will not help, because batch jobs run on a single replica at a time. Use a larger replica, tune the job, or split the work across apps. Avoid deploying during the batch window: if the whole app is updated or redeployed, the rest of the job does not continue. Autoscaling is not a good fit.
- \`prc-payment-events\`: clustering (two or more replicas) plus idempotent processing and external persistence fits, in line with the Clustering page's advice for high-stakes processes. Review the billing note if you combine clustering with Object Store v2.

**What survives a restart.**
| Item | After a restart |
|---|---|
| Object store with \`persistent="true"\` on local disk | Lost |
| Files written by the File connector to the replica | Deleted |
| App-generated files, custom logs, local caches | Lost |
| Object Store v2, external database, Anypoint MQ | Kept |

Object Store v2 is regional and rate limited, and it has no region failover. A cross-region design needs your own external store. Persistent VM queues are not supported on CloudHub 2.0.

**Autoscaling.** You choose minimum and maximum replicas; MuleSoft owns the policy. It targets 70% average CPU. Scale-up has no stabilization window but happens at most every 180 seconds, adding up to 100% of the running replicas. Scale-down looks at a 1800-second window. It suits CPU-bound work such as HTTP APIs, proxies, DataWeave and APIkit routing. It does not suit batch jobs, non-reentrant schedulers, or low-throughput, high-latency apps with large requests. Availability depends on your licence model, and scaling can increase flow usage.

**Automatic restarts.** CloudHub 2.0 restarts apps for infrastructure failure or maintenance, monthly security patching, replica crashes and rebalancing. In private spaces, Karpenter node downscaling can restart apps once a week at most, within a window from Friday 10:00 PM to Saturday 6:00 AM in the region's local time. If these apps run in a private space, that would explain the Saturday restarts: the docs call them routine maintenance, not an outage. Design for it: idempotent processing, multiple replicas and external persistence. For infrastructure-triggered restarts the platform gives a grace period of up to 12 hours; user-triggered restarts honour your configured \`shutdownTimeout\`.
`,
  followUps: [
    {
      q: 'What is the difference between Rolling Update and Recreate?',
      a: 'Rolling Update replaces replicas incrementally with zero downtime, so two versions run side by side. Recreate terminates replicas first; it is quicker and needs no additional resources, but it causes a brief outage.',
    },
    {
      q: 'Does a rate-limiting policy still work after you scale out?',
      a: 'Rate-limiting policies apply at the replica level, as the High Availability and Disaster Recovery page notes, so the effective limit needs review when the replica count changes.',
    },
    {
      q: 'Which replica sizes burst?',
      a: 'Replicas with fewer than 1 vCore can burst for a short time, but this depends on node resources and is not guaranteed. Replicas with 1 or more vCores provide performance consistency.',
    },
    {
      q: 'Does adding replicas protect you if a whole region fails?',
      a: 'No. CloudHub 2.0 does not automatically replicate apps to other regions. Cross-region disaster recovery is your responsibility, typically with a load balancer of your own in front of two regions.',
    },
  ],
}
