// The guided lab jwt-key-rotation. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, call, change, OPS, recent, sawLogs, until } from '../platform-kit.js'
import { CALLERS, JWKS_URL, NEW_KID, OLD_KEY_TEXT, OLD_KID } from './jwt-key-rotation.pkg.js'

const NAME = 'delivery-api'
const jwksOn = (s) => {
  const a = app(s, NAME)
  const p = { ...a?.props, ...a?.secrets }
  return a?.status === 'Running' && String(p['jwt.keyOrigin'] ?? '').trim().toUpperCase() === 'JWKS' && String(p['jwt.jwksUrl'] ?? '').trim() === JWKS_URL && Number(p['jwt.jwksTtl']) > 0
}
// calls of one caller since the last Apply Changes
const since = (s, caller) => s.events.filter((e) => e.k === 'in' && e.app === NAME && e.env === 'Sandbox' && e.c === caller && e.t > (app(s, NAME)?.updated ?? Infinity))

const MAIL_IDP = {
  t: at(0, 7),
  to: 'all-api-teams@brightmart.example',
  subject: 'Planned signing key rotation of idp.brightmart.lab',
  body: [
    'Hello API teams,',
    `we published a new signing key in our key set at ${JWKS_URL}. Its kid is ${NEW_KID} and its public key ends in hf1126.`,
    `From Tuesday 3 November 07:00 UTC every new access token is signed with ${NEW_KID}. The old key ${OLD_KID} (public key ending in hf0812) stays in the key set until 9 November, so tokens issued before the rotation keep working until they expire.`,
    'If your gateway reads our JWKS URL, there is nothing to do. If you pasted a public key into a configuration, change it before Tuesday.',
    'Identity team, Brightmart',
  ].join('\n\n'),
  source: 'Identity team',
}
const MAIL_DRIVERS = {
  t: at(1, 7, 40),
  to: OPS,
  subject: 'Driver App gets 401 on every call',
  body: 'Since this morning the Driver App cannot load deliveries. Every call answers 401. The drivers log in again and it does not help. The kiosks in the stores still work. Driver App team',
  source: 'Driver App team',
}

