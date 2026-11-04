export default {
  id: 'inc-047',
  category: 'incidents',
  title: 'Mobile App Shows "Something Went Wrong" for Orders That Simply Do Not Exist',
  level: 'BEGINNER',
  tags: ['api-led', 'error-handling', 'error-mapping', 'http-status-codes', 'layers'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '10:14:02.118 INFO  [exp-mobile-api] GET /api/orders/SO-99812 corrId=7c1e-44a0', relevant: false },
      { text: '10:14:02.131 INFO  [prc-order-api]  GET /api/orders/SO-99812 corrId=7c1e-44a0', relevant: false },
      { text: '10:14:02.164 INFO  [sys-sap-api]    SAP BAPI lookup orderId=SO-99812 -> 0 rows corrId=7c1e-44a0', relevant: false },
      { text: '10:14:02.166 WARN  [sys-sap-api]    Returning 404 ORDER_NOT_FOUND corrId=7c1e-44a0', relevant: true, why: 'The System API behaves correctly: the order does not exist and it says so with a 404.' },
      { text: "10:14:02.171 ERROR [prc-order-api]  HTTP:NOT_FOUND HTTP GET on resource 'https://sys-sap-api.internal/api/orders/SO-99812' failed: not found (404). corrId=7c1e-44a0", relevant: true, why: 'The HTTP requester turns the 404 response into an HTTP:NOT_FOUND error in the Process API.' },
      { text: '10:14:02.172 ERROR [prc-order-api]  Global handler: returning 500 {"message":"Internal error"} corrId=7c1e-44a0', relevant: true, why: 'This is where it breaks: the catch-all ANY handler converts a client error (404) into a server error (500).' },
      { text: "10:14:02.180 ERROR [exp-mobile-api] HTTP:INTERNAL_SERVER_ERROR HTTP GET on resource 'https://prc-order-api.internal/api/orders/SO-99812' failed: internal server error (500). corrId=7c1e-44a0", relevant: false },
      { text: '10:14:02.181 ERROR [exp-mobile-api] Global handler: returning 500 {"message":"Internal error"} corrId=7c1e-44a0', relevant: true, why: 'The Experience API repeats the same catch-all, so the app shows "Something went wrong" and the 5xx alert fires.' },
      { text: '10:14:03.004 INFO  [exp-mobile-api] GET /api/orders/SO-99790 200 corrId=81aa-0c13', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'In which layer does the 404 first become a 500?',
        options: [
          'prc-order-api: its catch-all on-error-propagate type="ANY" returns 500 for HTTP:NOT_FOUND',
          'sys-sap-api: it should return 200 with an empty body',
          'exp-mobile-api: it is the first layer to see the error',
          'SAP: the BAPI raises an exception',
        ],
        answer: 0,
        explain: 'sys-sap-api returns a correct 404. The Process API is the first hop that loses the meaning; the Experience API then repeats the mistake.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Make sys-sap-api return 200 with an empty order so nobody raises an error',
          'Hotfix prc-order-api and exp-mobile-api with an HTTP:NOT_FOUND handler (before ANY) returning 404 with a clear body; tune the alert and brief support meanwhile',
          'Disable the 5xx alert permanently',
          'Restart all three apps',
        ],
        answer: 1,
        explain: 'Fix the mapping where the meaning is lost; until then avoid paging on-call for client errors. Hiding a 404 as 200 would break the contract.',
      },
      {
        type: 'match',
        prompt: 'Match what the Process API receives from the System API to what it should return.',
        pairs: [
          ['404 order not found', '404 (business: order not found)'],
          ['401/403 (our credentials are wrong)', '500/502: not the caller\'s fault'],
          ['Timeout or 503', '503 or 504'],
        ],
        explain: 'Each layer translates errors into what its own consumer can act on, rather than passing everything through or collapsing it into 500.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Specific handlers per error type, with type="ANY" only as the last fallback',
          'One standard error body (code, message, correlationId) across all layers',
          'Shared error-handling template, RAML documents 404/400/503, MUnit tests mocking a 404 and 503 from the SAPI',
          'Return 500 for every error so monitoring catches everything',
        ],
        answer: [0, 1, 2],
        explain: 'Deliberate mapping, a common error contract and tests. If every client mistake becomes 500, the 5xx rate stops meaning anything.',
      },
    ],
  },
  description: `
## Symptoms
- The mobile app calls \`GET /orders/{orderId}\` on \`exp-mobile-api\`. When a customer types a wrong order number, the app shows a red **"Something went wrong, try again later"** banner instead of "Order not found".
- The support desk is flooded with tickets; the API dashboard shows a spike of **500** responses on \`exp-mobile-api\`, which triggered a P2 alert for the on-call engineer.
- \`sys-sap-api\` metrics look healthy: no 5xx at all, but a matching number of **404** responses.

## Change / Context
- Chain: \`exp-mobile-api\` → \`prc-order-api\` → \`sys-sap-api\` → SAP.
- \`sys-sap-api\` correctly returns **404** with a JSON error body when SAP has no such order.
- \`prc-order-api\` has a single global \`on-error-propagate type="ANY"\` that sets status **500** and body \`{ "message": "Internal error" }\`.
- \`exp-mobile-api\` has the same copy-pasted global error handler. Nobody has changed these handlers since go-live; the volume of wrong order numbers grew after a new "track my order" screen launched.

## Logs
\`\`\`
10:14:02.118 INFO  [exp-mobile-api] GET /api/orders/SO-99812 corrId=7c1e-44a0
10:14:02.131 INFO  [prc-order-api]  GET /api/orders/SO-99812 corrId=7c1e-44a0
10:14:02.164 INFO  [sys-sap-api]    SAP BAPI lookup orderId=SO-99812 -> 0 rows corrId=7c1e-44a0
10:14:02.166 WARN  [sys-sap-api]    Returning 404 ORDER_NOT_FOUND corrId=7c1e-44a0
10:14:02.171 ERROR [prc-order-api]  HTTP:NOT_FOUND HTTP GET on resource 'https://sys-sap-api.internal/api/orders/SO-99812' failed: not found (404). corrId=7c1e-44a0
10:14:02.172 ERROR [prc-order-api]  Global handler: returning 500 {"message":"Internal error"} corrId=7c1e-44a0
10:14:02.180 ERROR [exp-mobile-api] HTTP:INTERNAL_SERVER_ERROR HTTP GET on resource 'https://prc-order-api.internal/api/orders/SO-99812' failed: internal server error (500). corrId=7c1e-44a0
10:14:02.181 ERROR [exp-mobile-api] Global handler: returning 500 {"message":"Internal error"} corrId=7c1e-44a0
\`\`\`

## Your tasks
1. Explain how a "not found" became a 500 at the top of the chain.
2. What do you do right now to calm the alerts and help support?
3. What is the root cause?
4. How should errors be propagated and mapped across System, Process and Experience layers?
5. How do you prevent this in future APIs?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Reads the logs top-down by correlation ID: the System API returns a correct 404, the HTTP requester in prc-order-api raises HTTP:NOT_FOUND, and a catch-all handler turns it into 500; the Experience API repeats the same mistake.',
    'Distinguishes client errors (4xx: caller can fix it) from server errors (5xx: we must fix it) and explains why turning a 404 into a 500 causes false alerts and a wrong user message.',
    'Immediate: deploy a small handler fix in prc-order-api and exp-mobile-api for HTTP:NOT_FOUND → 404, and tune the alert so the team is not paged for client errors meanwhile.',
    'Permanent fix: each layer maps errors deliberately — specific on-error handlers per error type (HTTP:NOT_FOUND, HTTP:BAD_REQUEST, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE), a consistent error body, and translation into the meaning that layer\'s consumer needs.',
    'Prevention: a shared error-handling library or template, RAML error responses documented per resource, and tests that assert status codes for "not found" and "backend down" cases.',
  ],
  solution: `
