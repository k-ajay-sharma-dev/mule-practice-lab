export default {
  id: 'ms-006',
  category: 'mulesoft',
  title: 'API Manager Policies, SLA Tiers and Autodiscovery',
  level: 'EXPERT',
  tags: ['api-manager', 'policies', 'autodiscovery', 'security', 'rate-limiting'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'After promotion to Production the app starts fine but **every request returns 503**. What is the most likely cause?',
      options: [
        'The gatekeeper blocks traffic because the API is not paired — e.g. `api.id` or client ID/secret still point at Sandbox',
        'The Rate Limiting policy is set too low',
        'CloudHub 2.0 needs a redeploy after every policy change',
        'The HTTP Listener port is wrong',
      ],
      answer: 0,
      explain: 'Until autodiscovery pairs the app with its API instance and downloads policies, the **gatekeeper** returns 503. Wrong `api.id` or wrong environment credentials are the classic causes. A rate limit would give 429, not 503 for every call.',
    },
    {
      type: 'multi',
      prompt: 'What is needed for API autodiscovery to work with the same JAR in every environment?',
      options: [
        '`<api-gateway:autodiscovery apiId="${api.id}" flowRef="..."/>` in the app',
        '`api.id` set per environment at deployment',
        'Environment credentials `anypoint.platform.client_id` / `client_secret` for that environment',
        'A separate JAR build per environment with the API ID hard-coded',
      ],
      answer: [0, 1, 2],
      explain: 'Externalising `api.id` and supplying the right environment client ID/secret at deployment lets one artifact be promoted without rebuilding.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the policy or feature that meets it.',
      pairs: [
        ['Internal tools only from the corporate egress range', 'IP Allowlist'],
        ['Smooth Black Friday bursts towards System APIs', 'Spike Control'],
        ['Mobile 100/min and Partner 1,000/min', 'Rate Limiting – SLA Based with tiers'],
        ['Partner access approved by the API owner', 'Manual approval on the SLA tier'],
      ],
      explain: 'Plain Rate Limiting can keep a separate quota per identifier, but every identifier gets the same limits; SLA-based rate limiting checks the client ID against the contract and applies its tier. Manual approval is a tier setting.',
    },
    {
      type: 'single',
      prompt: 'A client sends a valid client ID but has exceeded its tier limit. What does the SLA-based rate limiting policy return?',
      options: ['401', '403', '429', '503'],
      answer: 2,
      explain: 'Over-limit requests get **429 Too Many Requests**. Invalid client credentials are rejected with 401 instead.',
    },
    {
      type: 'single',
      prompt: 'Rate limiting is applied without the cluster/distributed option on 3 replicas. What can a client effectively get?',
      options: [
        'Exactly the configured limit — counters are always shared',
        'Up to about 3× the limit, because each replica counts separately',
        'One third of the limit',
        'No limit at all',
      ],
      answer: 1,
      explain: 'Without shared counting each node enforces its own quota. The Distributed option shares the quota only when the runtime runs in HA cluster mode, at the cost of some coordination overhead.',
    },
    {
      type: 'order',
      prompt: 'Order the consumer onboarding steps for the Partner tier.',
      items: [
        'Partner registers a client application in Exchange',
        'Partner requests access to the API with the Partner tier',
        'API owner approves the contract in API Manager',
        'Partner calls the API with that client ID and secret',
      ],
      explain: 'Requesting access with a tier creates a contract; for a manual-approval tier it waits for the owner. The SLA policy then validates that client ID/secret.',
    },
  ],
  description: `
You own the **Customer Experience API** (\`customer-xapi\`), deployed to CloudHub 2.0 with 3 replicas in *Production*. Consumers:

- **Mobile app** — must be limited to **100 requests/minute**.
- **Partner portal** — paid tier, **1,000 requests/minute**.
- **Internal batch tools** — must only be callable from the corporate egress IP range.

Further requirements:
- Every consumer must identify itself; unknown callers get rejected before any Mule flow logic runs.
- Partner access must be approved manually by the API owner.
- Black Friday traffic spikes must be smoothed rather than overloading the System APIs.
- The same JAR is promoted Sandbox → Production without rebuilding.

After deployment to Production, **every request returns 503** although the app logs show it started fine.

**Questions**
- How does API autodiscovery link the running app to API Manager? What must be configured in the app and at deployment?
- Why are all requests returning 503?
- Which policies would you apply, in what order, and with what configuration, to meet the requirements?
- How do SLA tiers and client applications/contracts fit in?
- What happens to rate-limit counters across the 3 replicas?
`,
  answerTemplate: `## Autodiscovery

## The 503

## Policies and order

## SLA tiers and contracts

## Rate limits across replicas
`,
  keyPoints: [
    'Autodiscovery element (api-gateway:autodiscovery) references the API instance ID (externalised as a property, e.g. api.id) and the main flow.',
    'The runtime must authenticate to the platform with environment client ID/secret (anypoint.platform.client_id / client_secret), per environment.',
    'Gatekeeper blocks traffic (503) until the API is paired and policies are downloaded — a wrong api.id or missing/invalid credentials causes the 503.',
    'Rate Limiting – SLA Based enforces per-tier limits by client ID; tiers defined in API Manager, partner tier set to manual approval.',
    'IP allowlist for internal tools, Spike Control for smoothing, Client ID Enforcement / SLA policy for identification; cheap rejections first.',
    'The Distributed (clusterizable) option shares the quota only when the runtime runs in HA cluster mode; otherwise each node counts separately.',
  ],
  solution: `
**Autodiscovery**
- In the app: \`<api-gateway:autodiscovery apiId="$\{api.id}" flowRef="customer-xapi-main" />\` — the API instance ID is a property so the same JAR works in every environment.
- At deployment: set \`api.id\` per environment (the Production API instance ID) and the **environment** credentials \`anypoint.platform.client_id\` / \`anypoint.platform.client_secret\` (on CloudHub these can be supplied by the platform or as protected properties). The runtime then registers with API Manager, pulls policies and reports analytics.

**The 503:** the gateway's **gatekeeper** blocks all requests until the API is successfully paired with API Manager and its policies are applied. Typical causes: \`api.id\` still pointing at the Sandbox instance, Sandbox client ID/secret used in Production, or the API instance not existing in that environment. Check the app log for autodiscovery/pairing errors and the API instance status ("Active").

**Policies (order from cheapest/broadest rejection to most specific):**
1. **IP Allowlist** — on the internal resources only (resource-level policy) or via a separate API instance for internal tools; allow the corporate egress CIDR.
2. **Spike Control** — e.g. a max number of requests per short window with a few queued attempts and delay, to smooth bursts towards System APIs.
3. **Rate Limiting – SLA Based** — needs a client ID expression (the client secret expression is optional; e.g. headers \`client_id\` / \`client_secret\`), validates the caller's contract **and** applies the tier limit, so it covers "every consumer must identify itself". Invalid client credentials get 401; over-limit gets 429.
   (Alternatively Client ID Enforcement + plain Rate Limiting, but plain Rate Limiting can't differentiate tiers.)
4. Optionally JWT Validation / header injection policies as the security model requires.

**SLA tiers and contracts:**
- Define tiers on the API instance: *Mobile* (100 req/min, auto-approve) and *Partner* (1,000 req/min, **manual approval**).
- Each consumer registers a **client application** in Exchange and requests access to the API with a tier → a **contract**. Partner requests wait in API Manager until the owner approves.
- The client ID/secret of that client application is what the SLA policy checks.

**Across replicas:** rate limiting policies have a Distributed (clusterizable) option, but it shares the quota only when the runtime runs in HA cluster mode; otherwise each of the 3 replicas enforces its own quota and a client could effectively get up to 3× the limit. Shared counting adds coordination overhead, so mention the trade-off. The docs disagree on this target: the SLA policy page says clustering is not available on CloudHub, while the CloudHub 2.0 docs describe a Runtime Cluster Mode, so confirm shared quotas on your deployment before relying on them.
`,
}
