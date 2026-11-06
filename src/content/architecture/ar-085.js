import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-085',
  category: 'architecture',
  title: 'Runtime Fabric on Your Own Kubernetes With API-led Layers',
  level: 'ADVANCED',
  tags: ['runtime-fabric', 'kubernetes', 'api-led', 'ingress', 'deployment', 'manufacturing'],
  estMinutes: 45,
  diagram: {
    task: 'draw an API-led deployment on Runtime Fabric in the customer\'s own Kubernetes cluster, in which all clients enter through the customer\'s ingress controller, each layer calls only the next one, SAP and the plant database are reached only through System APIs, and object store data is kept in a store the customer provides.',
    checks: [
      { label: 'Every client enters through the customer\'s ingress / load balancer', rule: { type: 'each', of: ['partner', 'internal-app', 'web-app'], min: 3, edgeTo: 'load-balancer' } },
      { label: 'Ingress routes to the Experience APIs', rule: { type: 'edge', from: 'load-balancer', to: 'experience-api' } },
      { label: 'Experience APIs call Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Process APIs reach the backends through System APIs', rule: { type: 'path', from: 'process-api', to: ['erp', 'database', 'sql-server', 'oracle-db'], via: 'system-api' } },
      { label: 'SAP and the plant database are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'sql-server', 'oracle-db'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Persistent object store data sits in a customer-provided store (Persistence Gateway database)', rule: { type: 'edge', from: ['process-api', 'experience-api', 'system-api'], to: ['database', 'cache'] } },
      { label: 'Logs and metrics leave the cluster to a monitoring stack', rule: { type: 'edge', from: ['experience-api', 'process-api', 'system-api'], to: 'monitoring' } },
      { label: 'Every Process API calls a System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', min: 2, edgeTo: ['erp', 'sql-server', 'oracle-db', 'database'] } },
      { label: 'Dealer orders reach SAP through a System API', rule: { type: 'path', from: 'partner', to: 'erp', via: 'system-api' } },
      { label: 'The MES client reads plant status over sync calls all the way down', rule: { type: 'path', from: 'internal-app', to: { type: ['sql-server', 'oracle-db', 'database'], label: ['plant', 'sql server'] }, via: 'system-api', kind: 'sync' } },
      { label: 'Load balancers forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: 'load-balancer', kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['experience-api', 'process-api'], to: ['process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['sql-server', 'oracle-db', 'database', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        dealers: ['partner', 'Dealers and suppliers'],
        mes: ['internal-app', 'Plant floor MES client'],
        portal: ['web-app', 'Service portal'],
        ing: ['load-balancer', 'Customer ingress controller (TLS)'],
        idp: ['identity-provider', 'Corporate identity provider'],
        expDealer: ['experience-api', 'exp-dealer-orders'],
        expPlant: ['experience-api', 'exp-plant-status'],
        prcOrders: ['process-api', 'prc-order-fulfilment'],
        prcStatus: ['process-api', 'prc-production-status'],
        q: ['queue', 'order.events'],
        sysSap: ['system-api', 'sys-sap-orders'],
        sysPlant: ['system-api', 'sys-plant-sqlserver'],
        sap: ['erp', 'SAP S/4HANA'],
        plant: ['sql-server', 'Plant SQL Server'],
        pg: ['database', 'PostgreSQL for Persistence Gateway'],
        logs: ['monitoring', 'Customer log platform via Fluent Bit'],
      },
      [
        'dealers -> ing', 'mes -> ing', 'portal -> ing', 'ing -> expDealer', 'ing -> expPlant', 'expDealer -> idp',
        'expDealer -> prcOrders', 'expPlant -> prcStatus', 'prcOrders ~> q', 'q ~> prcStatus',
        'prcOrders -> sysSap', 'prcStatus -> sysPlant', 'sysSap -> sap', 'sysPlant -> plant',
        'prcOrders -> pg', 'prcOrders -> logs', 'prcStatus -> logs',
      ],
    ),
  },
  description: `
A heavy-equipment manufacturer must keep plant integration inside its own network: a plant outage cannot depend on a path through the public cloud for runtime traffic. It already runs a production Kubernetes platform (RKE2) in two data-centre halls, with a separate platform team. It will use Runtime Fabric for 20 Mule apps, managed from Anypoint Platform.

Traffic and systems:
- **Dealers and suppliers** place about 15,000 orders per day through an API.
- The **plant MES client** and a **service portal** read production status every few seconds.
- **SAP S/4HANA** holds orders, and a **plant SQL Server** holds production data.
- Some apps need an idempotency store that survives pod restarts and is shared between replicas.
- Operations already run a central log platform, and production and test must be strictly separated.

**Questions:**
- Draw the target architecture with API-led layers.
- What does the customer provide and operate, and what does MuleSoft provide?
- How does traffic reach the apps, and how do apps call each other?
- How do you deliver state, logs, high availability and capacity?
- What must be allowed through the corporate firewall?
`,
  answerTemplate: `## Target architecture

## Who provides what

## Traffic and app-to-app calls

## State and logs

## High availability and capacity

## Firewall
`,
  keyPoints: [
    'Each app runs in its own Mule runtime and container, with replicas across the cluster; layers scale independently.',
    'MuleSoft provides the agent, Mule runtime, core services and optional Persistence Gateway. You manage Kubernetes, ingress, load balancing, log forwarding, monitoring, ports and proxies.',
    'Clients enter through your ingress controller. Runtime Fabric creates routing resources from an ingress or HTTP route template.',
    'Apps in the same cluster call each other by internal DNS names, so internal hops need no ingress.',
    'Persistence Gateway stores Object Store data in a PostgreSQL database that you provide; the app uses the same connector as on CloudHub.',
    'Runtime Fabric does not forward logs to external systems, so you install a forwarder such as Fluent Bit or use Log4j appenders.',
    'Run at least two replicas per app, spread across zones. Production needs a Runtime Fabric instance separate from non-production.',
    'The agent reaches the control plane through an outbound mTLS connection, and all nodes need outbound 443 to the listed hostnames.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Dealers / MES client / Portal ─► Customer ingress controller (TLS)
   ├─► exp-dealer-orders ─► prc-order-fulfilment ─► sys-sap-orders ─► SAP
   │                              │ └─~► order.events ─~► prc-production-status
   │                              └─► PostgreSQL (Persistence Gateway)
   └─► exp-plant-status ─► prc-production-status ─► sys-plant-sqlserver ─► Plant SQL Server
 All apps ─► stdout ─► Fluent Bit ─► central log platform
\`\`\`
The Kubernetes cluster and Runtime Fabric are not components in the catalogue: everything from the ingress down to the System APIs runs in the cluster. Anypoint Platform (Runtime Manager, API Manager, Exchange) stays in the control plane.

**Who provides what.**
| MuleSoft | Customer |
|---|---|
| Runtime Fabric agent | Kubernetes cluster and upgrades |
| Mule runtime engine | Ingress controller and load balancing |
| Core services, including resource cache | Log forwarding and monitoring integration |
| Optional Persistence Gateway | Network ports, proxies and the host runtime |

Install with Helm: the overview page limits Rancher to Helm-based management at the runtime plane. Create the Runtime Fabric in Runtime Manager first to get the activation data, and install a separate instance for production.

**Traffic.** Use an HTTP route template, or an ingress resource template, so that app teams can pick hosts in Runtime Manager. TLS secrets are labelled \`rtf.mulesoft.com/synchronized: "true"\` so they reach application namespaces. Only Experience APIs need endpoints exposed for external clients.

Between layers, use in-cluster names rather than going back out through the ingress. Every app has a DNS record in the cluster's internal domain, such as \`http://prc-order-fulfilment:8081/api\` in the same namespace. Use the fully qualified \`svc.cluster.local\` form when a namespace starts with a number.

**State and logs.**
- Configure **Persistence Gateway** with PostgreSQL, using a Kubernetes secret and a \`PersistenceGateway\` custom resource, and select **Use Persistent Object Storage** for the apps that need it. Note its limits: only \`postgresql\`, plain-text database connections, and a maximum TTL.
- Apps log to \`stdout\`, and a forwarder you run, for example Fluent Bit, ships logs to the central platform. Metrics reach Anypoint Monitoring through a sidecar in each replica.

**High availability and capacity.**
- Run at least two replicas of each app. Spread replicas across halls with zone labels, or use **Enforce deploying replicas across nodes**, and make sure there are enough nodes or replicas stay Pending.
- Size reserved and limit CPU per layer from load tests. Experience and Process APIs often suit bursting, whereas latency-critical System APIs can use guaranteed CPU. Allow for sidecars and Runtime Fabric services on each node.
- You own backup and restore: schedule \`rtfctl\` backups to external storage and test restores.

**Firewall.** All nodes need outbound 443 to Anypoint Platform services, plus the control-plane hostnames on the network configuration page. The agent communicates with the control plane through an mTLS outbound connection established at startup. Consumers need 443 to the ingress, and the cluster needs access to the PostgreSQL port. If policy forbids direct image pulls, use a local registry, and plan it at installation, because the change is one-way.
`,
  followUps: [
    { q: 'Why not expose Process and System APIs through the ingress too?', a: 'They have no external consumers, so exposing them adds attack surface and an extra hop. In-cluster DNS names keep that traffic inside the cluster.' },
    { q: 'How do you isolate noisy apps?', a: 'Use guaranteed CPU for critical apps, spread replicas so each has more unallocated CPU to draw on, and keep batch-heavy apps away from latency-critical ones.' },
    { q: 'What if the same app must also run on CloudHub 2.0?', a: 'Keep the code the same: use the Object Store connector, which works on both, and keep platform differences in deployment configuration and ingress.' },
  ],
}
