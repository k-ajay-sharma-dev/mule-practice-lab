export default {
  id: 'inc-087',
  category: 'incidents',
  title: 'All MUnit Tests Green, Every Card Capture Rejected: A Mock That Accepted Anything',
  level: 'ADVANCED',
  tags: ['munit', 'testing', 'mocking', 'payments', 'ci-cd', 'release'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-20 16:41:12 INFO  [ci] munit-maven-plugin: Tests: 22 - Failed: 0 - Errors: 0 - Skipped: 0', relevant: true, why: 'The suite passed on the release that broke production, so it was unable to see this defect.' },
      { text: '2026-10-20 16:41:13 INFO  [ci] MUnit Coverage Summary: Application Coverage: 91.30%', relevant: true, why: 'Coverage was high, because coverage shows what executed, not that the outbound request was checked.' },
      { text: '2026-10-21 07:02:03 INFO  [runtime] payment-capture: deployment applied, 2 replicas STARTED', relevant: false },
      { text: '2026-10-21 07:05:41 INFO  [payment-capture] Capture requested order=O-88213 amount=129.90', relevant: false },
      { text: '2026-10-21 07:05:42 ERROR [payment-capture] HTTP POST https://psp.example.com/v3/captures failed: HTTP:BAD_REQUEST status 400 {"error":"merchantReference is required"}', relevant: true, why: 'The real PSP rejects the request body, and the message names the missing field.' },
      { text: '2026-10-21 07:05:42 INFO  [payment-capture] order=O-88213 outbound keys: [amount, currency, merchantRef, orderId]', relevant: true, why: 'The request has merchantRef, so the mapping produced the wrong field name.' },
      { text: '2026-10-21 07:06:00 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-10-21 07:21:18 WARN  [monitoring] payment-capture error rate 100% over 15 min (threshold 2%)', relevant: true, why: 'Every capture fails, which points to a deterministic release defect rather than a transient PSP fault.' },
      { text: '2026-10-21 07:22:00 INFO  [runtime] payment-capture: CPU 9%, memory 46%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the MUnit suite stay green even though every real capture fails?',
        options: [
          'The test mocks `http:request`, so the configured success response comes back whatever the flow sends, and nothing asserts the outbound payload',
          'Transform Message was mocked, so the new mapping never ran in the test',
          'MUnit skips DataWeave scripts by default',
          'The mock raised `HTTP:BAD_REQUEST`, but the test ignored the error',
        ],
        answer: 0,
        explain: 'Mock When returns a configured response instead of executing the real operation. Transform Message cannot be mocked, so the broken mapping did run in the test: it was just never checked.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Roll back to the previous version, confirm one capture succeeds, then reprocess the failed captures in a controlled way',
          'Add `merchantReference` to the mock response and re-run the tests',
          'Retry the failed captures in a loop until the PSP accepts them',
          'Raise the error-rate alert threshold',
        ],
        answer: 0,
        explain: 'The previous configuration is known to work, and a 400 will not succeed on retry. The mock is not the production problem.',
      },
      {
        type: 'multi',
        prompt: 'Which changes would have caught this defect before release?',
        options: [
          'Assertions on the outbound fields at the PSP call, in a `spy` with `before-call` or in a `then-call` mock flow',
          'An assertion on the request payload built by the mapping, using an expected example taken from the PSP specification',
          'A non-mocked integration or contract test against the PSP sandbox, tagged and run in the pipeline',
          'Asserting that the payload equals the value the mock itself returns',
          'Raising the coverage requirement to 100%',
        ],
        answer: [0, 1, 2],
        explain: 'Test what crosses the boundary. Asserting the value your own mock returned is circular, and more coverage would not have helped because the mapping already executed. The docs do not describe a spy and a mock on the same processor, so make an assertion fail once to confirm that a spy fires.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Read the PSP error and confirm the field name is wrong in the outbound request',
          'Roll back `payment-capture` and verify one capture',
          'Reprocess the failed captures at a controlled rate and reconcile against orders',
          'Fix the mapping, and add a test that asserts the outbound request',
          'Review other suites for assertions that only check mocked values',
        ],
        explain: 'Restore service first, then repair the data, then fix the code and the test gap, and finally look for the same gap elsewhere.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 07:05, 3 minutes after a routine release: **every card capture fails**. Orders stay in \`AWAITING_PAYMENT\`.
- \`payment-capture\` is healthy and both replicas are running.
- The release passed the pipeline: 22 MUnit tests green, coverage 91%.

## Change / Context
- The app handles about 60,000 captures per day. The release included a "tidy-up" of \`build-capture-request\`, a sub-flow with one Transform Message.
- The tidy-up renamed an output field from \`merchantReference\` to \`merchantRef\` to match an internal naming standard.
- The happy-path test looks like this:

\`\`\`xml
<munit-tools:mock-when processor="http:request">
  <munit-tools:then-return>
    <munit-tools:payload value='#[{ status: "CAPTURED", captureId: "C-1" }]'/>
  </munit-tools:then-return>
</munit-tools:mock-when>
...
<munit:validation>
  <munit-tools:assert-that expression="#[payload.status]" is="#[MunitTools::equalTo('CAPTURED')]"/>
  <munit-tools:verify-call processor="http:request" times="1"/>
</munit:validation>
\`\`\`

## Logs
\`\`\`
16:41:12 INFO  [ci] Tests: 22 - Failed: 0 - Errors: 0 - Skipped: 0
16:41:13 INFO  [ci] Application Coverage: 91.30%
07:05:42 ERROR [payment-capture] HTTP POST /v3/captures failed: HTTP:BAD_REQUEST status 400
          {"error":"merchantReference is required"}
07:05:42 INFO  [payment-capture] outbound keys: [amount, currency, merchantRef, orderId]
07:21:18 WARN  [monitoring] error rate 100% over 15 min
\`\`\`

## Your tasks
1. What is the most likely root cause, and why did the tests pass?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'A mock returns its configured response whatever the flow sends, so it can never reject a bad request.',
    'Transform Message cannot be mocked. The mapping ran in the test, but no assertion looked at its output.',
    'Both assertions were weak: one checked the value the mock supplied, the other only counted the call.',
    'Coverage shows that processors executed; it says nothing about whether their output was correct.',
    'Assert what crosses the boundary, with a spy or a direct test of the mapping sub-flow, and add a sandbox or contract test for the real system.',
  ],
  solution: `
**Diagnosis.** The PSP returns \`400\` with "merchantReference is required", and the outbound keys show \`merchantRef\`. The failure began with the release and affects every capture, so this is a deterministic mapping defect.

**Immediate mitigation.**
- Roll back to the previous version and confirm one capture succeeds.
- Reprocess the failed captures at a controlled rate, using the order reference to avoid double captures, and reconcile against orders.
- Tell the payments team how many orders were delayed.

**Root cause.** The test made the real system's checks disappear. Mock When intercepts the processor and returns a configured response instead of executing the operation, so the only component able to reject the request was replaced by one that always says yes. The test then asserted \`payload.status\`, a value the mock itself supplied, and \`verify-call\` only proved the call happened. Transform Message cannot be mocked, so the renamed field did pass through the test, unobserved.

**Permanent fix.** Correct the mapping, and test the request. A spy runs assertions before the processor without changing the event:
\`\`\`xml
<munit-tools:spy processor="http:request">
  <munit-tools:before-call>
    <munit-tools:assert-that expression="#[payload.merchantReference]" is="#[MunitTools::notNullValue()]"/>
    <munit-tools:assert-that expression="#[payload.amount]" is="#[MunitTools::equalTo(129.90)]"/>
  </munit-tools:before-call>
</munit-tools:spy>
\`\`\`
The docs do not describe a spy and a mock on the same processor, so make an assertion fail once to confirm that it fires. A \`flow-ref\` straight to \`build-capture-request\`, with assertions in validation, avoids the question. Better still, compare the whole request with an example taken from the PSP specification. Narrow the mock with \`with-attributes\`, too, so it cannot silently cover a second HTTP call added later.

**Prevention.**
- Agree a rule: a mock's value may not be the only thing a test asserts.
- Build mock responses and expected requests from the provider's specification or recorded examples, not from memory.
- Add a small, tagged integration suite against the PSP sandbox, and run it in the pipeline with \`-Dmunit.tags\`.
- Add negative tests: mock \`HTTP:BAD_REQUEST\` and check how the flow behaves.
- Review suites for circular assertions. Do not treat coverage as a measure of correctness.
`,
  followUps: [
    { q: 'Would raising coverage to 100% have helped?', a: 'No. The mapping already executed in the test. Coverage counts processors that ran, and a wrong field name still runs.' },
    { q: 'Should we stop mocking external systems?', a: 'No. Mocks keep unit tests fast and independent. Keep them, but assert what you send, and cover the real contract with a smaller set of sandbox or contract tests.' },
    { q: 'Could the mock itself have helped?', a: 'A then-call flow can act on the incoming event, so it could return an error when a required field is missing. A spy with assertions is simpler and clearer, though.' },
  ],
}
