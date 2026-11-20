export default {
  id: 'ms-042',
  category: 'mulesoft',
  title: 'MUnit at Scale: Parameterized Tests, Error Scenarios and Coverage Gates in CI',
  level: 'ADVANCED',
  tags: ['munit', 'parameterized-tests', 'coverage', 'ci-cd'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do MUnit parameterizations collapse the 14 nearly identical tax tests?',
      options: [
        'Wrap the test body in a `for-each` over the 14 input rows',
        'Define parameterizations on `munit:config`; the suite runs per row',
        'Add a `parameters` attribute to `munit:test` with 14 rows',
        'Generate the 14 test files from a DataWeave script at build time',
      ],
      answer: 1,
      explain: 'Each parameterization on `munit:config` supplies property values, and the whole suite runs once per parameterization. `munit:test` has no parameters attribute, and a `for-each` would stop at the first failing row. One test body, 14 data rows. Reports show each case by its parameterization name.',
    },
    {
      type: 'single',
      prompt: 'How do you test the backend-timeout path without a real rate-table API?',
      options: [
        'Point the config at a slow test host and wait for the timeout',
        'Mock When on the HTTP request, returning an `HTTP:TIMEOUT` error',
        'Spy on the HTTP request and throw the error in its before block',
        'Mock the request to return status 504 as a normal response',
      ],
      answer: 1,
      explain: 'Mock When can return an error (`<munit-tools:error typeId="HTTP:TIMEOUT"/>`) so error handlers are exercised. A Spy only runs assertions around the real call. A mocked 504 response is a normal message, so no HTTP:TIMEOUT error is raised and the handler never runs. Assert the result (e.g. 504 body) or use `expectedErrorType` when the error should propagate.',
    },
    {
      type: 'match',
      prompt: 'Match each coverage type to what it measures.',
      pairs: [
        ['Application coverage', 'The whole app'],
        ['Resource coverage', 'Each XML configuration file'],
        ['Flow coverage', 'Each flow'],
      ],
      explain: 'The munit-maven-plugin can enforce required application, resource and flow coverage.',
    },
    {
      type: 'multi',
      detail: true,
      needsScenario: true,
      prompt: 'Which munit-maven-plugin coverage settings implement the management gates?',
      options: [
        '`<runCoverage>true</runCoverage>`',
        '`<failBuild>true</failBuild>`',
        '`<requiredApplicationCoverage>80</requiredApplicationCoverage>`',
        '`<requiredFlowCoverage>70</requiredFlowCoverage>`',
        '`-DskipMunitTests` in every CI run',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Skipping tests by default defeats the gate; it should only be a documented exception.',
    },
    {
      type: 'single',
      prompt: 'A developer proposes a test that calls every flow with an empty payload "to hit the numbers". What is the best reply?',
      options: [
        'Accept it, since coverage is the number management asked for',
        'Reject it: coverage counts run processors, not checked behaviour',
        'Accept it, but only for flows that are still below 70 percent',
        'Accept it if the test is tagged so CI can skip it later',
      ],
      answer: 1,
      explain: 'A test without meaningful assertions catches no regressions. Cover real happy and error paths instead. Coverage-only tests are worthless. With parameterization, real per-rule tests are now cheap.',
    },
    {
      type: 'single',
      prompt: 'What is the difference between a Spy and Verify Call?',
      options: [
        'They are two names for the same MUnit processor',
        'Spy asserts around a real processor; Verify Call counts its calls',
        'Spy replaces the processor; Verify Call checks its output',
        'Spy records the calls; Verify Call asserts the payload after it',
      ],
      answer: 1,
      explain: 'A Spy runs assertions before and/or after a real processor. Verify Call checks how many times a processor was called, optionally with given attributes. Neither replaces the processor; that is what Mock When does.',
    },
  ],
  description: `
A **Tax Calculation Process API** has 14 tax rules (by country and product category). The team has 14 nearly identical MUnit tests, each 80 lines long, and coverage of 41 %. Error paths (backend timeout, 404, invalid payload) are not tested at all.

Management now wants:

| Gate | Threshold |
|---|---|
| Application coverage | ≥ 80 % |
| Every flow | ≥ 70 % |
| Build | must fail in CI if thresholds are not met |

A developer proposes to "add a test that calls every flow with an empty payload to hit the numbers".

**Questions**
1. How do MUnit parameterizations work? Show how to collapse the 14 tests.
2. How do you test error paths (timeouts, 404s) without real backends?
3. Configure coverage gates in the build. Which coverage types exist?
4. How do you run a subset of tests locally and skip tests when needed in CI?
5. Respond to the "empty payload" proposal.
`,
  answerTemplate: `## Parameterized tests

## Error scenarios

## Coverage gates

## Running subsets

## About gaming coverage
`,
  keyPoints: [
    'Parameterizations are defined on munit:config; each parameterization supplies property values and the whole suite runs once per parameterization.',
    'Mock When can return an error (e.g. HTTP:TIMEOUT) so error handlers are exercised without real backends; expectedErrorType asserts the outcome.',
    'The munit-maven-plugin coverage section sets runCoverage, failBuild and required application/resource/flow coverage, plus report formats.',
    'Tags and test name filters let you run a subset; skipping tests in a pipeline should be an explicit, visible exception.',
    'Coverage measures executed processors, not correctness. Tests must assert behaviour, so coverage-only tests are worthless.',
  ],
  solution: `
**Parameterized suite**
\`\`\`xml
<munit:config name="tax-rules-suite.xml">
  <munit:parameterizations>
    <munit:parameterization name="DE_books">
      <munit:parameters>
        <munit:parameter propertyName="inputFile" value="tax/de_books_in.json"/>
        <munit:parameter propertyName="expectedRate" value="0.07"/>
      </munit:parameters>
    </munit:parameterization>
    <munit:parameterization name="FR_electronics">
      <munit:parameters>
        <munit:parameter propertyName="inputFile" value="tax/fr_electronics_in.json"/>
        <munit:parameter propertyName="expectedRate" value="0.20"/>
      </munit:parameters>
    </munit:parameterization>
    <!-- ... 12 more -->
  </munit:parameterizations>
</munit:config>

<munit:test name="applies-correct-rate">
  <munit:behavior>
    <munit:set-event>
      <munit:payload value="#[readUrl('classpath://$\{inputFile}')]" mediaType="application/json"/>
    </munit:set-event>
  </munit:behavior>
  <munit:execution><flow-ref name="calculate-tax"/></munit:execution>
  <munit:validation>
    <munit-tools:assert-equals actual="#[payload.rate]" expected="#[$\{expectedRate}]"/>
  </munit:validation>
</munit:test>
\`\`\`
The suite runs once per parameterization; reports show each case by name. One test body, 14 data rows.

**Error scenarios**
\`\`\`xml
<munit-tools:mock-when processor="http:request">
  <munit-tools:with-attributes>
    <munit-tools:with-attribute attributeName="config-ref" whereValue="rateTableApi"/>
  </munit-tools:with-attributes>
  <munit-tools:then-return>
    <munit-tools:error typeId="HTTP:TIMEOUT"/>
  </munit-tools:then-return>
</munit-tools:mock-when>
\`\`\`
Then assert the handler's output (status 504, error body) or use \`expectedErrorType\` on the test when the error should propagate. Repeat for \`HTTP:NOT_FOUND\` and a schema-invalid payload.

**Coverage gates** (munit-maven-plugin)
\`\`\`xml
<coverage>
  <runCoverage>true</runCoverage>
  <failBuild>true</failBuild>
  <requiredApplicationCoverage>80</requiredApplicationCoverage>
  <requiredFlowCoverage>70</requiredFlowCoverage>
  <formats><format>html</format><format>sonar</format></formats>
</coverage>
\`\`\`
Coverage types: **application** (whole app), **resource** (per XML file), **flow** (per flow). Exclude generated/boilerplate flows deliberately (e.g. APIkit console) rather than lowering the bar.

**Subsets:** run one suite or test with the plugin's test-filter properties, or group tests with \`tags\` and select them via a tags property. \`-DskipMunitTests\` exists, but in CI it should be used only for documented exceptions (e.g. a hotfix with an approval), never by default.

**About the empty-payload test:** it raises the number without verifying anything and will fail to catch regressions; reviewers and quality gates should reject tests without meaningful assertions. Cover real behaviour: happy paths per rule (now cheap thanks to parameterization) and each error path.
`,
  followUps: [
    {
      q: 'What is the difference between a spy and a verify-call?',
      a: 'A spy runs assertions before and/or after a real processor executes; verify-call checks how many times a processor was called (optionally with given attributes).',
    },
    {
      q: 'How do you keep tests from calling real systems accidentally?',
      a: 'Mock every outbound connector operation used in the flow under test, and use test-specific properties pointing to invalid hosts so an unmocked call fails fast.',
    },
  ],
}
