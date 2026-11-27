// The guided lab sap-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, callApi, deployApp, finishDeploys, mark, MINUTE, newPlatform } from '../platform.js'
import { app, ask, OPS } from '../platform-kit.js'
import {
  addInbound, addOutbound, createDestination, createLogicalSystem, createPartner, createPort, createUser, GW_SERVICE, newSapSystem, partnerOf, PROGRAM_ID, registration, SAP_HOST, SID, SAP_CLIENT, testOutbound, WEB_PARTNER,
} from '../platform-sap.js'
import { BRIDGE, BRIDGE_JAR } from './sap-setup.pkg.js'

const PASSWORD = 'Bridge-Rfc-2611'
const y = (s) => s.sap ?? {}
const props = (s) => app(s, BRIDGE)?.props ?? {}
const secrets = (s) => app(s, BRIDGE)?.secrets ?? {}
const running = (s) => app(s, BRIDGE)?.status === 'Running'
const word = (v) => String(v ?? '').trim()
const systemUser = (s) => Object.entries(y(s).users ?? {}).find(([, u]) => u.type === 'System')?.[0]
const gwOk = (d) => word(d.gwhost).toLowerCase() === SAP_HOST && [GW_SERVICE, '3300'].includes(word(d.gwserv).toLowerCase())
const dest = (s) => (y(s).dests ?? []).find((d) => d.type === 'T' && d.programId === PROGRAM_ID && gwOk(d))
const port = (s) => dest(s) && (y(s).ports ?? []).find((p) => p.dest === dest(s).name)
const partnerOk = (s) => {
  const p = partnerOf(y(s), WEB_PARTNER)
  return Boolean(p && port(s) && p.inbound.some((r) => r.mestyp === 'ORDERS' && r.process === 'ORDE') && p.outbound.some((r) => r.mestyp === 'INVOIC' && r.idoctp === 'INVOIC02' && r.port === port(s).name))
}
const deployedOk = (s) => {
  const p = props(s)
  return (
    running(s) &&
    word(p['sap.applicationServerHost']).toLowerCase() === SAP_HOST &&
    word(p['sap.systemNumber']) === '00' &&
    word(p['sap.client']) === SAP_CLIENT &&
    word(p['sap.username']).toUpperCase() === systemUser(s) &&
    Boolean(secrets(s)['sap.password']) &&
    p['sap.password'] === undefined &&
    word(p['sap.gatewayHost']).toLowerCase() === SAP_HOST &&
    [GW_SERVICE, '3300'].includes(word(p['sap.gatewayService']).toLowerCase()) &&
    word(p['sap.programId']) === PROGRAM_ID
  )
}
const registered = (s) => Boolean(s.sap && registration(s, s.sap, PROGRAM_ID, s.clock)?.app === BRIDGE)
const posted = (s) => (y(s).idocs ?? []).some((d) => d.dir === 'in' && d.mestyp === 'ORDERS' && d.sndprn === WEB_PARTNER && d.status === '53')

function sapSystem(now) {
  const x = newSapSystem(now)
  delete x.users.MULE_RFC
  x.dests = x.dests.filter((d) => d.type === '3')
  x.ports = []
  x.partners = []
  x.logsys = [`${SID}CLNT${SAP_CLIENT}`]
  x.idocs = []
  x.trfc = []
  return x
}

