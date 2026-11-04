export default {
  id: 'inc-040',
  category: 'incidents',
  title: 'Anonymous Traffic Burns Partner Rate Limits After a Policy Reshuffle',
  level: 'ADVANCED',
  tags: ['api-manager', 'policies', 'rate-limiting', 'security', 'policy-order'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '[api-manager] quotes-eapi policy order: 1 Rate Limiting (1000/min, whole API) | 2 Client ID Enforcement | 3 Rate Limiting - SLA based | 4 JWT validation', relevant: true, why: 'The global rate limit runs before authentication, so anonymous requests count against the shared quota.' },
      { text: '10:01  total=61,240  429=60,240  401=530  200=470', relevant: true, why: 'Almost all traffic is unauthenticated junk, yet it consumes the quota and pushes real partners into 429.' },
      { text: '10:01  client=partner-acme  sent=180  429=95', relevant: true, why: 'A partner far below its SLA tier is throttled: the shared quota is already used up.' },
      { text: '10:01  client=partner-globex  sent=40  200=40', relevant: false },
      { text: '[corp-gateway] rate-limit per-client=300/min (all clients, configured 2019)', relevant: true, why: 'A second, older limit at the corporate gateway is half the Gold tier, so Gold partners are capped even with no scraper.' },
      { text: '03:00  client=partner-gold-initech  sent=320  429=20  (no anonymous traffic)', relevant: true, why: 'Night-time throttling at about half the Gold rate confirms the duplicate gateway limit, independent of the scraper.' },
      { text: '[api-manager] SLA tiers: Silver 300/min, Gold 600/min', relevant: false },
    ],
    questions: [
      {
        type: 'multi',
        prompt: 'Why are legitimate partners throttled? (choose all causes)',
        options: [
          'The global rate limit runs before Client ID Enforcement, so anonymous scraper requests consume the shared quota',
          'The corporate gateway applies its own per-client limit at half the Gold tier, so the stricter limit wins',
          'SLA tiers in API Manager are configured too low',
          'JWT validation is too slow and causes timeouts that appear as 429',
        ],
        answer: [0, 1],
        explain: 'Two causes: **policy order** lets junk eat the quota, and **double rate limiting** caps Gold partners at the old gateway value even at night.',
      },
      {
        type: 'order',
        prompt: 'Put the policies in the correct order (first to last).',
        items: [
          'Edge protection: WAF / IP blocklist / spike control',
          'Authentication: Client ID Enforcement / JWT validation',
          'Rate Limiting - SLA based per client',
          'Business policies (e.g. transformation, caching headers)',
        ],
        explain: 'Reject junk cheaply at the edge, authenticate before counting, then apply per-client quotas.',
      },
      {
        type: 'single',
        prompt: 'What do you change **immediately**?',
        options: [
          'Raise the global rate limit to 100,000/min',
          'Reorder so auth runs first, block the scraper at the edge, and keep partner quotas in only one layer',
          'Remove Client ID Enforcement so the 401s stop',
          'Ask partners to slow down',
        ],
        answer: 1,
        explain: 'Raising the limit lets the scraper through to the backend; removing auth is a security hole.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in **prevention**?',
        options: [
          'Policies managed by automation (API Manager API/CLI) with review',
          'Test policy changes in non-prod with authenticated and anonymous load',
          'Alert when clients get 429 while below their tier',
          'Let any admin reorder policies directly in PROD',
        ],
        answer: [0, 1, 2],
        explain: 'Reviewed, tested, monitored policy changes; ad-hoc PROD changes caused this incident.',
      },
    ],
  },
  description: `
## Symptoms
- Partners of \`quotes-eapi\` report **429 Too Many Requests** even though they send far fewer requests than their SLA tier allows.
- Security notices a scraper sending ~1,000 req/s **without credentials**. Most of those requests get 429 and the rest 401, and the partners get 429 too.
- Gold-tier partners also say they are throttled at roughly **half** of their contracted rate even at night, when there is no scraper traffic.

## Change / Context
- Last week an admin reorganised policies on the API instance in API Manager:
  1. **Rate Limiting** (non-SLA, 1,000 req/min for the whole API)
  2. **Client ID Enforcement**
  3. **Rate Limiting – SLA based**
  4. **JWT validation**
- Additionally, a per-client rate limit configured years ago at the corporate API gateway in front of CloudHub still applies, with a single limit for all clients that is **half** the Gold tier.

## Logs (analytics export)
\`\`\`
10:01  total=61,240  429=60,240  401=530  200=470
10:01  client=partner-acme  sent=180  429=95
\`\`\`

## Your tasks
1. Why are legitimate partners throttled?
2. What do you change immediately?
3. What is the correct policy design?
4. How do you prevent misconfiguration?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Policies run in order; a global rate limit placed before authentication counts anonymous/invalid requests and exhausts the shared quota.',
    'Authentication (client ID / JWT) should run first so unauthenticated traffic is rejected cheaply and does not consume limits.',
    'Rate limiting the same requests at two layers (corporate gateway + API Manager) means the stricter limit always wins, so the SLA tiers are not what partners actually get.',
    'Immediate: reorder so auth runs first, remove or adjust the duplicate limit, and block the scraper (IP blocklist / WAF).',
    'Prevention: documented standard policy order, policies managed as code/automated, and testing policy changes in non-prod.',
  ],
  solution: `
## Diagnosis
Policies execute in the configured **order**. The global **Rate Limiting** policy is first, so the scraper's anonymous requests are counted **before** Client ID Enforcement rejects them with 401. The shared quota (1,000/min) is consumed by junk, and legitimate partners get **429**. Separately, every request is **double rate limited**: once at the corporate gateway and once in API Manager. The effective limit is whichever is stricter, so Gold partners hit the old gateway limit (half their tier) long before their SLA tier applies.

## Immediate mitigation
- Reorder policies: **Client ID Enforcement / JWT validation first**, then SLA-based rate limiting, then any global protection.
- Block the scraper at the edge (IP blocklist/WAF) to cut the load.
- Pick one layer for partner quotas and remove the duplicate.

## Root cause
A policy change without understanding execution order, and no single owner of throttling across layers.

## Permanent fix
- Standard order: security/threat protection at the edge (WAF, IP blocklist, spike control for raw protection) → authentication → SLA-based rate limiting per client → business policies.
- Use **spike control** or edge rate limiting (by IP) to protect the backend from anonymous floods; use SLA tiers for partner quotas.
- Return clear 429 with \`Retry-After\`-style headers to partners.

## Prevention
- Policy configuration managed via automation (API Manager API/CLI) with review.
- Test policy changes in non-prod with authenticated and anonymous load.
- Dashboards for 401/429 by client; alert when 429s hit clients below their tier.
`,
  followUps: [
    { q: 'What is the difference between rate limiting and spike control?', a: 'Rate limiting rejects requests above a quota in a time window; spike control smooths bursts by queuing/delaying requests and rejecting only when the queue is exceeded, protecting the backend.' },
    { q: 'How does SLA-based rate limiting identify the client?', a: 'It uses the client ID (validated via client ID enforcement or a token) to look up the client application\'s contract and SLA tier.' },
  ],
}
