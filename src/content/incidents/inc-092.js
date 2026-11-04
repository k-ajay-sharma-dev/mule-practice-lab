export default {
  id: 'inc-092',
  category: 'incidents',
  title: 'A Revoked Partner Token Keeps Working Hours After the Identity Provider Killed It',
  level: 'ADVANCED',
  tags: ['security', 'oauth2', 'openid-connect', 'policies', 'api-manager', 'token-cache', 'revocation'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '09:58:12 INFO  [idp-audit] token revoked: client=partner-logix jti=8f21c reason=credential-leak actor=secops', relevant: true, why: 'The IdP revoked the token at 09:58, so from this point the IdP considers it dead.' },
      { text: '10:03:40 INFO  [gw-access] GET /api/v2/shipments 200 client=partner-logix jti=8f21c src=203.0.113.77', relevant: true, why: 'Five minutes after revocation the same token still succeeds through the gateway.' },
      { text: '10:03:41 INFO  [idp-audit] introspection requests from gateway-prod in last 10 min: 0 for jti=8f21c', relevant: true, why: 'The gateway did not ask the IdP about this token, so it was answered from the policy cache.' },
      { text: '10:05:00 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '10:11:16 INFO  [gw-access] GET /api/v2/orders 200 client=retail-web jti=c44d0', relevant: false },
      { text: '10:14:02 INFO  [idp-audit] token metadata: jti=8f21c issued=06:30 expires=18:30 (lifetime 12 h)', relevant: true, why: 'A 12-hour lifetime means the cached entry could stay valid until 18:30 if nothing changes.' },
      { text: '10:20:33 INFO  [agent] policies up to date for API 18244170', relevant: false },
      { text: '10:21:09 INFO  [gw-access] GET /api/v2/customers 200 client=partner-logix jti=8f21c src=203.0.113.77', relevant: true, why: 'The leaked token is still in active use from the same address, so this needs action now.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the revoked token still work?',
        options: [
          'After a token is validated, the policy caches it by default until it expires, so later requests are not validated against the IdP',
          'The OpenID Connect policy never checks tokens with the IdP',
          'The IdP revocation failed',
          'The gateway lost its connection to Anypoint Platform',
        ],
        answer: 0,
        explain: 'The Token Caching section of the policy page says this, and it names revoked tokens as a case where you might minimise or disable caching. The zero introspection count fits it.',
      },
      {
        type: 'single',
        prompt: 'What is the fastest documented way to stop this client application at the gateway while you work on the cache?',
        options: [
          'Revoke its contract in API Manager, which blocks the client application from accessing the API, and confirm with a test call that the leaked token is refused',
          'Change the token lifetime at the IdP, which fixes tokens already issued',
          'Delete the API instance',
          'Increase `anypoint.platform.openid_connect_cache_max_size`',
        ],
        answer: 0,
        explain: 'Revoking a contract blocks the client application, and it can be restored later. Verify it, because the docs do not say how quickly a contract change reaches a token that is already cached. An IP Blocklist policy on the abusing address can be added at the same time, as policy changes need no redeploy.',
      },
      {
        type: 'multi',
        prompt: 'Which are valid permanent changes?',
        options: [
          'Set `anypoint.platform.max_federation_expiration_time` so a token is rechecked after a short, agreed time',
          'Reduce access token lifetimes at the IdP',
          'Agree a maximum revocation delay with security, and test it',
          'Set the cache size property to 0 only if the IdP can handle one validation per request',
          'Tick Skip Client Id Validation so tokens are rechecked',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Skip Client Id Validation only removes the contract check, which weakens the policy and has nothing to do with the cache.',
      },
      {
        type: 'single',
        prompt: 'You set `anypoint.platform.max_federation_expiration_time=300`, and a token has 2 minutes left to live. How long can it be cached?',
        options: [
          'Until it expires: the setting caches a token for the given time or until it expires, whichever occurs first',
          'Five minutes, even after it expires',
          'It is not cached',
          'Twelve hours',
        ],
        answer: 0,
        explain: 'The docs say whichever occurs first. Also, if the validation endpoint sends no expiry information, tokens are not cached at all.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm from the access log that the token is still accepted after revocation',
          'Block the client at the gateway by revoking the contract, and block the source IP',
          'Test that the leaked token is refused, then review what was accessed with it',
          'Change the cache setting in a planned restart, and test how fast a revoked token stops',
          'Issue new credentials to the partner, restore the contract, and confirm that the leaked token is still refused',
        ],
        explain: 'Contain first, and keep the contract revoked until the cached token has gone: with the contract back, a token still in the cache could work again. The property is set when Mule starts, so it needs a planned restart, which should also empty the in-memory cache.',
      },
    ],
  },
  description: `
## Symptoms
- 09:55: the partner Logix reports that a developer pasted a live access token into a public code repository.
- 09:58: the security team revokes the token in the identity provider. The IdP shows it as inactive.
- 10:03: API access logs show the same token still getting **200** responses, from an address that does not belong to the partner.

## Change / Context
- Mule 4 hybrid runtimes run **Mule Gateway**, with the **OpenID Connect OAuth 2.0 Token Enforcement** policy on 30 APIs. Client management uses the corporate IdP.
- Tokens have a 12-hour lifetime, chosen to reduce load on the IdP.
- No runtime properties were set for token caching.

## Logs
\`\`\`
09:58:12 INFO  [idp-audit] token revoked: client=partner-logix jti=8f21c reason=credential-leak
10:03:40 INFO  [gw-access] GET /api/v2/shipments 200 client=partner-logix jti=8f21c src=203.0.113.77
10:03:41 INFO  [idp-audit] introspection requests from gateway-prod in last 10 min: 0 for jti=8f21c
10:14:02 INFO  [idp-audit] token metadata: jti=8f21c issued=06:30 expires=18:30
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
    'The token enforcement policy caches a validated token by default until it expires, so IdP revocation is not seen by the gateway during that time.',
    'The docs name revoked tokens as the case for minimising or disabling caching.',
    'anypoint.platform.max_federation_expiration_time caps the cached time, whichever comes first with token expiry. It is set at Mule startup or in wrapper.conf.',
    'anypoint.platform.openid_connect_cache_max_size limits the number of cached tokens: default 10,000, and 0 disables caching.',
    'Tokens are cached only in memory.',
    'Contain by revoking the contract and blocking the source, and verify with a real call.',
    'Short token lifetimes and a tested revocation delay are the lasting controls.',
  ],
  solution: `
