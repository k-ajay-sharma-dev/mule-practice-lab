// The guided lab epic-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, deployApp, finishDeploys, mark, newPlatform, runNow } from '../platform.js'
import { app, ask, call, called, OPS, until } from '../platform-kit.js'
import {
  addPublicKey, ALGS, BASE, createBackendApp, generateKeyPair, KEYSTORE_PASSWORD, keyOf, MAX_EXP, newEpic, obsOf, patientByMrn, publicKeysOf, seedApp, seedKey, setAppScopes, TOKEN_URL,
} from '../platform-epic.js'
import { PATIENT_SYNC, SYNC_FLOW } from './epic-setup.pkg.js'

const EPIC_APP = 'Harbor Care Patient Sync'
const MRNS = ['203711', '203714', '203715']
const ALIAS = 'harbor-sync-2026-11'
const ALERT_TO = 'care-integrations@harbor.example'
const LEAST = ['system/Patient.read', 'system/Observation.read']
const word = (v) => String(v ?? '').trim()
const y = (s) => s.epic ?? {}
const reg = (s) => (y(s).apps ?? []).find((a) => a.name.toLowerCase() === EPIC_APP.toLowerCase())
const a = (s) => app(s, PATIENT_SYNC)
const props = (s) => a(s)?.props ?? {}
const otherKids = (s) => (y(s).apps ?? []).filter((x) => x !== reg(s)).flatMap((x) => x.keys.map((k) => k.kid))
// a key of the Harbor key store whose public key Epic has for the new app, and no other app uses
const ownKey = (s, kid) => {
  const k = (y(s).keystore ?? []).find((x) => !kid || x.kid === kid)
  return k && !otherKids(s).includes(k.kid) && publicKeysOf(y(s), reg(s)).some((p) => p.kid === k.kid && p.thumb === k.thumb) ? k : null
}
const keyReady = (s) => (y(s).keystore ?? []).some((k) => ownKey(s, k.kid))
const leastScopes = (s) => {
  const sc = reg(s)?.scopes ?? []
  return sc.length === LEAST.length && LEAST.every((x) => sc.includes(x))
}
const deployedOk = (s) => {
  const x = a(s)
  if (x?.status !== 'Running' || !reg(s)) return false
  const p = props(s)
  const key = keyOf(y(s), p['epic.jwt.keyAlias'])
  const scopes = word(p['epic.scopes']).split(/\s+/).filter(Boolean)
  const leaked = Object.values(p).some((v) => word(v) === KEYSTORE_PASSWORD || /PRIVATE KEY/i.test(String(v)))
  return (
    word(p['epic.tokenUrl']) === TOKEN_URL &&
    word(p['epic.fhirBase']) === BASE &&
    word(p['epic.clientId']) === reg(s).clientId &&
    Boolean(key) &&
    word(p['epic.jwt.kid']) === key.kid &&
    Boolean(ownKey(s, key.kid)) &&
    (!word(p['epic.jwt.alg']) || ALGS.includes(word(p['epic.jwt.alg']))) &&
    (!word(p['epic.jwt.expSeconds']) || (Number(p['epic.jwt.expSeconds']) > 0 && Number(p['epic.jwt.expSeconds']) <= MAX_EXP)) &&
    scopes.every((v) => LEAST.includes(v)) &&
    word(p['sync.mrns']).split(',').map(word).sort().join() === [...MRNS].sort().join() &&
    x.secrets?.['epic.keystore.password'] === KEYSTORE_PASSWORD &&
    p['epic.keystore.password'] === undefined &&
    !leaked
  )
}
const tokenOk = (s) => deployedOk(s) && Boolean(s.seen['epic:tokens']) && called(s, PATIENT_SYNC, 200, 'GET', /^\/health/) && (y(s).tokenLog ?? []).some((t) => t.c === reg(s).clientId && t.st === 200)
const synced = (s) => {
  const x = a(s)
  const last = x?.schedules.find((f) => f.flow === SYNC_FLOW)?.last
  if (!deployedOk(s) || !last?.ok || !s.seen['epic:browser']) return false
  return MRNS.every((m) => {
    const p = patientByMrn(y(s), m)
    return p && x.store?.patients?.[m]?.vitals === obsOf(y(s), p.id, 'vital-signs').length
  })
}

