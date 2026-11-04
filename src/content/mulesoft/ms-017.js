export default {
  id: 'ms-017',
  category: 'mulesoft',
  title: 'MUnit: Mocks, Spies, Assertions and Coverage',
  level: 'INTERMEDIATE',
  tags: ['munit', 'testing', 'mocking', 'ci-cd'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each MUnit test section to what goes in it.',
      pairs: [
        ['Behavior', 'Set event, mocks and spies'],
        ['Execution', '`flow-ref` to the flow under test'],
        ['Validation', 'Assertions and `verify-call`'],
      ],
      explain: 'Behavior = arrange, Execution = act, Validation = assert.',
    },
    {
      type: 'single',
      prompt: 'The ERP and Anypoint MQ are not reachable from CI. What must the happy-path test do?',
      options: [
        'Mock both the ERP HTTP Request and the `anypoint-mq:publish` processor',
        'Mock only the ERP call — MQ publish is skipped automatically in MUnit',
        'Spy on both processors so they are not executed',
        'Disable the connectors in `mule-artifact.json` for tests',
      ],
      answer: 0,
      explain: 'Unmocked processors run for real, so the MQ publish would try to reach the broker. A spy does **not** replace behaviour — it only runs assertions around the processor.',
    },
    {
      type: 'single',
      prompt: 'Why narrow the ERP mock with a `with-attribute` such as `config-ref`, rather than using `processor="http:request"` alone?',
      options: [
        'With no attribute the mock targets any `http:request`, so a second HTTP call added later would silently get the ERP response',
        '`with-attributes` is mandatory on every mock',
        'MUnit can only match on `config-ref`',
        'The attribute makes the test run faster',
      ],
      answer: 0,
      explain: 'The MUnit pages show matching on attributes such as `config-ref`, `method`, `path`, `operation` and `doc:name`. A name can repeat or be renamed, so `config-ref` is often the safer choice when each call has its own configuration.',
    },
    {
      type: 'multi',
      prompt: 'One test must prove that the **rejected** path (ERP returns `status: "REJECTED"`) never publishes. What does it need?',
      options: [
        'Mock the ERP call to return `{ status: "REJECTED" }`',
        'Wrap the `flow-ref` in a `try` with `on-error-continue type="APP:ORDER_REJECTED"` inside `munit:execution`',
        '`verify-call` on `anypoint-mq:publish` with `times="0"` in validation',
        'Mock the ERP call to raise `HTTP:CONNECTIVITY`',
      ],
      answer: [0, 1, 2],
      explain: 'The rejected branch raises `APP:ORDER_REJECTED`, and the error propagates. The cookbook says the flow then fails and the `validation` section is skipped, so `verify-call` needs the `try`. Prove the error type itself in a separate test with `expectedErrorType="APP:ORDER_REJECTED"`. Raising `HTTP:CONNECTIVITY` tests the other failure path.',
    },
    {
      type: 'single',
      prompt: 'When would you use a **spy** instead of a mock?',
      options: [
        'To assert the payload or variables going into (or coming out of) a processor without changing its behaviour',
        'To make a processor return a fixed payload',
        'To make a processor raise an error',
        'To count how many tests ran',
      ],
      answer: 0,
      explain: 'A spy runs assertions before/after the processor without modifying the event, so it suits checking the ERP request payload.',
    },
    {
      type: 'single',
      prompt: 'How is the 80% coverage rule enforced so the build fails below it?',
      options: [
        '`munit-maven-plugin` with coverage enabled, `requiredApplicationCoverage` 80 and `failBuild` true',
        'Anypoint Studio shows coverage, and reviewers check it manually',
        'Runtime Manager refuses to deploy apps under 80%',
        'An API Manager policy on the test environment',
      ],
      answer: 0,
      explain: 'The Maven plugin measures executed processors and fails `mvn test`/`verify` below the threshold — so the pipeline enforces it.',
    },
  ],
  description: `
You must write MUnit tests for this flow before the pipeline will let you merge (team rule: **80% application coverage**, build fails below it):

\`\`\`text
create-order-flow  (HTTP Listener POST /orders)
 ├─ Transform Message "Map to ERP"
 ├─ HTTP Request "Call ERP" POST /orders   (config erpConfig)
 ├─ Choice: ERP status == "ACCEPTED"?
 │    ├─ yes → Anypoint MQ Publish "order-created"
 │    └─ no  → Raise Error APP:ORDER_REJECTED
 └─ Error handler: On Error Propagate HTTP:CONNECTIVITY → 503 body
\`\`\`

The ERP and Anypoint MQ are **not** reachable from the CI runner.

**Questions**
1. What are the three sections of an MUnit test and what goes in each?
2. Write the key parts of a test for the **happy path**: mock the ERP, verify MQ was called once, assert the payload sent to the ERP.
3. How do you test the **ERP connectivity failure** and the **rejected** paths?
4. When would you use a **spy** instead of a mock?
5. How is coverage measured and enforced in the build?
`,
  answerTemplate: `## Test structure

## Happy path test

## Failure paths

## Spy vs mock

## Coverage in the build
`,
  keyPoints: [
    'An MUnit test has behavior (set event, mocks, spies), execution (flow-ref to the flow under test) and validation (assertions, verify-call).',
    'mock-when targets a processor by name plus attributes such as config-ref or doc:name and returns a payload/attributes — or raises an error type.',
    'verify-call checks how many times a processor was called (e.g. MQ publish times=1, or 0 on the rejected path). It sits in validation, which is skipped when an error propagates, so catch the error with a try in the execution scope.',
    'Expected errors are tested with expectedErrorType on the test (e.g. APP:ORDER_REJECTED, or the propagated HTTP:CONNECTIVITY). Use a separate test when you also need verifications.',
    'spy runs assertions before/after a processor executes, e.g. to check the payload going into the ERP call.',
    'Coverage is reported and enforced by munit-maven-plugin settings (coverage enabled, required application coverage, fail build), so mvn test fails below the threshold.',
  ],
  solution: `
**Structure**
- **Behavior** — arrange: \`munit:set-event\` (payload, attributes), mocks and spies.
- **Execution** — act: \`flow-ref\` to \`create-order-flow\`.
- **Validation** — assert: \`munit-tools:assert-that\`, \`assert-equals\`, \`verify-call\`.

**Happy path**
\`\`\`xml
<munit:test name="create-order-accepted-test">
  <munit:behavior>
    <munit:set-event>
      <munit:payload value="#[readUrl('classpath://orders/request.json')]" mediaType="application/json"/>
    </munit:set-event>
    <munit-tools:mock-when processor="http:request">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="config-ref" whereValue="#['erpConfig']"/>
      </munit-tools:with-attributes>
      <munit-tools:then-return>
        <munit-tools:payload value='#[{ status: "ACCEPTED", erpId: "E-1" }]' mediaType="application/json"/>
        <munit-tools:attributes value="#[{ statusCode: 201 }]"/>
      </munit-tools:then-return>
    </munit-tools:mock-when>
    <munit-tools:mock-when processor="anypoint-mq:publish">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="doc:name" whereValue="#['order-created']"/>
      </munit-tools:with-attributes>
    </munit-tools:mock-when>
    <munit-tools:spy processor="http:request">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="config-ref" whereValue="#['erpConfig']"/>
      </munit-tools:with-attributes>
      <munit-tools:before-call>
        <munit-tools:assert-that expression="#[payload.customerNumber]" is="#[MunitTools::notNullValue()]"/>
      </munit-tools:before-call>
    </munit-tools:spy>
  </munit:behavior>
  <munit:execution>
    <flow-ref name="create-order-flow"/>
  </munit:execution>
  <munit:validation>
    <munit-tools:verify-call processor="anypoint-mq:publish" times="1"/>
  </munit:validation>
</munit:test>
\`\`\`
(Mock \`anypoint-mq:publish\` too — otherwise the test tries to reach MQ. The docs do not describe a spy and a mock on the same processor, so make an assertion fail once to confirm that the spy really fires.)

**Failure paths**
- **Connectivity:** mock the ERP call with \`<munit-tools:then-return><munit-tools:error typeId="HTTP:CONNECTIVITY"/></munit-tools:then-return>\`. Because the handler propagates, set \`expectedErrorType="HTTP:CONNECTIVITY"\` on the test (or test via the HTTP listener and assert status 503).
- **Rejected:** mock the ERP to return \`status: "REJECTED"\`. One test sets \`expectedErrorType="APP:ORDER_REJECTED"\`. Validation is skipped when the error propagates, so a second test catches the error with a \`try\` and \`on-error-continue\` around the \`flow-ref\` in \`munit:execution\`, then uses \`verify-call\` on MQ publish with \`times="0"\`.

**Spy vs mock:** a **mock** replaces the processor's behaviour. A **spy** doesn't change behaviour; it runs assertions **before/after** the processor — ideal for checking the exact payload/variables sent to the ERP (here combined with the mock).

**Coverage:** \`munit-maven-plugin\` with coverage enabled, \`requiredApplicationCoverage\` 80 and \`failBuild\` true; the pipeline runs \`mvn clean test\` (or \`verify\`). Coverage counts processors executed across flows — one test per Choice branch and per error handler raises it. Generate HTML/JSON reports for the pipeline artefacts.
`,
  followUps: [
    {
      q: 'Can you match a mock on doc:id?',
      a: 'with-attribute takes an attribute name and a value, but the MUnit pages only show method, path, config-ref, operation, doc:name, and name for a flow reference. They never show doc:id, so try it in your own suite before relying on it. doc:name can repeat or be renamed, which is why config-ref is often safer.',
    },
    {
      q: 'How do you run a test against a flow that starts with a Scheduler or a listener source?',
      a: 'Call the flow with flow-ref (the source is not executed) and set the event yourself; MUnit doesn\'t start message sources unless you enable them for the test.',
    },
    {
      q: 'Is 80% coverage enough to trust the tests?',
      a: 'Coverage only says processors ran, not that behaviour was checked. Strong tests assert outputs, error types and calls on every branch, including error handlers.',
    },
  ],
}
