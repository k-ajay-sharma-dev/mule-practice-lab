import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-056',
  category: 'architecture',
  title: 'Security per Layer in an API-led Estate',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'security', 'oauth', 'client-id-enforcement', 'private-ingress'],
  estMinutes: 25,
  diagram: {
    task: 'draw what is reachable from the internet and how each layer is reached: consumers, identity provider, public gateway, the three API layers and the on-prem backends.',
    checks: [
      { label: 'The mobile app and the partner fintechs enter through the public gateway/ingress', rule: { type: 'each', of: ['mobile-app', 'partner'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'The public gateway exposes only Experience APIs', rule: { type: 'each', of: 'api-gateway', edgeTo: 'experience-api' } },
      { label: 'Process and System APIs are never exposed on the public gateway', rule: { type: 'no-edge', from: 'api-gateway', to: ['process-api', 'system-api'] } },
      { label: 'Mobile users obtain tokens from the identity provider (OAuth 2.0 / OIDC)', rule: { type: 'edge', from: ['mobile-app', 'api-gateway', 'experience-api'], to: 'identity-provider' } },
      { label: 'Experience APIs call Process APIs over private endpoints', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Only System APIs hold backend credentials and reach the backends', rule: { type: 'only-via', target: ['erp', 'crm', 'legacy', 'database', 'saas'], from: 'system-api' } },
      { label: 'A partner request reaches core banking only via the gateway and the layers', rule: { type: 'path', from: 'partner', to: ['legacy', 'erp', 'database'], via: 'api-gateway' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking app'],
        fin: ['partner', 'Partner fintech (M2M)'],
        idp: ['identity-provider', 'Bank IdP (OAuth 2.0 / OIDC)'],
        gw: ['api-gateway', 'Public ingress + API Manager policies'],
        em: ['experience-api', 'exp-mobile-api (token enforcement, spike control)'],
        ep: ['experience-api', 'exp-partner-api (client creds, SLA tiers, IP allowlist)'],
        pa: ['process-api', 'prc-accounts-api (private, client-id enforcement)'],
        score: ['system-api', 'sys-core-account-api (secure properties)'],
        scrm: ['system-api', 'sys-crm-customer-api'],
        core: ['legacy', 'Core banking (on-prem via VPN)'],
        crm: ['crm', 'CRM'],
      },
      ['mob -> idp', 'mob -> gw', 'fin -> gw', 'gw -> em', 'gw -> ep', 'em -> pa', 'ep -> pa', 'pa -> score', 'pa -> scrm', 'score -> core', 'scrm -> crm'],
    ),
  },
  description: `
A bank's API-led estate runs on CloudHub 2.0 in a **Private Space** with a VPN to on-prem. Consumers: a mobile app (customers log in), partner fintechs (machine-to-machine), and internal apps.

An auditor asks: *"Show me how each layer is secured, how the layers trust each other, and what is reachable from the internet."*

**Design:**
1. Which API Manager policies and auth mechanisms apply at the **Experience**, **Process** and **System** layers?
2. How does a Process API know the call came from a legitimate Experience API, and how is the **end-user identity** carried down (or not)?
3. Which apps are exposed on **public** ingress and which only privately? How is that enforced?
4. Where do backend credentials (SAP user, DB password) live?
`,
  answerTemplate: `## Experience layer

## Process and System layers

## Trust between layers and user identity

## Network exposure

## Backend credentials
`,
  keyPoints: [
    'Experience APIs face consumers: OAuth 2.0 / OpenID Connect token enforcement (or JWT validation) for end users and partners, plus rate limiting/SLA tiers, threat protection and IP allowlists for partners where appropriate.',
    'Process and System APIs are internal: at minimum client-id enforcement so each calling app is identified and has a contract; mTLS or JWT between layers in stricter (zero-trust) setups.',
    'End-user identity is propagated as validated claims (e.g. a forwarded/derived JWT or customer id header set by the trusted Experience API), and authorisation on data ownership happens where the data is resolved.',
    'Only Experience APIs are exposed via public ingress; Process and System apps use private/internal endpoints reachable only inside the Private Space/VPC or via VPN.',
    'Backend credentials exist only in System API apps, stored as secure (encrypted) properties or in a secrets manager — never in upper layers.',
  ],
  solution: `
\`\`\`
Internet ──TLS──> [public ingress] ──> exp-mobile-api   (OAuth2/OIDC token, spike control)
                                  ──> exp-partner-api  (client credentials, SLA tiers, IP allowlist)
------------------------------------------------------------------------- Private Space
                    exp-* ──(client id+secret / mTLS, private endpoint)──> prc-*
                    prc-* ──(client id+secret / mTLS, private endpoint)──> sys-*
                    sys-* ──(SAP user / DB creds from secure properties)──> VPN ──> on-prem
\`\`\`

**Experience layer.**
- Mobile: **OAuth 2.0 / OIDC** with the bank's identity provider (authorization code + PKCE in the app). API Manager policy validates the token (OAuth 2.0 token enforcement via introspection, or **JWT Validation** for signed tokens); scopes checked per resource.
- Partners: client-credentials tokens or **Client ID Enforcement** with contracts and **SLA-based Rate Limiting** tiers; optionally **IP allowlist** and mutual TLS.
- All: Spike Control, JSON/XML threat protection, CORS for browser apps, TLS everywhere.

**Process and System layers.**
- **Client ID Enforcement** on every internal API: each calling app has its own client application/contract, so you know *who* calls and can revoke or rate-limit them. This is also what makes reuse measurable.
- Stricter: **mTLS** between apps or short-lived JWTs (zero trust: do not trust the network alone).
- Rate limiting / spike control on System APIs to protect backends.

**Trust and user identity.**
- Layer-to-layer trust = *application* identity (client id/secret or certificate).
- *User* identity: the Experience API validates the user token and then either forwards it (if downstream can validate it) or passes trusted claims (e.g. \`customerId\`) in a header that Process APIs accept **only** from authenticated internal clients. Never accept a \`customerId\` from the external request body as the authority.
- Data-level authorisation ("customer may only see own accounts") must be enforced where the request is resolved — commonly the Experience API sets the filter from the token and the Process API enforces it again for defence in depth.

**Network exposure.**
- Only Experience APIs on the **public** ingress (public endpoint / load balancer).
- Process and System APIs on **private ingress/internal endpoints** reachable only inside the Private Space (and from on-prem over VPN if needed). Even if a client id leaked, the API is not reachable from the internet.
- Firewall rules on the Private Space and on-prem limit which CIDR ranges reach backends.

**Backend credentials.** Only System API apps hold SAP/DB credentials, stored as **secure properties** (encrypted in config, key supplied at deploy time as a protected property) or fetched from a vault/secrets manager. Process and Experience apps never hold backend credentials — that is one of the security benefits of the System layer.
`,
  followUps: [
    { q: 'Is client-id enforcement enough security for internal APIs?', a: 'It identifies the caller but a client id/secret is a shared secret sent with each request. Combined with private networking it is a common baseline; for sensitive data add mTLS or token-based (JWT/OAuth) auth for zero trust.' },
    { q: 'Should the Process API re-validate the end-user\'s OAuth token?', a: 'It can if the token is a JWT it can validate cheaply, which is the most robust option. Many estates instead trust claims from authenticated Experience APIs; that is acceptable only with strong app-to-app auth and private networking.' },
    { q: 'Where do you apply policies — API gateway or inside the Mule app?', a: 'Policies applied through API Manager (autodiscovery on the Mule app, or Flex Gateway in front) so they are centrally managed and changed without redeploying; app code handles only fine-grained business authorisation.' },
  ],
}
