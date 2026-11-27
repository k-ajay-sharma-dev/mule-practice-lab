// The guided lab epic-jwt. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { addPublicKey, appNamedIn, KEYSTORE_PASSWORD, keyOf, newEpic, publicKeysOf, removePublicKey, seedApp, seedKey, TOKEN_URL, BASE } from '../platform-epic.js'
import { ROSTER, ROSTER_FLOW } from './epic-jwt.pkg.js'

const EPIC_APP = 'Harbor Care Roster'
const OLD = 'harbor-epic-2026-05'
const NEW = 'harbor-epic-2026-11'
const y = (s) => s.epic ?? {}
const reg = (s) => appNamedIn(y(s), EPIC_APP)
const props = (s) => app(s, ROSTER)?.props ?? {}
const hasKey = (s, kid) => publicKeysOf(y(s), reg(s)).some((k) => k.kid === kid && (kid !== NEW || k.thumb === keyOf(y(s), NEW)?.thumb))
const tokensOf = (s) => (y(s).tokenLog ?? []).filter((t) => t.c === reg(s)?.clientId)
const fixedApp = (s) => app(s, ROSTER)?.status === 'Running' && props(s)['epic.jwt.kid'] === NEW && props(s)['epic.jwt.keyAlias'] === NEW
const working = (s) => {
  const a = app(s, ROSTER)
  return fixedApp(s) && tokensOf(s).some((t) => t.st === 200 && t.kid === NEW && t.t >= a.updated) && (a.store?.lastOk ?? -1) >= a.updated
}

function start() {
  const e = newEpic(at(1, 1, 50))
  seedKey(e, { alias: OLD, t: at(0, 1) })
  const r = seedApp(e, { name: EPIC_APP, scopes: ['system/Patient.read'], kids: [OLD], t: at(0, 1) })
  const s = newPlatform({
    clock: at(1, 1, 50),
    epic: e,
    apps: [
      newApp(ROSTER, {
        props: {
          'epic.tokenUrl': TOKEN_URL,
          'epic.fhirBase': BASE,
          'epic.clientId': r.clientId,
          'epic.jwt.keyAlias': OLD,
          'epic.jwt.kid': OLD,
          'epic.jwt.alg': 'RS384',
          'epic.jwt.expSeconds': '300',
          'care.mrns': '203711,203714,203715,203717',
        },
        secrets: { 'epic.keystore.password': KEYSTORE_PASSWORD },
        store: {},
      }),
    ],
    traffic: [{ app: ROSTER, env: 'Sandbox', method: 'GET', path: '/roster', perMinute: 1, every: 5 }],
  })
  // 02:00: the security team rotates the key store. The old private key is destroyed and the app signs with the new one.
  let t = until(s, at(1, 2))
  t.epic.keystore = t.epic.keystore.filter((k) => k.alias !== OLD)
  seedKey(t.epic, { alias: NEW, t: at(1, 2) })
  t = change(t, ROSTER, { props: { ...app(t, ROSTER).props, 'epic.jwt.keyAlias': NEW } })
  t.mail.push({
    t: at(1, 2, 10),
    to: OPS,
    subject: 'Epic signing key rotated',
    body: `Hello. As planned we rotated the signing key of ${ROSTER} tonight. The key store now holds alias ${NEW}; the old private key ${OLD} is destroyed. The app was redeployed with epic.jwt.keyAlias ${NEW}. Its public key is in Epic (FHIR), Harbor keys. Harbor security team`,
    source: 'Harbor security team',
  })
  t = until(t, at(1, 9))
  t.mail.push({ t: at(1, 9), to: OPS, subject: 'Care roster is empty', body: 'Good morning. The Harbor Care app shows no patients for Bayview Health since last night. The nurses cannot plan the home visits. Harbor Care team', source: 'Harbor Care team' })
  return t
}

