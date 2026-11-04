export default {
  id: 'inc-049',
  category: 'incidents',
  title: 'A "Minor" System API Release Breaks Three Process APIs at Once',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'api-versioning', 'contract-testing', 'breaking-changes', 'exchange'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '09:31:02.551 INFO  [sys-customer-api] Deployed version 1.4.0 to prod', relevant: true, why: 'All three incidents start minutes after this System API release; the consumers did not change anything.' },
      { text: '09:32:10.004 INFO  [prc-order-api]    POST /api/orders 201 corrId=09bb-11', relevant: false },
      { text: '09:33:17.210 WARN  [prc-order-api]    customerName is null, using empty string corrId=0a71-9f', relevant: true, why: 'The renamed field (customerName -> fullName) is silently defaulted: confirmations go out with empty names and no error.' },
      { text: "09:33:20.448 ERROR [sys-customer-api] Missing required query parameter 'region' -> 400 corrId=11c4-7e", relevant: true, why: 'The new required parameter rejects existing callers: the break is in the System API contract, not in billing.' },
      { text: "09:33:20.452 ERROR [prc-billing-api]  HTTP:BAD_REQUEST HTTP GET on resource 'https://sys-customer-api.internal/api/v1/customers/C-1009' failed: bad request (400). corrId=11c4-7e", relevant: false },
      { text: '09:33:30.000 INFO  [sys-customer-api] GET /health 200 (3 ms)', relevant: false },
      { text: '09:33:41.003 ERROR [prc-loyalty-api]  MULE:EXPRESSION "You called the function \'++\' with these arguments: 1: Null (null) 2: String (" - Gold member") ..." corrId=5be2-30', relevant: true, why: 'Same rename, different consumer: payload.customerName ++ " - Gold member" fails on null and loyalty returns 500.' },
      { text: '09:33:41.006 ERROR [prc-loyalty-api]  Returning 500 corrId=5be2-30', relevant: false },
    ],
    questions: [
      {
        type: 'match',
        prompt: 'Match each consumer symptom to its cause in sys-customer-api v1.4.0.',
        pairs: [
          ['prc-order-api: empty customer names', 'Rename hidden by default "" (silent)'],
          ['prc-loyalty-api: 500', 'Rename: ++ called on null'],
          ['prc-billing-api: 400', 'New required query parameter region'],
        ],
        explain: 'One release, two breaking changes, three different failure modes. The silent one is the most dangerous.',
      },
      {
        type: 'single',
        prompt: 'What is the fastest safe mitigation?',
        options: [
          'Roll back sys-customer-api to 1.3.2: one action fixes all three consumers',
          'Ask the three Process API teams to hotfix their mappings',
          'Make region optional in prc-billing-api',
          'Add retries in the Process APIs',
        ],
        answer: 0,
        explain: 'The break is in the System API, so one rollback restores all consumers. Then resend the confirmations with empty names and check failed billing requests.',
      },
      {
        type: 'multi',
        prompt: 'How should the System API have evolved?',
        options: [
          'Additive change in v1: return both customerName (deprecated) and fullName; make region optional with a default',
          'If it cannot be compatible: publish /api/v2 (asset 2.0.0), run v1 and v2 side by side with a migration window',
          'Use API Manager contracts and Exchange to identify and notify consumers, with a deprecation date',
          'Bump the asset to 1.4.0 and keep /api/v1, since the spec in Exchange was updated',
        ],
        answer: [0, 1, 2],
        explain: 'A minor version must be backward-compatible. Renaming a field and adding a required input are major changes.',
      },
      {
        type: 'multi',
        prompt: 'Which **prevention** measures fit?',
        options: [
          'Consumer-driven contract tests run in the System API pipeline',
          'Spec diff check in CI flagging removed fields and new required parameters',
          'Consumers avoid `default ""` on mandatory business fields and alert instead',
          'Only MUnit tests inside the System API',
        ],
        answer: [0, 1, 2],
        explain: 'The SAPI team already had MUnit tests; what was missing was any test of how consumers use the API.',
      },
    ],
  },
  description: `
## Symptoms
- Thursday 09:30, shortly after a deployment of \`sys-customer-api\` (over Salesforce + the CRM database), three unrelated teams raise incidents:
  - \`prc-order-api\`: order confirmations go out with **empty customer names**.
  - \`prc-loyalty-api\`: every \`GET /members/{id}\` returns **500**.
  - \`prc-billing-api\`: invoice creation returns **400** for every request.
- Nobody on those teams changed anything.

## Change / Context
- The \`sys-customer-api\` team released **v1.4.0** with "small improvements": the response field \`customerName\` was renamed to \`fullName\` (to match Salesforce), and a new **required** query parameter \`region\` was added to \`GET /customers/{id}\` for data-residency routing.
- The API spec in Exchange was updated and the asset version bumped from 1.3.2 to 1.4.0. The base path is still \`/api/v1\`.
- The System API team has unit tests (MUnit) but no tests representing how consumers use the API. Exchange shows **3 consumer applications** with contracts on the API instance.

## Logs
\`\`\`
09:31:02.551 INFO  [sys-customer-api] Deployed version 1.4.0 to prod
09:33:17.210 WARN  [prc-order-api]    customerName is null, using empty string corrId=0a71-9f
09:33:20.448 ERROR [sys-customer-api] Missing required query parameter 'region' -> 400 corrId=11c4-7e
09:33:20.452 ERROR [prc-billing-api]  HTTP:BAD_REQUEST HTTP GET on resource 'https://sys-customer-api.internal/api/v1/customers/C-1009' failed: bad request (400). corrId=11c4-7e
09:33:41.003 ERROR [prc-loyalty-api]  MULE:EXPRESSION "You called the function '++' with these arguments: 1: Null (null) 2: String (" - Gold member") ..." corrId=5be2-30
09:33:41.006 ERROR [prc-loyalty-api]  Returning 500 corrId=5be2-30
\`\`\`

## Your tasks
1. Diagnose why three Process APIs broke in three different ways.
2. What is the fastest safe mitigation?
3. What is the root cause (technical and process)?
4. How should the System API have evolved?
5. What prevents this next time?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Identifies two breaking changes in a release presented as minor: a renamed response field and a new required request parameter — both break existing consumers.',
    'Explains the three symptoms: silent data loss where a default hides the null, a DataWeave expression error on null, and an outright 400 from the new mandatory parameter.',
    'Immediate: roll back sys-customer-api to 1.3.2 (one rollback fixes three consumers) rather than asking three teams to hotfix.',
    'Permanent fix: evolve backward-compatibly (add fullName alongside customerName, make region optional with a sensible default) or publish a new major version (/v2) and run both while consumers migrate.',
    'Applies semantic versioning correctly to the Exchange asset and the API base path; uses Exchange/API Manager contracts to know and notify consumers.',
    'Prevention: consumer-driven contract tests in the System API pipeline, deprecation policy, and design review for any change to a reused API.',
  ],
  solution: `
