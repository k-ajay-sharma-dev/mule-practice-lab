export default {
  id: 'ms-040',
  category: 'mulesoft',
  title: 'API Proxies, Policy Ordering and Custom Policies',
  level: 'ADVANCED',
  tags: ['api-manager', 'api-proxy', 'custom-policies', 'flex-gateway'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each API to where its policies should run.',
      pairs: [
        ['Customer API — Mule app you can change', 'Autodiscovery in the app'],
        ['Pricing API — Spring Boot service you cannot change', 'Flex Gateway (or a Mule proxy) in front'],
        ['Legacy Billing — vendor SOAP service', 'A proxy in front, with the backend reachable only through it'],
      ],
      explain: 'Autodiscovery applies policies inside a Mule implementation with no extra hop. Unmodifiable or non-Mule backends need a proxy — and network rules so the proxy cannot be bypassed.',
    },
    {
      type: 'order',
      prompt: 'Put the policies in the recommended order for the request path.',
      items: [
        'IP allowlist',
        'JWT validation',
        'Client ID enforcement',
        'Rate limiting',
        'Custom X-Tenant-Id check',
      ],
      explain: 'Cheapest rejection first, then establish identity, so only authenticated clients consume quota. The tenant check needs the validated JWT claims, so it goes last.',
    },
    {
      type: 'single',
      prompt: 'In testing, the header check failed with a null claim. Why?',
      options: [
        'The JWT policy strips claims from the request',
        'The custom check ran before JWT validation, so no validated claims existed yet',
        'Custom policies cannot read JWT claims',
        'The client sent the header in lower case',
      ],
      answer: 1,
      explain: 'Policies run in the configured order on the request (and in reverse on the response). A check that depends on JWT claims must come after JWT validation.',
    },
    {
      type: 'match',
      prompt: 'Match each custom policy type to how it is built.',
      pairs: [
        ['Mule 4 custom policy', 'Maven project with a YAML definition and a template using `http-policy:proceed`'],
        ['Flex Gateway custom policy', 'Policy Development Kit — Rust compiled to WebAssembly'],
        ['Built-in policy configuration', 'No code — check this option before writing a custom policy'],
      ],
      explain: 'Both custom types are published to Exchange. A custom policy is code you must test, version and upgrade, so first see whether a built-in policy can be configured to do the job.',
    },
    {
      type: 'single',
      prompt: 'The Customer API starts, but its policies have not been downloaded from API Manager yet. What happens to incoming requests?',
      options: [
        'They pass through unprotected until policies arrive',
        'The gatekeeper rejects them, so the API is never exposed unprotected',
        'They are queued in memory',
        'The app fails to start',
      ],
      answer: 1,
      explain: 'Gatekeeper behaviour blocks traffic until policies are applied.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about policies and autodiscovery are true?',
      options: [
        'The runtime needs the API instance ID and platform client ID/secret to download policies',
        'Changing a policy in API Manager does not require redeploying the app',
        'Policies are packaged inside the application jar',
        'Many policies can be scoped to specific methods and resource paths',
      ],
      answer: [0, 1, 3],
      explain: 'Policies live in API Manager, not in the app; the runtime polls for and downloads them.',
    },
  ],
  description: `
Your organisation must put governance in front of three APIs:

| API | Implementation | Can you change its code? |
|---|---|---|
| Customer API | Mule app on CloudHub 2.0 | Yes |
| Pricing API | Spring Boot service on Kubernetes | No (other team) |
| Legacy Billing | SOAP service in the data centre | No (vendor) |

Policies required:
- Client ID enforcement
- Rate limiting (100 req/min per client)
- JWT validation for internal callers
- IP allowlist
- A **company-specific** header check: every request must carry \`X-Tenant-Id\` that matches a claim in the JWT

Issues found in testing:
- Clients without a valid token were being counted against rate limits.
- The header check ran before JWT validation and failed with a null claim.

**Questions**
1. When do you use autodiscovery in the implementation, a Mule proxy, or Flex Gateway?
2. How does policy ordering work, and what order do you recommend here? Explain the testing issue.
3. How would you implement the \`X-Tenant-Id\` check? Describe the custom policy options.
4. What does API Manager need from a Mule runtime to apply policies, and what happens before policies are downloaded?
`,
  answerTemplate: `## Autodiscovery vs proxy vs Flex Gateway

## Policy ordering

## The tenant check as a custom policy

## How policies reach the runtime
`,
  keyPoints: [
    'Autodiscovery pairs a Mule app with an API Manager instance so policies are applied inside the implementation itself.',
    'For non-Mule or unmodifiable backends, use a proxy: Flex Gateway (current recommended gateway) or a Mule proxy app generated by API Manager.',
    'Policies execute in the configured order on the request and in reverse on the response; cheap rejections (IP allowlist) and authentication go before rate limiting and custom checks.',
    'Mule 4 custom policies are Maven projects with a YAML definition and a policy template, published to Exchange; Flex Gateway custom policies are built with the Policy Development Kit (WebAssembly).',
    'The runtime needs platform client credentials and the API instance ID; gatekeeper behaviour blocks traffic until policies are applied.',
  ],
  solution: `
**Where policies run**
- **Customer API (Mule, modifiable):** **autodiscovery** — \`<api-gateway:autodiscovery apiId="$\{api.id}" flowRef="main"/>\` in the app. No extra hop.
- **Pricing API and Legacy Billing (cannot change):** a **proxy** in front. Options: **Flex Gateway** (lightweight, runs as container/Linux service, managed from API Manager in connected mode), which is the current recommended choice. The other option is a classic **Mule proxy** app that API Manager generates and deploys to CloudHub/RTF/hybrid. The backend must then be reachable only through the proxy (network rules), otherwise policies can be bypassed.

**Ordering:** policies form a chain in the order configured in API Manager (you can reorder them). Request flows top-down; response flows bottom-up. Recommended:
1. IP allowlist — cheapest rejection
2. JWT validation — establishes identity
3. Client ID enforcement
4. Rate limiting / SLA — only authenticated, identified clients consume quota
5. Custom \`X-Tenant-Id\` check — depends on the validated JWT claims

The testing issue: rate limiting sat before authentication (unauthenticated calls consumed quota) and the custom check ran before JWT validation, so no validated claims existed yet.

**Tenant check — custom policy**
- **Mule 4 custom policy:** a Maven project (custom policy archetype) with a YAML file describing configurable parameters and a template XML using \`http-policy:proceed\` to call the next policy/API. It compares \`attributes.headers."x-tenant-id"\` with a JWT claim and returns 403 otherwise. Publish to Exchange; it then appears in API Manager. Runs on Mule runtimes (autodiscovery or Mule proxy).
- **Flex Gateway custom policy:** written with the **Policy Development Kit** (Rust compiled to WebAssembly), published to Exchange.
- Before writing one, check whether a built-in policy can be configured to do it (e.g. some JWT policy options validate claims) — custom policies are code you must test, version and upgrade.

**How policies reach the runtime:** the app needs the **API instance ID** and organisation/environment **client ID and secret** (on CloudHub these are provided by the platform when configured; on-prem/RTF you set them). The runtime polls API Manager and downloads the policies. Until they are applied, the **gatekeeper** rejects requests so the API is never exposed unprotected.
`,
  followUps: [
    {
      q: 'What is the difference between Client ID Enforcement and rate limiting SLA based?',
      a: 'Client ID enforcement only checks that the caller has a valid registered client application; SLA-based rate limiting uses the client\'s contract tier to apply per-client limits and requires client credentials too.',
    },
    {
      q: 'Can you apply policies to a single resource or method?',
      a: 'Yes, many policies can be scoped to specific methods and resource paths in API Manager instead of the whole API.',
    },
    {
      q: 'What happens to policies when you redeploy the app?',
      a: 'Policies live in API Manager, not in the app, so they are re-downloaded on start. Changing a policy does not require a redeploy.',
    },
  ],
}
