import { diagram } from '../../arch/dsl.js'

const WAF = { type: ['load-balancer', 'api-gateway'], label: ['waf', 'firewall'] }
const NON_MULE = ['external-api', 'legacy', 'saas']
const K8S = { type: NON_MULE, label: ['kubernetes', 'k8s', 'microservice', 'spring', 'node'] }
const SOAP = { type: NON_MULE, label: ['soap', '.net'] }
const MULE = ['experience-api', 'process-api', 'system-api']

export default {
  id: 'ar-014',
  category: 'architecture',
  title: 'Gateway Placement: Mule Gateway vs Flex Gateway',
  level: 'INTERMEDIATE',
  tags: ['api-gateway', 'flex-gateway', 'api-manager', 'network-zones'],
  estMinutes: 25,
  diagram: {
    task: 'draw where policies are enforced for the three groups of APIs. Partners on the internet pass a WAF first. Draw the Kubernetes microservices and the .NET SOAP service as Third-party API or Legacy boxes, with Kubernetes or SOAP in their names, and put each behind its own Flex Gateway. Internal apps call the internal Mule APIs.',
    checks: [
      { label: 'Partners enter through the WAF', rule: { type: 'each', of: 'partner', edgeTo: WAF } },
      { label: 'Internet traffic never reaches an API or gateway without passing the WAF', rule: { type: 'no-path', from: 'partner', to: [...MULE, 'api-gateway', ...NON_MULE], unless: WAF } },
      { label: 'Partners reach the Mule APIs through the WAF', rule: { type: 'path', from: 'partner', via: WAF, to: MULE } },
      { label: 'The Kubernetes microservices are reached only through a Flex Gateway close to them', rule: { type: 'only-via', target: K8S, from: 'api-gateway' } },
      { label: 'The SOAP service is reached only through a Flex Gateway in the DMZ', rule: { type: 'only-via', target: SOAP, from: 'api-gateway' } },
      { label: 'Partners reach the microservices through the WAF', rule: { type: 'path', from: WAF, to: K8S } },
      { label: 'Partners reach the SOAP service through the WAF', rule: { type: 'path', from: WAF, to: SOAP } },
      { label: 'Mule APIs enforce their own policies, with no Flex Gateway or proxy in front', rule: { type: 'no-edge', from: { type: 'api-gateway', label: ['flex', 'proxy'] }, to: MULE } },
      { label: 'Internal apps reach the internal Mule APIs', rule: { type: 'path', from: 'internal-app', to: MULE } },
      { label: 'Internal traffic skips the WAF hop', rule: { type: 'no-path', from: 'internal-app', to: WAF } },
      { label: 'Gateways, ingresses and the WAF forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: ['load-balancer', 'api-gateway'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        ptn: ['partner', 'Partners on the internet'],
        int: ['internal-app', 'Internal apps (client ID or JWT)'],
        waf: ['load-balancer', 'CDN and WAF (OWASP, bots, DDoS)'],
        pub: ['load-balancer', 'Private Space public ingress'],
        prv: ['load-balancer', 'Private ingress (no public DNS)'],
        mp: ['experience-api', 'Partner Mule APIs (Autodiscovery policies)', { auth: 'client-id' }],
        mi: ['process-api', 'Internal Mule APIs (Autodiscovery policies)', { auth: 'jwt' }],
        fk: ['api-gateway', 'Flex Gateway in the Kubernetes cluster (connected mode)', { auth: 'client-id', rateLimit: 80 }],
        k8s: ['external-api', 'Spring Boot and Node.js microservices on Kubernetes'],
        fd: ['api-gateway', 'Flex Gateway in the DMZ (connected mode)', { auth: 'client-id', rateLimit: 15 }],
        soap: ['legacy', '.NET SOAP service'],
      },
      ['ptn -> waf', 'waf -> pub', 'pub -> mp', 'waf -> fk', 'fk -> k8s', 'waf -> fd', 'fd -> soap', 'int -> prv', 'prv -> mi'],
    ),
    simulation: {
      systems: [
        { match: WAF, latencyMs: 20 },
        { match: 'external-api', latencyMs: 80, maxRps: 100 },
        { match: 'legacy', latencyMs: 400, maxRps: 20 },
      ],
      tests: [
        {
          name: 'Partners without a client ID',
          about: 'Registered partners call the microservices 40 times a second. Callers with no client ID try the microservices, the SOAP service and the partner Mule APIs. Every one of those is refused.',
          traffic: [
            { name: 'registered partners', from: 'partner', rps: 40, to: 'external-api' },
            { name: 'no ID to microservices', from: 'partner', rps: 10, to: 'external-api', auth: 'none' },
            { name: 'no ID to SOAP', from: 'partner', rps: 5, to: 'legacy', auth: 'none' },
            { name: 'no ID to Mule APIs', from: 'partner', rps: 10, to: 'experience-api', auth: 'none' },
          ],
          expect: {
            answers: [
              { flow: 'registered partners', minSuccess: 0.99 },
              { flow: 'no ID to microservices', minRefused: 0.99 },
              { flow: 'no ID to SOAP', minRefused: 0.99 },
              { flow: 'no ID to Mule APIs', minRefused: 0.99 },
            ],
          },
        },
        {
          name: 'A partner floods the microservices',
          about: 'For three minutes partners send 300 requests a second to the microservices, which handle about 100. The Flex Gateway rate limit keeps them under that, and SOAP callers are not affected.',
          traffic: [
            { name: 'microservices', from: 'partner', rps: 40, to: 'external-api', spikes: [{ at: 3, forMin: 3, rps: 300 }] },
            { name: 'SOAP', from: 'partner', rps: 8, to: 'legacy' },
          ],
          expect: {
            answers: [{ flow: 'SOAP', minSuccess: 0.99 }, { flow: 'microservices', maxFailed: 0.01 }],
            peakRps: [{ node: 'external-api', max: 100 }],
          },
        },
        {
          name: 'Internal apps call internal APIs',
          about: 'Internal apps call the internal Mule APIs 30 times a second with a JWT, and a script with no token tries too. The internal calls skip the WAF, and the script is refused.',
          traffic: [
            { name: 'internal apps', from: 'internal-app', rps: 30, to: 'process-api' },
            { name: 'script with no token', from: 'internal-app', rps: 5, to: 'process-api', auth: 'none' },
          ],
          expect: {
            answers: [{ flow: 'internal apps', minSuccess: 0.99, maxMs: 200 }, { flow: 'script with no token', minRefused: 0.99 }],
            notReached: [{ node: WAF }],
          },
        },
      ],
    },
  },
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
      needsScenario: true,
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
      type: 'single',
      prompt: 'A company puts a WAF (web application firewall) in front of its internet APIs. Its internal APIs are reachable only through private ingress. Security wants to know who calls what, and internal calls must not pay for an extra hop. How should internal east-west traffic be controlled?',
      options: [
        'Callers prove their identity with a client ID or JWT, and the traffic skips the WAF hop',
        'Callers send no identity because the network is trusted, and the traffic skips the WAF hop',
        'Callers prove their identity with a client ID or JWT, and the traffic passes the WAF first',
        'Callers send no identity because the network is trusted, and the traffic passes the WAF first',
      ],
      answer: 0,
      explain: 'Internal traffic gets lighter controls, not none. Without identity you cannot answer the "who calls what" question security asked for. Internal traffic skips the WAF hop to save latency. Internal endpoints stay unreachable from the internet, with private ingress and no public DNS.',
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

Numbers: the microservices handle about **100 requests a second** (80 ms each), and partners normally send 40, with bursts of 300. The SOAP service answers in 400 ms and handles about 20 a second. The WAF adds about 20 ms. Internal apps call the internal Mule APIs about 30 times a second with a JWT from the corporate IdP. Every caller, inside or outside, must prove who it is.

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
    'Policy settings: client ID enforcement on both Flex Gateways and the partner Mule APIs, JWT validation on the internal APIs, and a rate limit of 80 a second on the Kubernetes Flex Gateway (15 on the SOAP one) so a burst never reaches the services.',
  ],
  solution: `
**Mule APIs on CloudHub 2.0.** Use **API Autodiscovery**: policies from API Manager run inside the Mule runtime itself (the "Mule gateway"). No separate proxy, no extra network hop. A Mule **API proxy app** is only useful when you cannot change the implementation or want policies isolated from the implementation lifecycle — not needed here.

**Kubernetes microservices.** Use **Anypoint Flex Gateway** (Envoy-based, lightweight) running in the on-prem Kubernetes cluster — as the ingress gateway for the partner-facing services (or close to them). Register it in **connected mode** so API Manager applies the same policy types (Client ID Enforcement, Rate Limiting/SLA-based, JWT Validation, etc.). The microservice teams keep their stack; MuleSoft does not need to rewrite them.

**Legacy SOAP service.** Replace the old reverse proxy with a **Flex Gateway** instance on a Linux host/container in the data center DMZ, or a Mule proxy if SOAP-specific mediation is needed. If partners will later get a modern REST contract, wrap it with a Mule System API instead — that's a separate decision from gateway placement.

**North-south vs east-west.**
- *Internet → company:* DNS → **CDN/WAF** (e.g. the company's existing edge provider) → public ingress of the Private Space or the DMZ Flex Gateway → API. WAF handles OWASP/bot/DDoS; the gateway handles **identity, contracts, quotas**. Don't expect API policies to replace a WAF or vice versa.
- *Internal:* internal-only endpoints (private ingress/internal load balancer, VPN/transit connectivity), no public DNS. Still enforce identity (client ID or JWT from the corporate IdP) so you know which app calls which API, but lighter policies and no WAF hop for latency.

**Central management.** One **API Manager** organisation/business groups for Mule APIs and Flex Gateway APIs: same client applications and contracts, same Exchange catalogue, analytics in one place. Policy definitions are reused (automated policies per environment for baseline controls like logging or header injection where appropriate).

**Policy settings.** Each gateway enforces the policies of the APIs behind it. The Kubernetes Flex Gateway has client ID enforcement and a rate limit of 80 requests a second, below the 100 a second the microservices can take, so a 300 a second burst gets 429 at the gateway instead of 503 from the services. The DMZ Flex Gateway has client ID enforcement and a limit of 15 a second for the SOAP service. The partner Mule APIs enforce client ID through Autodiscovery, and the internal Mule APIs validate the JWT of each internal caller, so a script with no token is refused even though it never passes the WAF.

**Trade-offs.** Flex Gateway adds a component to operate (versions, scaling, HA with at least 2 replicas). Embedding policies in Mule apps avoids a hop but couples policy upgrades to the runtime. The decision is per workload: *Mule app → embedded; non-Mule → Flex*.
`,
  followUps: [
    { q: 'Why not route the Kubernetes services through a Mule proxy on CloudHub instead of running Flex Gateway?', a: 'That adds an extra network round trip from on-prem to the cloud and back, increases latency and cost per vCore, and creates a dependency on cloud connectivity for on-prem traffic. A gateway close to the service is simpler and faster.' },
    { q: 'What happens if Flex Gateway loses connection to the Anypoint control plane?', a: 'In connected mode, the gateway keeps enforcing the last known configuration, but you cannot push new policies or contracts until the connection returns. Run at least two replicas and monitor the connection.' },
    { q: 'Traffic grows 10x on partner APIs. Where is the scaling pressure?', a: 'On the edge/WAF and the gateway replicas first, then the backends. Flex Gateway scales horizontally (more replicas behind the load balancer); rate limits per client protect backends from being the bottleneck.' },
  ],
}