const lab = {
  id: 'p-epic-jwt',
  group: 'Epic and healthcare',
  title: 'Every token request gets invalid_client',
  minutes: 25,
  scenario: `${ROSTER} reads the Harbor Care roster from Epic at Bayview Health with SMART backend services: a signed JWT buys an access token, and the token reads the patients. Since 02:00 every token request fails and the roster is empty. The security team rotated the signing key last night. Find out why Epic refuses the JWT and bring the roster back without weakening anything.`,
  start,
  steps: [
    { ...sawLogs(ROSTER), how: `Runtime Manager, Applications, ${ROSTER}, Logs. Find the HTTP:BAD_REQUEST of the Request access token step and the body {"error":"invalid_client","error_description":null}. Epic does not say why.` },
    {
      title: 'Read the token requests at Bayview',
      how: `Epic (FHIR) from the console menu, Token requests. The rows of ${EPIC_APP} show 400 invalid_client. The Reason column is what the Epic team of Bayview sees in its own log, and the app never gets it.`,
      done: (s) => Boolean(s.seen['epic:tokens']),
    },
    ask(
      'Why Epic refuses the JWT',
      'What is wrong with the client assertion?',
      [
        'Epic is down, so the token endpoint answers 400 to every client',
        `The app signs the JWT with the new private key ${NEW}, but the header still says kid ${OLD}, and the app registration only has the old public key. Epic picks the public key by the kid, the signature does not verify, and it answers invalid_client`,
        'The client secret of the app has expired',
        'The access token expired after 60 minutes and the app does not ask for a new one',
      ],
      1,
      'A backend app has no client secret. It proves who it is with a JWT signed by its private key. Epic reads the kid in the JWT header, takes the public key with that kid from the app registration (uploaded or from the JWK Set URL) and checks the signature. A new private key needs its public key at Epic and the matching kid in the header.',
    ),
    {
      title: 'Give Epic the new public key',
      how: `Epic (FHIR), Harbor keys: ${NEW} shows its public JWK. Then Backend apps, ${EPIC_APP}. Under Public keys pick ${NEW} and press Add public key. Keep ${OLD} for now. Using the JWK Set URL with ${NEW} published under Harbor keys works too.`,
      done: (s) => hasKey(s, NEW),
    },
    {
      title: 'Send the new kid',
      how: `Runtime Manager, ${ROSTER}, Settings, Properties. Set epic.jwt.kid to ${NEW}, the same as epic.jwt.keyAlias, and Apply Changes.`,
      done: fixedApp,
    },
    {
      title: 'See a token and the roster',
      how: `Runtime Manager, ${ROSTER}, Schedules, ${ROSTER_FLOW}, Run, or move the clock 5 minutes. Epic (FHIR), Token requests shows 200 with kid ${NEW} and the granted scope, and the Audit log shows the Patient searches with 200.`,
      done: working,
    },
    ask(
      'One JWT for the whole day',
      'A colleague wants to make one JWT at deploy time with exp a day ahead and send it with every token request, to save CPU. What happens?',
      [
        'It works. Epic only checks the signature',
        'Epic refuses it. exp may be at most 5 minutes after now, and each jti may be used only once, so a second use is a replay. Make a new JWT with a new jti for each token request, and cache the access token instead',
        'It works if the JWT is signed with RS256',
        'Epic accepts it once per hour',
      ],
      1,
      'SMART backend services limits the client assertion to 5 minutes and asks the server to refuse a jti it has seen before. The thing to reuse is the access token: it lives for expires_in seconds, 3600 at Bayview, so the app asks for a new one shortly before it expires.',
    ),
    {
      title: 'Remove the retired key',
      how: `Epic (FHIR), Backend apps, ${EPIC_APP}, Public keys. Press Remove on ${OLD}. Its private key is destroyed, so the public key has no use and only widens what Epic trusts. The next token request must still give 200.`,
      done: (s) => working(s) && !hasKey(s, OLD) && tokensOf(s).at(-1)?.st === 200,
    },
    ask(
      'Rotate without an outage',
      'How should the next rotation go so that no token request fails?',
      [
        'Change the private key and the kid in the same minute at night',
        'Give Epic the new public key first, uploaded or published on the JWK Set URL, so it trusts both keys. Then switch the app to the new key and its kid. Remove the old public key when no token request uses it any more',
        'Stop the app while the keys change',
        'Keep one key forever, so it never needs a rotation',
      ],
      1,
      'Overlap is the trick: publish, switch, retire. A JWK Set URL makes the first step a change on the Harbor side only, because Epic reads the keys from it. Epic may cache that set, so publish the new key well before the switch.',
    ),
  ],
  why: `SMART backend services replaces the client secret with a signed JWT. The app signs it with its private key and puts the kid of the key in the header; Epic checks it with the public key that has that kid on the app registration, and also checks iss and sub (the client ID), aud (the token URL), an exp at most 5 minutes ahead and a jti it has not seen. Any failure gives 400 invalid_client with no reason, so read the log of the authorization server, here the Token requests of Bayview. A key rotation is publish, switch, retire: the new public key at Epic first, then the new key and kid in the app, then remove the old key. In the lab the Reason column stands for the log the Epic team of Bayview can read; Epic answers 400 where some servers use 401.`,
  docs: 'https://hl7.org/fhir/smart-app-launch/backend-services.html',
  solve(s0) {
    let s = mark(mark(s0, `logs:${ROSTER}`), 'epic:tokens')
    const id = reg(s).clientId
    s = addPublicKey(s, id, NEW).state
    s = change(s, ROSTER, { props: { ...props(s), 'epic.jwt.kid': NEW } })
    s = runNow(s, ROSTER, ROSTER_FLOW)
    s = removePublicKey(s, id, OLD).state
    s = advance(s, MINUTE)
    return runNow(s, ROSTER, ROSTER_FLOW)
  },
  answers: { 2: 1, 6: 1, 8: 1 },
}

export const LABS = [lab]
