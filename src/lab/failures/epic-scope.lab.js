// The guided lab epic-scope. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, call, change, OPS, sawLogs, until } from '../platform-kit.js'
import { appNamedIn, BASE, grants, KEYSTORE_PASSWORD, newEpic, seedApp, seedKey, setAppScopes, TOKEN_URL } from '../platform-epic.js'
import { LAB_FEED } from './epic-scope.pkg.js'

const EPIC_APP = 'Harbor Care Lab Feed'
const KEY = 'harbor-labfeed-2026-09'
const OBS = 'system/Observation.read'
const y = (s) => s.epic ?? {}
const reg = (s) => appNamedIn(y(s), EPIC_APP)
const props = (s) => app(s, LAB_FEED)?.props ?? {}
const asked = (s) => String(props(s)['epic.scopes'] ?? '').split(/\s+/).filter(Boolean)
const appAsks = (s) => app(s, LAB_FEED)?.status === 'Running' && asked(s).includes(OBS) && asked(s).includes('system/Patient.read') && !asked(s).some((x) => x.includes('*'))
const regAllows = (s) => (reg(s)?.scopes ?? []).includes(OBS) && !(reg(s)?.scopes ?? []).includes('system/*.read')
const labsOk = (s) => {
  const a = app(s, LAB_FEED)
  const tok = (y(s).tokenLog ?? []).some((t) => t.c === reg(s)?.clientId && t.st === 200 && grants(t.sc.split(' '), OBS))
  return appAsks(s) && regAllows(s) && tok && (s.lastCalls ?? []).some((c) => c.app === LAB_FEED && c.status === 200 && /\/labs$/.test(c.path) && c.t >= a.updated)
}

function start() {
  const e = newEpic(at(1, 8))
  seedKey(e, { alias: KEY, t: at(0, 3) })
  const r = seedApp(e, { name: EPIC_APP, scopes: ['system/Patient.read'], kids: [KEY], t: at(0, 3) })
  const s = newPlatform({
    clock: at(1, 8),
    epic: e,
    apps: [
      newApp(LAB_FEED, {
        props: {
          'epic.tokenUrl': TOKEN_URL,
          'epic.fhirBase': BASE,
          'epic.clientId': r.clientId,
          'epic.jwt.keyAlias': KEY,
          'epic.jwt.kid': KEY,
          'epic.jwt.alg': 'RS384',
          'epic.jwt.expSeconds': '300',
          'epic.scopes': 'system/Patient.read',
        },
        secrets: { 'epic.keystore.password': KEYSTORE_PASSWORD },
        store: {},
      }),
    ],
    traffic: [{ app: LAB_FEED, env: 'Sandbox', method: 'GET', path: '/patients/203711/labs', perMinute: 1, every: 3 }],
    mail: [
      {
        t: at(1, 9, 5),
        to: OPS,
        subject: 'Lab results tab shows an error',
        body: `Hello. Since the release of the new Lab results tab this morning the Harbor Care portal shows "Something went wrong" for every patient. Demographics still load. The tab calls ${LAB_FEED}. Harbor Care team`,
        source: 'Harbor Care team',
      },
    ],
  })
  return until(s, at(1, 9, 10))
}

