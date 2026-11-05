export default {
  id: 'ms-102',
  category: 'mulesoft',
  title: 'The JWT Validation Policy in Depth: Signing Methods, JWKS, Claims and Propagation',
  level: 'ADVANCED',
  tags: ['security', 'jwt', 'policies', 'api-manager', 'jwks', 'claims', 'oauth2'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'Which description matches the status codes of the Mule Gateway JWT Validation policy?',
      options: [
        '400 when no token was provided; 401 for an invalid signature, a missing or failed claim, or a token that cannot be parsed',
        '401 when no token was provided; 403 for an invalid signature; 400 for a failed claim',
        '400 for every failure',
        '403 for every failure',
      ],
      answer: 0,
      explain: 'The policy table lists 400 only for a missing token. Everything about a token that was sent but failed is a 401.',
    },
    {
      type: 'single',
      prompt: 'The IdP rotates its RS256 signing keys every 30 days and publishes them at a JWKS URL. How should **JWT Key Origin** be set?',
      options: [
        'JWKS, with the JWKS URL, so the policy retrieves keys and caches them for the JWKS Caching Time To Live',
        'Text, pasting the current public key each month',
        'Text, pasting the private key',
        'None, as the IdP already signs the token',
      ],
      answer: 0,
      explain: 'With JWKS the keys follow the IdP. The default time to live is 60 minutes, and when it expires the policy retrieves the set again. With Text, each rotation needs a policy change.',
    },
    {
      type: 'single',
      prompt: '**Validate Audience Claim** is on with `orders-api`, but **Audience Claim Mandatory** is off. A correctly signed token arrives with no `aud` claim. What happens?',
      options: [
        'The token is not rejected for that validation, because a non-mandatory claim that is absent is skipped',
        'It is rejected with 401',
        'It is rejected with 400',
        'The policy adds the audience to the token',
      ],
      answer: 0,
      explain: 'A non-mandatory claim is only validated if it is present. If `aud` is present with the wrong value, the token is rejected. So for anything you rely on, tick mandatory as well.',
    },
    {
      type: 'multi',
      prompt: 'Which are true for **JWT Signing Method**?',
      options: [
        'The policy rejects a token whose signing method differs from the one configured',
        'With no algorithm specified, the policy matches every signed and unsigned token',
        'None means no signature validation, so the claims could have been written by anyone',
        'HMAC uses a shared secret, while RSA uses a PEM public key pasted without the header and footer',
        'The policy can validate JWE tokens if the key is provided',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The policy validates JWTs in JWS format and does not validate JWE. In production always set a signing method and a key length, for example RSA and 256 for RS256.',
    },
    {
      type: 'single',
      prompt: 'You want to accept only tokens where the custom claim `region` is `EU`. Which custom claim validation works?',
      options: [
        "`#[vars.claimSet.region == 'EU']`",
        "`#[attributes.headers.region == 'EU']`",
        "`#[vars.claimSet.region]`, returning the String EU",
        "`#[authentication.properties.claims.region = 'EU']`",
      ],
      answer: 0,
      explain: 'The policy gives custom validations a `claimSet` variable, and every expression must return a Boolean or it always fails.',
    },
    {
      type: 'single',
      prompt: 'Client ID validation is on (Skip Client ID Validation is off). The IdP puts the client ID in a claim called `cid`, and all requests fail. What should you change?',
      options: [
        'Set **Client ID Expression** to `#[vars.claimSet.cid]`',
        'Set **Token Expression** to `#[vars.claimSet.cid]`',
        'Add a Client ID Enforcement policy before JWT Validation',
        'Change JWT Origin to Custom Expression',
      ],
      answer: 0,
      explain: 'The default expression is `#[vars.claimSet.client_id]`. The extracted ID must match a client application of the API, so a mismatch with your IdP\'s claim name needs this field changed.',
    },
    {
      type: 'single',
      prompt: 'After the policy, how does a Mule flow read the `tenant` claim and the original token?',
      options: [
        '`#[authentication.properties.claims.tenant]` and `#[authentication.properties.jwt]`',
        '`#[attributes.headers.tenant]` and `#[attributes.headers.authorization]`',
        '`#[vars.claimSet.tenant]` and `#[vars.jwt]`',
        '`#[payload.claims.tenant]` and `#[payload.jwt]`',
      ],
      answer: 0,
      explain: 'Claims are propagated to downstream policies and flows through the authentication object. `vars.claimSet` is for expressions inside the policy.',
    },
    {
      type: 'single',
      prompt: 'The JWKS endpoint is briefly unreachable when the cached set expires. What does the policy do?',
      options: [
        'It retries asynchronously with exponential backoff, and keeps using the expired JWKS to process requests until a new set is cached',
        'It rejects all tokens with 401 until the next TTL',
        'It skips signature validation',
        'It restarts the API',
      ],
      answer: 0,
      explain: 'The Retry Mechanism section describes this. A short JWKS outage should therefore not stop traffic that the old keys can validate.',
    },
  ],
  description: `
A telecom exposes a **Number Porting API** to resellers. Tokens are issued by a central IdP as signed JWTs (\`RS256\`), so the gateway should not have to call the IdP for each request. API Manager runs the **JWT Validation** policy on Mule Gateway.

The first version was configured quickly: JWT Signing Method left empty, a public key pasted as Text, and no claim validations switched on. A penetration test then reports:

- A token with \`"alg": "none"\` was accepted.
- A token issued for a different API, with another \`aud\`, was accepted, and so was a token with no \`aud\` at all.
- After the IdP rotated keys, valid tokens were rejected until someone pasted a new key.

**Questions**
1. How does the policy validate signatures, and which methods does it support?
2. How should keys be provided, and what happens around JWKS caching?
3. How do claim validations work, and what does mandatory mean?
4. How do client ID validation and claim propagation work?
5. Give the corrected configuration.
`,
  answerTemplate: `## Signature validation

## Keys and JWKS

## Claim validation

## Client ID and propagation

## Corrected configuration
`,
  keyPoints: [
    'JWT Validation validates JWS tokens, not JWE. It checks the signature and asserts claim values.',
    'Methods: HMAC (symmetric), RSA and ES (asymmetric) with SHA-256, SHA-384 or SHA-512, and None for no signature validation. With no algorithm set, it matches every signed and unsigned token.',
    'Key origin: Text (a shared secret, or a PEM public key without header and footer) or JWKS (URL, 60-minute default time to live).',
    'If a JWKS fetch fails, the policy retries with exponential backoff and uses the expired set meanwhile.',
    'aud, exp and nbf have built-in validations. Any other claim needs a custom validation returning a Boolean, for example #[vars.claimSet.foo == \'x\'].',
    'Mandatory: reject if absent. Non-mandatory: skip if absent. In both cases, a present claim is checked.',
    'Status: 400 for no token; 401 for a bad signature, a failed claim or an unparsable token.',
    'Client ID is read from #[vars.claimSet.client_id] by default and must match a client application, unless Skip Client ID Validation is set.',
    'Downstream: authentication.properties.claims.<name> and authentication.properties.jwt.',
  ],
  solution: `
**1. Signatures.** The token's method must match the configured **JWT Signing Method** and the signature must verify, or the token is rejected. Supported methods are HMAC, RSA and ES with SHA-256, SHA-384 or SHA-512 (the key length field: 256, 384, 512), plus None. The \`alg: none\` token passed because no algorithm was specified, and in that case the policy matches every signed and unsigned token.

**2. Keys.** With **Text**, you paste a 32, 48 or 64 character shared secret for HMAC, or the PEM public key without the \`BEGIN\` and \`END\` lines for RSA. With **JWKS**, you give the URL. The policy caches the set for the **JWKS Caching Time To Live**, 60 minutes by default, and **JWKS Service connection timeout** defaults to 10 seconds. A rotating IdP calls for JWKS. The docs describe the set being retrieved again when the cached copy expires. So ask the IdP team to publish a new key at least one cache period before signing with it, and test a rotation. If a fetch fails, retries run in the background with exponential backoff while the expired set stays in use.

**3. Claims.** \`aud\`, \`exp\` and \`nbf\` are built in:
- \`aud\`: the token must contain at least one of the configured values.
- \`exp\`: reject if the date has passed.
- \`nbf\`: reject if the validation time is earlier than the claim.

For others, such as \`iss\`, add a custom validation with a literal or a DataWeave expression. If a claim is **mandatory** and absent, the token is rejected. If it is non-mandatory and absent, that check is skipped. If it is present, it is always checked. This explains both \`aud\` findings: the wrong audience passed because audience validation was off, and a missing \`aud\` would still pass unless mandatory is set.

**4. Client ID and propagation.** Unless **Skip Client ID Validation** is ticked, the client ID comes from **Client ID Expression**, by default \`#[vars.claimSet.client_id]\`, and must match a client application of the API. The docs recommend keeping this check. After validation, claims reach downstream policies and flows through \`authentication.properties.claims.<claimName>\`, and the token through \`authentication.properties.jwt\`.

**5. Corrected configuration.**

| Field | Value |
|---|---|
| JWT Origin | HTTP Bearer Authentication Header |
| JWT Signing Method / Key Length | RSA / 256 |
| JWT Key Origin | JWKS, with the IdP JWKS URL |
| Audience | Validate, mandatory, \`number-porting-api\` |
| Expiration | Validate, mandatory |
| Not Before | Validate if the IdP issues it |
| Custom claim | \`iss\` equals the IdP issuer, mandatory |
| Client ID | Validate, with the expression matching your IdP's claim |
`,
  followUps: [
    {
      q: 'How do you read the token from a custom header?',
      a: "Set JWT Origin to Custom Expression and give a Token Expression, such as #[attributes.headers['jwt']].",
    },
    {
      q: 'JWT Validation or a token enforcement policy?',
      a: 'JWT Validation checks the signature and claims locally, using a key or a cached JWKS, so no call to the IdP is needed for each token. A token enforcement policy asks the validation endpoint, so a token revoked at the IdP can be detected once the cached result ends. A signed JWT stays valid until it expires, which is why short expiry matters.',
    },
    {
      q: 'What differs on Omni Gateway (formerly Flex Gateway)?',
      a: 'Its page lists 256 and 384 only for the ES method, allows several JWKS URLs as a comma-separated list, and in Local Mode skipClientIdValidation must be true. If Client ID validation is enabled, the client ID is available as #[authentication.clientId].',
    },
  ],
}
