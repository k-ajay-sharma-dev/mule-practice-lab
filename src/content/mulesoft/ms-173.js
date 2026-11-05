export default {
  id: 'ms-173',
  category: 'mulesoft',
  title: 'Inside a Mule Cluster: the Hazelcast Grid, Primary Node, Schedulers, VM Queues and How Each Connector Type Behaves',
  level: 'EXPERT',
  tags: ['deployment', 'clustering', 'hazelcast', 'high-availability', 'vm-queues', 'scheduler', 'on-prem', 'performance'],
  estMinutes: 40,
  quiz: [
    {
      type: 'multi',
      prompt: 'The nodes of a Mule cluster share a distributed memory grid. Which three of these does the grid cover?',
      options: [
        'Persistent and non-persistent object stores',
        'Persistent and transient VM queues',
        'The Mule runtime LockFactory',
        'The application JAR files, copied from node to node',
        'A virtual IP that clients connect to',
      ],
      answer: [0, 1, 2],
      explain: 'A cluster does not distribute application artifacts and does not create a virtual IP or include a load balancer. You deploy the same app to each node or through Runtime Manager, and supply your own load balancer.',
    },
    {
      type: 'single',
      prompt: 'A flow calls a child flow with `flow-ref`, then publishes to a VM queue that another flow listens on. On which node does each part run?',
      options: [
        'The `flow-ref` call stays on the node where the event began; a transition through a VM queue can move to another active node',
        'Every processor can run on a different node',
        '`flow-ref` is load balanced, and VM queues stay on the same node',
        'Everything always runs on the primary node',
      ],
      answer: 0,
      explain: 'Execution stays on one node until you explicitly go through a VM queue. Publishing to a VM queue is how you share work between nodes, and both persistent and transient queues use the grid.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An app has a Scheduler, a JMS listener left at its defaults, and an HTTP listener. On a three-node cluster, which statement is right?',
      options: [
        'The Scheduler runs only on the primary node; the JMS On New Message source has "primary node only" selected by default; the HTTP listener receives traffic on each node that the load balancer sends it to',
        'All three run on all nodes',
        'All three run only on the primary node',
        'The Scheduler runs on all nodes, and JMS runs only on the primary node',
      ],
      answer: 0,
      explain: 'A Scheduler source only runs on the primary polling node. Other sources are controlled by `primaryNodeOnly`, and the default is chosen by each connector\'s developers, so check the connector docs.',
    },
    {
      type: 'match',
      prompt: 'Match each connector family to how it behaves in a cluster.',
      pairs: [
        ['HTTP, TCP and UDP (socket-based)', 'Each node receives only the traffic sent to it, so a load balancer distributes it'],
        ['JMS and VM (listener-based)', 'Multiple readers and writers are fully supported'],
        ['File, FTP, SFTP, Email and JDBC (resource-based)', 'The cluster coordinates access so that only one instance accesses each resource at a time'],
      ],
      explain: 'For resource-based connectors the docs advise writing messages to VM queues straight away, so other nodes can take part in the processing.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team sets `mule.cluster.storeprofile=performance` to reduce grid traffic. What exactly changes?',
      options: [
        'Distributed queues are disabled in favour of local queues, and the object store runs without backups, so data associated with a failed node is lost',
        'Object stores stop being shared between nodes',
        'The cluster stops electing a primary node',
        'All Hazelcast traffic is encrypted',
      ],
      answer: 0,
      explain: 'Memory sharing is unaffected: in cluster mode Mule always distributes and shares the object stores between nodes. The docs also warn that the profile can hurt performance with sources that do not load balance, such as HTTP without a load balancer. App-level configuration overrides the container level.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about the Quorum feature are documented?',
      options: [
        'It can only be configured manually, with `mule.cluster.quorumsize` in `{MULE_HOME}/.mule/mule-cluster.properties`',
        'It is only supported in Object Store-related operations',
        'Below the configured size, a `QuorumException` is thrown, and you should catch it',
        'It also protects VM connector messages and Idempotent Redelivery',
        'A partition without enough nodes stops answering external calls',
      ],
      answer: [0, 1, 2],
      explain: 'Distributed locking and in-memory messaging are not supported with Quorum, which affects file polling, idempotent components and VM. A partition that is too small keeps reacting to external calls, but all object store operations fail.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Nodes fail to form a cluster set up with Runtime Manager default ports. What should the firewall allow between nodes?',
      options: [
        'TCP 5701, 5702 and 5703 in both directions; and, if multicast is used, UDP 54327 and the multicast address 224.2.2.3',
        'Only outbound TCP 443',
        'Only TCP 8081',
        'Only UDP 5701',
      ],
      answer: 0,
      explain: 'The cluster prerequisites list these ports. Manual clusters use 5701 unless `mule.cluster.nodes` specifies another port. Multicast is not available on Amazon Web Services.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A node logs `NoDataMemberInClusterException`. What does it mean, and what is the documented action?',
      options: [
        'Hazelcast has no data member that can serve a partition, after node loss, split brain or lost quorum; restore enough nodes, and reduce the quorum only if you accept weaker consistency',
        'The license has expired; install a new one',
        'A deployed app has no VM queue; redeploy it',
        'The JDBC store is full; add disk',
      ],
      answer: 0,
      explain: 'The cluster overview gives this troubleshooting entry. Check `mule.cluster.quorumsize` and how many nodes are running.',
    },
  ],
  description: `
A bank is reviewing a **three-node Mule cluster** that runs payment apps on one LAN. Before signing off, the review board asks the integration team to explain how the cluster really works:

- An order flow reads files with SFTP, then runs five long steps. Only one node is busy.
- A Scheduler job must run once per cycle. A JMS listener handles strictly serial messages.
- HTTP APIs sit behind a hardware load balancer.
- Object Store is used heavily by one app, and the team thinks clustering should make it faster.
- A manager asks whether the performance profile is a free gain.
- The security team asks whether traffic between nodes is encrypted.

**Questions**
1. What is shared between nodes, and what is not?
2. Where does each kind of source run, and how do you influence that?
3. Why is only one node busy in the SFTP flow, and how would you fix it?
4. What does the performance profile do? When would you avoid it?
5. How do Quorum, encryption and the cluster ports work?
6. How do you think about scale, node limits and upgrades?
`,
  answerTemplate: `## What is shared

## Where sources run

## Spreading the SFTP work

## Performance profile

## Quorum, encryption and ports

## Scale and upgrades
`,
  keyPoints: [
    'A cluster is a set of engines acting as one unit, with a distributed shared memory grid. The troubleshooting docs identify the grid as Hazelcast.',
    'The grid holds object stores, VM queues and the LockFactory. It does not distribute apps, and it provides no virtual IP or load balancer.',
    'All nodes are active. The primary node runs Schedulers and sources marked primary node only.',
    'A Scheduler always runs on the primary node. Other sources use `primaryNodeOnly`, with connector-specific defaults. The JMS listener selects it by default.',
    'Flow references stay on the same node. VM queues are the way to share work between nodes.',
    'Socket-based, listener-based and resource-based connectors behave differently.',
    'Heavy Object Store use can degrade, because of the work to replicate or coordinate data.',
    'The performance profile disables distributed queues and object store backups; data on a failed node is lost.',
    '`mule.cluster.network.encryption.key` encrypts node traffic with AES.',
    'Quorum is manual-only and limited to Object Store operations.',
    'Runtime Manager defaults use TCP 5701 to 5703. Multicast adds UDP 54327 and 224.2.2.3.',
    'MuleSoft recommends scaling to no more than eight engines. All nodes need the same Mule, agent and Java versions.',
  ],
  solution: `
**1. What is shared.** The nodes share persistent and non-persistent object stores, persistent and transient VM queues, and the runtime LockFactory through a replicated memory grid. Applications are not shared: the same app is deployed to each node or through Runtime Manager. There is no virtual IP and no built-in load balancer.

**2. Where sources run.** The model is active-active, but one node acts as primary.
- *Scheduler:* only on the primary polling node.
- *Other sources:* controlled by \`primaryNodeOnly\`. The JMS source selects it by default, which suits the strict serial case; most connector sources do not. To let every node consume, clear it.
- *HTTP:* each node receives only what is sent to its own socket, so the load balancer does the distribution.

**3. Spreading the SFTP work.** SFTP is a resource-based connector, so the cluster coordinates access and one instance reads the resource at a time. All five steps then run on that node, because execution, including \`flow-ref\`, stays where the event began. The docs give the fix: write each message to a VM queue immediately, and link the steps with VM publish and listener pairs. Every transition can then move to whichever node is available. Use transactions or a reliability pattern so that a message moves from one transactional store to the next.

**4. Performance profile.** \`mule.cluster.storeprofile=performance\` (in \`mule-cluster.properties\`, as a system property or in \`wrapper.conf\`) replaces distributed queues with local queues and removes object store backups. Use it only for an app where losing the data on a failed node is acceptable. It also removes the VM load sharing described above, and the docs warn it can degrade performance for file-based connectors with asynchronous processing, JMS topics, multicasting or HTTP without a load balancer. Apps can opt back in with \`cluster:reliable-store-profile\`. This cluster runs payments, so the answer is no.

The team's Object Store expectation is also wrong: not all apps get faster when clustered, and apps that depend heavily on Object Store can degrade because of replication and coordination work.

**5. Quorum, encryption and ports.**
- Quorum applies when a network splits: \`mule.cluster.quorumsize\` rejects updates below a minimum number of nodes, with a \`QuorumException\` that the app should catch. It is manual only and covers only Object Store operations.
- Encryption: define the same \`mule.cluster.network.encryption.key\` on every node, in \`wrapper.conf\` or as a system property. Traffic is then encrypted with AES.
- Ports: TCP 5701, 5702 and 5703 with Runtime Manager defaults, open in both directions. Multicast additionally needs UDP 54327 and 224.2.2.3.

**6. Scale and upgrades.** MuleSoft recommends no more than eight engines, and Runtime Manager clusters have a hard limit of eight servers. Keep nodes on one LAN. Do not mix manual and Runtime Manager administration: changes in the platform override the configuration files. All nodes need the same Mule, Runtime Manager agent and Java versions. During a version upgrade the cluster can be in a mixed state with incompatible Hazelcast communication, and then every node must be shut down, so zero downtime cannot be guaranteed.
`,
  followUps: [
    {
      q: 'Can a server group replace this cluster to avoid the licence cost?',
      a: 'Not for this design. Without clustering, nodes can process files twice, get every JMS topic message as separate subscribers, mismatch JMS request-reply responses and use separate idempotency stores. The Salesforce streaming API also supports a single consumer only.',
    },
    {
      q: 'How do you monitor the cluster itself?',
      a: 'For manual clusters you can set `mule.cluster.jmxenabled` to expose member events through JMX, which can add some overhead, and `mule.cluster.listenersenabled` for membership notifications. Runtime Manager can raise alerts when nodes go down and come back up.',
    },
    {
      q: 'What keeps state if every node stops?',
      a: 'Nothing in the grid. Without a centralized JDBC store, shutting down all nodes loses object store content whatever the persistent setting. See the Object Store choices problem for that configuration.',
    },
    {
      q: 'Do clusters work the same on Runtime Fabric?',
      a: 'Runtime Fabric offers a deployment-time option to run the replicas in cluster mode (`clustered` or Run in Runtime Clustering Mode). The load balancing comes from the Kubernetes layer, and rolling updates across a Hazelcast version change need special care.',
    },
  ],
}
