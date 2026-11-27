// The guided lab graph-upload-session. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { DAY, emptyMsgraph, FRAGMENT, guidOf, MAX_FRAGMENT, newItem, newRegistration, newSite, TENANT_ID } from '../platform-msgraph.js'
import { ARCHIVE } from './graph-upload-session.pkg.js'

const APP_ID = guidOf('reg:harbor-sp-scan-archive')
const FOLDER = '2026-11'
const BIG = [
  ['DN-20261103-0012.pdf', 6712004],
  ['DN-20261103-0013.pdf', 12688311],
  ['DN-20261103-0015.pdf', 24851250],
]
const SMALL = [
  ['DN-20261103-0011.pdf', 1890112],
  ['DN-20261103-0014.pdf', 2730441],
]
const prop = (s, k) => String(app(s, ARCHIVE)?.props?.[k] ?? '').trim()
const running = (s) => app(s, ARCHIVE)?.status === 'Running'
const sessionOn = (s) => running(s) && prop(s, 'sp.uploadMode') === 'session'
const chunkOk = (s) => {
  const n = Number(prop(s, 'sp.chunkSize'))
  return sessionOn(s) && Number.isInteger(n) && n > 0 && n % FRAGMENT === 0 && n <= MAX_FRAGMENT
}
const drive = (s) => s.msgraph?.sites?.find((x) => x.name === 'Logistics')?.drives[0]
const arrived = (s) => BIG.every(([n, size]) => drive(s)?.items.some((i) => i.name === `${FOLDER}/${n}` && i.size === size))

function graph(now) {
  const m = emptyMsgraph(now)
  const t0 = now - 150 * DAY
  const reg = newRegistration(m, {
    name: ARCHIVE,
    appId: APP_ID,
    t: t0,
    secrets: [{ desc: 'mule-sandbox', start: t0, end: now + 200 * DAY }],
    perms: [{ api: 'Microsoft Graph', name: 'Sites.Selected', type: 'Application' }],
    granted: ['Microsoft Graph|Sites.Selected|Application'],
  })
  const site = newSite(m, 'Logistics', ['Delivery notes'])
  site.grants[APP_ID] = 'write'
  for (let i = 1; i <= 6; i++) newItem(site.drives[0], `2026-11/DN-20261102-000${i}.pdf`, 900000 + i * 210000, at(0, 14, i * 5), ARCHIVE)
  return { m, secret: reg.secrets[0].value, drive: site.drives[0].id }
}

