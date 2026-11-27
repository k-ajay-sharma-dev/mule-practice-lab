// The guided lab e2e-hl7. See platform-labs.js for the shape of a lab.
// The whole life of an HL7 feed: the request, the RAML of its ops API, Studio, the Epic outbound interface, API Manager,
// the deploy, one ADT message traced from Epic to the LIS, a duplicate, an update that came before its registration and
// was replayed, an alert and Production.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createClient, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio } from '../platform.js'
import { ask, creds, until } from '../platform-kit.js'
import { createInterface, LIS_HOST, LIS_PORT, MULE_HOST, newHl7, newInterface, newLis, PATIENTS, resend, sendTest, startInterface, TEST_MRN, TEST_MRN_2 } from '../platform-hl7.js'
import { ASSET, FEED, FLOW, KEYSTORES } from './e2e-hl7.pkg.js'

const PROJECT = 'ADT Feed System API'
const APP = 'bvh-adt-feed'
const IFACE = 'BVH_ADT_LIS'
const PRD_IFACE = 'BVH_ADT_LIS_PRD'
const PORT = 6690
const PRD_PORT = 6691
const EVENTS = ['A01', 'A03', 'A04', 'A08']
const ONCALL = 'integration-oncall@bayview.example'
const CONSOLE = 'Bayview Ops Console'
const [SBX_STORE, PRD_STORE] = Object.keys(KEYSTORES)
const word = (v) => String(v ?? '').trim()

const RAML = `#%RAML 1.0
title: ADT Feed System API
version: v1
mediaType: application/json
/status:
  get:
    description: The counts of the ADT feed since the app started
    responses:
      200:
        body:
          example: |
            { "listener": "0.0.0.0:6690", "received": 12, "delivered": 11, "duplicates": 1, "parked": 0 }
/messages/{controlId}:
  get:
    description: What happened to one message, by MSH-10
    responses:
      200:
        body:
          example: |
            { "ctl": "10045001", "type": "ADT^A04", "mrn": "990001", "result": "delivered" }
      404:
        body:
          example: |
            { "message": "No message with control ID 10049999" }
`
const FLOW_CODE = `<mllp:mllp-listener-config name="MLLP_TLS_Listener_config">
  <mllp:mllp-listener-connection host="0.0.0.0" port="\${mllp.port}">
    <tls:context>
      <tls:key-store path="\${mllp.tls.keystore}" keyPassword="\${secure::mllp.tls.keystorePassword}"
                     password="\${secure::mllp.tls.keystorePassword}" />
    </tls:context>
  </mllp:mllp-listener-connection>
</mllp:mllp-listener-config>

<flow name="adt-intake-flow">
  <mllp:mllp-listener config-ref="MLLP_TLS_Listener_config" />
  <hl7:read config-ref="HL7_EDI_Config" />
  <tracing:with-correlation-id correlationId="#[payload.MSH.'MSH-10']">
    <hl7:validate config-ref="HL7_EDI_Config" />
    <!-- idempotent on MSH-10: a control ID that reached the LIS is acknowledged again, not sent again -->
    <idempotent-message-validator idExpression="#[payload.MSH.'MSH-10']" objectStore="delivered-ids" />
    <ee:transform doc:name="Epic ADT to LIS ADT">
      <ee:set-payload><![CDATA[%dw 2.0
output application/hl7
---
payload update {
  case .MSH.'MSH-03'.'HD-01' -> "MULESOFT"   // the sending application the LIS expects
  case .MSH.'MSH-05'.'HD-01' -> "LIS"
  // PID-3 keeps the Bayview MRN (assigning authority BVH, type MR); the other ids stay in Epic
}]]></ee:set-payload>
    </ee:transform>
    <mllp:send config-ref="MLLP_LIS_config" />   <!-- \${lis.host}:\${lis.port}, waits for the ACK of the LIS -->
  </tracing:with-correlation-id>
  <error-handler>
    <!-- AE or AR from the LIS, or a validation error: park the message, answer Epic with the same code -->
    <on-error-continue type="HL7:VALIDATION, MLLP:CONNECTIVITY, APP:LIS_REJECTED">
      <flow-ref name="park-in-error-store" />
    </on-error-continue>
  </error-handler>
</flow>`

