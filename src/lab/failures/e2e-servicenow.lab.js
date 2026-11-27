// The end to end lab of ServiceNow. See platform-labs.js for the shape of a lab.
// Store alerts of the Brightmart store monitor become ServiceNow incidents: design, build, the integration user, the
// Anypoint MQ retry queues, API Manager, deployment, one alert traced to its incident, the same alert as a work note, a
// store outage that hits the rate limit of the instance and waits in the dead letter queue until the limit is fixed and
// the alerts are replayed, an alert and Production.
// lab: the lab has one ServiceNow instance, so Production ends with the deployment and its configuration.
import {
  addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createProject, deployApp, finishDeploys, importSpec, mark, MINUTE, mockCall, newPlatform, packageJar, pairing, promoteApi, publish, ramlErrors,
  requestAccess, runNow, saveProject, setStudio,
} from '../platform.js'
import { ask, OPS } from '../platform-kit.js'
import { addClientApp, clientApps, createQueue, isFifo } from '../platform-mq.js'
import { ciId, createUser, groupId, INSTANCE_URL, newServicenow, REST_ROLE, rowsOf, saveRateRule, setRole, setUserFields, userOf } from '../platform-servicenow.js'
import { ALERT, keyOf, SN_ASSET as ASSET, SN_CONSUMER, SN_PKG, SN_REPLAY, SOURCE } from './e2e-servicenow.pkg.js'

const SVC = 'svc_store_incidents'
const SVC_PASSWORD = 'Store-Inc-Lab-2026'
const WRITE_ROLE = 'sn_incident_write'
const GROUP = 'Store Systems'
const DEVICE = 'STORE-0042-POS'
const QUEUE = 'store-incidents-retry'
const DLQ = 'store-incidents-dlq'
const ATTEMPTS = 3
const MQ_URL = 'https://mq-us-east-1.anypoint.mulesoft.com/api/v1'
const MQC = 'store-incident-papi-sbx'
const MQC_PRD = 'store-incident-papi-prd'
const CALLER = { name: SOURCE, clientId: 'storemon-6b20d4', clientSecret: 'storemon-secret-81' }
const ALERT_TO = 'store-systems@brightmart.example'
const CID = 'store-0042-test-1'
const ROLE_RULE = { name: 'Test instance, incident writers', type: 'Role', who: WRITE_ROLE, limit: 15 }
const USER_LIMIT = 300
const PRD = { instance: 'https://brightmart-prod.service-now.lab', password: 'Store-Inc-Prd-5582' }
const FIRST = ALERT('CARD_READER_OFFLINE', 'Card reader of till 3 offline')
const OUTAGE = ALERT('TILL_OFFLINE', 'Till 1 lost its connection to the store server', 1)
const KEY1 = keyOf(JSON.parse(FIRST))
const KEY2 = keyOf(JSON.parse(OUTAGE))

