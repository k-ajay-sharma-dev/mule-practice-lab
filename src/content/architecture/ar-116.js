export default {
  id: 'ar-116',
  category: 'architecture',
  title: 'Placing Workloads Across Runtime Planes: a Decision Record for CloudHub 2.0, Runtime Fabric, Hybrid and Fully On-Premises Mule',
  level: 'ADVANCED',
  tags: ['deployment', 'runtime-fabric', 'hybrid', 'on-prem', 'environments', 'decision-record', 'governance', 'insurance'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each workload to the best-fitting runtime option.',
      pairs: [
        ['Public quote APIs, a small platform team, no data that must stay in the company network', 'CloudHub 2.0'],
        ['Claims APIs on the company\'s existing, well-run Kubernetes platform', 'Runtime Fabric'],
        ['80 small proxies on existing VMs, sharing one port and one backend configuration, with central management wanted', 'Hybrid Standalone with Mule domains'],
        ['A plant network with no connection to the internet', 'On-premises runtime without a control plane'],
      ],
      explain: 'CloudHub 2.0 is fully managed. Runtime Fabric is for Kubernetes clusters that you operate. Hybrid Standalone keeps central management with apps inside your trust boundary, and supports domains. On-premises runtimes need no control plane and suit air-gapped sites.',
    },
    {
      type: 'single',
      prompt: 'A sister company\'s organization is on US Cloud and deploys CloudHub 2.0 apps to Canada (Montreal). Its legal team says this meets a requirement for design-time data to stay in Canada. What is the problem?',
      options: [
        'A runtime region is independent of control plane data residency: deploying to Canada from US Cloud does not give you Canada Cloud',
        'CloudHub 2.0 has no Canadian region',
        'Runtime regions and control planes are always the same',
        'There is no problem: the control plane moves with the app',
      ],
      answer: 0,
      explain: 'Control plane location, runtime hosting option and runtime region are three independent choices, and each organization lives in exactly one cloud.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about high availability and disaster recovery responsibility are documented?',
      options: [
        'On CloudHub 2.0, MuleSoft manages in-region resilience and you own the multi-region strategy, with your own global load balancer',
        'On Runtime Fabric, you own backup, restore and failover to a standby cluster',
        'On Hybrid Standalone, you own backup, restore and DR',
        'In every model, you own any runtime strategy that spans regions',
        'On Runtime Fabric, MuleSoft backs up your cluster configuration',
      ],
      answer: [0, 1, 2, 3],
      explain: 'MuleSoft doesn\'t back up your data or cluster configuration on Runtime Fabric. Cross-region support in the matrix concerns Mule runtime regions only, not the control plane.',
    },
    {
      type: 'single',
      prompt: 'A public sector client is on MuleSoft Government Cloud. According to the compatibility matrix, which option is available there that Runtime Fabric is not?',
      options: [
        'Hybrid Standalone, along with CloudHub, while CloudHub 2.0 and Runtime Fabric show No',
        'CloudHub 2.0 only',
        'Runtime Fabric is available everywhere',
        'Nothing runs on Government Cloud',
      ],
      answer: 0,
      explain: 'Always read the matrix for your control plane: Government Cloud and Government Cloud Plus differ. For Anypoint Platform PCE only Hybrid Standalone shows Yes.',
    },
    {
      type: 'multi',
      prompt: 'What differs in day-to-day operations between targets?',
      options: [
        'CloudHub 2.0 apps are auto-patched monthly; Runtime Fabric apps need a redeploy to take a patch',
        'Hybrid Standalone upgrades use the Mule Upgrade Tool, with no auto-upgrade',
        'Runtime Fabric runs a separate Mule runtime server for each app',
        'One Hybrid Standalone instance can run many apps, which share its resources',
        'Runtime Fabric apps can share a listener through a domain',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The shared resources documentation covers on-premises deployment. With one runtime per app, Runtime Fabric gives isolation instead of sharing.',
    },
    {
      type: 'multi',
      prompt: 'How is licence compliance measured for customer-hosted targets?',
      options: [
        'Runtime Fabric: the sum of CPU Limits per replica, or the total CPU of worker nodes running Mule apps, must be within the licensed quantity',
        'Hybrid Standalone: by the cores visible to the JVM running Mule, with fractional cores rounded up',
        'Hybrid Standalone: each VM or container is metered separately, even on one physical host',
        'Hybrid Standalone: only physical cores are counted',
      ],
      answer: [0, 1, 2],
      explain: 'Physical cores are not considered on hybrid. These rules affect the real cost of each option, and you are responsible for staying compliant.',
    },
    {
      type: 'single',
      prompt: 'The security team asks what leaves the data centre by default with a Hybrid Standalone runtime. What does Runtime Manager documentation say?',
      options: [
        'Only metadata pushed by the Runtime Manager agent flows to the cloud, and no application data is exposed by default; you can change what the agent pushes',
        'All payloads are copied to the control plane',
        'Nothing at all, including status',
        'Application logs always go to Anypoint Monitoring',
      ],
      answer: 0,
      explain: 'The control plane stores operational metadata and configuration, not business data. Anypoint Monitoring is a further agent you choose to install.',
    },
  ],
  description: `
A European insurer is writing a **deployment target decision record** for 300 Mule apps. Its Anypoint organization is on EU Cloud. It has:

- Public quote and policy APIs, with bursty traffic and a platform team of four.
- Claims APIs that must stay in the company's own Azure subscription. There is a mature Kubernetes team.
- 80 small proxies in front of a mainframe, already on VMs. Kubernetes is not available in that zone.
- A plant-safety integration in a site with no internet connection.
- A subsidiary that wants to use Edge releases to get new features quickly, and another that sells to public sector clients with FedRAMP requirements.

The CIO wants one page of criteria, not a vendor comparison.

**Questions**
1. Which criteria decide the target, and where does each workload go?
2. How do control plane, runtime option and runtime region relate?
3. Who owns HA and DR on each target?
4. What are the operating differences that teams feel every month?
5. How do licensing and security reviews change the choice?
`,
  answerTemplate: `## Criteria and placement

## Control plane, runtime option, region

## HA and DR ownership

## Operating differences

## Licensing and security
`,
  keyPoints: [
    'Choose three things separately: control plane, runtime option, and runtime region for CloudHub and CloudHub 2.0.',
    'Each organization lives in exactly one cloud. A runtime region is independent of control plane data residency.',
    'Runtime Fabric, Hybrid Standalone and on-premises runtimes run in your infrastructure and use no MuleSoft-managed runtime regions.',
    'A registered on-premises runtime is a Hybrid Standalone runtime. Unregistered on-premises runtimes need no control plane and suit air-gapped sites.',
    'Check the compatibility matrix for your control plane. PCE shows Hybrid Standalone only.',
    'HA: CloudHub 2.0 replicas are managed; on Runtime Fabric you run at least two replicas across zones; Hybrid uses clusters.',
    'DR across regions is yours on every model; CloudHub 2.0 has a Global Deployment entitlement.',
    'Patching: automatic on CloudHub 2.0, by redeployment on Runtime Fabric, by the upgrade tool on Hybrid.',
    'Domains are for on-premises deployment; Runtime Fabric isolates each app in its own runtime.',
    'Runtime Fabric needs x86-64, VM-based nodes and a supported Kubernetes, with a limit of 16 replicas per app (8 with usage pricing and HPA).',
    'Edge versions are not FedRAMP approved, so channel choice is also a compliance choice.',
  ],
  solution: `
**1. Criteria and placement.** Ask in order:
1. *Must it be disconnected?* Then an on-premises runtime with no control plane. This fits the plant-safety site.
2. *Must data or processing stay in your own infrastructure?* If not, CloudHub 2.0 has the lowest operating effort. This fits the quote and policy APIs, with autoscaling where the licence model allows it.
3. *Do you have a real Kubernetes capability?* If so, Runtime Fabric: claims APIs on the existing AKS platform.
4. *Otherwise,* Hybrid Standalone: the mainframe proxies, with domains to share listener and backend configuration, and central management from Runtime Manager.

**2. Control plane, runtime option, region.** The organization is in EU Cloud, where design-time data and metadata live. CloudHub 2.0 apps also choose a runtime region. Those are separate choices, so deploying to a region does not move the control plane. If requirements mention design-time data, check the control plane. Use the compatibility matrix: for example, Runtime Fabric shows No for MuleSoft Government Cloud, and Hybrid Standalone is the only row with Yes for Anypoint Platform PCE. For the public sector subsidiary, confirm the control plane first, and do not use Edge versions if FedRAMP approval is needed.

**3. HA and DR.**
| Model | Primary HA | DR owner |
|---|---|---|
| CloudHub 2.0 | Replicas across zones, run by MuleSoft | You own multi-region; MuleSoft manages in-region resilience |
| Runtime Fabric | At least two replicas across zones, set by you | You: backup, restore, standby cluster |
| Hybrid Standalone | Your cluster | You, with control plane availability from MuleSoft |
| On-premises | Your cluster | You: all of it |

**4. Monthly differences.**
- *Patches:* CloudHub 2.0 is auto-patched; Runtime Fabric needs redeployment; Hybrid uses the upgrade tool.
- *Isolation:* Runtime Fabric runs one runtime per app, and several Mule versions on the same resources. On one Hybrid instance, apps share the JVM's resources, including the UBER pool.
- *Observability:* Runtime Fabric has a sidecar. Hybrid needs an agent install on each server. External log forwarding on Runtime Fabric is your job.
- *Your tasks on Runtime Fabric:* cluster, ingress, load balancing and network.

**5. Licensing and security.** Runtime Fabric compliance is the sum of CPU Limits, or total worker CPU. Hybrid counts cores visible to the JVM, meters each VM or container separately, and rounds fractional cores up. Security reviewers should note that the control plane holds operational metadata and configuration, not business data, and that by default the agent pushes only metadata. Also see the deployment limits: a Hybrid cluster has at most eight servers, a server group at most 20, and Runtime Fabric supports 16 replicas per app, or 8 with usage pricing and HPA.

Record the reasoning, not only the result, and review it when a Mule version, a contract or a team skill changes.
`,
  followUps: [
    {
      q: 'Should the insurer standardise on one target to simplify?',
      a: 'Only if all workloads can accept it. Here the air-gapped site and the Azure constraint cannot use the same model as public APIs, so standardise what you can: release process, naming, monitoring and security, rather than the runtime itself.',
    },
    {
      q: 'What about the existing Runtime Fabric appliance?',
      a: 'Do not choose it for new work. The docs say MuleSoft will stop investing in it and list migration options, with CloudHub 2.0 having the lowest operational overhead.',
    },
    {
      q: 'Does Runtime Fabric need its own control plane?',
      a: 'No. It connects outbound over mTLS to the Anypoint control plane, and the matrix tells you which clouds support it.',
    },
    {
      q: 'Is anything lost when a workload moves from Hybrid to Runtime Fabric?',
      a: 'Domains are the obvious one. Shared listeners and configuration need redesign, and Object Store persistence moves to Persistence Gateway with its own limits.',
    },
  ],
}
