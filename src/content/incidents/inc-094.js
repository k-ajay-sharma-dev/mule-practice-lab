export default {
  id: 'inc-094',
  category: 'incidents',
  title: 'Every 403 from a Partner API Triggers a Token Refresh and the Token Endpoint Starts Throttling',
  level: 'ADVANCED',
  tags: ['security', 'oauth2', 'oauth-module', 'http-request', 'client-credentials', 'rate-limiting'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '08:00:02 INFO  [eligibility] POST /benefits/check member=M-2210 -> 200 (118 ms)', relevant: false },
      { text: '08:00:03 INFO  [eligibility] POST /benefits/check member=M-7741 -> 403 {"error":"member_not_covered"}', relevant: true, why: 'The 403 is a business answer about this member. The token itself is fine.' },
      { text: '08:00:03 DEBUG [org.mule.extension.oauth2] token request to https://auth.healthpartner.example/oauth/token', relevant: true, why: 'A new token is requested straight after the 403, which is what Refresh Token When does by default.' },
      { text: '08:00:04 INFO  [eligibility] retry POST /benefits/check member=M-7741 -> 403 {"error":"member_not_covered"}', relevant: true, why: 'The call is retried with the new token and gets the same answer, so the refresh gained nothing.' },
      { text: '08:30:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '09:14:37 WARN  [org.mule.extension.oauth2] token request failed: 429 Too Many Requests', relevant: true, why: 'The token endpoint is now throttling the client. From here, normal calls are affected too.' },
      { text: '09:14:37 ERROR [eligibility] HTTP:SECURITY failure during OAuth token retrieval', relevant: true, why: 'Requests fail with a security error because no token can be obtained. This is the outage that users see.' },
      { text: '09:15:02 INFO  [runtime] eligibility: 2 replicas RUNNING, CPU 21%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The default Refresh Token When expression treats 401 **and 403** as an expired token, so each business 403 requests a new token and retries the call',
          'The partner shortened the token lifetime',
          'The client secret was rotated',
          'The Object Store for tokens is full',
        ],
        answer: 0,
        explain: 'The default is `#[attributes.statusCode == 401 or attributes.statusCode == 403]`. This partner uses 403 for "member not covered", so normal traffic drives token requests.',
      },
      {
        type: 'single',
        prompt: 'What is the right permanent configuration?',
        options: [
          'Set **Refresh Token When** to match only the responses that mean an expired token, here `#[attributes.statusCode == 401]`',
          'Set it to `#[true]`',
          'Remove the token manager',
          'Add an Until Successful around the HTTP Request',
        ],
        answer: 0,
        explain: 'The expression exists for this reason. Check how the partner signals an expired token first, then match only that. Retrying would make the problem worse.',
      },
      {
        type: 'multi',
        prompt: 'Which should you also do?',
        options: [
          'Handle HTTP:FORBIDDEN in the flow, and map `member_not_covered` to a business response',
          'Alert on the number of token requests, not only on API errors',
          'Ask the partner what limits apply to its token endpoint',
          'Log the access token so that support can compare values',
        ],
        answer: [0, 1, 2],
        explain: 'Never log tokens. A 403 from HTTP Request is raised as HTTP:FORBIDDEN unless the response validator is changed, so it needs handling after this fix too.',
      },
      {
        type: 'single',
        prompt: 'Which `oauth` operation clears the stored token for a token manager if you suspect a bad token in production?',
        options: ['Invalidate Oauth Context', 'Retrieve Access Token', 'Retrieve Expires In', 'Retrieve State'],
        answer: 0,
        explain: 'Invalidate Oauth Context clears the OAuth context for a token manager. The Retrieve operations only read values.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery steps.',
        items: [
          'Confirm that token requests follow 403 responses one for one',
          'Reduce call volume, for example by pausing the batch, so the token endpoint stops throttling',
          'Deploy the corrected Refresh Token When expression',
          'Confirm that token requests fall to the normal rate',
          'Resume the batch and add the token request alert',
        ],
        explain: 'While the token endpoint throttles, even valid calls fail, so reduce the load first and then deploy the real fix.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 09:15: the **Eligibility API** returns 500 for every check, including members who were fine at 08:00.
- The partner reports that our client has made **38,000 token requests** this morning, when one per hour would be expected.

## Change / Context
- \`eligibility\` calls a health insurer's API with an **HTTP Request** configured with the **OAuth Module** Client Credentials grant.
- The partner issues tokens valid for 60 minutes.
- A new batch started on Monday at 08:00 and checks 200,000 members.
- For a member who is not covered, the partner answers **403** with \`{"error":"member_not_covered"}\`. About 20% of members in this batch are not covered.
- The grant type uses default values.

## Logs
\`\`\`
08:00:03 INFO  [eligibility] POST /benefits/check member=M-7741 -> 403 {"error":"member_not_covered"}
08:00:03 DEBUG [org.mule.extension.oauth2] token request to https://auth.healthpartner.example/oauth/token
08:00:04 INFO  [eligibility] retry POST /benefits/check member=M-7741 -> 403 {"error":"member_not_covered"}
09:14:37 WARN  [org.mule.extension.oauth2] token request failed: 429 Too Many Requests
09:14:37 ERROR [eligibility] HTTP:SECURITY failure during OAuth token retrieval
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
    'Refresh Token When defaults to #[attributes.statusCode == 401 or attributes.statusCode == 403].',
    'If it evaluates to true, Mule treats the token as expired, refreshes it and retries the call with a new token.',
    'When a partner uses 403 as a business answer, each such response drives a token request and a repeated call. The docs do not state how many retries can follow.',
    'Fix the expression to match only real token expiry for this partner.',
    'With DEBUG on org.mule.extension.oauth2, the OAuth Module log shows the token calls. Turn it off after troubleshooting.',
    'Handle HTTP:FORBIDDEN as a business outcome.',
    'Alert on token request volume.',
  ],
  solution: `
**Diagnosis.** The log shows a repeating pattern: 403, token request, same call again, 403. Twenty percent of 200,000 members is 40,000, close to the 38,000 token requests the partner reports. Once the token endpoint started throttling, no fresh token could be obtained, so all calls failed. The 403 is not an authentication problem at all.

**Immediate mitigation.**
- Pause the batch or reduce its concurrency, so that the token endpoint stops throttling.
- Ask the partner to lift the throttle if it does not clear on its own.
- Deploy the configuration fix below.

**Root cause.** The OAuth Module default for **Refresh Token When** is \`#[attributes.statusCode == 401 or attributes.statusCode == 403]\`. The docs say that if the expression returns true, the access token is treated as expired, Mule triggers a refresh and retries the API callback using a new access token. That default assumes a 403 may mean an expired token, and this partner uses 403 for a normal business result.

**Permanent fix.**
- Set **Refresh Token When** on the Client Credentials grant type to \`#[attributes.statusCode == 401]\`. If the partner signals expiry some other way, match that instead.
- Handle \`HTTP:FORBIDDEN\` in the flow. Inspect the error response body and turn \`member_not_covered\` into a normal "not eligible" result, not a 500.

**Prevention.**
- For each OAuth partner, record which response means an expired token, and test it.
- Add an alert on the rate of token requests. One per token lifetime per replica is normal.
- Load-test with realistic negative cases, not only happy paths.
- For troubleshooting, set \`org.mule.extension.oauth2\` to DEBUG, then turn it off, as it affects performance.
`,
  followUps: [
    {
      q: 'Where does Mule keep the token?',
      a: 'In the token manager. Token Manager Config has an Object Store field for the OAuth context data, so you can choose where it is stored.',
    },
    {
      q: 'How are the client ID and secret sent to the token endpoint?',
      a: 'Encode Client Credentials In Body decides. If true they go in the body, otherwise as basic authentication. Its default differs: false for Client Credentials and true for Authorization Code, so check what the provider expects.',
    },
    {
      q: 'How does this differ from building the token call yourself?',
      a: 'With the OAuth Module, Mule obtains, stores and refreshes the token for you, and you tune it with these parameters. In a hand-built flow you own the caching and the expiry logic.',
    },
  ],
}
