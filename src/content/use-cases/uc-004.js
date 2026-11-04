import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-004',
  category: 'use-cases',
  title: 'Customer 360 from CRM, Billing and Support',
  level: 'INTERMEDIATE',
  tags: ['customer-360', 'scatter-gather', 'api-led', 'caching'],
  estMinutes: 25,
  diagram: {
    task: 'draw the Customer 360 application network: the call-centre app and its identity provider, the Experience, Process and System APIs, the cache, and the three backends.',
    checks: [
      { label: 'The call-centre app calls an Experience API', rule: { type: 'each', of: ['internal-app', 'web-app'], edgeTo: 'experience-api' } },
      { label: 'Experience APIs go through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Customer 360 Process API orchestrates three System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Salesforce is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'The billing Oracle DB is reached only through a System API', rule: { type: 'only-via', target: { type: ['database', 'erp', 'legacy'], label: ['billing', 'oracle'] }, from: 'system-api' } },
      { label: 'Zendesk is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: ['zendesk', 'ticket', 'support'] }, from: 'system-api' } },
      { label: 'Profile and invoices are cached to hit p95 < 2 s', rule: { type: 'edge', from: ['process-api', 'system-api', 'experience-api'], to: 'cache' } },
      { label: 'Agent tokens (with the billing role) come from an identity provider', rule: { type: 'edge', from: ['internal-app', 'web-app', 'experience-api', 'api-gateway'], to: 'identity-provider' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Call-centre app'],
        idp: ['identity-provider', 'Identity provider (JWT with roles)'],
        e: ['experience-api', 'exp-call-centre-api'],
        p: ['process-api', 'prc-customer-360-api'],
        cache: ['cache', 'Profile / invoice cache'],
        ssf: ['system-api', 'sys-salesforce-customer-api'],
        sbil: ['system-api', 'sys-billing-api'],
        szd: ['system-api', 'sys-zendesk-tickets-api'],
        sf: ['crm', 'Salesforce'],
        ora: ['database', 'Billing (Oracle DB)'],
        zd: ['saas', 'Zendesk'],
      },
      ['app -> idp', 'app -> e', 'e -> p', 'p -> cache', 'p -> ssf', 'p -> sbil', 'p -> szd', 'ssf -> sf', 'sbil -> ora', 'szd -> zd'],
    ),
  },
  description: `
A telecom company wants a **Customer 360** screen in the call-centre app. When an agent opens a customer, they need:

- Profile and contracts from **Salesforce** (CRM).
- Last 6 invoices and outstanding balance from the **billing system** (Oracle DB, ~800 ms queries).
- Open tickets from **Zendesk** (REST API, rate-limited).

Facts and constraints:
- ~1,500 agents, peak **40 lookups/second**. Target response **< 2 s at p95**.
- Customer IDs differ per system: Salesforce Account ID, billing account number, Zendesk organisation ID. Salesforce holds a billing account number field; Zendesk organisations have an external_id = Salesforce Account ID.
- If Zendesk is down, agents still want to see profile and billing.
- Billing data is sensitive: only agents with the **billing role** may see invoice amounts.

**Design the solution:**
- Which APIs do you create (API-led) and how are calls orchestrated?
- How do you correlate IDs across systems?
- How do you hit the latency target and handle a failing backend?
- Where do you enforce the billing-role restriction?
`,
  answerTemplate: `## APIs (API-led)

## ID correlation

## Orchestration, latency and partial failure

## Security (billing role)
`,
  keyPoints: [
    'System APIs for Salesforce, billing and Zendesk; a Customer 360 Process API that orchestrates them; an Experience API for the call-centre app.',
    'Salesforce resolved first to get the cross-reference IDs (billing account number, Account ID for Zendesk), then billing and Zendesk called in parallel (Scatter-Gather or async).',
    'Per-call timeouts and error handling so a failed backend returns a partial response with a flag (e.g. tickets unavailable) instead of failing everything.',
    'Caching of slow/less volatile data (profile, invoices) with short TTL to meet p95 < 2 s and reduce load; rate limits on Zendesk respected.',
    'Billing-role restriction enforced server-side (e.g. from token roles/scopes in the Experience or Process API), with amounts masked or omitted for other agents.',
  ],
  solution: `
**APIs.**
- *System:* Salesforce Customer System API, Billing System API (wraps Oracle queries), Zendesk Tickets System API.
- *Process:* **Customer 360 Process API** — \`GET /customers/{accountId}/360\`.
- *Experience:* Call-centre Experience API shaping the screen payload (could be merged with the Process API if there's only one consumer, but separate keeps other channels open).

**ID correlation.** The Salesforce Account ID is the master key. Step 1 calls the Salesforce System API to get profile + **billing account number**. The Zendesk lookup uses \`external_id = accountId\`. Longer term, a cross-reference (xref) table or MDM avoids depending on one system's fields.

**Orchestration and latency.**
1. Salesforce call (needed for IDs).
2. Then **Scatter-Gather** for billing and Zendesk in parallel, each route wrapped in a **Try** scope with an **On Error Continue** that returns a placeholder (\`{ available: false }\`), and a response **timeout** (e.g. 1 s) on each HTTP/DB request. Without the Try scopes, one failed route makes the whole Scatter-Gather throw a composite routing error.
3. DataWeave merges results; the response contains section-level status so the UI can show "Tickets temporarily unavailable".
- **Cache** the profile (TTL ~5 min) and invoices (TTL ~15 min, invalidated when a payment event arrives if available) in Object Store; agents often reopen the same customer during a call.
- Protect Zendesk with client-side throttling and a circuit-breaker style fallback; protect Oracle with connection pool sizing and Spike Control on the System API.
- Note: Scatter-Gather waits for all routes, so per-route timeouts are what keep the total under 2 s.

**Billing role.** The call-centre app sends the agent's OAuth/JWT token; the Experience API validates it (JWT Validation policy) and reads the role/scope claim. If the agent lacks \`billing\`, the Process API does not call (or strips) invoice amounts — enforced on the server, never only hidden in the UI. Log access to billing data for audit.
`,
}
