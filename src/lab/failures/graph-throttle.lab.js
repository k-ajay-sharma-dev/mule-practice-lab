// The guided lab graph-throttle. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { DAY, emptyMsgraph, guidOf, hitsOf, isoTime, newItem, newRegistration, newSite, TENANT_ID } from '../platform-msgraph.js'
import { CATALOG } from './graph-throttle.pkg.js'

const APP_ID = guidOf('reg:harbor-catalog-sync')
const BACKLOG = 240
const IMPORT = at(1, 8, 45)
const prop = (s, k) => String(app(s, CATALOG)?.props?.[k] ?? '').trim()
const running = (s) => app(s, CATALOG)?.status === 'Running'
const store = (s) => app(s, CATALOG)?.store ?? {}
const retryOk = (s) => running(s) && prop(s, 'graph.retryMode') === 'retry-after'
const batchOk = (s) => running(s) && Number(prop(s, 'graph.batchSize')) >= 2 && Number(prop(s, 'graph.batchSize')) <= 20
const drained = (s) => (store(s).wm ?? '') >= isoTime(IMPORT) && !store(s).pos

function graph(now) {
  const m = emptyMsgraph(now)
  const reg = newRegistration(m, {
    name: 'harbor-catalog-sync',
    appId: APP_ID,
    t: now - 200 * DAY,
    secrets: [{ desc: 'mule-sandbox', start: now - 60 * DAY, end: now + 300 * DAY }],
    perms: [{ api: 'Microsoft Graph', name: 'Sites.Selected', type: 'Application' }],
    granted: ['Microsoft Graph|Sites.Selected|Application'],
  })
  const site = newSite(m, 'Merchandising', ['Product sheets'])
  site.grants[APP_ID] = 'read'
  const drive = site.drives[0]
  for (let i = 0; i < 8; i++) newItem(drive, `H-${1200 + i}.pdf`, 400000 + i * 3100, at(0, 10, i), 'Lena Park')
  // last night's import of the new season: every sheet changed at once
  for (let i = 0; i < BACKLOG; i++) newItem(drive, `H-${2000 + i}.pdf`, 380000 + (i % 17) * 5300, IMPORT, 'Product data import')
  return { m, secret: reg.secrets[0].value, drive: drive.id }
}

