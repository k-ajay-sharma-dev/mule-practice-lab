export default {
  id: 'ms-101',
  category: 'mulesoft',
  title: 'Choosing an OAuth 2.0 Enforcement Policy: Mule OAuth Provider, OpenID Connect, JWT Validation and Token Introspection',
  level: 'ADVANCED',
  tags: ['security', 'oauth2', 'openid-connect', 'policies', 'api-manager', 'client-management', 'jwt'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'The company uses Okta, which supports Dynamic Client Registration, and APIs run on Mule Gateway. Client applications should be registered in Okta when they request access in the API portal. Which policy fits?',
      options: [
        'OpenID Connect OAuth 2.0 Token Enforcement, with Okta configured as a client provider in Access Management',
        'OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider, pointed at the Okta validation URL',
        'Basic Authentication: LDAP',
        'Client ID Enforcement, with the Okta token as the client ID',
      ],
      answer: 0,
      explain: 'The Mule OAuth Provider policy works exclusively with the Mule OAuth provider, and using it with any other provider is not supported. The OpenID Connect policy needs the organization to use OpenID Connect dynamic client registration as its client management.',
    },
    {
      type: 'single',
      prompt: 'The OpenID Connect policy does not appear in the list of policies for an API. What do the docs say to check first?',
      options: [
        'That the OpenID client provider is configured in Access Management, and, with multiple client providers, that it is configured for the API',
        'That the API uses a RAML with a `securitySchemes` block',
        'That Mule Gateway has restarted',
        'That the runtime has the OAuth Module as a dependency',
      ],
      answer: 0,
      explain: 'This is the first FAQ on the policy page. Declaring OAuth in RAML or OAS does not attach a policy either: the API Manager docs state that it only documents the protection.',
    },
    {
      type: 'match',
      prompt: 'Match each response from the OpenID Connect OAuth 2.0 Token Enforcement policy to its meaning.',
      pairs: [
        ['400', 'Invalid token'],
        ['401', 'Unauthorized access, or an error when connecting to the authorization server'],
        ['403', 'Forbidden, invalid client application credentials'],
        ['500', 'Bad response from the authorization server'],
      ],
      explain: 'A 401 can therefore come from an unreachable authorization server, not only from a bad caller. Check the validation endpoint before blaming the client.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of a request through a token enforcement policy in order.',
      items: [
        'The client sends an HTTP request to the API with its token',
        'The policy extracts the token and sends it to the validation endpoint',
        'The validation endpoint returns token metadata, including the client ID',
        'The policy checks a local copy of contracts to see whether that client ID has access to the API',
        'The request is allowed to reach the backend',
      ],
      explain: 'Step 4 is the one skipped by **Skip Client Id Validation**. The docs recommend keeping it so that the token is tied to an approved contract.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about the token enforcement policies on Mule Gateway are correct?',
      options: [
        'They validate tokens only, they never issue them',
        'A validated token is cached by default until it expires',
        'If the validation endpoint returns no expiry information, the token is not cached',
        'Each request calls Anypoint Platform to check the contract',
        'With **Contains any scope**, a token needs at least one of the listed scopes',
      ],
      answer: [0, 1, 2, 4],
      explain: 'Contracts come from client applications previously retrieved by the runtime, so the policy keeps working if the connection to the management plane is lost. Caching differs on Omni Gateway: in Managed and Connected Mode the OpenID Connect policy has a Validated Token TTL field, 600 seconds by default.',
    },
    {
      type: 'single',
      prompt: 'You add Rate Limiting: SLA-Based after the OpenID Connect policy, and clients only send a bearer token. How do you configure it?',
      options: [
        'Client ID Expression `#[authentication.principal]`, and leave Client Secret Expression empty',
        'Client ID Expression `#[attributes.headers.client_id]`, and require clients to send it too',
        'Client ID Expression `#[vars.claimSet.client_id]`',
        'It cannot be combined with token enforcement',
      ],
      answer: 0,
      explain: 'Both policy pages answer this. The identity is already validated, so the secret is not needed. `vars.claimSet` belongs to the JWT Validation policy.',
    },
    {
      type: 'single',
      prompt: 'Your gateway is Omni Gateway (formerly Flex Gateway), and you want to validate tokens from an IdP with an introspection endpoint without registering that IdP in Anypoint Platform. Which policy fits?',
      options: [
        'OAuth 2.0 Token Introspection',
        'OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider',
        'PingFederate OAuth 2.0 Token Enforcement',
        'Client ID Enforcement',
      ],
      answer: 0,
      explain: 'The Omni Gateway policy authorises tokens without registering an external IdP server. It does not support Microsoft Entra ID, because Entra ID has no introspection endpoint; JWT Validation suits that case.',
    },
    {
      type: 'single',
      prompt: 'With **Expose Headers** on, a validation response has `uid`, `mail`, `token_type`, `exp` and an `address` object. What reaches the backend through the HTTP requester of a proxy?',
      options: [
        'X-AGW-uid, X-AGW-mail and X-AGW-token_type; objects, arrays and exp are not propagated',
        'All fields with the prefix X-OAUTH-',
        'The whole response in one X-AGW-TOKEN header',
        'Nothing: headers are only available through `authentication`',
      ],
      answer: 0,
      explain: 'Fields get the `X-AGW-` prefix, and the propagated properties exclude `scope`, `exp`, objects and arrays. In a flow the full response stays available, for example `#[authentication.properties.userProperties.mail]`.',
    },
  ],
  description: `
A bank is standardising API authentication. Today it has an old Mule OAuth 2.0 provider, and it is moving to **Okta**. Some services are behind **Mule Gateway**, and a new group of Kubernetes services will sit behind **Omni Gateway (formerly Flex Gateway)**. Requirements:

- Partner server applications call APIs with no user present.
- A customer web app calls APIs on behalf of a signed-in user.
- Client applications must only reach APIs for which they have an approved contract.
- Each environment may use a different identity provider.
- The security team wants to know how fast a revoked token stops working.

**Questions**
1. What are the OAuth 2.0 grant types, and which fits each kind of client?
2. Compare the policies that can protect these APIs, and when each applies.
3. How does OpenID Connect client management work in Anypoint Platform?
4. What does a token enforcement policy do on each request, and how does caching affect revocation?
`,
  answerTemplate: `## Grant types

## Policy comparison

## OpenID Connect client management

## Per-request behaviour and caching
`,
  keyPoints: [
    'Grant types in the API Manager docs: Authorization Code, Implicit, Resource Owner Password Credentials and Client Credentials.',
    'OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider works only with the Mule OAuth provider.',
    'OpenID Connect OAuth 2.0 Token Enforcement needs an OpenID Connect client provider in Access Management.',
    'PingFederate and OpenAM have their own token enforcement policies on Mule Gateway. OAuth 2.0 Token Introspection is an Omni Gateway policy. The OpenID Connect policy is not supported on Omni Gateway in Local Mode.',
    'All token enforcement policies validate tokens and never issue them. Skip Client Id Validation removes the contract check; the docs recommend keeping it.',
    'On Mule Gateway, tokens are cached in memory until expiry by default. anypoint.platform.max_federation_expiration_time caps the time, and the cache size property set to 0 disables caching.',
    'The Token Introspection Client configured in Access Management must be able to introspect all tokens from all clients.',
    'Declaring OAuth in RAML or OAS does not apply a policy to the API instance.',
  ],
  solution: `
**1. Grant types.**
- **Client Credentials:** the client is itself the resource owner, so this fits the partner server applications.
- **Authorization Code:** a user signs in at the provider, and a temporary code is exchanged for a token. This fits the customer web app, and the docs call it the most frequently used grant type.
- **Implicit:** the token comes straight back in the redirect, with no intermediate code. The docs describe it as less secure than Authorization Code.
- **Resource Owner Password Credentials:** the client handles the user's password, so the user must trust it highly.

**2. Policies.**

| Policy | Gateway | Use when |
|---|---|---|
| OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider | Mule Gateway | The tokens come from the Mule OAuth provider, and only then |
| OpenID Connect OAuth 2.0 Token Enforcement | Mule Gateway, and Omni Gateway except Local Mode | An OIDC provider with Dynamic Client Registration is your client provider |
| PingFederate / OpenAM OAuth 2.0 Token Enforcement | Mule Gateway | These specific providers are your client provider |
| OAuth 2.0 Token Introspection | Omni Gateway | Any IdP with an introspection endpoint, with no IdP registration in the platform |
| JWT Validation | Mule Gateway and Omni Gateway | Self-contained JWTs that can be checked locally with a key or JWKS |

**3. Client management.** An administrator adds a client provider in **Access Management > Client Providers** (**OpenID Connect Dynamic Client Registration**). It is set up with the issuer, Client Registration URL, authentication method, a **Token Introspection Client**, and the authorize and token URLs. Registration calls authenticate either with an Authorization Header, which is a static token, or with the OAuth2 private key JWT method, which gives a short-lived token. When someone requests API access in a portal, a client application is generated in the IdP. For Okta, the Okta admin must also assign those generated clients to a user or group. Up to 25 client providers can be configured, and they are associated with environments, which gives each environment its own IdP.

**4. Per request.** The policy extracts the token, calls the validation endpoint unless the token is cached, and reads metadata including the client ID. It then checks that client ID against locally held contracts. Credentials for the validation endpoint are sent in the request body; other authentication methods are not supported.

**Caching and revocation.** A validated token is cached until it expires, so revoking it at the IdP does not stop it at once. Tune this with \`anypoint.platform.max_federation_expiration_time=<seconds>\`, and control the number of tokens with \`anypoint.platform.openid_connect_cache_max_size\` (\`anypoint.platform.oauth2_cache_max_size\` for the Mule provider policy). The default is 10,000, and 0 disables caching. Tokens are cached only in memory. The trade-off is more calls to the IdP and more latency. These properties are for Mule Gateway. On Managed and Connected Mode Omni Gateway, the OpenID Connect policy has its own **Validated Token TTL** (default 600 seconds, 0 disables caching) and **Maximum Cache Entries** (default 10000) fields.
`,
  followUps: [
    {
      q: 'Can a token be sent as a query parameter?',
      a: 'The API Manager docs allow ?access_token=... or the Authorization: Bearer header, but not both at once. Prefer the header, because URLs end up in logs.',
    },
    {
      q: 'What if the Mule provider validation endpoint must be protected?',
      a: 'The Mule provider policy page says the endpoint must not require authentication. If yours must be protected, it says to switch to the OpenID Connect policy.',
    },
    {
      q: 'How does the policy reach the validation endpoint through a corporate proxy?',
      a: 'Set anypoint.platform.external_authentication_provider_enable_proxy_settings=true at startup. The policy then uses the Mule proxy settings, anypoint.platform.proxy_host and anypoint.platform.proxy_port.',
    },
  ],
}
