export default {
  id: 'inc-014',
  category: 'incidents',
  title: 'Calls to a Partner API Fail an Hour After Every Restart',
  level: 'INTERMEDIATE',
  tags: ['oauth2', 'tokens', 'caching', 'object-store', 'http'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '09:58:40.002 INFO  [shipping] Token cache miss, fetched new carrier token (expires_in=3600) stored with entryTtl=24h', relevant: true, why: 'The token lives 3600 s at the carrier but the cache keeps it for 24 hours.' },
      { text: '10:02:15.100 INFO  [shipping] Token cache hit for carrierToken corrId=1d0a', relevant: false },
      { text: '10:02:15.488 INFO  [shipping] POST /shipments -> 201 corrId=1d0a', relevant: false },
      { text: '10:30:00.004 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '11:04:52.731 INFO  [shipping] Token cache hit for carrierToken corrId=77f3', relevant: true, why: 'More than an hour after the fetch the flow still finds and uses the cached token.' },
      { text: '11:04:52.966 ERROR [shipping] HTTP:UNAUTHORIZED POST https://api.carrier.example.com/v2/shipments failed: unauthorized (401) corrId=77f3', relevant: true, why: 'The carrier rejects the request, and there is no 401 handling to refresh the token.' },
      { text: '  WWW-Authenticate: Bearer error="invalid_token", error_description="token expired"', relevant: true, why: 'The carrier says exactly why: the token has expired.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The token is cached for 24 h while it expires after 3600 s, and nothing refreshes it on 401',
          'The carrier revokes our client credentials every hour',
          'The Object Store loses entries after an hour',
          'The carrier rate-limits us after an hour of traffic',
        ],
        answer: 0,
        explain: 'The cache TTL ignores expires_in. After 60 minutes the cache returns an expired token until the entry expires 24 h later, or a restart clears the in-memory store.',
      },
      {
        type: 'single',
        prompt: 'What is the best quick fix while the full fix is built?',
        options: [
          'Keep restarting daily',
          'Clear the cached token, set entryTtl to about 50 minutes, redeploy and replay the failed shipments',
          'Fetch a new token on every call forever',
          'Retry every 401 until it succeeds',
        ],
        answer: 1,
        explain: 'A TTL below the token lifetime stops the problem coming back. Retrying with the same expired token never succeeds.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Use the HTTP Request OAuth client-credentials support, e.g. refreshTokenWhen on a 401 status',
          'If custom: TTL of expires_in minus a margin, and on 401 remove the token, fetch a new one and retry once',
          'Protect the token endpoint from many concurrent refreshes',
          'Raise the cache TTL to 7 days',
        ],
        answer: [0, 1, 2],
        explain: 'Let the platform manage tokens, or make custom caching follow the real expiry with a single refresh-and-retry. A longer TTL makes it worse.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Read the invalid_token / token expired error and compare cache TTL with expires_in',
          'Clear the cached token to restore calls',
          'Set entryTtl below the token lifetime and redeploy',
          'Replay shipments that failed with 401',
          'Move to the OAuth module with refresh on 401 and add 401-rate alerts',
        ],
        explain: 'Diagnose, restore, stop recurrence, recover data, then fix properly and monitor.',
      },
    ],
  },
  description: `
## Symptoms
- \`shipping-sapi\` calls a carrier's REST API protected by **OAuth 2.0 client credentials**.
- After every deployment or restart, calls work for about **60 minutes**, then every call fails with **401** until the next day (or until someone restarts the app). Ops have been "fixing" it with a daily restart.
- The carrier's token response looks like \`{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }\`.

## Change / Context
- A developer implemented token handling by hand to "avoid fetching a token on every call":
  - flow \`getToken\`: \`os:retrieve\` key \`carrierToken\` from object store \`tokenStore\`; if missing, call the token endpoint and \`os:store\` the token.
  - \`tokenStore\` is configured with \`persistent="false"\`, \`entryTtl="24"\` / \`entryTtlUnit="HOURS"\`.
- The request to the carrier sets \`Authorization: Bearer <token>\` from the stored value. There is no special handling of 401.

## Logs
\`\`\`
10:02:15.100 INFO  [shipping] Token cache hit for carrierToken corrId=1d0a
10:02:15.488 INFO  [shipping] POST /shipments -> 201 corrId=1d0a
11:04:52.731 INFO  [shipping] Token cache hit for carrierToken corrId=77f3
11:04:52.966 ERROR [shipping] HTTP:UNAUTHORIZED HTTP POST on resource
  'https://api.carrier.example.com/v2/shipments' failed: unauthorized (401). corrId=77f3
  WWW-Authenticate: Bearer error="invalid_token", error_description="token expired"
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'Identifies the TTL mismatch: the token expires after 3600 s but is cached for 24 h, so the app keeps sending an expired token ("Token cache hit" followed by 401 invalid_token/expired).',
    'Explains why a restart "fixes" it: an in-memory store is cleared on restart, so a fresh token is fetched (a persistent store would not even be cleared by a restart).',
    'Immediate: clear the cached token (or restart) and reduce the TTL to below expires_in as a quick config change.',
    'Permanent fix: cache with TTL derived from expires_in minus a safety margin, and on a 401 invalidate the token, fetch a new one and retry once.',
    'Mentions the alternative of using the HTTP requester\'s built-in OAuth client-credentials authentication (OAuth module), which manages and refreshes tokens, e.g. with a refreshTokenWhen condition on 401.',
  ],
  solution: `