const RAML = `#%RAML 1.0
title: Store Incident API
version: v1
mediaType: application/json
types:
  StoreAlert:
    properties:
      store: string
      device: string
      problem: string
      summary: string
      impact?:
        type: integer
        enum: [1, 2, 3]
  Result:
    properties:
      number?: string
      action?: string
      status?: string
      correlationId: string
/incidents:
  post:
    description: One store alert. 201 opens an incident, 200 adds a work note to the open one, 202 queues it for a retry.
    body:
      type: StoreAlert
      example: |
        { "store": "0042", "device": "STORE-0042-POS", "problem": "CARD_READER_OFFLINE", "summary": "Card reader of till 3 offline", "impact": 2 }
    responses:
      201:
        body:
          type: Result
          example: |
            { "number": "INC0010001", "action": "created", "correlationId": "store-0042-test-1" }
      200:
        body:
          type: Result
          example: |
            { "number": "INC0010001", "action": "updated", "correlationId": "store-0042-test-1" }
      202:
        body:
          type: Result
          example: |
            { "status": "QUEUED", "correlationId": "store-0042-test-1" }
  /{number}:
    get:
      description: The state of an incident
      responses:
        200:
          body:
            example: |
              { "number": "INC0010001", "state": "New", "priority": "3 Moderate", "assignment_group": "Store Systems", "correlation_id": "0042:STORE-0042-POS:CARD_READER_OFFLINE" }
        404:
          body:
            example: |
              { "message": "No incident INC0019999" }
`
const FLOW_CODE = `<!-- Global elements: every value is a property, the secrets are secure properties -->
<http:request-config name="ServiceNow_Config">
  <http:request-connection protocol="HTTPS" host="#[(p('snow.instance') splitBy '//')[1]]" port="443">
    <http:authentication><http:basic-authentication username="\${snow.username}" password="\${secure::snow.password}"/></http:authentication>
  </http:request-connection>
</http:request-config>
<anypoint-mq:config name="Anypoint_MQ_Config">
  <anypoint-mq:connection url="\${mq.url}" clientId="\${secure::mq.clientId}" clientSecret="\${secure::mq.clientSecret}"/>
</anypoint-mq:config>

<!-- POST /incidents: one open incident per store, device and problem -->
<flow name="post:\\incidents:application\\json:store-incident-api-config">
  <set-variable variableName="key" value="#[upper(payload.store ++ ':' ++ payload.device ++ ':' ++ payload.problem)]"/>
  <http:request doc:name="Find open incident" method="GET" config-ref="ServiceNow_Config" path="/api/now/table/incident">
    <http:query-params>#[{ sysparm_query: 'correlation_id=' ++ vars.key ++ '^stateIN1,2,3', sysparm_fields: 'sys_id,number,state', sysparm_limit: 1 }]</http:query-params>
  </http:request>
  <choice>
    <when expression="#[!isEmpty(payload.result)]">
      <http:request doc:name="Add work note" method="PATCH" config-ref="ServiceNow_Config" path="#['/api/now/table/incident/' ++ payload.result[0].sys_id]"/>
    </when>
    <otherwise>
      <!-- correlation_id = the key, cmdb_ci = the device, assignment_group = \${snow.assignmentGroup} -->
      <http:request doc:name="Create incident" method="POST" config-ref="ServiceNow_Config" path="/api/now/table/incident"/>
    </otherwise>
  </choice>
  <error-handler>
    <!-- 429, 5xx or no connection: keep the alert, answer 202 -->
    <on-error-continue type="HTTP:TOO_MANY_REQUESTS, HTTP:INTERNAL_SERVER_ERROR, HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY">
      <anypoint-mq:publish config-ref="Anypoint_MQ_Config" destination="\${mq.retryQueue}" doc:name="Queue for retry"/>
      <set-variable variableName="httpStatus" value="202"/>
    </on-error-continue>
  </error-handler>
</flow>

<!-- the retry queue: the same logic; an error nacks the message, and the queue moves it to its DLQ after its attempts -->
<flow name="${SN_CONSUMER}">
  <anypoint-mq:subscriber config-ref="Anypoint_MQ_Config" destination="\${mq.retryQueue}" acknowledgementMode="AUTO"/>
  <flow-ref name="raise-incident"/>
</flow>
<flow name="${SN_REPLAY}"><!-- disabled scheduler: run it by hand to move \${mq.dlq} back to \${mq.retryQueue} --></flow>`

const word = (v) => String(v ?? '').trim()
const y = (s) => s.servicenow
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.env === env && a.pkg === SN_PKG && a.status !== 'Stopped')
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const resourcesOk = (raml) => ramlErrors(raml ?? '').length === 0 && mockCall(raml, 'POST', '/incidents').status < 300 && mockCall(raml, 'GET', '/incidents/INC0010001').status < 300
const designed = (s) => s.projects.some((p) => /incident/i.test(p.name) && resourcesOk(p.raml))
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === SN_PKG)
const props = (a) => ({ ...a?.props, ...a?.secrets })
const queue = (s, name) => s.queues.find((q) => q.name === name)
const logs = (s, env = 'Sandbox') => appOf(s, env)?.logs ?? []
const firstLog = (s, re) => logs(s).find((l) => re.test(l.text))
const incidents = (s, key) => rowsOf(y(s), 'incident').filter((r) => r.correlation_id === key)
const sameSet = (a, b) => a.length === b.length && b.every((x) => a.includes(x))
const mqClient = (s, env, name) => ((s.mqClients ?? []).some((c) => c.env === env && c.name === name) ? clientApps(s, env).find((c) => c.name === name) : null)
const ruleOf = (s, pick) => (y(s)?.rateRules ?? []).find(pick)
const userRule = (s) => ruleOf(s, (r) => r.active && r.type === 'User' && r.who === SVC && Number(r.limit) >= 100)
const roleRuleKept = (s) => Boolean(ruleOf(s, (r) => r.active && r.type === 'Role' && r.who === WRITE_ROLE && Number(r.limit) === ROLE_RULE.limit))

