export default {
  id: 'inc-312',
  category: 'incidents',
  title: "Uploading a 900 MB File to an API Times Out",
  level: 'BEGINNER',
  tags: ["myproject","large-files","http","upload"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [doc-push] POST /documents sizeBytes=900000000", relevant: true, why: "A very large request." },
      { text: "2026-11-18 03:01:00 ERROR [doc-push] HTTP:TIMEOUT responseTimeout=60000", relevant: true, why: "A one minute timeout." },
      { text: "2026-11-18 03:01:00 INFO  [api-gateway] Max request size 100 MB", relevant: true, why: "The gateway allows only 100 MB." },
      { text: "2026-11-18 03:01:01 INFO  [doc-push] Retry 1 of 3", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the upload fail?",
        options: [
          "The file is far above the gateway limit and the timeout is short",
          "The API is down",
          "Auth",
          "TLS",
        ],
        answer: 0,
        explain: "Size and time limits.",
      },
      {
        type: 'single',
        prompt: "What is a good design?",
        options: [
          "Upload to storage and send the API a reference, or use chunked uploads if the API supports them",
          "Raise every limit",
          "Retry more",
          "Email it",
        ],
        answer: 0,
        explain: "Do not push huge bodies through APIs.",
      },
      {
        type: 'multi',
        prompt: "What should change?",
        options: [
          "Stop retries that cannot succeed",
          "Agree a file transfer pattern with the API owner",
          "Stream the upload if the API allows",
          "Retry forever",
        ],
        answer: [0,1,2],
        explain: "Fix the design.",
      },
      {
        type: 'single',
        prompt: "What is the claim check pattern?",
        options: [
          "Store the large content and pass a reference",
          "Check the user",
          "Compress",
          "Split by hand",
        ],
        answer: 0,
        explain: "Small message, large content elsewhere.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop retries",
          "Upload to storage",
          "Send the reference",
          "Agree the pattern",
          "Update the flow",
        ],
        explain: "Stop, store, send, agree, change.",
      },
    ],
  },
  description: `
## Symptoms
- Large documents never reach the document API.

## Change / Context
- The flow posts files as the request body.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [doc-push] POST /documents sizeBytes=900000000
2026-11-18 03:01:00 ERROR [doc-push] HTTP:TIMEOUT responseTimeout=60000
2026-11-18 03:01:00 INFO  [api-gateway] Max request size 100 MB
\`\`\`

## Your tasks
1. What is the most likely root cause?
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
    "APIs and gateways limit body size.",
    "Timeouts suit small calls.",
    "Use storage and references.",
    "Or chunked uploads.",
    "Do not retry impossible calls.",
    "Agree patterns.",
  ],
  solution: `
**Diagnosis.** A 900 MB body exceeds the gateway limit and the timeout.

**Immediate mitigation.**
- Stop retries.

**Root cause.** Large files sent through an API body.

**Permanent fix.**
- Claim check with storage.

**Prevention.** Size limits in design.
`,
  followUps: [
    { q: "What is chunked upload?", a: "Sending a file in parts that the server joins." },
    { q: "Can Mule stream HTTP bodies?", a: "Yes, with streaming mode on the request." },
    { q: "Why stop retries?", a: "They waste time and load." },
    { q: "Who owns the gateway limit?", a: "The API platform team." },
  ],
}