**Diagnosis.** One release contained two **breaking changes** to a reused System API:

| Change | Consumer | What happened |
|---|---|---|
| \`customerName\` → \`fullName\` | prc-order-api | Mapping had \`default ""\`, so names silently became empty (worst kind: no error) |
| \`customerName\` → \`fullName\` | prc-loyalty-api | \`payload.customerName ++ " - Gold member"\` on null → MULE:EXPRESSION → 500 |
| new required \`region\` param | prc-billing-api | The System API rejects the request → 400 → HTTP:BAD_REQUEST |

The asset version (1.3.2 → 1.4.0) signalled a minor, compatible change while the change was actually major — and the base path stayed \`/v1\`.

**Immediate mitigation.** **Roll back** \`sys-customer-api\` to 1.3.2 (redeploy the previous artifact). One action fixes all three consumers. Then: re-send order confirmations that went out with empty names, and check billing for requests that failed during the window.

**Root cause.**
- *Technical*: rename and new mandatory input are non-backward-compatible changes.
- *Process*: the System API team had no view of how consumers use the API, no consumer tests, no change notification, and versioning was treated as a label rather than a contract.

**Permanent fix — evolve without breaking.**
- **Additive change in v1**: return both \`customerName\` (deprecated) and \`fullName\`; make \`region\` **optional**, deriving it from the customer record or defaulting to the current behaviour.
- If the change truly can't be compatible, publish **v2** (\`/api/v2\`, Exchange asset 2.0.0) as a new API instance, run v1 and v2 side by side, and give consumers a migration window.
- Use API Manager **contracts** (client applications on the instance) and Exchange to list consumers and contact them; announce deprecation with a date.

\`\`\`
sys-customer-api v1 (deprecated, sunset in 6 months) ----> prc-order-api
                                                     ----> prc-loyalty-api
sys-customer-api v2 (fullName, region) ------------------> prc-billing-api (migrated first)
\`\`\`

**Prevention.**
- **Consumer-driven contract tests**: each consumer contributes example requests/expected fields; the System API pipeline runs them and fails the build on a breaking change.
- Spec diff check in CI (compare the new RAML/OAS with the published one; flag removed fields or new required params).
- Semantic versioning rules agreed in the C4E: major = breaking, published as a new API version.
- Consumers code defensively but visibly: avoid \`default ""\` on mandatory business fields — fail or alert instead of silently sending bad data.
`,
  followUps: [
    { q: 'Is adding a new optional response field a breaking change?', a: 'Normally no — consumers should ignore unknown fields. It becomes breaking only if a consumer validates strictly against a schema that forbids extra properties, which is another reason to agree tolerant-reader rules.' },
    { q: 'Why is the empty-name failure the most dangerous of the three?', a: 'Because nothing failed: no error, no alert, and wrong data reached customers. Loud failures are found in minutes; silent data quality problems can run for weeks.' },
    { q: 'How do you know who consumes a System API?', a: 'API Manager contracts show which client applications have access to each instance; Exchange shows dependencies, and correlation-ID tracing or API analytics show actual callers. Enforcing client ID on the instance makes this list reliable.' },
  ],
}