const lab = {
  id: 'p-graph-throttle',
  group: 'HR, ITSM and CRM',
  title: 'A Graph 429 storm on the product sheets',
  minutes: 25,
  scenario: `${CATALOG} reads the product sheets of the Merchandising site in SharePoint over Microsoft Graph every minute and syncs them to the catalog. At 08:45 the product data import changed ${BACKLOG} sheets at once. Since then every run fails with HTTP 429 and the catalog shows last season's sheets. Merchandising wants the new sheets in the shop this morning. Find why the app never gets out of the throttling, and fix the way it calls Graph.`,
  start() {
    const g = graph(at(1, 8))
    const s = newPlatform({
      clock: at(1, 8, 40),
      msgraph: g.m,
      apps: [
        newApp(CATALOG, {
          props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': APP_ID, 'graph.driveId': g.drive, 'graph.retryMode': 'immediate', 'graph.batchSize': '1' },
          secrets: { 'azure.clientSecret': g.secret },
          store: { wm: isoTime(at(1, 6)) },
        }),
      ],
      mail: [
        {
          t: at(1, 9, 2),
          to: OPS,
          subject: 'New season product sheets not in the shop',
          body: `Good morning. We imported ${BACKLOG} new product sheets into the Product sheets library at 08:45. The shop still shows the old sheets and the catalog sync looks stuck. Can you have a look? Harbor merchandising`,
          source: 'Harbor merchandising',
        },
      ],
    })
    return until(s, at(1, 9, 5))
  },
  steps: [
    {
      title: 'Read the request log',
      how: `Dynamics and SharePoint from the console menu, Request log tab. Filter on ${CATALOG}. You see GET calls to the drive answered 429 activityLimitReached, several in the same second, and the throttling panel shows the app throttled for minutes ahead.`,
      done: (s) => Boolean(s.seen['msgraph:log']),
    },
    sawLogs(CATALOG),
    ask(
      'What Retry-After asks for',
      'Graph answers 429 with the header Retry-After: 60. The app retries each 429 at once, three times. Why does it never get out?',
      [
        'Graph is down, so any retry policy fails until Microsoft fixes it',
        'Retry-After is the number of seconds to wait before the next call. Calls that come before that keep the app throttled, so retrying at once makes the throttling last longer',
        'The token expired, and 429 means the app must get a new one',
        'Retry-After is a hint for browsers; a server app can ignore it',
      ],
      1,
      'Throttling is per app and tenant. The answer says how long to back off. A client that keeps calling during that time is still over the limit and the service throttles it for longer, which is the storm in the request log (lab-made: each early call adds 30 seconds, up to 5 minutes). The right policy waits Retry-After, then goes on, and uses exponential backoff only when there is no Retry-After.',
    ),
    {
      title: 'Honour Retry-After',
      how: `Runtime Manager, ${CATALOG}, Settings, Properties. Set graph.retryMode to retry-after and Apply Changes. The app then stops at a 429, waits the seconds of Retry-After, and goes on from the item where it stopped.`,
      done: retryOk,
    },
    ask(
      'What a $batch changes',
      'A colleague says Graph JSON batching will get the app under the limit. What does a $batch of 20 requests do?',
      [
        'It counts as one request, so the app can read 20 times more before a 429',
        'It turns off throttling for the requests inside it',
        'It saves round trips: 20 GETs go in one HTTP call. Each request inside still counts against the limits and can come back 429 with its own Retry-After, so the app must check every response',
        'It is only for writes; reads cannot be batched',
      ],
      2,
      'POST /v1.0/$batch takes up to 20 requests and answers 200 with one response per request. Throttling is evaluated for each request inside, so a batch can hold 200s and 429s together. Batching makes a run much faster and the logs quieter, but only backing off fixes a storm. The app must retry only the failed requests, after their Retry-After.',
    ),
    {
      title: 'Batch the reads',
      how: `Same Properties. Set graph.batchSize to 20 (Graph takes at most 20 requests in one $batch) and Apply Changes.`,
      done: batchOk,
    },
    {
      title: 'See the backlog synced',
      how: `Move the clock 10 minutes. The logs of ${CATALOG} show Synced product sheets, then a pause for Retry-After, then the next part, and finally Catalog sync done. The request log shows POST /v1.0/$batch calls.`,
      done: (s) => retryOk(s) && drained(s) && (store(s).synced ?? 0) >= BACKLOG,
    },
    {
      title: 'Prove the throttling is over',
      how: `Move the clock until no 429 for ${CATALOG} came in the last 3 minutes and the app has used $batch since your last change. The throttling panel of the Request log shows the app not throttled.`,
      done: (s) => {
        const a = app(s, CATALOG)
        const h = hitsOf(s.msgraph, CATALOG)
        return retryOk(s) && batchOk(s) && drained(s) && (h.batch ?? 0) > a.updated && (h.last429 ?? 0) < s.clock - 3 * MINUTE && a.schedules[0]?.last?.ok === true
      },
    },
  ],
  why: `Microsoft Graph throttles per app and tenant and answers 429 with Retry-After in seconds. A retry policy that sends again at once keeps the app over the limit and turns a short pause into a storm. Wait what Retry-After asks, then go on from where you stopped, and keep a watermark so no item is lost. JSON batching sends up to 20 requests in one call: fewer round trips and a faster run, but every request inside still counts and can come back 429 on its own, so check each response and retry only the failed ones. Cache the token too: one token request per hour, not per call. In the lab the limit is 100 Graph requests per app per lab minute and each call during Retry-After adds 30 seconds; real limits depend on the service and the tenant.`,
  docs: 'https://learn.microsoft.com/en-us/graph/throttling',
  solve(start) {
    let s = mark(start, 'msgraph:log')
    s = mark(s, `logs:${CATALOG}`)
    s = change(s, CATALOG, { props: { ...app(s, CATALOG).props, 'graph.retryMode': 'retry-after', 'graph.batchSize': '20' } })
    return advance(s, 16 * MINUTE)
  },
  answers: { 2: 1, 4: 2 },
}

export const LABS = [lab]
