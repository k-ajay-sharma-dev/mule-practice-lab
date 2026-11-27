// The guided lab sec-oauth-external. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, call, change, OPS, propsValue, recent, sawLogs, until } from '../platform-kit.js'
import { AUDIENCE, CALLERS, ISSUER, JWKS_URL, READ, TOKEN_URL, WRITE } from './sec-oauth-external.pkg.js'

const NAME = 'supplier-invoices-api'
const value = (s, key) => String(propsValue(app(s, NAME), key) ?? '').trim()
const audienceOn = (s) => app(s, NAME)?.status === 'Running' && value(s, 'jwt.validateAudience').toLowerCase() === 'true' && value(s, 'jwt.audience') === AUDIENCE
const scopesOn = (s) => app(s, NAME)?.status === 'Running' && value(s, 'scope.read') === READ && value(s, 'scope.write') === WRITE
const fixed = (s) => audienceOn(s) && scopesOn(s) && value(s, 'jwt.validateExpiration').toLowerCase() === 'true' && value(s, 'jwt.jwksUrl') === JWKS_URL
// calls of one caller since the last Apply Changes
const since = (s, caller, method) => s.events.filter((e) => e.k === 'in' && e.app === NAME && e.env === 'Sandbox' && e.c === caller.name && (!method || e.m === method) && e.t > (app(s, NAME)?.updated ?? Infinity))

const MAIL_IDP = {
  t: at(0, 10),
  to: OPS,
  subject: 'Cobalt Identity is live for supplier-invoices-api',
  body: [
    'Hello integration team,',
    `client applications now get access tokens from our provider with the OAuth 2.0 client credentials grant at ${TOKEN_URL}. Each token is a signed JWT that lives one hour.`,
    `Issuer ${ISSUER}. Signing keys are published at ${JWKS_URL}.`,
    `The audience of tokens for your API is ${AUDIENCE}. Reading needs the scope ${READ}, creating an invoice needs ${WRITE}. Tokens for other APIs carry their own audience.`,
    'Identity team, Harbor Foods',
  ].join('\n\n'),
  source: 'Identity team',
}
const MAIL_REVIEW = {
  t: at(1, 8, 40),
  to: OPS,
  subject: 'Finding SEC-318: supplier-invoices-api accepts the wrong tokens',
  body: [
    `Two findings from our review of ${NAME}:`,
    '1. A token issued for the payments API (aud api://payments) reads supplier invoices.',
    `2. Reporting Job holds only ${READ} and still created a test invoice with POST /invoices.`,
    'Please fix both today and keep Ledger Sync working.',
    'Security team, Harbor Foods',
  ].join('\n\n'),
  source: 'Security team',
}

