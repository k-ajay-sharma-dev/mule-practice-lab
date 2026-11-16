import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-037',
  category: 'architecture',
  title: 'Reference Architecture for a B2C Mobile Channel',
  level: 'INTERMEDIATE',
  tags: ['mobile', 'b2c', 'experience-api', 'bff', 'security'],
  estMinutes: 45,
  diagram: {
    task: 'draw the mobile banking architecture from the device through the edge and the three API layers to core banking, the card SaaS and push notifications.',
    checks: [
      { label: 'The mobile app logs in against the identity provider (OIDC + PKCE)', rule: { type: 'edge', from: 'mobile-app', to: 'identity-provider' } },
      { label: 'Mobile traffic passes the API gateway (token validation, rate limits) before the Experience API', rule: { type: 'path', from: 'mobile-app', to: 'experience-api', via: 'api-gateway' } },
      { label: 'The Experience API is reached only through the API gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The mobile Experience API (BFF) calls Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: ['legacy', 'erp', 'database'], from: 'system-api' } },
      { label: 'The card processor is reached only through a System API', rule: { type: 'only-via', target: ['saas', 'external-api'], from: 'system-api' } },
      { label: 'Transaction events for push notifications are published asynchronously, off the request path', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Transaction events lead on to the push provider', rule: { type: 'path', from: ['process-api', 'system-api'], via: ['queue', 'topic', 'event-stream'], to: 'notification' } },
      { label: 'No chain of sync calls joins the app request to the push provider', rule: { type: 'no-path', from: 'experience-api', to: 'notification', kind: 'sync' } },
      { label: 'The mobile app reaches core banking end to end', rule: { type: 'path', from: 'mobile-app', to: ['legacy', 'erp', 'database'] } },
      { label: 'Card controls in the app reach the card processor', rule: { type: 'path', from: 'mobile-app', to: ['saas', 'external-api'] } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Load balancers forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: 'load-balancer', kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking app'],
        idp: ['identity-provider', 'Cloud IdP (OIDC, auth code + PKCE)'],
        waf: ['load-balancer', 'CDN / WAF'],
        gw: ['api-gateway', 'API gateway (JWT validation, per-user rate limit)', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-mobile-banking-api (BFF, GET /home)', { replicas: 2, vCores: '0.5', calls: 'in parallel', timeoutMs: 1000, circuitBreaker: 'on', onFailure: 'partial answer' }],
        cache: ['cache', 'Profile / product metadata cache'],
        pacc: ['process-api', 'prc-accounts-api', { replicas: 2, vCores: '0.5' }],
        pcard: ['process-api', 'prc-cards-api', { replicas: 2, vCores: '0.5' }],
        pnot: ['process-api', 'prc-notification-api'],
        ev: ['topic', 'TransactionPosted events'],
        score: ['system-api', 'sys-core-banking-api', { replicas: 2, vCores: '0.5' }],
        scard: ['system-api', 'sys-card-processor-api', { replicas: 2, vCores: '0.5' }],
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
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 500, maxRps: 300 },
        { match: 'saas', latencyMs: 400 },
        { match: 'notification', latencyMs: 200 },
        { match: 'cache', hitRatio: 0.2 },
      ],
      tests: [
        {
          name: 'Salary day peak',
          about: 'On salary day the home screen is opened 200 times a second for ten minutes. It must load in full, in 750 ms on average, so nearly every load stays under a second. Core banking must stay under its 300 calls a second, and the APIs must fit the 6 vCore budget.',
          traffic: [{ name: 'home', from: 'mobile-app', rps: 200, to: ['legacy', 'saas'] }],
          expect: { answers: [{ minSuccess: 0.99, maxDegraded: 0.05, maxMs: 750 }], peakRps: [{ node: 'legacy', max: 300 }], vCores: { max: 6 } },
        },
        {
          name: 'The card processor hangs',
          about: 'The card processor stops answering for the whole run while the home screen is opened 100 times a second. The home screen still loads in 750 ms on average, with accounts and balances but without the cards part.',
          traffic: [{ name: 'home', from: 'mobile-app', rps: 100, to: ['legacy', 'saas'] }],
          incidents: [{ hang: 'saas' }],
          expect: { answers: [{ minSuccess: 0.99, minDegraded: 0.5, maxMs: 750 }] },
        },
        {
          name: 'Identity provider outage',
          about: 'The identity provider is down for the whole run. Customers whose app already holds a token keep using the app, and calls without a token are still refused.',
          traffic: [
            { name: 'customers', from: 'mobile-app', rps: 100, to: ['legacy', 'saas'] },
            { name: 'no token', from: 'mobile-app', rps: 10, to: ['legacy', 'saas'], auth: 'none' },
          ],
          incidents: [{ down: 'identity-provider' }],
          expect: { answers: [{ flow: 'customers', minSuccess: 0.99 }, { flow: 'no token', minRefused: 0.99 }] },
        },
      ],
    },
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

Numbers to design for:
- The home screen is opened about 20 times a second normally and **200 times a second** on salary day. It should load in **750 ms** on average, so nearly every load stays under a second.
- Core banking answers in about 500 ms and takes at most **300 calls a second**. The card processor answers in about 400 ms, and has had incidents where it stops answering altogether. The push provider takes about 200 ms.
- The identity provider has had outages. Customers who are already logged in must keep using the app during one, and calls without a valid token must always be refused.
- The budget for the Mule apps is **6 vCores**.

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
    'Settings: JWT validation at the gateway checks tokens without calling the IdP, so an IdP outage does not stop logged-in customers. The BFF calls in parallel with a 1 s timeout, a circuit breaker and partial answers; the APIs on the home path run 2 replicas of 0.5 vCore (5.2 vCores in total).',
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

**Settings that matter.**
- **Gateway: JWT validation.** The signature is checked locally with the IdP's published keys, so customers with a token keep working while the IdP is down. Token introspection (OAuth 2.0 enforcement) would ask the IdP about every call and fail with it. Calls without a token are refused either way.
- **BFF: calls in parallel, a 1000 ms timeout, a circuit breaker and partial answers.** In parallel the home screen takes the time of the slowest backend (about half a second), not the sum. When the card processor hangs, the breaker fails those calls at once and the screen shows accounts and balances without cards, instead of every request waiting for the timeout.
- **Sizing for salary day:** the five APIs on the home path run **2 replicas of 0.5 vCore**, about half busy at 200 screens a second. With the notification apps that is 5.2 vCores, inside the budget of 6. Core banking gets about 160 calls a second, well under its 300.
`,
  followUps: [
    { q: 'Why not let the app call the Process APIs directly?', a: 'The app would make many calls over a slow network, receive more data than needed and couple itself to internal APIs; the Experience API reduces round trips and lets internal APIs change without app releases.' },
    { q: 'How do you send a push notification when a salary arrives?', a: 'The core or a Process API publishes a TransactionPosted event; a notification consumer checks preferences and calls the push provider asynchronously. The mobile request path is not involved.' },
    { q: 'Where do you put certificate pinning?', a: 'In the mobile app, pinning the edge/API host certificate or public key to make man-in-the-middle attacks harder, with a rotation plan so pin changes do not lock out old app versions.' },
  ],
}
