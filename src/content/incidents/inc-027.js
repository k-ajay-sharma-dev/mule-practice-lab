export default {
  id: 'inc-027',
  category: 'incidents',
  title: 'Downstream System Rejects "JSON" That Is Actually a Java Map',
  level: 'BEGINNER',
  tags: ['dataweave', 'mime-types', 'transform', 'http'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '09:30:00.512 INFO  [deploy] shipment-papi v1.6.0 started (Transform "build carrier request" refactored)', relevant: true, why: 'The release that removed the DataWeave header; failures start right after it.' },
      { text: '10:14:00.004 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '10:14:02.331 INFO  [shipment-papi] Sending shipment to carrier corrId=51ac', relevant: false },
      { text: '10:14:02.332 DEBUG [shipment-papi] Request body: {trackingId=TRK-881, weight=2.4, service=EXPRESS}', relevant: true, why: 'key=value without quotes is a Java Map toString, not JSON: the transform now outputs application/java.' },
      { text: '10:14:02.333 DEBUG [shipment-papi] Header Content-Type: application/json', relevant: true, why: 'The header only labels the body; it does not convert a Java object into JSON.' },
      { text: '10:14:02.701 ERROR [shipment-papi] HTTP:BAD_REQUEST POST https://api.carrier.example/v2/shipments failed: bad request (400) corrId=51ac', relevant: false },
      { text: '10:14:02.702 ERROR [shipment-papi] Response: {"error":"Malformed JSON at position 1"}', relevant: true, why: 'The carrier fails at the very first key, because trackingId is not quoted.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'Without an output directive the output follows the script inputs, here Java rows from the Database Select, so a Java Map is sent instead of JSON',
          'The carrier changed its JSON schema',
          'The Content-Type header is missing',
          'The weight field is a number instead of a string',
        ],
        answer: 0,
        explain: 'The body looks like a Java Map toString. The Content-Type header is present but only labels the body.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Roll back, or hotfix by restoring %dw 2.0 and output application/json, then replay the failed shipments',
          'Remove the Content-Type header',
          'Ask the carrier to accept Java maps',
          'Wrap the payload with write(payload) in a logger',
        ],
        answer: 0,
        explain: 'Restore the output type and recover the shipments that failed. Removing the header changes nothing about the body format.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in **prevention**?',
        options: [
          'MUnit test asserting payload.^mimeType is application/json before the HTTP call',
          'Review checklist: every transform producing a wire format declares output',
          'Contract tests against a mock of the carrier API in CI',
          'Trust the Studio preview',
        ],
        answer: [0, 1, 2],
        explain: 'The Studio preview hid the problem; automated tests on the outbound format catch it.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Notice the Java-style body in the debug log',
          'Compare the transform with the previous version and spot the missing header',
          'Roll back or restore output application/json',
          'Replay the failed shipments',
          'Add an MUnit MIME-type assertion',
        ],
        explain: 'Read the evidence, find the change, restore, recover data, then prevent regressions.',
      },
    ],
  },
  description: `
## Symptoms
- \`shipment-papi\` reads shipment events with a **Database Select** (the rows are Java objects) and forwards them to the carrier's REST API.
- Since this morning's deployment, **every** call to the carrier fails with **HTTP 400 "Malformed JSON"**.
- In the Mule logs, the payload sent looks like \`{trackingId=TRK-881, weight=2.4, ...}\` instead of JSON.
- Nothing changed on the carrier side.

## Change / Context
- A developer "cleaned up" the Transform Message that builds the carrier request. The old script started with \`%dw 2.0\` and \`output application/json\`. The new script has the header removed and only the body mapping left, because "Studio still showed the preview fine".
- The HTTP Request sets header \`Content-Type: application/json\` explicitly.

## Logs
\`\`\`
10:14:02.331 INFO  [shipment-papi] Sending shipment to carrier corrId=51ac
10:14:02.332 DEBUG [shipment-papi] Request body: {trackingId=TRK-881, weight=2.4, service=EXPRESS}
10:14:02.701 ERROR [shipment-papi] HTTP:BAD_REQUEST HTTP POST on resource 'https://api.carrier.example/v2/shipments' failed: bad request (400). corrId=51ac
10:14:02.702 ERROR [shipment-papi] Response: {"error":"Malformed JSON at position 1"}
\`\`\`

## Your tasks
1. Why is the body no longer JSON?
2. How do you restore service quickly?
3. What is the correct fix?
4. How do you stop this happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Without an output directive, DataWeave derives the output from the script inputs: the input here is Java rows, so the payload is a Java Map, not JSON text.',
    'Setting a Content-Type header does not convert the payload; it only labels it — the body is still a Java object, not JSON.',
    'Immediate: roll back or hotfix the script by restoring output application/json.',
    'Permanent fix: always declare %dw 2.0 and an explicit output MIME type in transforms that produce wire formats.',
    'Prevention: MUnit test asserting the outbound body is valid JSON and the MIME type of the payload, plus code review checklist.',
  ],
  solution: `
## Diagnosis
The Transform Message no longer declares an output type. When no \`output\` directive is present, DataWeave derives the output from the script inputs. The only input here is Java rows from the Database Select, so the result is **\`application/java\`**: a Java Map, shown in the log as \`{trackingId=TRK-881, ...}\`. The HTTP Request then writes that object out, and what reaches the carrier is not JSON. The explicit \`Content-Type: application/json\` header only *labels* the body; it does not transform it.

## Immediate mitigation
Roll back to the previous version (fastest), or ship a one-line hotfix restoring the header. Replay the failed shipments (from logs/DLQ/source system) once fixed.

## Root cause
A refactor removed the DataWeave header, changing the output MIME type from JSON to Java. Studio's preview hid the problem, and no test checked the format of the outbound body.

## Permanent fix
\`\`\`
%dw 2.0
output application/json
---
{ trackingId: payload.id, weight: payload.weightKg, service: payload.service }
\`\`\`
Remove the hard-coded Content-Type header so the HTTP connector uses the payload's real MIME type (or keep it, now that it is truthful).

## Prevention
- MUnit test that asserts \`payload.^mimeType\` is \`application/json\` before the HTTP call and that the body parses as JSON.
- Review checklist: every transform that produces a wire format declares \`output\`.
- Contract tests against a mock of the carrier API in CI.
`,
  followUps: [
    { q: 'What is the default output of a DataWeave script without an output directive?', a: 'The docs describe an algorithm over the inputs the script uses: no inputs gives application/java, inputs that all share one MIME type give that type, and differing types raise an exception. Because the result depends on the inputs, it is safer to always be explicit.' },
    { q: 'How can you check the MIME type of the payload at runtime?', a: 'Log or assert payload.^mimeType (or attributes/headers for inbound data) — the ^mimeType metadata selector shows how Mule thinks the value is encoded.' },
    { q: 'Why did the Studio preview look fine?', a: 'The preview renders the result in a readable structure regardless of format, so a Java object and JSON can look similar; it does not show the bytes the connector will send.' },
  ],
}
