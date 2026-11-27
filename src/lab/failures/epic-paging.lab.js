// The guided lab epic-paging. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { appNamedIn, BASE, browse, KEYSTORE_PASSWORD, MAX_COUNT, newEpic, obsOf, patientByMrn, seedApp, seedKey, TOKEN_URL } from '../platform-epic.js'
import { VITALS, VITALS_FLOW } from './epic-paging.pkg.js'

const EPIC_APP = 'Brightmart Care Vitals'
const KEY = 'brightmart-vitals-2026-10'
const MRNS = ['203711', '203714', '203715']
const y = (s) => s.epic ?? {}
const reg = (s) => appNamedIn(y(s), EPIC_APP)
const props = (s) => app(s, VITALS)?.props ?? {}
const isOn = (s, k) => app(s, VITALS)?.status === 'Running' && String(props(s)[k] ?? '').trim().toLowerCase() === 'true'
const saw429 = (s) => (y(s).audit ?? []).some((a) => a.c === reg(s)?.clientId && a.st === 429)
const complete = (s) => {
  const a = app(s, VITALS)
  const last = a?.schedules.find((x) => x.flow === VITALS_FLOW)?.last
  if (!isOn(s, 'sync.followNext') || !isOn(s, 'sync.retryOn429') || !last?.ok || last.t < a.updated) return false
  return MRNS.every((m) => {
    const p = patientByMrn(y(s), m)
    return p && a.store?.patients?.[m]?.stored === obsOf(y(s), p.id, 'vital-signs').length && a.store.patients[m].t >= a.updated
  })
}

function start() {
  const e = newEpic(at(1, 6))
  seedKey(e, { alias: KEY, t: at(0, 2) })
  const r = seedApp(e, { name: EPIC_APP, scopes: ['system/Patient.read', 'system/Observation.read'], kids: [KEY], t: at(0, 2) })
  const s = newPlatform({
    clock: at(1, 6),
    epic: e,
    apps: [
      newApp(VITALS, {
        props: {
          'epic.tokenUrl': TOKEN_URL,
          'epic.fhirBase': BASE,
          'epic.clientId': r.clientId,
          'epic.jwt.keyAlias': KEY,
          'epic.jwt.kid': KEY,
          'epic.jwt.alg': 'RS384',
          'epic.jwt.expSeconds': '300',
          'epic.scopes': 'system/Patient.read system/Observation.read',
          'sync.mrns': MRNS.join(','),
          'sync.pageSize': '10',
          'sync.followNext': 'false',
          'sync.retryOn429': 'false',
        },
        secrets: { 'epic.keystore.password': KEYSTORE_PASSWORD },
        store: {},
      }),
    ],
    mail: [
      {
        t: at(1, 8, 50),
        to: OPS,
        subject: 'Vital signs missing in Brightmart Care',
        body: `Good morning. Mira Tallon, MRN 203711, has been on the ward at Bayview for two days with vital signs every 6 hours. Brightmart Care shows only her 10 newest readings, and the same for Elias Quint (203714) and Rosa Abernath (203715). The trend charts start yesterday evening. Bayview nursing informatics`,
        source: 'Bayview nursing informatics',
      },
    ],
  })
  return until(s, at(1, 9, 5))
}

