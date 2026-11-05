export default {
  id: 'ms-025',
  category: 'mulesoft',
  title: 'Choosing a Deployment Target: CloudHub 2.0 vs Runtime Fabric vs Hybrid',
  level: 'EXPERT',
  tags: ['architecture', 'cloudhub-2', 'runtime-fabric', 'hybrid', 'deployment'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each deployment target to who owns the infrastructure.',
      pairs: [
        ['CloudHub 2.0', 'MuleSoft manages the containerised infrastructure'],
        ['Runtime Fabric on customer Kubernetes', 'Customer runs the cluster; MuleSoft supplies the RTF agent and runtime images'],
        ['Hybrid standalone runtimes', 'Customer installs and operates OS, JVM and Mule runtime'],
      ],
      explain: 'Ops effort grows from CloudHub 2.0 (lowest) to RTF to standalone runtimes (highest for a team without Mule ops skills).',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do CloudHub 2.0 apps reach the on-prem policy and claims systems?',
      options: [
        'Deploy into a private space connected to the data centre via IPsec VPN or AWS Transit Gateway, with firewall rules for the space CIDR',
        'Through the shared space public internet with IP allowlisting only',
        'Through a Mule domain shared between CloudHub and on-prem',
        'CloudHub 2.0 cannot reach on-prem systems',
      ],
      answer: 0,
      explain: 'Private spaces provide private networking (VPN / Transit Gateway) and private ingress. Domains do not exist on CloudHub 2.0.',
    },
    {
      type: 'single',
      prompt: 'What does the MuleSoft-hosted control plane receive from the runtimes?',
      options: [
        'Deployment metadata, analytics/metrics and — if enabled — logs; payloads stay in the runtime plane',
        'Every message payload, for API analytics',
        'Nothing at all — it is fully disconnected',
        'Only payloads tagged as non-sensitive',
      ],
      answer: 0,
      explain: 'Payloads stay where the app runs. For strict residency use the EU control plane; if even metadata must stay on-prem, Private Cloud Edition is the option at high operational cost.',
    },
    {
      type: 'single',
      prompt: 'Where should the regulator-facing integration that must never leave the on-prem network run?',
      options: [
        'Runtime Fabric on the on-prem OpenShift cluster',
        'CloudHub 2.0 shared space in the EU region',
        'CloudHub 2.0 private space with a VPN',
        'Any target, as long as the EU control plane is used',
      ],
      answer: 0,
      explain: 'A private space is still MuleSoft-hosted in AWS. RTF on the on-prem cluster keeps the data inside the network and fits the team Kubernetes skills.',
    },
    {
      type: 'single',
      prompt: 'A company runs some Mule apps on CloudHub 2.0 and others on Runtime Fabric (RTF), which runs on its own Kubernetes cluster. Which cost does this mix really add?',
      options: [
        'Two capacity models and two sets of runbooks',
        'App code rewritten differently for each target',
        'A separate CI/CD toolchain for each target',
        'A separate set of API Manager policies for each target',
      ],
      answer: 0,
      explain: 'Two deployment targets mean two capacity models and runbooks, which shared pipeline templates help with. The team must also keep the Kubernetes cluster and RTF components supported and upgraded, and a VPN or Transit Gateway becomes critical path for on-prem calls. Ideally app code is identical across targets and only deployment configuration changes, and the same CI/CD and API Manager policies serve both. Avoid target-specific features like domains to stay portable.',
    },
  ],
  description: `
A European insurer is starting a MuleSoft programme (~80 apps in 2 years). Constraints from the architecture board:

- **Policy administration** and **claims** systems run in the insurer's **own data centre**; there is a site-to-site VPN to AWS.
- Customer **health data** must be processed **inside the EU**; one regulator-facing integration must never leave the on-prem network.
- Ops team is strong in **Kubernetes** (they run EKS and an on-prem OpenShift cluster); they have **no** experience operating Mule runtimes on VMs.
- The business wants to go live with the first 10 APIs in **3 months**.
- Peak traffic for the quote API is 20× normal during marketing campaigns.

You must present a deployment recommendation to the board.

**Questions**
1. Compare **CloudHub 2.0**, **Runtime Fabric** (on customer-managed Kubernetes) and **hybrid standalone runtimes** on: who manages what, networking, scaling, and operational effort.
2. Where does the Anypoint control plane run, and what data does it see? When would you consider an EU control plane or Private Cloud Edition?
3. How do apps on CloudHub 2.0 reach the on-prem policy and claims systems?
4. Make a recommendation for this insurer (it can be a mix), including the regulator-facing integration.
5. What are the risks/trade-offs of your recommendation?
`,
  answerTemplate: `## Comparison

## Control plane and data

## Connectivity to on-prem

## Recommendation

## Risks and trade-offs
`,
  keyPoints: [
    'CloudHub 2.0: MuleSoft-managed containerised iPaaS (shared or private spaces, replicas, built-in ingress, rolling updates) — least operational effort.',
    'Runtime Fabric: MuleSoft software running on the customer\'s Kubernetes — customer manages the cluster, ingress, capacity and upgrades; data stays in the customer\'s network.',
    'Hybrid standalone runtimes: customer installs and operates Mule on servers/VMs, managed via Runtime Manager agent; supports clusters, server groups and domains.',
    'The control plane (Anypoint Platform: Runtime Manager, API Manager, Exchange) is hosted by MuleSoft in a region (US or EU, plus others); message payloads stay in the runtime plane, but metadata/metrics/logs may flow to it depending on configuration. PCE puts the control plane on-prem.',
    'CloudHub 2.0 private spaces connect to on-prem via VPN or AWS Transit Gateway, with private networking and firewall rules.',
    'A mixed model is common: CloudHub 2.0 for most APIs, RTF/on-prem for data that must stay inside the network — with consistent CI/CD and monitoring across targets.',
  ],
  solution: `
**Comparison**
| | CloudHub 2.0 | Runtime Fabric (self-managed K8s) | Hybrid standalone |
|---|---|---|---|
| Infra owner | MuleSoft | Customer (K8s cluster), MuleSoft (RTF agent/runtime images) | Customer (OS, JVM, runtime) |
| Networking | Shared space, or **private space** with VPN/Transit Gateway, private ingress, custom domains/TLS | Customer's ingress controller, network policies; data stays on customer network | Customer LB/firewall |
| Scaling | Replicas & sizes per app, rolling updates; managed | K8s scheduling; capacity planned by customer | Manual: add servers/cluster nodes |
| Ops effort | Lowest | Medium–high (K8s + RTF upgrades) | Highest for a team without Mule ops skills |
| Extras | Managed OSv2, clustering option | Fits existing K8s tooling | Domains, clusters, full control |

**Control plane:** Anypoint Platform (Runtime Manager, API Manager, Exchange, Monitoring) is a MuleSoft-hosted control plane, available in regions including the **EU control plane**. Apps' payloads stay in the runtime plane; the control plane receives deployment metadata, analytics/metrics and — if enabled — logs. For strict residency, use the **EU control plane** and EU regions for CloudHub 2.0. If even metadata must not leave the premises, **Anypoint Platform Private Cloud Edition** (control plane on-prem) is the option, at a high operational cost.

**Connectivity on CloudHub 2.0:** deploy into a **private space** in an EU region, and connect it to the data centre via **IPsec VPN** or **AWS Transit Gateway** (reusing the existing AWS connectivity). Configure internal DNS and firewall rules so only the private space CIDR can reach policy/claims. Use private ingress for internal-only APIs.

**Recommendation (mixed)**
- **CloudHub 2.0, EU control plane, private space in an EU region** for the majority of Experience/Process APIs, including the quote API. It is the fastest to market (3 months), with managed scaling for 20× campaigns via additional replicas.
- **Runtime Fabric on the on-prem OpenShift cluster** for System APIs that handle the most sensitive data and for the **regulator-facing integration** that must never leave the network. The ops team's K8s skills fit RTF better than VM-based runtimes.
- Same CI/CD (mule-maven-plugin targets for both), same API Manager policies, Anypoint Monitoring/log forwarding to one SIEM.

**Risks / trade-offs**
- Two deployment targets → two capacity models and runbooks; mitigate with shared pipeline templates.
- RTF requires keeping the K8s cluster and RTF components supported/upgraded; licensing and capacity must be planned (vCore allocation per target).
- VPN/Transit Gateway becomes critical path for on-prem calls → redundancy and latency budgets needed.
- Confirm residency requirements with legal (logs, analytics, Exchange content) and configure log forwarding accordingly.
`,
  followUps: [
    {
      q: 'Why not run everything on Runtime Fabric since the team knows Kubernetes?',
      a: 'It is possible, but you take on cluster capacity, upgrades and HA for all 80 apps, which delays go-live and adds cost. CloudHub 2.0 removes that work for the apps that have no residency constraint.',
    },
    {
      q: 'How would you handle the 20× campaign peak?',
      a: 'Scale replicas ahead of the campaign (or use autoscaling if available in your subscription), and add Spike Control/rate limiting at the gateway. Cache quote reference data, and make sure System APIs and backends can absorb the load.',
    },
    {
      q: 'What changes in the application code between CloudHub 2.0 and RTF?',
      a: 'Ideally nothing — only deployment configuration (target, replicas, resources, properties). Avoid target-specific features like domains or local file-system state so apps stay portable.',
    },
  ],
}