const userOk = (s) => {
  const u = userOf(y(s), SVC)
  return Boolean(u?.active && u.web_service_access_only && !u.locked_out && String(u.pw ?? '').length >= 8 && sameSet(u.roles, [REST_ROLE, WRITE_ROLE]))
}
const queuesOk = (s) => {
  const q = queue(s, QUEUE)
  const d = queue(s, DLQ)
  return Boolean(q && d) && !isFifo(q) && !isFifo(d) && q.dlq === DLQ && q.attempts === ATTEMPTS && Boolean(mqClient(s, 'Sandbox', MQC))
}
const apiOk = (s) => {
  const api = apiOf(s)
  return Boolean(api && api.policies.some((p) => p.type === 'client-id') && api.contracts.some((c) => c.client === CALLER.name && c.status === 'approved') && s.seen['env:Sandbox'])
}
const mqOk = (s, a, env, name) => {
  const c = mqClient(s, env, name)
  const p = props(a)
  return Boolean(c) && a.secrets['mq.clientId'] === c.clientId && a.secrets['mq.clientSecret'] === c.clientSecret && word(p['mq.url']) === MQ_URL && word(p['mq.retryQueue']) === QUEUE && word(p['mq.dlq']) === DLQ
}
const deployedOk = (s) => {
  const a = appOf(s)
  const u = userOf(y(s), SVC)
  if (a?.status !== 'Running' || !userOk(s) || !queuesOk(s)) return false
  const p = props(a)
  return (
    word(p['snow.instance']).replace(/\/$/, '') === INSTANCE_URL && word(p['snow.username']) === SVC && a.secrets['snow.password'] === u.pw && a.props['snow.password'] === undefined && word(p['snow.assignmentGroup']) === GROUP &&
    mqOk(s, a, 'Sandbox', MQC) && pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s)) === 'Active'
  )
}
const raisedOk = (s) => {
  const [inc] = incidents(s, KEY1)
  return Boolean(inc && inc.sys_created_by === SVC && inc.assignment_group === groupId(y(s), GROUP) && inc.cmdb_ci === ciId(y(s), DEVICE)) && Boolean(firstLog(s, new RegExp(`correlationId=${CID} Alert ${KEY1}: incident ${inc.number} created`))) && Boolean(s.seen[`snow:form:${inc.number}`])
}
const queuedAt = (s) => firstLog(s, /for a retry/)?.t
const dlqAt = (s) => firstLog(s, new RegExp(`${SN_CONSUMER}[\\s\\S]*HTTP:TOO_MANY_REQUESTS|HTTP:TOO_MANY_REQUESTS[\\s\\S]*delivery ${ATTEMPTS}\\.`))?.t
const ruleSavedAt = (s) => (y(s)?.syslog ?? []).filter((l) => l.source === 'Rate limit' && new RegExp(`saved: \\d+ per hour for User ${SVC}`).test(l.message)).at(-1)?.t
const replayOf = (s) => appOf(s)?.schedules.find((x) => x.flow === SN_REPLAY)?.last

