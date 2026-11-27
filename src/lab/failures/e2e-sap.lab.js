// The end to end lab of SAP: web shop orders to SAP sales orders as ORDERS05 IDocs, with the status back through
// ALEAUD01, from the request mail to Production. See platform-labs.js for the shape of a lab.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio } from '../platform.js'
import { ask, call, called, creds, OPS } from '../platform-kit.js'
import { addInbound, addOutbound, AREA, createDestination, createLogicalSystem, createPartner, createPort, createUser, GW_SERVICE, newSapSystem, partnerOf, processIdocs, registration, requestSalesArea, SAP_CLIENT, SAP_HOST, SID, WEB_PARTNER } from '../platform-sap.js'
import { ASSET, MAIN, NAME } from './e2e-sap.pkg.js'

const TEAM = 'order-ops@brightmart.example'
const APP = 'webshop-sap-orders'
const PROGRAM = 'MULE_WEBSHOP'
const DEST = 'MULE_WEBSHOP_DEST'
const PORT = 'WEBPORT'
const USER = 'MULE_WEBSHOP'
const PASSWORD = 'Webshop-Rfc-2611' // made-up lab values
const PRD = { host: 'sapbrp.brightmart.lab', program: 'MULE_WEBSHOP_PRD', password: 'Webshop-Prd-2611' }
const SHOP = { name: 'Brightmart Web Shop', clientId: 'wsh-4d21b7', clientSecret: 'wsh-secret-63f0' }
const GOOD = { orderId: 'WEB-81001', customer: '4712', items: [{ material: 'H-1300', qty: 2 }] }
const BAD = { orderId: 'WEB-81002', customer: '4714', items: [{ material: 'H-1250', qty: 4 }] }
const body = (o) => JSON.stringify(o)

const RAML = `#%RAML 1.0
title: SAP Orders API
version: v1
mediaType: application/json
types:
  Order:
    properties:
      orderId: string
      customer: string
      items:
        type: array
        items:
          properties:
            material: string
            qty: integer
  OrderStatus:
    properties:
      orderId: string
      status:
        enum: [SENT, POSTED, FAILED]
      salesOrder?: string
      message?: string
/orders:
  post:
    description: Send a web shop order to SAP. 202 means SAP took it; the status follows.
    body:
      type: Order
    responses:
      202:
        body:
          example: |
            { "orderId": "WEB-81001", "status": "SENT" }
  /{orderId}:
    get:
      description: The SAP status of one order
      responses:
        200:
          body:
            type: OrderStatus
            example: |
              { "orderId": "WEB-81001", "status": "POSTED", "salesOrder": "0000012001" }
        404:
          body:
            example: |
              { "message": "No order WEB-89999" }
`
const STUDIO = `<!-- client side: Send IDoc and BAPIs. Server side: the Document listener registers a program ID -->
<sap:sap-config name="SAP_Config">
  <sap:simple-connection-provider-connection applicationServerHost="\${sap.applicationServerHost}"
      systemNumber="\${sap.systemNumber}" client="\${sap.client}"
      username="\${sap.username}" password="\${sap.password}" />
</sap:sap-config>
<sap:sap-config name="SAP_Listener_Config">
  <sap:simple-connection-provider-connection applicationServerHost="\${sap.applicationServerHost}"
      systemNumber="\${sap.systemNumber}" client="\${sap.client}"
      username="\${sap.username}" password="\${sap.password}"
      gatewayHost="\${sap.gatewayHost}" gatewayService="\${sap.gatewayService}"
      programID="\${sap.programId}" connectionCount="\${sap.connectionCount}" />
</sap:sap-config>
<api-gateway:autodiscovery apiId="\${api.id}" flowRef="${MAIN}" />

<flow name="post:\\orders:application\\json:sap-orders-api-config">
  <ee:transform doc:name="Order to ORDERS05">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/xml
---
ORDERS05: { IDOC @(BEGIN: "1"): {
  EDI_DC40 @(SEGMENT: "1"): { IDOCTYP: "ORDERS05", MESTYP: "ORDERS",
    SNDPRT: "LS", SNDPRN: "${WEB_PARTNER}", RCVPRT: "LS", RCVPRN: "${SID}CLNT${SAP_CLIENT}" },
  E1EDK14 @(SEGMENT: "1"): { QUALF: "008", ORGID: "1000" },
  E1EDKA1 @(SEGMENT: "1"): { PARVW: "AG", PARTN: payload.customer },
  E1EDK02 @(SEGMENT: "1"): { QUALF: "001", BELNR: payload.orderId },
  (payload.items map (it, i) -> E1EDP01 @(SEGMENT: "1"): {
    POSEX: (i + 1) * 10 as String {format: "000000"}, MENGE: it.qty, MENEE: "PCE",
    E1EDP19 @(SEGMENT: "1"): { QUALF: "002", IDTNR: it.material } })
} }]]></ee:set-payload></ee:message>
  </ee:transform>
  <sap:send doc:name="Send ORDERS05" config-ref="SAP_Config" key="ORDERS05" type="IDOC" />
  <!-- then 202 with the TID: SAP took the LUW. Posting happens in SAP. -->
</flow>

<flow name="sap-status-listener-flow">
  <sap:document-listener config-ref="SAP_Listener_Config" />
  <!-- ALEAUD01: per E1STATE, STAPA1 is the orderId, STATUS 53 posted, 51 not posted -->
</flow>`

