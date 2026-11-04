export default {
  id: 'ar-036',
  category: 'architecture',
  title: 'Testing Strategy: MUnit, Contract and End-to-End',
  level: 'INTERMEDIATE',
  tags: ['testing', 'munit', 'contract-testing', 'test-pyramid', 'ci-cd'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Coverage is enforced at 80%, but most MUnit tests only check that a flow "runs without error". What change adds the most value?',
      options: [
        'Raise the coverage gate to 95%',
        'Mock every connector with realistic payloads and assert the output, the status code and the calls made (verify-call), including error paths',
        'Replace MUnit with the weekly end-to-end suite',
        'Call the real SAP sandbox from MUnit so tests are more realistic',
      ],
      answer: 1,
      explain: 'Value comes from **assertions**: payload fields, mapped errors (timeout → 504, validation → 400) and `verify-call` on the backend. A higher coverage number without assertions just produces more tests that prove nothing.',
    },
    {
      type: 'match',
      prompt: 'Match each testing layer to what it covers and when it runs.',
      pairs: [
        ['Unit / flow tests (MUnit, connectors mocked)', 'Each flow and DataWeave script, on every build'],
        ['Contract tests', 'Provider conforms to its published spec; consumers rely only on the spec'],
        ['End-to-end tests', '5–10 critical business journeys across real systems, pre-release'],
        ['Non-functional tests', 'Load, resilience and security before major releases'],
      ],
      explain: 'A test pyramid: many fast unit tests, contract checks on every build of provider and consumer, and only a handful of slow end-to-end journeys.',
    },
    {
      type: 'single',
      prompt: 'A System API renamed a response field and two Process APIs broke in production. What would have caught it before release?',
      options: [
        'A longer weekly end-to-end run in SIT',
        "A CI step in the provider that diffs the spec against the published Exchange version and fails on breaking changes unless the major version is bumped",
        'Higher MUnit coverage in the Process APIs',
        'Asking consumers to read the release notes',
      ],
      answer: 1,
      explain: 'The spec in Exchange **is** the contract. Removing or renaming a field is a breaking change, so the provider CI must detect it and force a new major version. Consumer-driven contract tests add visibility of which consumers would break.',
    },
    {
      type: 'multi',
      prompt: 'The end-to-end suite fails 30% of the time because SAP test data and partner sandboxes are unstable. Which actions stabilise it?',
      options: [
        'Dedicated, reset-able test data for the suite',
        'Service virtualisation (stubs) for the unreliable SAP and payment sandboxes, with a small smoke set against the real sandboxes',
        'Keep only a few journeys that make money (place order, refund)',
        'Treat a flaky test as a bug: fix it or remove it',
        'Automatically re-run failed tests until they pass',
        'Run the full suite on every commit against the shared SAP sandbox',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Stable data, virtualised dependencies and a small, focused suite make failures meaningful. Re-running until green teaches the team to ignore failures, and hitting shared sandboxes on every commit makes the build even flakier.',
    },
    {
      type: 'single',
      prompt: 'Should MUnit logic tests call the real Salesforce sandbox?',
      options: [
        'Yes — mocks hide real behaviour',
        'No — unit-layer tests use mocks; a separate integration stage may call a sandbox for connectivity smoke checks',
        'Only when the coverage gate is not reached',
        'Yes, but only for error paths',
      ],
      answer: 1,
      explain: 'Calling sandboxes from unit tests makes builds slow and flaky. Keep logic tests mocked and put connectivity checks in their own stage.',
    },
    {
      type: 'order',
      prompt: 'Order the test layers from MOST numerous (bottom of the pyramid) to FEWEST.',
      items: ['MUnit unit / flow tests with mocked connectors', 'Component / API and contract tests per app', 'End-to-end journey tests across real systems'],
      explain: 'Fast, cheap tests form the wide base; slow, environment-dependent end-to-end tests stay few and focused on critical journeys.',
    },
  ],
  description: `
A retailer has 40 Mule apps across Experience, Process and System layers. Testing today:

- A few MUnit tests per app, mostly checking that a flow "runs without error"; coverage is enforced at 80% so developers write tests that touch processors without asserting much.
- One big **end-to-end** suite in a shared SIT environment, run weekly. It fails 30% of the time because SAP test data changes or a partner sandbox is down.
- Last month a System API renamed a response field; two Process APIs broke in production.

Constraints:
- SAP and the payment provider sandboxes are unreliable and shared with other teams.
- Releases must be possible several times a week.

**Questions:**
- Propose a layered testing strategy (what is tested where and by whom).
- How should MUnit tests be written so they have value beyond the coverage number?
- How do you prevent the "renamed field" incident?
- What role should end-to-end tests keep, and how do you stabilise them?
`,
  answerTemplate: `## Testing layers

## Effective MUnit tests

## Contract testing between APIs

## End-to-end tests
`,
  keyPoints: [
    'Use a test pyramid: many fast MUnit unit/flow tests with mocked connectors, fewer API/contract tests per app, very few end-to-end journey tests.',
    'MUnit tests should assert outputs, mapped fields, error mapping and calls made (mock-when, verify-call, spy), not just that the flow did not fail; coverage is a by-product.',
    'DataWeave mappings deserve focused tests with realistic and edge-case input files.',
    'Contract tests check that the implementation conforms to the published RAML/OAS spec and that consumers only rely on what the spec promises; breaking spec changes are caught in CI before deployment.',
    'End-to-end tests are a small set of critical business journeys, run against stable test data or service virtualisation for unreliable third-party sandboxes.',
  ],
  solution: `
**Layers.**

| Layer | What | Tool | When |
|---|---|---|---|
| Unit / flow | Each flow and DataWeave script, connectors mocked | MUnit | Every build |
| Component / API | The deployed app against its spec, backends mocked or virtualised | MUnit + spec validation, API test tool (e.g. Postman/Newman, REST-assured) | Every build / after deploy to DEV |
| Contract | Provider conforms to spec; consumers rely only on spec | Spec-based checks in CI; consumer-driven contract tests where teams agree | Every build of provider and consumer |
| End-to-end | 5–10 critical journeys across real systems | Automated suite | Pre-release in SIT/UAT |
| Non-functional | Load, resilience, security | JMeter/Gatling, OWASP scans | Before major releases |

**Effective MUnit.**
- Mock every external call (\`mock-when\` on the Salesforce/HTTP/DB processor) with realistic payloads from files.
- Assert the **result**: payload fields, HTTP status, headers; use \`verify-call\` to check that the backend was called with the right parameters and the right number of times.
- Test **error paths**: backend timeout → 504 mapped error body; validation failure → 400.
- Test DataWeave transformations separately with edge cases (nulls, empty arrays, special characters, large numbers).
- Keep coverage as a guard, but review tests for assertions in code review.

**Preventing the renamed-field incident.**
- The System API's spec in Exchange **is** the contract. In the provider's CI: validate that responses conform to the spec (APIkit validates requests; add response validation in tests) and diff the spec against the published version — a removed/renamed field is a **breaking change** → requires a new major version.
- Consumers write tests based on the published spec examples, and optionally consumer-driven contract tests (consumer publishes what it uses, provider verifies) so the provider sees which consumers would break.
- Governance rulesets and Exchange versioning make the breaking change visible before release.

**End-to-end.**
- Keep few, focused on money-making journeys (place order, refund).
- Stabilise with **dedicated, reset-able test data** and **service virtualisation** (mock SAP/payment responses from a stub service) for unstable sandboxes; run a smaller set against the real sandboxes as smoke tests.
- Treat a flaky E2E test as a bug: fix or remove it, otherwise teams learn to ignore failures.
`,
  followUps: [
    { q: 'Should MUnit tests call the real Salesforce sandbox?', a: 'Not in the unit layer; that makes builds slow and flaky. A separate integration test stage may call a sandbox for connectivity smoke checks, but logic tests use mocks.' },
    { q: 'Who owns end-to-end tests in API-led?', a: 'The team owning the business journey (usually the Experience/Process API owner or a QA team for the journey), while each API team owns its own unit and contract tests.' },
  ],
}
