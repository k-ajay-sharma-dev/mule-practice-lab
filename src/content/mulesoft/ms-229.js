export default {
  id: 'ms-229',
  category: 'mulesoft',
  title: 'Calling an OAuth 2.0 API From Mule: Client Credentials, Token Reuse and Refresh on the HTTP Request',
  level: 'ADVANCED',
  tags: ['oauth2', 'client-credentials', 'http-request', 'oauth-module', 'security', 'tokens', 'object-store', 'logistics'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A partner gives you a client id, a client secret and a token URL, and says no person signs in at any point. What does Mule send to the token URL?',
      options: [
        'The user\'s name and password, and the client id of the app',
        'Its client id and client secret, and the scopes it asks for',
        'An authorization code, and the redirect URI it registered',
        'A refresh token from the last call, and the scopes it asks for',
      ],
      answer: 1,
      explain: 'With no person involved, this is the client credentials grant, a machine to machine grant. The app proves who it is with its own id and secret and gets an access token back. A user name and password belong to the password grant, and an authorization code to a grant where a person signs in. A refresh token is not part of the client credentials flow.',
    },
    {
      type: 'single',
      prompt: 'The flow calls the token URL before every partner call. Traffic is 50 calls per second. What is the problem?',
      options: [
        'None, a fresh token per call is safer',
        'The token server gets 50 extra calls per second',
        'An access token is too short lived to reuse',
        'The partner API rejects a token used twice',
      ],
      answer: 1,
      explain: 'A token is valid until it expires. Reuse it for many calls and get a new one only when needed. 50 extra calls per second can make the token server rate limit the app.',
    },
    {
      type: 'single',
      prompt: 'An HTTP Request config has the client credentials grant type. Before each call, the flow also calls the token URL itself and sets `Authorization: Bearer` by hand. What should change?',
      options: [
        'Keep both, as the grant type only fetches the token and does not send it',
        'Remove the manual call and header, as the grant gets, keeps and sends the token',
        'Move the grant type to the HTTP Listener config, where tokens are handled',
        'Keep the manual call and drop the grant type, as it only checks inbound tokens',
      ],
      answer: 1,
      explain: 'Inside the authentication of an HTTP Request config, the grant type gets the token, keeps it until it expires and sends it as a bearer token on the outbound calls. The manual call repeats that work and loads the token server. Checking inbound tokens is the job of a policy on the API, not of the Listener or of the grant type.',
    },
    {
      type: 'single',
      prompt: 'The partner revokes tokens early during a key rotation, and calls start to fail with 401. What setting tells the module to get a new token?',
      options: [
        'The response timeout of the HTTP Request',
        'The refreshTokenWhen expression, true on a 401',
        'The reconnection strategy of the HTTP config',
        'The retry count of an Until Successful scope',
      ],
      answer: 1,
      explain: 'The module checks the response against that expression and fetches a new token when it is true. Test how a call that already failed is handled in your version, and make the flow safe to retry.',
    },
    {
      type: 'multi',
      prompt: 'Where can the client secret live?',
      options: [
        'An encrypted secure property, with the key given at deploy time',
        'A secret store that the runtime reads',
        'A plain property in config-prod.yaml, kept out of the flow XML',
        'A query parameter on the token URL, read from a property',
      ],
      answer: [0, 1],
      explain: 'The secret proves the app\'s identity. Keep it encrypted or in a secret store. A query parameter can end up in access logs.',
    },
    {
      type: 'single',
      prompt: 'The partner says the token response uses `token` instead of `access_token`. What do you change?',
      options: [
        'Nothing, the module reads any token field',
        'The expression that reads the access token',
        'The token URL on the grant type',
        'The scopes asked for in the grant type',
      ],
      answer: 1,
      explain: 'The grant type has expressions that read the token and its expiry from the response. Point them at the fields the partner really sends.',
    },
  ],
  description: `
Brindle Freight books collections with a partner carrier through its API. The carrier secures the API with OAuth 2.0 and gives Brindle a client id, a client secret and a token URL. A developer wrote a flow that calls the token URL, stores the token in a variable, and then calls the booking endpoint. It works in test.

In the first week of production the carrier rate limited the token endpoint, and during a key rotation every booking failed with 401 for twenty minutes.

**Questions**
1. What happens in the client credentials grant, and why is a new token per call wrong?
2. How does the OAuth module change the HTTP Request configuration, and what does it handle for you?
3. How do you deal with a token that stops working before it expires?
4. Where do the client id and secret live, and what do you check when the token response is not standard?
5. What would you build if the module does not fit the partner's token endpoint?
`,
  answerTemplate: `## The grant and token reuse

## The OAuth module on the HTTP Request

## Early revocation

## Secrets and odd token responses

## A manual alternative
`,
  keyPoints: [
    'Client credentials is a machine to machine grant: client id and secret in, access token out.',
    'Reuse a token until it expires. A new token per call overloads the token server.',
    'The OAuth module grant type on the HTTP Request config gets, keeps and sends the token.',
    'An expression such as refreshTokenWhen asks for a new token, for example on a 401.',
    'Keep the client secret in secure properties or a secret store.',
    'If the token response is not standard, set the expressions that read the token and expiry.',
    'A manual design caches the token in an Object Store with a TTL shorter than its life.',
  ],
  solution: `
**1. The grant.** Mule posts its client id, client secret and scopes to the token URL and gets an access token with a lifetime. It then sends the token as a bearer token on each API call. A token is meant to be reused until it expires. Asking for one per call doubles the traffic and, at 50 calls per second, triggers the carrier's limit on the token endpoint.

**2. The OAuth module.** Add the OAuth module to the project and set the client credentials grant type as the authentication of the HTTP Request configuration, with the token URL, client id, secret and scopes. The module gets a token on the first call, keeps it, and adds it to later requests. The flow no longer has token steps at all.

**3. Early revocation.** A token can stop working before its expiry, as in the key rotation. Set the refresh expression so that a 401 from the carrier makes the module get a new token. Check in a test how your runtime version handles the call that failed, and make sure a booking can be retried safely, for example with an idempotency key, so a retry never books twice.

**4. Secrets and odd responses.** Put the client id and secret in secure properties or a secret store, never in the config in Git. If the carrier's token response uses other field names, set the expressions that read the access token and the expiry from it.

**5. Manual design.** If the token endpoint needs something the module does not support, call it with an HTTP Request in a small flow and store the token in an Object Store with a TTL a little shorter than its lifetime. The booking flow reads from the store and calls the token flow only on a miss or a 401.
`,
  followUps: [
    {
      q: 'The app runs on three replicas. Is it a problem if each one gets its own token?',
      a: 'Usually not, since three tokens is far below any sensible limit. Check the carrier\'s rules, because some partners allow only one live token per client. In that case share the token through a store all replicas can read.',
    },
    {
      q: 'How is this different from the OAuth 2.0 policies in API Manager?',
      a: 'Those policies check tokens that callers send to your API. The OAuth module here gets tokens so your app can call someone else\'s API. One is inbound, the other outbound.',
    },
    {
      q: 'How do you test the token handling without the partner?',
      a: 'Mock the token URL and the booking endpoint, for example with a small stub app or MUnit mocks. Make the stub answer 401 once, and check that the next call carries a new token.',
    },
  ],
}