const lab = {
  id: 'p-sap-setup',
  group: 'Salesforce and SAP',
  title: 'Set up the SAP connection of the IDoc bridge',
  minutes: 35,
  scenario: `Harbor connects its web shop to SAP ${SID} client ${SAP_CLIENT} on ${SAP_HOST}. The app ${BRIDGE} is built: it sends ORDERS05 IDocs to SAP and listens for the INVOIC02 IDocs SAP sends back, as program ${PROGRAM_ID}. Nothing is configured yet, neither in SAP nor in Anypoint. The jar is in Runtime Manager. Set up both sides, prove an order posts and an invoice arrives, and add an alert.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      jars: [{ pkg: BRIDGE, jar: BRIDGE_JAR }],
      sap: sapSystem(at(1, 9)),
      mail: [
        {
          t: at(1, 8, 40),
          to: OPS,
          subject: 'SAP connection for the IDoc bridge',
          body: `Hello. For the IDoc bridge we agreed: RFC user of type System for the Mule app, program ID ${PROGRAM_ID} on gateway ${SAP_HOST} ${GW_SERVICE}, logical system ${WEB_PARTNER} for the web shop. Inbound ORDERS with process code ORDE, outbound INVOIC with basic type INVOIC02. Harbor SAP basis team`,
          source: 'Harbor SAP basis team',
        },
      ],
    })
  },
  steps: [
    {
      title: 'Create the RFC user',
      how: 'SAP from the console menu. Command field SU01. Under Create user enter a user name such as MULE_RFC, user type System and an initial password of at least 8 characters, then press Create. A System user cannot log on with the SAP GUI and its password does not expire.',
      done: (s) => Boolean(systemUser(s)),
    },
    {
      title: 'Define the RFC destination for the program ID',
      how: `Command field SM59, Create. Connection type T, activation Registered Server Program, program ID ${PROGRAM_ID}, gateway host ${SAP_HOST} and gateway service ${GW_SERVICE}. Save. SAP uses this destination to call the Mule listener.`,
      done: (s) => Boolean(dest(s)),
    },
    {
      title: 'Create the tRFC port',
      how: 'Command field WE21, Transactional RFC, Create. Give the port a name such as MULEPORT, pick the destination of the step before, and press Create.',
      done: (s) => Boolean(port(s)),
    },
    {
      title: 'Define the logical system and the partner profile',
      how: `Command field BD54: create logical system ${WEB_PARTNER}. Then WE20: create partner ${WEB_PARTNER} of type LS. Add an inbound parameter ORDERS with process code ORDE, trigger immediately, and an outbound parameter INVOIC with basic type INVOIC02 to your port.`,
      done: partnerOk,
    },
    ask(
      'Who opens the connection',
      `For IDocs from SAP to Mule, which side opens the network connection, and what does that mean for the firewall?`,
      [
        'SAP connects to an HTTP listener of the Mule app, so the app needs a public endpoint',
        `The Mule listener connects out to the SAP gateway and registers ${PROGRAM_ID}. SAP calls the program over that connection, so only the gateway port 3300 of SAP must be reachable from Mule`,
        'Both sides open a connection to Anypoint MQ',
        'SAP writes the IDocs to a file share that Mule reads',
      ],
      1,
      `A registered server program logs on to the SAP gateway (sapgw00 is port 3300). SM59 type T with Registered Server Program names that program ID, and SAP sends tRFC calls to whoever registered it. The client side of the connector, for Send IDoc and BAPIs, connects to the application server on the same port range.`,
    ),
    {
      title: 'Deploy the app with the connector config',
      how: `Runtime Manager, Deploy application, name ${BRIDGE}, file ${BRIDGE_JAR}. Properties: sap.applicationServerHost ${SAP_HOST}, sap.systemNumber 00, sap.client ${SAP_CLIENT}, sap.username your RFC user, sap.gatewayHost ${SAP_HOST}, sap.gatewayService ${GW_SERVICE}, sap.programId ${PROGRAM_ID}, sap.connectionCount 2. Put sap.password as a secure property, not a plain one. Deploy.`,
      done: deployedOk,
    },
    {
      title: 'See the program registered',
      how: `Command field SMGW. Under Logged on clients ${PROGRAM_ID} shows ${BRIDGE} with its connections. SM59, your destination, Connection Test now answers Connection test OK. Move the clock a minute if the listener has not polled yet.`,
      done: (s) => Boolean(s.seen['sap:SMGW']) && registered(s),
    },
    {
      title: 'Send a test ORDERS05',
      how: `API client from the console menu, application ${BRIDGE}, POST /orders with body {"customer":"4712","material":"H-1300","qty":2}. Then WE02, Execute: the ORDERS IDoc of ${WEB_PARTNER} has status 53 and its status record names the new sales order.`,
      done: (s) => Boolean(s.seen['sap:WE02']) && posted(s),
    },
    {
      title: 'Receive an INVOIC02 in Mule',
      how: `Command field WE19. Under Outbound test pick partner ${WEB_PARTNER} and message type INVOIC, and press Send outbound IDoc. The IDoc goes 01, 30, 03 and 12 once the registered program takes it. Move the clock a minute and read the logs of ${BRIDGE}: INVOIC02 received.`,
      done: (s) => (app(s, BRIDGE)?.store?.invoices ?? []).length > 0,
    },
    {
      title: 'Alert on IDoc errors',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${BRIDGE}. Metric Message Error Count, Above 0 for each of the last 1 consecutive minutes, with a recipient. The listener fails a run when it cannot reach the gateway, and, once you add ALEAUD to the partner profile, for each audit status other than 53. So a stuck IDoc reaches a person.`,
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === BRIDGE && a.resource === 'Application' && a.metric === 'Message Error Count' && ((a.operator === 'Above' && Number(a.threshold) <= 0) || (a.operator === 'Above or equal to' && Number(a.threshold) <= 1)) && a.recipients),
    },
  ],
  why: `An SAP integration needs both directions set up. Mule to SAP is a client connection: application server, system number, client, and an RFC user of type System whose password lives in a secure property. SAP to Mule goes through the gateway: the Document listener registers a program ID, SM59 type T with Registered Server Program points at it, a tRFC port in WE21 uses that destination, and the partner profile in WE20 for the logical system from BD54 says which message types come in (with a process code) and go out (with a basic type and port). SMGW and the SM59 Connection Test prove the registration. Then test end to end: an ORDERS05 must reach 53, not only leave Mule, and an outbound IDoc must reach 12. In the lab the partner profile of ${WEB_PARTNER} posts orders for every sold-to that has sales area 1000 10 00, and 12 is set as soon as the program takes the IDoc.`,
  docs: 'https://docs.mulesoft.com/sap-connector/latest/',
  solve(start) {
    let s = mark(start, 'sap:SU01')
    s = createUser(s, { name: 'MULE_RFC', type: 'System', password: PASSWORD }).state
    s = createDestination(s, { name: 'MULE_HARBOR_DEST', programId: PROGRAM_ID, gwhost: SAP_HOST, gwserv: GW_SERVICE, text: 'Mule IDoc bridge' }).state
    s = createPort(s, { name: 'MULEPORT', dest: 'MULE_HARBOR_DEST' }).state
    s = createLogicalSystem(s, WEB_PARTNER).state
    s = createPartner(s, WEB_PARTNER, 'Harbor web shop').state
    s = addInbound(s, WEB_PARTNER, { mestyp: 'ORDERS', process: 'ORDE', trigger: 'immediately' }).state
    s = addOutbound(s, WEB_PARTNER, { mestyp: 'INVOIC', idoctp: 'INVOIC02', port: 'MULEPORT', mode: 'immediately' }).state
    const form = {
      name: BRIDGE,
      pkg: BRIDGE,
      jar: BRIDGE_JAR,
      replicas: 1,
      vCores: 0.1,
      props: { 'sap.applicationServerHost': SAP_HOST, 'sap.systemNumber': '00', 'sap.client': SAP_CLIENT, 'sap.username': 'MULE_RFC', 'sap.gatewayHost': SAP_HOST, 'sap.gatewayService': GW_SERVICE, 'sap.programId': PROGRAM_ID, 'sap.connectionCount': '2' },
      secrets: { 'sap.password': PASSWORD },
    }
    s = finishDeploys(deployApp(s, form).state)
    s = advance(s, 2 * MINUTE)
    s = mark(s, 'sap:SMGW')
    s = callApi(s, { env: 'Sandbox', app: BRIDGE, method: 'POST', path: '/orders', body: '{"customer":"4712","material":"H-1300","qty":2}' }).state
    s = mark(s, 'sap:WE02')
    s = testOutbound(s, WEB_PARTNER, 'INVOIC').state
    s = advance(s, 2 * MINUTE)
    return addMonAlert(s, { title: 'IDoc bridge errors', resource: 'Application', name_: BRIDGE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
  },
  answers: { 4: 1 },
}

export const LABS = [lab]