const y = (s) => s.sap ?? {}
const word = (v) => String(v ?? '').trim()
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === NAME)
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === NAME && a.env === env && a.status === 'Running')
const orderOf = (s, id) => appOf(s)?.store?.orders?.[id]
const idocOf = (s, po, status) => (y(s).idocs ?? []).find((d) => d.dir === 'in' && d.mestyp === 'ORDERS' && d.ref === po && (!status || d.status === status))
const systemUser = (s) => (y(s).users?.[USER]?.type === 'System' ? USER : null)
const gwOk = (d) => word(d.gwhost).toLowerCase() === SAP_HOST && [GW_SERVICE, '3300'].includes(word(d.gwserv).toLowerCase())
const dest = (s) => (y(s).dests ?? []).find((d) => d.type === 'T' && d.programId === PROGRAM && gwOk(d))
const port = (s) => dest(s) && (y(s).ports ?? []).find((p) => p.dest === dest(s).name)
const partnerOk = (s) => {
  const p = partnerOf(y(s), WEB_PARTNER)
  return Boolean(p && port(s) && p.inbound.some((r) => r.mestyp === 'ORDERS' && r.process === 'ORDE') && p.outbound.some((r) => r.mestyp === 'ALEAUD' && r.port === port(s).name))
}
const contract = (s, env = 'Sandbox') => apiOf(s, env)?.contracts.some((c) => c.client === SHOP.name && c.status === 'approved')
const deployOk = (s) => {
  const a = appOf(s)
  const api = apiOf(s)
  if (!a || !api) return false
  const p = a.props
  return (
    word(p['sap.applicationServerHost']).toLowerCase() === SAP_HOST && word(p['sap.systemNumber']) === '00' && word(p['sap.client']) === SAP_CLIENT && word(p['sap.username']).toUpperCase() === USER &&
    a.secrets?.['sap.password'] === PASSWORD && !('sap.password' in p) && !('anypoint.platform.client_secret' in p) &&
    word(p['sap.gatewayHost']).toLowerCase() === SAP_HOST && [GW_SERVICE, '3300'].includes(word(p['sap.gatewayService']).toLowerCase()) && word(p['sap.programId']) === PROGRAM &&
    apiStatus(s, api) === 'Active'
  )
}

function sapSystem(now) {
  // a new interface: no RFC user, destination, port or partner for it yet
  const x = newSapSystem(now)
  delete x.users.MULE_RFC
  x.dests = x.dests.filter((d) => d.type === '3')
  x.ports = []
  x.partners = []
  x.logsys = [`${SID}CLNT${SAP_CLIENT}`]
  // a new customer the master data team has set up for the stores only (sales area 1000 20 00)
  x.customers['4714'] = { name: 'Marram Kitchen', areas: ['1000/20/00'], changes: [] }
  return x
}

