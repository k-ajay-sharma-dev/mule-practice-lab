export default {
  id: 'cs-117',
  category: 'case-studies',
  title: 'Travel Group Rolling Out a Security Policy Baseline Across 300 APIs',
  level: 'ADVANCED',
  tags: ['governance', 'policies', 'api-manager', 'api-governance', 'security', 'flex-gateway', 'automated-policies'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      prompt: 'Once the rollout is finished, how do you make sure every API in the production environment, including new ones, has the baseline policies?',
      options: [
        'Automated policies in API Manager for the environment, so every managed API gets them without a per-API step',
        'A wiki page asking each team to add the policies when they register an API',
        'Code the checks inside every Mule app with a shared library',
        'A monthly script that e-mails teams whose APIs lack the policies',
      ],
      answer: 0,
      explain: 'Automated policies apply to all APIs in an environment, including APIs created later. Documents and reminders depend on people remembering, and coding security into each app spreads it across 300 code bases and needs a redeploy for every change.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each problem found in the inventory to what you do about it.',
      pairs: [
        ['40 apps run without API autodiscovery', 'Add autodiscovery and redeploy them, or no policy can reach them'],
        ['Many consumers call without registered client applications', 'Create client applications and contracts before enforcement starts'],
        ['Nightly batch consumers would exceed a new rate limit', 'Size SLA tiers from measured traffic per consumer'],
        ['New APIs could be designed without the security scheme', 'An API Governance ruleset checked in the CI pipeline'],
      ],
      explain: 'Policies only reach APIs that API Manager manages, enforcement needs registered clients, limits must come from real traffic, and governance rules stop new gaps at design time.',
    },
    {
      type: 'order',
      prompt: 'Order the rollout for the client ID enforcement policy.',
      items: [
        'Inventory APIs, consumers and current traffic from API Manager and Anypoint Monitoring',
        'Register client applications and contracts for every known consumer',
        'Apply the policy in sandbox and run each API’s regression tests',
        'Announce the enforcement date per wave to consumer owners',
        'Apply per API in production in waves, lowest risk first, watching 401 rates',
        'Replace the per-API policies with one automated policy for the environment',
      ],
      explain: 'Know who calls what, give every caller credentials, prove it in sandbox, warn people, enforce in small waves with a quick rollback, and only then make it automatic for the whole environment.',
    },
    {
      type: 'multi',
      prompt: 'Which three policies belong in the baseline for every API?',
      options: [
        'An authentication policy: client ID enforcement or JWT validation, by API type',
        'Spike control to protect back-end systems from bursts',
        'JSON or XML threat protection for APIs that accept a body',
        'One IP allowlist shared by every API',
      ],
      answer: [0, 1, 2],
      explain: 'Authentication, burst protection and payload threat protection fit almost every API. An IP allowlist depends on who the consumers are, so one shared list either blocks real consumers or protects nothing.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'After wave 2, one API shows 30% of calls rejected with 401 from a caller nobody registered. What do you do?',
      options: [
        'Remove the policy from that API only, find the caller from analytics (client IP, user agent, path), register it, and re-apply with a new date',
        'Keep enforcing; the caller should have read the announcement',
        'Remove the policy from every API in wave 2',
        'Disable logging so the errors stop showing on the dashboard',
      ],
      answer: 0,
      explain: 'Per-API policies give a precise rollback for the affected API. Analytics identify the unknown caller so it can be registered, while other APIs keep their protection.',
    },
    {
      type: 'single',
      prompt: 'Sixty of the 300 APIs are Node.js and .NET services on Kubernetes, not Mule apps. How do they get the same baseline?',
      options: [
        'Put Flex Gateway in front of them, registered with API Manager, so the same policies and automated policies apply',
        'Rewrite all sixty services in Mule before the rollout',
        'Leave them out of the baseline because API Manager only works with Mule',
        'Ask each team to copy the policy logic into their own code',
      ],
      answer: 0,
      explain: 'Flex Gateway brings non-Mule services under API Manager with the same policies. Rewriting is a large project unrelated to security, and leaving them out or copying logic recreates the gaps the audit found.',
    },
  ],
  description: `
**Context.** A travel group (airline, hotels and tour operator brands in 4 business units) has about **300 APIs** in production:

| Runtime | APIs | Notes |
|---|---|---|
| Mule 4 on CloudHub 2.0 | 190 | 40 of them have no API autodiscovery |
| Mule 4 on Runtime Fabric | 50 | Partner-facing booking APIs |
| Node.js and .NET on Kubernetes | 60 | Not managed by API Manager today |

An internal audit found:
- 38% of APIs have **no authentication** at all, including two that return customer bookings.
- Policies differ by team: some use Basic Authentication, some client ID enforcement, some nothing.
- Nobody knows the full list of consumers; some partner integrations were set up by teams that no longer exist.
- Last year a partner's retry loop sent 6,000 requests per second to a hotel availability API and took down the property management system.

**Mandate.** The CISO wants a baseline of security policies on every API within **6 months**, and proof that new APIs cannot go live without it.

**Constraints**
- No outage for paying partners: the airline brand has penalties in its partner contracts.
- Four business units with their own delivery teams; the central platform team is 6 people.
- Some consumers are batch jobs that send large bursts at night.

**Your task.** Plan the rollout: what the baseline contains, how you find and prepare consumers, how you roll out without breaking them, and how you keep new APIs compliant.
`,
  answerTemplate: `## Baseline policy set

## Inventory and consumer preparation

## Rollout waves and rollback

## Non-Mule APIs

## Keeping new APIs compliant

## Measuring progress
`,
  keyPoints: [
    'The baseline: authentication (client ID enforcement or JWT validation by API type), spike control, and threat protection for APIs with a body, plus rate limits from SLA tiers where traffic is known.',
    'Bring every API under API Manager first: autodiscovery for the 40 unmanaged Mule apps and Flex Gateway for the 60 non-Mule services.',
    'Find consumers from traffic data, register client applications and contracts, and announce enforcement dates before enforcing.',
    'Roll out per API in waves with fast per-API rollback, then switch to automated policies for each environment once all APIs comply.',
    'API Governance rulesets in Exchange and CI stop new APIs being published without a security scheme, and automated policies cover them at runtime.',
  ],
  solution: `
**Baseline.** Internal APIs: JWT validation against the corporate identity provider. Partner and channel APIs: client ID enforcement with SLA tiers. Every API: spike control sized to protect its back end; JSON or XML threat protection where a body is accepted. Basic Authentication is removed.

**Inventory (month 1).** List all APIs from API Manager, Runtime Manager and the Kubernetes clusters. For each: owner, consumers seen in the last 90 days (analytics, access logs), data sensitivity. The two APIs returning bookings without authentication are fixed in week 2 as an emergency change.

**Preparation (months 1 to 2).** Add autodiscovery to the 40 Mule apps. Deploy Flex Gateway in connected mode in front of the 60 non-Mule services. Register a client application for every known consumer and request contracts. Publish enforcement dates.

**Rollout (months 3 to 5).** Apply policies per API through the API Manager CLI in waves of about 30, internal APIs first, partner APIs last. Watch 401 and 429 rates per API for a week. Rollback is removing the policy from one API.

**Lock in (month 6).** Replace per-API policies with automated policies per environment. Add an API Governance ruleset (security scheme required, versioned base path) and run it in CI before publishing to Exchange.

**Progress.** Share of APIs with the baseline, share of traffic from registered clients, and number of rollbacks per wave.
`,
  followUps: [
    { q: 'Why not apply automated policies on day one?', a: 'An automated policy hits every API in the environment at once. Unregistered consumers would fail everywhere together, so per-API waves come first and automated policies lock in the result.' },
    { q: 'How do you find consumers nobody documented?', a: 'Analytics and access logs show client IPs, user agents and call patterns. A period of monitoring before enforcement surfaces callers that can then be traced to an owner.' },
    { q: 'What does Flex Gateway add for the non-Mule APIs?', a: 'It puts them under API Manager, so they get the same policies, contracts and analytics as Mule APIs. Teams keep their own code and runtime.' },
    { q: 'How does API Governance differ from policies?', a: 'Governance checks API specifications and metadata at design and publish time. Policies act on live traffic at runtime, and both are needed to stop a new unprotected API.' },
  ],
}
