import { diagram } from '../../arch/dsl.js'

const BACKENDS = ['crm', 'saas', 'database', 'erp', 'external-api', 'legacy']

export default {
  id: 'ar-060',
  category: 'architecture',
  title: 'Versioning Across Layers Without Breaking Consumers',
  level: 'ADVANCED',
  tags: ['api-led', 'versioning', 'backward-compatibility', 'exchange', 'deprecation'],
  estMinutes: 35,
  diagram: {
    task: 'draw the run-both period. Use one System API box with v1 in its name and one with v2, the four Process APIs, the three Experience APIs and Salesforce. Some Process APIs have moved to v2 and the rest still call v1.',
    checks: [
      { label: 'The v1 System API still runs', rule: { type: 'node', match: { type: 'system-api', label: 'v1' } } },
      { label: 'The v2 System API runs beside it', rule: { type: 'node', match: { type: 'system-api', label: 'v2' } } },
      { label: 'v1 still reaches Salesforce, directly or as an adapter over v2', rule: { type: 'path', from: { type: 'system-api', label: 'v1' }, to: BACKENDS } },
      { label: 'v2 reaches Salesforce', rule: { type: 'path', from: { type: 'system-api', label: 'v2' }, to: BACKENDS } },
      { label: 'Salesforce is reached only through System APIs', rule: { type: 'only-via', target: BACKENDS, from: 'system-api' } },
      { label: 'All four Process APIs call a version of the System API', rule: { type: 'each', of: 'process-api', min: 4, edgeTo: 'system-api' } },
      { label: 'Each version is in use by a Process API, so they migrate one by one', rule: { type: 'each', of: { type: 'system-api', label: ['v1', 'v2'] }, min: 2, edgeFrom: 'process-api' } },
      { label: 'All three Experience APIs call a Process API', rule: { type: 'each', of: 'experience-api', min: 3, edgeTo: 'process-api' } },
      { label: 'The change stops at the Process layer. No Experience API reaches a System API or Salesforce around it', rule: { type: 'no-path', from: 'experience-api', to: ['system-api', ...BACKENDS], unless: 'process-api' } },
      { label: 'APIs call each other with sync calls', rule: { type: 'lines', from: ['experience-api', 'process-api', 'system-api'], to: ['process-api', 'system-api', ...BACKENDS], kind: 'sync' } },
    ],
    reference: diagram(
      {
        ew: ['experience-api', 'exp-web-api (contract unchanged)'],
        em: ['experience-api', 'exp-mobile-api (contract unchanged)'],
        ep: ['experience-api', 'exp-partner-api (contract unchanged)'],
        p360: ['process-api', 'prc-customer-360 (moved to v2, own contract stable)', { vCores: '0.2' }],
        pord: ['process-api', 'prc-order'],
        ponb: ['process-api', 'prc-onboarding'],
        pmkt: ['process-api', 'prc-marketing-sync'],
        sv1: ['system-api', 'sys-sfdc-customer-api v1 (deprecated, address = primary)', { rateLimit: 20 }],
        sv2: ['system-api', 'sys-sfdc-customer-api v2 (addresses[])', { vCores: '0.2' }],
        sf: ['crm', 'Salesforce'],
      },
      ['ew -> p360', 'em -> p360', 'ep -> p360', 'p360 -> sv2', 'pord -> sv1', 'ponb -> sv1', 'pmkt -> sv1', 'sv1 -> sf', 'sv2 -> sf'],
    ),
    simulation: {
      systems: [{ match: 'crm', latencyMs: 200, maxRps: 70 }],
      tests: [
        {
          name: 'Marketing bulk sync on v1',
          about: 'Customer 360 reads 40 customers a second through v2 while the marketing sync pushes 45 updates a second through v1. Salesforce stays under its 70 calls a second, and every Customer 360 read is answered.',
          traffic: [
            { name: 'customer 360', from: { type: 'process-api', label: '360' }, rps: 40, to: 'crm' },
            { name: 'marketing sync', from: { type: 'process-api', label: 'marketing' }, rps: 45, to: 'crm', kind: 'write' },
          ],
          expect: { answers: [{ flow: 'customer 360', minSuccess: 0.99 }], peakRps: [{ node: 'crm', max: 70 }] },
        },
        {
          name: 'Customer 360 at peak',
          about: 'The Experience APIs drive 60 Customer 360 reads a second for the whole run. Every read is answered through v2, and all the APIs fit in 1.5 vCores.',
          traffic: [{ name: 'customer 360', from: { type: 'process-api', label: '360' }, rps: 60, to: 'crm' }],
          expect: { answers: [{ minSuccess: 0.99 }], vCores: { max: 1.5 } },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'match',
      prompt: 'Classify each change to `sys-sfdc-customer-api`.',
      pairs: [
        ['Add an optional `addresses[]` field', 'Non-breaking'],
        ['Replace the `address` object with `addresses[]`', 'Breaking: removal and cardinality change'],
        ['Add the enum value `PARTNER` to `customerType`', 'Potentially breaking for strict consumers'],
      ],
      explain: 'Consumers with strict enum validation or exhaustive switches break on a new value; good specs state that enums may grow and unknown values must be handled.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What should you try first?',
      options: [
        'Publish v2 now and ask all four Process APIs to migrate',
        'Add `addresses[]` to v1 and keep `address` as the primary address',
        'Change `address` to an array inside v1',
        'Create a new asset named sys-sfdc-customer-v2-api',
      ],
      answer: 1,
      explain: 'An additive minor version (e.g. 1.3.0) adds `addresses[]` and marks `address` deprecated. Many "v2s" are avoidable this way: consumers that need one address do nothing.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A v2 is unavoidable. How do you run both versions?',
      options: [
        'Replace v1 with v2 on one agreed release date',
        'Publish 2.0.0 beside v1, serve v1 as an adapter, migrate one by one',
        'Publish 2.0.0 and redirect /api/v1 calls to /api/v2 with a 301',
        'Publish 2.0.0 as a new asset, and switch v1 off after 30 days',
      ],
      answer: 1,
      explain: 'Publish 2.0.0 of the same Exchange asset with its own API instance, and serve /api/v1 as a thin adapter over the v2 logic. Running both side by side (often in one app) lets each Process API migrate in its own release cycle until v1 traffic reaches zero.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do you guarantee the 40 external consumers see no change?',
      options: [
        'Version the Experience APIs to v2 as well',
        'The Process APIs move to v2 but keep their own contracts unchanged',
        'Freeze Salesforce changes until consumers are ready',
        'Run a v2 of each Process API beside v1 for the external consumers',
      ],
      answer: 1,
      explain: 'Each layer versions independently: a major version at one layer does not imply one above. This containment is the point of layering.',
    },
    {
      type: 'single',
      prompt: 'A System API is moving from v1 to v2. You can switch v1 off only when no client still calls it. Which tool shows you who still calls v1?',
      options: [
        'API Manager analytics by client id',
        'Exchange deprecation status',
        'Contract tests in each Process API',
        'The v1 app logs in Runtime Manager, filtered by source IP',
      ],
      answer: 0,
      explain: 'API Manager analytics and contracts by client id show which client apps still call v1. Exchange deprecation status and a published sunset date announce the change. Contract tests check each Process API against the System API spec. Source IPs in app logs show load balancer or shared egress addresses, not which client app made the call. External consumers should never be forced to migrate for an internal change.',
    },
    {
      type: 'single',
      prompt: 'Why is URI major versioning (/v1, /v2) the most common choice in Anypoint?',
      options: [
        'One API instance can then serve both majors with one set of policies',
        'Each major maps to its own API instance in API Manager',
        'It removes the need for semantic versions on the Exchange asset',
        'Policies in API Manager match on the path, so they ignore headers',
      ],
      answer: 1,
      explain: 'Each major gets its own instance, policies and APIkit router. URI versions are also clear to route and observe. Two majors usually need different instances, not one shared set. Exchange assets still use semantic versions. Policies can read headers. Header or media-type versioning works but is harder to route, apply policies to and observe.',
    },
  ],
  description: `
\`sys-sfdc-customer-api\` v1 is consumed by **4 Process APIs** (\`prc-customer-360\`, \`prc-order\`, \`prc-onboarding\`, \`prc-marketing-sync\`).

The Salesforce team restructures data:
- A customer can now have **multiple addresses**, and the single \`address\` object in v1 no longer represents reality.
- \`customerType\` gains a new value \`PARTNER\`.

The Experience layer has 3 APIs and ~40 external consumers. The business does not want *any* external consumer to change.

Numbers for the run-both period:
- Salesforce allows **70 API calls a second** for this integration user, shared by v1 and v2, and answers in about 200 ms.
- \`prc-customer-360\` (already on v2) reads up to **60 customers a second** at peak.
- \`prc-marketing-sync\` (still on v1) runs bulk updates of **45 a second**. It can wait, the Customer 360 reads cannot.
- The budget for all the APIs is **1.5 vCores**.

**Questions:**
1. Which of these changes are breaking and which are not?
2. How do you introduce **v2 of the System API** without forcing all four Process APIs to migrate on the same day? Describe the run-both period.
3. How do you ensure the change **stops at the Process layer** and never reaches Experience consumers?
4. What tooling/process (Exchange, API Manager, contracts, tests) supports this?
`,
  answerTemplate: `## Breaking vs non-breaking

## Introducing System v2

## Containing the change

## Tooling and process
`,
  keyPoints: [
    'Adding optional fields/resources is non-breaking; changing a field\'s type/cardinality (single address → array) or removing fields is breaking; adding an enum value is breaking for strict consumers unless the contract says enums are extensible.',
    'Prefer evolving v1 additively first (add addresses[] while keeping address = primary) so many consumers never need to move.',
    'If a v2 is needed, run v1 and v2 side by side (separate base path and API instance), possibly with v1 implemented as an adapter over v2 logic. Migrate Process APIs independently.',
    'Process APIs absorb System changes: their own contracts to Experience APIs stay stable, which is the point of layering.',
    'Exchange semantic versions, deprecation markers, API Manager analytics per client id to find remaining v1 consumers, consumer contract tests in CI, and a published sunset date.',
    'Each major version is its own API instance with its own policies. A rate limit on v1 keeps the bulk callers that have not moved from using up the Salesforce limit that v2 callers need.',
  ],
  solution: `
**Breaking vs non-breaking.**

| Change | Breaking? |
|---|---|
| Add \`addresses[]\` (new optional field) | No |
| Replace \`address\` object with \`addresses[]\` | **Yes** (removal + cardinality change) |
| New enum value \`PARTNER\` | **Potentially**: consumers with strict enum validation or exhaustive switches break. Good practice: state in specs that enums may grow and consumers must handle unknown values |

**Step 1: avoid v2 if you can.** Additive evolution in **v1.x**: add \`addresses[]\`, keep \`address\` populated with the primary/billing address and mark it deprecated in the spec. Publish 1.3.0 to Exchange. Consumers that only need one address do nothing. Many "v2s" are avoidable this way.

**Step 2: if v2 is needed** (e.g. you must remove \`address\` because "primary" is ambiguous):
\`\`\`
sys-sfdc-customer-api
  /api/v1/customers  -> adapter: calls v2 logic, maps addresses[] -> address (primary)
  /api/v2/customers  -> new contract
\`\`\`
- Publish **2.0.0** as a new major version of the same Exchange asset; create a separate API instance in API Manager for v2 (own policies, contracts).
- Deploy both versions in the **same app** (two base paths, v1 as a thin mapping over v2) or as two apps: same app is cheaper and keeps one SoR-access implementation.
- Migrate Process APIs one by one, in their own release cycles; track remaining v1 traffic by client id.
- Announce **deprecation** of v1 in Exchange and a **sunset date**; remove v1 when traffic is zero (or after the date with agreement).

**Containing the change at the Process layer.**
- \`prc-customer-360\` moves to v2 internally but keeps its own **v1 contract** to Experience APIs unchanged: it maps \`addresses[]\` to whatever its contract promises (or adds \`addresses[]\` additively).
- The \`PARTNER\` value: the Process API decides the business meaning (e.g. maps to an existing category, or exposes it additively if Experience consumers tolerate it).
- Experience APIs and 40 external consumers see **no change**. Each layer versions **independently**; a major version at one layer does not imply a major version above.

**Tooling and process.**
- **Exchange**: semantic versioning (major in the base path, minor/patch for additive changes), deprecation status, change log in the documentation page.
- **API Manager**: separate instances per major version; analytics/contracts show which client apps still call v1.
- **Contract tests**: each Process API has tests against the System API spec (mocking service or MUnit with recorded responses); governance rulesets can flag breaking changes in specs during review.
- **Policies per version**: v1 and v2 have their own API instances, so each gets its own limits. A rate limit of 20 a second on v1 holds the marketing sync to its share, and Salesforce sees at most 60 of its 70 calls a second. Without it, the bulk sync and Customer 360 together go over the limit and Customer 360 reads fail.
- **Sizing**: v2 and \`prc-customer-360\` carry 60 reads a second at peak, more than one 0.1 vCore replica serves. 0.2 vCore each is enough, 1.1 vCores for all the APIs.
- **Policy**: a written versioning standard (what counts as breaking, minimum deprecation period, max concurrent majors e.g. 2).
`,
  followUps: [
    { q: 'URI versioning or header versioning in MuleSoft?', a: 'URI major versioning (/v1, /v2) is the most common in Anypoint because it maps cleanly to API instances, policies and APIkit routers. Header/media-type versioning works but is harder to route and observe.' },
    { q: 'Why not let the Experience API version bump too and tell consumers to migrate?', a: 'External consumer migrations are slow and expensive and the change has no value for them. Absorbing the change lower down is exactly the decoupling API-led promises.' },
    { q: 'How many major versions do you support at once?', a: 'Typically at most two (current and previous) with a defined deprecation window; more than that multiplies maintenance and test effort.' },
  ],
}
