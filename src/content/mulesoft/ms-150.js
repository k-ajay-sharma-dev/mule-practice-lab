export default {
  id: 'ms-150',
  category: 'mulesoft',
  title: 'Sizing CloudHub 2.0 Replicas: vCores, Heap, Metaspace, Storage, Replica Limits and What Consumes Your Allocation',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'replicas', 'vcores', 'sizing', 'limits'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: '`exp-tracking` handles a steady 60 requests per second and has a strict latency target. The owner proposes 2 replicas of 0.1 vCore because "small replicas can burst". What do the docs say?',
      options: [
        'Replicas under 1 vCore have limited CPU and I/O, bursting depends on node resources and is not guaranteed, and consistent performance needs 1 or more vCores',
        'Every replica size bursts to a full vCore whenever it needs to, so 0.1 vCore is enough',
        'Bursting is guaranteed for a production environment but not for a sandbox',
        'A 0.1 vCore replica behaves the same as a 1 vCore replica once two replicas are running',
      ],
      answer: 0,
      explain: 'Bursting helps start-up time and infrequent large workloads, and it is explicitly not guaranteed. A steady latency-sensitive load is the case the docs point to larger replicas for.',
    },
    {
      type: 'match',
      prompt: 'Match each CloudHub 2.0 vCore size to its heap memory.',
      pairs: [
        ['0.1 vCore', '480 MB'],
        ['0.5 vCore', '1.3 GB'],
        ['1 vCore', '2 GB'],
        ['2 vCores', '4 GB'],
        ['4 vCores', '7.5 GB'],
      ],
      explain: 'Heap is only part of total memory: a 1 vCore replica has 4 GB in total and 2 GB of heap, and a 4 vCore replica has 15 GB in total and 7.5 GB of heap.',
    },
    {
      type: 'single',
      prompt: 'Load tests show `prc-rate-shopping` needs about 3 GB of heap. Which is the smallest vCore size that provides it?',
      options: ['1.5 vCores', '1 vCore', '0.5 vCore', '2.5 vCores'],
      answer: 0,
      explain: 'A 1.5 vCore replica has 6 GB in total, 3 GB of heap and 20 GB of storage. 1 vCore gives 2 GB of heap and 0.5 vCore gives 1.3 GB.',
    },
    {
      type: 'single',
      prompt: '`sys-carrier-connectors` bundles many connectors, and the team reads about metaspace pressure. They propose moving from 1 to 4 vCores to get more metaspace. What is the documented position?',
      options: [
        'The metaspace limit is 256 MB regardless of replica size, so a larger replica does not raise it',
        'Metaspace is always one quarter of heap, so 4 vCores gives about 1.9 GB',
        'Metaspace grows with the replica count, not the replica size',
        'CloudHub 2.0 has no metaspace limit',
      ],
      answer: 0,
      explain: 'The architecture page gives a limit of 256 MB for all sizes, with an initial size of 128 MB, and metaspace garbage collection starts after that threshold. More heap does not change this.',
    },
    {
      type: 'multi',
      prompt: '`prc-label-render` writes temporary files and logs verbosely. Which statements about replica storage are correct?',
      options: [
        'Each replica has at least 8 GB of storage, shared by system and application use',
        'For more storage, the docs say to use a replica with two or more vCores, which gives access to additional storage in `/tmp`',
        'Files the app writes to local disk are deleted when the app restarts',
        'Storage is bought separately from vCores and attached to a replica',
        'Local files are copied to the replacement replica during a rolling update',
      ],
      answer: [0, 1, 2],
      explain: 'Storage comes with the replica size. Local storage is ephemeral, so anything that must survive a restart belongs in external storage. The same page cites verbose logging as an example of needing more space.',
    },
    {
      type: 'multi',
      prompt: 'The organization has 20 vCores and also runs CloudHub 1.0 apps. Which statements about allocation are correct?',
      options: [
        'Stopped applications do not count toward replica usage, and running applications do',
        'If apps need more vCores than are available, you can create the app but cannot start it until vCores are free',
        'CloudHub 1.0 and CloudHub 2.0 share vCore quotas',
        'Failed application deployments in CloudHub 2.0 still count toward limits',
        'Each CloudHub version receives its own full copy of the purchased vCores',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Entitlements are shared across both versions, so budget them together. The failed-deployment rule surprises people: clean up failed apps instead of leaving them in place.',
    },
    {
      type: 'match',
      prompt: 'Match each limit to its documented value.',
      pairs: [
        ['Largest replica size per deployment', '4 vCores'],
        ['Application size', 'Up to 350 MB'],
        ['Application properties per app', '300'],
        ['Characters in a property key or value', '1024'],
        ['Private spaces per organization', '100'],
        ['Environments per business group', '150'],
      ],
      explain: 'A 410 MB deployable is over the application size limit, so no replica size fixes it. Limits are subject to change, so check the Limits page when you plan close to one.',
    },
    {
      type: 'single',
      prompt: 'An organization on usage-based pricing needs about 3 GB of heap but has no use for extra CPU. Which instance type fits best?',
      options: [
        '`mule.large.mem`: equivalent to 1 vCore, 8 GB in total and 4 GB of heap',
        '`mule.medium`: equivalent to 0.5 vCore, 3 GB in total and 1.5 GB of heap',
        '`mule.small`: equivalent to 0.2 vCore, 2 GB in total and 1 GB of heap',
        '`mule.2xlarge.mem`: equivalent to 4 vCores, 15 GB in total and 7.5 GB of heap',
      ],
      answer: 0,
      explain: 'The `.mem` suffix means memory-intensive options with the same compute. In the Mule Maven plugin, `instanceType` replaces `vCores`, and the two cannot be used together.',
    },
  ],
  description: `
A logistics company is sizing its first production applications for a **CloudHub 2.0** private space. It has 20 vCores and already runs some CloudHub 1.0 apps from the same allocation. An architect has collected the proposals below and asks you to review them.

| App | Profile | Proposal |
|---|---|---|
| \`exp-tracking\` | Steady 60 requests per second, strict latency target | 2 replicas of 0.1 vCore |
| \`prc-rate-shopping\` | Heavy DataWeave on large documents, about 3 GB of heap in tests | 1 replica of 1 vCore |
| \`sys-carrier-connectors\` | Many connectors in one app, deployable is 410 MB | 4 vCores "for metaspace" |
| \`prc-label-render\` | Writes temporary PDF files, verbose logging | 2 replicas of 0.5 vCore |
| \`prc-year-end\` | Runs for two weeks a year and is stopped otherwise | Left deployed all year |

The finance team asks what really consumes the allocation, and one business unit that moved to usage-based pricing asks how the \`mule.*\` sizes relate to vCores.

**Questions**
1. Review each proposal against the replica table and limits.
2. What does a replica under 1 vCore give you, and when is it the wrong choice?
3. What can and cannot be changed by choosing a bigger replica?
4. What consumes vCore allocation, and what happens when it runs out?
5. How do the instance types for usage-based pricing map to vCores?
`,
  answerTemplate: `## Review of each proposal

## Replicas under 1 vCore

## What a bigger replica does and does not change

## Allocation

## Usage-based pricing sizes
`,
  keyPoints: [
    'Sizes run from 0.1 to 4 vCores; 0.1 has 480 MB of heap, 1 has 2 GB, 2 has 4 GB and 4 has 7.5 GB.',
    'Replicas under 1 vCore have limited CPU and I/O and may burst, but bursting is not guaranteed; 1 or more vCores gives consistent performance.',
    'Metaspace is limited to 256 MB regardless of replica size, with an initial size of 128 MB.',
    'Each replica has at least 8 GB of storage shared with the system; two or more vCores gives additional storage in /tmp. Local storage is cleared on restart.',
    'Running apps count toward usage and stopped apps do not. An app that exceeds the available vCores can be created but not started.',
    'CloudHub 1.0 and 2.0 share entitlements, and failed deployments still count toward limits.',
    'Applications can be up to 350 MB, with 300 properties of 1024 characters per key or value.',
    'Usage-based pricing uses instance types such as mule.large.mem; .mem sizes add memory with the same compute.',
  ],
  solution: `
**1. Proposal review.**
- \`exp-tracking\`: use 1 vCore replicas, or measure carefully first. Two replicas give high availability, but a steady load under a latency target is not what bursting is for.
- \`prc-rate-shopping\`: 1 vCore gives 2 GB of heap. The smallest size with 3 GB is **1.5 vCores**. One replica is also not highly available: the docs require a minimum of two replicas for that.
- \`sys-carrier-connectors\`: the deployable is over the **350 MB** application limit, and 4 vCores does not raise the 256 MB metaspace limit. Splitting the app along its System API boundaries deals with both.
- \`prc-label-render\`: 0.5 vCore has 10 GB of storage shared with the system. Because the workload is storage-heavy, the documented option is two or more vCores for additional \`/tmp\` storage. Treat the files as temporary, since local data is cleared on restart.
- \`prc-year-end\`: keep it stopped when it is not in use. Stopped apps do not count toward replica usage.

**2. Replicas under 1 vCore.** They suit smaller workloads and can burst for start-up and infrequent large workloads, depending on node resources. For consistent performance the docs say to use more vCores.

**3. What a bigger replica changes.** Heap, total memory, CPU and storage rise with the size. Metaspace does not, the application size limit does not, and batch jobs still run on a single replica at a time.

**4. Allocation.** Running apps consume it. If there are not enough vCores, CloudHub 2.0 lets you create the app but not start it until you stop or delete another app or raise the allocation. Quotas are shared with CloudHub 1.0, and failed deployments still count.

**5. Usage-based pricing.** Offerings map to an equivalent vCore size, for example \`mule.micro\` to 0.1, \`mule.large\` to 1 and \`mule.xlarge\` to 2. \`.mem\` variants keep the compute and add memory. In the Mule Maven plugin, set \`instanceType\` instead of \`vCores\`. Replicas also multiply the flow metric: the usage report counts flows times replicas.
`,
  followUps: [
    { q: 'How many replicas can one app have?', a: 'Up to 8, or up to 16 with the Anypoint Integration Advanced package or a Platinum or Titanium subscription. Cluster mode needs at least two replicas.' },
    { q: 'Does scaling out shorten a batch job?', a: 'No. Batch jobs run on a single replica at a time and cannot be distributed across replicas, so a batch-heavy app needs a bigger replica or a different design, not more replicas.' },
    { q: 'What happens when a usage-based organization runs out of its global resource pool?', a: 'Actions that consume more resources, such as deploying new apps or starting stopped apps, are blocked until resources are free. The Pricing page says this limit does not affect apps configured with Horizontal Pod Autoscaling.' },
    { q: 'Does a large replica change the CIDR block I need?', a: 'The CIDR sizing guidance considers applications, replica size, replica count, rolling deployments, auto-upgrades and platform headroom, and gives a table of maximum vCores and applications per block size. The block cannot be changed later, so include planned growth.' },
  ],
}