const lab = {
  id: 'p-sec-oauth-external',
  group: 'Security',
  title: 'Accept tokens from an external identity provider',
  minutes: 15,
  scenario: [
    `It is 09:00. ${NAME} of Harbor Foods accepts OAuth 2.0 access tokens from the external identity provider Cobalt Identity. Callers get their tokens with the client credentials grant.`,
    'The token check verifies the signature with the JWKS of the provider and the expiry, but the security team found that it lets in tokens it should refuse.',
    'In this lab the application checks the token itself, with properties named after the JWT Validation policy fields, because the gateway of the lab console sends no token to its OAuth and JWT policies.',
    'The API client has no Authorization header either, so each client application in Send as stands for a caller with its own token: Ledger Sync, Reporting Job, Payments Bot and Old Batch.',
  ].join(' '),
  start: () =>
    until(
      newPlatform({
        clock: at(1, 8),
        apps: [
          newApp(NAME, {
            updated: at(0, 11),
            props: { 'jwt.keyOrigin': 'JWKS', 'jwt.jwksUrl': JWKS_URL, 'jwt.jwksTtl': '60', 'jwt.validateExpiration': 'true', 'jwt.validateAudience': 'false', 'jwt.audience': '', 'scope.read': '', 'scope.write': '' },
          }),
        ],
        clients: Object.values(CALLERS),
        traffic: [
          { app: NAME, env: 'Sandbox', path: '/invoices', perMinute: 1, every: 5, client: CALLERS.LEDGER.name },
          { app: NAME, env: 'Sandbox', path: '/invoices', perMinute: 1, every: 10, client: CALLERS.PAYMENTS.name },
        ],
        mail: [MAIL_IDP, MAIL_REVIEW],
      }),
      at(1, 9),
    ),
  steps: [
    { title: 'Read the mails', how: 'Open the Inbox from the menu. The identity team gives the issuer, the JWKS URL, the audience and the scopes. The security team lists two findings.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(NAME),
    ask(
      'Read the token of Payments Bot',
      'The log has an INFO line for each accepted call with the claims of the token. What is wrong with the calls of Payments Bot?',
      ['The token has expired', `The signature is fine, but aud is api://payments and not ${AUDIENCE}, and nothing checks aud`, 'The token has no scope at all', 'Payments Bot has no client ID'],
      1,
      'A valid signature only proves that the provider issued the token. The audience says which API the token was issued for. Without that check, any token of the provider opens this API.',
    ),
    ask(
      'Choose the gateway policy',
      'On a real gateway, which policy fits a provider that publishes a JWKS, is not set up as a client provider in Access Management, and should not be called for every request?',
      [
        'OpenAM OAuth 2.0 Token Enforcement',
        'OpenID Connect OAuth 2.0 Token Enforcement',
        'JWT Validation with JWT Key Origin JWKS and the JWKS URL of the provider',
        'Basic Authentication: Simple',
      ],
      2,
      'JWT Validation checks the signature with the keys of the JWKS URL and checks the claims on the gateway, with no call to the provider per request. The OpenID Connect policy needs the provider set up as a client provider in Access Management, and sends the token to its validation endpoint, then caches the result. The OpenAM policy only works with OpenAM as the client management solution.',
    ),
    {
      title: 'Check the audience',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set jwt.validateAudience to true and jwt.audience to ${AUDIENCE}. On a real gateway this is Validate Audience Claim in the JWT Validation policy.`,
      done: audienceOn,
    },
    {
      title: 'Check the scope of each operation',
      how: `In the same properties set scope.read to ${READ} and scope.write to ${WRITE}. Keep jwt.validateExpiration true. Apply Changes. The flow then answers 403 with insufficient_scope when the token lacks the scope.`,
      done: scopesOn,
    },
    {
      title: 'Prove the wrong tokens fail',
      how: `API client, ${NAME}. Send GET /invoices as Payments Bot and get 401. Send POST /invoices as Reporting Job and get 403. Send GET /invoices as Old Batch and get 401.`,
      done: (s) => fixed(s) && since(s, CALLERS.PAYMENTS, 'GET').some((e) => e.s === 401) && since(s, CALLERS.REPORTING, 'POST').some((e) => e.s === 403) && since(s, CALLERS.OLD).some((e) => e.s === 401),
    },
    ask(
      'Read the answers',
      'Why is Payments Bot 401 and Reporting Job 403?',
      [
        'Both are the same error',
        'Payments Bot sends a token that is not for this API, so it is not authenticated here. Reporting Job sends a good token that lacks the scope for this operation',
        'Reporting Job sends no token',
        'Payments Bot is blocked by an IP rule',
      ],
      1,
      'A failed claim, such as aud or exp, means the token is not accepted, which is 401. A good token without the scope is a permission problem, which is 403 with insufficient_scope. The JWT Validation policy answers 401 for any failed claim, so a scope check in a custom claim also gives 401.',
    ),
    ask(
      'Fix Old Batch',
      'Old Batch keeps a token from Monday in a file. What should it do?',
      ['Ask us to turn off Validate Expiration Claim', `Get a new token with client credentials at ${TOKEN_URL} when the old one is close to exp, and keep it in memory`, 'Use a refresh token', 'Send the token of Ledger Sync'],
      1,
      'The client credentials grant has no user, so the client asks for a new token with its client ID and secret. The OAuth 2.0 standard says a refresh token should not be issued for this grant.',
    ),
    {
      title: 'Prove Ledger Sync still works',
      how: 'Move the clock 5 minutes. The Ledger Sync calls in the traffic answer 200, and no Payments Bot call gets through.',
      done: (s) => {
        const list = recent(s, NAME, 5)
        const ledger = list.filter((e) => e.c === CALLERS.LEDGER.name)
        return fixed(s) && ledger.length > 0 && ledger.every((e) => e.s === 200) && list.filter((e) => e.c === CALLERS.PAYMENTS.name).every((e) => e.s === 401)
      },
    },
  ],
  why: 'A token from a trusted provider is not yet a token for your API. Check the signature with the JWKS of the provider, then the claims: exp so old tokens fail, aud so tokens for other APIs fail, and the scope of each operation. On the gateway, JWT Validation with a JWKS URL checks locally and has no call per request, but a revoked token stays valid until exp. The OpenID Connect policy asks the provider, which needs the provider set up in Access Management. The lab simplifies: the checks run in the application with properties named after the policy fields, the scope check is a check in the flow, and the issuer is not checked.',
  docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-jwt-validation',
  solve(start) {
    let s = { ...start, seen: { ...start.seen, inbox: start.clock, [`logs:${NAME}`]: start.clock } }
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'jwt.validateAudience': 'true', 'jwt.audience': AUDIENCE, 'scope.read': READ, 'scope.write': WRITE } })
    s = call(s, NAME, CALLERS.PAYMENTS, '/invoices').state
    s = call(s, NAME, CALLERS.REPORTING, '/invoices', 'POST', '{"supplier":"Bayline Produce","total":10}').state
    s = call(s, NAME, CALLERS.OLD, '/invoices').state
    return advance(s, 5 * MINUTE)
  },
  answers: { 2: 1, 3: 2, 7: 1, 8: 1 },
}

export const LABS = [lab]