const lab = {
  id: 'p-fail-jwt-key-rotation',
  group: 'More production failures',
  title: 'Every token is rejected after a key rotation',
  minutes: 14,
  scenario: [
    'It is 09:00 on Tuesday. delivery-api of Brightmart accepts only bearer tokens from the identity provider idp.brightmart.lab.',
    'The team copied the RSA public key of the provider into the configuration: JWT Key Origin is Text and the key sits in jwt.key.',
    'In this lab the application checks the token itself, with properties named after the JWT Validation policy fields, because the JWT Validation policy of the lab console has no settings.',
    'The API client has no Authorization header either, so each client application in Send as stands for a caller with its own token: Driver App, Store Kiosk, Old Test Script and Unknown Signer.',
  ].join(' '),
  start: () =>
    until(
      newPlatform({
        clock: at(1, 5),
        apps: [
          newApp(NAME, {
            updated: at(0, 9),
            props: { 'jwt.signingMethod': 'RSA', 'jwt.keyLength': '256', 'jwt.keyOrigin': 'Text', 'jwt.jwksUrl': '', 'jwt.jwksTtl': '60' },
            secrets: { 'jwt.key': OLD_KEY_TEXT },
          }),
        ],
        clients: Object.values(CALLERS),
        traffic: [
          { app: NAME, env: 'Sandbox', path: '/deliveries', perMinute: 1, every: 2, client: CALLERS.DRIVER.name },
          { app: NAME, env: 'Sandbox', path: '/deliveries', perMinute: 1, every: 5, client: CALLERS.KIOSK.name },
        ],
        mail: [MAIL_IDP, MAIL_DRIVERS],
      }),
      at(1, 9),
    ),
  steps: [
    {
      title: 'See when the 401s started',
      how: 'Monitoring, Built-in dashboards, delivery-api, Overview. Choose a time range of a few hours and read Inbound Request Volume by Response Type.',
      done: (s) => Boolean(s.seen[`dash:${NAME}`]),
    },
    sawLogs(NAME),
    ask(
      'Read the rejection',
      'The log has a WARN line for each rejected call of Driver App. What does it say?',
      [
        'Token was not provided in the request, so the app answers 400',
        `Signature was not validated, or is invalid. The token header has kid ${NEW_KID} and the app checks with the one pasted key`,
        'The exp claim failed, because the tokens of the Driver App expire too early',
        'The client ID in the token has no contract',
      ],
      1,
      `The answer is 401 with the signature message. The token names the key ${NEW_KID} in its kid header, but Key origin Text means one fixed key, and the pasted key cannot verify a token signed by another key. A missing token would give 400 and a failed claim gives the claims message.`,
    ),
    { title: 'Find what changed at 07:00', how: 'Open the Inbox from the menu. Read the mail of the identity team and compare the key endings with the value of jwt.key in Settings, Properties.', done: (s) => Boolean(s.seen.inbox) },
    ask(
      'Explain the kiosks',
      'Driver App gets 401 since 07:00, but Store Kiosk still gets 200. Why?',
      [
        'The kiosks send a client secret and the Driver App does not',
        `The kiosk keeps its token for four hours. It got it at 06:30, before the rotation, so it is signed with ${OLD_KID}, the pasted key. At 10:30 it gets a new token and fails too`,
        'The identity provider is down for the Driver App only',
        'The kiosk calls a different API version',
      ],
      1,
      'Tokens issued before the rotation are still signed with the old key and stay valid until their exp. That hides the problem: part of the traffic works, and the rest breaks one caller at a time as cached tokens are renewed.',
    ),
    {
      title: 'Read the keys from the JWKS URL',
      how: `Runtime Manager, delivery-api, Settings, Properties. Set jwt.keyOrigin to JWKS, jwt.jwksUrl to ${JWKS_URL} and keep jwt.jwksTtl at 60 minutes. Remove jwt.key, which Key origin JWKS does not use. Apply Changes. On a real gateway the same fields are in the JWT Validation policy of API Manager.`,
      done: jwksOn,
    },
    {
      title: 'Prove new tokens pass',
      how: 'Move the clock 5 minutes. The Driver App calls in the traffic answer 200 again.',
      done: (s) => {
        const list = recent(s, NAME, 5).filter((e) => e.c === CALLERS.DRIVER.name)
        return jwksOn(s) && list.length > 0 && list.every((e) => e.s === 200)
      },
    },
    {
      title: 'Prove bad tokens still fail',
      how: 'API client, delivery-api, GET /deliveries. Send once as Old Test Script, whose token expired on Monday, and once as Unknown Signer, whose token names the new kid but was signed by another key. Both must answer 401.',
      done: (s) => jwksOn(s) && since(s, CALLERS.OLD.name).some((e) => e.s === 401) && since(s, CALLERS.FORGED.name).some((e) => e.s === 401),
    },
    ask(
      'Stop the next rotation from hurting',
      'The provider rotates every three months. What keeps the next rotation quiet?',
      [
        'Paste both public keys into jwt.key',
        'Ask the provider for tokens that live a week, so rotations are rare',
        'Keep Key origin JWKS with a caching time to live well below the time the provider publishes a new key before it signs with it, and alert on a rise of 401 answers',
        'Turn the signature check off during the rotation',
      ],
      2,
      'With JWKS the policy reads the key set and the token names its key in kid, so a published key is used with no change on your side. The cache keeps an old key set for up to the time to live, so the new key must be in the set at least that long before the first token uses it. Long lived tokens and an unchecked signature trade an outage for a security hole.',
    ),
  ],
  why: 'A pasted public key works until the provider rotates its keys. From then on every new token fails the signature check with 401, while tokens issued earlier keep passing until they expire, so the outage spreads slowly. Point the JWT Validation policy at the JWKS URL of the provider, set the JWKS Caching Time To Live, and check that expired and wrongly signed tokens are still refused. The lab simplifies: the check runs in the application with properties named after the policy fields, the key set is read at each start and again each time the time to live passes, and the policy page does not say how it uses kid, so the lab matches kid the usual JWKS way.',
  docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-jwt-validation',
  solve(start) {
    let s = mark(mark(mark(start, `dash:${NAME}`), `logs:${NAME}`), 'inbox')
    const a = app(s, NAME)
    const { 'jwt.key': _old, ...secrets } = a.secrets
    s = change(s, NAME, { props: { ...a.props, 'jwt.keyOrigin': 'JWKS', 'jwt.jwksUrl': JWKS_URL, 'jwt.jwksTtl': '60' }, secrets })
    s = advance(s, 5 * MINUTE)
    s = call(s, NAME, CALLERS.OLD, '/deliveries').state
    return call(s, NAME, CALLERS.FORGED, '/deliveries').state
  },
  answers: { 2: 1, 4: 1, 8: 2 },
}

export const LABS = [lab]
