import { diagram } from '../../arch/dsl.js'

const orders = { name: 'app requests', from: 'mobile-app', rps: 1200, to: 'database' }
const logins = { name: 'sign-ins', from: 'mobile-app', rps: 20, to: 'identity-provider', kind: 'write' }

export default {
  id: 'ar-153',
  category: 'architecture',
  title: 'Checking 1,200 Tokens a Second: Validate JWTs at the Gateway Instead of Asking the Identity Provider About Every Request',
  level: 'ADVANCED',
  tags: ['security', 'jwt', 'oauth2', 'api-gateway', 'identity-provider', 'scaling', 'food-delivery'],
  estMinutes: 40,
  diagram: {
    task: 'draw the app\'s sign-in to the identity provider, and its API calls through an API gateway that checks tokens, then an Experience API and a System API to the orders database.',
    checks: [
      { label: 'The app signs in with the identity provider', rule: { type: 'edge', from: 'mobile-app', to: 'identity-provider' } },
      { label: 'The app calls the API gateway', rule: { type: 'edge', from: 'mobile-app', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The orders database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'API calls do not go through the identity provider', rule: { type: 'no-path', from: 'identity-provider', to: 'database' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Food delivery app'],
        idp: ['identity-provider', 'Identity provider (sign-in, token issuer)'],
        gw: ['api-gateway', 'API gateway', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-delivery-app', { replicas: 2, vCores: '2' }],
        sys: ['system-api', 'sys-orders', { replicas: 2, vCores: '2' }],
        db: ['database', 'Orders database'],
      },
      ['app -> idp', 'app -> gw', 'gw -> exp', 'exp -> sys', 'sys -> db'],
    ),
    simulation: {
      systems: [
        { match: 'identity-provider', latencyMs: 40, maxRps: 300 },
        { match: 'database', latencyMs: 10, maxRps: 3000 },
      ],
      tests: [
        {
          name: 'Friday dinner time',
          about: 'Customers make 1,200 API calls a second and 20 sign-ins a second. Calls are answered quickly, and the identity provider only sees the sign-ins.',
          traffic: [orders, logins],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }, { flow: 'app requests', maxMs: 300 }], peakRps: [{ node: 'identity-provider', max: 100 }] },
        },
        {
          name: 'The identity provider is down for 15 minutes',
          about: 'The identity provider has an outage. New sign-ins fail, but customers who are signed in keep ordering, because their tokens are checked at the gateway.',
          traffic: [orders, logins],
          incidents: [{ down: 'identity-provider', at: 5, forMin: 15 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'app requests', minSuccess: 0.99 }] },
        },
        {
          name: 'Calls with no token',
          about: 'A script scrapes the menu API with no token. The gateway refuses those calls before they reach any Mule app.',
          traffic: [{ ...orders, name: 'scraper', rps: 200, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'scraper', minRefused: 0.99 }], notReached: [{ flow: 'scraper', node: 'experience-api' }] },
        },
      ],
    },
  },
  description: `
A food delivery company's **app** signs customers in with an **identity provider**, which issues access tokens. The tokens are **JWTs**, signed by the identity provider and valid for 15 minutes. Every API call carries one.

Today the API gateway uses an **OAuth 2.0 policy that asks the identity provider about every token** (token introspection). On Friday evenings the app makes about **1,200 API calls a second**. The identity provider's plan allows about **300 requests a second**, and each check adds about 40 ms. Last Friday it started refusing checks, and customers who were already signed in got 401 in the middle of an order.

The security team says the tokens are signed with a key the identity provider publishes, and that a JWT policy can check the signature, the issuer, the audience and the expiry without calling the identity provider for each request.

**Questions:**
- Draw the design and say where tokens are checked.
- What changes for the identity provider's load and for the latency of each call?
- What happens during an identity provider outage?
- What do you give up by not asking the identity provider each time, and how do you limit it?
`,
  answerTemplate: `## Design

## Where tokens are checked

## Load and latency

## During an identity provider outage

## What you give up
`,
  keyPoints: [
    'A JWT carries its own claims and a signature. The gateway can check it with the identity provider\'s public key, which it fetches once and caches, not once per call.',
    'Introspection asks the identity provider about every call. Its load then grows with API traffic, not with sign-ins.',
    'With JWT validation the identity provider only sees sign-ins and token refreshes, and each call saves the round trip.',
    'During an outage, tokens already issued keep working until they expire. Only new sign-ins fail.',
    'The cost: a revoked token stays valid until it expires. Keep access tokens short-lived, and use introspection only for the few high-risk operations that need it.',
    'Check the issuer, the audience and the expiry, not only the signature, and refuse calls with no token at the gateway.',
  ],
  solution: `
**Design**
\`\`\`
Food delivery app ─► Identity provider        (sign-in, token refresh)
Food delivery app ─► API gateway (JWT policy) ─► exp-delivery-app ─► sys-orders ─► Orders database
\`\`\`

**Where tokens are checked.** At the gateway, with a JWT validation policy. It reads the identity provider's published signing keys from its keys endpoint and keeps them, then checks each token's signature, issuer, audience and expiry itself.

**Load and latency.** With introspection, 1,200 calls a second meant 1,200 checks a second against a provider that takes 300. With JWT validation the identity provider sees about 20 sign-ins a second. Each call is about 40 ms faster.

**During an identity provider outage.** Customers already signed in keep ordering until their token expires, up to 15 minutes. New sign-ins and refreshes fail. That turns a total outage into a partial one.

**What you give up.** A token cannot be withdrawn before it expires: a stolen phone keeps access for up to 15 minutes. That is why access tokens are short-lived. For payment changes or account deletion, the API can still introspect the token or ask for a fresh sign-in.

**Sizing.** The Experience and System APIs carry 1,200 calls a second, so two replicas of 2 vCores each in this model.
`,
  followUps: [
    {
      q: 'What happens when the identity provider rotates its signing key?',
      a: 'It publishes the new key next to the old one before it signs with it. The gateway refreshes its copy of the keys on a schedule, or when it sees a key ID it does not know.',
    },
    {
      q: 'Should the Mule apps behind the gateway check the token again?',
      a: 'If the network behind the gateway is trusted and only the gateway can reach them, the gateway check is enough for most teams. In a zero-trust setup each app checks the JWT too, which costs little because no call is made.',
    },
  ],
}
