export default {
  id: 'ar-137',
  category: 'architecture',
  title: 'Runtime Fabric Capacity Planning for 60 Applications: Reserved CPU, Memory, Node Loss and Rolling Updates',
  level: 'INTERMEDIATE',
  tags: ['runtime-fabric', 'capacity-planning', 'sizing', 'kubernetes', 'high-availability', 'deployment', 'cost'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'When Kubernetes decides whether a Mule app replica fits on a worker node, which numbers does it compare with the free capacity of the node?',
      options: [
        'The reserved CPU and the memory of the replica',
        'The CPU limit and the memory of the replica',
        'The average CPU the replica used last week',
        'The number of flows in the app',
      ],
      answer: 0,
      explain: 'The scheduler places a pod by its requests. On Runtime Fabric the reserved CPU is the request, and memory is reserved in full. The CPU limit is only a ceiling for bursting, so it plays no part in placement. This is why capacity plans add up reserved CPU, not limits.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Add up the reserved CPU for all replicas: 40 small apps and 20 large apps, each with 2 replicas. How much reserved CPU is that in total?',
      options: ['80 vCPU', '60 vCPU', '160 vCPU', '40 vCPU'],
      answer: 0,
      explain: 'Small apps: 40 x 2 replicas x 0.5 vCPU = 40 vCPU. Large apps: 20 x 2 x 1 vCPU = 40 vCPU. The total is 80 vCPU. 160 would be the sum of the CPU limits, which do not count for placement.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Each worker node has 14 vCPU and 58 GiB that apps can use. Memory for all replicas is 240 GiB. How many nodes do you need before you plan for any failure?',
      options: [
        '6 nodes, because CPU needs 80 / 14 = 5.7 and memory needs only 240 / 58 = 4.1',
        '5 nodes, because memory is the resource that matters for Mule',
        '12 nodes, sized on the CPU limits',
        '4 nodes, because replicas can burst into idle CPU',
      ],
      answer: 0,
      explain: 'Work out each resource and take the larger number. CPU needs 6 nodes and memory needs 5, so CPU decides: 6 nodes. Bursting is not a reason to plan fewer nodes, because it only uses CPU that is idle at that moment.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The business wants every app to keep running if one worker node fails. What is the smallest node count that still fits all reserved capacity after a node is lost, and what setting makes it work?',
      options: [
        '7 nodes, with the option to spread replicas across nodes turned on, so a lost node takes only one replica of each app',
        '6 nodes, because the second replica of each app takes over',
        '12 nodes, two for every node you need',
        '7 nodes, with every replica of an app on the same node so they restart together',
      ],
      answer: 0,
      explain: 'Plan for N + 1: after one of 7 nodes fails, 6 remain, which hold the 80 vCPU. Spreading replicas across nodes means the second replica keeps serving while Kubernetes starts a new one on the remaining nodes. With 6 nodes, the replicas from the lost node would have nowhere to start.',
    },
    {
      type: 'single',
      prompt: 'A large app runs out of heap under load. Its replica uses more memory than it was given. What happens?',
      options: [
        'The container is stopped for using too much memory and Kubernetes restarts it, because memory does not burst like CPU',
        'The replica borrows free memory from the node, the same way CPU bursts',
        'Runtime Fabric moves the replica to a larger node',
        'The replica slows down but keeps running',
      ],
      answer: 0,
      explain: 'On Runtime Fabric the memory you set is both reserved and the limit. Going over the limit ends the container, usually reported as OOMKilled. Size memory for the peak, and fix leaks in the app, because restarts drop in-flight work.',
    },
    {
      type: 'match',
      prompt: 'Match each deployment setting to what it does for capacity planning.',
      pairs: [
        ['Reserved CPU', 'The guaranteed share that the scheduler counts when it places a replica'],
        ['CPU limit', 'The ceiling a replica can burst to when the node has idle CPU'],
        ['Rolling update deployment model', 'Starts a new replica before an old one stops, so it needs spare room during a deploy'],
        ['Recreate deployment model', 'Stops the old replicas first, so it needs no spare room but causes downtime'],
      ],
      explain: 'Plan with reserved CPU and memory, treat the CPU limit as a bonus, and leave room for the extra replica that a rolling update starts. The N + 1 node that covers a node failure usually also covers rolling updates, as long as only a few apps deploy at the same time.',
    },
    {
      type: 'multi',
      prompt: 'Besides the Mule app replicas, what uses capacity on the worker nodes that the plan must leave room for?',
      options: [
        'The operating system and the Kubernetes node components such as the kubelet',
        'The Runtime Fabric agent and its supporting components',
        'Monitoring and log forwarding components that run next to the apps',
        'The Anypoint MQ broker that the apps publish to',
        'The Object Store v2 service',
      ],
      answer: [0, 1, 2],
      explain: 'Node capacity is never fully available to apps. The operating system, Kubernetes, the Runtime Fabric components and monitoring all reserve some of it, which is why the plan uses 14 of 16 vCPU and 58 of 64 GiB. Anypoint MQ and Object Store v2 are cloud services that run outside the cluster.',
    },
    {
      type: 'single',
      prompt: 'A node shows 3 vCPU free but only 2 GiB of memory free. A new replica needs 0.5 vCPU and 3 GiB. What happens?',
      options: [
        'The replica cannot be placed on that node, because both CPU and memory must fit',
        'It is placed, because CPU is the deciding resource',
        'It is placed with 2 GiB, and the rest is added later',
        'Runtime Fabric reduces the reserved CPU to make room',
      ],
      answer: 0,
      explain: 'A replica must fit on one node for every resource. Free capacity spread across several nodes does not help either. Keep app sizes to a few standard shapes, so replicas pack well and spare room is not wasted.',
    },
  ],
  description: `
A distributor is moving **60 Mule applications** to **Runtime Fabric** on its own managed Kubernetes cluster. Every app runs **2 replicas** for high availability.

| App size | Apps | Reserved CPU per replica | CPU limit per replica | Memory per replica |
|---|---|---|---|---|
| Small | 40 | 0.5 vCPU | 1 vCPU | 1.5 GiB |
| Large | 20 | 1 vCPU | 2 vCPU | 3 GiB |

Total memory for all replicas: 40 x 2 x 1.5 + 20 x 2 x 3 = **240 GiB**.

The planned worker nodes have **16 vCPU and 64 GiB**. After the operating system, Kubernetes, Runtime Fabric components and monitoring, about **14 vCPU and 58 GiB** per node are left for apps.

Other facts:
- Apps are deployed with **rolling updates**, a few at a time, by the CI/CD pipeline.
- The business wants every app to keep running if **one worker node** fails.
- Finance asks why the plan has more nodes than the sum of the CPU needed.

Each question is a decision the platform architect has to make or explain.
`,
  answerTemplate: `## What the scheduler counts

## CPU and memory totals

## Nodes for the steady state

## Nodes for a node failure

## Deployments and spare room
`,
  keyPoints: [
    'Kubernetes places replicas by reserved CPU and memory. The CPU limit is only a ceiling for bursting.',
    'Add up reserved CPU and memory for every replica, and size for the resource that needs more nodes.',
    'Memory does not burst: going over the limit ends the container.',
    'Use only what nodes can give to apps, after the operating system, Kubernetes and Runtime Fabric components.',
    'Plan N + 1 nodes and spread replicas across nodes, so one node failure leaves every app running.',
    'Rolling updates need spare room for a new replica before the old one stops.',
    'A replica must fit on one node for every resource, so a few standard app sizes pack better.',
  ],
  solution: `
**Totals.** Reserved CPU: 40 x 2 x 0.5 + 20 x 2 x 1 = **80 vCPU**. Memory: **240 GiB**. CPU limits add up to 160 vCPU, but they do not count for placement.

**Steady state.** CPU: 80 / 14 = 5.7, so 6 nodes. Memory: 240 / 58 = 4.1, so 5 nodes. CPU decides: **6 nodes**.

**Node failure.** Add one node: **7 nodes**. Turn on the option to spread replicas across nodes, so each node holds at most one replica of an app. When a node fails, every app still has a replica, and the lost replicas start again on the other 6 nodes.

**Rolling updates.** A rolling update starts a new replica before the old one stops. With 7 nodes there is about 18 vCPU of spare room when all nodes are healthy, enough for several updates at once. During a node failure that room is gone, so pause deployments until the node is back.

**For finance.** The plan has 98 vCPU usable for 80 vCPU of reserved CPU. The extra 18 vCPU is the price of surviving a node failure and deploying without downtime. Bursting to the CPU limits uses idle CPU on the nodes, which is a bonus and is never counted on.

**Next steps.** Measure real usage after go-live and adjust the reserved CPU of each app. Many apps reserve more than they use, and lowering it frees capacity without adding nodes.
`,
  followUps: [
    {
      q: 'Why not size the cluster on the CPU limits to be safe?',
      a: 'That nearly doubles the nodes here, from 7 to 13. Limits are a ceiling for short bursts, and most apps never reach them at the same moment.',
    },
    {
      q: 'Could you run one replica per app and save half the capacity?',
      a: 'Only for apps that can be down while a replica restarts. A single replica stops serving during every deploy and every node failure.',
    },
    {
      q: 'What changes if the nodes are spread over three availability zones?',
      a: 'Keep the replicas of each app in different zones, and plan enough spare room to lose a whole zone if that is the target. That usually means more than one spare node.',
    },
  ],
}