const MAIL = {
  t: at(1, 8, 40),
  to: 'integration-team@bayview.example',
  subject: 'New ADT feed from Epic to the LIS through MuleSoft',
  body: [
    'Hello integration team,',
    `The Bayview LIS needs admissions, discharges, registrations and updates from Epic: A01, A03, A04 and A08 and nothing else. About 3,000 messages a day, in bursts at shift change.`,
    `Epic side: a new outbound interface ${IFACE}, message type ADT, to the Mule listener ${MULE_HOST} port ${PORT}, MLLP over TLS, ACK timeout 30 seconds, On AE Continue.`,
    `Mule side: listen on port ${PORT} with TLS. Key store ${SBX_STORE} for Sandbox and ${PRD_STORE} for Production, passwords from the vault: ${KEYSTORES[SBX_STORE]} and ${KEYSTORES[PRD_STORE]} (lab values). Send to the LIS at ${LIS_HOST} port ${LIS_PORT} and ACK Epic only after the LIS took the message.`,
    'Epic resends after a timeout, so the same message can come twice. The LIS must never get a visit twice. A message the LIS refuses goes to the error store, and we resend it from Epic when the cause is fixed.',
    `Ops wants GET /status and GET /messages/{controlId} behind a client ID. Alerts to ${ONCALL}. Test with the ZZTEST patients ${TEST_MRN} and ${TEST_MRN_2}.`,
    `Production: the Epic team made ${PRD_IFACE} to port ${PRD_PORT}. It is stopped until the Production app listens.`,
    'Bayview integration team',
  ].join('\n\n'),
  source: 'Bayview integration team',
}

const project = (s) => s.projects.find((p) => /adt feed/i.test(p.name))
const resources = (raml) => ramlErrors(raml).length === 0 && [['GET', '/status'], ['GET', '/messages/10045001']].every(([m, path]) => mockCall(raml, m, path).status < 300)
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const studio = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === FEED)
const api = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const app = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === FEED && a.env === env && a.status !== 'Stopped')
const iface = (s, id = IFACE) => (s.hl7?.interfaces ?? []).find((i) => i.id === id)
const ifaceOk = (s) => {
  const i = iface(s)
  return Boolean(i) && i.type === 'ADT' && word(i.host).toLowerCase() === MULE_HOST && Number(i.port) === PORT && i.tls && [...i.events].sort().join() === EVENTS.join()
}
const configOk = (s, env) => {
  const a = app(s, env)
  if (a?.status !== 'Running') return false
  const p = a.props ?? {}
  const prod = env === 'Production'
  const store = prod ? PRD_STORE : SBX_STORE
  return word(p['mllp.port']) === String(prod ? PRD_PORT : PORT) && word(p['mllp.tls.keystore']) === store && a.secrets?.['mllp.tls.keystorePassword'] === KEYSTORES[store] && !('mllp.tls.keystorePassword' in p) && word(p['lis.host']).toLowerCase() === LIS_HOST && word(p['lis.port']) === String(LIS_PORT)
}
const activeIn = (s, env) => Boolean(api(s, env)) && apiStatus(s, api(s, env)) === 'Active'
const log = (s, leg = IFACE) => (s.hl7?.log ?? []).filter((e) => e.leg === leg)
const first = (s, event, mrn) => log(s).find((e) => e.type === `ADT^${event}` && e.mrn === mrn && e.ack === 'AA')
const visits = (s, mrn) => (s.hl7?.lis?.encounters ?? []).filter((e) => e.mrn === mrn)
const dupOk = (s) => {
  const a = first(s, 'A04', TEST_MRN)
  // the test A04 opens visit VT plus the last four digits of its control ID: the resend must not open it twice
  return Boolean(a) && log(s).filter((e) => e.ctl === a.ctl && e.ack === 'AA').length >= 2 && visits(s, TEST_MRN).filter((v) => v.visit === `VT${a.ctl.slice(-4)}`).length === 1 && (app(s)?.store?.n?.duplicates ?? 0) >= 1
}
const a08 = (s) => log(s).find((e) => e.type === 'ADT^A08' && e.mrn === TEST_MRN_2 && e.ack === 'AE')
const replayed = (s) => {
  const x = a08(s)
  return Boolean(x) && log(s).some((e) => e.ctl === x.ctl && e.ack === 'AA' && e.id > x.id) && visits(s, TEST_MRN_2).some((v) => v.status === 'Admitted' && /^4W 407/.test(v.loc))
}

