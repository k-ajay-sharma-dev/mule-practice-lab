import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-037',
  category: 'architecture',
  title: 'Reference Architecture for a B2C Mobile Channel',
  level: 'INTERMEDIATE',
  tags: ['mobile', 'b2c', 'experience-api', 'bff', 'security'],
  estMinutes: 30,
  diagram: {
    task: 'draw the mobile banking architecture from the device through the edge and the three API layers to core banking, the card SaaS and push notifications.',
    checks: [
      { label: 'The mobile app logs in against the identity provider (OIDC + PKCE)', rule: { type: 'edge', from: 'mobile-app', to: 'identity-provider' } },
      { label: 'Mobile traffic passes the API gateway (token validation, rate limits) before the Experience API', rule: { type: 'path', from: 'mobile-app', to: 'experience-api', via: 'api-gateway' } },
      { label: 'The mobile Experience API (BFF) calls Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: ['legacy', 'erp', 'database'], from: 'system-api' } },
      { label: 'The card processor is reached only through a System API', rule: { type: 'only-via', target: ['saas', 'external-api'], from: 'system-api' } },
      { label: 'Transaction events for push notifications are published asynchronously, off the request path', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'The mobile app reaches core banking end to end', rule: { type: 'path', from: 'mobile-app', to: ['legacy', 'erp', 'database'] } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking app'],
        idp: ['identity-provider', 'Cloud IdP (OIDC, auth code + PKCE)'],
        waf: ['load-balancer', 'CDN / WAF'],
        gw: ['api-gateway', 'API gateway (JWT validation, per-user rate limit)'],
        exp: ['experience-api', 'exp-mobile-banking-api (BFF, GET /home)'],
        cache: ['cache', 'Profile / product metadata cache'],
        pacc: ['process-api', 'prc-accounts-api'],
        pcard: ['process-api', 'prc-cards-api'],
        pnot: ['process-api', 'prc-notification-api'],
        ev: ['topic', 'TransactionPosted events'],
        score: ['system-api', 'sys-core-banking-api'],
        scard: ['system-api', 'sys-card-processor-api'],
        spush: ['system-api', 'sys-push-api'],
        core: ['legacy', 'Core banking (on-prem)'],
        card: ['saas', 'Card processor SaaS'],
        push: ['notification', 'Push provider'],
      },
      [
        'mob -> idp', 'mob -> waf', 'waf -> gw', 'gw -> exp', 'exp -> cache', 'exp -> pacc', 'exp -> pcard',
        'pacc -> score', 'pcard -> scard', 'score -> core', 'scard -> card',
        'pacc ~> ev', 'ev ~> pnot', 'pnot -> spush', 'spush -> push',
      ],
    ),
  },
  description: `
A bank is launching a new **mobile banking app** (iOS/Android). Backends:

- Customer identity in a cloud IdP (OIDC).
- Accounts and transactions in a core banking system (on-prem, behind System APIs).
- Card controls in a card processor SaaS.
- Push notifications via a notification provider.

Requirements:
- Login with biometrics after first login; sessions should not require re-entering passwords daily.
- Home screen shows accounts, balances and last 5 transactions in **under 1 second**.
- Customers must only ever see their own data.
- Expected 500,000 users, peaks at salary day (10× normal).
- Mobile app releases are slow (app-store review, users not updating), so old app versions stay in use for months.

**Questions:**
- Draw the layers from the device to the backends and explain responsibilities.
- How do you design authentication/authorization end to end?
- How do you meet the home-screen latency target?
- How do you deal with old app versions and backward compatibility?
`,
  answerTemplate: `## Layered architecture

## Authentication and authorization

## Performance of the home screen

## App versioning and compatibility

## Resilience for peaks
`,
  keyPoints: [
    'Device → edge (WAF/CDN) → API gateway with policies → Mobile Experience API (backend-for-frontend) → Process APIs → System APIs, with the Experience API shaped for screens.',
    'The app uses OIDC Authorization Code flow with PKCE against the IdP; the gateway validates access tokens (JWT validation / OAuth policy) and the APIs derive the customer identity from the token, never from a request parameter.',
    'Refresh tokens stored securely on device (protected by OS keystore/biometrics) give long sessions without storing passwords.',
    'The home screen uses one aggregated call that runs backend calls in parallel (Scatter-Gather), with short timeouts, partial responses and caching of slow-changing data.',
    'Old app versions are supported by additive API changes, versioned Experience APIs and a minimum supported version check that can force an upgrade.',
    'Peaks are absorbed by gateway rate/spike policies, horizontal scaling of the Experience/Process layers and protecting the core banking system.',
  ],
  solution: `
**Layers.**
\`\`\`
Mobile app
  → CDN/WAF (bot protection, TLS, DDoS)
  → API gateway (JWT validation, rate limit per user/device, spike control)
  → Mobile Experience API (BFF: screen-shaped, aggregation, app-version handling)
  → Process APIs (Accounts, Cards, Notifications preferences)
  → System APIs (Core banking via hybrid connectivity, Card SaaS, Notification provider)
\`\`\`
- The **Experience API** is a backend-for-frontend: it knows screens (\`GET /home\`), not systems.
- Process APIs own business rules and are reused by web/branch channels.
- System APIs hide the core and SaaS specifics.

**Authentication and authorization.**
- **OIDC Authorization Code + PKCE** from the app to the IdP (no client secret in the app, because a mobile app cannot keep one).
- Short-lived **access token** (JWT) + **refresh token** stored in the OS secure storage, unlocked with biometrics → long sessions without passwords.
- Gateway validates the token (signature, issuer, audience, expiry, scopes).
- Experience API extracts the **customer ID from the token** (\`sub\` or a custom claim) and passes it downstream; Process APIs enforce "account belongs to customer". Never trust a \`customerId\` sent by the app.
- Step-up authentication (re-auth, transaction signing) for sensitive actions like adding a payee.
- Internal hops use client credentials / mTLS; the user identity is propagated as a claim or header for authorization and audit.

**Home screen < 1 s.**
- One call \`GET /home\` → Experience API runs Accounts, Balances, Transactions calls **in parallel** (Scatter-Gather) with tight per-call timeouts.
- **Partial response**: if transactions time out, return accounts and balances with a flag; the app shows "transactions unavailable".
- Cache customer profile and product metadata; do not cache balances beyond seconds.
- Small payloads: only fields the screen needs; pagination for transactions.

**Old app versions.**
- App sends its version in a header; Experience API can adapt responses and enforce a **minimum supported version** (returning a specific error the app understands as "please update").
- Prefer **additive** changes; breaking changes → new major version of the Experience API running alongside the old one until the old app share drops.
- Feature flags (server-driven) to switch features without app releases.

**Peaks.** Rate limit per user/device to stop abusive clients; pre-scale Experience/Process apps before salary day; protect core banking with spike control and caching; asynchronous handling for non-urgent actions (statements, notification preferences).
`,
  followUps: [
    { q: 'Why not let the app call the Process APIs directly?', a: 'The app would make many calls over a slow network, receive more data than needed and couple itself to internal APIs; the Experience API reduces round trips and lets internal APIs change without app releases.' },
    { q: 'How do you send a push notification when a salary arrives?', a: 'The core or a Process API publishes a TransactionPosted event; a notification consumer checks preferences and calls the push provider asynchronously. The mobile request path is not involved.' },
    { q: 'Where do you put certificate pinning?', a: 'In the mobile app, pinning the edge/API host certificate or public key to make man-in-the-middle attacks harder, with a rotation plan so pin changes do not lock out old app versions.' },
  ],
}
