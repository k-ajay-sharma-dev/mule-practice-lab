// The guided lab sf-api-limits. See platform-labs.js for the shape of a lab.
import { at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until, withProp } from '../platform-kit.js'
import { apiUsage, callsSince, newOrg, newSalesforce, orgOf, timeOf } from '../platform-salesforce.js'
import { NAME, NIGHT } from './sf-api-limits.pkg.js'

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const word = (s, k) => String(props(s)[k] ?? '').trim().toLowerCase()
const running = (s) => app(s, NAME)?.status === 'Running'
const fixedAt = (s) => app(s, NAME)?.updated ?? 0
const bulkOk = (s) => running(s) && word(s, 'sync.nightly.mode') === 'bulk'
const compositeOk = (s) => running(s) && word(s, 'sync.delta.mode') === 'composite'
const checkOk = (s) => running(s) && word(s, 'sync.limits.check') === 'true' && Number(props(s)['sync.limits.minRemaining']) >= 5000 && Number(props(s)['sync.limits.minRemaining']) <= 50000

const lab = {
  id: 'p-sf-api-limits',
  group: 'Salesforce and SAP',
  title: 'The nightly sync used the whole API allowance',
  minutes: 25,
  scenario: `${NAME} keeps the Accounts of the Brightmart org in step with the customer master. At 01:00 it upserts every customer, one REST call each, and every 15 minutes it sends the customers that changed. On Monday evening the Larkspur stores joined the customer master, so the file grew from 6,000 to 40,000 customers. It is Tuesday 14:30. Since about lunch time every call fails with REQUEST_LIMIT_EXCEEDED, and the sales team says their quoting tool and the Outlook sync stopped too.`,
  start() {
    const sfState = newSalesforce({
      orgs: {
        Production: newOrg('Production', {
          feeds: [
            { client: 'Pierline CPQ', day: 2200, night: 150, from: 8, to: 18 },
            { client: 'Outlook Integration', day: 900, night: 50, from: 7, to: 19 },
            { client: 'Salesforce Mobile', day: 400, night: 20, from: 7, to: 20 },
          ],
        }),
        Sandbox: newOrg('Sandbox'),
      },
    })
    let s = newPlatform({
      clock: at(0, 12),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example', 'sync.customers': '6000', 'sync.nightly.mode': 'rest', 'sync.delta.mode': 'rest', 'sync.limits.check': 'false', 'sync.limits.minRemaining': '0' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
        }),
      ],
      salesforce: sfState,
      mail: [
        { t: at(1, 14, 10), to: OPS, subject: 'Salesforce integrations down', body: 'Since about 13:30 Pierline CPQ cannot save quotes and Outlook Integration shows "TotalRequests Limit exceeded." for every rep. Nothing changed on our side. Can you look at what uses the API? Brightmart sales operations', source: 'Brightmart sales operations' },
      ],
    })
    s = until(s, at(0, 19))
    // the Larkspur stores join the customer master
    s = withProp(s, NAME, 'sync.customers', '40000')
    return until(s, at(1, 14, 30))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. The 01:00 run upserted 40,000 customers one call at a time. Since lunch time each delta run fails with SALESFORCE:LIMIT_EXCEEDED and REQUEST_LIMIT_EXCEEDED: TotalRequests Limit exceeded.` },
    {
      title: 'Read the API usage of the org',
      how: 'Salesforce from the console menu. Open System Overview: the gauge API REQUESTS, LAST 24 HOURS is at its max, and the table by client shows who used it. Company Information shows the same number as API Requests, Last 24 Hours.',
      done: (s) => Boolean(s.seen['sf:limits']),
    },
    ask(
      'When the org gets room again',
      'It is 14:30 on Tuesday and nobody changes anything. When do the calls work again?',
      ['At midnight UTC, when the daily counter resets', 'From about 01:00 to 03:00 on Wednesday, when the calls of the Tuesday 01:00 run are older than 24 hours', 'At 14:30 on Wednesday', 'Only after Salesforce support resets the counter'],
      1,
      'The API request limit is counted over a rolling 24 hours. A request counts until 24 hours after it was made, so there is no reset at midnight. The 40,000 calls of the 01:00 run free their room only from 01:00 on Wednesday. Until then each new call of any integration takes the little room that frees up. For a real outage you can ask Salesforce for a temporary increase.',
    ),
    ask(
      'Why Bulk API 2.0 for the night',
      'Why does a Bulk API 2.0 job fit the nightly 40,000 customers better than REST calls?',
      ['It skips the validation rules', 'The job costs a few API requests: create, upload, close and status. The records count against the Bulk API batch allocation of 15,000 batches a day, in batches of 10,000 records', 'Bulk API calls are free and have no limits', 'It is faster for a single record'],
      1,
      'With REST or SOAP each call costs one API request, so 40,000 single upserts cost 40,000. A Bulk API 2.0 ingest job is a handful of requests whatever the size, and Salesforce splits the CSV into internal batches of 10,000 records that count against DailyBulkApiBatches. For a few records Bulk is slower, because the job is queued and processed in the background.',
    ),
    {
      title: 'Load the nightly volume with Bulk API 2.0',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sync.nightly.mode to bulk. The run then creates one upsert job on Brightmart_Customer_Id__c, uploads the CSV and closes the job. Apply Changes.`,
      done: bulkOk,
    },
    {
      title: 'Batch the daytime changes',
      how: 'Set sync.delta.mode to composite, so the changed customers go 200 at a time in one sObject Collections upsert instead of one call each. Apply Changes.',
      done: compositeOk,
    },
    {
      title: 'Check the limits before each run',
      how: 'Set sync.limits.check to true and sync.limits.minRemaining to a reserve for the other integrations, for example 20000 (between 5000 and 50000). Each run reads /services/data/v61.0/limits first and waits when DailyApiRequests Remaining is too low. Apply Changes.',
      done: checkOk,
    },
    ask(
      'Why the test did not show it',
      'The team tested the sync with 40,000 customers in the Sandbox last week and saw no error. Why?',
      ['The Sandbox has no API limit at all', 'A full sandbox has its own, much higher allowance (5,000,000 requests a day in this lab), and none of the sales tools run there. The Production limit of 100,000 is shared with every integration', 'The Sandbox uses Bulk API automatically', 'Limits only apply on weekdays'],
      1,
      'Each org has its own allowance, and a sandbox allows far more requests than an Enterprise Edition production org, which has 100,000 a day plus 1,000 per user license. In production the allowance is shared with every integration and user tool. Size the calls for production, read /limits during the test, and keep a reserve.',
    ),
    {
      title: 'Watch the next night',
      how: 'Move the clock to Wednesday 03:00. The 01:00 run creates one Bulk API 2.0 job that reaches JobComplete with 40,000 records in Bulk Data Load Jobs, the app uses only a few hundred API requests, and the sales tools work again in System Overview.',
      done: (s) => {
        if (!bulkOk(s) || !compositeOk(s) || !checkOk(s)) return false
        const org = orgOf(s, 'Production')
        const job = (org?.jobs ?? []).find((j) => j.state === 'JobComplete' && j.numberRecordsProcessed >= 40000 && timeOf(j.createdDate) > fixedAt(s))
        const blocked = (org?.feeds ?? []).some((f) => org.feedState?.[f.client]?.since)
        const night = app(s, NAME).schedules.find((x) => x.flow === NIGHT)?.last
        return Boolean(job) && !blocked && callsSince(s, 'Production', NAME, fixedAt(s) + 60 * MINUTE) < 1500 && apiUsage(org, s.clock).remaining > 20000 && Boolean(night?.ok) && night.t > fixedAt(s)
      },
    },
  ],
  why: 'The API request limit of an org is counted over a rolling 24 hours and is shared by every integration and user tool. One REST or SOAP call per record spends it fast: 40,000 customers cost 40,000 requests. Load large volumes with Bulk API 2.0, which costs a few requests per job and counts records against the Bulk API batches instead. Send daytime changes in batches of 200 with sObject Collections or composite calls. Read /limits before a run and keep a reserve for the others. In the lab the limit blocks exactly at Max, the window moves per hour, and a call made with times stands for that many single calls.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/salesforce_app_limits_platform_api.htm',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:limits')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sync.nightly.mode': 'bulk', 'sync.delta.mode': 'composite', 'sync.limits.check': 'true', 'sync.limits.minRemaining': '20000' } })
    return until(s, at(2, 3))
  },
  answers: { 2: 1, 3: 1, 7: 1 },
}

export const LABS = [lab]