const lab = {
  id: 'p-e2e-hl7',
  group: 'End to end by system',
  title: 'End to end: ADT messages, Epic over MLLP to the Bayview LIS',
  minutes: 55,
  scenario: `Bayview Health wants its laboratory system to know about every admission, discharge, registration and update in Epic. Epic sends HL7 v2 ADT messages over MLLP from an outbound interface to the Mule app ${APP}, built on the System API ${PROJECT}. The app validates each message, skips a control ID it delivered before, sends it to the Bayview LIS and passes the ACK of the LIS back to Epic. You take it from the request mail to Production: the RAML of the ops API, Studio, the Epic interface, API Manager, the deploy, one message traced, a duplicate, a message out of order replayed, an alert and Production.`,
  start() {
    const clock = at(1, 8)
    const lis = newLis({ patients: Object.fromEntries(['880021', '880107'].map((m) => [m, { name: PATIENTS[m].name.join('^'), dob: PATIENTS[m].dob, sex: PATIENTS[m].sex, mergedInto: null }])) })
    const s = newPlatform({
      clock,
      hl7: newHl7(clock, { interfaces: [newInterface({ id: PRD_IFACE, name: 'ADT to LIS, Production', events: EVENTS, port: PRD_PORT, tls: true, status: 'Stopped' })], lis }),
      studioPkgs: { [ASSET]: FEED },
      mail: [MAIL],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the events, the port, TLS, the key stores, the ACK rule, the duplicates rule and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Create the API specification', how: `Design Center, Create new, New API Specification. Project Name ${PROJECT}, so the asset ID becomes ${ASSET}. It is the ops API of the feed: the messages themselves come over MLLP.`, done: (s) => Boolean(project(s)) },
    { title: 'Write the RAML', how: 'Add GET /status and GET /messages/{controlId}, each with a 200 example, and a 404 example for an unknown control ID. You can paste this one.', code: RAML, done: (s) => Boolean(project(s)) && resources(project(s).raml) },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on Mocking service, open GET of /status, Try it, Send.', done: (s) => Boolean(s.seen.mock) && Boolean(project(s)) },
    { title: 'Publish to Exchange', how: 'Publish, Asset version 1.0.0, API version v1, LifeCycle State Stable, Publish to Exchange.', done: (s) => Boolean(asset(s)) },
    {
      title: 'Import the spec into Studio',
      how: `Anypoint Studio from the menu, Import a published API, ${PROJECT}. APIkit makes the ops flows; the team adds ${FLOW}. Its important part is below: the TLS listener with the key store from properties, MSH-10 as the correlation ID, Validate, the duplicate check, the mapping for the LIS, the send and the error handler.`,
      code: FLOW_CODE,
      done: (s) => Boolean(studio(s)),
    },
    ask(
      'When to ACK',
      'Epic waits for the ACK of each message before it sends the next. When should the app send it?',
      [
        'As soon as the listener reads the message, it is faster',
        'After the LIS has taken it, with the code of the LIS: AA, AE or AR. Epic drops a message only once it is safe at the LIS, the order holds because Epic waits, and an AE reaches Epic. The work must stay inside the ACK timeout of 30 seconds',
        'Never, MLLP needs no ACK',
        'Once a minute, for all messages together',
      ],
      1,
      'An ACK tells Epic the message is safe, so Epic removes it from its queue. ACK on receipt is faster but then the app owns the message: it must store it durably, keep the order and handle every failure itself, usually with a persistent queue. ACK after processing keeps that with Epic, at the cost of the ACK timeout.',
    ),
    {
      title: 'Create the Epic outbound interface',
      how: `HL7 interfaces from the console menu, Interfaces, New interface. Interface ID ${IFACE}, Message type ADT, Destination host ${MULE_HOST}, Port ${PORT}, ACK timeout (s) 30, On AE Continue, Events A01, A03, A04 and A08 only, TLS (MLLP over TLS) on. Create. It starts Stopped.`,
      done: ifaceOk,
    },
    {
      title: 'Create the API instance',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), ${PROJECT} from Exchange, instance label adt-feed-sbx, Save & Deploy. Open Environment information and note the client ID and secret of Sandbox.`,
      done: (s) => Boolean(api(s)) && Boolean(s.seen['env:Sandbox']),
    },
    { title: 'Apply Client ID Enforcement', how: 'API instance, Policies, Add policy, Client ID Enforcement. The status of the feed is patient data too, so only known clients read it.', done: (s) => Boolean(api(s)?.policies.some((p) => p.type === 'client-id')) },
    {
      title: 'Add API Autodiscovery and export',
      how: `Anypoint Studio, ${ASSET}, Create API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. OK, then Export.`,
      done: (s) => Boolean(studio(s)?.autodiscovery?.apiId) && /-main$/.test(studio(s)?.autodiscovery?.flowRef ?? '') && Boolean(studio(s)?.jar),
    },
    {
      title: 'Deploy to Sandbox',
      how: `Runtime Manager, Deploy application, name ${APP}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: api.id the instance ID, anypoint.platform.client_id, mllp.port ${PORT}, mllp.tls.keystore ${SBX_STORE}, lis.host ${LIS_HOST}, lis.port ${LIS_PORT}. Protect anypoint.platform.client_secret and mllp.tls.keystorePassword. Deploy, read the Logs for MLLP listener started, and see the API Active in API Manager.`,
      done: (s) => configOk(s, 'Sandbox') && activeIn(s, 'Sandbox') && Boolean(s.seen[`logs:${app(s)?.name}`]),
    },
    {
      title: 'Start the interface and see it connect',
      how: `HL7 interfaces, Interfaces, ${IFACE}, Start. Move the clock a minute. It shows Connected, and under MLLP listeners port ${PORT} belongs to ${APP} with TLS.`,
      done: (s) => configOk(s, 'Sandbox') && iface(s)?.status === 'Running' && Boolean(iface(s)?.connected) && Boolean(s.seen['hl7:interfaces']),
    },
    {
      title: 'Send a registration and follow it',
      how: `On ${IFACE} pick A04 register test patient and Send test message, then move the clock a minute. Message log: open the A04 by its Control ID and read the ACK, MSA-1 AA. Runtime Manager, ${APP}, Logs: the line with correlationId set to that control ID says it was sent to the LIS. Bayview LIS lists ZZTEST, BRIGHTMART with MRN ${TEST_MRN} and one visit.`,
      done: (s) => Boolean(first(s, 'A04', TEST_MRN)) && Boolean(s.seen[`hl7-msg:${first(s, 'A04', TEST_MRN).ctl}`]) && Boolean(s.seen['hl7:lis']) && Boolean(s.hl7?.lis?.patients?.[TEST_MRN]),
    },
    ask(
      'The same message twice',
      'Epic did not get an ACK in time and sends the same A04 again, with the same MSH-10. What must the app do?',
      [
        'Send it to the LIS again, the LIS will cope',
        'Check MSH-10 against the control IDs it delivered, in a persistent object store. A known one gets AA again and is not sent, so Epic moves on and the LIS gets one visit',
        'Answer AR so Epic stops sending it',
        'Drop it without an ACK',
      ],
      1,
      'MLLP gives at least once delivery: a lost or late ACK means Epic sends again. The receiver makes it exactly once in effect by being idempotent on the message control ID. An AR would put the message back in the queue of Epic, and no ACK at all makes Epic wait and resend for ever.',
    ),
    {
      title: 'Give the ops console a contract',
      how: `Exchange, ${PROJECT}, Request access. API Instance Sandbox, adt-feed-sbx, Application Create a new application named ${CONSOLE}, Request access.`,
      done: (s) => Boolean(api(s)?.contracts.some((c) => c.client === CONSOLE && c.status === 'approved')),
    },
    {
      title: 'Resend the registration and prove no duplicate',
      how: `Message log, open the A04 of ${TEST_MRN} and press Resend. Move the clock a minute. The new try gets AA, the log of ${APP} says duplicate, and Bayview LIS still has one visit for ${TEST_MRN}. API client, ${APP}, client application ${CONSOLE}, GET /status shows duplicates 1.`,
      done: (s) => dupOk(s) && (s.lastCalls ?? []).some((c) => c.app === app(s)?.name && c.env === 'Sandbox' && c.status === 200 && /^\/status/.test(c.path)),
    },
    {
      title: 'An update before its registration',
      how: `On ${IFACE} send A08 update second test patient and move the clock a minute. The LIS answers AE 204 Patient ${TEST_MRN_2} is not on file: the registration has not reached it. The app logs the error, Epic gets AE and goes on, and Error store holds the A08 with its reason. Nothing is lost.`,
      done: (s) => Boolean(a08(s)) && (s.hl7?.errors ?? []).some((x) => x.mrn === TEST_MRN_2) && Boolean(s.seen['hl7:errors']),
    },
    {
      title: 'Register the patient and replay the update',
      how: `Send A04 register second test patient and move the clock a minute: AA. Then Message log, open the A08 of ${TEST_MRN_2} that got AE and press Resend. Move the clock a minute. It gets AA, and Bayview LIS shows visit VT2002 Admitted in 4W 407 B.`,
      done: replayed,
    },
    {
      title: 'Alert on refused messages',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0, recipient ${ONCALL} from the mail.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === app(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ONCALL)),
    },
    {
      title: 'Promote and deploy to Production',
      how: `Switch to Production. API Manager, Add API, Promote API from environment, source Sandbox, include Policies. Runtime Manager in Production, Deploy application ${APP} from the same jar: api.id the Production instance, the Production client ID and secret, mllp.port ${PRD_PORT}, mllp.tls.keystore ${PRD_STORE} with its own password, protected, lis.host and lis.port as before. The API must show Active.`,
      done: (s) => configOk(s, 'Production') && activeIn(s, 'Production'),
    },
    {
      title: 'See a message arrive in Production',
      how: `HL7 interfaces, ${PRD_IFACE}, Start, and move the clock a minute: Connected to port ${PRD_PORT}. Send A04 register test patient on it and move the clock a minute. The Message log shows the A04 on ${PRD_IFACE} with AA from the Production app.`,
      done: (s) => configOk(s, 'Production') && log(s, PRD_IFACE).some((e) => e.type === 'ADT^A04' && e.ack === 'AA'),
    },
  ],
  why: `I built an HL7 v2 ADT feed from Epic to a laboratory system. The request named the events, the target, the ACK rule and that the LIS must never get a visit twice. I designed a small ops API in RAML, GET /status and GET /messages/{controlId}, mocked it, published it and built the flows in Studio on that spec. The feed itself is an MLLP listener over TLS, with the key store and its password per environment as properties. On the Epic side I set up an outbound interface with only the four events the LIS needs, TLS and an ACK timeout. I set the correlation ID to MSH-10, validate, check MSH-10 against an object store so a resend is acknowledged and not sent twice, map the message for the LIS and send it over MLLP, and pass the ACK of the LIS back to Epic only after the LIS took it. I traced one A04 by its control ID from the Epic message log to the app log to the LIS. An update that arrived before its registration got AE, went to the error store, and after the registration I resent it from Epic and it went through. Production is the same jar on its own port and key store, with its own API instance and a Production interface. In the lab one host name reaches the listener of any app, and both environments send to the one LIS of the lab.`,
  docs: 'https://docs.mulesoft.com/mllp-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, PROJECT)
    const pid = s.projects.at(-1).id
    s = mark(saveProject(s, pid, RAML), 'mock')
    s = publish(s, pid, { assetId: ASSET, name: PROJECT, version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = createInterface(s, { id: IFACE, name: 'ADT to LIS through MuleSoft', type: 'ADT', events: EVENTS, host: MULE_HOST, port: String(PORT), tls: true, ackTimeout: '30', onAe: 'Continue' }).state
    s = addApi(s, { assetId: ASSET, label: 'adt-feed-sbx', upstream: '', consumer: '' })
    const sbxApi = s.lastApi
    s = applyPolicy(mark(s, 'env:Sandbox'), sbxApi, 'client-id')
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    const jar = jarsOf(s).find((j) => j.project === ASSET)
    const form = (env, apiId, port, store) => {
      const c = creds(s, env)
      return { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { 'api.id': apiId, ...c.props, 'mllp.port': String(port), 'mllp.tls.keystore': store, 'lis.host': LIS_HOST, 'lis.port': String(LIS_PORT) }, secrets: { ...c.secrets, 'mllp.tls.keystorePassword': KEYSTORES[store] } }
    }
    s = finishDeploys(deployApp(s, form('Sandbox', sbxApi, PORT, SBX_STORE)).state)
    s = mark(advance(s, MINUTE), `logs:${APP}`)
    s = mark(advance(startInterface(s, IFACE).state, MINUTE), 'hl7:interfaces')
    s = advance(sendTest(s, IFACE, 'A04').state, 2 * MINUTE)
    const reg = first(s, 'A04', TEST_MRN)
    s = mark(mark(s, `hl7-msg:${reg.ctl}`), 'hl7:lis')
    s = requestAccess(createClient(s, CONSOLE), sbxApi, CONSOLE)
    s = advance(resend(s, [reg.id]).state, 2 * MINUTE)
    const client = s.clients.find((c) => c.name === CONSOLE)
    s = callApi(s, { env: 'Sandbox', app: APP, method: 'GET', path: '/status', body: '', client: client.name, clientId: client.clientId, clientSecret: client.clientSecret }).state
    s = mark(advance(sendTest(s, IFACE, 'A08 second').state, 2 * MINUTE), 'hl7:errors')
    s = advance(sendTest(s, IFACE, 'A04 second').state, 2 * MINUTE)
    s = advance(resend(s, [a08(s).id]).state, 2 * MINUTE)
    s = addMonAlert(s, { title: 'ADT feed errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ONCALL })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, sbxApi, { policies: true, tiers: true, alerts: false })
    s = finishDeploys(deployApp(s, form('Production', s.lastApi, PRD_PORT, PRD_STORE)).state)
    s = advance(startInterface(advance(s, MINUTE), PRD_IFACE).state, MINUTE)
    return advance(sendTest(s, PRD_IFACE, 'A04').state, 2 * MINUTE)
  },
  answers: { 6: 1, 14: 1 },
}

export const LABS = [lab]