const MAIL = {
  t: at(1, 8, 30),
  to: OPS,
  subject: 'New Epic integration: Harbor Care patient sync',
  body: [
    'Hello integration team,',
    `Bayview Health has signed the remote monitoring program. Please set up ${PATIENT_SYNC}, which is built and waiting in Runtime Manager:`,
    `1. Register a backend app named ${EPIC_APP} on the Epic side of Bayview (token URL ${TOKEN_URL}, FHIR base ${BASE}).`,
    '2. It reads demographics and vital signs. Nothing else is approved by the Bayview privacy office.',
    `3. Make a new signing key for it, alias ${ALIAS}, kid the same. Do not reuse the key of the roster app. The key store password is ${KEYSTORE_PASSWORD}, a practice value of the lab. Keep it protected.`,
    `4. The enrolled patients are MRN ${MRNS.join(', ')} (sync.mrns).`,
    `5. Failures go to ${ALERT_TO}.`,
    'Done means the three patients and all their vital signs show in our sync, and a wrong MRN does not break anything.',
    'Harbor Care program lead',
  ].join('\n\n'),
  source: 'Harbor Care program lead',
}

const lab = {
  id: 'p-epic-setup',
  group: 'Epic and healthcare',
  title: 'Set up the Epic patient sync for Harbor Care',
  minutes: 40,
  scenario: `Harbor Care starts remote monitoring for patients of Bayview Health. ${PATIENT_SYNC} is built and its jar is in Runtime Manager, but nothing is configured: Bayview has no backend app for it, there is no key, and the app has no properties. Register the app at Epic, give it a key and the least scopes, deploy with the key kept secret, then prove a token, the data and a bad MRN, and add an alert. The Inbox has the request.`,
  start() {
    const e = newEpic(at(1, 8))
    seedKey(e, { alias: 'harbor-epic-2026-11', t: at(0, 2) })
    seedApp(e, { name: 'Harbor Care Roster', scopes: ['system/Patient.read'], kids: ['harbor-epic-2026-11'], t: at(0, 2) })
    const s = newPlatform({ clock: at(1, 8), jars: [PATIENT_SYNC], epic: e, mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the app name, the data allowed, the key alias, the MRNs and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Register the backend app',
      how: `Epic (FHIR) from the console menu, Backend apps, Create. Application name ${EPIC_APP}, Application audience Backend Systems. Press Create app. Epic gives it a non-production and a production client ID.`,
      done: (s) => Boolean(reg(s)),
    },
    {
      title: 'Pick the least scopes',
      how: `Open ${EPIC_APP}. Under Incoming APIs tick only system/Patient.read and system/Observation.read, the demographics and vital signs of the request, and press Save APIs. Not system/*.read, not Encounter, not Appointment.`,
      done: leastScopes,
    },
    {
      title: 'Make the key pair and give Epic the public key',
      how: `Epic (FHIR), Harbor keys. Under Generate key pair enter Alias ${ALIAS} and Key ID (kid) ${ALIAS}, and press Generate key pair. Then Backend apps, ${EPIC_APP}, Public keys: pick ${ALIAS} and press Add public key. Publishing it on the Harbor JWK Set URL and saving that URL on the app works too.`,
      done: keyReady,
    },
    ask(
      'Where the keys live',
      'Where does each part of the key pair go?',
      [
        'Upload the private key to Epic, so Epic can sign for the app',
        'The private key stays in the key store of the app at Harbor, and the key store password goes in a protected property. Epic gets only the public key, uploaded or from the JWK Set URL, under the kid the app puts in the JWT header',
        'Put the private key in a plain property, so operations can check it',
        'Mail the private key to the Epic team of Bayview',
      ],
      1,
      'Asymmetric keys exist so the secret never travels. Whoever holds the private key can get tokens for every patient the app may read, so it stays with the app, behind a protected password or a vault. The public key is safe to share: it only verifies.',
    ),
    {
      title: 'Deploy with the Epic properties',
      how: `Runtime Manager, Deploy application, name ${PATIENT_SYNC}, file ${PATIENT_SYNC}-1.0.0-mule-application.jar. Properties: epic.tokenUrl and epic.fhirBase from the mail, epic.clientId the non-production client ID of ${EPIC_APP}, epic.jwt.keyAlias and epic.jwt.kid ${ALIAS}, epic.jwt.alg RS384, epic.jwt.expSeconds 300, epic.scopes system/Patient.read system/Observation.read, sync.mrns ${MRNS.join(',')}. Add epic.keystore.password and select Protect. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${PATIENT_SYNC}`]),
    },
    {
      title: 'Get a token',
      how: `API client from the console menu, application ${PATIENT_SYNC}, GET /health. It answers UP with the granted scope. Epic (FHIR), Token requests shows the 200 for ${EPIC_APP} with your kid.`,
      done: tokenOk,
    },
    {
      title: 'Sync the patients and check the counts',
      how: `Runtime Manager, ${PATIENT_SYNC}, Schedules, ${SYNC_FLOW}, Run. The log gives the vital signs synced per patient. Epic (FHIR), FHIR browser: search each MRN, press Vital signs and compare the total with the log: 48, 36 and 30.`,
      done: synced,
    },
    {
      title: 'Try a wrong MRN',
      how: `API client, ${PATIENT_SYNC}, GET /patients/999999. Epic answers the search with 200 and total 0, and the app answers 404 with a clear message, not 500. The log has a WARN line. The app keeps running.`,
      done: (s) => synced(s) && called(s, PATIENT_SYNC, 404, 'GET', /^\/patients\/\w+/) && a(s).status === 'Running',
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${PATIENT_SYNC}, metric Message Error Count, Above 0, recipient ${ALERT_TO} from the mail.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === PATIENT_SYNC && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    ask(
      'Tokens in a busy sync',
      'Each run calls Epic about 15 times. How should the app handle tokens?',
      [
        'Ask for a new access token before each FHIR call',
        'Ask for one token, keep it in the object store and reuse it until shortly before expires_in runs out. Each new token request gets a new JWT with a new jti and an exp at most 5 minutes ahead',
        'Sign one JWT at startup and send it with every token request',
        'Ask Bayview for a token that never expires',
      ],
      1,
      'An access token from the backend services flow lives for expires_in seconds, 3600 at Bayview. Reusing it saves a signature and a round trip per call and keeps the token endpoint quiet. The JWT is the opposite: it is a one time proof, so a new jti each time, and a short exp.',
    ),
  ],
  why: `An Epic backend integration in short: register a backend app at the hospital, pick only the APIs the use case needs, make a key pair per app and give Epic only the public key (upload or JWK Set URL), keep the private key in the key store of the app with its password protected, and deploy with the token URL, FHIR base, client ID, key alias and kid. Then prove it: a token with the right scope, every page of the data compared with the totals in Epic, a wrong MRN answered with 404 and not lost in a 500, and an alert for failures. In the lab the Harbor keys page stands for the key store tooling of Harbor, and Epic grants an app right after it is saved; at a real hospital the client ID needs time to sync and each API needs approval.`,
  docs: 'https://hl7.org/fhir/smart-app-launch/backend-services.html',
  solve(start) {
    let s = mark(start, 'inbox')
    const made = createBackendApp(s, { name: EPIC_APP })
    s = made.state
    const id = made.result.clientId
    s = setAppScopes(s, id, LEAST).state
    s = generateKeyPair(s, { alias: ALIAS, kid: ALIAS }).state
    s = addPublicKey(s, id, ALIAS).state
    const form = {
      name: PATIENT_SYNC,
      pkg: PATIENT_SYNC,
      jar: `${PATIENT_SYNC}-1.0.0-mule-application.jar`,
      replicas: 1,
      vCores: 0.1,
      props: { 'epic.tokenUrl': TOKEN_URL, 'epic.fhirBase': BASE, 'epic.clientId': id, 'epic.jwt.keyAlias': ALIAS, 'epic.jwt.kid': ALIAS, 'epic.jwt.alg': 'RS384', 'epic.jwt.expSeconds': '300', 'epic.scopes': LEAST.join(' '), 'sync.mrns': MRNS.join(',') },
      secrets: { 'epic.keystore.password': KEYSTORE_PASSWORD },
    }
    s = mark(finishDeploys(deployApp(s, form).state), `logs:${PATIENT_SYNC}`)
    s = mark(call(s, PATIENT_SYNC, null, '/health').state, 'epic:tokens')
    s = mark(runNow(s, PATIENT_SYNC, SYNC_FLOW), 'epic:browser')
    s = call(s, PATIENT_SYNC, null, '/patients/999999').state
    return addMonAlert(s, { title: 'Patient sync failed', resource: 'Application', name_: PATIENT_SYNC, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 4: 1, 10: 1 },
}

export const LABS = [lab]
