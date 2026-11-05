export default {
  id: 'ms-093',
  category: 'mulesoft',
  title: 'Testing Error Paths and Connectors With MUnit: Error Handlers, Test Isolation and Coverage',
  level: 'ADVANCED',
  tags: ['munit', 'testing', 'error-handling', 'coverage', 'ci-cd'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The ledger call fails with `HTTP:CONNECTIVITY` and an `on-error-continue` sets `{ status: "QUEUED" }`. How do you test it?',
      options: [
        'Mock the request to raise the error and assert `payload.status` in validation, with no `expectedErrorType` on the test',
        'Set `expectedErrorType="HTTP:CONNECTIVITY"` and leave validation empty',
        'Set `expectedErrorType` and also assert the payload',
        'Point the test at a closed port so the error happens naturally',
      ],
      answer: 0,
      explain: 'On Error Continue handles the error, so execution resumes and the event can be verified. The docs state you do not have to expect the error type in this case.',
    },
    {
      type: 'single',
      prompt: 'The `HTTP:BAD_REQUEST` path uses `on-error-propagate`. You also need `verify-call` to prove the failure was logged. What is the problem, and the documented fix?',
      options: [
        'The propagated error fails the flow, so the validation section is skipped. Wrap the `flow-ref` in a `try` with `on-error-continue` inside `munit:execution`',
        'Validation always runs, so no change is needed',
        'Logger cannot be verified, because Logger cannot be mocked',
        'Move `verify-call` into `munit:behavior`',
      ],
      answer: 0,
      explain: 'The cookbook says verifications will not run for On Error Propagate because the validation section is skipped. Catching the error inside the execution scope lets the verifications run.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A test mocks an HTTP request with `typeId="FTP:CONNECTIVITY"`, but no flow under test uses the FTP connector. What does the docs page say you get?',
      options: [
        '`MULE:UNKNOWN` instead of the configured error',
        '`FTP:CONNECTIVITY` as configured',
        '`HTTP:CONNECTIVITY`, because the error is mapped to the mocked processor',
        'The mock is skipped and the real request runs',
      ],
      answer: 0,
      explain: 'You can return only the error types defined in the modules the current flow uses. Anything outside that scope comes back as `MULE:UNKNOWN`.',
    },
    {
      type: 'single',
      prompt: 'An MUnit test sets `expectedErrorType` on `munit:test`, so it expects an error. The flow under test finishes with no error. What happens?',
      options: [
        'The test fails immediately',
        'The test passes, because no error is a good result',
        'MUnit retries the test once',
        'The test is skipped and marked as not run',
      ],
      answer: 0,
      explain: 'If an exception is expected and none is thrown, the test fails immediately. The test structure page has more rules. If `expectedErrorType` names a type that does not exist in the application, the test does not run. Mule runtime error types are written without the prefix, so `RETRY_EXHAUSTED` rather than `MULE:RETRY_EXHAUSTED`. `expectedErrorDescription` passes when the error description equals or contains the expected text. Retrying is not part of these attributes.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Error logic lives in a sub-flow that reads `error.description`. You want to test that sub-flow on its own. How do you provide the error?',
      options: [
        'In `munit:set-event`, add `munit:error` with an `id` and an `exception`',
        'Mock the sub-flow with `then-return` and an error',
        'Add `expectedErrorType` to the test',
        'Set a variable called `error` in `munit:variables`',
      ],
      answer: 0,
      explain: 'When error handling is extracted into a separate flow or sub-flow, the input event must carry an error. `<munit:error id="OS:INVALID_KEY" exception="#[java!java::lang::Exception::new(\'Invalid Key\')]"/>` is the documented form.',
    },
    {
      type: 'match',
      prompt: 'Match each isolation need to the MUnit feature.',
      pairs: [
        ['Seed one shared row once for all four tests', '`munit:before-suite`'],
        ['Insert a fresh record before every test', '`munit:before-test`'],
        ['Delete what a test created so it cannot affect the next test', '`munit:after-test`'],
        ['Avoid port clashes when suites run on a shared CI agent', '`munit:dynamic-port`'],
      ],
      explain: 'You can use one of each Before and After scope per suite, and each suite runs independently of the others.',
    },
    {
      type: 'single',
      prompt: 'MUnit coverage counts the event processors that tests execute. A developer adds one flow to `ignoreFlows` in the `coverage` settings of the MUnit Maven Plugin. What is the effect on that flow?',
      options: [
        'It is left out of the totals and cannot fail the build',
        'It still counts towards the total number of processors',
        'It counts as fully covered in the report',
        'It fails the build unless a test runs it',
      ],
      answer: 0,
      explain: 'An ignored flow does not count as coverage data, does not affect the processor total and cannot fail the build, so use `ignoreFlows` sparingly. Flow coverage covers flows, sub-flows and batch jobs. The `coverage` settings apply when tests run through Maven, not when they run from Studio. With `failBuild` set to false, unmet levels appear as a warning in the summary.',
    },
  ],
  description: `
An accounts-payable team is adding MUnit tests to \`post-invoice-flow\`, which posts about 25,000 supplier invoices per day to a ledger API. Production problems have all been in the error paths, none of which are tested.

\`\`\`xml
<flow name="post-invoice-flow">
  <http:listener config-ref="invoiceListener" path="/invoices"/>
  <db:select config-ref="suppliersDb" doc:name="Find supplier">
    <db:sql>SELECT status FROM suppliers WHERE id = :id</db:sql>
    <db:input-parameters>#[{ id: payload.supplierId }]</db:input-parameters>
  </db:select>
  <http:request method="POST" config-ref="ledgerApi" path="/ledger/invoices"/>
  <error-handler>
    <on-error-continue type="HTTP:CONNECTIVITY">
      <flow-ref name="park-invoice"/>
      <set-payload value='#[{ status: "QUEUED" }]'/>
    </on-error-continue>
    <on-error-propagate type="HTTP:BAD_REQUEST">
      <logger level="ERROR" message="Ledger rejected the invoice"/>
      <raise-error type="APP:LEDGER_REJECTED"/>
    </on-error-propagate>
  </error-handler>
</flow>

<sub-flow name="audit-failure">
  <logger level="INFO" message="#['Execution failed with: $(error.description)']"/>
</sub-flow>
\`\`\`

The team also has flaky results: tests pass alone and fail together, and a suite sometimes fails with a port conflict on the shared CI agent.

**Questions**
1. Write the test for the On Error Continue path.
2. Write the test for the On Error Propagate path. What changes if you must also verify the logger ran?
3. How do you test \`audit-failure\` on its own?
4. When do you mock a connector, and when do you use a real test server such as the MUnit Database Server?
5. How do you make the tests independent of each other?
6. What does coverage tell you about these error paths?
`,
  answerTemplate: `## On Error Continue test

## On Error Propagate test

## Testing the error sub-flow

## Mock or test server

## Test isolation

## Coverage of error paths
`,
  keyPoints: [
    'On Error Continue: mock the error, assert the resulting event, do not set expectedErrorType.',
    'On Error Propagate: set expectedErrorType to the final error. The validation section is skipped when the flow fails, so catch the error with a try in the execution scope if verifications must run.',
    'Mock errors with then-return and error typeId (or cause). Only error types of modules used by the flow are valid; others become MULE:UNKNOWN.',
    'expectedErrorType must exist in the app, and Mule runtime types drop the MULE: prefix. expectedException and expectedErrorDescription are also available.',
    'An error sub-flow is tested by setting munit:error in set-event.',
    'Before and After scopes (one of each per suite), independent suites, dynamic ports and the 2-minute default test timeout all shape isolation.',
    'Coverage counts event processors at application, resource and flow level; error handlers appear in the report, so an untested handler lowers the figure.',
  ],
  solution: `
**On Error Continue.** The handler resumes the flow, so validate the event.
\`\`\`xml
<munit:test name="post-invoice-ledger-down" description="Ledger unreachable: invoice is parked and QUEUED is returned">
  <munit:behavior>
    <munit:set-event>
      <munit:payload value="#[{ supplierId: 'S-1001', amount: 120.50 }]"/>
    </munit:set-event>
    <munit-tools:mock-when processor="db:select">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="doc:name" whereValue="#['Find supplier']"/>
      </munit-tools:with-attributes>
      <munit-tools:then-return>
        <munit-tools:payload value="#[[{ status: 'ACTIVE' }]]"/>
      </munit-tools:then-return>
    </munit-tools:mock-when>
    <munit-tools:mock-when processor="http:request">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="config-ref" whereValue="#['ledgerApi']"/>
      </munit-tools:with-attributes>
      <munit-tools:then-return>
        <munit-tools:error typeId="HTTP:CONNECTIVITY"/>
      </munit-tools:then-return>
    </munit-tools:mock-when>
    <munit-tools:mock-when processor="mule:flow-ref">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="name" whereValue="#['park-invoice']"/>
      </munit-tools:with-attributes>
    </munit-tools:mock-when>
  </munit:behavior>
  <munit:execution>
    <flow-ref name="post-invoice-flow"/>
  </munit:execution>
  <munit:validation>
    <munit-tools:assert-that expression="#[payload.status]" is="#[MunitTools::equalTo('QUEUED')]"/>
    <munit-tools:verify-call processor="mule:flow-ref">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="name" whereValue="#['park-invoice']"/>
      </munit-tools:with-attributes>
    </munit-tools:verify-call>
  </munit:validation>
</munit:test>
\`\`\`

**On Error Propagate.** The test expects the final error: \`expectedErrorType="APP:LEDGER_REJECTED"\`. If the logger must also be verified, the validation section would be skipped, so catch the error inside the test:
\`\`\`xml
<munit:execution>
  <try>
    <flow-ref name="post-invoice-flow"/>
    <error-handler>
      <on-error-continue type="APP:LEDGER_REJECTED"/>
    </error-handler>
  </try>
</munit:execution>
<munit:validation>
  <munit-tools:verify-call processor="mule:logger"/>
</munit:validation>
\`\`\`
Use one or the other in a test. With the \`try\` in place the error no longer reaches the test, so there is nothing for \`expectedErrorType\` to match.

**Error sub-flow.**
\`\`\`xml
<munit:set-event>
  <munit:error id="HTTP:CONNECTIVITY" exception="#[java!java::lang::Exception::new('Ledger down')]"/>
</munit:set-event>
\`\`\`
Then \`flow-ref\` to \`audit-failure\` and \`verify-call\` on \`mule:logger\` with a \`with-attribute\` on \`message\`, as the cookbook does.

**Mock or test server.**
- Mock when the test is about Mule logic: routing, mapping, error handling.
- Use a real test server when the interaction itself matters. The MUnit Database Server runs an in-memory database seeded from a CSV file, so SQL really executes; the FTP Server utility does the same for FTP. An unreachable system is a reason to mock, not a reason to skip the path.

**Test isolation**
- Each suite file runs independently. Keep suites self-contained and do not rely on the order of tests.
- \`munit:before-test\` prepares state for each test; \`munit:after-test\` removes it. Use \`before-suite\` and \`after-suite\` only for genuinely shared state, such as starting a utility. Each scope can appear once per suite, and its name must be unique and must not match a flow name.
- Use \`munit:dynamic-port\` (or \`dynamicPorts\` in the Maven plugin) with \`$\{http.port}\` so parallel runs do not clash. Sources are not started by default, so a port is only opened when a test enables the listener with \`munit:enable-flow-sources\`.
- Keep test-only values in the plugin's \`environmentVariables\` or \`systemPropertyVariables\`.
- A test fails after 2 minutes by default; set \`timeOut\` rather than letting a hung test block the pipeline.

**Coverage of error paths.** Coverage measures how much of the app is executed by counting event processors, at application, resource and flow level. The report lists \`error-handler\` as a top-level element type, so an untested handler is visible. Coverage shows that a handler ran, not that its result was right: only assertions do that. Coverage configuration applies when running through Maven, not from Studio or Anypoint Code Builder.
`,
  followUps: [
    {
      q: 'What happens if a pipeline runs a project with no MUnit tests?',
      a: 'By default MUnit fails the Maven build if it finds no suites or no tests run. munitFailIfNoTests set to false allows it, and should be used only when no tests are expected.',
    },
    {
      q: 'How do you run only the error tests while developing?',
      a: 'Tag them with tags="errors" and run with -Dmunit.tags=errors, or filter by name with -Dmunit.test=<suite regex>#<test regex>.',
    },
    {
      q: 'How do you prove a branch is never reached?',
      a: 'Put munit-tools:fail in a then-call flow or spy at that point. It throws MUNIT-TOOLS:ASSERTION_ERROR, so the test fails if the code path runs.',
    },
    {
      q: 'What is the difference between typeId and cause when mocking an error?',
      a: 'typeId follows a Mule error type such as HTTP:CONNECTIVITY. cause expects an exception instance with a message, for example built with java!java::lang::Exception::new.',
    },
  ],
}