const lab = {
  id: 'p-graph-upload-session',
  group: 'HR, ITSM and CRM',
  title: 'Large scans never reach SharePoint',
  minutes: 20,
  scenario: `${ARCHIVE} uploads the scanned delivery notes of the warehouse to the Delivery notes library of the Logistics site, over Microsoft Graph. Since the new scanner went live this morning some scans come out much bigger: multi page notes at full resolution. The small ones arrive, the big ones fail on every run and the warehouse asks where they are. Get every scan into the library.`,
  start() {
    const g = graph(at(1, 8))
    const s = newPlatform({
      clock: at(1, 8, 20),
      msgraph: g.m,
      apps: [
        newApp(ARCHIVE, {
          props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': APP_ID, 'graph.driveId': g.drive, 'sp.folder': FOLDER, 'sp.uploadMode': 'simple', 'sp.chunkSize': '1000000' },
          secrets: { 'azure.clientSecret': g.secret },
          store: { pending: [...SMALL, ...BIG].sort().map(([name, size]) => ({ name, size })), done: [] },
        }),
      ],
      mail: [
        {
          t: at(1, 8, 52),
          to: OPS,
          subject: 'Delivery notes missing in SharePoint',
          body: 'Hello, the delivery notes 0012, 0013 and 0015 of this morning are not in the Delivery notes library, the others are. They are the long multi page ones from the new scanner. The drivers need them for the afternoon run. Harbor warehouse Leeds',
          source: 'Harbor warehouse Leeds',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    sawLogs(ARCHIVE),
    ask(
      'Read the 413',
      'The upload of DN-20261103-0013.pdf fails with 413 requestEntityTooLarge. What limit did it hit?',
      [
        'The library is full',
        'The simple upload, PUT .../content with the whole file in one request, is meant for small files (4 MB in the lab). Bigger files need an upload session',
        'The app registration lacks Sites.ReadWrite.All',
        'SharePoint does not take PDF files over 10 MB',
      ],
      1,
      'Graph has two ways to upload a file. PUT /drives/{id}/root:/{path}:/content sends the file in one request and is for small files; the long documented limit is 4 MB. For anything bigger, createUploadSession returns an uploadUrl, and the file goes up in byte ranges, which can also be resumed. A missing permission would be 403 accessDenied, not 413.',
    ),
    {
      title: 'Switch to an upload session',
      how: `Runtime Manager, ${ARCHIVE}, Settings, Properties. Set sp.uploadMode to session and Apply Changes. Then read the logs after the next run.`,
      done: sessionOn,
    },
    ask(
      'The fragment size',
      'With sp.chunkSize 1000000 the first fragment fails with 400 invalidRange. Which chunk size is right?',
      [
        'Any size, as long as the Content-Range header is right',
        '1 MB exactly, 1048576 bytes',
        'A multiple of 320 KiB (327,680 bytes), at most 60 MiB per request, for example 3276800 (10 times 320 KiB). Only the last fragment may be shorter',
        'The whole file in one fragment',
      ],
      2,
      'Microsoft asks for fragments that are a multiple of 320 KiB, and one request carries at most 60 MiB. 1000000 and 1048576 are not multiples of 327680. A size of 5 to 10 MiB is a good balance between few requests and little to resend when a fragment fails. In the lab the first bad fragment is refused; the real service can also fail later, at the end of the upload.',
    ),
    {
      title: 'Set a valid chunk size',
      how: 'Same Properties. Set sp.chunkSize to 3276800 (10 times 327680) and Apply Changes.',
      done: chunkOk,
    },
    {
      title: 'See the scans in the library',
      how: `Move the clock 2 minutes. Dynamics and SharePoint, SharePoint tab, site Logistics, library Delivery notes: the three big scans are in folder ${FOLDER} with their full size. The logs of ${ARCHIVE} say how many fragments each took.`,
      done: (s) => chunkOk(s) && arrived(s) && Boolean(s.seen[`msgraph:drive:${drive(s)?.id}`]),
    },
    ask(
      'When a fragment fails',
      'A fragment of a 25 MB scan fails half way with a timeout. What should the app do?',
      [
        'Start a new session and send the whole file again, every time',
        'GET the uploadUrl: nextExpectedRanges says which bytes the service still needs. Send from there. If the file cannot be finished, DELETE the uploadUrl to cancel the session',
        'Send the same fragment to the Graph endpoint with PUT .../content',
        'Wait for the session to commit the part that arrived',
      ],
      1,
      'An upload session keeps the bytes it got until it expires. GET on the uploadUrl answers with expirationDateTime and nextExpectedRanges, so a client can resume instead of starting over. The uploadUrl is pre-authenticated: send no Authorization header to it. A fragment out of order gets 416, and a cancelled or expired session 404.',
    ),
    {
      title: 'Alert on upload failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${ARCHIVE}, metric Message Error Count, Above 0 for 1 minute, recipient ${OPS}. A scan that fails then reaches a person, not only the logs.`,
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === ARCHIVE && a.resource === 'Application' && a.metric === 'Message Error Count' && a.recipients),
    },
  ],
  why: 'Graph uploads come in two kinds. PUT .../content sends a small file in one request. For large files call createUploadSession, then PUT byte ranges to the uploadUrl with Content-Range, in fragments that are a multiple of 320 KiB (327,680 bytes) and at most 60 MiB; only the last may be shorter. 202 means send the next range, 201 means the file is complete. A failed fragment is resumed from nextExpectedRanges, and DELETE cancels the session. The uploadUrl needs no bearer token. In the lab the simple upload stops at 4 MB and a bad fragment size fails at the first fragment.',
  docs: 'https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession',
  solve(start) {
    let s = mark(start, `logs:${ARCHIVE}`)
    s = change(s, ARCHIVE, { props: { ...app(s, ARCHIVE).props, 'sp.uploadMode': 'session', 'sp.chunkSize': String(10 * FRAGMENT) } })
    s = advance(s, 2 * MINUTE)
    s = mark(s, `msgraph:drive:${drive(s).id}`)
    return addMonAlert(s, { title: 'Scan archive errors', resource: 'Application', name_: ARCHIVE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
  },
  answers: { 1: 1, 3: 2, 6: 1 },
}

export const LABS = [lab]
