// The guided lab wd-soap-fault. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { hire, newWorkday, TENANT, WD_HOST } from '../platform-workday.js'
import { JOBS } from './wd-soap-fault.pkg.js'

const ALERT_TO = 'shift-planning@brightmart.example'
const a = (s) => app(s, JOBS)
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const running = (s) => a(s)?.status === 'Running'
const loc = (s, id) => s.workday?.workers?.[id]?.loc
const typeFixed = (s) => running(s) && prop(s, 'wd.locationIdType') === 'Location_ID'
const store = (s) => a(s)?.store ?? {}

function workday(now) {
  const y = newWorkday(now)
  // a new starter whose hire is effective next Monday: shift planning already plans her transfer for Wednesday
  hire(y, '21011', { name: 'Nell Arden', job: 'JP_SALES_ASSOCIATE', loc: 'LOC_PIER_01', org: 'Stores', eff: at(7), done: at(0, 15), by: 'lhart' })
  return y
}

const lab = {
  id: 'p-wd-soap-fault',
  group: 'HR, ITSM and CRM',
  title: 'Workday refuses the store transfers',
  minutes: 25,
  scenario: `${JOBS} sends the store transfers of the shift planning system to Workday as Change_Job requests, every 5 minutes, in the order they came. Since its release last night, not one transfer has reached Workday and the queue only grows. Shift planning needs next week in Workday by noon. Read the fault, fix the request, and make sure one bad transfer cannot hold up the rest.`,
  start() {
    const s = newPlatform({
      clock: at(1, 7, 50),
      apps: [
        newApp(JOBS, {
          props: { 'workday.host': WD_HOST, 'workday.tenant': TENANT, 'workday.username': 'ISU_BRIGHTMART_HCM', 'wd.locationIdType': 'Organization_Reference_ID', 'wd.onFault': 'stop' },
          secrets: { 'workday.password': 'Hcm-Lab-Pass-0826' },
          store: {
            queue: [
              { worker: '21008', location: 'LOC_PIER_02', effective: '2026-11-09' },
              { worker: '21011', location: 'LOC_PIER_02', effective: '2026-11-04' },
              { worker: '21010', location: 'LOC_PIER_02', effective: '2026-11-09' },
              { worker: '21006', location: 'LOC_BRIGHTMART_HQ', effective: '2026-11-09' },
            ],
          },
        }),
      ],
      workday: workday(at(1, 7)),
      mail: [
        {
          t: at(1, 9),
          to: OPS,
          subject: 'Store transfers not in Workday',
          body: `Hello. We planned four transfers for next week, three of them to Pier 02, and none shows in Workday. If Workday refuses a transfer, tell us at ${ALERT_TO} and we fix it on our side. Brightmart shift planning`,
          source: 'Brightmart shift planning',
        },
      ],
    })
    return until(s, at(1, 9, 15))
  },
  steps: [
    { ...sawLogs(JOBS), title: 'Read the fault', how: `Runtime Manager, Applications, ${JOBS}, Logs. Each run ends with WSC:SOAP_FAULT: Validation error occurred, an invalid ID value, and an Xpath that points into the request.` },
    {
      title: 'See the request in Workday',
      how: 'Workday from the console menu, Integration events. Each Change_Job of ISU_BRIGHTMART_HCM failed with SOAP-ENV:Client.validationError. The detail names the element: Location_Reference, ID.',
      done: (s) => Boolean(s.seen['wd:events']),
    },
    ask(
      'What the fault says',
      "The fault reads: Invalid ID value. 'LOC_PIER_02' is not a valid ID value for type = 'Organization_Reference_ID'. What is wrong?",
      [
        'Pier 02 does not exist in Workday',
        'The ISU has no right to change jobs',
        "The value is right but its type is wrong. LOC_PIER_02 is a Location_ID. A Workday reference is an ID with a type, and Workday looks the value up only under the type the request names",
        'Workday is down',
      ],
      2,
      'Every Workday reference, such as Location_Reference, takes one or more ID elements with a wd:type attribute: WID, Location_ID, Organization_Reference_ID and so on. A value under the wrong type is not found, and Workday answers with a validation fault and the Xpath of the element. The fault is in the request, so sending it again never helps.',
    ),
    {
      title: 'Check the reference IDs',
      how: 'Workday, Reference IDs. LOC_PIER_02 is listed under the type Location_ID, with its WID. Organization_Reference_ID is a type for organizations, not locations.',
      done: (s) => Boolean(s.seen['wd:refs']),
    },
    {
      title: 'Send the right ID type',
      how: `Runtime Manager, ${JOBS}, Settings, Properties. Set wd.locationIdType to Location_ID and Apply Changes. Move the clock 5 minutes: the transfer of 21008 goes through, then the next one faults and the run stops again.`,
      done: typeFixed,
    },
    ask(
      'One bad transfer',
      'The transfer of 21011 Nell Arden now faults: the effective date 2026-11-04 is before her hire date 2026-11-09. What should the app do with it?',
      [
        'Retry it every 5 minutes until Workday takes it',
        'Change the date to the hire date in the app',
        'Stop every run until someone fixes it, as now',
        'Take it out of the queue with its fault and Xpath, let the other transfers go on, and tell shift planning, who own the data. A validation fault does not heal by retrying',
      ],
      3,
      'Sort errors by whether a retry can help. A connectivity error or a timeout may pass, so retry with a backoff. A validation fault means the data or the request is wrong: retrying only blocks the queue. Park the record with the message and Xpath where its owner sees it, and alert them.',
    ),
    {
      title: 'Let the queue move',
      how: `Runtime Manager, ${JOBS}, Settings, Properties. Set wd.onFault to continue and Apply Changes. Move the clock 5 minutes. The log shows Change_Job done for 21010 and 21006 and a warning that the transfer of 21011 was rejected. Workers in Workday shows the new locations.`,
      done: (s) => typeFixed(s) && prop(s, 'wd.onFault') === 'continue' && loc(s, '21008') === 'LOC_PIER_02' && loc(s, '21010') === 'LOC_PIER_02' && loc(s, '21006') === 'LOC_BRIGHTMART_HQ' && !(store(s).queue ?? []).length && (store(s).rejected ?? []).some((x) => x.worker === '21011'),
    },
    {
      title: 'Tell shift planning about rejects',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${JOBS}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail. A run with a rejected transfer counts as an error.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === JOBS && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
  ],
  why: 'A Workday SOAP fault tells you exactly what is wrong: faultcode SOAP-ENV:Client.validationError, a Validation_Error with the message, and the Xpath of the element. Invalid ID value means the reference carries an ID under a type Workday does not know it by: check the Reference IDs and send the right wd:type. Validation faults are about the data, so never retry them; take the record aside with its fault, let the rest of the queue go on, and alert the owner of the data. Retry only errors that can pass, such as timeouts.',
  docs: 'https://docs.mulesoft.com/web-service-consumer-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${JOBS}`), 'wd:events'), 'wd:refs')
    s = change(s, JOBS, { props: { ...a(s).props, 'wd.locationIdType': 'Location_ID' } })
    s = advance(s, 6 * MINUTE)
    s = change(s, JOBS, { props: { ...a(s).props, 'wd.onFault': 'continue' } })
    s = advance(s, 6 * MINUTE)
    return addMonAlert(s, { title: 'Transfers rejected by Workday', resource: 'Application', name_: JOBS, metric: 'Message Error Count', severity: 'Medium', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 2, 5: 3 },
}

export const LABS = [lab]
