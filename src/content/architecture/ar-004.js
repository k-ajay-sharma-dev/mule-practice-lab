import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-004',
  category: 'architecture',
  title: 'Securing APIs for Partners and Internal Apps',
  level: 'INTERMEDIATE',
  tags: ['security', 'oauth2', 'mtls', 'api-manager'],
  estMinutes: 25,
  diagram: {
    task: 'draw how partners, the mobile backend and the batch job reach the Payments Status API: where tokens come from, where mTLS and the API Manager policies sit, and how the payments backend is protected.',
    checks: [
      { label: 'Partners obtain OAuth tokens from the identity provider (client credentials)', rule: { type: 'each', of: 'partner', edgeTo: 'identity-provider' } },
      { label: 'The customer logs in at the identity provider (user-context token)', rule: { type: 'edge', from: 'mobile-app', to: 'identity-provider' } },
      { label: 'Partner traffic passes an mTLS ingress before the gateway', rule: { type: 'path', from: 'partner', to: 'api-gateway', via: 'load-balancer' } },
      { label: 'Both internal consumers (mobile backend, batch job) also go through the gateway', rule: { type: 'each', of: 'internal-app', min: 2, edgeTo: 'api-gateway' } },
      { label: 'The API is reached only through the policy gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The gateway validates JWTs locally and never calls the IdP per request', rule: { type: 'no-edge', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The payments backend is reached only through a System API', rule: { type: 'only-via', target: ['database', 'legacy', 'erp'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        fin: ['partner', 'Fintech partners'],
        mob: ['mobile-app', 'Mobile banking app'],
        mbk: ['internal-app', 'Mobile backend (forwards user token)'],
        bat: ['internal-app', 'Nightly reconciliation job'],
        idp: ['identity-provider', 'Bank IdP / authorization server'],
        lb: ['load-balancer', 'Partner ingress (mTLS)'],
        gw: ['api-gateway', 'API Manager policies (JWT, SLA tiers, JSON threat)'],
        api: ['experience-api', 'exp-payments-status-api'],
        sp: ['system-api', 'sys-payments-api'],
        core: ['database', 'Payments store'],
      },
      [
        'fin -> idp', 'fin -> lb', 'lb -> gw',
        'mob -> idp', 'mob -> mbk', 'mbk -> gw',
        'bat -> idp', 'bat -> gw',
        'gw -> api', 'api -> sp', 'sp -> core',
      ],
    ),
  },
  description: `
A bank exposes a **Payments Status API** (Mule 4, deployed to CloudHub 2.0, managed in API Manager). Three kinds of consumers:

- **Fintech partners** (external, ~30) — server-to-server calls, no end user involved. Regulators require **strong client authentication** and partners must only see their own payments.
- **Internal mobile backend** — calls on behalf of a logged-in customer; the bank already uses an enterprise identity provider (OAuth 2.0 / OIDC).
- **Internal batch reconciliation job** — runs nightly inside the corporate network.

Constraints: partners are on contract tiers (Gold 50 rps, Silver 10 rps). The security team wants tokens validated **without** a call to the IdP on every request, and payloads must be protected against oversized/malicious JSON.

**Questions:**
- Which authentication mechanism do you use for each consumer type, and why?
- Where does mTLS fit in?
- Which API Manager policies do you apply, and in what order of concern?
- How do you make sure a partner only sees its own payments?
`,
  answerTemplate: `## Partners

## Mobile backend (end-user context)

## Internal batch job

## mTLS

## API Manager policies

## Data-level authorization
`,
  keyPoints: [
    'Partners use OAuth 2.0 client credentials grant (machine-to-machine) issued by the external IdP/authorization server, not basic auth.',
    'Mobile backend passes the end user token (authorization code flow at the front end) so the API sees the customer identity and scopes.',
    'JWT Validation policy (signature checked against the IdP JWKS, issuer/audience/expiry claims) avoids calling the IdP on every request.',
    'mTLS for partners at the ingress (client certificates validated against a trusted CA), giving strong client authentication on top of the token.',
    'Rate Limiting - SLA based with Gold/Silver tiers tied to client applications, plus JSON threat protection.',
    'Data-level authorization in the API: derive the partner ID from the token (client_id/claim), never from a request parameter, and filter queries by it.',
  ],
  solution: `
**Partners — OAuth 2.0 client credentials + mTLS.** Each partner gets a client registered in the bank's authorization server and obtains tokens with the **client credentials grant**. Tokens are JWTs with scopes such as \`payments:read\`.
On top of that, require **mutual TLS**: the partner presents a client certificate issued/approved by the bank. On CloudHub 2.0 this is configured on the Private Space ingress / TLS context (or on a Flex Gateway in front). Optionally bind the token to the certificate (certificate-bound tokens) if the IdP supports it.

**Mobile backend — user-context token.** The app authenticates the customer via the authorization code flow (with PKCE) at the IdP; the mobile backend forwards the user's access token. The API then knows the **customer** and can restrict to their accounts.

**Internal batch job.** Also client credentials (its own client ID, narrow scopes such as \`payments:reconcile\`). Being "inside the network" is not a reason to skip authentication (zero trust). Optionally restrict with an IP allowlist.

**API Manager policies** (roughly the order requests meet them):
1. Transport: HTTPS only, mTLS for the partner-facing endpoint.
2. **IP Allowlist** where relevant (internal-only endpoints).
3. **JWT Validation** — verify signature against the IdP's JWKS URL (keys cached), check \`iss\`, \`aud\`, \`exp\`, and required scopes. No per-request IdP round trip. (Use the OpenID Connect / OAuth 2.0 access token enforcement policy instead if you need token introspection, e.g. for opaque tokens or instant revocation.)
4. **Rate Limiting - SLA based** — Gold/Silver SLA tiers in API Manager; each partner's client application is approved on a tier, so limits follow the contract.
5. **JSON Threat Protection** — max depth, string length, array size.
6. Spike Control in front of fragile backends.

**Data-level authorization.** Policies prove *who* is calling; the API must still enforce *what* they can see. Take the partner ID from the validated token (\`client_id\` or a custom claim), never from a query parameter, and filter every query by it. Return 404 (not 403) for other partners' payment IDs to avoid leaking existence. Log access with the client ID for audit.
`,
}
