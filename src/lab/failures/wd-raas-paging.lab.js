// The guided lab wd-raas-paging. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { addEvent, addPrompt, newWorkday, TENANT, updatedCount, WD_HOST } from '../platform-workday.js'
import { DIR_FLOW, DIRECTORY } from './wd-raas-paging.pkg.js'

const REPORT = 'INT_All_Workers'
const a = (s) => app(s, DIRECTORY)
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const prompts = (s) => s.workday?.reports?.[REPORT]?.prompts ?? []
const hasPrompt = (s, name, op) => prompts(s).some((p) => p.name === name && p.field === 'Last_Functionally_Updated' && p.op === op)
const deltaOn = (s) => a(s)?.status === 'Running' && prop(s, 'raas.mode') === 'delta' && Number(prop(s, 'raas.windowHours')) > 0
const caughtUp = (s) => {
  const x = a(s)
  const c = x?.store?.catchUp
  const last = x?.schedules.find((y) => y.flow === DIR_FLOW)?.last
  return Boolean(deltaOn(s) && c && last?.ok && last.t >= x.updated && c.from <= at(0, 2) && c.to >= x.updated && c.rows === updatedCount(s.workday, c.from, c.to))
}

function workday(now) {
  const y = newWorkday(now)
  y.reports[REPORT].owner = 'lhart'
  // yesterday afternoon HR loaded the workers of the acquired Pier Logistics with an EIB, in batches from 13:00 to 19:00
  y.bulk = [{ n: 3800, from: at(0, 13), to: at(0, 19), label: 'Pier Logistics', loc: 'LOC_DOCK_01', prefix: 'PL' }]
  addEvent(y, { type: 'Change Job', worker: '21003', eff: at(0), done: at(0, 10), text: 'Warehouse Lead, Dock 01 warehouse' })
  return y
}