**Diagnosis.** The carrier issues tokens valid for **3600 s**, but \`tokenStore\` keeps them for **24 h**. After an hour the cached token is expired; the flow still finds it ("Token cache hit"), sends it, and gets **401 \`invalid_token\` / token expired**. Nothing ever removes the bad token, so every call fails until the entry expires 24 h later — or until a restart clears the (in-memory) store and a fresh token is fetched. That's why the daily restart "worked".

**Immediate mitigation.** Remove the cached entry (e.g. a small admin flow calling \`os:remove\`, or restart the app) to get a fresh token. As a quick fix, change \`entryTtl\` to e.g. **50 minutes** and redeploy so the problem can't recur while the full fix is built. Replay shipments that failed with 401.

**Root cause.** Custom token caching with a **fixed TTL that ignores \`expires_in\`**, and no recovery path when the token is rejected.

**Permanent fix.**
- Prefer the platform feature: configure the HTTP Request config with **OAuth client-credentials** authentication (OAuth module). It obtains and stores the token and can refresh it, e.g. \`refreshTokenWhen="#[attributes.statusCode == 401]"\`.
- If keeping custom code: store the token with a TTL of \`expires_in - 60 s\` (or store the expiry time with it and check before use), and on **401** remove the token, fetch a new one, and **retry once** (not forever).
- Fetch the token in one place and protect against many concurrent refreshes (a thundering herd on the token endpoint).

**Prevention.** Review rule: "every cached credential must expire before the real one"; a test that simulates an expired token (mock returns 401 → expect refresh + retry); alerts on 401 rate per outbound system, which would have fired an hour after the first deployment.
`,
  followUps: [
    { q: 'Why might the token expire earlier than expires_in says?', a: 'The provider can revoke tokens (key rotation, password change, logout) and clocks/latency shave off seconds. That is why you also need reactive refresh on 401, not just a TTL.' },
    { q: 'What changes if the object store is persistent or shared across replicas?', a: 'A restart no longer clears it, so the "restart fix" stops working; on the plus side all replicas share one token and fetch fewer. Refresh logic must then handle several replicas detecting expiry at the same time.' },
    { q: 'How would you have detected this earlier?', a: 'An integration test running longer than the token lifetime, or simply alerting on 401s from the carrier — the pattern "fails exactly 60 minutes after deploy" points straight at token lifetime.' },
  ],
}
