export default {
  id: 'ar-060',
  category: 'architecture',
  title: 'Versioning Across Layers Without Breaking Consumers',
  level: 'ADVANCED',
  tags: ['api-led', 'versioning', 'backward-compatibility', 'exchange', 'deprecation'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Classify each change to `sys-sfdc-customer-api`.',
      pairs: [
        ['Add an optional `addresses[]` field', 'Non-breaking'],
        ['Replace the `address` object with `addresses[]`', 'Breaking — removal and cardinality change'],
        ['Add the enum value `PARTNER` to `customerType`', 'Potentially breaking for strict consumers'],
      ],
      explain: 'Consumers with strict enum validation or exhaustive switches break on a new value; good specs state that enums may grow and unknown values must be handled.',
    },
    {
      type: 'single',
      prompt: 'What should you try first?',
      options: [
        'Publish v2 immediately and ask all four Process APIs to migrate',
        'Evolve v1 additively (e.g. 1.3.0): add `addresses[]`, keep `address` as the primary address and mark it deprecated',
        'Change `address` to an array in v1',
        'Create a new asset sys-sfdc-customer-v2-api',
      ],
      answer: 1,
      explain: 'Many "v2s" are avoidable: consumers that need one address do nothing.',
    },
    {
      type: 'single',
      prompt: 'A v2 is unavoidable. How do you run both versions?',
      options: [
        'Replace v1 with v2 on a single release date',
        'Publish 2.0.0 of the same Exchange asset with its own API instance; serve /api/v1 as a thin adapter over the v2 logic, and migrate Process APIs one by one',
        'Ask Salesforce to keep the old data model',
        'Let each Process API call Salesforce directly during the transition',
      ],
      answer: 1,
      explain: 'Running both side by side (often in one app) lets each Process API migrate in its own release cycle until v1 traffic reaches zero.',
    },
    {
      type: 'single',
      prompt: 'How do you guarantee the 40 external consumers see no change?',
      options: [
        'Version the Experience APIs to v2 as well',
        'The Process APIs absorb the change: they move to System v2 internally but keep their own contracts to the Experience layer unchanged',
        'Freeze Salesforce changes',
        'Ask external consumers to ignore the new fields',
      ],
      answer: 1,
      explain: 'Each layer versions independently — a major version at one layer does not imply one above. This containment is the point of layering.',
    },
    {
      type: 'multi',
      prompt: 'Which tooling and process support the migration?',
      options: [
        'API Manager analytics / contracts by client id to see who still calls v1',
        'Exchange deprecation status and a published sunset date',
        'Contract tests in each Process API against the System API spec',
        'A written versioning standard (what is breaking, deprecation period, max two concurrent majors)',
        'Bumping every Experience API to a new major version',
      ],
      answer: [0, 1, 2, 3],
      explain: 'You can only switch v1 off when you can see that no client still uses it; external consumers should never be forced to migrate for an internal change.',
    },
    {
      type: 'single',
      prompt: 'Why is URI major versioning (/v1, /v2) the most common choice in Anypoint?',
      options: [
        'Header versioning is not allowed by HTTP',
        'It maps cleanly to API instances, policies and APIkit routers, and is easy to route and observe',
        'It avoids the need for semantic versioning',
        'Exchange cannot store header-versioned APIs',
      ],
      answer: 1,
      explain: 'Header or media-type versioning works but is harder to route, apply policies to and observe.',
    },
  ],
  description: `
\`sys-sfdc-customer-api\` v1 is consumed by **4 Process APIs** (\`prc-customer-360\`, \`prc-order\`, \`prc-onboarding\`, \`prc-marketing-sync\`).

The Salesforce team restructures data:
- A customer can now have **multiple addresses**, and the single \`address\` object in v1 no longer represents reality.
- \`customerType\` gains a new value \`PARTNER\`.

The Experience layer has 3 APIs and ~40 external consumers. The business does not want *any* external consumer to change.

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
    'If a v2 is needed, run v1 and v2 side by side (separate base path and API instance), possibly with v1 implemented as an adapter over v2 logic, and migrate Process APIs independently.',
    'Process APIs absorb System changes: their own contracts to Experience APIs stay stable, which is the point of layering.',
    'Exchange semantic versions, deprecation markers, API Manager analytics per client id to find remaining v1 consumers, consumer contract tests in CI, and a published sunset date.',
  ],
  solution: `
**Breaking vs non-breaking.**

| Change | Breaking? |
|---|---|
| Add \`addresses[]\` (new optional field) | No |
| Replace \`address\` object with \`addresses[]\` | **Yes** (removal + cardinality change) |
| New enum value \`PARTNER\` | **Potentially** — consumers with strict enum validation or exhaustive switches break. Good practice: state in specs that enums may grow and consumers must handle unknown values |

**Step 1 — avoid v2 if you can.** Additive evolution in **v1.x**: add \`addresses[]\`, keep \`address\` populated with the primary/billing address and mark it deprecated in the spec. Publish 1.3.0 to Exchange. Consumers that only need one address do nothing. Many "v2s" are avoidable this way.

**Step 2 — if v2 is needed** (e.g. you must remove \`address\` because "primary" is ambiguous):
\`\`\`
sys-sfdc-customer-api
  /api/v1/customers  -> adapter: calls v2 logic, maps addresses[] -> address (primary)
  /api/v2/customers  -> new contract
\`\`\`
- Publish **2.0.0** as a new major version of the same Exchange asset; create a separate API instance in API Manager for v2 (own policies, contracts).
- Deploy both versions in the **same app** (two base paths, v1 as a thin mapping over v2) or as two apps — same app is cheaper and keeps one SoR-access implementation.
- Migrate Process APIs one by one, in their own release cycles; track remaining v1 traffic by client id.
- Announce **deprecation** of v1 in Exchange and a **sunset date**; remove v1 when traffic is zero (or after the date with agreement).

**Containing the change at the Process layer.**
- \`prc-customer-360\` moves to v2 internally but keeps its own **v1 contract** to Experience APIs unchanged — it maps \`addresses[]\` to whatever its contract promises (or adds \`addresses[]\` additively).
- The \`PARTNER\` value: the Process API decides the business meaning (e.g. maps to an existing category, or exposes it additively if Experience consumers tolerate it).
- Experience APIs and 40 external consumers see **no change**. Each layer versions **independently**; a major version at one layer does not imply a major version above.

**Tooling and process.**
- **Exchange**: semantic versioning (major in the base path, minor/patch for additive changes), deprecation status, change log in the documentation page.
- **API Manager**: separate instances per major version; analytics/contracts show which client apps still call v1.
- **Contract tests**: each Process API has tests against the System API spec (mocking service or MUnit with recorded responses); governance rulesets can flag breaking changes in specs during review.
- **Policy**: a written versioning standard (what counts as breaking, minimum deprecation period, max concurrent majors e.g. 2).
`,
  followUps: [
    { q: 'URI versioning or header versioning in MuleSoft?', a: 'URI major versioning (/v1, /v2) is the most common in Anypoint because it maps cleanly to API instances, policies and APIkit routers. Header/media-type versioning works but is harder to route and observe.' },
    { q: 'Why not let the Experience API version bump too and tell consumers to migrate?', a: 'External consumer migrations are slow and expensive and the change has no value for them. Absorbing the change lower down is exactly the decoupling API-led promises.' },
    { q: 'How many major versions do you support at once?', a: 'Typically at most two (current and previous) with a defined deprecation window; more than that multiplies maintenance and test effort.' },
  ],
}