const lab = {
  id: 'p-e2e-servicenow',
  group: 'End to end by system',
  title: 'End to end: store alerts, store monitor to ServiceNow incidents',
  minutes: 55,
  scenario: `The ${SOURCE} raises an alert when a till, a card reader or a store network fails, and the Store Systems team wants each one as a ServiceNow incident, without a new incident each time the same alert fires again. You build it end to end: the Store Incident API in Design Center, the Mule app in Studio on that spec, the integration user in ServiceNow, an Anypoint MQ retry queue with a dead letter queue, API Manager with the monitor as a client, the deployment, one alert traced to its incident, the same alert as a work note, a store outage that hits the rate limit of the instance and comes back with a replay, an alert and Production. The record path: POST /incidents, a search by correlation_id, then PATCH with a work note or POST of a new incident; on 429 the alert waits in the retry queue. The Inbox has the request.`,
  start() {
    const now = at(1, 9)
    const sn = newServicenow(now)
    sn.rateRules.push({ sys_id: 'c0ffee5a7e11ab9c0d000000000e2e01', resource: 'Table API', active: true, ...ROLE_RULE })
    const s = newPlatform({ clock: now, servicenow: sn, studioPkgs: { [ASSET]: SN_PKG }, clients: [CALLER] })
    s.seen = {}
    s.mail = [
      {
        t: at(1, 8, 35),
        to: OPS,
        subject: 'Store alerts into ServiceNow incidents',
        body: [
          'Hello integration team,',
          `Our ${SOURCE} raises alerts for the tills, card readers and store networks of 60 stores. Today someone types each one into ServiceNow by hand. Please build an integration into the test instance ${INSTANCE_URL}:`,
          `1. An API for the monitor (client app ${SOURCE}): POST /incidents with store, device, problem, summary and impact, and GET /incidents/{number}. Only known client apps.`,
          `2. One open incident per store, device and problem. When the same alert fires again, add a work note to the open incident and do not open a second one. Assignment group ${GROUP}, configuration item the device (such as ${DEVICE}).`,
          `3. An integration user ${SVC}: web service access only, with the roles ${REST_ROLE} and ${WRITE_ROLE} and nothing else. No itil, no admin.`,
          `4. Our instance has rate limit rules. An alert must never be lost when ServiceNow says no for a while: keep it in an Anypoint MQ queue ${QUEUE} with a dead letter queue ${DLQ}, ${ATTEMPTS} delivery attempts.`,
          `5. Failures alert ${ALERT_TO}.`,
          `6. Production after the test: instance ${PRD.instance}, the same user name with the password ${PRD.password} (made by the ServiceNow team), the same queue names in Production with a Production client app. All lab values.`,
          'Brightmart store systems',
        ].join('\n\n'),
        source: 'Brightmart store systems',
      },
    ]
    return s
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar. Note the caller, the rule for a repeated alert, the assignment group, the user and its roles, the queues, the alert recipient and the Production values.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Design the Store Incident API', how: 'Design Center, Create new, New API Specification, name Store Incident API. Write POST /incidents with the answers 201, 200 and 202, and GET /incidents/{number}, with examples. You can use this RAML.', code: RAML, done: designed },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the mocking service, choose POST /incidents, Try it, Send. The monitor team can build against the example before the app exists.', done: (s) => designed(s) && Boolean(s.seen.mock) },
    { title: 'Publish to Exchange', how: `Publish at the top right. Asset id ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => s.assets.some((a) => a.assetId === ASSET) },
    {
      title: 'Build the flows in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project carries the flows of the team: POST /incidents with Find open incident, then Add work note or Create incident, an error handler that queues the alert, and the Subscriber of the retry queue. Read the important part below.`,
      code: FLOW_CODE,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'Find before you create',
      'Why does the flow search for an open incident with the same correlation_id before it creates one?',
      [
        'ServiceNow refuses two incidents with the same short description',
        'A monitor fires the same alert again on every check while the problem lasts. Without the search each check opens a new incident, and the Store Systems team works ten tickets for one broken card reader. With it, the first alert opens the incident and the rest become work notes on it, so the history stays in one place',
        'The search makes the POST faster',
        'The Table API needs a GET before every POST',
      ],
      1,
      'The Table API inserts a record for every POST; it has no upsert of its own. The client keeps the rule: a stable key per problem, stored in correlation_id, and a query with stateIN1,2,3 so a closed incident does not swallow a new failure. An import set with a coalesce field is the other way to get the same result.',
    ),
    {
      title: 'Add API Autodiscovery and export the jar',
      how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then choose Export.`,
      done: (s) => Boolean(project(s)?.autodiscovery?.apiId && project(s).autodiscovery.flowRef === `${ASSET}-main` && project(s).jar),
    },
    {
      title: 'Create the integration user in ServiceNow',
      how: `ServiceNow from the console menu, User Administration, Users, New. User ID ${SVC}, First name Store, Last name Incidents, check Web service access only, Submit. Open the user: under Roles add ${REST_ROLE} and ${WRITE_ROLE}, and under Set password give it a password of yours. No itil, no admin: ${WRITE_ROLE} reads and writes incidents, and ${REST_ROLE} lets it call the REST API.`,
      done: userOk,
    },
    {
      title: 'Create the retry queues and the client app',
      how: `MQ, Destinations, + Add, Queue. First ${DLQ}, Standard queue, Create Queue. Then + Add, Queue: ${QUEUE}, Standard queue, check Assign a Dead Letter Queue, Dead Letter Queue Name ${DLQ}, Delivery attempts before reroute ${ATTEMPTS}. Create Queue. Then Client Apps, + Add, App Name ${MQC}, Save, and copy its Client ID and Client Secret.`,
      done: queuesOk,
    },
    {
      title: 'Create the API instance and protect it',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), the API ${ASSET}, Save & Deploy. Policies, Add policy, Client ID Enforcement. Open Environment information. Then Exchange, Store Incident API, Request access: the Sandbox instance and the application ${SOURCE}.`,
      done: apiOk,
    },
    {
      title: 'Deploy the app',
      how: `Runtime Manager, Deploy application, name ${SN_PKG}, the exported jar. Properties: snow.instance ${INSTANCE_URL}, snow.username ${SVC}, snow.assignmentGroup ${GROUP}, mq.url ${MQ_URL}, mq.retryQueue ${QUEUE}, mq.dlq ${DLQ}, api.id, anypoint.platform.client_id. Protect snow.password, mq.clientId, mq.clientSecret and anypoint.platform.client_secret. The app is Running and the API Active.`,
      done: deployedOk,
    },
    {
      title: 'Raise a store alert and follow it to the incident',
      how: `API client, application ${SN_PKG}, Send as ${SOURCE}, X-Correlation-ID header ${CID}, POST /incidents with the sample body (card reader of till 3 in store 0042). The answer is 201 with the incident number. The log of ${SN_PKG} has correlationId=${CID} and the number. ServiceNow, Incident, All: open that incident. Created by ${SVC}, Assignment group ${GROUP}, Configuration item ${DEVICE}, Correlation ID ${KEY1}, and the work note carries your correlation ID.`,
      done: (s) => deployedOk(s) && raisedOk(s),
    },
    {
      title: 'The same alert again',
      how: `API client: Send the same body once more. The answer is 200 with action updated and the same number. Open the incident again: one more work note, and Incident, All still lists one incident with Correlation ID ${KEY1}. System Logs, Transactions (REST) shows a GET and a PATCH of ${SVC}.`,
      done: (s) => raisedOk(s) && incidents(s, KEY1).length === 1 && (incidents(s, KEY1)[0].work_notes ?? []).length >= 2 && Boolean(firstLog(s, new RegExp(`Alert ${KEY1}: work note added to the open incident`))) && Boolean(s.seen['snow:tx']),
    },
    ask(
      'What goes in correlation_id',
      `Why does correlation_id hold ${KEY1} and not the X-Correlation-ID of the request?`,
      [
        'correlation_id is limited to 10 characters',
        'correlation_id identifies the event in the source system, so it must be the same for every repeat of the alert: that is what the search matches. The X-Correlation-ID is new for each request; it belongs in the work note and the logs, where it ties one call to its log lines',
        'The X-Correlation-ID is secret',
        'ServiceNow fills correlation_id on its own',
      ],
      1,
      'ServiceNow keeps correlation_id and correlation_display for the integration that created a record: the ID of the event in the other system and the name of that system. A request trace ID changes per call and would make every repeat look new. Keep both: the business key on the record, the trace ID in the note and the logs.',
    ),
    {
      title: 'A store outage hits the rate limit',
      how: `Store 0042 loses its store server and the monitor fires every check. API client as ${SOURCE}, body ${OUTAGE}, Send 10. The last answers are 202 QUEUED: ServiceNow answered 429. If every answer is 200 or 201, Send 10 again. Move the clock 1 minute: the Subscriber tries each alert ${ATTEMPTS} times, still 429, and the queue moves it to ${DLQ}. Look at the evidence: ServiceNow, System Logs, System Log, All has Rate limit exceeded for ${SVC} and the rule ${ROLE_RULE.name}; Rate Limit Rules shows ${ROLE_RULE.limit} per hour for every user with ${WRITE_ROLE}; MQ, ${DLQ}, Message Browser, Get Messages shows the alerts.`,
      done: (s) => Boolean(queuedAt(s) && dlqAt(s)) && (s.seen[`mq:${DLQ}`] ?? -1) >= dlqAt(s) && (s.seen['snow:syslog'] ?? -1) >= queuedAt(s) && (s.seen['snow:rate'] ?? -1) >= queuedAt(s),
    },
    {
      title: 'Fix the limit for the integration user and replay',
      how: `The ServiceNow team keeps the role rule for people and their scripts, and agrees to ${USER_LIMIT} requests an hour for ${SVC}: a rule for a user wins over a rule for a role. Rate Limit Rules, New: Name Store incident integration, Applies to User, User ${SVC}, Rate limit per hour ${USER_LIMIT}, Active, Submit. Do not change the role rule. Then Runtime Manager, ${SN_PKG}, Schedules, select ${SN_REPLAY}, Run. Move the clock 1 minute: the Subscriber sends each alert, the first opens one incident for ${KEY2} and the rest are work notes on it, and both queues are empty.`,
      done: (s) => {
        const r = replayOf(s)
        const saved = ruleSavedAt(s)
        return Boolean(userRule(s) && roleRuleKept(s) && saved !== undefined && r?.ok && r.t >= saved && (appOf(s)?.store?.retried ?? 0) >= 1) && incidents(s, KEY2).length === 1 && queue(s, QUEUE)?.messages.length === 0 && queue(s, DLQ)?.messages.length === 0
      },
    },
    ask(
      'Why a retry queue',
      'Why does the flow put the alert on a queue on 429 instead of an Until Successful scope that retries in the flow?',
      [
        'Until Successful cannot catch HTTP errors',
        'A 429 can last until the end of the hour. Retrying in the flow holds the request of the monitor and a thread for that time, and the alert is lost if the app restarts. The queue answers 202 at once, keeps the alert durable across restarts, retries a few times and leaves the rest in the dead letter queue, where a person sees it, fixes the cause and replays it',
        'Queues are faster than HTTP',
        'Anypoint MQ removes the rate limit',
      ],
      1,
      'Short retries in the flow suit a blip of a second or two. Back pressure that lasts minutes, such as a rate limit per hour or a maintenance window, belongs in durable storage: a queue with a dead letter queue and an alert. Replay only after the cause is fixed, or the messages return to the dead letter queue.',
    ),
    {
      title: 'Alert the store systems team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${SN_PKG}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO} from the mail. An alert that cannot reach ServiceNow reaches a person.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === appOf(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    {
      title: 'Promote the API instance to Production',
      how: `API Manager, switch to Production with the environment button at the top of the left menu. Add API, Promote API from environment, source Sandbox, include Policies. Then Exchange, Store Incident API, Request access for the Production instance and the application ${SOURCE}: a contract does not travel with the promotion.`,
      done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id') && apiOf(s, 'Production').contracts.some((c) => c.client === CALLER.name && c.status === 'approved')),
    },
    {
      title: 'Deploy to Production with the Production values',
      how: `MQ, switch the environment to Production, Client Apps, + Add: ${MQC_PRD}. Runtime Manager in Production, Deploy application, the same jar. snow.instance ${PRD.instance}, snow.username ${SVC} with the protected snow.password from the mail, snow.assignmentGroup, mq.url, mq.retryQueue and mq.dlq as in Sandbox, mq.clientId and mq.clientSecret of ${MQC_PRD} protected, api.id of the Production instance and the Production client ID and secret. The lab has one ServiceNow instance, so the app runs and the API turns Active, but no incident is made there.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const p = props(a)
        return a?.status === 'Running' && word(p['snow.instance']).replace(/\/$/, '') === PRD.instance && word(p['snow.username']) === SVC && a.secrets['snow.password'] === PRD.password && a.props['snow.password'] === undefined && word(p['snow.assignmentGroup']) === GROUP && mqOk(s, a, 'Production', MQC_PRD) && pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s, 'Production')) === 'Active'
      },
    },
  ],
  why: `I built the store alert to ServiceNow incident integration end to end. The request gave the caller, the rule that a repeated alert becomes a work note, the assignment group, the user with two roles and the rule that no alert may be lost. I designed the Store Incident API with 201, 200 and 202 answers, mocked it for the monitor team and published it to Exchange. In Studio the flow builds a key per store, device and problem, searches open incidents by correlation_id, then adds a work note with PATCH or creates the incident with POST, and an error handler puts the alert on an Anypoint MQ retry queue on 429, 5xx or no connection. In ServiceNow I made a web service only user with ${REST_ROLE} and ${WRITE_ROLE}, no itil and no admin; in Anypoint MQ the retry queue with a dead letter queue after ${ATTEMPTS} attempts and a client app. API Manager got the instance with Client ID Enforcement and a contract for the monitor, and the app was deployed with secure properties and autodiscovery. I raised one alert with my own correlation ID and found the incident, then the same alert again became a work note on it. A store outage sent ten alerts, the role rule of ${ROLE_RULE.limit} an hour answered 429, the alerts went through the retry queue to the dead letter queue, and the System Log and Rate Limit Rules showed why. After a user rule of ${USER_LIMIT} an hour for the integration user I ran the replay flow, and the alerts became one incident with work notes. Then an alert to the store systems team and Production with its own instance, password and client app.`,
  docs: 'https://docs.mulesoft.com/http-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, 'Store Incident API')
    s = saveProject(s, s.projects.at(-1).id, RAML)
    s = mark(s, 'mock')
    s = publish(s, s.projects.at(-1).id, { assetId: ASSET, name: 'Store Incident API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = createUser(s, { user_name: SVC, first_name: 'Store', last_name: 'Incidents', web_service_access_only: true }).state
    s = setRole(s, SVC, REST_ROLE, true).state
    s = setRole(s, SVC, WRITE_ROLE, true).state
    s = setUserFields(s, SVC, { password: SVC_PASSWORD }).state
    s = createQueue(s, { name: DLQ, fifo: false })
    s = createQueue(s, { name: QUEUE, fifo: false, dlq: DLQ, attempts: ATTEMPTS })
    s = addClientApp(s, 'Sandbox', MQC)
    const mq = mqClient(s, 'Sandbox', MQC)
    s = addApi(s, { assetId: ASSET, label: 'store-incident-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = applyPolicy(s, id, 'client-id')
    s = requestAccess(mark(s, 'env:Sandbox'), id, CALLER.name)
    const p = project(s)
    const jar = { pkg: p.pkg, jar: p.jar, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1 }
    const base = { 'snow.username': SVC, 'snow.assignmentGroup': GROUP, 'mq.url': MQ_URL, 'mq.retryQueue': QUEUE, 'mq.dlq': DLQ }
    s = finishDeploys(deployApp(s, { name: SN_PKG, ...jar, props: { ...base, 'snow.instance': INSTANCE_URL, 'api.id': id, 'anypoint.platform.client_id': s.creds.Sandbox.id }, secrets: { 'snow.password': SVC_PASSWORD, 'mq.clientId': mq.clientId, 'mq.clientSecret': mq.clientSecret, 'anypoint.platform.client_secret': s.creds.Sandbox.secret } }).state)
    const post = (x, body, times = 1, cid = '') => {
      for (let i = 0; i < times; i++) x = callApi(x, { env: x.env, app: SN_PKG, method: 'POST', path: '/incidents', body, cid, client: CALLER.name, clientId: CALLER.clientId, clientSecret: CALLER.clientSecret }).state
      return x
    }
    s = post(s, FIRST, 1, CID)
    s = mark(s, `logs:${SN_PKG}`)
    s = mark(s, `snow:form:${incidents(s, KEY1)[0]?.number}`)
    s = post(s, FIRST, 1, CID)
    s = mark(s, 'snow:tx')
    s = post(s, OUTAGE, 10)
    s = advance(s, MINUTE)
    s = mark(mark(mark(s, `mq:${DLQ}`), 'snow:syslog'), 'snow:rate')
    s = saveRateRule(s, { name: 'Store incident integration', type: 'User', who: SVC, limit: USER_LIMIT, active: true }).state
    s = runNow(s, SN_PKG, SN_REPLAY)
    s = advance(s, MINUTE)
    s = addMonAlert(s, { title: 'Store incident errors', resource: 'Application', name_: SN_PKG, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: false, alerts: false })
    const prd = s.lastApi
    s = requestAccess(mark(s, 'env:Production'), prd, CALLER.name)
    s = addClientApp(s, 'Production', MQC_PRD)
    const mqp = mqClient(s, 'Production', MQC_PRD)
    s = finishDeploys(deployApp(s, { name: SN_PKG, ...jar, props: { ...base, 'snow.instance': PRD.instance, 'api.id': prd, 'anypoint.platform.client_id': s.creds.Production.id }, secrets: { 'snow.password': PRD.password, 'mq.clientId': mqp.clientId, 'mq.clientSecret': mqp.clientSecret, 'anypoint.platform.client_secret': s.creds.Production.secret } }).state)
    return s
  },
  answers: { 5: 1, 13: 1, 16: 1 },
}

export const LABS = [lab]
