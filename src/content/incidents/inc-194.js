export default {
  id: 'inc-194',
  category: 'incidents',
  title: 'Customer Lookups by Phone Number Find Nobody: a Plus Sign in a Hand-Built Query String Becomes a Space',
  level: 'INTERMEDIATE',
  tags: ['http', 'url-encoding', 'query-parameters', 'crm'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-18 13:02:11 INFO  [contact-api] Lookup started channel=ivr', relevant: false },
      { text: '2026-11-18 13:02:11 DEBUG [contact-api] Calling CRM url=https://crm.internal.example/contacts?phone=+447700900123', relevant: true, why: 'The URL was built by joining strings, and the plus sign was not encoded.' },
      { text: '2026-11-18 13:02:12 DEBUG [crm-api] Search phone=" 447700900123" results=0', relevant: true, why: 'The CRM decoded the plus as a space, so it searched for the wrong value.' },
      { text: '2026-11-18 13:02:12 INFO  [contact-api] Lookup result found=false', relevant: true, why: 'Every caller is treated as unknown.' },
      { text: '2026-11-18 13:02:40 INFO  [contact-api] Lookup by customerId found=true', relevant: true, why: 'Lookups without special characters still work.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the CRM search for a space?',
        options: [
          'A plus in a query string is read as a space, and the hand-built URL did not encode it',
          'The CRM trims a leading plus from every search value and pads it with a space',
          'The IVR sends the number with a leading space, which the log does not show',
          'The HTTP Request encodes the plus twice, so the CRM decodes it to a space',
        ],
        answer: 0,
        explain: 'A plus must be sent as %2B to mean a plus. Building the URL with ++ skips that encoding.',
      },
      {
        type: 'single',
        prompt: 'What is the right way to send the phone number?',
        options: [
          'Set it in the query parameters of the HTTP Request, which encodes it',
          'Remove the plus sign before joining it into the URL string',
          'Wrap the number in double quotes inside the hand-built URL',
          'Replace the plus with `00` before joining it into the URL string',
        ],
        answer: 0,
        explain: 'Query parameters set on the request are encoded for you. Removing the plus or swapping it for `00` changes the value the CRM stores, and may match nobody or the wrong person. Quotes would only be sent as part of the value.',
      },
      {
        type: 'multi',
        prompt: 'Which other values can break a hand-built URL?',
        options: ['An ampersand in a company name', 'A space in a city name', 'A hash sign in an address line', 'A plain number such as 42'],
        answer: [0, 1, 2],
        explain: 'Characters with a meaning in URLs must be encoded. Plain digits and letters are safe.',
      },
      {
        type: 'single',
        prompt: 'Why did this start with the new IVR?',
        options: [
          'The IVR sends numbers with a plus, and the web form sent digits only',
          'The IVR calls a new CRM search endpoint that decodes differently',
          'The IVR go-live also replaced the flow that builds the CRM URL',
          'The IVR sends numbers longer than the CRM phone field allows',
        ],
        answer: 0,
        explain: 'The code was always wrong, but no input had a plus sign until the IVR went live.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm the encoded and decoded values in the logs',
          'Move the phone number into the request query parameters',
          'Search the code for other hand-built URLs',
          'Add tests with plus, ampersand and space in values',
          'Retest lookups from the IVR',
        ],
        explain: 'Prove it, fix it, find its siblings, add tests, then check the real channel.',
      },
    ],
  },
  description: `
## Symptoms
- Since the new phone system (IVR) went live, every caller is treated as unknown, so agents type details by hand.
- Lookups by customer ID still work.

## Change / Context
- The IVR sends phone numbers in international format, such as \`+447700900123\`. Before it, lookups came only from a web form that sent digits.
- The flow builds the CRM URL like this: \`"/contacts?phone=" ++ vars.phone\`.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 13:02:11 DEBUG [contact-api] Calling CRM url=https://crm.internal.example/contacts?phone=+447700900123
2026-11-18 13:02:12 DEBUG [crm-api] Search phone=" 447700900123" results=0
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
    'A plus in a query string is commonly read as a space.',
    'Hand-built URLs skip encoding.',
    'Set query parameters on the HTTP Request so they are encoded.',
    'Never strip the plus, as it changes the number.',
    'The bug was old. A new input exposed it.',
    'Test values with plus, ampersand, space and hash.',
  ],
  solution: `
**Diagnosis.** The flow joins strings to build the URL. The plus sign is not encoded, and the CRM reads it as a space, so the search value is wrong.

**Immediate mitigation.** Deploy a fix that sends the phone number through the HTTP Request query parameters.

**Root cause.** The URL was built by hand. Earlier inputs held only digits, so the missing encoding never showed.

**Permanent fix.** Use \`queryParams\` on the HTTP Request for every value, and keep the path fixed. Search the code for other URLs built with \`++\`.

**Prevention.** Tests with special characters in every parameter, and a review rule against building URLs by joining strings.
`,
  followUps: [
    { q: 'What does %2B mean?', a: 'It is the encoded form of a plus sign, so the server reads a real plus.' },
    { q: 'Could you encode by hand instead?', a: 'You could, but one missed character brings the bug back. Letting the connector encode query parameters is safer.' },
    { q: 'What about values in the path?', a: 'Use URI parameters on the request for path values, so they are encoded as well.' },
    { q: 'Should the CRM also store numbers in one format?', a: 'Yes. Agree one format, such as E.164, and normalise on the way in.' },
  ],
}
