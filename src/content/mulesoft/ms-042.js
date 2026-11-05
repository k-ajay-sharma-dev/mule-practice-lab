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
        'Each test gets a `for-each` over a list of inputs',
        'Parameterizations on `munit:config` supply property values, and the whole suite runs once per parameterization',
        'You copy the test 14 times with different names',
        'A DataWeave script generates the XML at build time',
      ],
      answer: 1,
      explain: 'One test body, 14 data rows. Reports show each case by its parameterization name.',
    },
    {
      type: 'single',
      prompt: 'How do you test the backend-timeout path without a real rate-table API?',
      options: [
        'Point the config at a slow host and wait',
        'Use Mock When on the HTTP request and return an error with `typeId="HTTP:TIMEOUT"`, then assert the handler output',
        'Use a Spy to throw the error',
        'It can only be tested in an integration environment',
      ],
      answer: 1,
      explain: 'Mock When can return an error so error handlers are exercised. Assert the result (e.g. 504 body) or use `expectedErrorType` when the error should propagate.',
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
        'Good — coverage is what management asked for',
        'Coverage measures executed processors, not correctness; a test without meaningful assertions catches no regressions — cover real happy and error paths instead',
        'Fine, but only for flows under 70%',
        'Fine, as long as it is tagged',
      ],
      answer: 1,
      explain: 'Coverage-only tests are worthless. With parameterization, real per-rule tests are now cheap.',
    },
    {
      type: 'single',
      prompt: 'What is the difference between a Spy and Verify Call?',
      options: [
        'They are aliases',
        'A Spy runs assertions before and/or after a real processor; Verify Call checks how many times a processor was called',
        'A Spy replaces the processor; Verify Call mocks it',
        'Verify Call only works on HTTP requests',
      ],
      answer: 1,
      explain: 'Neither replaces the processor — that is what Mock When does.',
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
    'Coverage measures executed processors, not correctness — tests must assert behaviour, so coverage-only tests are worthless.',
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

**About the empty-payload test:** it raises the number without verifying anything and will fail to catch regressions; reviewers and quality gates should reject tests without meaningful assertions. Cover real behaviour — happy paths per rule (now cheap thanks to parameterization) and each error path.
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
