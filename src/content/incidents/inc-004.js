export default {
  id: 'inc-004',
  category: 'incidents',
  title: 'Empty Payload After Switching to Non-Repeatable Streams',
  level: 'INTERMEDIATE',
  tags: ['streaming', 'dataweave', 'payload', 'performance-tuning'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '09:58:01.300 INFO  [deploy] invoices-papi v3.1.0 started (log level com.example=DEBUG)', relevant: true, why: 'The release that introduced the non-repeatable stream, running with DEBUG on in production.' },
      { text: '10:02:40.120 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '10:02:44.502 INFO  [invoices] POST /invoices received corrId=5d21', relevant: false },
      { text: '10:02:44.510 DEBUG [invoices] {"invoiceNo":"INV-2291","customer":"C-300","lines":[...]}', relevant: true, why: 'The DEBUG logger evaluates #[payload] and reads the whole non-repeatable stream first.' },
      { text: '10:02:44.533 ERROR [invoices] MULE:EXPRESSION  "Unexpected end-of-input at payload@[1:1], expected a value"', relevant: true, why: 'The transform finds the stream already at its end, so DataWeave sees empty input.' },
      { text: '10:02:44.540 ERROR [invoices] Error report sent. originalRequest=<empty>', relevant: true, why: 'The variable only referenced the same consumed stream, so it is empty too.' },
      { text: '10:02:45.010 INFO  [scheduler] Token refresh for erp-sapi OK', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the transform see an empty payload?',
        options: [
          'The non-repeatable stream is consumed by the DEBUG logger before the transform runs',
          'The client sends an empty body since v3.1.0',
          'The DataWeave script has a syntax error introduced in v3.1.0',
          'set-variable moved the payload into the variable and cleared it',
        ],
        answer: 0,
        explain: 'A non-repeatable stream can be read only once. With DEBUG on, the logger reads it first. The logged body proves the client sent data, and in test (DEBUG off) the same script worked.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now** to restore service?',
        options: [
          'Turn DEBUG logging off in production',
          'Roll back to v3.0.x or remove <non-repeatable-stream /> so Mule uses its default repeatable strategy',
          'Increase the worker size',
          'Wrap the transform in a Try scope',
        ],
        answer: 1,
        explain: 'Restoring a repeatable stream fixes all readers. Turning DEBUG off only works by luck, and the variable would still be empty for error reports.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Keep a repeatable strategy (default repeatable-file-store-stream, tune inMemorySize if needed)',
          'Use non-repeatable streams only for true single-pass flows, transforming first and reusing the result',
          'Log identifiers such as invoiceNo and correlation ID instead of the full payload',
          'Copy the payload into a variable before logging so it can be read twice',
        ],
        answer: [0, 1, 2],
        explain: 'A variable holds a reference to the same stream, not a copy, so it does not make a non-repeatable stream readable twice.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Correlate the 500s with the v3.1.0 release and the streaming change',
          'Roll back or remove the non-repeatable stream setting',
          'Confirm POST /invoices succeeds again',
          'Add a test that runs with production log levels and a real payload',
          'Add "who reads this stream?" to the review checklist',
        ],
        explain: 'Diagnose, restore, verify, then make sure tests and reviews catch streaming changes next time.',
      },
    ],
  },
  description: `
## Symptoms
- After release **v3.1.0** of \`invoices-papi\`, every \`POST /invoices\` fails with **HTTP 500**.
- The failing step is the DataWeave transform that maps the incoming invoice to the ERP format.
- In the test environment, the team had **debug logging switched off** and all tests passed. In production, \`DEBUG\` logging is on for this app during the first week after a release.

## Change in the release
> "Performance tuning: set the HTTP Listener to use a **non-repeatable stream** to save memory and disk. Also added a variable \`originalRequest\` holding the payload for error reporting."

\`\`\`
<http:listener config-ref="api-httpListenerConfig" path="/invoices">
    <non-repeatable-stream />
</http:listener>
<logger level="DEBUG" message="#[payload]" />
<set-variable variableName="originalRequest" value="#[payload]" />
<ee:transform> ... maps payload to ERP invoice ... </ee:transform>
\`\`\`

## Logs
\`\`\`
10:02:44.510 DEBUG [invoices] {"invoiceNo":"INV-2291","customer":"C-300","lines":[...]}
10:02:44.533 ERROR [invoices] MULE:EXPRESSION  "Unexpected end-of-input at payload@[1:1]
  (line:column), expected a value
  Trace: at main (Unknown)" evaluating expression: "%dw 2.0 output application/json ..."
10:02:44.540 ERROR [invoices] Error report sent. originalRequest=<empty>
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now** to restore service?
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
    'The payload is a non-repeatable stream, so it can be read only once; the DEBUG logger reads it, leaving nothing for the transform.',
    'Explains why tests passed: with DEBUG off the logger did not evaluate #[payload], so the transform was the first and only reader.',
    'Recognises that set-variable with #[payload] does not copy the data — it references the same consumed stream, so originalRequest is empty too.',
    'Immediate: roll back or remove the non-repeatable-stream setting (back to the default repeatable strategy) / turn DEBUG logging off.',
    'Permanent fix: keep repeatable streaming (default file-store in EE, tuned buffer), or read the stream once into a materialised value (e.g. transform first, then log the result) if non-repeatable is truly needed.',
    'Prevention: test with production-like logging levels, review streaming changes, and avoid logging full payloads (log IDs instead).',
  ],
  solution: `
**Diagnosis.** With \`<non-repeatable-stream />\` the payload is a plain input stream that can be **consumed only once**. In production the DEBUG logger evaluates \`#[payload]\` first — it reads the whole stream to print it. When the transform runs, the stream is already at its end, so DataWeave sees **empty input**: \`Unexpected end-of-input at payload@[1:1]\`. The variable \`originalRequest\` is also empty: \`set-variable\` stores a **reference to the same stream**, not a copy.

In test, DEBUG was off, so the logger did not evaluate its expression and the transform was the only reader — tests passed.

**Immediate mitigation.** Roll back to v3.0.x, or hot-fix by removing \`<non-repeatable-stream />\` (Mule then uses its default **repeatable** strategy: file-store in EE, in-memory in CE). Turning DEBUG off would also "fix" it, but only by luck.

**Root cause.** A streaming strategy was changed without checking how many components read the payload. Logger, set-variable and transform all touch it; a non-repeatable stream only supports one reader.

**Permanent fix.**
- Keep a **repeatable** strategy (default \`repeatable-file-store-stream\`, tune \`inMemorySize\` if needed). That is what makes multiple reads safe.
- Only use non-repeatable streams for true single-pass flows (e.g. stream a file straight to a target), and then read once: transform **first**, put the result in a variable, and log/use that.
- Log identifiers (\`invoiceNo\`, correlation ID), not the full payload.

**Prevention.** Test with the same log levels as production. Add a review checklist item for streaming strategy changes ("who reads this stream?"). Include a contract test that posts a real payload through the whole flow.
`,
}