const lab = {
  id: 'p-e2e-sap',
  group: 'End to end by system',
  title: 'End to end: web shop orders, Mule to SAP sales orders',
  minutes: 60,
  scenario: `The Brightmart web shop must create its orders as sales orders in SAP ${SID} client ${SAP_CLIENT} and show each order's SAP status. You build ${APP}, a Mule app on CloudHub 2.0 with the SAP Orders API: POST /orders maps the JSON order to an ORDERS05 IDoc and sends it to SAP; SAP posts it as a sales order and sends an ALEAUD01 audit back to the app's Document listener, which keeps the status for GET /orders/{orderId}. An order travels: web shop, API, DataWeave, tRFC, IDoc in SAP, sales order, audit IDoc, status in the API. Take it from the request mail through design, build, SAP setup, deployment, a traced order, a failure, an alert and Production.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      studioPkgs: { [ASSET]: NAME },
      clients: [SHOP],
      sap: sapSystem(at(1, 9)),
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Web shop orders into SAP: request',
          body: `Hello, from next week the web shop sends its orders to SAP instead of the order desk typing them. Each order has orderId (our web order number), customer (the SAP sold-to), and items with material and qty. In SAP it must become a standard order (TA) in sales area 1000 10 00, with our orderId as the purchase order number.\nVolume: about 1500 orders a day, peaks of 60 a minute on sale days.\nThe web shop must see for each order whether SAP posted it and the sales order number, so it can tell the customer.\nAn order SAP cannot post must not disappear. Order ops fixes it in SAP and posts it again.\nAlerts to ${TEAM}.\n\nThanks, Web shop team`,
          source: 'Brightmart web shop team',
        },
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'SAP interface for the web shop: what we agreed',
          body: `ALE with IDocs, as for our other partners. RFC user ${USER} of type System. Logical system ${WEB_PARTNER} for the web shop. Inbound ORDERS with process code ORDE, trigger immediately. Back to Mule: ALEAUD through a tRFC port to an RFC destination of type T, registered program ${PROGRAM} on gateway ${SAP_HOST} ${GW_SERVICE}.\nQuality system ${SID} client ${SAP_CLIENT} on ${SAP_HOST}, system number 00. Production system BRP client ${SAP_CLIENT} on ${PRD.host}, system number 00, gateway ${GW_SERVICE}, program ${PRD.program}. In BRP we create ${USER} ourselves; its practice password is ${PRD.password}.\nBrightmart SAP basis team`,
          source: 'Brightmart SAP basis team',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Read both mails: the fields, the volume, the status the web shop needs, the error rule, the alert address and what SAP basis agreed.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Design the SAP Orders API',
      how: 'Design Center, Create new, New API Specification, name SAP Orders API. Write the RAML below: POST /orders answers 202, GET /orders/{orderId} answers the status.',
      code: RAML,
      done: (s) => s.projects.some((p) => ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'POST', '/orders').status === 202 && mockCall(p.raml, 'GET', '/orders/WEB-81001').status === 200),
    },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the Mocking service, choose GET /orders/{orderId}, Try it, Send. The web shop team can build against the example now.', done: (s) => Boolean(s.seen.mock) && s.projects.some((p) => /sap/i.test(p.name)) },
    { title: 'Publish it to Exchange', how: `Publish, Publish to Exchange. Asset ID ${ASSET}, version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => Boolean(asset(s)) },
    {
      title: 'Build the flows in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project holds the flows your team wrote on this spec. The important part is below: the client and listener configs with \${property} placeholders, the DataWeave from the JSON order to ORDERS05, sap:send, and the Document listener for the audits.`,
      code: STUDIO,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'IDoc or BAPI',
      'The team could call BAPI_SALESORDER_CREATEFROMDAT2 instead of sending an IDoc. Why IDocs for this interface?',
      [
        'BAPIs cannot create sales orders',
        'An IDoc is asynchronous and SAP keeps it: an order SAP cannot post stays as an IDoc in status 51, where order ops fixes and posts it again with BD87. A BAPI answers at once but leaves a failed order to the caller, and needs BAPI_TRANSACTION_COMMIT in the same session',
        'IDocs need no RFC user',
        'BAPIs only work with JSON',
      ],
      1,
      'A BAPI is a synchronous RFC: good when the caller needs the sales order number in the same response, but the caller must handle every error and commit. ALE with IDocs suits the request: the web shop gets 202, SAP keeps every order with a status history in WE02, failed ones wait in 51 for BD87, and the ALEAUD audit carries the result back.',
    ),
    { title: 'Add Autodiscovery and export the jar', how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${MAIN}. Then choose Export.`, done: (s) => Boolean(project(s)?.jar && project(s).autodiscovery?.apiId === '${api.id}' && project(s).autodiscovery.flowRef === MAIN) },
    {
      title: 'Create the RFC user',
      how: `SAP from the console menu. Command field SU01. User ${USER}, user type System, password ${PASSWORD}, Create. A System user cannot log on with the SAP GUI and its password does not expire, so it fits an interface.`,
      done: (s) => Boolean(systemUser(s)),
    },
    {
      title: 'Let SAP reach the listener',
      how: `Command field SM59, Create: RFC Destination ${DEST}, Program ID ${PROGRAM}, Gateway Host ${SAP_HOST}, Gateway Service ${GW_SERVICE}, Save. Then WE21, Transactional RFC, Create: Port ${PORT} with RFC destination ${DEST}.`,
      done: (s) => Boolean(port(s)),
    },
    {
      title: 'Create the partner profile',
      how: `Command field BD54: New logical system ${WEB_PARTNER}, Save. Then WE20: New partner number ${WEB_PARTNER}, Create partner. Add inbound parameter ORDERS with process code ORDE and Trigger immediately. Add outbound parameter ALEAUD with receiver port ${PORT}, basic type ALEAUD01, Transfer IDoc immediately.`,
      done: partnerOk,
    },
    {
      title: 'Create the API instance with Client ID Enforcement',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint). Select ${ASSET}, Save & Deploy, and note the API Instance ID. Then Policies, Add policy, Client ID Enforcement, Apply. Open Environment information for the client ID and secret of Sandbox.`,
      done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) && Boolean(s.seen['env:Sandbox']),
    },
    { title: 'Give the web shop a contract', how: `Exchange, SAP Orders API, Request access. Pick the API instance of Sandbox and the application ${SHOP.name}, then Request access. With no SLA tiers the contract is approved at once.`, done: (s) => Boolean(contract(s)) },
    {
      title: 'Deploy the app to Sandbox',
      how: `Runtime Manager, Deploy application. Name ${APP}, choose the exported file ${ASSET}-1.0.0-mule-application.jar. Properties: sap.applicationServerHost ${SAP_HOST}, sap.systemNumber 00, sap.client ${SAP_CLIENT}, sap.username ${USER}, sap.gatewayHost ${SAP_HOST}, sap.gatewayService ${GW_SERVICE}, sap.programId ${PROGRAM}, sap.connectionCount 2, api.id the API Instance ID, anypoint.platform.client_id of Sandbox. Protect sap.password and anypoint.platform.client_secret. Deploy Application. The app is Running, the API instance turns Active, and SMGW in SAP shows ${PROGRAM} as a logged on client.`,
      done: (s) => deployOk(s) && Boolean(s.sap && registration(s, s.sap, PROGRAM, s.clock)),
    },
    {
      title: 'Send an order and follow it into SAP',
      how: `Lab tools, API client. Application ${APP}, POST /orders as ${SHOP.name} with the body ${body(GOOD)}. You get 202 and a TID. Runtime Manager, ${APP}, Logs: the line has the correlation ID (event:...) of the request. Move the clock 10 minutes. In SAP, WE02, Execute: the ORDERS IDoc of ${WEB_PARTNER} with reference ${GOOD.orderId} is in 53, and VA03 shows the sales order with the PO number ${GOOD.orderId}. Then GET /orders/${GOOD.orderId} answers POSTED with that sales order number: the audit came back.`,
      done: (s) => orderOf(s, GOOD.orderId)?.status === 'POSTED' && Boolean(idocOf(s, GOOD.orderId, '53')) && called(s, APP, 200, 'GET', new RegExp(`^/orders/${GOOD.orderId}`)) && Boolean(s.seen['sap:WE02'] || s.seen['sap:VA03']) && Boolean(s.seen[`logs:${APP}`]),
    },
    ask(
      'What 202 means',
      'The web shop team asks why POST /orders answers 202 and not 201 with the sales order number.',
      ['202 is the default of APIkit', 'Send IDoc ends when SAP has taken the tRFC LUW. Posting runs in SAP after the call and can still fail in 51, so the app cannot promise an order yet. The status comes later with the ALEAUD audit', 'SAP never returns order numbers', '201 is only for PUT'],
      1,
      'The tRFC call saves the IDoc in SAP, once, with its TID; that is the only promise the app can make. The sales order exists only after the application posted it (53). That is why the API offers GET /orders/{orderId}, fed by the audit, instead of pretending in the POST.',
    ),
    {
      title: 'Send an order SAP cannot post',
      how: `POST /orders as ${SHOP.name} with ${body(BAD)}. Move the clock 10 minutes. The IDoc stops in 51: Customer 4714 does not exist in sales area 1000 10 00. The audit brings the 51 back, the app logs an ERROR, and GET /orders/${BAD.orderId} answers FAILED with the SAP message. The order is not lost: it waits in SAP.`,
      done: (s) => Boolean(idocOf(s, BAD.orderId)) && (appOf(s)?.store?.failures ?? []).some((f) => f.po === BAD.orderId && f.status === '51'),
    },
    {
      title: 'Fix it in SAP and post it again',
      how: `Command field XD03, customer 4714. Under Request to the master data team pick 1000 10 00 and Send request. Move the clock 5 minutes until the mail of the master data team arrives. Then BD87: select the IDoc in status 51 and Process. It goes 62 and 53. Move the clock 5 minutes: the next audit makes ${BAD.orderId} POSTED.`,
      done: (s) => Boolean(idocOf(s, BAD.orderId, '53')) && orderOf(s, BAD.orderId)?.status === 'POSTED',
    },
    { title: 'Alert order ops', how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0 for 1 minute, severity High, recipient ${TEAM}. Each audit with a status other than 53 counts as an error.`, done: (s) => s.monAlerts.some((a) => a.enabled && a.resource === 'Application' && a.name_ === APP && a.metric === 'Message Error Count' && String(a.recipients ?? '').toLowerCase().includes(TEAM)) },
    ask(
      'What changes for Production',
      'You deploy the same jar to Production. Which values change?',
      ['None, SAP is the same everywhere', `The SAP host, the gateway host and the program ID (${PRD.program} on BRP), the password of ${USER} in BRP, api.id and the Anypoint client ID and secret of Production. The jar, the flows and the DataWeave stay the same`, 'Only the client number', 'Only api.id'],
      1,
      'Everything that names a system or a secret is a property, so one jar moves through the environments. Each SAP system has its own users and passwords, its own gateway and its own registered program ID, and BRP needs the same SU01, SM59, WE21, BD54 and WE20 setup, normally moved with a transport. The API instance has its own ID in Production, and the environment its own client ID and secret.',
    ),
    { title: 'Promote the API instance to Production', how: 'API Manager, switch to Production. Add API, Promote API from environment, source Sandbox, include the policies. Note the new API Instance ID. Then Exchange, Request access for the Production instance for the web shop.', done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id')) && Boolean(contract(s, 'Production')) },
    {
      title: 'Deploy to Production with the BRP values',
      how: `Runtime Manager in Production, Deploy application, the same exported file. sap.applicationServerHost and sap.gatewayHost ${PRD.host}, sap.systemNumber 00, sap.client ${SAP_CLIENT}, sap.username ${USER}, sap.gatewayService ${GW_SERVICE}, sap.programId ${PRD.program}, sap.password ${PRD.password} protected, api.id the Production API Instance ID, and the Production client ID and secret from Environment information. The app is Running and the Production instance Active. The lab has no BRP system, so the listener only logs where it registers.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const api = apiOf(s, 'Production')
        if (!a || !api) return false
        const p = a.props
        return apiStatus(s, api) === 'Active' && word(p['sap.applicationServerHost']).toLowerCase() === PRD.host && word(p['sap.gatewayHost']).toLowerCase() === PRD.host && word(p['sap.programId']) === PRD.program && word(p['sap.client']) === SAP_CLIENT && word(p['sap.username']).toUpperCase() === USER && a.secrets?.['sap.password'] === PRD.password && !('sap.password' in p)
      },
    },
  ],
  why: `The web shop needed its orders as SAP sales orders and the SAP status of each one. I designed an SAP Orders API in RAML, POST /orders answering 202 and GET /orders/{orderId} for the status, tried it in the mocking service and published it to Exchange. In Studio the POST flow maps the JSON order to an ORDERS05 IDoc in DataWeave and sends it with sap:send, and a Document listener registers a program ID at the SAP gateway to receive the ALEAUD01 audits. I chose IDocs over a BAPI because SAP keeps every order with its status, and a failed one waits in 51 for BD87 instead of being lost in a caller. In SAP I created a System type RFC user, an SM59 destination of type T for the program ID, a tRFC port in WE21, and in BD54 and WE20 the partner ${WEB_PARTNER} with inbound ORDERS and outbound ALEAUD. In API Manager the instance has Client ID Enforcement and the web shop a contract, and the jar deployed with the password protected. A test order went 202, IDoc 53, sales order in VA03, audit back, POSTED in the API, and I followed it by its correlation ID. An order for a customer missing the sales area stopped in 51, the app logged the audit as an error and the alert told order ops; after the master data fix BD87 posted it. For Production I promoted the instance and deployed the same jar with the BRP host, program ID and password.`,
  docs: 'https://docs.mulesoft.com/sap-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = saveProject(createProject(s, 'SAP Orders API'), 'p1', RAML)
    s = mark(s, 'mock')
    s = publish(s, 'p1', { assetId: ASSET, name: 'SAP Orders API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: MAIN } }), ASSET)
    s = createUser(s, { name: USER, type: 'System', password: PASSWORD }).state
    s = createDestination(s, { name: DEST, programId: PROGRAM, gwhost: SAP_HOST, gwserv: GW_SERVICE, text: 'Mule web shop orders' }).state
    s = createPort(s, { name: PORT, dest: DEST }).state
    s = createLogicalSystem(s, WEB_PARTNER).state
    s = createPartner(s, WEB_PARTNER, 'Brightmart web shop').state
    s = addInbound(s, WEB_PARTNER, { mestyp: 'ORDERS', process: 'ORDE', trigger: 'immediately' }).state
    s = addOutbound(s, WEB_PARTNER, { mestyp: 'ALEAUD', idoctp: 'ALEAUD01', port: PORT, mode: 'immediately' }).state
    s = addApi(s, { assetId: ASSET, label: 'sap-orders-sbx', upstream: '', consumer: '' })
    s = applyPolicy(s, apiOf(s).id, 'client-id')
    s = mark(s, 'env:Sandbox')
    s = requestAccess(s, apiOf(s).id, SHOP.name)
    const c = creds(s, 'Sandbox')
    const jar = jarsOf(s).find((j) => j.pkg === NAME)
    const sap = (host, program, password) => ({ props: { 'sap.applicationServerHost': host, 'sap.systemNumber': '00', 'sap.client': SAP_CLIENT, 'sap.username': USER, 'sap.gatewayHost': host, 'sap.gatewayService': GW_SERVICE, 'sap.programId': program, 'sap.connectionCount': '2' }, secrets: { 'sap.password': password } })
    const sbx = sap(SAP_HOST, PROGRAM, PASSWORD)
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { ...sbx.props, 'api.id': apiOf(s).id, ...c.props }, secrets: { ...sbx.secrets, ...c.secrets } }).state)
    s = advance(s, 2 * MINUTE)
    s = call(s, APP, SHOP, '/orders', 'POST', body(GOOD)).state
    s = mark(s, `logs:${APP}`)
    s = advance(s, 10 * MINUTE)
    s = mark(mark(s, 'sap:WE02'), 'sap:VA03')
    s = call(s, APP, SHOP, `/orders/${GOOD.orderId}`).state
    s = call(s, APP, SHOP, '/orders', 'POST', body(BAD)).state
    s = advance(s, 10 * MINUTE)
    s = requestSalesArea(s, BAD.customer, AREA).state
    s = advance(s, 6 * MINUTE)
    s = processIdocs(s, [idocOf(s, BAD.orderId, '51').docnum]).state
    s = advance(s, 6 * MINUTE)
    s = addMonAlert(s, { title: 'SAP order errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, apiOf(s, 'Sandbox').id, { policies: true, tiers: true, alerts: false })
    s = requestAccess(s, apiOf(s, 'Production').id, SHOP.name)
    const pc = creds(s, 'Production')
    const prd = sap(PRD.host, PRD.program, PRD.password)
    const pjar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...pjar, replicas: 1, vCores: 0.1, props: { ...prd.props, 'api.id': apiOf(s, 'Production').id, ...pc.props }, secrets: { ...prd.secrets, ...pc.secrets } }).state)
    return advance(s, 2 * MINUTE)
  },
  answers: { 5: 1, 14: 1, 18: 1 },
}

export const LABS = [lab]
