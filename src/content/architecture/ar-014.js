export default {
  id: 'ar-014',
  category: 'architecture',
  title: 'Gateway Placement: Mule Gateway vs Flex Gateway',
  level: 'INTERMEDIATE',
  tags: ['api-gateway', 'flex-gateway', 'api-manager', 'network-zones'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each group of APIs to where its policies are enforced.',
      pairs: [
        ['35 Mule 4 APIs on CloudHub 2.0', 'Inside the Mule runtime via API Autodiscovery'],
        ['Spring Boot / Node.js services on on-prem Kubernetes', 'Flex Gateway running in that cluster'],
        ['Legacy .NET SOAP service behind an old reverse proxy', 'Flex Gateway on a host in the data center DMZ'],
      ],
      explain: 'Mule apps enforce policies in their own runtime with no extra hop. Non-Mule workloads get a lightweight Flex Gateway placed close to them.',
    },
    {
      type: 'single',
      prompt: 'Why not route the Kubernetes services through a Mule API proxy on CloudHub?',
      options: [
        'Mule proxies cannot apply rate limiting',
        'It adds a round trip from on-prem to the cloud and back, more latency and vCore cost, and a dependency on cloud connectivity for on-prem traffic',
        'API Manager cannot manage proxies',
        'Kubernetes services cannot be called over HTTP',
      ],
      answer: 1,
      explain: 'A gateway close to the service is simpler and faster. A Mule proxy is useful when you cannot change an implementation, not as a hop for every on-prem call.',
    },
    {
      type: 'single',
      prompt: 'Security asks whether API policies can replace the WAF. What is the right answer?',
      options: [
        'Yes, Client ID Enforcement blocks all attacks',
        'No: the WAF/edge handles OWASP, bot and DDoS filtering; the gateway handles identity, contracts and quotas — both are needed for internet traffic',
        'Yes, if JSON Threat Protection is enabled',
        'No, and the gateway is not needed if there is a WAF',
      ],
      answer: 1,
      explain: 'They solve different problems. Internet traffic passes the WAF first and then the gateway; neither replaces the other.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about internal east-west traffic are correct in this design?',
      options: [
        'Internal endpoints are not reachable from the internet (private ingress, no public DNS)',
        'Callers still prove their identity (client ID or JWT) so you know who calls what',
        'Internal traffic skips the WAF hop to save latency',
        'Internal APIs need no policies at all because the network is trusted',
      ],
      answer: [0, 1, 2],
      explain: 'Internal traffic gets lighter controls, not none. Without identity you cannot answer the "who calls what" question security asked for.',
    },
    {
      type: 'single',
      prompt: 'How do you get one view of "who calls what" across Mule and non-Mule APIs?',
      options: [
        'A separate tool per gateway type',
        'Register Flex Gateway in connected mode so Mule APIs and Flex APIs share API Manager: same client apps, contracts, Exchange catalogue and analytics',
        'Parse reverse-proxy logs with a script',
        'Move all microservices into Mule',
      ],
      answer: 1,
      explain: 'Connected mode puts Flex Gateway under the same control plane as Mule gateways, so policies and analytics live in one place.',
    },
    {
      type: 'single',
      prompt: 'Flex Gateway in connected mode loses its connection to the control plane. What happens?',
      options: [
        'All traffic is blocked immediately',
        'All policies are removed and traffic flows unprotected',
        'It keeps enforcing the last known configuration, but new policies or contracts cannot be pushed until it reconnects',
        'It switches to a Mule runtime',
      ],
      answer: 2,
      explain: 'The data plane keeps working with its last configuration. Run at least two replicas and monitor the connection.',
    },
  ],
  description: `
A logistics company has a mixed landscape:

- 35 Mule 4 APIs on **CloudHub 2.0** (Private Space), some for partners on the internet, most internal.
- 20 **Spring Boot and Node.js microservices** on an on-prem **Kubernetes** cluster, built by another team; several should be exposed to partners and need rate limiting and client ID enforcement.
- A legacy **.NET SOAP service** on a Windows server in the data center that partners call through an old reverse proxy.
- Security requires a **WAF** for all internet traffic and wants one place to see "who calls what" across all APIs.

**Questions:**
- For each group of APIs, where would you enforce API policies: inside the Mule runtime (Mule gateway / autodiscovery), a Mule API proxy, or **Flex Gateway** — and where would that gateway run?
- How do internet (north-south) and internal (east-west) traffic differ in your design?
- How do you get one consistent view and policy management across all of them?
`,
  answerTemplate: `## Mule APIs on CloudHub 2.0

## Kubernetes microservices

## Legacy SOAP service

## External vs internal traffic

## Central management and visibility
`,
  keyPoints: [
    'Mule APIs enforce policies in their own runtime via API Autodiscovery (embedded Mule gateway) — no extra hop needed.',
    'Non-Mule services (Kubernetes microservices, .NET) are protected by Flex Gateway, deployed close to them (e.g. as an ingress in the Kubernetes cluster or on a Linux/Docker host in the data center).',
    'Flex Gateway in connected mode is managed from API Manager, so policies, contracts and analytics are visible in one place alongside Mule APIs.',
    'Internet traffic passes a WAF/edge layer (DDoS, OWASP filtering) before the gateway; the gateway handles API-level concerns (client ID, OAuth, rate limiting, SLA tiers).',
    'Internal east-west traffic still has identity and policies but lighter ones (e.g. client ID or JWT, no WAF), and internal APIs are not reachable from the internet at the network level.',
  ],
  solution: `
**Mule APIs on CloudHub 2.0.** Use **API Autodiscovery**: policies from API Manager run inside the Mule runtime itself (the "Mule gateway"). No separate proxy, no extra network hop. A Mule **API proxy app** is only useful when you cannot change the implementation or want policies isolated from the implementation lifecycle — not needed here.

**Kubernetes microservices.** Use **Anypoint Flex Gateway** (Envoy-based, lightweight) running in the on-prem Kubernetes cluster — as the ingress gateway for the partner-facing services (or close to them). Register it in **connected mode** so API Manager applies the same policy types (Client ID Enforcement, Rate Limiting/SLA-based, JWT Validation, etc.). The microservice teams keep their stack; MuleSoft does not need to rewrite them.

**Legacy SOAP service.** Replace the old reverse proxy with a **Flex Gateway** instance on a Linux host/container in the data center DMZ, or a Mule proxy if SOAP-specific mediation is needed. If partners will later get a modern REST contract, wrap it with a Mule System API instead — that's a separate decision from gateway placement.

**North-south vs east-west.**
- *Internet → company:* DNS → **CDN/WAF** (e.g. the company's existing edge provider) → public ingress of the Private Space or the DMZ Flex Gateway → API. WAF handles OWASP/bot/DDoS; the gateway handles **identity, contracts, quotas**. Don't expect API policies to replace a WAF or vice versa.
- *Internal:* internal-only endpoints (private ingress/internal load balancer, VPN/transit connectivity), no public DNS. Still enforce identity (client ID or JWT from the corporate IdP) so you know which app calls which API, but lighter policies and no WAF hop for latency.

**Central management.** One **API Manager** organisation/business groups for Mule APIs and Flex Gateway APIs: same client applications and contracts, same Exchange catalogue, analytics in one place. Policy definitions are reused (automated policies per environment for baseline controls like logging or header injection where appropriate).

**Trade-offs.** Flex Gateway adds a component to operate (versions, scaling, HA with at least 2 replicas). Embedding policies in Mule apps avoids a hop but couples policy upgrades to the runtime. The decision is per workload: *Mule app → embedded; non-Mule → Flex*.
`,
  followUps: [
    { q: 'Why not route the Kubernetes services through a Mule proxy on CloudHub instead of running Flex Gateway?', a: 'That adds an extra network round trip from on-prem to the cloud and back, increases latency and cost per vCore, and creates a dependency on cloud connectivity for on-prem traffic. A gateway close to the service is simpler and faster.' },
    { q: 'What happens if Flex Gateway loses connection to the Anypoint control plane?', a: 'In connected mode, the gateway keeps enforcing the last known configuration, but you cannot push new policies or contracts until the connection returns. Run at least two replicas and monitor the connection.' },
    { q: 'Traffic grows 10x on partner APIs. Where is the scaling pressure?', a: 'On the edge/WAF and the gateway replicas first, then the backends. Flex Gateway scales horizontally (more replicas behind the load balancer); rate limits per client protect backends from being the bottleneck.' },
  ],
}