const lab = {
  id: 'p-epic-paging',
  group: 'Epic and healthcare',
  title: 'Only the first page of vital signs',
  minutes: 25,
  scenario: `${VITALS} copies the vital signs of three Brightmart Care patients from Epic at Bayview Health every 15 minutes. Every run is green, yet the nurses see only the 10 newest readings per patient. Find what the sync misses, make it read every page, and make it survive the rate limit of Bayview.`,
  start,
  steps: [
    { title: 'Read the mail of Bayview', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(VITALS), how: `Runtime Manager, Applications, ${VITALS}, Logs. Each run says 10 vital signs stored for each patient. No error.` },
    {
      title: 'Page through the search in Epic',
      how: `Epic (FHIR) from the console menu, FHIR browser. Send Patient?identifier=MRN|203711, then press Vital signs on the patient. The searchset Bundle has total 48, 10 entries and a link next. Press Follow link next and see the next 10.`,
      done: (s) => Boolean(s.seen['epic:next']),
    },
    ask(
      'Why 10 and not 48',
      'What does the sync do wrong?',
      [
        'Epic keeps only 10 readings per patient',
        'A FHIR search answers one page at a time. The Bundle says total 48 and gives a link next, and the sync stores the entries of the first page and stops',
        'The access token allows only 10 results',
        'The sync runs too seldom',
      ],
      1,
      'A searchset Bundle holds one page: entry has at most _count resources, total counts every match, and link next points at the next page. A client reads entries and follows next until there is no next link. A green run that never looks at total or next loses data without an error.',
    ),
    ask(
      'Raise _count instead',
      'A colleague wants to set sync.pageSize to 1000 so that one page holds everything. Is that the fix?',
      [
        'Yes, then there is never a second page',
        `No. The server decides the page size and may give fewer than asked; Bayview gives at most ${MAX_COUNT}. A patient on a long stay has hundreds of readings. Always follow link next until it is gone`,
        'Yes, but only at night',
        'No, because _count is not a FHIR parameter',
      ],
      1,
      `_count is a hint. FHIR lets a server cap it, and Epic pages its results. Bigger pages also mean bigger and slower answers. In the lab the cap is ${MAX_COUNT}.`,
    ),
    {
      title: 'Follow link next',
      how: `Runtime Manager, ${VITALS}, Settings, Properties. Set sync.followNext to true and Apply Changes. Keep sync.pageSize at 10. Then Schedules, ${VITALS_FLOW}, Run.`,
      done: (s) => isOn(s, 'sync.followNext'),
    },
    {
      title: 'Honour Retry-After',
      how: `The run now fails with HTTP:TOO_MANY_REQUESTS. Epic (FHIR), Audit log shows the 429 rows and the reason; the app log shows the Retry-After header. Set sync.retryOn429 to true and Apply Changes, so the app waits that long and tries again.`,
      done: (s) => isOn(s, 'sync.retryOn429') && saw429(s) && Boolean(s.seen['epic:audit']),
    },
    {
      title: 'Prove every reading arrives',
      how: `Schedules, ${VITALS_FLOW}, Run, or move the clock 15 minutes. The log says 48, 36 and 30 vital signs stored, with the retries and the wait. Compare each with the total of its search in the FHIR browser.`,
      done: complete,
    },
    ask(
      'What to do on a 429',
      'How should an integration answer a 429 from Epic?',
      [
        'Retry at once in a tight loop until it works',
        'Wait the seconds in Retry-After, then try the same request again, with a limit on the retries. If it keeps failing, fail the run so the alert fires, and let the next run continue',
        'Ask Bayview for a second client ID and spread the calls',
        'Ignore it and go on with the next patient',
      ],
      1,
      'A 429 says slow down. Retry-After tells how long. A tight loop makes it worse, a second client ID breaks the agreement with the hospital, and skipping a patient loses data. Retry with the wait and a cap, the way the Until Successful scope or a reconnection strategy would, and keep the run red when the cap is reached.',
    ),
  ],
  why: `A FHIR search is paged: a searchset Bundle has total, up to _count entries, and a link next while there is more. Read every page through link next, and treat _count as a hint the server may cap. More calls meet the rate limit of the hospital: a 429 comes with Retry-After, so wait that long, retry with a cap, and fail loudly when the cap is reached. Check the result against total, not against a green run. In the lab Bayview allows 9 FHIR calls in 10 seconds per client and pages of at most ${MAX_COUNT}; Epic does not publish its real limits.`,
  docs: 'https://hl7.org/fhir/R4/http.html',
  solve(s0) {
    let s = mark(mark(s0, 'inbox'), `logs:${VITALS}`)
    const pid = patientByMrn(y(s), '203711').id
    const first = browse(s, `Observation?patient=${pid}&category=vital-signs`)
    s = browse(first.state, first.result.body.link.find((l) => l.relation === 'next').url).state
    s = mark(s, 'epic:next')
    s = change(s, VITALS, { props: { ...props(s), 'sync.followNext': 'true' } })
    s = mark(runNow(s, VITALS, VITALS_FLOW), 'epic:audit')
    s = change(s, VITALS, { props: { ...props(s), 'sync.retryOn429': 'true' } })
    return runNow(s, VITALS, VITALS_FLOW)
  },
  answers: { 3: 1, 4: 1, 8: 1 },
}

export const LABS = [lab]
