export default {
  id: 'ms-056',
  category: 'mulesoft',
  title: 'API Governance Rulesets and Exchange Documentation/Visibility for an API-Led Programme',
  level: 'ADVANCED',
  tags: ['api-led', 'api-governance', 'exchange', 'rulesets', 'documentation', 'visibility'],
  estMinutes: 22,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each API Governance concept to its role.',
      pairs: [
        ['Ruleset', 'A set of validation rules, published as an Exchange asset'],
        ['Governance profile', 'Applies rulesets to APIs matching criteria such as tags or lifecycle state'],
        ['Conformance', 'Status per API with each violated rule, shown in Exchange and the governance console'],
      ],
      explain: 'Profiles connect rulesets to the right APIs; conformance gives the C4E a programme-wide view.',
    },
    {
      type: 'single',
      prompt: 'How do you turn the wiki standards (common Error type, `page`/`pageSize`, kebab-case plural resources) into something enforced?',
      options: [
        'Email the wiki link to every team monthly',
        'Write a custom ruleset, publish it to Exchange, and apply it through governance profiles',
        'Add the rules to API Manager policies',
        'Ask reviewers to check manually',
      ],
      answer: 1,
      explain: 'Rulesets are versioned and reusable assets, and can be combined with MuleSoft-provided ones (e.g. best practices, OWASP API security).',
    },
    {
      type: 'single',
      prompt: 'API Governance checks API specs against rulesets. You want a spec with rule errors to be stopped before it is published to Exchange, with no manual check. Where do you enforce this?',
      options: [
        'In CI, by running governance validation and failing the build on errors',
        'At runtime, by blocking non-conformant APIs through the gatekeeper',
        'After release, by reading conformance status in the governance console',
        'In API Manager, by adding the rules to the API\'s policies',
      ],
      answer: 0,
      explain: 'Design-time governance does not stop running APIs; blocking happens where you enforce it, e.g. CI or promotion. Shifting left also means adding rulesets as dependencies in API Designer / Code Builder so authors see violations while editing, and making conformance a criterion for moving an asset to stable.',
    },
    {
      type: 'single',
      prompt: 'Teams cannot tell which version to use because old majors look current. Which Exchange feature helps most?',
      options: [
        'Deleting all old versions immediately',
        'Lifecycle states — development, stable, deprecated — plus clear semantic versions and a changelog',
        'Renaming old assets',
        'Making old versions private',
      ],
      answer: 1,
      explain: 'Deprecation is visible to anyone looking at that version, while consumers still have time to migrate.',
    },
    {
      type: 'single',
      prompt: 'An internal System API spec became visible to an external partner. What is the likely cause and fix?',
      options: [
        'Exchange assets are public by default; make them private',
        'The asset was explicitly shared to the public portal (or partners had broad Exchange roles); unshare it, review roles, and allow only experience-tagged assets to be published publicly',
        'API Manager published it automatically when the instance was created',
        'The partner used the mocking service URL',
      ],
      answer: 1,
      explain: 'Exchange assets are private to the organisation/business group by default; public exposure is a deliberate share.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which assets should be shared to the public developer portal?',
      options: [
        'All 60 assets, so partners can discover everything',
        'Only partner-facing Experience API specs, shared deliberately one asset at a time; System and Process specs stay internal',
        'System APIs only, because they are the most reusable',
        'None — partners should get specs by email',
      ],
      answer: 1,
      explain: 'System and Process APIs are internal building blocks; exposing them couples partners to internals.',
    },
  ],
  description: `
Eighteen months into an API-led programme, a Center for Enablement (C4E) review finds:

- 60 API assets in Exchange; about a third have **no description, no examples, and auto-generated docs only**.
- Some specs don't use the agreed error type or paging convention (see the common library).
- Teams can't tell which version to use: old majors are still listed as if current.
- An internal System API spec was accidentally made visible to an external partner via the public portal.
- Standards exist only in a wiki page nobody reads.

**Questions**
1. What is Anypoint API Governance and how do rulesets, governance profiles and conformance work?
2. Which rulesets would you apply, to which APIs, and how do you add your own standards?
3. How do you make conformance part of the developer workflow and CI, not an after-the-fact report?
4. What Exchange features address the documentation and "which version?" problems?
5. How should Exchange visibility be organised per layer, and how did the System API leak?
`,
  answerTemplate: `## Governance concepts

## Ruleset selection and custom rules

## Shifting governance left

## Exchange documentation and lifecycle

## Visibility per layer
`,
  keyPoints: [
    'API Governance applies rulesets (published in Exchange) to selected APIs via governance profiles; each API is reported as conformant or not, with violations visible in Exchange and design tools.',
    'Use MuleSoft-provided rulesets (e.g. Anypoint best practices, OWASP API security, OAS/RAML best practices) plus custom rulesets encoding company standards.',
    'Profiles can target APIs by criteria such as tags, categories or lifecycle state — e.g. stricter rules for Experience APIs exposed to partners.',
    'Shift left: rulesets added as dependencies in API Designer/Code Builder show violations while editing; governance CLI validation can fail the pipeline.',
    'Exchange: rich docs pages, examples, categories/tags, lifecycle state (development, stable, deprecated), and share/portal settings control who sees what.',
  ],
  solution: `
**Governance concepts**
- A **ruleset** is a set of validation rules (published as an Exchange asset) checked against API specs — and, in newer capabilities, against API instance configuration such as required policies.
- A **governance profile** says "apply these rulesets to APIs matching these criteria" (e.g. tag \`experience\`, lifecycle state \`stable\`) and who is notified.
- **Conformance** status (conformant / not conformant, with each violated rule) is shown on the Exchange asset and in the governance console, giving the C4E a programme-wide view.

**Ruleset selection**
| Target | Rulesets |
|---|---|
| All APIs | Anypoint/API best-practice rulesets (descriptions, examples, versioning), company "API-led standards" custom ruleset |
| Experience APIs (partner-facing) | Add OWASP API security ruleset, stricter docs requirements |
| OAS specs | OpenAPI best-practice ruleset |

**Custom ruleset** (company standards from the wiki): every response 4xx/5xx uses the common \`Error\` type; collections use \`page\`/\`pageSize\`; resource names are kebab-case plural nouns; every operation has a description and an example; HTTPS only; API spec declares a security scheme. Rulesets are written as rule definitions (YAML) and published to Exchange like any asset, so they're versioned and reusable.

**Shifting left**
- Add rulesets as dependencies in API Designer / Code Builder so authors see violations as they type.
- In CI, run the governance validation commands of the Anypoint CLI against the spec before publishing to Exchange; fail the build for errors, warn for lower-severity rules.
- Make conformance a criterion for moving an asset to **stable** and for the architecture review.

**Exchange documentation and lifecycle**
- Write proper **documentation pages** (overview, authentication, error model, paging, examples, changelog); use the spec's descriptions and examples so the console and mock are useful.
- Apply **categories/tags** (layer: system/process/experience, domain, owner team) for discovery.
- Use **lifecycle states**: \`development\` for drafts, \`stable\` for released, \`deprecated\` for versions consumers must leave — deprecation is visible to anyone looking at that version. Clear semantic versions plus a changelog solve "which version?".

**Visibility per layer**
- Exchange assets are private to the organisation/business group by default; access is granted through Exchange roles (viewer/contributor/admin) to users and teams.
- **System and Process API** specs: internal only — visible to integration teams.
- **Experience APIs for partners**: shared to the **public portal** / developer portal (e.g. API Experience Hub) deliberately, one asset at a time.
- The leak happened because the System API asset was explicitly shared to the public portal (or partners were given broad Exchange roles in the org). Fix: unshare it from the portal, review who holds Exchange roles, and add a governance/review rule that only \`experience\`-tagged assets can be published publicly.
`,
  followUps: [
    {
      q: 'Does a non-conformant API stop working at runtime?',
      a: 'No. Design-time governance reports and notifies; blocking happens only where you enforce it, such as failing the CI pipeline or refusing to promote an asset.',
    },
    {
      q: 'Who should own the custom ruleset?',
      a: 'The C4E or architecture group, versioned in Exchange like any asset, with changes announced so teams are not surprised by new violations.',
    },
    {
      q: 'How do you avoid governance becoming a bottleneck?',
      a: 'Automate it: rules run in the editor and CI, so humans only review exceptions; keep the ruleset focused on standards that genuinely affect reuse and security.',
    },
  ],
}
