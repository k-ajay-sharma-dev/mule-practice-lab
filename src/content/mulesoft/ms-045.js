export default {
  id: 'ms-045',
  category: 'mulesoft',
  title: 'Runtime Fabric Architecture: Control Plane, Agent, Ingress and Persistence',
  level: 'EXPERT',
  tags: ['runtime-fabric', 'kubernetes', 'architecture', 'hybrid'],
  estMinutes: 30,
  quiz: [
    {
      type: 'multi',
      prompt: 'With Runtime Fabric, which of these stay in MuleSoft\'s cloud (control plane)?',
      options: ['Runtime Manager', 'API Manager', 'Exchange', 'The Mule app pods', 'The app\'s request traffic and data'],
      answer: [0, 1, 2],
      explain: 'Management stays in the control plane; apps, their traffic and their data run in your cluster (runtime plane).',
    },
    {
      type: 'single',
      prompt: 'Which way do connections between the cluster and the control plane go?',
      options: [
        'MuleSoft connects inbound to the cluster API server',
        'The RTF agent initiates outbound connections to the control plane',
        'Both sides need inbound ports open',
        'They communicate only through Exchange',
      ],
      answer: 1,
      explain: 'No inbound connectivity from MuleSoft is needed. The cluster also needs outbound access to pull runtime images and app artifacts.',
    },
    {
      type: 'single',
      prompt: 'How does each Mule app replica run on RTF?',
      options: ['As a pod running the Mule runtime with the app', 'As a VM per app', 'Inside the RTF agent process', 'As a CloudHub worker'],
      answer: 0,
      explain: 'The agent creates the Kubernetes objects for the app in an environment-linked namespace; each replica is a pod.',
    },
    {
      type: 'single',
      prompt: 'An app on RTF must keep Object Store data across restarts and share it between replicas. What provides that?',
      options: [
        'Object Store v2 in MuleSoft\'s cloud, with no configuration',
        'Persistence Gateway, backed by a PostgreSQL database you provide',
        'Kubernetes snapshots it automatically',
        'Nothing — Object Store cannot be used on RTF',
      ],
      answer: 1,
      explain: 'The docs describe Persistence Gateway as what lets apps store and share data across replicas and restarts. It keeps the data in a PostgreSQL database you create.',
    },
    {
      type: 'match',
      prompt: 'Match each failure scenario to its impact on running apps.',
      pairs: [
        ['Control plane unreachable', 'Apps keep serving with last config; deployments and policy changes wait'],
        ['A node is lost', 'Kubernetes reschedules pods; ≥2 spread replicas stay available'],
        ['RTF agent down', 'Apps keep running; management operations fail until it recovers'],
      ],
      explain: 'The runtime plane is independent of management for serving traffic — which is why a control-plane outage does not take apps down.',
    },
    {
      type: 'single',
      prompt: 'On RTF, who is responsible for the ingress controller, TLS certificates and Kubernetes/node upgrades?',
      options: [
        'MuleSoft, exactly as on CloudHub 2.0',
        'The customer — RTF trades higher operational effort for keeping workloads in its own account',
        'The RTF agent does all of it automatically',
        'The cloud provider (AWS/Azure) by default',
      ],
      answer: 1,
      explain: 'On CloudHub 2.0 MuleSoft runs the infrastructure and ingress; on RTF the cluster, networking, TLS and upgrades of Kubernetes and the agent are yours.',
    },
  ],
  description: `
A regulated insurer must keep runtime traffic and data inside its own cloud account but wants Anypoint Platform for management. The platform team runs **Amazon EKS** (or AKS/OpenShift — your choice) and proposes **Runtime Fabric (RTF)**. The architecture review board asks:

| Topic | Question from the board |
|---|---|
| Control vs runtime | What runs in MuleSoft's cloud, what runs in our cluster, and which way do connections go? |
| Components | What does RTF install in the cluster and how is each Mule app deployed? |
| Traffic | How do external and internal clients reach Mule apps? Who manages TLS? |
| State | How do persistent Object Store and clustering work? |
| Ops | Who upgrades what? How do logs and metrics leave the cluster? |
| Sizing | How do vCores relate to CPU/memory requests and limits? What about noisy neighbours? |

**Questions**
1. Answer each row of the table.
2. Compare RTF with CloudHub 2.0 on responsibilities.
3. List the main failure scenarios (control-plane outage, node loss, agent down) and their impact on running apps.
`,
  answerTemplate: `## Control plane vs runtime plane

## Components and app deployment

## Traffic and TLS

## State: Object Store and clustering

## Operations and observability

## Sizing

## RTF vs CloudHub 2.0

## Failure scenarios
`,
  keyPoints: [
    'Anypoint control plane (Runtime Manager, API Manager, Exchange, Monitoring) stays in MuleSoft\'s cloud; Mule apps run in the customer\'s Kubernetes cluster.',
    'The RTF agent in the cluster connects outbound to the control plane and turns deployments into Kubernetes resources; each app replica runs as a pod.',
    'Inbound traffic uses the customer\'s ingress controller and certificates; the customer owns networking, TLS and the cluster.',
    'Persistent Object Store uses a persistence gateway backed by a customer-provided database; Mule clustering can be enabled per app.',
    'Running apps keep serving if the control plane is unreachable; deployments and policy/config changes wait until connectivity returns.',
  ],
  solution: `
**Control vs runtime plane:** Runtime Manager, API Manager, Exchange, Monitoring and Access Management run in MuleSoft's cloud (control plane). Apps, their data and their traffic stay in your cluster (runtime plane). The **RTF agent** initiates **outbound** connections to the control plane — no inbound connectivity from MuleSoft into the cluster is needed. The cluster also needs outbound access to pull Mule runtime images and app artifacts.

**Components:** RTF installs into a dedicated namespace: the agent and supporting components (e.g. for resource caching, log/metric forwarding, persistence gateway). When you deploy from Runtime Manager, the agent creates the Kubernetes objects for the app in an environment-linked namespace; each **replica is a pod** running the Mule runtime with your app. RTF on your own Kubernetes (EKS/AKS/GKE/OpenShift) is the current model; the older appliance model installed on VMs/bare metal has been phased out in favour of it.

**Traffic and TLS:** you supply an **ingress controller** (NGINX, cloud LB controller, etc.) and RTF uses an ingress template to create routes per app. TLS certificates, DNS, WAF and network policies are yours. Internal clients can call through internal ingress/service routes.

**State:** persistent Object Store is provided by the **persistence gateway**, which stores data in a PostgreSQL database you provision, so data is shared across replicas and kept across restarts. Without it, do not expect either. Mule **clustering** can be enabled for an app so its replicas form a cluster (primary-node schedulers, shared VM queues).

**Ops:** you upgrade Kubernetes, nodes and the RTF agent; you pick Mule runtime versions per app. Logs/metrics go to Anypoint Monitoring (subscription dependent) and/or to your own stack (Splunk, ELK) through log forwarding.

**Sizing:** each app replica declares a CPU **reserved** amount and a CPU **limit** plus memory; these become Kubernetes requests/limits. Allowing bursting above reserved CPU improves startup and peaks but risks noisy neighbours — use node pools, namespaces and quotas to isolate critical apps. Licensing consumption is generally tied to the reserved capacity; confirm the exact counting with your subscription.

**RTF vs CloudHub 2.0**
| | RTF | CloudHub 2.0 |
|---|---|---|
| Infrastructure | You run Kubernetes | MuleSoft runs it |
| Data/traffic location | Your account | MuleSoft-managed infrastructure (private spaces for isolation) |
| Ingress/TLS | Yours | Platform ingress, your certificates |
| Effort | High | Low |

**Failure scenarios**
- **Control plane unreachable:** running apps keep serving traffic with their last configuration and policies; new deployments, scaling and policy changes are delayed; monitoring data may be buffered or lost.
- **Node loss:** Kubernetes reschedules pods; with ≥2 replicas spread across nodes/zones the app stays available.
- **Agent down:** apps keep running; management operations fail until it recovers.
`,
  followUps: [
    {
      q: 'Why choose RTF over CloudHub 2.0 private spaces?',
      a: 'When policy or regulation requires workloads in your own account/region/data centre, when you want to reuse an existing Kubernetes platform and its tooling, or when you need co-location with on-prem systems for latency.',
    },
    {
      q: 'Can you run API gateways on RTF?',
      a: 'Yes — Mule proxies can be deployed to RTF, and Flex Gateway can also run in Kubernetes alongside it.',
    },
    {
      q: 'What breaks most often in RTF projects?',
      a: 'Networking: outbound access to the control plane and registries through proxies/firewalls, ingress and certificate setup, and under-sized nodes for the number of replicas.',
    },
  ],
}