**Diagnosis.** The IdP says the token is revoked, but the gateway has not asked it. The token was validated earlier today, and the policy keeps a validated token until it expires. In the API Manager description of the OAuth flow, a validated token is kept on record until it expires, and further requests with it are not validated against the provider. Here that means up to 18:30.

**Immediate mitigation.**
- In API Manager, open the API instance **Contracts** and **Revoke** the partner's contract. This blocks the client application, and it can be restored. Repeat for each API it uses.
- Apply an **IP Blocklist** policy for the abusing address. Policies are injected with no redeploy.
- Send a test request with the leaked token to prove it is refused. The docs do not state how fast a contract change affects a cached token, so do not assume.
- If it is still accepted, restart the gateway runtimes one at a time in a planned window. Tokens are cached only in memory, so a restart should clear them, but the docs do not say so directly, so test it. Depending on the Gatekeeper setting, each API can answer 503 until its policies are applied.
- Issue new credentials to the partner. Restore the contract only after a restart or the token's expiry has removed it from the cache, then confirm that the leaked token is still refused. The docs do not say that a cached token stays blocked once a contract is restored.

**Root cause.** Long-lived tokens plus default caching gave a revocation delay of up to 12 hours, and nobody had made that choice on purpose.

**Permanent fix.**
\`\`\`
wrapper.java.additional.<n>=-Danypoint.platform.max_federation_expiration_time=300
\`\`\`
A token is then rechecked after at most 5 minutes, or when it expires if that is earlier. If security needs immediate effect, \`anypoint.platform.openid_connect_cache_max_size=0\` disables caching, at the cost of a validation call for each request, so load-test the IdP and watch latency. Also shorten access token lifetimes. For the Mule OAuth provider policy, the cache size property is \`anypoint.platform.oauth2_cache_max_size\`.

**Prevention.**
- Agree a target for how fast revocation must take effect, and include a revocation test in API release checks.
- Add a runbook step: "revoke at IdP, then revoke the contract, then verify at the gateway".
- Alert on one token being used from a new source address.
`,
  followUps: [
    {
      q: 'Would JWT Validation behave better here?',
      a: 'No. It validates the signature and claims locally, so it never asks the IdP whether a token was revoked. A signed JWT is accepted until exp, unless you add your own deny list. That makes short lifetimes even more important.',
    },
    {
      q: 'Why not just set the cache to 0 everywhere?',
      a: 'Every request then needs a validation call. That adds latency and load on the IdP, and an IdP slowdown becomes an API outage. A short cache time is usually the better balance.',
    },
    {
      q: 'What happens if the validation endpoint is down when the cache entry ends?',
      a: 'The policy returns 401 for an error connecting to the authorization server. This is why a very short cache time also raises your dependence on the IdP.',
    },
  ],
}
