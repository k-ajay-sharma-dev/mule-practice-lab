// The guided lab sap-idoc-stuck. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { addOutbound, AREA, dropArea, MULE_DEST, MULE_PORT, newSapSystem, partnerOf, processIdocs, PROGRAM_ID, requestSalesArea, RFC_USER, SAP_HOST, WEB_PARTNER } from '../platform-sap.js'
import { SHOP, statusCheckOf } from './sap-idoc-stuck.pkg.js'

const props = (s) => ({ ...app(s, SHOP)?.props, ...app(s, SHOP)?.secrets })
const running = (s) => app(s, SHOP)?.status === 'Running'
const orders = (s) => (s.sap?.idocs ?? []).filter((d) => d.dir === 'in' && d.mestyp === 'ORDERS' && d.sndprn === WEB_PARTNER)
const failed = (s) => orders(s).filter((d) => d.hist.some((h) => h.c === '51'))
const auditOn = (s) => (partnerOf(s.sap, WEB_PARTNER)?.outbound ?? []).some((r) => r.mestyp === 'ALEAUD' && r.port === MULE_PORT)
const listening = (s) => running(s) && statusCheckOf(props(s)) === 'aleaud' && String(props(s)['sap.programId'] ?? '').trim() === PROGRAM_ID

function sapSystem(now) {
  const y = newSapSystem(now)
  y.idocs = []
  y.trfc = []
  // this morning a mass change of MDM_BATCH moved the web customers to sales area 1000 20 00
  dropArea(y, '4711', AREA, at(1, 8, 5))
  y.customers['4711'].areas.push('1000/20/00')
  y.customers['4711'].changes.push({ t: at(1, 8, 5), by: 'MDM_BATCH', text: 'Sales area 1000 20 00 added (mass change MDM-2611)' })
  return y
}

