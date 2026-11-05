export default {
  id: 'ms-053',
  category: 'mulesoft',
  title: 'Which Policy at Which Layer? Designing a Policy Map for an API-Led Network',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'api-manager', 'policies', 'security', 'rate-limiting', 'sla-tiers'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each API to its core policy set.',
      pairs: [
        ['Customer Mobile EAPI', 'JWT validation / OAuth 2.0 token enforcement + JSON threat protection'],
        ['Partner Orders EAPI', 'Client ID enforcement + Rate Limiting – SLA Based'],
        ['Orders PAPI', 'Client ID enforcement + spike control'],
        ['Customers / Inventory SAPI', 'Client ID enforcement + IP allowlist + rate limit sized to the backend'],
      ],
      explain: 'Each layer authenticates its immediate caller and protects itself according to who its consumers are.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why does **Rate Limiting – SLA Based** belong on the Partner EAPI and not on the System APIs?',
      options: [
        'It is only available on Experience APIs',
        'It enforces per-contract tiers (Gold/Silver/Bronze) — a partner/commercial concept; SAPIs have a few internal callers and need limits sized to backend capacity',
        'System APIs cannot have client applications',
        'It is slower than other policies',
      ],
      answer: 1,
      explain: 'Partner tiers at the SAPI would duplicate limits and couple internal APIs to commercial arrangements.',
    },
    {
      type: 'single',
      prompt: 'Why is IP allowlisting on the Customer Mobile EAPI a bad idea?',
      options: [
        'It is too slow',
        'Mobile clients call from arbitrary IP addresses',
        'IP allowlist conflicts with JWT validation',
        'API Manager does not support it on Experience APIs',
      ],
      answer: 1,
      explain: 'IP allowlists suit callers from known ranges — like Process APIs calling System APIs in a private network.',
    },
    {
      type: 'match',
      prompt: 'Match each policy to what it does.',
      pairs: [
        ['Rate Limiting', 'Rejects requests over a quota in a time window (429)'],
        ['Spike Control', 'Smooths bursts by queuing/retrying up to a limit before rejecting'],
        ['Client ID Enforcement', 'Identifies the calling client application, not the end user'],
      ],
      explain: 'End-user authentication needs OAuth or JWT validation; Client ID Enforcement only checks the application.',
    },
    {
      type: 'single',
      prompt: 'System APIs do not validate user tokens. How does the end-user customer ID reach them?',
      options: [
        'It cannot — System APIs never need it',
        'The EAPI validates the token, extracts claims and sends them downstream as explicit headers or fields along with a correlation ID; downstream layers authenticate the calling app',
        'API Manager injects the user ID automatically',
        'Each SAPI calls the IdP for every request',
      ],
      answer: 1,
      explain: 'Each hop trusts context because it authenticates its immediate caller. End-to-end token validation is a deliberate exception when regulation demands it.',
    },
    {
      type: 'multi',
      prompt: 'What is wrong with "OAuth 2.0, Rate Limiting and IP Allowlist on **every** API"?',
      options: [
        'OAuth on System APIs forces every Process API to obtain and refresh tokens for internal calls without real benefit',
        'IP allowlist cannot work for mobile clients',
        'One identical rate limit ignores each layer\'s consumers and backend capacity',
        'API Manager allows only one policy per API',
      ],
      answer: [0, 1, 2],
      explain: 'Consistency should come from standard policy sets **per layer**, ideally automated and checked by governance.',
    },
  ],
  description: `
You are asked to produce a **policy map** for this API network:

| API | Consumers |
|---|---|
| Customer Mobile EAPI | Mobile app (end users log in via the company IdP) |
| Partner Orders EAPI | ~40 external partners on Gold/Silver/Bronze contracts |
| Orders PAPI | Both EAPIs, plus a batch Mule app |
| Customers SAPI, Inventory SAPI | Process APIs only; runs in a private network |

A colleague's proposal: "Apply OAuth 2.0, Rate Limiting and IP Allowlist to **every** API so we are consistent."

**Questions**
1. Propose the policies per API and justify each.
2. Where do SLA-based rate limiting and spike control belong, and why not on System APIs?
3. How do you pass end-user identity or correlation data downstream if System APIs don't validate user tokens?
4. What is wrong with the colleague's proposal?
`,
  answerTemplate: `## Policy map

## SLA tiers and traffic shaping

## Propagating identity and context

## Critique of "everything everywhere"
`,
  keyPoints: [
    'Experience APIs face the outside world: authenticate users/partners (OAuth 2.0 token enforcement or JWT validation), apply threat protection, CORS for browser clients, and SLA-based rate limiting for partners.',
    'Process APIs authenticate calling applications (client ID enforcement) and may use spike control to protect themselves.',
    'System APIs: client ID enforcement plus IP allowlist (callers come from known internal ranges) and protective rate limiting to shield fragile backends.',
    'Rate Limiting – SLA Based ties limits to the contract tier, so it requires client applications and contracts — ideal for partners.',
    'Context such as user ID or correlation ID flows downstream as headers set by the implementation or header injection; each layer still authenticates its immediate caller.',
  ],
  solution: `
**Policy map**
| API | Policies | Why |
|---|---|---|
| Customer Mobile EAPI | **JWT Validation** or **OAuth 2.0 access token enforcement** (against the company IdP), **JSON threat protection**, CORS if a web client exists, rate limiting / spike control | Authenticates the end user at the edge; protects against malformed/huge payloads |
| Partner Orders EAPI | **Client ID enforcement** or OAuth client credentials, **Rate Limiting – SLA Based** (Gold/Silver/Bronze tiers), threat protection, optionally IP allowlist per partner | Each partner is a client application with a contract on a tier |
| Orders PAPI | **Client ID enforcement**, **spike control** | Callers are known apps; smooth bursts from the batch app |
| SAPIs | **Client ID enforcement**, **IP allowlist** (internal CIDR ranges / private space), **rate limiting** sized to backend capacity | Only Process APIs should call them; protect the legacy backend |

Optional: **Header injection/removal** at EAPI to strip internal headers from responses or add a correlation header; **Message logging** temporarily for troubleshooting (mind PII).

**SLA tiers and traffic shaping**
SLA tiers are defined per API instance; each contract is assigned a tier, and **Rate Limiting – SLA Based** enforces the tier's limits per client application. That's a commercial/partner concept, so it belongs at the Partner EAPI. System APIs have a handful of internal consumers; a simple **Rate Limiting** or **Spike Control** sized to the backend's capacity is the right tool there. Applying partner tiers at the SAPI would duplicate limits and couple internal APIs to commercial arrangements.

**Propagating identity and context**
- The EAPI validates the user token and extracts claims (e.g. \`sub\`, customer ID). The implementation sends them downstream as explicit headers or request fields, e.g. \`x-customer-id\`, along with a correlation ID.
- Downstream layers trust these because they authenticate the **calling application** (client ID / IP allowlist / mTLS) — a zero-trust-ish chain where each hop authenticates its immediate caller.
- If regulation demands end-to-end user identity, pass a token downstream and validate JWTs at the PAPI too — a deliberate exception, not the default.

**Critique of the proposal**
- OAuth on System APIs forces every Process API to obtain and refresh tokens for internal calls — complexity without benefit when client ID + network controls suffice.
- IP allowlist on the Mobile EAPI is impossible (mobile clients have arbitrary IPs).
- One identical rate limit everywhere is wrong: limits should match each layer's consumers and backend capacity.
- Consistency should come from **standard policy sets per layer** (ideally automated in CI/CD and checked by governance), not identical policies on every API.
`,
  followUps: [
    {
      q: 'What is the difference between Rate Limiting and Spike Control?',
      a: 'Rate Limiting rejects requests over a quota in a time window (429), while Spike Control smooths bursts by queuing/retrying requests up to a limit before rejecting them.',
    },
    {
      q: 'Does Client ID Enforcement authenticate the end user?',
      a: 'No. It only identifies the calling client application via its client ID/secret; end-user authentication needs OAuth or JWT validation.',
    },
    {
      q: 'Can you apply policies automatically to many APIs?',
      a: 'Yes — automated policies in API Manager apply to all API instances in an environment, and the Anypoint CLI or API Manager APIs can apply policies per instance from a pipeline.',
    },
    {
      q: 'Where should CORS be applied?',
      a: 'Only on APIs called directly from browsers, which in API-led means Experience APIs; internal layers never receive browser preflight requests.',
    },
  ],
}