const lab = {
  id: 'p-epic-scope',
  group: 'Epic and healthcare',
  title: 'Patients load, lab results get 403',
  minutes: 20,
  scenario: `${LAB_FEED} went live this morning with a new Lab results tab in the Harbor Care portal. It gets a token from Epic at Bayview Health, finds the patient by MRN, and then searches the lab Observations. The patient search works, the Observation search fails for every patient. Find why and fix it with the least access that does the job.`,
  start,
  steps: [
    { ...sawLogs(LAB_FEED), how: `Runtime Manager, Applications, ${LAB_FEED}, Logs. Find the HTTP:FORBIDDEN on Search Observation and the OperationOutcome Epic sent with it.` },
    {
      title: 'Find the 403 in the Epic audit log',
      how: 'Epic (FHIR) from the console menu, Audit log. The Patient searches answer 200 and every Observation search answers 403. Read the reason of a 403 row.',
      done: (s) => Boolean(s.seen['epic:audit']),
    },
    ask(
      'Why 403 and not 401',
      'The token request worked and the Patient search works. Why does the Observation search answer 403, not 401?',
      [
        '401 and 403 mean the same thing in FHIR',
        'The token is valid, so the app is known and there is no 401. The token does not grant system/Observation.read, so Epic refuses that resource with 403 Forbidden and an OperationOutcome',
        'Bayview blocks the IP address of the app for lab data',
        'The patient has no lab results',
      ],
      1,
      '401 means the server does not accept who you are: no token, an expired token or a token it does not know. 403 means it knows you and you may not do this. With SMART the line is the scope: the token carries the scopes it was granted, and each FHIR call needs the scope of its resource. A patient with no results gives 200 with total 0, not an error.',
    ),
    {
      title: 'Read the granted scope',
      how: `Epic (FHIR), Token requests. The rows of ${EPIC_APP} answer 200 with scope system/Patient.read only. The app asks for that scope in epic.scopes, and the registration has nothing more.`,
      done: (s) => Boolean(s.seen['epic:tokens']),
    },
    {
      title: 'Ask for the Observation scope',
      how: `Runtime Manager, ${LAB_FEED}, Settings, Properties. Set epic.scopes to system/Patient.read system/Observation.read and Apply Changes. Call the API: now the token request fails with 400 invalid_scope, because the app may not ask for more than its registration allows.`,
      done: appAsks,
    },
    {
      title: 'Allow it on the app registration',
      how: `Epic (FHIR), Backend apps, ${EPIC_APP}. Under Incoming APIs tick system/Observation.read and press Save APIs. Do not pick system/*.read.`,
      done: regAllows,
    },
    {
      title: 'See the lab results',
      how: `API client from the console menu, application ${LAB_FEED}, GET /patients/203711/labs. It answers 200 with the lab results. Token requests shows the new scope, and the Audit log shows the Observation search with 200.`,
      done: labsOk,
    },
    ask(
      'Least privilege',
      'To avoid the next 403, a colleague wants system/*.read on the app registration and in epic.scopes. What do you answer?',
      [
        'Fine. Read access cannot do harm',
        'No. The feed needs Patient and Observation. system/*.read would also read encounters, appointments and every other record of every patient at Bayview, and a leaked private key would expose all of it. Ask for each scope the use case needs, and let Bayview approve each one',
        'No, because a wildcard makes every call slower',
        'Yes, but only in Sandbox',
      ],
      1,
      'Backend services tokens are not tied to one patient: system scopes reach the whole population of the hospital. Health data rules such as the minimum necessary standard of HIPAA expect access limited to the purpose. Each Epic API on an app is reviewed by the customer, so a narrow list is also faster to approve.',
    ),
  ],
  why: 'In SMART backend services the app registration says which scopes an app may have, the token request names the scopes it wants, and the token carries what was granted. Asking for a scope the registration lacks gives 400 invalid_scope at the token endpoint; calling a resource the token does not grant gives 403 with an OperationOutcome. So a 403 is a scope question, not a key or a password question: read the granted scope of the token, add the missing scope on both sides, and keep it to what the use case needs. In the lab each Epic API group maps to one SMART v1 scope, and the token endpoint grants every API on the app when the request names no scope.',
  docs: 'https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html',
  solve(s0) {
    let s = mark(mark(mark(s0, `logs:${LAB_FEED}`), 'epic:audit'), 'epic:tokens')
    s = change(s, LAB_FEED, { props: { ...props(s), 'epic.scopes': 'system/Patient.read system/Observation.read' } })
    s = call(s, LAB_FEED, null, '/patients/203711/labs').state
    s = setAppScopes(s, reg(s).clientId, ['system/Patient.read', OBS]).state
    return call(s, LAB_FEED, null, '/patients/203711/labs').state
  },
  answers: { 2: 1, 7: 1 },
}

export const LABS = [lab]