const lab = {
  id: 'p-wd-raas-paging',
  group: 'HR, ITSM and CRM',
  title: 'The worker report that outgrew its timeout',
  minutes: 25,
  scenario: `${DIRECTORY} copies the active workers of Workday to the staff directory every night at 02:00. It calls the custom report ${REPORT} as RaaS in one request and waits up to 60 seconds. Yesterday afternoon HR loaded the 3,800 workers of the acquired Pier Logistics. This morning the directory has none of them. Find out why, and change the sync so it keeps working as Brightmart grows.`,
  start() {
    const s = newPlatform({
      clock: at(0, 1, 58),
      apps: [
        newApp(DIRECTORY, {
          props: { 'workday.host': WD_HOST, 'workday.tenant': TENANT, 'workday.username': 'ISU_BRIGHTMART_HCM', 'workday.responseTimeout': '60000', 'raas.owner': 'lhart', 'raas.report': REPORT, 'raas.mode': 'full', 'raas.windowHours': '' },
          secrets: { 'workday.password': 'Hcm-Lab-Pass-0826' },
          store: {},
        }),
      ],
      workday: workday(at(0, 1)),
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Pier Logistics people missing in the staff directory',
          body: 'Good morning. Since yesterday Workday has the 3,800 people of Pier Logistics, but the staff directory still shows the old head count and none of them. Their managers cannot find their teams. Brightmart HR systems',
          source: 'Brightmart HR systems',
        },
      ],
    })
    return until(s, at(1, 9, 10))
  },
  steps: [
    { ...sawLogs(DIRECTORY), title: 'Read the error of the night', how: `Runtime Manager, Applications, ${DIRECTORY}, Logs. The run of 02:00 ended with HTTP:TIMEOUT on the GET of ${REPORT}: Timeout exceeded. The run of the night before loaded 2,449 workers.` },
    {
      title: 'See the run on the Workday side',
      how: `Workday from the console menu, Integration events. The RaaS request of ${REPORT} at 02:00 completed in Workday after about 110 seconds with 6,249 rows, but the caller closed the connection after 60 s. The night before it took 43 seconds.`,
      done: (s) => Boolean(s.seen['wd:events']),
    },
    ask(
      'Why not a longer timeout',
      'The report time grows with the number of workers. Why is a larger response timeout not the fix?',
      [
        'It is the fix. Set it to 10 minutes and the job works again',
        'The next growth breaks it again, and a full extract each night moves every worker even when a handful changed. Ask Workday for less: prompts that limit the rows to what changed, in windows small enough to stay well under the limit',
        'Workday ignores the timeout of the caller',
        'RaaS cannot return more than 5,000 rows, so a longer wait does not help',
      ],
      1,
      'A RaaS call runs the whole report in one request. Its time and size grow with the population and the fields. A delta on Last Functionally Updated, split into windows, keeps each call small and the total work in proportion to the changes. Keep the watermark in the object store and move it only after a window has been written.',
    ),
    {
      title: 'Add date prompts to the report',
      how: `Workday, Custom reports, ${REPORT}, Prompts. Add a prompt named Updated_From on the field Last_Functionally_Updated with bound From, then a prompt named Updated_To on the same field with bound To. A prompt becomes a query parameter of the RaaS URL.`,
      done: (s) => hasPrompt(s, 'Updated_From', 'from') && hasPrompt(s, 'Updated_To', 'to'),
    },
    {
      title: 'Switch the sync to windows',
      how: `Runtime Manager, ${DIRECTORY}, Settings, Properties. Set raas.mode to delta and raas.windowHours to 1, then Apply Changes. The app then starts at the watermark of its last good run and sends Updated_From and Updated_To one hour at a time. Try a 24 hour window first if you like: it times out like the full report.`,
      done: deltaOn,
    },
    {
      title: 'Catch up',
      how: `Runtime Manager, ${DIRECTORY}, Schedules, tick ${DIR_FLOW} and press Run. The log shows one delta from yesterday 02:00 to now in many windows, each a few seconds in Integration events. Read the Logs to see the worker count.`,
      done: caughtUp,
    },
    ask(
      'A colleague tries Get_Workers',
      'A colleague tests the SOAP operation Get_Workers instead, without paging. It returns 100 workers and no error, while Workday has 6,249. What happened?',
      [
        'The ISU sees only 100 workers',
        'Get_Workers pages its answer. The Response_Filter Count is 100 by default and at most 999, and Response_Results says Total_Results 6249 and Total_Pages 63. The caller must ask for Page 2, 3 and on until Total_Pages, or it silently keeps the first page',
        'SOAP answers are cut at 1 MB',
        'Get_Workers returns only workers changed today',
      ],
      1,
      'A paged API that ends without an error is the classic silent truncation. Read Total_Results and Total_Pages from the first answer, loop over the pages, and compare the count you wrote with Total_Results. For RaaS there is no paging, so you page by your own filter: date windows, or prompts per organization.',
    ),
    {
      title: 'Compare the counts',
      how: `Workday, Workers: the head count of active workers. The catch-up log of ${DIRECTORY} names how many workers changed since 02:00 yesterday. They match the Pier Logistics load plus the few changes of the day.`,
      done: (s) => Boolean(s.seen['wd:workers']) && caughtUp(s),
    },
  ],
  why: 'RaaS runs a whole custom report in one HTTP request, so a full extract grows with the population until it passes the response timeout of the caller, while Workday finishes the work anyway. Raising the timeout only moves the cliff. Ask for less: add date prompts on Last Functionally Updated, pass them as query parameters, and walk from the watermark to now in windows small enough to stay fast, moving the watermark after each window. For SOAP Get_Workers the answer is paged with Count up to 999, so loop until Total_Pages, or you keep only the first page without any error. In the lab a report costs about 2.5 ms per row and field.',
  docs: 'https://docs.mulesoft.com/workday-connector/latest/',
  solve(start) {
    let s = mark(mark(start, `logs:${DIRECTORY}`), 'wd:events')
    s = addPrompt(s, REPORT, { name: 'Updated_From', field: 'Last_Functionally_Updated', op: 'from' }).state
    s = addPrompt(s, REPORT, { name: 'Updated_To', field: 'Last_Functionally_Updated', op: 'to' }).state
    s = change(s, DIRECTORY, { props: { ...a(s).props, 'raas.mode': 'delta', 'raas.windowHours': '1' } })
    s = runNow(s, DIRECTORY, DIR_FLOW)
    return mark(s, 'wd:workers')
  },
  answers: { 2: 1, 6: 1 },
}

export const LABS = [lab]
