import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-089',
  category: 'architecture',
  title: 'Governing Non-Mule Services from a Data Centre: Mule Proxies on a Hybrid Cluster with Shared Quotas',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-management', 'api-proxy', 'rate-limiting', 'runtime-manager', 'observability', 'deployment', 'hybrid'],
  estMinutes: 45,
  diagram: {
    task: 'draw how partners and internal apps reach a vendor SOAP service and a Spring Boot service through a load balancer and Mule API proxies in the data centre, with monitoring data leaving the proxy tier and no direct route to the services.',
    checks: [
      { label: 'Partners enter through a load balancer', rule: { type: 'edge', from: 'partner', to: 'load-balancer' } },
      { label: 'The load balancer sends traffic to the proxy tier', rule: { type: 'edge', from: 'load-balancer', to: 'api-gateway' } },
      { label: 'Separate proxies for the SOAP service and the Spring Boot service', rule: { type: 'node', match: 'api-gateway', min: 2 } },
      { label: 'The vendor SOAP service is reached only through a proxy', rule: { type: 'only-via', target: 'legacy', from: 'api-gateway' } },
      { label: 'The Spring Boot service is reached only through a proxy', rule: { type: 'only-via', target: 'system-api', from: 'api-gateway' } },
      { label: 'Partners have no direct route to the vendor service', rule: { type: 'no-edge', from: 'partner', to: 'legacy' } },
      { label: 'Monitoring data goes from the proxy tier to Anypoint Monitoring', rule: { type: 'edge', from: 'api-gateway', to: 'monitoring' } },
      { label: 'Load balancers forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: 'load-balancer', kind: 'sync' } },
      { label: 'Partners and internal apps both enter through the load balancer', rule: { type: 'each', of: ['partner', 'internal-app'], min: 2, edgeTo: 'load-balancer' } },
      { label: 'Every proxy is reached through the load balancer', rule: { type: 'each', of: 'api-gateway', edgeFrom: 'load-balancer' } },
      { label: 'Every proxy sends its monitoring data to Anypoint Monitoring', rule: { type: 'each', of: 'api-gateway', edgeTo: 'monitoring' } },
      { label: 'No client has a direct line to either service', rule: { type: 'no-edge', from: ['partner', 'internal-app'], to: ['legacy', 'system-api'] } },
      { label: 'Proxies forward live requests, so their lines to the services are sync calls', rule: { type: 'lines', from: 'api-gateway', to: ['legacy', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        p: ['partner', 'Partner systems'],
        i: ['internal-app', 'Branch applications'],
        lb: ['load-balancer', 'Data centre load balancer'],
        gw1: ['api-gateway', 'claims-soap-proxy (WSDL proxy, Mule cluster)'],
        gw2: ['api-gateway', 'quotes-proxy (OAS proxy, Mule cluster)'],
        q: ['system-api', 'quotes-service (Spring Boot, unchanged)'],
        v: ['legacy', 'Vendor claims SOAP service'],
        mon: ['monitoring', 'Anypoint Monitoring (agent on every server)'],
      },
      ['p -> lb', 'i -> lb', 'lb -> gw1', 'lb -> gw2', 'gw1 -> v', 'gw2 -> q', 'gw1 -> mon', 'gw2 -> mon'],
    ),
  },
  description: `
An insurer must stay in its data centre for regulatory reasons, and it runs Mule on-premises, managed from Runtime Manager. Security wants all access to two services to be governed:

| Service | Technology | Can it change? | Rules |
|---|---|---|---|
| \`claims\` | Vendor SOAP service | No | Clients see SOAP faults, 40 partners, per-partner quota is part of the contract |
| \`quotes\` | Spring Boot REST service with an OAS 3 spec | No | Invalid requests should be stopped before they reach it |

Other facts:
- Four servers are available. DHCP is used for servers today. The network team blocks multicast.
- Each partner's quota must hold across all servers, because the vendor charges for every call.
- A proxy outage must not expose the services without policies after a restart.
- Operations want metrics and logs from all four servers, and a view of who calls what.

**Questions:**
- Draw the runtime path.
- Which proxy type do you use for each service, and what does each give you?
- Server group or cluster? What must change in the network?
- How does each policy behave across the nodes?
- What happens at restart and if Anypoint Platform cannot be reached?
- What must be set up for monitoring?
`,
  answerTemplate: `## Target architecture

## Proxy types

## Server group or cluster

## Policies across nodes

## Restart and platform outages

## Monitoring
`,
  keyPoints: [
    'Services that are not Mule apps use a proxy application, with the service as the Upstream URL. Register the servers, then choose Hybrid as the target.',
    'A WSDL proxy sends MuleSoft policy errors as soap:fault messages. A RAML or OAS proxy validates requests against the spec, and the OAS proxy can return 400, 404 and 405.',
    'A shared per-partner quota needs a Mule HA cluster with Distributed on. On a server group, each node enforces the quota on its own.',
    'Unicast clusters need fixed IP addresses, so DHCP must change. Multicast is blocked here.',
    'Keep nodes on one subnet or in one availability zone. Cluster quota windows should be longer than one minute.',
    'Spike Control cannot be clustered, so divide the backend limit between the nodes.',
    'Gatekeeper returns 503 after a restart until policies apply. The flexible level uses the local cache if the platform cannot be reached.',
    'Install the Anypoint Monitoring agent on each server. API Visualizer on standalone Mule also needs header injection, set at server level.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Partners, branches ─► Load balancer ─► claims-soap-proxy ─► Vendor SOAP service
                                    └─► quotes-proxy      ─► quotes-service (Spring Boot)
                                              │
                                              └─► Anypoint Monitoring (agent on all servers)
\`\`\`
The proxies run on a four-node Mule cluster. Firewall rules allow the services to be reached only from the proxy servers.

**Proxy types.** In API Manager, choose **Mule Gateway > Deploy a proxy application > Hybrid**, and select the cluster as the target.
- \`claims\`: **WSDL proxy**. Errors from MuleSoft-provided policies are sent as \`soap:fault\` messages, which fits SOAP clients.
- \`quotes\`: **OAS proxy**. It validates requests, and the status-code table shows 400, 404 and 405 for it. It also has an API Console at \`/console\`.

The generated proxy already contains autodiscovery, so nothing changes in the services.

**Server group or cluster.** The per-partner quota must hold across nodes. **Distributed** works only in a Mule HA cluster, so choose a **cluster**. A server group would give four separate counters.

Multicast is blocked, so use a **unicast** cluster. It needs fixed IP addresses, because Mule identifies nodes by IP, so DHCP must stop for these servers. Keep them on one subnet or in one availability zone. All nodes need the same Mule runtime, agent and Java versions.

**Policies across nodes.**
- **Rate Limiting SLA**, with Distributed, gives one quota per contract across the cluster. Distributed counters can add latency, so prefer windows longer than one minute.
- **Spike Control** works per gateway instance and cannot be clustered. If \`quotes-service\` can take 200 requests per second, set about 50 per node on four nodes.
- **Client ID Enforcement** identifies the partners. Each client application has a contract with the instance.

**Restart and platform outages.** Gatekeeper is engaged on restart or redeploy, and the proxy returns **503** until all policies apply without errors. So a restart cannot expose a service without its policies. The default level from Mule 4.1.0 is **flexible**: if the platform cannot be reached, Mule uses its local cache of policies, and a resource stays blocked only if there is no cache. **Strict** stays blocked until the connection returns. Choose strict if an outage should fail closed. Do not use disabled here.

**Monitoring.** The Anypoint Monitoring agent is installed on **each** server of a cluster. Outbound firewall ports must be open. For API Visualizer on standalone Mule, enable header injection at server level, which affects all apps on that server. Log search is not the same as the \`mule_ee.log\` file: the FAQ says you cannot view on-premises \`mule_ee.log\` files directly through log search.
`,
  followUps: [
    { q: 'Why not use Omni Gateway (formerly Flex Gateway) here?', a: 'It is a strong option for non-Mule services, and it has its own deployment models. This design assumes the team already runs and supports Mule on-premises and wants one runtime. A per-partner shared quota would then need its own check against Omni Gateway docs.' },
    { q: 'How many servers can be in a cluster?', a: 'Runtime Manager describes a cluster as a set of up to eight servers.' },
    { q: 'Is a cluster needed if the backend limit is the only concern?', a: 'No. The Rate Limiting page says that with a load balancer in front of the proxies and one backend, you do not need a cluster. That holds as long as you set the policy below the backend capacity. The commercial per-partner quota is what requires the cluster here.' },
    { q: 'What credentials does the proxy use to reach API Manager?', a: 'A proxy deployed from API Manager has its API Manager credentials set for you in the platform deployment path. For a self-managed server you configure them. The environment client ID and secret are the recommended pair.' },
  ],
}
