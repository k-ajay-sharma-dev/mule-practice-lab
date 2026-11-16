import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-126',
  category: 'architecture',
  title: 'An Identity Provider Issuing Tokens',
  level: 'BEGINNER',
  tags: ['security', 'oauth2', 'policies', 'api-manager', 'api-gateway'],
  estMinutes: 15,
  diagram: {
    task: 'draw how a token is issued and checked. Use four boxes: an Internal / staff app box, an Identity provider box, an API gateway / policies box and an Experience API box. Draw four lines: from the app to the Identity provider to get a token, from the app to the gateway to call the API, from the gateway to the Identity provider to check the token, and from the gateway to the Experience API.',
    checks: [
      { label: 'The app gets its token from the identity provider', rule: { type: 'edge', from: 'internal-app', to: 'identity-provider' } },
      { label: 'The app calls the gateway with its token', rule: { type: 'edge', from: 'internal-app', to: 'api-gateway' } },
      { label: 'The gateway checks the token with the identity provider', rule: { type: 'edge', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The gateway passes valid requests to the Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'The app never calls the Experience API directly', rule: { type: 'no-edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'Getting a token, checking it and calling the API are sync calls', rule: { type: 'lines', from: ['internal-app', 'api-gateway'], to: ['identity-provider', 'api-gateway', 'experience-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Dispatch app'],
        idp: ['identity-provider', 'Identity provider'],
        gw: ['api-gateway', 'API gateway', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-dispatch-api'],
      },
      ['app -> idp', 'app -> gw', 'gw -> idp', 'gw -> exp'],
    ),
    simulation: {
      systems: [],
      tests: [
        {
          name: 'A request without a token',
          about: 'The dispatch app sends 20 requests a second with valid tokens. A tool on the network sends 15 a second with no token. The gateway refuses the tool, and the Experience API never sees it.',
          traffic: [
            { name: 'dispatch', from: 'internal-app', rps: 20, to: 'experience-api' },
            { name: 'no token', from: 'internal-app', rps: 15, auth: 'none', to: 'experience-api' },
          ],
          expect: { answers: [{ flow: 'dispatch', minSuccess: 0.99 }, { flow: 'no token', minRefused: 0.99 }], notReached: [{ flow: 'no token', node: 'experience-api' }] },
        },
        {
          name: 'The identity provider is down',
          about: 'The identity provider is down for the whole run. Tokens already issued are valid for an hour, so dispatch keeps working.',
          traffic: [{ name: 'dispatch', from: 'internal-app', rps: 20, to: 'experience-api' }],
          incidents: [{ down: 'identity-provider' }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A shipping company has a dispatch app for its staff. The app calls an Experience API, and security wants proof of who is calling.

An **identity provider** is a service that confirms who a caller is and issues tokens. A **token** is a digital pass with a time limit. The app sends it with each request, and an **API gateway** checks it.

Some numbers for the design:
- The dispatch app sends about 20 requests a second. A token is valid for an hour.
- The identity provider is a hosted service that has had outages. Dispatch must keep working while it is down, with the tokens the app already holds.

**Questions:**
- Draw how the token is issued and checked.
- What happens to a request with a bad token?
`,
  answerTemplate: `## Design

## A bad token
`,
  keyPoints: [
    'The identity provider issues tokens. The API does not.',
    'The app gets a token first, then sends it with each request.',
    'The gateway checks the token before the request reaches the API.',
    'A request with a missing or invalid token is rejected at the gateway.',
    'JWT Validation checks the signature with the provider public keys, so it keeps working while the provider is down. Introspection asks the provider about every token and stops when the provider stops.',
  ],
  solution: `
**Design.**
\`\`\`
 Dispatch app ──(1 get token)──► Identity provider
 Dispatch app ──(2 call with token)──► API gateway ──(3 check token)──► Identity provider
 API gateway ──(4 valid request)──► exp-dispatch-api
\`\`\`

**A bad token.** The gateway rejects the request, usually with HTTP status 401 (unauthorized), and the Experience API never sees it. An expired token fails in the same way, so the app has to get a new one.

**Which policy?** OAuth 2.0 is the common standard for this exchange. In API Manager, the JWT Validation policy checks a signed token (a JWT). Other policies, such as OAuth 2.0 Token Introspection, ask the provider about the token. Which ones you can apply depends on the gateway you use.

**When the identity provider is down.** Here the choice matters. JWT Validation reads the public keys of the provider once and keeps them, which is the line from the gateway to the provider. It then checks each signature locally, so tokens already issued keep working during an outage. Introspection asks the provider about each token, so every request fails while the provider is down. For this dispatch app, choose JWT Validation.
`,
  followUps: [
    {
      q: 'Why should a token have a time limit?',
      a: 'If a token is stolen, it stops working when it expires. That limits the damage.',
    },
    {
      q: 'Must the gateway contact the identity provider on every request?',
      a: 'Not always. A JWT is signed, so the gateway can check the signature with the public key of the provider. Introspection does ask the provider about the token.',
    },
  ],
}