const lab = {
  id: 'p-sap-idoc-stuck',
  group: 'Salesforce and SAP',
  title: 'Sent to SAP, never posted',
  minutes: 25,
  scenario: `${SHOP} turns each web shop order into an ORDERS05 IDoc and sends it to SAP HRP with the SAP connector. Every call since 08:00 ended with Send IDoc completed and HTTP 202, so the dashboards are green. At 09:10 the sales team asks why no web order of this morning is in SAP. The master data team ran a mass change on the web customers at 08:05. Find the IDocs, get them posted, and make sure the Mule side learns about the next failure.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8, 11),
      apps: [
        newApp(SHOP, {
          props: {
            'sap.applicationServerHost': SAP_HOST,
            'sap.systemNumber': '00',
            'sap.client': '100',
            'sap.username': RFC_USER,
            'sap.gatewayHost': SAP_HOST,
            'sap.gatewayService': 'sapgw00',
            'sap.programId': PROGRAM_ID,
            'sap.connectionCount': '2',
            'idoc.statusCheck': 'none',
          },
          secrets: { 'sap.password': 'Rfc-Harbor-2611' },
          store: {},
        }),
      ],
      traffic: [{ app: SHOP, env: 'Sandbox', method: 'POST', path: '/orders', body: '{"source":"web","items":1}', perMinute: 1, every: 2 }],
      mail: [
        {
          t: at(1, 9, 10),
          to: OPS,
          subject: 'Web orders missing in SAP',
          body: 'Good morning. The web shop shows about 40 orders since 08:00, all confirmed to the customers. In SAP we find no sales order from the web shop for today, the last one is from 07:58. Customers start to call about delivery dates. Harbor sales team',
          source: 'Harbor sales team',
        },
      ],
      sap: sapSystem(at(1, 8, 11)),
    })
    return until(s, at(1, 9, 30))
  },
  steps: [
    {
      title: 'Find the IDocs in WE02',
      how: 'SAP from the console menu. Type WE02 in the command field and press Enter, then Execute. Under Inbound, status 51 holds the ORDERS IDocs of this morning. Open one: the control record, the data records E1EDK14, E1EDKA1, E1EDP01, and the status records with their messages.',
      done: (s) => Boolean(s.seen['sap:WE02']),
    },
    ask(
      'Read the status record',
      'What does the newest status record of these IDocs tell you?',
      [
        'Status 56: SAP has no partner profile for HARBORWEB',
        'Status 51, Application document not posted: Customer 4711 does not exist in sales area 1000 10 00. The IDoc reached SAP, but the sales order was not created',
        'Status 03: the IDoc waits at the port',
        'Status 64: the IDoc waits for a background job',
      ],
      1,
      'Inbound IDocs go 50 (IDoc added), 64 (ready to be transferred), 62 (passed to application) and then 53 (posted) or 51 (not posted). The message of the 51 record comes from the order entry of SD. The mass change at 08:05 moved customer 4711 to sales area 1000 20 00, but the IDocs carry 1000 10 00 in E1EDK14.',
    ),
    ask(
      'Why Mule saw success',
      `Every Send IDoc call of ${SHOP} completed and the API answered 202. Why does that not mean the order was posted?`,
      [
        'The connector hides SAP errors unless the log level is DEBUG',
        'Send IDoc is a tRFC call of IDOC_INBOUND_ASYNCHRONOUS. SAP confirms the LUW once the IDoc is saved. The posting runs after that inside SAP, so its 51 never comes back on that call',
        'SAP sends the errors by mail to the RFC user',
        'The 202 is wrong, the app should answer 201',
      ],
      1,
      'Transactional RFC promises that SAP received the IDoc exactly once. It does not run the application in the call. Posting happens at once or by a background job, but always after the LUW is confirmed. To know the result the sender needs a feedback channel: the ALE audit (ALEAUD), a status check, or a business reply such as ORDRSP.',
    ),
    {
      title: 'Get the customer fixed',
      how: 'Command field XD03 and pick customer 4711. The sales areas show only 1000 20 00 and the changes show the mass change of MDM_BATCH. Under Request to the master data team pick 1000 10 00 and press Send request. The team works on it within 5 lab minutes and mails ops: move the clock 5 minutes and check XD03 again.',
      done: (s) => (s.sap?.customers?.['4711']?.areas ?? []).includes(AREA),
    },
    {
      title: 'Process the IDocs again in BD87',
      how: 'Command field BD87. Tick the node of status 51 so all its IDocs are selected, then press Process. Each IDoc goes 62 and 53, and its status record names the new sales order. IDocs that came in before the fix also sit in 51: select them too.',
      // an IDoc closed with 68 counts when a WE19 copy of it (same PO number) posted
      done: (s) => Boolean(s.seen['sap:BD87']) && failed(s).length >= 30 && failed(s).every((d) => d.status === '53' || (d.status === '68' && orders(s).some((x) => x.ref === d.ref && x.status === '53'))),
    },
    ask(
      'BD87 or WE19',
      'A colleague wants to use WE19 on each failed IDoc instead. What is the difference?',
      [
        'There is none, both process the same IDoc',
        'WE19 is faster for many IDocs',
        'BD87 processes the same IDoc again and keeps its number and history. WE19 creates a new IDoc (status 74) from a copy, so the original stays in 51 and someone may process it later and create the order twice. After a WE19 test set the original to 68',
        'WE19 cannot process inbound IDocs',
      ],
      2,
      'BD87 is the tool for reprocessing: it works on the selected IDocs and writes new status records to them. WE19 is a test tool. It is handy to change a field and try again, but each run is a new IDoc number. Close the old one with status 68, Error, no further processing, using RC1_IDOC_SET_STATUS.',
    ),
    {
      title: 'Send the ALE audit to Mule',
      how: `Command field WE20, partner type LS, ${WEB_PARTNER}. Under Add outbound parameter pick message type ALEAUD, receiver port ${MULE_PORT}, basic type ALEAUD01, Transfer IDoc immediately, and press Add outbound parameter. The job RBDSTATE then sends the status of the inbound IDocs of ${WEB_PARTNER} back through port ${MULE_PORT} and destination ${MULE_DEST} (SM59).`,
      done: auditOn,
    },
    {
      title: 'Listen for the audit in the app',
      how: `Runtime Manager, ${SHOP}, Settings, Properties. Set idoc.statusCheck to aleaud and Apply Changes. The Document listener then registers program ${PROGRAM_ID} at gateway sapgw00 of ${SAP_HOST}. Until it does, SM58 shows the ALEAUD LUWs with program ${PROGRAM_ID} not registered.`,
      done: listening,
    },
    {
      title: 'Prove the feedback works',
      how: `Move the clock 10 minutes after your last change. The app logs each ALEAUD01 with the statuses of the web orders, SM58 has no waiting LUW for ${MULE_DEST}, and SMGW shows ${PROGRAM_ID} as a logged on client.`,
      done: (s) => {
        const a = app(s, SHOP)
        if (!a || !listening(s) || !auditOn(s) || s.clock < a.updated + 10 * MINUTE) return false
        return (a.store?.lastAudit ?? 0) > a.updated && !(s.sap?.trfc ?? []).some((e) => e.dest === MULE_DEST)
      },
    },
  ],
  why: 'Send IDoc in the SAP connector is transactional RFC. SAP confirms the call once the IDoc is saved with status 50 and 64; the posting runs after the call, so a 51 never reaches the sender on that call. Find stuck IDocs in WE02 or BD87 and read the newest status record: 51 is Application document not posted, with the message of the application. Fix the cause first, here the sales area of customer 4711, then process the same IDocs again in BD87 so they keep their number and history. WE19 makes new IDocs and leaves the old ones in 51, so close those with 68. For lasting monitoring give the sender a feedback channel: an outbound partner profile for ALEAUD sends the status of the inbound IDocs back, and a Document listener on the Mule side reads them and alerts on anything but 53. Until the listener registers its program ID, the audit LUWs wait in SM58. In the lab RBDSTATE runs every 5 minutes, 12 is set at delivery, and the master data team works 5 minutes after a request.',
  docs: 'https://docs.mulesoft.com/sap-connector/latest/',
  solve(start) {
    let s = mark(start, 'sap:WE02')
    s = requestSalesArea(s, '4711', AREA).state
    s = advance(s, 6 * MINUTE)
    s = mark(s, 'sap:BD87')
    s = processIdocs(
      s,
      failed(s).filter((d) => d.status === '51').map((d) => d.docnum),
    ).state
    s = addOutbound(s, WEB_PARTNER, { mestyp: 'ALEAUD', idoctp: 'ALEAUD01', port: MULE_PORT, mode: 'immediately' }).state
    s = change(s, SHOP, { props: { ...app(s, SHOP).props, 'idoc.statusCheck': 'aleaud' } })
    return advance(s, 11 * MINUTE)
  },
  answers: { 1: 1, 2: 1, 5: 2 },
}

export const LABS = [lab]
