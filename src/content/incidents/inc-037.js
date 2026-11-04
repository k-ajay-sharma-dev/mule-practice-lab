export default {
  id: 'inc-037',
  category: 'incidents',
  title: 'Tokens Still Issued but Every Call Returns 403 insufficient_scope',
  level: 'INTERMEDIATE',
  tags: ['oauth2', 'scopes', 'identity-provider', 'security', 'http'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '08:55:02.410 INFO  [invoice-papi] Token obtained for client invoice-papi-prod expires_in=3600 scope="finance.all"', relevant: false },
      { text: '08:55:02.700 INFO  [invoice-papi] POST /api/invoices 201 invoiceId=INV-30112 corrId=0a11', relevant: false },
      { text: '09:00:14.022 INFO  [invoice-papi] Token obtained for client invoice-papi-prod expires_in=3600 scope=""', relevant: true, why: 'The token is issued but with no scopes: the IdP silently dropped finance.all, which was removed from the client.' },
      { text: '09:00:14.310 ERROR [invoice-papi] HTTP:FORBIDDEN HTTP POST on resource \'https://finance.corp/api/invoices\' failed: forbidden (403). WWW-Authenticate: Bearer error="insufficient_scope" corrId=0d9e', relevant: true, why: '403 insufficient_scope: authenticated, but the token lacks the permission the endpoint now requires.' },
      { text: '09:00:14.311 ERROR [invoice-papi] Retrying (1/5) ...', relevant: true, why: 'Retrying a 403 cannot succeed and only adds load; 403 should be non-retryable.' },
      { text: '09:00:30.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '09:01:00.100 INFO  [invoice-papi] GET /api/invoices/INV-30112/status served from cache', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'IAM removed `finance.all`; the IdP drops it from the request, so the token has no scopes and the API needs `finance.invoices.write`',
          'The client secret expired, so the token is invalid',
          'The finance API is down',
          'The token is cached past its expiry',
        ],
        answer: 0,
        explain: 'A **401** would mean an invalid token. **403 insufficient_scope** with `scope=""` means the token is valid but carries no permissions.',
      },
      {
        type: 'single',
        prompt: 'How do you restore service?',
        options: [
          'Increase the retry count to 20',
          'IAM grants `finance.invoices.write` to the client, update the scope property, clear the token cache and replay failed invoices',
          'Rotate the client secret',
          'Switch to the password grant type',
        ],
        answer: 1,
        explain: 'Grant and request the right scope, force a new token, then replay what failed since 09:00.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Request least-privilege scopes explicitly per operation',
          'Treat 403 as non-retryable and send failures to a replay queue',
          'Log granted scopes on token refresh (never the token) and alert on 401/403 rates',
          'Log the full access token so support can decode it',
        ],
        answer: [0, 1, 2],
        explain: 'Specific scopes, no retry storms and visibility of what was granted. Tokens are secrets and must not be logged.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Notice token calls succeed but the granted scope is empty',
          'Confirm with IAM what changed and which scope the API now requires',
          'Get the scope granted and update the requested scope property',
          'Clear the token cache and replay failed invoices',
          'Make 403 non-retryable and add IdP changes to consumer impact review',
        ],
        explain: 'Diagnose, confirm, fix the authorisation, recover data, then harden.',
      },
    ],
  },
  description: `
## Symptoms
- \`invoice-papi\` calls the finance platform's API using **OAuth 2.0 client credentials** against the corporate identity provider.
- Since 09:00 every call fails with **HTTP 403**. Token requests still succeed (200, token returned).
- No deployment on the Mule side for two weeks.

## Change / Context
- The IAM team "tightened permissions" this morning: the finance API now requires scope \`finance.invoices.write\` for POST and the old broad scope \`finance.all\` was removed from client registrations.
- Our token request sends \`scope=finance.all\` (value in a property). The identity provider silently drops scopes the client is not allowed to have.

## Logs
\`\`\`
09:00:14.022 INFO  [invoice-papi] Token obtained for client invoice-papi-prod expires_in=3600 scope=""
09:00:14.310 ERROR [invoice-papi] HTTP:FORBIDDEN HTTP POST on resource 'https://finance.corp/api/invoices' failed: forbidden (403).
  WWW-Authenticate: Bearer error="insufficient_scope" corrId=0d9e
09:00:14.311 ERROR [invoice-papi] Retrying (1/5) ...
\`\`\`

## Your tasks
1. What is the root cause?
2. How do you restore service?
3. What should be changed permanently?
4. What would have caught this earlier?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    '401 = not authenticated (bad/expired token); 403 insufficient_scope = token valid but lacks the required permission.',
    'The token response scope is empty because the IdP dropped the removed scope — token issuance still "succeeds".',
    'Immediate: have IAM grant finance.invoices.write to the client and update the requested scope property; evict cached tokens.',
    'Do not retry 403s — they will not succeed and add load; route to error handling / replay later.',
    'Prevention: IdP changes go through consumer impact review; monitor 403 rate and log granted scopes.',
  ],
  solution: `
## Diagnosis
The token call works, but the token comes back with **no scopes** (\`scope=""\`) because \`finance.all\` was removed from the client and the IdP drops scopes the client isn't allowed. The finance API then says **403 insufficient_scope**: we are authenticated, just not authorised. Nothing in Mule changed; the contract with the IdP did.

## Immediate mitigation
Ask IAM to grant \`finance.invoices.write\` (and any read scopes needed) to \`invoice-papi-prod\`; change the scope property to request it; restart or clear the token cache so a new token is fetched. Replay invoices that failed since 09:00.

## Root cause
A permission model change at the identity provider without coordination with API consumers, and a client that requested a broad scope rather than the specific ones it needs.

## Permanent fix
- Request least-privilege scopes explicitly per operation.
- Treat 403 as non-retryable in the error handler (no retry storm) and send failed invoices to a replay queue.
- Log the granted scopes on token refresh (not the token itself) to make this visible.

## Prevention
- IAM change process includes notifying registered clients and a test in non-prod.
- Alert on 401/403 rates per downstream; synthetic transaction against the finance API after IdP changes.
`,
  followUps: [
    { q: 'What is the difference between 401 and 403?', a: '401 means the caller is not authenticated (missing/invalid/expired credentials); 403 means it is authenticated but not allowed to do this operation.' },
    { q: 'Why would refreshing the token not fix it by itself?', a: 'A new token from the same client registration still lacks the scope; the client permissions at the IdP must change first.' },
  ],
}