**Diagnosis.** Follow correlation ID \`7c1e-44a0\` through the three apps:

\`\`\`
SAP: 0 rows
  -> sys-sap-api      404 ORDER_NOT_FOUND          (correct)
  -> prc-order-api    HTTP:NOT_FOUND raised by the HTTP requester
                      caught by on-error-propagate type="ANY" -> 500 (wrong)
  -> exp-mobile-api   HTTP:INTERNAL_SERVER_ERROR
                      caught by on-error-propagate type="ANY" -> 500 (wrong)
  -> mobile app       "Something went wrong"
\`\`\`

In Mule 4 the HTTP requester's default validator treats any response with a status of 400 or above as an error, so a 404 from the System API becomes an \`HTTP:NOT_FOUND\` error in the Process API. The catch-all handler throws away that information and reports 500. Each layer only sees the previous layer's response, so the meaning is lost after one hop.

**Immediate mitigation.**
- Hotfix \`prc-order-api\`: add an \`on-error-propagate type="HTTP:NOT_FOUND"\` *before* the ANY handler that returns 404 with a clear body (e.g. \`{ "code": "ORDER_NOT_FOUND", "message": "Order SO-99812 not found" }\`). Do the same in \`exp-mobile-api\` and have the app show "Order not found".
- Until deployed, adjust the alert so the on-call is not paged for this pattern, and give support a known-issue note.

**Root cause.** Error handling was copy-pasted as a single catch-all in every layer. Nobody designed how errors should travel through an API-led chain, so a **client error was reported as a server error**.

**Permanent fix — map errors per layer.**

| From lower layer | Process API returns | Experience API returns |
|---|---|---|
| 404 not found | 404 (business: order not found) | 404 + user-friendly message/code for the app |
| 400 bad request | 400 if caused by caller input, otherwise 500 (our bug) | 400 with field errors |
| 401/403 from SAPI | 500/502 (our credentials are wrong — not the user's fault) | 502/503 generic |
| timeout / 503 | 503 or 504 | 503 + "try again later" |

- Use specific \`on-error-propagate\` / \`on-error-continue\` handlers per error type, with \`type="ANY"\` only as the last fallback.
- Use one **standard error body** (code, message, correlationId) across all APIs so each layer can read the lower layer's error.
- Optionally configure the requester's response validator (\`http:success-status-code-validator\`) where a 4xx is an expected business outcome.

**Prevention.** Shared error-handling module/template published in Exchange; RAML/OAS documents 404/400/503 responses for each resource; MUnit tests that mock the System API returning 404 and 503 and assert the Process/Experience status codes; alert on 5xx only, and track 4xx separately as a product signal.
`,
  followUps: [
    { q: 'Should the Process API just pass through whatever status the System API returned?', a: 'Not blindly. A 404 for "order not found" can pass through, but a 401 from the System API means the Process API\'s own credentials are wrong — returning 401 to the end user would be misleading. Each layer translates errors into what its consumer can act on.' },
    { q: 'What is the difference between on-error-propagate and on-error-continue here?', a: 'on-error-propagate rethrows the error so the HTTP listener returns an error response (status from the handler), while on-error-continue treats the flow as successful and returns the payload set in the handler. Both can set a 404 status; propagate is typical for genuine error responses.' },
    { q: 'Why does it matter for alerting?', a: 'If every client mistake becomes a 500, the 5xx rate stops meaning "we have a problem", on-call gets paged for nothing, and real outages are harder to spot.' },
  ],
}
