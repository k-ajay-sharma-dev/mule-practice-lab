import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-086',
  category: 'architecture',
  title: 'One External OpenID Connect Provider for Customer and Partner APIs: Tokens, Client Registration and Contracts',
  level: 'ADVANCED',
  tags: ['security', 'oauth2', 'openid-connect', 'api-manager', 'policies', 'client-management', 'api-led'],
  estMinutes: 45,
  diagram: {
    task: 'draw how a customer web app and partner servers get tokens from an external identity provider and call experience APIs through a gateway that checks those tokens, with core banking reached only through a System API.',
    checks: [
      { label: 'The customer web app gets its token from the identity provider', rule: { type: 'edge', from: ['web-app', 'mobile-app'], to: 'identity-provider' } },
      { label: 'Partner servers get their tokens from the identity provider', rule: { type: 'edge', from: 'partner', to: 'identity-provider' } },
      { label: 'Every channel calls the gateway', rule: { type: 'each', of: ['web-app', 'mobile-app', 'partner'], edgeTo: 'api-gateway' } },
      { label: 'The gateway validates tokens with the identity provider', rule: { type: 'edge', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The gateway forwards to Experience APIs', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'Channels never call Experience APIs directly', rule: { type: 'no-edge', from: ['web-app', 'mobile-app', 'partner'], to: 'experience-api' } },
      { label: 'Customer and partner channels have separate Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: ['legacy', 'erp'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer portal (Authorization Code)'],
        par: ['partner', 'Partner servers (Client Credentials)'],
        idp: ['identity-provider', 'Corporate IdP: OIDC, Dynamic Client Registration'],
        gw: ['api-gateway', 'Mule Gateway: OpenID Connect OAuth 2.0 Token Enforcement, Rate Limiting: SLA-Based'],
        ec: ['experience-api', 'exp-customer-accounts'],
        ep: ['experience-api', 'exp-partner-payments'],
        pa: ['process-api', 'prc-accounts'],
        pp: ['process-api', 'prc-payments'],
        sc: ['system-api', 'sys-core-banking'],
        core: ['legacy', 'Core banking'],
        mon: ['monitoring', 'API analytics and audit logs'],
      },
      [
        'web -> idp', 'par -> idp', 'web -> gw', 'par -> gw', 'gw -> idp', 'gw -> ec', 'gw -> ep',
        'ec -> pa', 'ep -> pp', 'pa -> sc', 'pp -> sc', 'sc -> core', 'gw -> mon',
      ],
    ),
  },
  description: `
A bank is replacing an old Mule OAuth provider with its **corporate identity provider**, which supports OpenID Connect and Dynamic Client Registration. The same IdP will serve:

- A **customer portal** used by 2 million customers, where users sign in and the portal calls APIs on their behalf.
- About **150 partner servers** that call payment APIs with no user present, and must only reach APIs they have a contract for, with different SLA tiers.

Constraints:
- Sandbox and Production must use **separate IdP tenants**.
- Partners request access in the API portal, and must not wait for a ticket to the IdP team.
- The IdP team worries about load. The security team wants revoked tokens to stop working within 5 minutes.
- APIs run on Mule Gateway, and the core banking system is only reachable through a System API.

**Questions:**
- Draw the target architecture.
- Which grant does each channel use?
- How are client applications registered, and how do Sandbox and Production stay apart?
- Which policies run, in what order, and how is the client tied to a contract?
- How do you balance IdP load against revocation speed?
`,
  answerTemplate: `## Target architecture

## Grant types

## Client registration and environments

## Policies and contracts

## Caching and revocation
`,
  keyPoints: [
    'The IdP issues tokens. The gateway only validates them: token enforcement policies never generate tokens.',
    'Customer portal: Authorization Code. Partner servers: Client Credentials.',
    'Client management: an OpenID Connect Dynamic Client Registration client provider in Access Management. Requesting access in an API portal creates the client in the IdP.',
    'Up to 25 client providers can be configured and associated with environments, which separates Sandbox and Production.',
    'The Token Introspection Client must be able to introspect all tokens from all clients.',
    'Keep client ID validation on, so a token must belong to a client with an approved contract.',
    'Apply Rate Limiting: SLA-Based after token enforcement, with Client ID Expression #[authentication.principal] and no secret expression.',
    'Validated tokens are cached until expiry. Set anypoint.platform.max_federation_expiration_time=300 to meet the 5 minute target.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Customer portal ──► Corporate IdP ◄── Partner servers
       │                  ▲                  │
       └────────► Mule Gateway ◄─────────────┘
                   │         │
         exp-customer-accounts   exp-partner-payments
                   │         │
             prc-accounts   prc-payments
                   └───┬─────┘
                sys-core-banking ──► Core banking
\`\`\`

**Grants.** The portal uses **Authorization Code**: the user signs in at the IdP, and a temporary code is exchanged for a token, so the portal never sees the password. Partners use **Client Credentials**, since there is no user.

**Registration and environments.**
- In **Access Management > Client Providers**, add an **OpenID Connect Dynamic Client Registration** provider for each IdP tenant. Give it the issuer, Client Registration URL, authorize and token URLs, and a **Token Introspection Client**.
- Prefer **OAuth2 private key JWT** for registration calls instead of a static Authorization Header: the docs describe the header as a static token that does not expire, while the private key method uses a short-lived token.
- Associate the Sandbox provider with Sandbox and the Production provider with Production.
- When a partner requests access in an API portal, a client is generated in the IdP with no ticket. On Okta, the admin must also assign generated clients.

**Policies.** Apply them on each Experience API instance, or as automated policies where the rule is universal:
1. CORS for the portal, which always runs first.
2. **OpenID Connect OAuth 2.0 Token Enforcement**, with the scopes for that API.
3. **Rate Limiting: SLA-Based** with \`#[authentication.principal]\` as the client ID.

The policy asks the validation endpoint for metadata, then checks the client ID against the contracts it holds locally. Skip Client Id Validation stays off.

**Load and revocation.** Tokens are cached until expiry by default, which is good for the IdP and bad for revocation. \`anypoint.platform.max_federation_expiration_time=300\` gives at most one validation per token every 5 minutes on each runtime, since the cache is in memory. Check that the IdP returns expiry information, because without it tokens are not cached at all, and every request hits the IdP. If the validation endpoint cannot be reached, the policy returns 401, so include the IdP in your availability planning.

**Audit.** Track who changed policies and client providers through audit logs, and use API analytics for traffic.
`,
  followUps: [
    {
      q: 'Why not use JWT Validation and avoid IdP calls altogether?',
      a: 'It suits a high-volume API, because it validates locally with a key or JWKS. But the IdP would not be consulted, so a revoked token stays valid until exp. With a 5 minute revocation target, that means very short token lifetimes.',
    },
    {
      q: 'What happens to existing apps on the old Mule provider?',
      a: 'OAuth 2.0 Access Token Enforcement Using Mule OAuth Provider only works with the Mule provider, so tokens from the new IdP will not pass it. Plan a migration of client applications, and move APIs to the new policy one at a time.',
    },
    {
      q: 'If a client is changed directly in the IdP, is Anypoint Platform updated?',
      a: 'Do not assume it. The client provider has separate options for deleting clients in Anypoint Platform and for updating and deleting them in the IdP. Decide which system is the master for client data, and test what happens.',
    },
  ],
}
