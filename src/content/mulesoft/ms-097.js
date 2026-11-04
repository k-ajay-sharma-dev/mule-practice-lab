export default {
  id: 'ms-097',
  category: 'mulesoft',
  title: 'Running Mule in Production: Operating Runtime Fabric and CloudHub 2.0 Side by Side',
  level: 'EXPERT',
  tags: ['runtime-fabric', 'cloudhub-2', 'deployment', 'operations', 'disaster-recovery'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each capability to how the CloudHub 2.0 feature comparison describes it.',
      pairs: [
        ['Mule patch updates', 'CloudHub 2.0 automated; Runtime Fabric requires redeployment'],
        ['Load balancing and ingress support', 'CloudHub 2.0 MuleSoft; Runtime Fabric self-managed'],
        ['Default endpoints', 'CloudHub 2.0 fully managed; Runtime Fabric not supported'],
        ['Persistent VM queues', 'Not supported on either'],
      ],
      explain: 'These rows are what drive the runbook differences. Default endpoints are a good example: on Runtime Fabric, an app has no URL until your ingress provides one.',
    },
    {
      type: 'single',
      prompt: 'To save money, a team proposes one Runtime Fabric instance for both test and production apps, separated by namespace. What does the deployment page say?',
      options: [
        'Applications deployed to a production environment must be deployed to an instance separate from non-production applications',
        'That is the recommended layout, as long as environments differ',
        'It is allowed if the apps use different ingress templates',
        'It is allowed if authorized namespaces are configured',
      ],
      answer: 0,
      explain: 'Plan at least two instances. The page states this as a requirement, not as a recommendation.',
    },
    {
      type: 'single',
      prompt: 'On Runtime Fabric, who is responsible for staying within the Mule licence, and how?',
      options: [
        'You are: keep the sum of CPU Limits across app replicas, or the total CPU of worker nodes running Mule apps, within the licensed quantity',
        'MuleSoft blocks any deployment that would exceed the licence',
        'Only Reserved vCPU counts, so raising limits has no licence effect',
        'Compliance applies only to CloudHub 2.0',
      ],
      answer: 0,
      explain: 'The Requirements page gives those two ways to remain compliant, so increasing a `vCPU Limit` for burst capacity is also a licensing decision.',
    },
    {
      type: 'single',
      prompt: 'Data centre connectivity must use AWS Direct Connect or VPC peering directly attached to the runtime network. How do the platforms differ?',
      options: [
        'The comparison lists both as supported on Runtime Fabric, through your own infrastructure, and not supported on CloudHub 2.0',
        'Both platforms support them natively',
        'Only CloudHub 2.0 supports them',
        'Neither supports them',
      ],
      answer: 0,
      explain: 'On CloudHub 2.0 use a VPN or a transit gateway attachment. On Runtime Fabric the network is your own, and "supported" means you and your provider manage it.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Runtime Fabric backup and restore are correct?',
      options: [
        'You own backup, restore and DR, and MuleSoft does not back up your cluster',
        'The `rtfctl` backup covers cluster configuration such as services, secrets, ingress and ConfigMaps',
        'Application deployments are reconciled from the control plane on restore',
        'Application state is not in the backup',
        'You should run the original and the restored copy together to validate them',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Running two concurrent instances of the same Runtime Fabric causes deployment conflicts. Use the same `rtfctl` version for the restore that created the backup, and test restores regularly.',
    },
    {
      type: 'single',
      prompt: 'The operations team wants Runtime Fabric application logs in Splunk. What is the position in the docs?',
      options: [
        'Runtime Fabric does not forward logs to an external system: you install and manage a forwarder such as Fluent Bit, or use Log4j appenders',
        'Runtime Fabric forwards logs to any SIEM once enabled in Runtime Manager',
        'Logs can only be read through Anypoint Monitoring',
        'Logs are not produced on Runtime Fabric',
      ],
      answer: 0,
      explain: 'Apps commonly log to `stdout`, and external forwarding is your responsibility. The Requirements page also says Runtime Fabric does not provide support for integrating third-party monitoring solutions.',
    },
    {
      type: 'single',
      prompt: 'An app on Runtime Fabric needs state that survives pod restarts and also has to run unchanged on CloudHub 2.0. What fits?',
      options: [
        'The Object Store Connector: Persistence Gateway on Runtime Fabric and Object Store v2 on CloudHub 2.0 use the same REST API, so the app does not change',
        'A local file on a mounted disk on both platforms',
        'A persistent VM queue on both platforms',
        'Separate builds of the app, one per platform',
      ],
      answer: 0,
      explain: 'Apps use the Object Store v2 REST API through the connector to reach Persistence Gateway. Note its limits: PostgreSQL only, plain-text database connections, and a maximum TTL.',
    },
  ],
  description: `
An energy utility has run 25 apps on CloudHub 2.0 for two years. Its grid-operations division now needs 15 apps close to its control systems, in a data centre with no public cloud path for that data. It will run them on Runtime Fabric on an existing Kubernetes platform.

A single integration operations team of six will support both targets. The head of operations asks you to write the operating model.

| Concern | What they want to know |
|---|---|
| Placement | Which apps go where, and what are the decision criteria? |
| Patching | What happens automatically and what do we schedule ourselves? |
| Environments | How many Runtime Fabric instances do we need? |
| Observability | How do logs and metrics reach the operations team from each target? |
| Licensing | What must we track? |
| Recovery | What happens if a zone, a cluster or a region is lost? |
| Portability | How do we keep apps deployable on either target? |

**Questions**
1. Give your placement criteria, then answer each row of the table.
2. Which operational tasks are new to a team that has only known CloudHub 2.0?
3. Write the top five items for a day-2 checklist for Runtime Fabric.
`,
  answerTemplate: `## Placement criteria

## Patching and upgrades

## Environments

## Observability

## Licensing

## Recovery

## Portability

## Day-2 checklist
`,
  keyPoints: [
    'CloudHub 2.0 is fully managed; on Runtime Fabric you run the Kubernetes cluster, ingress, load balancing, log forwarding, monitoring integration, network ports and proxies.',
    'Mule patch updates are automated on CloudHub 2.0 and require redeployment on Runtime Fabric. Default endpoints exist only on CloudHub 2.0.',
    'Production apps must run on a Runtime Fabric instance separate from non-production apps.',
    'Runtime Fabric licence compliance is your responsibility: sum of CPU Limits or total worker CPU within the licensed quantity.',
    'On Runtime Fabric you own backup, restore and DR. Back up with rtfctl to external storage; the docs recommend hourly. On CloudHub 2.0 MuleSoft manages in-region infrastructure and you own cross-region DR.',
    'Run at least two replicas per app on both targets, and keep state external.',
    'Object Store Connector code works on both targets; Persistence Gateway needs a PostgreSQL database you provide.',
  ],
  solution: `
**Placement criteria.**
- Use **Runtime Fabric** when the workload must run in your own network, needs connectivity such as Direct Connect or VPC peering on your own terms, or the organisation already operates Kubernetes well.
- Use **CloudHub 2.0** for everything else, because the platform removes VM, network and ingress work. That covers the existing 25 apps and any new app without a location constraint.
- Check feature gaps before choosing. The comparison table in *Features of CloudHub 2.0* is the reference, and it changes, so confirm each capability you depend on.

**Patching and upgrades.**
| Task | CloudHub 2.0 | Runtime Fabric |
|---|---|---|
| OS and node patching | Fully managed; security patches and restarts roughly monthly | Self-managed |
| Mule patch updates | Automated | Requires redeployment |
| Kubernetes and Runtime Fabric agent | Not your concern | You upgrade them; check supported versions in the release notes |
| Restart handling | Design for routine restarts | You control node maintenance, but pods still move |

**Environments.** At least two Runtime Fabric instances: production apps must be separate from non-production ones. Associate each with its environments and business groups. Use authorized namespaces to isolate third-party software, which belongs in non-RTF namespaces.

**Observability.**
- Both targets use Anypoint Monitoring for metrics. On Runtime Fabric that runs as a sidecar in each replica, so include it in capacity plans.
- Access to Anypoint Monitoring logs on Runtime Fabric depends on your subscription.
- On Runtime Fabric, apps usually log to \`stdout\`. External forwarding is yours to install and manage, for example with Fluent Bit, or you can use Log4j appenders.
- Runtime Fabric does not provide support for integrating third-party monitoring solutions, so agree with the operations team what they will see.

**Licensing.** Track CPU Limits per replica or total worker CPU against the licence, as the Requirements page sets out, and use the Runtime Fabric usage reports. With CPU-based autoscaling, the maximum replica count also drives flow usage on both targets.

**Recovery.**
| Failure | CloudHub 2.0 | Runtime Fabric |
|---|---|---|
| Replica or node | Platform restarts it | Kubernetes reschedules it |
| Availability zone | Multiple replicas across zones; the app restarts in another zone | Topology spread constraints balance replicas; run at least two |
| Cluster or data centre | Not applicable | You restore: \`rtfctl\` backups on external storage, to the same or a new cluster with the same configuration |
| Region | Not replicated automatically; you own cross-region DR, usually with your own global load balancer | Your DR plan |

After a Runtime Fabric restore, deployments reconcile from the control plane, but changes not stored there, such as updated cluster configurations and agent upgrades, must be reapplied by hand. The docs disagree on app changes made after the backup: the HA and DR page says they reconcile automatically, while the backup page lists them as changes to resolve manually, so check them after any restore. Do not run the original and the restored copy at the same time.

**Portability.** Keep apps stateless, use \`$\{http.port}\`-style configuration rather than fixed infrastructure values, and use the Object Store Connector, which reaches Object Store v2 on CloudHub 2.0 and Persistence Gateway on Runtime Fabric without code changes. Note that a platform feature like a default endpoint does not exist on Runtime Fabric, so route clients through your own domain.

**Day-2 checklist for Runtime Fabric.**
1. Review capacity: reserved CPU and memory per node, including sidecars and platform services.
2. Confirm scheduled backups ran, are stored outside the cluster, and that a restore has been tested.
3. Track agent, Kubernetes and Mule patch versions, and plan redeployments for patches.
4. Watch certificate expiry for ingress TLS secrets, and use the synchronized label.
5. Check that the log forwarder is healthy and that Persistence Gateway can reach PostgreSQL.
`,
  followUps: [
    {
      q: 'Does a control plane outage stop apps on either platform?',
      a: 'On CloudHub 2.0 the docs say apps in the runtime plane keep running during a network partition with the control plane, and telemetry is buffered locally. Management actions, such as starting a stopped backup app, need the control plane.',
    },
    {
      q: 'How do you handle a Mule patch on 15 Runtime Fabric apps?',
      a: 'Treat it as a release: the comparison lists Mule patch updates as requiring redeployment, so schedule it through the pipeline, app by app, with at least two replicas and enough spare capacity for a rolling update.',
    },
    {
      q: 'What does Supported mean in the comparison table?',
      a: 'MuleSoft does not provide the feature, but it is available on supported partner platforms and is managed by the vendor, platform or customer. Self-managed means MuleSoft provides it and you manage it.',
    },
    {
      q: 'How do you migrate persistent data between Runtime Fabric clusters?',
      a: 'Back up the two Persistence Gateway tables from the source database and recreate them on the target, without apps deployed on both clusters during the process.',
    },
  ],
}
