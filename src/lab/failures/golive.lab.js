// The Brightmart go-live labs: the whole landscape set up from nothing and tested end to end. See platform-labs.js.
//
// One Brightmart from the first part to the last. Each part starts from the solved state of the part before (trimmed:
// old logs, traffic and history go, configuration stays), adds the systems and jars the teams hand over that day, and
// the go-live lead sets them up with the same console actions a learner uses. The systems reuse the sample apps of the
// setup labs (their packages and names), and the API layers are the 32 APIs of the Brightmart estate
// (platform-enterprise-packages.js), which reach Salesforce, SAP, the mail server, SQL Server and Partner Manager.
import {
  addApi, addApiAlert, addMonAlert, addRmAlert, addTier, advance, apiStatus, applyPolicy, at, callApi, createClient, createProject, deployApp, endpointOf, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, pairing, promoteApi, publish,
  ramlErrors, requestAccess, runNow, saveProject, sendMessage, setBackend, setContract, setStudio,
} from '../platform.js'
import { callsOf, DEPLOYED, estateDef, SAMPLE as ESTATE_SAMPLE, secretOf, urlKey } from '../platform-enterprise-packages.js'
import { CHANNELS, ramlOf } from '../platform-enterprise.js'
import { LAYER_PROPERTY } from '../platform-led.js'
import { addWorkNote, closeTicket, newTicket, playApprovers, requestApproval, setTicket, startImplement, toReview, whenText } from '../platform-release.js'
import { app, ask, call, called, change, OPS } from '../platform-kit.js'
import { loginsOf, newOracle, newSqlServer, runSql, serverOf, tablesOf, usersOf } from '../platform-db.js'
import { ADMIN_ROLES as SF_ADMIN_ROLES, ADMIN_USER as SF_ADMIN_USER, brightmartOrders, countOf as sfCountOf, formatAt, newSnowflake, publicKeyOf, runWorksheet, script as snowflakeScript, stageAt } from '../platform-snowflake.js'
import { DB as ORA_DB, EVENTS as ORA_EVENTS, NAME as ORA_APP, SHIPMENTS as ORA_SHIPMENTS, urlOf as oraUrlOf } from './setup-oracle.pkg.js'
import { STOCK_APP, STOCK_FLOW, STOCK_JAR } from './snowflake-setup.pkg.js'
import { addAcl, authorized as kafkaAuthorized, createTopic, lagOf as kafkaLagOf, newCluster, newKafka, produceMessage, registerSchema } from '../platform-kafka.js'
import { ackModeOf as kafkaAckModeOf, acksOf as kafkaAcksOf, BOOTSTRAP as K_BOOTSTRAP, CLUSTER as K_CLUSTER, clusterOf as kafkaClusterOf, CONSUMER as K_CONSUMER, CONSUMER_PW as K_CONSUMER_PW, CONSUMER_USER as K_CONSUMER_USER, DLT as K_DLT, GROUP as K_GROUP, keyed as kafkaKeyed, PRODUCER as K_PRODUCER, PRODUCER_PW as K_PRODUCER_PW, PRODUCER_USER as K_PRODUCER_USER, resetOf as kafkaResetOf, TOPIC as K_TOPIC } from './setup-kafka.pkg.js'
import { addClientApp as addMqClientApp, clientApps as mqClientApps, createQueue as createMqQueue, DEFAULT_LOCK_TTL as MQ_DEFAULT_LOCK_TTL, DEFAULT_TTL as MQ_DEFAULT_TTL, isFifo as mqIsFifo } from '../platform-mq.js'
import { APP as MQ_APP, CLIENT as MQ_CLIENT, DLQ as MQ_DLQ, MQ_URL, QUEUE as MQ_QUEUE } from './setup-anypoint-mq.pkg.js'
import { addAuthEntry, addPolicyEntry, addUser as addJmsUser, allowed as jmsAllowed, AMQ, AMQ_FAILOVER, brokerOf, classicBroker, CLASSIC_DEFAULTS, createDestination, dlqNameOf, parseUrl as jmsParseUrl, restartNode, sendTo } from '../platform-jms.js'
import { APP as AMQ_APP, GROUP as AMQ_GROUP, prefetchOf as amqPrefetchOf, QUEUE as AMQ_QUEUE, redeliveriesOf as amqRedeliveriesOf, transacted as amqTransacted, USER as AMQ_USER } from './setup-activemq.pkg.js'
import { addEntityPolicy, createQueue as createSbQueue, entityConnectionString as sbEntityConnectionString, entityPoliciesOf as sbEntityPoliciesOf, explorerSend, namespaceOf, newNamespace as newSbNamespace, SB_TIME } from '../platform-servicebus.js'
import { APP as SB_APP, LISTEN_POLICY as SB_LISTEN, QUEUE as SB_QUEUE, SEND_POLICY as SB_SEND, WORK_MS as SB_WORK_MS } from './setup-service-bus.pkg.js'
import { accessOf, addMember, addScopes, can, checkAccess, createConnectedApp, createTeam, grant, grantsTo, inviteUser, isOrgAdmin, leastScopes, newAccess, pipelineMissing, runPipeline, setPipelineAuth } from '../platform-access.js'
import {
  ACCESS_MODELS, addContainer, addSecretVersion, addServerUser, addShare, createSas, DEFAULT_EGRESS, fileRec, knownHostsLine, knownKeys, latestVersion, makeDir, newContainer, newServerSys, newShare, newStorage, newUserKey, newVault, putFile, sasState,
  setNetwork, setServerSettings, setServerUser, setVaultAccess, systemsOf, transfer,
} from '../platform-systems.js'
import { HEADER as SFTP_HEADER, HOST as SFTP_HOST, NAME as SFTP_APP } from './setup-sftp.pkg.js'
import { HOST as FTP_HOST, NAME as FTP_APP } from './setup-ftp.pkg.js'
import { blobName, CUSTOMERS as BLOB_CUSTOMERS, FLOW as BLOB_FLOW, NAME as BLOB_APP, rejectsName } from './setup-azure-blob.pkg.js'
import { NAME as FILES_APP, PICKS as FILES_PICKS, SCAN_HEADER } from './setup-azure-files.pkg.js'
import {
  accessOf as sfFieldAccess, apiEnabled as sfApiEnabled, assignPermset, BASE as SF_BASE, BRIGHTMART_CUSTOMERS, createConnectedApp as sfCreateConnectedApp, createPermset, createUser as sfCreateUser, newOrg, newSalesforce, objectAccess as sfObjectAccess,
  orgOf as sfOrgOf, seedAccounts, setApiEnabled, setConnectedApp, setFieldAccess, setObjectAccess,
} from '../platform-salesforce.js'
import { MEMBERS as SF_MEMBERS, NAME as SF_APP, TEST as SF_TEST } from './sf-setup.pkg.js'
import {
  addInbound as sapAddInbound, addOutbound as sapAddOutbound, createDestination as sapCreateDestination, createLogicalSystem as sapCreateLogicalSystem, createPartner as sapCreatePartner, createPort as sapCreatePort, createUser as sapCreateUser, GW_SERVICE as SAP_GW_SERVICE,
  newSapSystem, partnerOf as sapPartnerOf, PROGRAM_ID as SAP_PROGRAM_ID, registration as sapRegistration, RFC_USER as SAP_RFC_USER, SAP_CLIENT, SAP_HOST, SID as SAP_SID, testOutbound as sapTestOutbound, WEB_PARTNER as SAP_WEB_PARTNER,
} from '../platform-sap.js'
import { BRIDGE as SAP_BRIDGE, BRIDGE_JAR as SAP_BRIDGE_JAR } from './sap-setup.pkg.js'
import { addAppPassword, addMailAccount, defaultMailServer, MAIL_HOST, mailboxCtx, newAccount as newMailAccount, setMailAccount, webAddFolder, webOpen } from '../platform-mailserver.js'
import { BOX as MAIL_BOX, imapOf as mailImapOf, NAME as MAIL_APP, smtpOf as mailSmtpOf } from './setup-mail.pkg.js'
import {
  certOf as b2bCertOf, createFlow as createB2bFlow, createPartner as createB2bPartner, deployFlow as deployB2bFlow, fill as fillB2b, flowStatus as b2bFlowStatus, flowsOf as b2bFlowsOf, importCert as importB2bCert, mdnOk as b2bMdnOk, newCert as newB2bCert, partnerOf,
  requestTest as requestB2bTest, setEndpoint as setB2bEndpoint, setFlow as setB2bFlow, txOf as b2bTxOf,
} from '../platform-b2b.js'
import { NAME as B2B_APP } from './b2b-setup.pkg.js'
import {
  activatePending as wdActivatePending, activeCount as wdActiveCount, addPrompt as wdAddPrompt, changeEmail as wdChangeEmail, createGroup as wdCreateGroup, createIsu as wdCreateIsu, createReport as wdCreateReport, DOMAINS as WD_DOMAINS, editReport as wdEditReport,
  GROUP_TYPE as WD_GROUP_TYPE, groupsOf as wdGroupsOf, newWorkday, permsOf as wdPermsOf, SCREEN_USER as WD_SCREEN_USER, setPasswordRules as wdSetPasswordRules, setPermissions as wdSetPermissions, TENANT as WD_TENANT, WD_HOST,
} from '../platform-workday.js'
import { FEED as WD_FEED, FEED_FLOW as WD_FEED_FLOW, FEED_JAR as WD_FEED_JAR } from './wd-setup.pkg.js'
import { createUser as snCreateUser, groupId as snGroupId, INSTANCE as SN_INSTANCE, INSTANCE_URL as SN_INSTANCE_URL, newServicenow, REST_ROLE as SN_REST_ROLE, rowsOf as snRowsOf, setRole as snSetRole, setUserFields as snSetUserFields, userOf as snUserOf, WIDE_ROLES as SN_WIDE_ROLES } from '../platform-servicenow.js'
import { WMS as SN_WMS, WMS_ALERT as SN_WMS_ALERT, WMS_BAD as SN_WMS_BAD, WMS_JAR as SN_WMS_JAR } from './snow-setup.pkg.js'
import {
  addPermission as gAddPermission, addSecret as gAddSecret, createAppUser as gCreateAppUser, DAY as G_DAY, grantConsent as gGrantConsent, grantSite as gGrantSite, isGranted as gIsGranted, newMsgraph, ORG_URL as G_ORG_URL, privsOf as gPrivsOf, regNamed as gRegNamed,
  registerApp as gRegisterApp, rowsOf as gRowsOf, saveRole as gSaveRole, siteNamed as gSiteNamed, SP_HOST as G_SP_HOST, SYSTEM_ROLES as G_SYSTEM_ROLES, TENANT as G_TENANT, TENANT_ID as G_TENANT_ID,
} from '../platform-msgraph.js'
import { BRIDGE as G_BRIDGE, BRIDGE_JAR as G_BRIDGE_JAR } from './graph-setup.pkg.js'
import { addressOf as shpAddressOf, API_VERSION as SHP_API_VERSION, createApp as shpCreateApp, createSubscription as shpCreateSubscription, createTestOrder as shpCreateTestOrder, installApp as shpInstallApp, newShopifyStore, revealToken as shpRevealToken, saveScopes as shpSaveScopes, SHOP as SHP_SHOP } from '../platform-shopify.js'
import { BRIDGE as SHP_BRIDGE, BRIDGE_JAR as SHP_BRIDGE_JAR, BRIDGE_PATH as SHP_BRIDGE_PATH, ORDER_API as SHP_ORDER_API } from './shopify-setup.pkg.js'
import {
  addPublicKey as addEpicPublicKey, ALGS as EPIC_ALGS, BASE as EPIC_BASE, createBackendApp, generateKeyPair, KEYSTORE_PASSWORD as EPIC_KEYSTORE_PASSWORD, keyOf as epicKeyOf, MAX_EXP as EPIC_MAX_EXP, newEpic, obsOf as epicObsOf, patientByMrn as epicPatientByMrn,
  publicKeysOf as epicPublicKeysOf, seedApp as seedEpicApp, seedKey as seedEpicKey, setAppScopes as setEpicAppScopes, TOKEN_URL as EPIC_TOKEN_URL,
} from '../platform-epic.js'
import { PATIENT_SYNC as EPIC_SYNC, SYNC_FLOW as EPIC_SYNC_FLOW } from './epic-setup.pkg.js'
import { createInterface, LIS_HOST as HL7_LIS_HOST, LIS_PORT as HL7_LIS_PORT, MULE_HOST as HL7_MULE_HOST, newHl7, newInterface, newLis, PATIENTS as HL7_PATIENTS, sendTest, startInterface, TEST_MRN as HL7_TEST_MRN } from '../platform-hl7.js'
import { ackModeOf as hl7AckModeOf, INTAKE as HL7_INTAKE, INTAKE_JAR as HL7_INTAKE_JAR, KEYSTORE_PASSWORD as HL7_KEYSTORE_PASSWORD } from './hl7-setup.pkg.js'
import {
  allowed as awsAllowed, arnBucket, arnQueue, createAccessKey, createBucket, createQueue as createAwsQueue, createUser as createAwsUser, newAwsAccount, pollFromConsole, policyDoc as awsPolicyDoc, putPolicy as putAwsPolicy, queueUrl as awsQueueUrl, REGION as AWS_REGION,
  sendFromConsole,
} from '../platform-aws.js'
import { POD_BRIDGE as AWS_BRIDGE, POD_JAR as AWS_POD_JAR, POD_SAMPLE as AWS_POD_SAMPLE } from './aws-setup.pkg.js'
import { addAlert, addIndex, addToken, defaultObservability, fill as fillObservability, log4jTemplate, runSearch, setHecGlobal } from '../platform-observability.js'
import { FLOW as KV_FLOW, NAME as KV_APP, OLD_PASSWORD as KV_PASSWORD } from './setup-key-vault.pkg.js'

const DOCS = 'https://docs.mulesoft.com/'
const LEAD = 'Lena Dorsey, integration lead'
const VAULT = 'brightmart-kv'

// ---------- the chain of parts ----------

// The saved form of a state, as the console stores it
const saved = (s) => JSON.parse(JSON.stringify(s))
const SOLVED = new Map()
// the solved state of a part, played once and kept, so a later part does not play the whole chain again
const solvedOf = (lab) => {
  if (!SOLVED.has(lab.id)) SOLVED.set(lab.id, saved(lab.solve(saved(lab.start()))))
  return structuredClone(SOLVED.get(lab.id))
}

// The next morning of the go-live: the clock moves to 09:00 of that day, the console forgets what the learner opened,
// and old logs, events and calls go, so each part stays small. Configuration, data and system state stay.
// Lab simplification: the night between two parts is skipped, the schedules of the apps do not run in it.
// From part 9 on the landscape is big, so the apps start the day with an empty log and only the newest mail stays.
function nextDay(state, day, { mail = [], jars = [], logs = 2, keepMail = 2, ...extra } = {}) {
  const s = structuredClone(state)
  s.clock = at(day, 8, 55)
  s.seen = {}
  s.lastCalls = []
  s.events = []
  s.links = {}
  s.mail = [...s.mail.slice(-keepMail), ...mail.map((m) => ({ t: at(day, 8, 30), to: OPS, source: LEAD, ...m }))]
  s.jars = [...(s.jars ?? []), ...jars]
  for (const a of s.apps) {
    a.logs = logs ? (a.logs ?? []).slice(-logs) : []
    // the configuration history of an earlier day: a rollback goes to the running configuration, which the app holds
    delete a.history
  }
  // the logs of the systems: their servers keep writing while the apps poll, and none of it is configuration
  const cut = (list, n = 5) => (Array.isArray(list) ? list.slice(-n) : list)
  const each = (obj, fn) => Object.values(obj ?? {}).forEach(fn)
  if (s.mailServer) s.mailServer.log = cut(s.mailServer.log)
  each(s.systems?.servers, (x) => (x.log = cut(x.log)))
  each(s.systems?.storage, (x) => (x.log = cut(x.log)))
  each(s.systems?.vaults, (x) => (x.log = cut(x.log)))
  if (s.systems) s.systems.transfers = cut(s.systems.transfers, 2)
  each(s.serviceBus?.namespaces, (x) => (x.requests = cut(x.requests)))
  if (s.snowflake) s.snowflake.queries = cut(s.snowflake.queries)
  each(s.databases?.servers, (x) => (x.errorlog = cut(x.errorlog)))
  each(s.salesforce?.orgs, (o) => {
    o.loginHistory = cut(o.loginHistory)
    o.apiLog = cut(o.apiLog)
  })
  if (s.sap) for (const k of ['gwlog', 'calls', 'requests']) s.sap[k] = cut(s.sap[k])
  if (s.access) s.access.audit = cut(s.access.audit)
  if (s.observability?.splunk) s.observability.splunk.events = cut(s.observability.splunk.events, 20)
  if (s.observability) s.observability.traces = cut(s.observability.traces, 1)
  // from part 9 on (logs 0) the other histories of the systems keep only their newest lines too
  if (!logs) {
    if (s.mailServer) s.mailServer.log = cut(s.mailServer.log, 2)
    if (s.observability?.splunk) s.observability.splunk.events = cut(s.observability.splunk.events, 5)
    if (s.epic) for (const k of ['tokenLog', 'audit']) s.epic[k] = cut(s.epic[k], 2)
    if (s.snowflake) for (const k of ['queries', 'logins']) s.snowflake[k] = cut(s.snowflake[k], 2)
    if (s.servicenow) for (const k of ['audit', 'tx', 'syslog']) s.servicenow[k] = cut(s.servicenow[k], 2)
    if (s.b2b) s.b2b.tx = cut(s.b2b.tx, 1)
    if (s.aws) s.aws.trail = cut(s.aws.trail, 2)
    if (s.hl7) s.hl7.log = cut(s.hl7.log, 1)
    if (s.workday) s.workday.log = cut(s.workday.log, 2)
    if (s.msgraph) s.msgraph.log = cut(s.msgraph.log, 2)
    if (s.access) s.access.audit = cut(s.access.audit, 2)
    each(s.systems?.servers, (x) => (x.log = cut(x.log, 2)))
    each(s.systems?.storage, (x) => (x.log = cut(x.log, 2)))
    each(s.systems?.vaults, (x) => (x.log = cut(x.log, 2)))
    each(s.salesforce?.orgs, (o) => {
      o.loginHistory = cut(o.loginHistory, 2)
      o.apiLog = cut(o.apiLog, 2)
    })
    if (s.sap) for (const k of ['gwlog', 'calls', 'requests']) s.sap[k] = cut(s.sap[k], 2)
  }
  if (s.epic) s.epic.audit = cut(s.epic.audit)
  if (s.aws) s.aws.trail = cut(s.aws.trail)
  if (s.snowflake) s.snowflake.logins = cut(s.snowflake.logins)
  if (s.hl7) s.hl7.log = cut(s.hl7.log)
  each(s.kafka?.clusters, (c) => (c.log = cut(c.log)))
  if (s.msgraph) s.msgraph.log = cut(s.msgraph.log)
  if (s.servicenow) for (const k of ['tx', 'syslog']) s.servicenow[k] = cut(s.servicenow[k])
  if (s.workday) s.workday.signons = cut(s.workday.signons)
  return { ...s, ...extra }
}
const jarOf = (pkg) => ({ pkg, jar: `${pkg}-1.0.0-mule-application.jar` })
const deploy = (s, name, props, secrets = {}, extra = {}) => finishDeploys(deployApp(s, { name, pkg: name, jar: `${name}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props, secrets, ...extra }).state)
const errorAlert = (s, name, to, title) => addMonAlert(s, { title, resource: 'Application', name_: name, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: to })
const alerted = (s, name, to) => s.monAlerts.some((x) => x.enabled && x.resource === 'Application' && x.name_ === name && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(to))
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((x) => list.includes(x))
const running = (s, name) => app(s, name)?.status === 'Running'

// ==================== Part 1: foundations ====================

const TEAM = 'Brightmart Integration'
const DEV = 'ines.park'
const CICD = 'brightmart-cicd'
const PIPELINE = 'brightmart-release'
const KV_SECRET = 'order-history-db-password'
const KV_CLIENT = 'lab-app-registration-0077'
const KV_CLIENT_SECRET = 'lab-practice-client-secret-77' // a practice value of the lab, not a real secret
const INDEX = 'mule'
const HEC_TOKEN = 'mule-golive'

const PLAN = [
  'Hello, welcome to the Brightmart go-live. We bring the whole integration landscape live in eleven working days, one part a day:',
  '1. Foundations: the team and its rights, the login of the release pipeline, the key vault and log forwarding to Splunk.',
  '2. Databases: SQL Server, Oracle and Snowflake.',
  '3. Messaging: Kafka, Anypoint MQ, ActiveMQ and Azure Service Bus.',
  '4. Files: SFTP, FTP, Azure Blob Storage and Azure Files.',
  '5. Core business systems: Salesforce, SAP, the mail server and our EDI partners.',
  '6. HR, service and commerce: Workday, ServiceNow, Dynamics with SharePoint, and Shopify.',
  '7. Brightmart Care and the cloud: Epic, the HL7 feed and AWS.',
  '8. The API layers: the specs in Exchange, the API instances, the policies and the contracts.',
  '9. Deploy: every application of the three layers in Sandbox, Running and Active.',
  '10. The test run with QA.',
  '11. Production cutover and the go-live sign-off.',
  `Today, part 1. Every application lives in the business group Ecommerce. Invite ${DEV}, our new integration developer (business group Ecommerce), and put her in a team called ${TEAM}: she builds and deploys in Sandbox and may only read Production. Nobody deploys to Production by hand: the release pipeline ${PIPELINE} does, with its own connected app ${CICD}, never a person's login. Its first run must be green.`,
  `The database team wants the password of ${KV_APP} in the key vault ${VAULT} as ${KV_SECRET} (practice value ${KV_PASSWORD}). The app registration is ${KV_CLIENT} with the client secret ${KV_CLIENT_SECRET}, and it reads the secret over HTTPS on each run.`,
  `Security wants every app log in Splunk: an index ${INDEX}, the HTTP Event Collector on, one token ${HEC_TOKEN} that writes only to ${INDEX}, and an alert on ERROR lines to ${OPS}. Deployment failures in Sandbox go to ${OPS} as well.`,
  'Lena',
].join('\n\n')

const p1 = {
  team: (s) => accessOf(s).teams.find((t) => t.name.trim().toLowerCase() === TEAM.toLowerCase() && t.bg === 'ecom'),
  cicd: (s) => accessOf(s).apps.find((x) => x.name === CICD && x.type === 'client_credentials'),
  vault: (s) => s.systems?.vaults?.[VAULT],
  splunk: (s) => s.observability?.splunk,
}
p1.token = (s) => (p1.splunk(s)?.tokens ?? []).find((t) => t.enabled && t.index === INDEX && sameSet(t.indexes, [INDEX]))
// Sandbox: deploy and change; Production: read only; and nothing on the user herself
p1.rightsOk = (s) => {
  const t = p1.team(s)
  return Boolean(t?.members.includes(DEV)) && can(s, DEV, 'Manage Applications', 'Sandbox', 'ecom') && can(s, DEV, 'Create Applications', 'Sandbox', 'ecom') && can(s, DEV, 'Read Applications', 'Production', 'ecom') && !can(s, DEV, 'Manage Applications', 'Production', 'ecom') && !can(s, DEV, 'Create Applications', 'Production', 'ecom') && !isOrgAdmin(s, DEV) && grantsTo(s, `user:${DEV}`).length === 0
}
p1.checked = (s, env, result) => accessOf(s).audit.some((e) => e.type === 'Access check' && e.user === DEV && e.action === 'Manage Applications' && e.env === env && e.bg === 'ecom' && e.result === result)
p1.green = (s) => {
  const ci = accessOf(s).ci
  const x = p1.cicd(s)
  const last = ci?.runs.at(-1)
  return Boolean(x && last?.status === 'Succeeded' && ci.auth.type === 'connected-app' && ci.auth.clientId === x.clientId && x.secrets.includes(ci.auth.clientSecret))
}
p1.secretOk = (s) => (p1.vault(s)?.secrets?.[KV_SECRET]?.versions ?? []).some((v) => v.value === KV_PASSWORD && v.enabled)
p1.vaultAccessOk = (s) => {
  const v = p1.vault(s)
  if (!v) return false
  return v.model === ACCESS_MODELS[0] ? sameSet(v.access[KV_APP], ['get']) : sameSet(v.roles[KV_APP], ['Key Vault Secrets User'])
}
p1.kvDeployed = (s) => {
  const x = app(s, KV_APP)
  if (x?.status !== 'Running') return false
  const leaked = Object.entries({ ...x.props, ...x.secrets }).some(([k, v]) => /password/i.test(k) || String(v).trim() === KV_PASSWORD)
  return x.props['kv.name'] === VAULT && x.props['kv.secret.name'] === KV_SECRET && x.props['kv.client.id'] === KV_CLIENT && x.secrets['kv.client.secret'] === KV_CLIENT_SECRET && !x.props['kv.client.secret'] && !leaked
}
p1.kvRead = (s) => p1.kvDeployed(s) && (app(s, KV_APP).store?.runs ?? 0) > 0 && (p1.vault(s)?.log ?? []).some((l) => l.who === KV_APP && l.op === 'SecretGet' && l.ok)

function part1Start() {
  const access = newAccess(at(0, 9), { ci: { name: `${PIPELINE} pipeline`, project: 'web-shop-exp-api', auth: { type: 'connected-app', clientId: '', clientSecret: '' }, runs: [] } })
  const vault = newVault(VAULT, { access: { 'Brightmart Platform Admins': ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore'] } })
  const o = fillObservability(defaultObservability(at(0, 9)))
  o.splunk.indexes = [{ name: 'main', enabled: true }]
  o.splunk.tokens = []
  o.splunk.allTokens = false
  return newPlatform({
    clock: at(1, 8, 55),
    access,
    observability: o,
    systems: systemsOf({ vaults: [vault], principals: [KV_APP] }),
    jars: [KV_APP],
    mail: [{ t: at(1, 8, 30), to: OPS, subject: 'Brightmart go-live: the plan, and part 1 today', body: PLAN, source: LEAD }],
  })
}

const part1 = {
  id: 'p-golive-1',
  group: 'Brightmart go-live',
  title: 'Go-live part 1: foundations, access, secrets and logs',
  minutes: 45,
  scenario: `Brightmart takes its whole integration landscape live, and you lead the go-live. Nothing is set up in Anypoint yet. Today is part 1 of 11: the people and their rights, the login of the release pipeline, the key vault for passwords and the forwarding of every log to Splunk. Everything after this builds on it. The Inbox has the plan from ${LEAD}.`,
  start: part1Start,
  steps: [
    { title: 'Read the go-live plan', how: 'Open the Inbox from the menu under Lab tools. The plan lists the eleven parts, the team, the pipeline, the vault and the logging rules.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Invite ${DEV}`,
      how: `Access Management from the console menu, Users, Invite Users. Username ${DEV}, Name Ines Park, Business group Ecommerce.`,
      done: (s) => accessOf(s).users.some((u) => u.username === DEV && u.bg === 'ecom'),
    },
    {
      title: `Create the team ${TEAM} with the least rights`,
      how: `Access Management, Teams, Create Team. Team name ${TEAM}, business group Ecommerce. Open it, add ${DEV} as a member. Under Permissions add the role Runtime Manager Developer for Ecommerce Sandbox, Runtime Manager Viewer for Ecommerce Production, Exchange Contributors, Design Center Developer and Manage APIs Configuration for Sandbox. Nothing on the user herself, and no Organization Administrator.`,
      done: p1.rightsOk,
    },
    {
      title: 'Check what the team can do',
      how: `Access Management, Users, ${DEV}. Under Check access (lab tool) check Manage Applications in Ecommerce for Sandbox, then for Production. Sandbox answers Allowed, Production answers 403. Both lines are in the Audit Log.`,
      done: (s) => p1.rightsOk(s) && p1.checked(s, 'Sandbox', 'Allowed') && p1.checked(s, 'Production', 'Denied'),
    },
    ask(
      'Who deploys to Production',
      'Why does no developer, not even the lead, get Manage Applications in Production for the go-live?',
      [
        'Production has no Runtime Manager',
        'A deploy to Production must be the build that was tested, with its change record, and it must be repeatable. The pipeline does it with its own connected app; people read Production and fix through the pipeline. Fewer logins with Production rights also means fewer logins to steal',
        'Developers cannot read logs in Production',
        'Only Organization Administrators can deploy anywhere',
      ],
      1,
      'Separation of duties: the person who writes the change does not push it to Production by hand. The pipeline deploys the artifact that passed the tests, and its runs are the audit trail. In an emergency a break glass account is used and reviewed.',
    ),
    {
      title: `Create the connected app ${CICD}`,
      how: `Access Management, Connected Apps, Create app. Name ${CICD}, App acts on its own behalf (client credentials), Save. Open it, Add Scopes: Exchange Contributor for Ecommerce, and View Environment, Runtime Manager: Read Applications, Runtime Manager: Create Applications and Runtime Manager: Manage Applications for Ecommerce, environments Sandbox and Production. Nothing else.`,
      done: (s) => Boolean(p1.cicd(s)) && leastScopes(p1.cicd(s)) && pipelineMissing(s, p1.cicd(s).clientId).length === 0,
    },
    {
      title: 'Run the release pipeline with it',
      how: `Copy the Client ID and Client Secret of ${CICD}. Access Management, CI pipeline (lab tool): choose Connected app, paste both, Save, then Run pipeline. The log shows the token request, the publish to Exchange, the deploys to Sandbox and Production, and BUILD SUCCESS.`,
      done: p1.green,
    },
    {
      title: `Store the database password in ${VAULT}`,
      how: `Azure Key Vault from the console menu, ${VAULT}, Secrets, Generate/Import. Name ${KV_SECRET}, Secret value ${KV_PASSWORD}, Content type password, Enabled Yes. Create.`,
      done: p1.secretOk,
    },
    {
      title: `Give ${KV_APP} Get on secrets only`,
      how: `${VAULT}, Access policies, Create. Principal ${KV_APP}, Secret permissions Get, untick the rest. Create. Under RBAC the same is the role Key Vault Secrets User.`,
      done: p1.vaultAccessOk,
    },
    {
      title: `Deploy ${KV_APP} with the vault properties`,
      how: `Runtime Manager, Deploy application. Name ${KV_APP}, file ${KV_APP}-1.0.0-mule-application.jar. Properties kv.name ${VAULT}, kv.secret.name ${KV_SECRET}, kv.client.id ${KV_CLIENT}, db.host orders-db.brightmart.lab, db.name OrderHistory, and kv.client.secret ${KV_CLIENT_SECRET} with Protect. No password property. Deploy, then Schedules, ${KV_FLOW}, Run. ${VAULT}, Activity log shows SecretGet by ${KV_APP}, Succeeded.`,
      done: p1.kvRead,
    },
    {
      title: `Create the Splunk index ${INDEX} and turn on HEC`,
      how: `Splunk from the console menu, Settings: Indexes. Type ${INDEX} in Index Name, New Index. Then Settings: HTTP Event Collector, Global Settings: All Tokens Enabled. HEC listens on port 8088.`,
      done: (s) => Boolean(p1.splunk(s)?.indexes.some((x) => x.name === INDEX && x.enabled) && p1.splunk(s)?.allTokens),
    },
    {
      title: `Create the token ${HEC_TOKEN} for ${INDEX} only`,
      how: `HTTP Event Collector, New Token: name ${HEC_TOKEN}, allowed index ${INDEX} and nothing else, default index ${INDEX}, source type mule:app. Create. The apps get its value as the protected property splunk.hec.token when they are deployed in part 9.`,
      done: (s) => Boolean(p1.token(s)),
    },
    {
      title: 'Save a Splunk alert on errors',
      how: `Splunk, Alerts, New Alert: title Mule errors, search index=${INDEX} level=ERROR, run every 5 minutes over the last 5 minutes, trigger when the number of results is greater than 0, send to ${OPS}. Save.`,
      done: (s) => (p1.splunk(s)?.alerts ?? []).some((x) => x.enabled && /index\s*=\s*mule/i.test(x.search) && /level\s*=\s*ERROR/i.test(x.search) && String(x.to).includes(OPS)),
    },
    ask(
      'One token, one index',
      `Why does ${HEC_TOKEN} allow only the index ${INDEX}, and why is it a protected property and not in the log4j2.xml of the jar?`,
      [
        'HEC refuses tokens with more than one index',
        'A token is a password for writing into Splunk. Limited to one index, a leaked token can only write noise there, not into the security or audit indexes. In a protected property it is hidden in Runtime Manager and can be rotated without a new build; in the jar it is in Git and in every copy of the artifact',
        'A protected property makes the appender faster',
        'Splunk needs a new token for each app',
      ],
      1,
      'Least privilege also applies to logging credentials. log4j2.xml reads ${sys:splunk.hec.token}, and CloudHub passes the properties as system properties, so one jar runs with the Sandbox token and the Production token.',
    ),
    {
      title: 'Alert on failed deployments',
      how: `Runtime Manager, Alerts, Create Alert. Severity Critical, application All, condition Deployment failure, recipients ${OPS}. Then Monitoring, Alerts, Create Alert for ${KV_APP}: Message Error Count Above 0 to dba-team@brightmart.example.`,
      done: (s) => s.rmAlerts.some((a) => a.enabled && a.env === 'Sandbox' && a.app === 'All' && a.condition === 'Deployment failure' && String(a.recipients ?? '').includes(OPS)) && alerted(s, KV_APP, 'dba-team@brightmart.example'),
    },
  ],
  why: 'A go-live starts before the first app. People get access through teams, scoped to a business group and an environment: developers deploy in Sandbox and read Production. Production deploys come from a pipeline that logs in with a connected app and client credentials, with only the scopes the Mule Maven plugin needs, so it survives people leaving and shows by name in the audit log. Passwords live in a key vault; the app gets Get on secrets and reads them at run time, so a rotation needs no redeploy. Every app forwards its logs to Splunk with a HEC token limited to one index and kept as a protected property, and an alert watches for errors. A deployment failure alert covers every app from day one.',
  docs: `${DOCS}access-management/connected-apps-overview`,
  solve(start) {
    let s = mark(start, 'inbox')
    s = inviteUser(s, { username: DEV, name: 'Ines Park', bg: 'ecom' })
    s = createTeam(s, { name: TEAM, bg: 'ecom' })
    const team = accessOf(s).teams.find((t) => t.name === TEAM).id
    s = addMember(s, team, DEV)
    s = grant(s, `team:${team}`, 'Runtime Manager Developer', 'ecom', 'Sandbox')
    s = grant(s, `team:${team}`, 'Runtime Manager Viewer', 'ecom', 'Production')
    s = grant(s, `team:${team}`, 'Exchange Contributors', 'ecom')
    s = grant(s, `team:${team}`, 'Design Center Developer', 'ecom')
    s = grant(s, `team:${team}`, 'Manage APIs Configuration', 'ecom', 'Sandbox')
    s = checkAccess(s, DEV, 'Manage Applications', 'Sandbox', 'ecom').state
    s = checkAccess(s, DEV, 'Manage Applications', 'Production', 'ecom').state
    const made = createConnectedApp(s, { name: CICD, type: 'client_credentials' })
    s = addScopes(made.state, made.clientId, [
      { scope: 'Exchange Contributor', bg: 'ecom' },
      ...['Sandbox', 'Production'].flatMap((env) => ['View Environment', 'Runtime Manager: Read Applications', 'Runtime Manager: Create Applications', 'Runtime Manager: Manage Applications'].map((scope) => ({ scope, bg: 'ecom', env }))),
    ])
    const secret = accessOf(s).apps.find((x) => x.clientId === made.clientId).secrets[0]
    s = runPipeline(setPipelineAuth(s, { type: 'connected-app', clientId: made.clientId, clientSecret: secret }))
    s = addSecretVersion(s, VAULT, KV_SECRET, KV_PASSWORD, { contentType: 'password' })
    s = setVaultAccess(s, VAULT, KV_APP, ['get'])
    s = deploy(s, KV_APP, { 'kv.name': VAULT, 'kv.secret.name': KV_SECRET, 'kv.client.id': KV_CLIENT, 'db.host': 'orders-db.brightmart.lab', 'db.name': 'OrderHistory' }, { 'kv.client.secret': KV_CLIENT_SECRET })
    s = mark(runNow(s, KV_APP, KV_FLOW), `vault:${VAULT}`)
    s = addIndex(s, INDEX).state
    s = setHecGlobal(s, { allTokens: true })
    s = addToken(s, { name: HEC_TOKEN, index: INDEX, indexes: [INDEX], sourcetype: 'mule:app' }).state
    s = addAlert(s, { name: 'Mule errors', search: `index=${INDEX} level=ERROR`, every: 5, window: 5, threshold: 0, to: OPS }).state
    s = addRmAlert(s, { name: 'Deployment failed', severity: 'Critical', app: 'All', condition: 'Deployment failure', recipients: OPS })
    return errorAlert(s, KV_APP, 'dba-team@brightmart.example', 'Order history sync failed')
  },
  answers: { 4: 1, 13: 1 },
}

// ==================== Part 2: databases ====================

const POS_DB = 'brightmart-sql'
const POS_LOGIN = 'mule_reports'
const POS_PASSWORD = 'Reports-Lab-2026' // a made-up lab value, the one pos-sys-api of the estate uses
const ORA_USER = 'MULE_TRACK'
const ORA_PASSWORD = 'Track-Lab-2026' // a made-up lab value
const ORA_URL = 'jdbc:oracle:thin:@//ora.brightmart.lab:1521/BRIGHTMARTPDB'
const ORA_EVENT = '{"shipmentId":500103,"status":"PICKED_UP","location":"Rotterdam"}'
const ORA_UNKNOWN = '{"shipmentId":599999,"status":"PICKED_UP","location":"Antwerp"}'
const SF_WH = 'STOCK_WH'
const SF_ROLE = 'STOCK_LOADER'
const SF_USER = 'MULE_STOCK_SVC'
const SF_DB = 'BRIGHTMART_DW'
const SF_SC = 'SUPPLY'
const SF_TABLE = `${SF_DB}.${SF_SC}.STOCK_LEVELS`
const SF_STAGE = `${SF_DB}.${SF_SC}.STOCK_STAGE`
const SF_FORMAT = `${SF_DB}.${SF_SC}.CSV_STOCK`
const SF_PRIVATE_KEY = 'lab-only-private-key-stock-loader'
const SF_PUBLIC_KEY = publicKeyOf(SF_PRIVATE_KEY)
const LOGISTICS = 'logistics-it@brightmart.example'
const SUPPLY_DATA = 'supply-data@brightmart.example'

const p2 = {
  sql: (s) => serverOf(s, POS_DB),
  ora: (s) => serverOf(s, ORA_DB),
  y: (s) => s.snowflake,
}
p2.posLogin = (s) => (p2.sql(s) ? loginsOf(p2.sql(s)) : []).find((l) => l.name.toLowerCase() === POS_LOGIN && l.type === 'SQL login')
p2.posUser = (s) => (p2.sql(s) ? usersOf(p2.sql(s)) : []).find((u) => u.login.toLowerCase() === POS_LOGIN)
// read only: db_datareader and nothing else, or SELECT grants only
p2.posReadOnly = (s) => {
  const u = p2.posUser(s)
  if (!u || p2.posLogin(s)?.sysadmin) return false
  const reads = sameSet(u.roles, ['db_datareader']) || (u.roles.length === 0 && Object.keys(u.grants ?? {}).length > 0)
  return reads && Object.values(u.grants ?? {}).every((ps) => ps.every((p) => p === 'SELECT'))
}
p2.oraLogin = (s) => (p2.ora(s) ? loginsOf(p2.ora(s)) : []).find((l) => l.name === ORA_USER && l.created !== undefined)
p2.oraUser = (s) => (p2.ora(s) ? usersOf(p2.ora(s)) : []).find((u) => u.name === ORA_USER)
p2.oraLeast = (s) => {
  const u = p2.oraUser(s)
  const l = p2.oraLogin(s)
  if (!u || !l) return false
  const has = (list, want) => want.every((x) => (list ?? []).includes(x))
  const g = u.grants ?? {}
  const exact = Object.keys(g).every((tk) => (tk === ORA_EVENTS ? g[tk].every((p) => ['SELECT', 'INSERT'].includes(p)) : tk === ORA_SHIPMENTS ? g[tk].every((p) => ['SELECT', 'UPDATE'].includes(p)) : false))
  const session = (l.privs ?? []).includes('CREATE SESSION') || u.roles.includes('CONNECT')
  return session && has(g[ORA_EVENTS], ['SELECT', 'INSERT']) && has(g[ORA_SHIPMENTS], ['SELECT', 'UPDATE']) && exact && u.roles.every((r) => r === 'CONNECT') && (l.privs ?? []).every((p) => p === 'CREATE SESSION')
}
p2.oraDeployed = (s) => {
  const x = app(s, ORA_APP)
  const p = x?.props ?? {}
  const u = oraUrlOf(p['db.url'])
  const n = (v) => Number(String(v ?? '').trim() || NaN)
  return x?.status === 'Running' && Boolean(u?.service) && u.host.toLowerCase() === 'ora.brightmart.lab' && u.port === '1521' && u.service.toUpperCase() === 'BRIGHTMARTPDB' && String(p['db.user'] ?? '').toUpperCase() === ORA_USER && n(p['db.pool.max']) >= 2 && n(p['db.pool.max']) <= 10 && n(p['db.queryTimeout']) >= 1 && n(p['db.queryTimeout']) <= 30 && x.secrets?.['db.password'] === p2.oraLogin(s)?.password && !('db.password' in p)
}
p2.oraRows = (s, tk) => (p2.ora(s) ? tablesOf(p2.ora(s))[tk]?.rows : null) ?? []
const word = (v) => String(v ?? '').trim().toUpperCase()
p2.wh = (s) => p2.y(s)?.warehouses?.[SF_WH]
p2.whOk = (s) => Boolean(p2.wh(s) && p2.wh(s).size === 'XSMALL' && p2.wh(s).autoSuspend > 0 && p2.wh(s).autoSuspend <= 120 && p2.wh(s).autoResume)
p2.stageOk = (s) => {
  const f = formatAt(p2.y(s), SF_FORMAT)
  const st = stageAt(p2.y(s), SF_STAGE)
  return Boolean(f && f.type === 'CSV' && f.skipHeader === 1 && st && !st.url && st.format === SF_FORMAT)
}
const SF_NEEDED = [['USAGE', 'WAREHOUSE', SF_WH], ['USAGE', 'DATABASE', SF_DB], ['USAGE', 'SCHEMA', `${SF_DB}.${SF_SC}`], ['SELECT', 'TABLE', SF_TABLE], ['INSERT', 'TABLE', SF_TABLE], ['READ', 'STAGE', SF_STAGE], ['WRITE', 'STAGE', SF_STAGE], ['USAGE', 'FILE FORMAT', SF_FORMAT]]
const SF_ALLOWED = [...SF_NEEDED, ['OPERATE', 'WAREHOUSE', SF_WH], ['MONITOR', 'WAREHOUSE', SF_WH]]
p2.roleOk = (s) => {
  const r = p2.y(s)?.roles?.[SF_ROLE]
  const is = (g, [p, k, n]) => g.priv === p && g.kind === k && g.name === n
  return Boolean(r) && SF_NEEDED.every((x) => r.grants.some((g) => is(g, x))) && r.grants.every((g) => SF_ALLOWED.some((x) => is(g, x))) && r.roles.length === 0
}
p2.userOk = (s) => {
  const u = p2.y(s)?.users?.[SF_USER]
  return Boolean(u && u.type === 'SERVICE' && !u.password && u.rsa === SF_PUBLIC_KEY && u.roles.includes(SF_ROLE) && !u.roles.some((r) => SF_ADMIN_ROLES.includes(r)) && u.defaultRole === SF_ROLE && u.defaultWarehouse === SF_WH)
}
p2.sfDeployed = (s) => {
  const x = app(s, STOCK_APP)
  const p = x?.props ?? {}
  return x?.status === 'Running' && word(p['snowflake.account']).replace(/\.SNOWFLAKECOMPUTING\.COM$/, '') === 'BRIGHTMART-DW' && word(p['snowflake.user']) === SF_USER && word(p['snowflake.role']) === SF_ROLE && word(p['snowflake.warehouse']) === SF_WH && word(p['snowflake.database']) === SF_DB && word(p['snowflake.schema']) === SF_SC && word(p['snowflake.stage']).replace(/^@/, '').split('.').pop() === 'STOCK_STAGE' && String(x.secrets['snowflake.privateKey'] ?? '').trim() === SF_PRIVATE_KEY && p['snowflake.privateKey'] === undefined
}
p2.firstLoad = (s) => (p2.y(s)?.copies ?? []).find((c) => c.table === SF_TABLE && c.user === SF_USER && c.loaded > 0)

function part2Start() {
  // the POS database of the stores: the reporting login of the old POS reports was dropped, the go-live makes it again
  const sql = newSqlServer(POS_DB)
  sql.logins = sql.logins.filter((l) => l.name !== POS_LOGIN)
  sql.users = sql.users.filter((u) => u.login !== POS_LOGIN)
  const y = brightmartOrders(newSnowflake(at(0)), at(0))
  snowflakeScript(y, `CREATE SCHEMA ${SF_DB}.${SF_SC}; CREATE TABLE ${SF_TABLE} (SKU VARCHAR(20), WAREHOUSE_CODE VARCHAR(10), QTY NUMBER(10,0), SNAPSHOT_AT TIMESTAMP_NTZ);`, at(0, 15))
  y.ws = { role: 'ACCOUNTADMIN', wh: 'COMPUTE_WH', db: SF_DB, schema: SF_SC, text: '' }
  let s = nextDay(solvedOf(part1), 2, {
    jars: [ORA_APP, jarOf(STOCK_APP)],
    databases: { created: at(1, 8), servers: { [POS_DB]: sql, [ORA_DB]: newOracle(ORA_DB) } },
    snowflake: y,
    mail: [
      {
        subject: 'Go-live part 2: databases',
        body: [
          'Good morning. Today the databases. The DBAs handed over three of them.',
          `SQL Server ${POS_DB} (sql.brightmart.lab, database BrightmartOrders) holds the POS tables of the stores. pos-sys-api reads stock and sales there in part 9 with the login ${POS_LOGIN}, password ${POS_PASSWORD} (the value of the vault ticket). The login only reads, it never writes and never changes the schema.`,
          `Oracle ${ORA_DB} (ora.brightmart.lab, listener 1521, service BRIGHTMARTPDB; the old jobs use the SID BRIGHTMARTCDB, do not copy that). ${ORA_APP} writes the tracking events of the carriers as ${ORA_USER}, password ${ORA_PASSWORD}, profile APP_USERS: it inserts and reads ${ORA_EVENTS} and reads and updates the STATUS of ${ORA_SHIPMENTS}. About 300 events a minute at peak, 10 ms each. Query timeout 5 seconds. Alerts to ${LOGISTICS}.`,
          `Snowflake BRIGHTMART-DW (brightmart-dw.snowflakecomputing.com). ${STOCK_APP} loads the stock snapshots of the warehouses: warehouse ${SF_WH} X-Small with auto suspend 60 seconds and auto resume, file format ${SF_FORMAT} (CSV, 1 header line), internal stage ${SF_STAGE}, role ${SF_ROLE} with only what the loader needs, and service user ${SF_USER} with key pair only. Public key: ${SF_PUBLIC_KEY}. Private key (lab value): ${SF_PRIVATE_KEY}, as a protected property and nowhere else. Alerts to ${SUPPLY_DATA}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  // the DBA team made the event table before the go-live (the change ticket of last week)
  s = runSql(s, ORA_DB, `CREATE TABLE ${ORA_EVENTS} (EVENT_ID NUMBER(12) PRIMARY KEY, SHIPMENT_ID NUMBER(12) NOT NULL REFERENCES ${ORA_SHIPMENTS} (SHIPMENT_ID), STATUS VARCHAR2(16) NOT NULL, EVENT_AT TIMESTAMP WITH TIME ZONE, LOCATION VARCHAR2(80))`).state
  return { ...s, clock: at(2, 8, 55) }
}

const part2 = {
  id: 'p-golive-2',
  group: 'Brightmart go-live',
  title: 'Go-live part 2: databases, SQL Server, Oracle and Snowflake',
  minutes: 55,
  scenario: `Day 2 of the Brightmart go-live. The foundations from part 1 are in place. Today the three databases of the landscape get their integration logins, each with the least rights: the POS database on SQL Server for pos-sys-api, Oracle for the carrier tracking events of ${ORA_APP}, and Snowflake for the stock snapshots of ${STOCK_APP}. The two apps are deployed and proven today; pos-sys-api follows with the API layers. The Inbox has the handover of the DBAs.`,
  start: () => part2Start(),
  steps: [
    { title: 'Read the handover of the DBAs', how: 'Open the Inbox from the menu under Lab tools. Note for each database the login, the password, what the app may do and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `SQL Server: create the login ${POS_LOGIN} and its user`,
      how: `Databases from the console menu, server ${POS_DB}, New Query. Run\nCREATE LOGIN ${POS_LOGIN} WITH PASSWORD = '${POS_PASSWORD}', DEFAULT_DATABASE = BrightmartOrders;\nCREATE USER ${POS_LOGIN} FOR LOGIN ${POS_LOGIN} WITH DEFAULT_SCHEMA = dbo;\nThe login gets the app onto the server, the user maps it into BrightmartOrders.`,
      done: (s) => p2.posLogin(s)?.password === POS_PASSWORD && Boolean(p2.posUser(s)),
    },
    {
      title: 'SQL Server: read only, nothing more',
      how: `Run ALTER ROLE db_datareader ADD MEMBER ${POS_LOGIN}; Not db_datawriter, not db_owner, no DELETE. The POS tables are made by the store systems, and pos-sys-api only reads them. Databases, Logins and users shows the roles.`,
      done: p2.posReadOnly,
    },
    {
      title: `Oracle: create ${ORA_USER} with only its grants`,
      how: `Databases, connection ${ORA_DB}, SQL Worksheet. Run\nCREATE USER ${ORA_USER} IDENTIFIED BY "${ORA_PASSWORD}" PROFILE APP_USERS;\nGRANT CREATE SESSION TO ${ORA_USER};\nGRANT SELECT, INSERT ON ${ORA_EVENTS} TO ${ORA_USER};\nGRANT SELECT, UPDATE ON ${ORA_SHIPMENTS} TO ${ORA_USER};\nNot DBA, not BRIGHTMART_RW, not an ANY TABLE privilege. Quote a password with dashes, or Oracle answers ORA-00922.`,
      done: p2.oraLeast,
    },
    {
      title: `Oracle: deploy ${ORA_APP} with the service name`,
      how: `Runtime Manager, Deploy application. Name ${ORA_APP}, file ${ORA_APP}-1.0.0-mule-application.jar. Properties db.url ${ORA_URL}, db.user ${ORA_USER}, db.pool.max 5, db.queryTimeout 5, and db.password with Protect. Deploy, then API client, ${ORA_APP}, GET /health answers 200 when the session runs as ${ORA_USER}.`,
      done: (s) => p2.oraDeployed(s) && called(s, ORA_APP, 200, 'GET', /^\/health/),
    },
    {
      title: 'Oracle: a good event in, an unknown shipment refused',
      how: `API client: POST /tracking-events with ${ORA_EVENT}. It answers 201 and the worksheet shows the row in ${ORA_EVENTS}. Then POST ${ORA_UNKNOWN}: shipment 599999 does not exist, the insert fails on the foreign key with ORA-02291, the transaction rolls back and the app answers 422.`,
      done: (s) => {
        const st = app(s, ORA_APP)?.store ?? {}
        const first = (st.created ?? [])[0]
        return called(s, ORA_APP, 201, 'POST', /^\/tracking-events$/) && Boolean(first) && p2.oraRows(s, ORA_EVENTS).some((r) => r.EVENT_ID === first.id) && called(s, ORA_APP, 422, 'POST', /^\/tracking-events$/) && !p2.oraRows(s, ORA_EVENTS).some((r) => r.SHIPMENT_ID === 599999)
      },
    },
    ask(
      'Service name or SID',
      `Why does ${ORA_APP} connect with //ora.brightmart.lab:1521/BRIGHTMARTPDB and not with the SID BRIGHTMARTCDB of the old jobs?`,
      [
        'They are the same, the colon form is only older',
        `The tables live in the pluggable database BRIGHTMARTPDB, which the listener knows as a service. The SID BRIGHTMARTCDB lands in the root container, where ${ORA_USER} does not exist (ORA-01017). A service name also survives a move to RAC or a standby`,
        'The SID form does not support passwords',
        'The service form is faster',
      ],
      1,
      'Since Oracle 12c the data sits in pluggable databases that are reached by service only. ORA-12514 means the service name is wrong, ORA-12505 the SID.',
    ),
    {
      title: `Snowflake: warehouse ${SF_WH}, file format and stage`,
      how: `Snowflake from the console menu, Worksheets. Run\nCREATE WAREHOUSE ${SF_WH} WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;\nCREATE FILE FORMAT ${SF_FORMAT} TYPE = CSV SKIP_HEADER = 1;\nCREATE STAGE ${SF_STAGE} FILE_FORMAT = (FORMAT_NAME = '${SF_FORMAT}');\nA stage without URL is an internal stage.`,
      done: (s) => p2.whOk(s) && p2.stageOk(s),
    },
    {
      title: `Snowflake: role ${SF_ROLE} with the least grants`,
      how: `In the worksheet: CREATE ROLE ${SF_ROLE}; then GRANT USAGE ON WAREHOUSE ${SF_WH}, USAGE ON DATABASE ${SF_DB}, USAGE ON SCHEMA ${SF_DB}.${SF_SC}, SELECT, INSERT ON TABLE ${SF_TABLE}, READ, WRITE ON STAGE ${SF_STAGE} and USAGE ON FILE FORMAT ${SF_FORMAT}, each TO ROLE ${SF_ROLE}. No ALL, no other tables, no SYSADMIN.`,
      done: p2.roleOk,
    },
    {
      title: `Snowflake: the key pair user ${SF_USER}`,
      how: `CREATE USER ${SF_USER} TYPE = SERVICE DEFAULT_ROLE = ${SF_ROLE} DEFAULT_WAREHOUSE = ${SF_WH} RSA_PUBLIC_KEY = 'the public key from the mail'; then GRANT ROLE ${SF_ROLE} TO USER ${SF_USER}; TYPE = SERVICE takes no password, so only the key can log on.`,
      done: p2.userOk,
    },
    {
      title: `Snowflake: deploy ${STOCK_APP} and load a snapshot`,
      how: `Runtime Manager, Deploy application, name ${STOCK_APP}, file ${STOCK_JAR}. Properties snowflake.account brightmart-dw, snowflake.user ${SF_USER}, snowflake.role ${SF_ROLE}, snowflake.warehouse ${SF_WH}, snowflake.database ${SF_DB}, snowflake.schema ${SF_SC}, snowflake.stage STOCK_STAGE, and snowflake.privateKey with Protect. Deploy. API client GET /health answers 200. Then Schedules, ${STOCK_FLOW}, Run, and in the worksheet SELECT COUNT(*) FROM ${SF_TABLE}; matches the rows in Copy History.`,
      done: (s) => {
        const c = p2.firstLoad(s)
        return p2.sfDeployed(s) && called(s, STOCK_APP, 200, 'GET', /^\/health/) && Boolean(c) && sfCountOf(p2.y(s), SF_TABLE) >= c.loaded && (p2.y(s).queries ?? []).some((q) => q.ok && q.user === SF_ADMIN_USER && /COUNT/i.test(q.sql) && /STOCK_LEVELS/i.test(q.sql) && q.t >= c.t && Number(q.first) >= c.loaded)
      },
    },
    ask(
      'One role per integration',
      `Why does ${STOCK_APP} get a new role ${SF_ROLE}, and not SYSADMIN or the existing LOADER role of the orders load?`,
      [
        'SYSADMIN is fine for a service user, because nobody logs on with it',
        'The app only PUTs to one stage and INSERTs into one table. A leaked key with SYSADMIN could read and drop every table; LOADER would also open the orders tables. Each integration gets its own role with USAGE on the warehouse, database and schema, READ and WRITE on its stage, USAGE on its format and SELECT and INSERT on its table',
        'A new role is needed because roles cannot be shared between users',
        'LOADER cannot use a second warehouse',
      ],
      1,
      'Least privilege in Snowflake is a role per job. The same rule held for the SQL Server and Oracle logins of today: each app gets its own login with only the verbs it needs on only its tables.',
    ),
    {
      title: 'Alert the owners of both apps',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${ORA_APP}, Message Error Count Above 0, recipient ${LOGISTICS}. A second one for ${STOCK_APP} to ${SUPPLY_DATA}.`,
      done: (s) => alerted(s, ORA_APP, LOGISTICS) && alerted(s, STOCK_APP, SUPPLY_DATA),
    },
  ],
  why: 'Each database gets an integration login per app, with only the verbs the app needs on only its tables: a read only login on SQL Server for the POS reads, an Oracle user with CREATE SESSION and four object grants, and a Snowflake role per job with a key pair service user. The app connects with the right address (a service name for an Oracle pluggable database, an account identifier for Snowflake), keeps the password or private key in a protected property, sizes its pool to the load and sets a query timeout. Then a health check proves the login and the grants, real data is written and read back, a bad record is refused without leaving half a transaction, and the owners get an alert on errors.',
  docs: `${DOCS}db-connector/latest/`,
  solve(start) {
    let s = mark(start, 'inbox')
    s = runSql(s, POS_DB, `CREATE LOGIN ${POS_LOGIN} WITH PASSWORD = '${POS_PASSWORD}', DEFAULT_DATABASE = BrightmartOrders;\nCREATE USER ${POS_LOGIN} FOR LOGIN ${POS_LOGIN} WITH DEFAULT_SCHEMA = dbo;`).state
    s = runSql(s, POS_DB, `ALTER ROLE db_datareader ADD MEMBER ${POS_LOGIN};`).state
    s = runSql(s, ORA_DB, `CREATE USER ${ORA_USER} IDENTIFIED BY "${ORA_PASSWORD}" PROFILE APP_USERS;`).state
    s = runSql(s, ORA_DB, `GRANT CREATE SESSION TO ${ORA_USER};\nGRANT SELECT, INSERT ON ${ORA_EVENTS} TO ${ORA_USER};\nGRANT SELECT, UPDATE ON ${ORA_SHIPMENTS} TO ${ORA_USER};`).state
    s = deploy(s, ORA_APP, { 'db.url': ORA_URL, 'db.user': ORA_USER, 'db.pool.max': '5', 'db.queryTimeout': '5' }, { 'db.password': ORA_PASSWORD })
    s = call(s, ORA_APP, null, '/health', 'GET').state
    s = call(s, ORA_APP, null, '/tracking-events', 'POST', ORA_EVENT).state
    s = runSql(s, ORA_DB, `SELECT * FROM ${ORA_EVENTS} WHERE SHIPMENT_ID = 500103;`).state
    s = call(s, ORA_APP, null, '/tracking-events', 'POST', ORA_UNKNOWN).state
    const sql = (q) => (s = runWorksheet(s, q).state)
    sql(`CREATE WAREHOUSE ${SF_WH} WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE`)
    sql(`CREATE FILE FORMAT ${SF_FORMAT} TYPE = CSV SKIP_HEADER = 1; CREATE STAGE ${SF_STAGE} FILE_FORMAT = (FORMAT_NAME = '${SF_FORMAT}')`)
    sql(`CREATE ROLE ${SF_ROLE}; GRANT USAGE ON WAREHOUSE ${SF_WH} TO ROLE ${SF_ROLE}; GRANT USAGE ON DATABASE ${SF_DB} TO ROLE ${SF_ROLE}; GRANT USAGE ON SCHEMA ${SF_DB}.${SF_SC} TO ROLE ${SF_ROLE};
      GRANT SELECT, INSERT ON TABLE ${SF_TABLE} TO ROLE ${SF_ROLE}; GRANT READ, WRITE ON STAGE ${SF_STAGE} TO ROLE ${SF_ROLE}; GRANT USAGE ON FILE FORMAT ${SF_FORMAT} TO ROLE ${SF_ROLE}`)
    sql(`CREATE USER ${SF_USER} TYPE = SERVICE DEFAULT_ROLE = ${SF_ROLE} DEFAULT_WAREHOUSE = ${SF_WH} RSA_PUBLIC_KEY = '${SF_PUBLIC_KEY}'; GRANT ROLE ${SF_ROLE} TO USER ${SF_USER}`)
    s = finishDeploys(deployApp(s, { name: STOCK_APP, pkg: STOCK_APP, jar: STOCK_JAR, replicas: 1, vCores: 0.1, props: { 'snowflake.account': 'brightmart-dw', 'snowflake.user': SF_USER, 'snowflake.role': SF_ROLE, 'snowflake.warehouse': SF_WH, 'snowflake.database': SF_DB, 'snowflake.schema': SF_SC, 'snowflake.stage': 'STOCK_STAGE' }, secrets: { 'snowflake.privateKey': SF_PRIVATE_KEY } }).state)
    s = call(s, STOCK_APP, null, '/health', 'GET').state
    s = runNow(s, STOCK_APP, STOCK_FLOW)
    sql(`SELECT COUNT(*) FROM ${SF_TABLE}`)
    s = errorAlert(s, ORA_APP, LOGISTICS, 'Carrier event errors')
    return errorAlert(s, STOCK_APP, SUPPLY_DATA, 'Stock load errors')
  },
  answers: { 6: 1, 11: 1 },
}

// ==================== Part 3: messaging ====================

const K_RETENTION = '259200000'
const K_SUBJECT = `${K_TOPIC}-value`
const K_SCHEMA = JSON.stringify({ type: 'record', name: 'OrderEvent', namespace: 'lab.brightmart.orders', fields: [{ name: 'orderId', type: 'string' }, { name: 'customerId', type: 'string' }, { name: 'status', type: 'string' }, { name: 'total', type: 'double' }] })
const WAREHOUSE_ONCALL = 'warehouse-oncall@brightmart.example'
const RETURNS_SUPPORT = 'returns-support@brightmart.example'
const FINANCE_INT = 'finance-integration@brightmart.example'
const STORES_ONCALL = 'stores-oncall@brightmart.example'
const AMQ_DLQ = `DLQ.${AMQ_QUEUE}`
const AMQ_PASSWORD = 'Refunds-Lab-2026' // a made-up lab value
const AMQ_URL = `${AMQ_FAILOVER}&jms.prefetchPolicy.queuePrefetch=1`
const SB_NS = 'brightmart-bus'
const MQ_ATTEMPTS = 3

const p3 = {
  cluster: (s) => s.kafka?.clusters?.[K_CLUSTER],
  props: (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets }),
  secret: (s, name, key, value) => app(s, name)?.secrets?.[key] === value && !String(app(s, name)?.props?.[key] ?? '').trim(),
  mq: (s, name) => s.queues.find((q) => q.name === name),
  broker: (s) => brokerOf(s, AMQ),
  sbq: (s) => namespaceOf(s, SB_NS)?.queues?.[SB_QUEUE],
}
p3.topic = (s, name = K_TOPIC) => p3.cluster(s)?.topics?.[name]
p3.topicsOk = (s) => {
  const t = p3.topic(s)
  return Boolean(t && p3.topic(s, K_DLT)) && t.partitions.length >= 6 && t.partitions.length <= 12 && t.partitions[0].replicas.length === 3 && t.config['min.insync.replicas'] === '2' && t.config['retention.ms'] === K_RETENTION
}
p3.can = (s, user, resource, name, op) => Boolean(p3.cluster(s)) && kafkaAuthorized(p3.cluster(s), `User:${user}`, resource, name, op)
p3.aclsOk = (s) => {
  const c = p3.cluster(s)
  if (!c) return false
  const wide = (c.acls ?? []).some((a) => a.permission === 'ALLOW' && (a.operation === 'ALL' || a.name === '*' || a.principal === 'User:*' || a.resource === 'CLUSTER'))
  return !wide && p3.can(s, K_PRODUCER_USER, 'TOPIC', K_TOPIC, 'WRITE') && p3.can(s, K_CONSUMER_USER, 'TOPIC', K_TOPIC, 'READ') && p3.can(s, K_CONSUMER_USER, 'GROUP', K_GROUP, 'READ') && p3.can(s, K_CONSUMER_USER, 'TOPIC', K_DLT, 'WRITE') && !p3.can(s, K_PRODUCER_USER, 'TOPIC', K_TOPIC, 'READ') && !p3.can(s, K_CONSUMER_USER, 'TOPIC', K_TOPIC, 'WRITE')
}
p3.schemaOk = (s) => {
  const v = p3.cluster(s)?.schemaRegistry?.subjects?.[K_SUBJECT]?.versions?.at(-1)
  try {
    return Boolean(v) && JSON.parse(v.schema).fields.some((f) => f.name === 'orderId' && f.type === 'string')
  } catch {
    return false
  }
}
p3.kConnected = (s, name, user, pw) => running(s, name) && kafkaClusterOf(p3.props(s, name)) === K_CLUSTER && p3.props(s, name)['kafka.username'] === user && p3.secret(s, name, 'kafka.password', pw)
p3.producerOk = (s) => p3.kConnected(s, K_PRODUCER, K_PRODUCER_USER, K_PRODUCER_PW) && p3.props(s, K_PRODUCER)['kafka.topic'] === K_TOPIC && kafkaAcksOf(p3.props(s, K_PRODUCER)) === 'ALL' && kafkaKeyed(p3.props(s, K_PRODUCER))
p3.consumerOk = (s) => {
  const p = p3.props(s, K_CONSUMER)
  return p3.kConnected(s, K_CONSUMER, K_CONSUMER_USER, K_CONSUMER_PW) && p['kafka.topic'] === K_TOPIC && p['kafka.groupId'] === K_GROUP && p['kafka.dlt'] === K_DLT && kafkaAckModeOf(p) === 'MANUAL' && kafkaResetOf(p) === 'EARLIEST' && app(s, K_CONSUMER).replicas === 3
}
p3.lagZero = (s) => {
  const l = kafkaLagOf(p3.cluster(s), K_TOPIC, K_GROUP)
  return l.ok && l.partitions.every((p) => p.committed !== null) && l.total === 0
}
p3.kafkaFlow = (s) => {
  const done = new Set(app(s, K_CONSUMER)?.store?.done ?? [])
  const tested = app(s, K_PRODUCER)?.store?.test ?? []
  const keys = new Set(p3.topic(s)?.partitions.flatMap((p) => p.messages.map((m) => m.key)) ?? [])
  const dead = p3.topic(s, K_DLT)?.partitions.flatMap((p) => p.messages) ?? []
  return p3.producerOk(s) && p3.consumerOk(s) && tested.length >= 20 && tested.every((id) => done.has(id) && keys.has(id)) && dead.some((m) => m.headers?.['x-original-topic'] === K_TOPIC) && p3.lagZero(s)
}
p3.mqQueuesOk = (s) => {
  const q = p3.mq(s, MQ_QUEUE)
  const d = p3.mq(s, MQ_DLQ)
  return Boolean(q && d) && !mqIsFifo(q) && !mqIsFifo(d) && q.dlq === MQ_DLQ && q.attempts === MQ_ATTEMPTS
}
p3.mqClient = (s) => (s.mqClients ?? []).some((c) => c.env === 'Sandbox' && c.name === MQ_CLIENT) && mqClientApps(s, 'Sandbox').find((c) => c.name === MQ_CLIENT)
p3.mqDeployed = (s) => {
  const a = app(s, MQ_APP)
  const c = p3.mqClient(s)
  if (a?.status !== 'Running' || !c) return false
  const plain = ['mq.clientId', 'mq.clientSecret'].some((k) => String(a.props?.[k] ?? '').trim())
  return !plain && a.secrets?.['mq.clientId'] === c.clientId && a.secrets?.['mq.clientSecret'] === c.clientSecret && c.clientId !== s.creds.Sandbox.id && a.props['mq.url'] === MQ_URL && a.props['mq.queue'] === MQ_QUEUE
}
p3.mqFlow = (s) => {
  const st = app(s, MQ_APP)?.store ?? {}
  const done = new Set(st.done ?? [])
  const tested = st.test ?? []
  return p3.mqDeployed(s) && p3.mqQueuesOk(s) && tested.length >= 10 && tested.every((id) => done.has(id)) && p3.mq(s, MQ_QUEUE).messages.length === 0 && Boolean(s.seen[`mq:${MQ_DLQ}`]) && p3.mq(s, MQ_DLQ).messages.some((m) => m.from === MQ_QUEUE && m.deliveries >= MQ_ATTEMPTS)
}
p3.amqSetup = (s) => {
  const b = p3.broker(s)
  const u = b?.users[AMQ_USER]
  if (!b?.queues[AMQ_QUEUE] || b.pending?.policies || dlqNameOf(b, AMQ_QUEUE) === CLASSIC_DEFAULTS.deadLetterQueue || !u || b.pending?.users || b.pending?.auth) return false
  const mine = b.auth.filter((e) => [e.read, e.write, e.admin].some((x) => String(x ?? '').split(',').map((g) => g.trim()).some((g) => u.groups.includes(g))))
  return !u.groups.includes('admins') && mine.length > 0 && mine.every((e) => e.type === 'queue' && e.match === AMQ_QUEUE) && jmsAllowed(b, AMQ_USER, 'queue', AMQ_QUEUE, 'read') && jmsAllowed(b, AMQ_USER, 'queue', AMQ_QUEUE, 'write') && !jmsAllowed(b, AMQ_USER, 'queue', AMQ_QUEUE, 'admin')
}
p3.amqDeployed = (s) => {
  const p = p3.props(s, AMQ_APP)
  const a = app(s, AMQ_APP)
  const u = jmsParseUrl(p['jms.url'])
  const hosts = u.hosts.map((h) => h.host)
  return a?.status === 'Running' && p['jms.queue'] === AMQ_QUEUE && p['jms.user'] === AMQ_USER && Boolean(a.secrets?.['jms.password']) && !String(a.props?.['jms.password'] ?? '').trim() && a.secrets['jms.password'] === p3.broker(s)?.users[AMQ_USER]?.password && u.failover && hosts.includes('amq1.brightmart.lab') && hosts.includes('amq2.brightmart.lab') && amqPrefetchOf(p) >= 1 && amqPrefetchOf(p) <= 10 && amqRedeliveriesOf(p) === 3 && amqTransacted(p)
}
p3.amqFlow = (s) => {
  const st = app(s, AMQ_APP)?.store ?? {}
  const done = new Set(st.done ?? [])
  const b = p3.broker(s)
  const dlq = b ? dlqNameOf(b, AMQ_QUEUE) : ''
  return p3.amqDeployed(s) && (st.test ?? []).length >= 20 && st.test.every((id) => done.has(id)) && (b.queues[AMQ_QUEUE]?.messages.length ?? 1) === 0 && Boolean(s.seen[`jms-dest:${dlq}`]) && (b.queues[dlq]?.messages ?? []).some((m) => m.origin === `queue://${AMQ_QUEUE}` && m.redeliveries === 4)
}
p3.sbQueueOk = (s) => {
  const q = p3.sbq(s)
  return Boolean(q) && q.lockMs > SB_WORK_MS && q.lockMs <= 5 * MINUTE && q.maxDelivery === 5 && q.dupDetect && q.dupWindowMs >= 60 * MINUTE && !q.sessions
}
p3.sbPolicy = (s, name) => sbEntityPoliciesOf(p3.sbq(s)).find((p) => p.name === name)
p3.sbPoliciesOk = (s) => p3.sbPolicy(s, SB_SEND)?.claims.join() === 'Send' && p3.sbPolicy(s, SB_LISTEN)?.claims.join() === 'Listen'
p3.sbDeployed = (s) => {
  const a = app(s, SB_APP)
  if (a?.status !== 'Running' || a.props?.['sb.queue'] !== SB_QUEUE) return false
  const strings = (name) => ['primary', 'secondary'].map((w) => sbEntityConnectionString(s, SB_NS, SB_QUEUE, name, w))
  const plain = ['sb.sendConnectionString', 'sb.listenConnectionString'].some((k) => String(a.props?.[k] ?? '').trim())
  return !plain && p3.sbPoliciesOk(s) && strings(SB_SEND).includes(a.secrets?.['sb.sendConnectionString']) && strings(SB_LISTEN).includes(a.secrets?.['sb.listenConnectionString'])
}
p3.sbFlow = (s) => {
  const st = app(s, SB_APP)?.store ?? {}
  const test = st.test ?? []
  return p3.sbDeployed(s) && p3.sbQueueOk(s) && test.length >= 10 && (st.duplicates ?? 0) >= test.length && test.every((id) => st.notified?.[id] === 1) && p3.sbq(s).messages.length === 0 && Boolean(s.seen[`sb-dlq:${SB_QUEUE}`]) && p3.sbq(s).dlq.some((m) => m.deadLetterReason === 'MaxDeliveryCountExceeded' && m.deliveryCount === 5)
}

function part3Start() {
  const clock = at(3, 8, 55)
  const cluster = newCluster(K_CLUSTER, 3, { authorizer: true, scram: { admin: 'admin-lab-26', [K_PRODUCER_USER]: K_PRODUCER_PW, [K_CONSUMER_USER]: K_CONSUMER_PW } })
  return nextDay(solvedOf(part2), 3, {
    jars: [K_PRODUCER, K_CONSUMER, MQ_APP, AMQ_APP, SB_APP],
    kafka: newKafka({ clusters: { [K_CLUSTER]: cluster } }),
    jms: { created: clock, brokers: { [AMQ]: classicBroker(clock) } },
    serviceBus: { created: clock, namespaces: { [SB_NS]: newSbNamespace(SB_NS, clock) } },
    mail: [
      {
        subject: 'Go-live part 3: messaging',
        body: [
          'Good morning. Today the four message systems. Each integration gets its own destinations, its own credentials with the least rights, a place for messages that cannot be processed, and an alert.',
          `Kafka ${K_CLUSTER} (${K_BOOTSTRAP}, SCRAM users exist already). Order events go from ${K_PRODUCER} to ${K_CONSUMER} in the warehouse. Topic ${K_TOPIC}: 6 partitions, replication factor 3, min.insync.replicas 2, retention 3 days (${K_RETENTION} ms). Dead letter topic ${K_DLT}, 1 partition. ${K_PRODUCER_USER} (password ${K_PRODUCER_PW}) only writes ${K_TOPIC}; ${K_CONSUMER_USER} (password ${K_CONSUMER_PW}) reads it in group ${K_GROUP} and writes the dead letter topic. Register the value schema ${K_SUBJECT}. The producer sends with acks=all, keyed by orderId; the consumer runs on 3 replicas with MANUAL acks from the earliest offset. Alerts to ${WAREHOUSE_ONCALL}.`,
          `Anypoint MQ. Refunds of returns go through ${MQ_QUEUE} to ${MQ_APP}: a standard queue with the dead letter queue ${MQ_DLQ} after ${MQ_ATTEMPTS} deliveries, and its own client app ${MQ_CLIENT}, not the platform credentials. Alerts to ${RETURNS_SUPPORT}.`,
          `ActiveMQ ${AMQ} (amq1 and amq2 on a shared store). The refund ledger feed ${AMQ_APP} reads ${AMQ_QUEUE} as ${AMQ_USER} in group ${AMQ_GROUP}, password ${AMQ_PASSWORD}, with read and write on that queue only. Its own dead letter queue ${AMQ_DLQ}, 3 redeliveries, transacted, prefetch 1, failover over both nodes. Alerts to ${FINANCE_INT}.`,
          `Azure Service Bus ${SB_NS}. Click and collect notices go through ${SB_QUEUE} to ${SB_APP}: the work takes about 40 seconds, 5 deliveries at most, duplicate detection over 1 hour because the stores resend. A Send policy ${SB_SEND} and a Listen policy ${SB_LISTEN} on the queue, not the namespace key. Alerts to ${STORES_ONCALL}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
}

const part3 = {
  id: 'p-golive-3',
  group: 'Brightmart go-live',
  title: 'Go-live part 3: messaging, Kafka, Anypoint MQ, ActiveMQ and Service Bus',
  minutes: 60,
  scenario: `Day 3 of the Brightmart go-live. The databases are live. Today the four message systems get their destinations, users and dead letter paths, and the five apps that use them are deployed and proven: order events on Kafka, refunds on Anypoint MQ, the refund ledger on ActiveMQ and click and collect notices on Azure Service Bus. For each, a good message must arrive and a bad one must end up where a person can see it, never lost and never blocking the rest.`,
  start: () => part3Start(),
  steps: [
    { title: 'Read the messaging handover', how: 'Open the Inbox from the menu under Lab tools. Note per system the destinations, the users, the number of tries and the alert address.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Kafka: the topic ${K_TOPIC}, its dead letter topic and the schema`,
      how: `Kafka from the console menu, Topics, Add a topic. ${K_TOPIC}: Number of partitions 6, Replication factor 3, Min in sync replicas 2, Time to retain data ${K_RETENTION}. Create topic. Then ${K_DLT} with 1 partition and replication factor 3. Schema Registry, Create a subject: ${K_SUBJECT} with an Avro record of orderId, customerId and status (string) and total (double), for example ${K_SCHEMA}.`,
      done: (s) => p3.topicsOk(s) && p3.schemaOk(s),
    },
    {
      title: 'Kafka: one ACL per need',
      how: `ACLs, Create ACL, all LITERAL and ALLOW: User:${K_PRODUCER_USER} WRITE on TOPIC ${K_TOPIC}; User:${K_CONSUMER_USER} READ on TOPIC ${K_TOPIC}; User:${K_CONSUMER_USER} READ on GROUP ${K_GROUP}; User:${K_CONSUMER_USER} WRITE on TOPIC ${K_DLT}. No ALL, no * and no CLUSTER rights.`,
      done: p3.aclsOk,
    },
    {
      title: 'Kafka: deploy the producer and the consumer',
      how: `Runtime Manager, Deploy application: ${K_PRODUCER} with kafka.bootstrapServers ${K_BOOTSTRAP}, kafka.topic ${K_TOPIC}, kafka.username ${K_PRODUCER_USER}, kafka.acks ALL, kafka.key #[payload.orderId], and kafka.password protected. Then ${K_CONSUMER} on 3 replicas with kafka.bootstrapServers, kafka.topic ${K_TOPIC}, kafka.groupId ${K_GROUP}, kafka.username ${K_CONSUMER_USER}, kafka.ackMode MANUAL, kafka.autoOffsetReset EARLIEST, kafka.dlt ${K_DLT} and kafka.password protected. Move the clock 2 minutes: Kafka, Consumers, ${K_GROUP} shows 3 members, Stable.`,
      done: (s) => p3.producerOk(s) && p3.consumerOk(s) && p3.cluster(s)?.groups?.[K_GROUP]?.state === 'Stable',
    },
    {
      title: 'Kafka: 20 test events in, one poison event out of the way',
      how: `API client: POST /orders/test-events?count=20 on ${K_PRODUCER}, move the clock 2 minutes. Each event has its orderId as key and the lag of ${K_GROUP} is 0. Then Topics, ${K_TOPIC}, Produce message with key bad-1 and the value {"orderId": 42 (cut off). Move the clock 2 minutes: the consumer sends it to ${K_DLT} with the x-original-topic header, and the lag is 0 again.`,
      done: p3.kafkaFlow,
    },
    ask(
      'Why the key is the orderId',
      `Why does ${K_PRODUCER} send each event with the orderId as the record key?`,
      [
        'Kafka refuses records without a key',
        'The key picks the partition. All events of one order land in the same partition, and a partition is read in order by one consumer of the group, so CREATED is handled before SHIPPED. Without a key the events of one order spread over partitions and can be handled out of order',
        'The key compresses the value',
        'The key is the only field the consumer can read',
      ],
      1,
      'Kafka keeps order per partition only. Keying by the business id gives order where it matters and still spreads different orders over 6 partitions, so 3 replicas share the work. More consumers than partitions would sit idle.',
    ),
    {
      title: `Anypoint MQ: ${MQ_QUEUE}, its dead letter queue and the client app`,
      how: `MQ from the console menu, Destinations, + Add, Queue: ${MQ_DLQ} as a Standard queue, Create Queue. Then ${MQ_QUEUE}, Standard queue, Assign a Dead Letter Queue ${MQ_DLQ}, Delivery attempts before reroute ${MQ_ATTEMPTS}. Then Client Apps, + Add, App Name ${MQ_CLIENT}, Save, and copy its Client ID and Client Secret.`,
      done: (s) => p3.mqQueuesOk(s) && Boolean(p3.mqClient(s)),
    },
    {
      title: `Anypoint MQ: deploy ${MQ_APP} and prove both paths`,
      how: `Deploy ${MQ_APP} with mq.url ${MQ_URL}, mq.queue ${MQ_QUEUE}, and mq.clientId and mq.clientSecret of ${MQ_CLIENT}, both protected. API client: POST /returns/test?count=10, move the clock a minute: 10 refunds booked and ${MQ_QUEUE} is empty. Then Destinations, ${MQ_QUEUE}, Message Sender with { "returnId": "R-1", "amount": (cut off). After ${MQ_ATTEMPTS} failed deliveries it is in ${MQ_DLQ}: Message Browser, Get Messages.`,
      done: p3.mqFlow,
    },
    {
      title: `ActiveMQ: ${AMQ_QUEUE}, its own dead letter queue and ${AMQ_USER}`,
      how: `ActiveMQ from the console menu, ${AMQ}, Queues: create ${AMQ_QUEUE}. Broker config (lab page): Add a policyEntry for ${AMQ_QUEUE}, individualDeadLetterStrategy, queuePrefix DLQ. Users (lab page): Add user ${AMQ_USER}, password ${AMQ_PASSWORD}, Groups ${AMQ_GROUP}; Add entry: Type queue, Destination ${AMQ_QUEUE}, read and write ${AMQ_GROUP}, admin empty. Then Home, Nodes, Restart on amq1, so the broker starts with the new activemq.xml.`,
      done: p3.amqSetup,
    },
    {
      title: `ActiveMQ: deploy ${AMQ_APP} and prove both paths`,
      how: `Deploy ${AMQ_APP} with jms.url ${AMQ_URL}, jms.user ${AMQ_USER}, jms.queue ${AMQ_QUEUE}, jms.maxRedelivery 3, jms.transactionalAction ALWAYS_BEGIN and jms.password protected. API client: POST /refunds/test?count=20, move the clock 2 minutes: 20 refunds, ${AMQ_QUEUE} has 0 pending. Then ActiveMQ, Send to ${AMQ_QUEUE}, Persistent, body { "refundId": "RF-1", "amount": (cut off). Move the clock a minute and Browse ${AMQ_DLQ}.`,
      done: p3.amqFlow,
    },
    ask(
      'Transacted, prefetch 1',
      `Why does ${AMQ_APP} read in a transaction with prefetch 1?`,
      [
        'Transactions make ActiveMQ faster',
        'In a transaction the message leaves the queue only when the flow commits. A failure rolls back, the broker redelivers, and after 3 redeliveries it moves the message to its own dead letter queue, so a refund is never lost. Prefetch 1 keeps the broker from pushing a batch to one consumer that may stop, so the other node can take the next message',
        'Prefetch 1 is needed for failover to work',
        'A transaction keeps the message forever',
      ],
      1,
      'ALWAYS_BEGIN with maxRedelivery gives at least once delivery with a bound. An individual dead letter queue per queue keeps the refunds apart from the shared ActiveMQ.DLQ, so the finance team reads only its own failures.',
    ),
    {
      title: `Service Bus: ${SB_QUEUE} with a Send and a Listen policy`,
      how: `Service Bus from the console menu, ${SB_NS}, Queues, + Queue. Name ${SB_QUEUE}, Max delivery count 5, Lock duration 1 minute (above the 40 seconds of work), Enable duplicate detection with a window of 1 hour, sessions off. Create. Open it, Settings, Shared access policies, Add: ${SB_SEND} with only Send, then ${SB_LISTEN} with only Listen.`,
      done: (s) => p3.sbQueueOk(s) && p3.sbPoliciesOk(s),
    },
    {
      title: `Service Bus: deploy ${SB_APP} and prove both paths`,
      how: `Deploy ${SB_APP} with sb.queue ${SB_QUEUE}, and as protected properties sb.sendConnectionString (${SB_SEND}) and sb.listenConnectionString (${SB_LISTEN}). API client: POST /pickups/test?count=10 twice; the second answer drops 10 duplicates. Move the clock 2 minutes: one SMS per pickup. Then ${SB_QUEUE}, Service Bus Explorer, Send messages with { "pickupId": "PU-1", (cut off), move the clock a minute and Peek the Dead-letter tab: MaxDeliveryCountExceeded.`,
      done: p3.sbFlow,
    },
    {
      title: 'Alert the owner of each consumer',
      how: `Monitoring, Alerts, Create Alert, Message Error Count Above 0: ${K_CONSUMER} to ${WAREHOUSE_ONCALL}, ${MQ_APP} to ${RETURNS_SUPPORT}, ${AMQ_APP} to ${FINANCE_INT}, ${SB_APP} to ${STORES_ONCALL}.`,
      done: (s) => alerted(s, K_CONSUMER, WAREHOUSE_ONCALL) && alerted(s, MQ_APP, RETURNS_SUPPORT) && alerted(s, AMQ_APP, FINANCE_INT) && alerted(s, SB_APP, STORES_ONCALL),
    },
  ],
  why: 'Every message system got the same checklist. Make the destination with its delivery settings (partitions and replication for Kafka, a dead letter queue with a delivery limit for Anypoint MQ and ActiveMQ, lock time, delivery count and duplicate detection for Service Bus). Give each app its own credential with only the rights it needs: ACLs per user and group in Kafka, a client app in Anypoint MQ, a user with read and write on one queue in ActiveMQ, Send and Listen policies on one queue in Service Bus. Keep the passwords and connection strings as protected properties. Then send real test messages and check they were all handled and the queue or lag is back to zero, send one poison message and find it in the dead letter destination with its reason, and alert the owner of each consumer.',
  docs: `${DOCS}kafka-connector/latest/`,
  solve(start) {
    let s = mark(start, 'inbox')
    s = createTopic(s, K_CLUSTER, { name: K_TOPIC, partitions: 6, replicationFactor: 3, config: { 'min.insync.replicas': '2', 'retention.ms': K_RETENTION } }).state
    s = createTopic(s, K_CLUSTER, { name: K_DLT, partitions: 1, replicationFactor: 3, config: {} }).state
    s = registerSchema(s, K_CLUSTER, K_SUBJECT, K_SCHEMA).state
    const allow = (principal, resource, name, operation) => ({ principal: `User:${principal}`, resource, name, pattern: 'LITERAL', operation, permission: 'ALLOW', host: '*' })
    for (const a of [allow(K_PRODUCER_USER, 'TOPIC', K_TOPIC, 'WRITE'), allow(K_CONSUMER_USER, 'TOPIC', K_TOPIC, 'READ'), allow(K_CONSUMER_USER, 'GROUP', K_GROUP, 'READ'), allow(K_CONSUMER_USER, 'TOPIC', K_DLT, 'WRITE')]) s = addAcl(s, K_CLUSTER, a).state
    const base = { 'kafka.bootstrapServers': K_BOOTSTRAP, 'kafka.topic': K_TOPIC }
    s = deploy(s, K_PRODUCER, { ...base, 'kafka.username': K_PRODUCER_USER, 'kafka.acks': 'ALL', 'kafka.key': '#[payload.orderId]' }, { 'kafka.password': K_PRODUCER_PW })
    s = deploy(s, K_CONSUMER, { ...base, 'kafka.groupId': K_GROUP, 'kafka.username': K_CONSUMER_USER, 'kafka.ackMode': 'MANUAL', 'kafka.autoOffsetReset': 'EARLIEST', 'kafka.dlt': K_DLT }, { 'kafka.password': K_CONSUMER_PW }, { replicas: 3 })
    s = advance(s, 2 * MINUTE)
    s = call(s, K_PRODUCER, null, '/orders/test-events?count=20', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = produceMessage(s, K_CLUSTER, K_TOPIC, { key: 'bad-1', value: '{"orderId": 42' }).state
    s = advance(s, 2 * MINUTE)
    s = createMqQueue(s, { name: MQ_DLQ, fifo: false, ttl: MQ_DEFAULT_TTL, lockTtl: MQ_DEFAULT_LOCK_TTL })
    s = createMqQueue(s, { name: MQ_QUEUE, fifo: false, ttl: MQ_DEFAULT_TTL, lockTtl: MQ_DEFAULT_LOCK_TTL, dlq: MQ_DLQ, attempts: MQ_ATTEMPTS })
    s = mark(addMqClientApp(s, 'Sandbox', MQ_CLIENT), 'mq-clients')
    const c = mqClientApps(s, 'Sandbox').find((x) => x.name === MQ_CLIENT)
    s = deploy(s, MQ_APP, { 'mq.url': MQ_URL, 'mq.queue': MQ_QUEUE }, { 'mq.clientId': c.clientId, 'mq.clientSecret': c.clientSecret })
    s = call(s, MQ_APP, null, '/returns/test?count=10', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = mark(sendMessage(s, MQ_QUEUE, '{ "returnId": "R-1", "amount": '), `mq:${MQ_DLQ}`)
    s = createDestination(s, AMQ, 'queue', AMQ_QUEUE).state
    s = addPolicyEntry(s, AMQ, { match: AMQ_QUEUE, strategy: 'individual', queuePrefix: 'DLQ.' }).state
    s = addJmsUser(s, AMQ, { name: AMQ_USER, password: AMQ_PASSWORD, groups: AMQ_GROUP }).state
    s = addAuthEntry(s, AMQ, { type: 'queue', match: AMQ_QUEUE, read: AMQ_GROUP, write: AMQ_GROUP, admin: '' }).state
    s = restartNode(s, AMQ, 'amq1', 1).state
    s = deploy(s, AMQ_APP, { 'jms.url': AMQ_URL, 'jms.user': AMQ_USER, 'jms.queue': AMQ_QUEUE, 'jms.maxRedelivery': '3', 'jms.transactionalAction': 'ALWAYS_BEGIN' }, { 'jms.password': AMQ_PASSWORD })
    s = call(s, AMQ_APP, null, '/refunds/test?count=20', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = sendTo(s, AMQ, { dest: AMQ_QUEUE, type: 'queue', body: '{ "refundId": "RF-1", "amount": ', persistent: true }).state
    s = mark(advance(s, MINUTE), `jms-dest:${AMQ_DLQ}`)
    s = createSbQueue(s, SB_NS, { name: SB_QUEUE, lockMs: MINUTE, maxDelivery: 5, ttlMs: 14 * SB_TIME.DAY, dupDetect: true, dupWindowMs: 60 * MINUTE, maxSizeMb: 1024, sessions: false, dlOnExpire: false })
    s = addEntityPolicy(s, SB_NS, SB_QUEUE, SB_SEND, ['Send'])
    s = addEntityPolicy(s, SB_NS, SB_QUEUE, SB_LISTEN, ['Listen'])
    s = deploy(s, SB_APP, { 'sb.queue': SB_QUEUE }, { 'sb.sendConnectionString': sbEntityConnectionString(s, SB_NS, SB_QUEUE, SB_SEND), 'sb.listenConnectionString': sbEntityConnectionString(s, SB_NS, SB_QUEUE, SB_LISTEN) })
    s = call(s, SB_APP, null, '/pickups/test?count=10', 'POST').state
    s = call(s, SB_APP, null, '/pickups/test?count=10', 'POST').state
    s = advance(s, 2 * MINUTE)
    s = explorerSend(s, SB_NS, SB_QUEUE, { body: '{ "pickupId": "PU-1", ', contentType: 'application/json' }).state
    s = mark(advance(s, MINUTE), `sb-dlq:${SB_QUEUE}`)
    s = errorAlert(s, K_CONSUMER, WAREHOUSE_ONCALL, 'Warehouse consumer failed')
    s = errorAlert(s, MQ_APP, RETURNS_SUPPORT, 'Refund failed')
    s = errorAlert(s, AMQ_APP, FINANCE_INT, 'Refund ledger failed')
    return errorAlert(s, SB_APP, STORES_ONCALL, 'Pickup notice failed')
  },
  answers: { 5: 1, 10: 1 },
}

// ==================== Part 4: files ====================

const SFTP_USER = 'mule_brightline'
const SFTP_PARTNER = 'brightline_upload'
const SFTP_HOME = '/partners/brightline'
const SFTP_IN = `${SFTP_HOME}/in`
const SFTP_ARCHIVE = `${SFTP_HOME}/archive`
const SFTP_ERROR = `${SFTP_HOME}/error`
const SFTP_GOOD = 'stock-brightline-20261103.csv'
const SFTP_BAD = 'stock-brightline-bad.csv'
const SUPPLY_INT = 'supply-integration@brightmart.example'
const FTP_USER = 'mule_pos_export'
const FTP_HOME = '/export'
const FTP_OUTBOX = '/export/outbox'
const FTP_DONE = '/export/done'
const FTP_ERROR = '/export/error'
const FTP_GOOD = 'pos-sales-test-0001.zip'
const FTP_BAD = 'pos-sales-test-0002.zip'
const FTP_PASSWORD = 'lab-practice-ftp-1' // the practice password of the solution; the learner picks any
const STORE_SYSTEMS = 'store-systems@brightmart.example'
const BLOB_ACCOUNT = 'brightmartexports'
const BLOB_CONTAINER = 'customer-exports'
const BLOB_PREFIX = 'daily'
const BLOB_SECRET = 'customer-export-sas'
const OFFICE = '198.51.100.0/24' // lab made: the Brightmart office range (a documentation range)
const BLOB_CLIENT = 'lab-app-registration-0042'
const BLOB_CLIENT_SECRET = 'lab-practice-client-secret-42' // a practice value of the lab, not a real secret
const CRM_TEAM = 'crm-team@brightmart.example'
const FILES_ACCOUNT = 'brightmartwarehouse'
const FILES_SHARE = 'scanner-files'
const FILES_DIRS = ['picks', 'scans', 'errors']
const SCAN_GOOD = 'scan-dub1-0001.csv'
const SCAN_BAD = 'scan-dub1-0002.csv'
const SCAN_GOOD_CSV = `${SCAN_HEADER}\nA-01-03,H-100,4\nA-02-11,H-200,1\nC-07-02,H-300,12\n`
const SCAN_BAD_CSV = `${SCAN_HEADER}\nA-01-03,H-100,4\nA-02-11,H-200,two\n`
const WAREHOUSE_IT = 'warehouse-it@brightmart.example'
const DAY_MS = 24 * 60 * MINUTE

const p4 = {
  sftp: (s) => s.systems?.servers?.[SFTP_HOST],
  ftp: (s) => s.systems?.servers?.[FTP_HOST],
  blob: (s) => s.systems?.storage?.[BLOB_ACCOUNT],
  files: (s) => s.systems?.storage?.[FILES_ACCOUNT],
  prop: (s, name, k) => String(app(s, name)?.props?.[k] ?? '').trim(),
  clean: (v) => String(v ?? '').trim().replace(/^\?/, ''),
}
p4.sftpUser = (s) => p4.sftp(s)?.users?.[SFTP_USER]
p4.sftpRights = (s) => {
  const u = p4.sftpUser(s)
  if (!u || u.home !== SFTP_HOME || u.password !== undefined || !u.key || u.key === 'brightline-upload.pem' || !s.systems.local.files[u.key] || u.readOnly || u.locked) return false
  const reads = !u.readDirs || (u.readDirs.includes(SFTP_IN) && u.readDirs.every((d) => [SFTP_IN, SFTP_ARCHIVE, SFTP_ERROR].includes(d)))
  return sameSet(u.writeDirs, [SFTP_IN, SFTP_ARCHIVE, SFTP_ERROR]) && reads
}
p4.sftpDeployed = (s) => {
  const x = app(s, SFTP_APP)
  if (x?.status !== 'Running' || !p4.sftpRights(s)) return false
  const pr = (k) => p4.prop(s, SFTP_APP, k)
  const wait = Number(pr('sftp.timeBetweenSizeCheck'))
  return pr('sftp.host') === SFTP_HOST && pr('sftp.port') === '22' && pr('sftp.user') === SFTP_USER && pr('sftp.inDir') === SFTP_IN && pr('sftp.moveToDirectory') === SFTP_ARCHIVE && pr('sftp.errorDir') === SFTP_ERROR && wait >= 2 && wait <= 60 && knownKeys(x.props['sftp.knownHosts'], SFTP_HOST, 22).includes(p4.sftp(s).hostKey.pub) && x.secrets['sftp.identityFile'] === p4.sftpUser(s).key && !x.props['sftp.identityFile'] && !x.props['sftp.password'] && !x.secrets['sftp.password']
}
p4.sftpStore = (s) => app(s, SFTP_APP)?.store ?? {}
p4.sftpLoaded = (s) => p4.sftpDeployed(s) && Boolean(p4.sftp(s).files[`${SFTP_ARCHIVE}/${SFTP_GOOD}`]) && !p4.sftp(s).files[`${SFTP_IN}/${SFTP_GOOD}`] && (p4.sftpStore(s).loaded ?? []).some((x) => x.name === SFTP_GOOD && x.rows === 4)
p4.sftpRejected = (s) => p4.sftpDeployed(s) && Boolean(p4.sftp(s).files[`${SFTP_ERROR}/${SFTP_BAD}`]) && !p4.sftp(s).files[`${SFTP_IN}/${SFTP_BAD}`] && (p4.sftpStore(s).rejected ?? []).some((x) => x.name === SFTP_BAD)
p4.ftpUser = (s) => p4.ftp(s)?.users?.[FTP_USER]
p4.ftpReady = (s) => {
  const u = p4.ftpUser(s)
  if (!u || u.home !== FTP_HOME || !String(u.password ?? '') || u.locked || u.readOnly) return false
  const reads = !u.readDirs || (u.readDirs.includes(FTP_OUTBOX) && u.readDirs.every((d) => [FTP_OUTBOX, FTP_DONE, FTP_ERROR].includes(d)))
  return sameSet(u.writeDirs, [FTP_OUTBOX, FTP_DONE, FTP_ERROR]) && reads && p4.ftp(s).passive?.open === true
}
p4.ftpDeployed = (s) => {
  const x = app(s, FTP_APP)
  const pr = (k) => p4.prop(s, FTP_APP, k)
  return x?.status === 'Running' && p4.ftpReady(s) && pr('ftp.host') === FTP_HOST && pr('ftp.port') === '21' && pr('ftp.user') === FTP_USER && pr('ftp.passive').toLowerCase() === 'true' && pr('ftp.transferMode').toUpperCase() === 'BINARY' && pr('ftp.inDir') === FTP_OUTBOX && pr('ftp.doneDir') === FTP_DONE && pr('ftp.errorDir') === FTP_ERROR && x.secrets['ftp.password'] === p4.ftpUser(s).password && !x.props['ftp.password']
}
p4.ftpStore = (s) => app(s, FTP_APP)?.store ?? {}
p4.ftpLoaded = (s) => p4.ftpDeployed(s) && Boolean(p4.ftp(s).files[`${FTP_DONE}/${FTP_GOOD}`]) && !p4.ftp(s).files[`${FTP_DONE}/${FTP_GOOD}`].corrupt && (p4.ftpStore(s).loaded ?? []).some((x) => x.name === FTP_GOOD && x.size === 18432)
p4.ftpRejected = (s) => p4.ftpDeployed(s) && Boolean(p4.ftp(s).files[`${FTP_ERROR}/${FTP_BAD}`]?.corrupt) && (p4.ftpStore(s).rejected ?? []).some((x) => x.name === FTP_BAD)
const ipNum = (x) => String(x).split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0
const covers = (rule, ip) => {
  const [base, bits = '32'] = String(rule).trim().split('/')
  const b = Number(bits)
  if (!/^\d+(\.\d+){3}$/.test(base) || !(b >= 24 && b <= 32)) return false
  const m = (~0 << (32 - b)) >>> 0
  return (ipNum(ip) & m) === (ipNum(base) & m)
}
p4.blobSas = (s, x) => Boolean(x) && x.box === BLOB_CONTAINER && x.services === 'b' && x.perms === 'cw' && sasState(s, BLOB_ACCOUNT, x) === 'Active' && x.expires - x.created >= 7 * DAY_MS
p4.blobReady = (s) => {
  const acc = p4.blob(s)
  const n = acc?.network
  return acc?.containers?.[BLOB_CONTAINER]?.access === 'Private' && (acc.sas ?? []).some((x) => p4.blobSas(s, x)) && n?.mode === 'Selected networks' && n.ips.includes(OFFICE) && n.ips.some((r) => covers(r, DEFAULT_EGRESS))
}
p4.blobVault = (s) => {
  const kv = p1.vault(s)
  const cur = latestVersion(kv?.secrets?.[BLOB_SECRET])
  const x = (p4.blob(s)?.sas ?? []).find((y) => y.token === p4.clean(cur?.value))
  const policy = kv?.access?.[BLOB_APP] ?? []
  return Boolean(cur?.enabled) && p4.blobSas(s, x) && kv.model === 'Vault access policy' && sameSet(policy, ['get'])
}
p4.blobDeployed = (s) => {
  const x = app(s, BLOB_APP)
  if (x?.status !== 'Running') return false
  const pr = (k) => p4.prop(s, BLOB_APP, k)
  const sasAnywhere = Object.values({ ...x.props, ...x.secrets }).some((v) => /sig=/.test(String(v)))
  return pr('blob.account') === BLOB_ACCOUNT && pr('blob.container') === BLOB_CONTAINER && pr('blob.prefix').replace(/^\/+|\/+$/g, '') === BLOB_PREFIX && pr('kv.name') === VAULT && pr('kv.secret.name') === BLOB_SECRET && pr('kv.client.id') === BLOB_CLIENT && x.secrets['kv.client.secret'] === BLOB_CLIENT_SECRET && !x.props['kv.client.secret'] && !sasAnywhere
}
p4.blobExported = (s) => {
  const last = app(s, BLOB_APP)?.schedules.find((x) => x.flow === BLOB_FLOW)?.last
  const blobs = p4.blob(s)?.containers?.[BLOB_CONTAINER]?.blobs ?? {}
  const b = blobs[blobName(BLOB_PREFIX, last?.t ?? 0)]
  const x = (app(s, BLOB_APP)?.store?.exports ?? []).at(-1)
  return p4.blobDeployed(s) && p4.blobReady(s) && p4.blobVault(s) && Boolean(last?.ok) && Boolean(b) && b.owner === BLOB_APP && x?.rows === BLOB_CUSTOMERS.length - 1 && /C-1043/.test(blobs[rejectsName(BLOB_PREFIX, last.t)]?.content ?? '')
}
p4.share = (s) => p4.files(s)?.shares?.[FILES_SHARE]
p4.filesSas = (s, x) => Boolean(x) && x.box === FILES_SHARE && x.services === 'f' && x.perms === 'rcwl' && sasState(s, FILES_ACCOUNT, x) === 'Active' && x.expires - x.created >= 7 * DAY_MS
p4.filesReady = (s) => p4.share(s)?.quota === 50 && FILES_DIRS.every((d) => p4.share(s).dirs.includes(d)) && (p4.files(s)?.sas ?? []).some((x) => p4.filesSas(s, x))
p4.filesDeployed = (s) => {
  const x = app(s, FILES_APP)
  const pr = (k) => p4.prop(s, FILES_APP, k).replace(/^\/+|\/+$/g, '')
  return x?.status === 'Running' && p4.filesReady(s) && pr('share.account') === FILES_ACCOUNT && pr('share.name') === FILES_SHARE && pr('share.picksDir') === 'picks' && pr('share.scansDir') === 'scans' && pr('share.errorDir') === 'errors' && !x.props['share.sas'] && p4.filesSas(s, p4.files(s).sas.find((y) => y.token === p4.clean(x.secrets['share.sas'])))
}
p4.filesFlow = (s) => {
  const st = app(s, FILES_APP)?.store ?? {}
  const sh = p4.share(s)
  const wrote = Object.entries(sh?.files ?? {}).some(([p, f]) => p.startsWith('picks/') && f.owner === FILES_APP)
  return p4.filesDeployed(s) && wrote && (st.scans ?? []).some((x) => x.name === SCAN_GOOD && x.lines === 3) && Boolean(sh.files[`errors/${SCAN_BAD}`]) && (st.rejected ?? []).some((x) => x.name === SCAN_BAD) && !(st.scans ?? []).some((x) => x.name === SCAN_BAD)
}

function part4Start() {
  const s = nextDay(solvedOf(part3), 4, {
    jars: [SFTP_APP, FTP_APP, BLOB_APP, FILES_APP],
    mail: [
      {
        subject: 'Go-live part 4: files',
        body: [
          'Good morning. Today the file transfers. Every one has a place for files that cannot be read, so nothing is lost and nothing is read twice.',
          `SFTP ${SFTP_HOST}. Brightline, our supplier, drops stock files in ${SFTP_IN} as ${SFTP_PARTNER}. ${SFTP_APP} reads them as ${SFTP_USER}: home ${SFTP_HOME}, a key pair and no password, write on ${SFTP_IN}, ${SFTP_ARCHIVE} and ${SFTP_ERROR} only. It checks the host key against known_hosts, waits until a file stops growing (5 seconds between size checks), moves read files to the archive and bad ones to the error folder. Brightline sent ${SFTP_GOOD} already. Alerts to ${SUPPLY_INT}.`,
          `FTP ${FTP_HOST}, the old POS export server. ${FTP_APP} picks up the zips of the tills in ${FTP_OUTBOX} as ${FTP_USER} (home ${FTP_HOME}, write on outbox, done and error only), passive mode on ports 50000 to 50100, binary transfer. Alerts to ${STORE_SYSTEMS}.`,
          `Azure Blob Storage ${BLOB_ACCOUNT}. ${BLOB_APP} writes the daily customer export to a new private container ${BLOB_CONTAINER} under ${BLOB_PREFIX}/. It gets a SAS for that container with Create and Write only, at least a week valid, kept in ${VAULT} as ${BLOB_SECRET} and read with Get only. The account firewall stays on: keep the office range ${OFFICE} and add the outbound address of CloudHub, ${DEFAULT_EGRESS}. App registration ${BLOB_CLIENT}, client secret ${BLOB_CLIENT_SECRET}. Alerts to ${CRM_TEAM}.`,
          `Azure Files ${FILES_ACCOUNT}. The scanners of the Dublin warehouse share ${FILES_SHARE} (quota 50 GiB) with the folders picks, scans and errors. ${FILES_APP} writes pick lists and reads the scan files with a SAS for that share: Read, Create, Write and List, no Delete. Alerts to ${WAREHOUSE_IT}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  // the servers and storage accounts the infrastructure team handed over
  const sftp = newServerSys(SFTP_HOST, {
    ip: '10.20.5.21',
    users: { [SFTP_PARTNER]: { key: 'brightline-upload.pem', home: SFTP_HOME, readDirs: [SFTP_IN], writeDirs: [SFTP_IN] } },
    dirs: ['/', '/partners', SFTP_HOME, SFTP_IN, SFTP_ARCHIVE, SFTP_ERROR],
    files: { [`${SFTP_IN}/${SFTP_GOOD}`]: fileRec(`${SFTP_HEADER}\nBL-1001,DUB-1,240\nBL-1002,DUB-1,0\nBL-1003,ROT-2,75\nBL-1004,ROT-2,310\n`, { t: at(4, 8, 30), owner: SFTP_PARTNER }) },
  })
  const ftp = newServerSys(FTP_HOST, {
    protocol: 'FTP', ip: '10.20.5.40', passive: { from: 50000, to: 50100, open: false },
    users: { legacy_pos: { password: 'lab-pos-till', home: FTP_HOME, readDirs: [FTP_OUTBOX], writeDirs: [FTP_OUTBOX] } },
    dirs: ['/', FTP_HOME, FTP_OUTBOX, FTP_DONE, FTP_ERROR],
  })
  const more = systemsOf({
    servers: [sftp, ftp],
    storage: [
      newStorage(BLOB_ACCOUNT, { network: { mode: 'Selected networks', ips: [OFFICE] }, containers: { 'crm-archive': newContainer({}, { created: at(0, 9) }) } }),
      newStorage(FILES_ACCOUNT, { shares: { 'label-printers': newShare({ 'out/labels-0901.zpl': fileRec('^XA^FDH-100^FS^XZ', { t: at(4, 7) }) }, { dirs: ['', 'out'], quota: 10 }) } }),
    ],
  })
  Object.assign(s.systems.servers, more.servers)
  Object.assign(s.systems.storage, more.storage)
  s.systems.principals = [...(s.systems.principals ?? []), BLOB_APP]
  s.systems.local = {
    home: 'C:\\Users\\you\\brightmart',
    files: {
      [SFTP_BAD]: fileRec(`${SFTP_HEADER}\nBL-1001,DUB-1,240\nBL-1002,DUB-1,many\n`, { t: at(4, 8, 45) }),
      [FTP_GOOD]: fileRec('', { size: 18432, t: at(4, 8), binary: true }),
      [FTP_BAD]: fileRec('', { size: 20480, t: at(4, 8), binary: true }),
      [SCAN_GOOD]: fileRec(SCAN_GOOD_CSV, { t: at(4, 8) }),
      [SCAN_BAD]: fileRec(SCAN_BAD_CSV, { t: at(4, 8) }),
    },
  }
  return s
}

const part4 = {
  id: 'p-golive-4',
  group: 'Brightmart go-live',
  title: 'Go-live part 4: files, SFTP, FTP, Azure Blob and Azure Files',
  minutes: 55,
  scenario: `Day 4 of the Brightmart go-live. Databases and messaging run. Today the four file transfers: supplier stock files over SFTP, the POS till exports on the old FTP server, the daily customer export to Azure Blob Storage and the scanner files of the Dublin warehouse on Azure Files. Each gets its own login or SAS with the least rights, a test file that arrives, and a bad file that ends up in an error folder, not lost.`,
  start: () => part4Start(),
  steps: [
    { title: 'Read the file transfer handover', how: 'Open the Inbox from the menu under Lab tools. Note per transfer the user or SAS, the folders, the rights and the alert address.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `SFTP: the user ${SFTP_USER} with a key pair and three folders`,
      how: `SFTP and FTP from the console menu, ${SFTP_HOST}, Server tab, Add user: ${SFTP_USER}, Home folder ${SFTP_HOME}, Password empty, Save. Edit, Make a new key pair, Save. Edit again: under Write pick Only the folders ticked and tick ${SFTP_IN}, ${SFTP_ARCHIVE} and ${SFTP_ERROR}. Save.`,
      done: p4.sftpRights,
    },
    {
      title: `SFTP: deploy ${SFTP_APP} and see the Brightline file loaded`,
      how: `Deploy ${SFTP_APP} with sftp.host ${SFTP_HOST}, sftp.port 22, sftp.user ${SFTP_USER}, sftp.inDir ${SFTP_IN}, sftp.moveToDirectory ${SFTP_ARCHIVE}, sftp.errorDir ${SFTP_ERROR}, sftp.timeBetweenSizeCheck 5, sftp.knownHosts with the known_hosts line from the Server tab, and sftp.identityFile with the name of the key file, Protect. Move the clock 2 minutes: the log shows 4 stock lines from ${SFTP_GOOD}, and the file is in ${SFTP_ARCHIVE}.`,
      done: p4.sftpLoaded,
    },
    {
      title: 'SFTP: a bad file goes to the error folder',
      how: `In the client, Quickconnect to ${SFTP_HOST} as ${SFTP_USER} with the new key file and trust the host key. Upload ${SFTP_BAD} from the local site to ${SFTP_IN}. Move the clock 2 minutes: the log warns about line 3 and the file is in ${SFTP_ERROR}.`,
      done: p4.sftpRejected,
    },
    ask(
      'Key and known_hosts',
      `Why does ${SFTP_APP} log in with a key pair and check the host key against known_hosts?`,
      [
        'SFTP servers do not accept passwords',
        'The key proves who the app is without a password that can be guessed, phished or typed into a ticket, and the private key never leaves the app. known_hosts proves the server is the real one: without it, someone between the app and the server could pose as it and read every stock file',
        'known_hosts makes the transfer faster',
        'A key pair is needed to write to the archive folder',
      ],
      1,
      'Both ends prove themselves: the client with its key, the server with its host key. Turning off host key checking is the classic shortcut that opens the door to a man in the middle.',
    ),
    {
      title: `FTP: the user ${FTP_USER}, three folders and the passive ports`,
      how: `SFTP and FTP, pick ${FTP_HOST}, Server tab, Add user: ${FTP_USER}, Home folder ${FTP_HOME}, a password. Edit: Write on Only the folders ticked, ${FTP_OUTBOX}, ${FTP_DONE} and ${FTP_ERROR}. Then Data connections: keep passive ports 50000 to 50100 and tick The firewall of the server lets these ports in. Save.`,
      done: p4.ftpReady,
    },
    {
      title: `FTP: deploy ${FTP_APP}, a binary zip in, a damaged zip out`,
      how: `Deploy ${FTP_APP} with ftp.host ${FTP_HOST}, ftp.port 21, ftp.user ${FTP_USER}, ftp.passive true, ftp.transferMode BINARY, ftp.inDir ${FTP_OUTBOX}, ftp.doneDir ${FTP_DONE}, ftp.errorDir ${FTP_ERROR} and ftp.password protected. In the client, Quickconnect as ${FTP_USER}, Transfer type Binary, upload ${FTP_GOOD} to ${FTP_OUTBOX} and move the clock 5 minutes: it is in ${FTP_DONE} with its 18 KB. Then Transfer type ASCII, upload ${FTP_BAD}, move the clock 5 minutes: COMPRESSION:INVALID_ARCHIVE, and the zip is in ${FTP_ERROR}.`,
      done: (s) => p4.ftpLoaded(s) && p4.ftpRejected(s),
    },
    {
      title: `Blob: the container ${BLOB_CONTAINER}, its SAS and the firewall`,
      how: `Azure Blob Storage from the console menu, ${BLOB_ACCOUNT}, Containers, + Container: ${BLOB_CONTAINER}, Private. Shared access signature: scope Container ${BLOB_CONTAINER}, Permissions Create and Write only, expiry after 30 days, key1, Generate SAS and connection string, copy the SAS token. Networking: keep Enabled from selected virtual networks and IP addresses and ${OFFICE}, add ${DEFAULT_EGRESS}, Save.`,
      done: p4.blobReady,
    },
    {
      title: `Blob: the SAS in ${VAULT}, then deploy and export`,
      how: `Azure Key Vault, ${VAULT}, Secrets, Generate/Import: ${BLOB_SECRET} with the SAS token, Content type SAS token. Access policies, Create: Principal ${BLOB_APP}, Secret permissions Get only. Deploy ${BLOB_APP} with blob.account ${BLOB_ACCOUNT}, blob.container ${BLOB_CONTAINER}, blob.prefix ${BLOB_PREFIX}, kv.name ${VAULT}, kv.secret.name ${BLOB_SECRET}, kv.client.id ${BLOB_CLIENT} and kv.client.secret protected; no SAS in the properties. Schedules, ${BLOB_FLOW}, Run: the export is in ${BLOB_PREFIX}/ and C-1043, whose email is not valid, is in ${BLOB_PREFIX}/rejects.`,
      done: p4.blobExported,
    },
    ask(
      'A SAS with Create and Write',
      `Why does ${BLOB_APP} get a container SAS with Create and Write, from the vault, and not the account key?`,
      [
        'The account key does not work from CloudHub',
        'The account key opens every container, share, queue and table of the account with every right, and only a key rotation takes it back. The SAS reaches one container, can only add blobs, and ends on its expiry. In the vault it is read at run time, so a new SAS needs no redeploy',
        'A SAS is faster than the account key',
        'The account key cannot write blobs',
      ],
      1,
      'Least privilege for storage: the narrowest scope, the fewest permissions, a limited lifetime. The firewall rule for the CloudHub egress address is a second gate: a leaked SAS still fails from anywhere else.',
    ),
    {
      title: `Files: the share ${FILES_SHARE}, its folders and its SAS`,
      how: `Azure Files from the console menu, ${FILES_ACCOUNT}, File shares, + File share: ${FILES_SHARE}, Quota (GiB) 50. Open it, Add directory: picks, scans, errors. Shared access signature: scope File share ${FILES_SHARE}, Permissions Read, Write, List and Create, expiry after 30 days, key1, Generate SAS and connection string.`,
      done: p4.filesReady,
    },
    {
      title: `Files: deploy ${FILES_APP} and see both kinds of scan`,
      how: `Deploy ${FILES_APP} with share.account ${FILES_ACCOUNT}, share.name ${FILES_SHARE}, share.picksDir picks, share.scansDir scans, share.errorDir errors and share.sas protected. Schedules, ${FILES_PICKS}, Run: a pick list lands in picks. In ${FILES_SHARE}, scans, Upload ${SCAN_GOOD}, move the clock a minute: 3 bin counts booked. Upload ${SCAN_BAD}, move the clock a minute: it is copied to errors and not booked.`,
      done: p4.filesFlow,
    },
    {
      title: 'Alert the owner of each transfer',
      how: `Monitoring, Alerts, Create Alert, Message Error Count Above 0: ${SFTP_APP} to ${SUPPLY_INT}, ${FTP_APP} to ${STORE_SYSTEMS}, ${BLOB_APP} to ${CRM_TEAM}, ${FILES_APP} to ${WAREHOUSE_IT}.`,
      done: (s) => alerted(s, SFTP_APP, SUPPLY_INT) && alerted(s, FTP_APP, STORE_SYSTEMS) && alerted(s, BLOB_APP, CRM_TEAM) && alerted(s, FILES_APP, WAREHOUSE_IT),
    },
  ],
  why: 'Each file transfer got its own identity with the least rights: a key pair SFTP user with write on three folders, an FTP user limited to the export folders with passive ports open in the firewall, a container SAS with Create and Write kept in the key vault behind a storage firewall, and a share SAS without Delete. The apps check what they connect to (known_hosts), wait until a file is complete, use binary mode for zips, and move every file after reading it: to an archive or done folder when it was good, to an error folder with the reason when it was not. The owners get an alert, so a bad file is seen and replayed, never silently lost or read twice.',
  docs: `${DOCS}sftp-connector/latest/`,
  solve(start) {
    let s = mark(start, 'inbox')
    s = addServerUser(s, SFTP_HOST, SFTP_USER, { home: SFTP_HOME })
    const k = newUserKey(s, SFTP_HOST, SFTP_USER)
    s = setServerUser(k.state, SFTP_HOST, SFTP_USER, { writeDirs: [SFTP_IN, SFTP_ARCHIVE, SFTP_ERROR] }, { who: 'admin' })
    s = deploy(s, SFTP_APP, { 'sftp.host': SFTP_HOST, 'sftp.port': '22', 'sftp.user': SFTP_USER, 'sftp.inDir': SFTP_IN, 'sftp.moveToDirectory': SFTP_ARCHIVE, 'sftp.errorDir': SFTP_ERROR, 'sftp.timeBetweenSizeCheck': '5', 'sftp.knownHosts': knownHostsLine(SFTP_HOST, p4.sftp(s)) }, { 'sftp.identityFile': k.file })
    s = advance(s, 2 * MINUTE)
    s = transfer(s, { direction: 'upload', host: SFTP_HOST, auth: { user: SFTP_USER, key: k.file }, local: SFTP_BAD, remote: `${SFTP_IN}/${SFTP_BAD}` }).state
    s = advance(s, 2 * MINUTE)
    s = addServerUser(s, FTP_HOST, FTP_USER, { home: FTP_HOME, password: FTP_PASSWORD, writeDirs: [FTP_OUTBOX, FTP_DONE, FTP_ERROR] })
    s = setServerSettings(s, FTP_HOST, { passive: { from: 50000, to: 50100, open: true } })
    s = deploy(s, FTP_APP, { 'ftp.host': FTP_HOST, 'ftp.port': '21', 'ftp.user': FTP_USER, 'ftp.passive': 'true', 'ftp.transferMode': 'BINARY', 'ftp.inDir': FTP_OUTBOX, 'ftp.doneDir': FTP_DONE, 'ftp.errorDir': FTP_ERROR }, { 'ftp.password': FTP_PASSWORD })
    const auth = { user: FTP_USER, password: FTP_PASSWORD, port: 21, passive: true }
    s = transfer(s, { direction: 'upload', host: FTP_HOST, auth: { ...auth, transferMode: 'BINARY' }, local: FTP_GOOD, remote: `${FTP_OUTBOX}/${FTP_GOOD}` }).state
    s = advance(s, 6 * MINUTE)
    s = transfer(s, { direction: 'upload', host: FTP_HOST, auth: { ...auth, transferMode: 'ASCII' }, local: FTP_BAD, remote: `${FTP_OUTBOX}/${FTP_BAD}` }).state
    s = advance(s, 6 * MINUTE)
    s = addContainer(s, BLOB_ACCOUNT, BLOB_CONTAINER, 'Private')
    const made = createSas(s, BLOB_ACCOUNT, { services: 'b', box: BLOB_CONTAINER, perms: 'cw', expires: s.clock + 30 * DAY_MS, key: 'key1' })
    s = setNetwork(made.state, 'storage', BLOB_ACCOUNT, { mode: 'Selected networks', ips: [OFFICE, DEFAULT_EGRESS] })
    s = addSecretVersion(s, VAULT, BLOB_SECRET, `?${made.token}`, { contentType: 'SAS token' })
    s = setVaultAccess(s, VAULT, BLOB_APP, ['get'])
    s = deploy(s, BLOB_APP, { 'blob.account': BLOB_ACCOUNT, 'blob.container': BLOB_CONTAINER, 'blob.prefix': BLOB_PREFIX, 'kv.name': VAULT, 'kv.secret.name': BLOB_SECRET, 'kv.client.id': BLOB_CLIENT }, { 'kv.client.secret': BLOB_CLIENT_SECRET })
    s = mark(runNow(s, BLOB_APP, BLOB_FLOW), `blob:${BLOB_ACCOUNT}`)
    s = addShare(s, FILES_ACCOUNT, FILES_SHARE, 50)
    for (const d of FILES_DIRS) s = makeDir(s, `share:${FILES_ACCOUNT}/${FILES_SHARE}`, d)
    const fsas = createSas(s, FILES_ACCOUNT, { services: 'f', box: FILES_SHARE, perms: 'rwlc', expires: s.clock + 30 * DAY_MS, key: 'key1' })
    s = deploy(fsas.state, FILES_APP, { 'share.account': FILES_ACCOUNT, 'share.name': FILES_SHARE, 'share.picksDir': 'picks', 'share.scansDir': 'scans', 'share.errorDir': 'errors' }, { 'share.sas': `?${fsas.token}` })
    s = runNow(s, FILES_APP, FILES_PICKS)
    s = advance(putFile(s, `share:${FILES_ACCOUNT}/${FILES_SHARE}`, `scans/${SCAN_GOOD}`, SCAN_GOOD_CSV), 2 * MINUTE)
    s = advance(putFile(s, `share:${FILES_ACCOUNT}/${FILES_SHARE}`, `scans/${SCAN_BAD}`, SCAN_BAD_CSV), 2 * MINUTE)
    s = errorAlert(s, SFTP_APP, SUPPLY_INT, 'Brightline stock intake failed')
    s = errorAlert(s, FTP_APP, STORE_SYSTEMS, 'POS export intake failed')
    s = errorAlert(s, BLOB_APP, CRM_TEAM, 'Customer export failed')
    return errorAlert(s, FILES_APP, WAREHOUSE_IT, 'Scanner share sync failed')
  },
  answers: { 4: 1, 9: 1 },
}

// ==================== Part 5: Salesforce, SAP, mail and EDI ====================

const SF_ORG = 'Sandbox'
const SF_CERT = 'brightmart-loyalty-jwt-2027'
const SF_PROFILE = 'Brightmart Integration User'
const SF_LOYALTY_USER = 'mule.loyalty@brightmart.example.uat'
const SF_OLD_USERS = ['mule.integration@brightmart.example.uat', 'amira.lund@brightmart.example.uat', 'sales.ops@brightmart.example.uat']
const SF_FIELDS = ['Brightmart_Customer_Id__c', 'Loyalty_Tier__c']
const SF_PERMSET = 'Loyalty_Sync_Integration'
const SF_CAPP = 'Brightmart Loyalty Sync'
const RFC_PASSWORD = 'Rfc-Brightmart-2611' // the made-up lab value the System APIs of the estate use for MULE_RFC
const MAIL_TEST = 'qa-shop@brightmart.example'
const MAIL_PASSWORD = 'Webshop-Mailbox-2611' // a made-up lab value
const SERVICE_DESK = 'service-desk@brightmart.example'
const B2B_ID = 'bayside-foods'
const B2B_SIGN = 'bayside-sign-2026'
const B2B_ENC = 'bayside-enc-2026'
const B2B_AS2 = 'BAYSIDE-AS2'
const B2B_URL = 'https://as2.bayside-foods.example/as2'
const CRM_INT = 'crm-integration@brightmart.example'
const SAP_TEAM = 'sap-basis@brightmart.example'

const p5 = {
  org: (s) => sfOrgOf(s, SF_ORG),
  y: (s) => s.sap ?? {},
  box: (s) => s.mailServer?.accounts?.[MAIL_BOX],
  partner: (s) => partnerOf(s.b2b, B2B_ID),
}
p5.newUser = (s) => (p5.org(s)?.users ?? []).find((u) => u.profile === SF_PROFILE && !SF_OLD_USERS.includes(u.username))
p5.grants = (o, p) => {
  const h = o?.permsets?.[p]
  if (!h?.apiEnabled) return false
  const fake = { username: '-', profile: '-', permsets: [p] }
  return ['R', 'C', 'E'].every((c) => sfObjectAccess(o, fake, 'Account').includes(c)) && SF_FIELDS.every((f) => sfFieldAccess(o, fake, 'Account', f) === 'edit')
}
p5.sfUserOk = (s) => {
  const u = p5.newUser(s)
  return Boolean(u) && sfApiEnabled(p5.org(s), u) && (u.permsets ?? []).some((p) => p !== 'Brightmart_Mule_Integration' && p5.grants(p5.org(s), p))
}
p5.capp = (s) => (p5.org(s)?.connectedApps ?? []).find((a) => a.oauth && a.certificate?.name === SF_CERT && a.scopes.includes('Manage user data via APIs (api)'))
p5.approved = (s) => {
  const a = p5.capp(s)
  const u = p5.newUser(s)
  return Boolean(a && u) && a.permittedUsers === 'Admin approved users are pre-authorized' && (a.profiles.includes(u.profile) || (u.permsets ?? []).some((p) => a.permsets.includes(p)))
}
p5.sfDeployed = (s) => {
  const a = app(s, SF_APP)
  const p = a?.props ?? {}
  const url = (k) => String(p[k] ?? '').trim().replace(/\/$/, '')
  return a?.status === 'Running' && String(p['salesforce.auth']).trim() === 'jwt' && url('salesforce.url') === 'https://test.salesforce.com' && url('salesforce.audienceUrl') === 'https://test.salesforce.com' && String(p['salesforce.consumerKey'] ?? '').trim() === p5.capp(s)?.consumerKey && String(p['salesforce.keyStore'] ?? '').includes(SF_CERT) && String(p['salesforce.principal'] ?? '').trim().toLowerCase() === p5.newUser(s)?.username && Boolean(a.secrets?.['salesforce.keyStorePassword']) && !('salesforce.keyStorePassword' in p)
}
p5.sfSynced = (s) => {
  const x = app(s, SF_APP)?.schedules.find((y) => y.flow === SF_TEST)?.last
  return p5.sfDeployed(s) && Boolean(x?.ok) && Boolean(s.seen['sf:accounts'] || s.seen['sf:soql']) && SF_MEMBERS.every((m) => (p5.org(s)?.records.Account ?? []).some((r) => r.Brightmart_Customer_Id__c === m.Brightmart_Customer_Id__c && r.Loyalty_Tier__c === m.Loyalty_Tier__c && r.LastModifiedBy === p5.newUser(s)?.username))
}
const word5 = (v) => String(v ?? '').trim()
p5.rfcUser = (s) => p5.y(s).users?.[SAP_RFC_USER]
p5.gwOk = (d) => word5(d.gwhost).toLowerCase() === SAP_HOST && [SAP_GW_SERVICE, '3300'].includes(word5(d.gwserv).toLowerCase())
p5.dest = (s) => (p5.y(s).dests ?? []).find((d) => d.type === 'T' && d.programId === SAP_PROGRAM_ID && p5.gwOk(d))
p5.port = (s) => p5.dest(s) && (p5.y(s).ports ?? []).find((p) => p.dest === p5.dest(s).name)
p5.alePartnerOk = (s) => {
  const p = sapPartnerOf(p5.y(s), SAP_WEB_PARTNER)
  return Boolean(p && p5.port(s) && p.inbound.some((r) => r.mestyp === 'ORDERS' && r.process === 'ORDE') && p.outbound.some((r) => r.mestyp === 'INVOIC' && r.idoctp === 'INVOIC02' && r.port === p5.port(s).name))
}
p5.sapDeployed = (s) => {
  const a = app(s, SAP_BRIDGE)
  const p = a?.props ?? {}
  return a?.status === 'Running' && word5(p['sap.applicationServerHost']).toLowerCase() === SAP_HOST && word5(p['sap.systemNumber']) === '00' && word5(p['sap.client']) === SAP_CLIENT && word5(p['sap.username']).toUpperCase() === SAP_RFC_USER && a.secrets?.['sap.password'] === p5.rfcUser(s)?.password && p['sap.password'] === undefined && word5(p['sap.gatewayHost']).toLowerCase() === SAP_HOST && [SAP_GW_SERVICE, '3300'].includes(word5(p['sap.gatewayService']).toLowerCase()) && word5(p['sap.programId']) === SAP_PROGRAM_ID
}
p5.sapFlow = (s) => p5.sapDeployed(s) && Boolean(s.sap && sapRegistration(s, s.sap, SAP_PROGRAM_ID, s.clock)?.app === SAP_BRIDGE) && Boolean(s.seen['sap:WE02']) && (p5.y(s).idocs ?? []).some((d) => d.dir === 'in' && d.mestyp === 'ORDERS' && d.sndprn === SAP_WEB_PARTNER && d.status === '53')
p5.appPasswords = (s) => (p5.box(s)?.appPasswords ?? []).map((x) => x.value)
p5.mailboxOk = (s) => Boolean(p5.box(s)) && ['Processed', 'Error'].every((f) => Array.isArray(p5.box(s).folders[f])) && Boolean(p5.box(s).appOnly) && p5.appPasswords(s).length > 0
p5.mailConfig = (s) => {
  const x = app(s, MAIL_APP)
  if (x?.status !== 'Running' || !p5.box(s)) return false
  const p = x.props
  const sec = x.secrets ?? {}
  const pass = (k) => p5.appPasswords(s).includes(sec[k]) && sec[k] !== p5.box(s).password && !(k in p)
  return p['smtp.host'] === MAIL_HOST && String(p['smtp.port']) === '587' && String(p['smtp.starttls']).toLowerCase() === 'true' && (p['smtp.protocol'] ?? 'smtp') === 'smtp' && p['smtp.user'] === MAIL_BOX && pass('smtp.password') && p['imap.host'] === MAIL_HOST && String(p['imap.port']) === '993' && (p['imap.protocol'] ?? 'imaps') === 'imaps' && p['imap.user'] === MAIL_BOX && pass('imap.password')
}
p5.mailSent = (s) => {
  const sent = app(s, MAIL_APP)?.store?.sent ?? []
  const inbox = s.mailServer?.accounts?.[MAIL_TEST]?.folders?.INBOX ?? []
  return p5.mailConfig(s) && Boolean(s.seen[`mail-test:${MAIL_APP}:smtp`] && s.seen[`mail-test:${MAIL_APP}:imap`]) && called(s, MAIL_APP, 202, 'POST', /\/confirmation$/) && sent.some((x) => x.to === MAIL_TEST && inbox.some((m) => m.messageId === x.messageId && m.flags.includes('\\Seen')))
}
p5.mailSorted = (s) => {
  const st = app(s, MAIL_APP)?.store ?? {}
  const folder = (name) => p5.box(s)?.folders?.[name] ?? []
  return (st.returns ?? []).some((r) => folder('Processed').some((m) => m.messageId === r.mid) && !folder('INBOX').some((m) => m.messageId === r.mid)) && (st.parked ?? []).some((p) => folder('Error').some((m) => m.messageId === p.mid))
}
p5.ep = (s) => p5.partner(s)?.as2
p5.partnerOk = (s) => p5.partner(s)?.isaQual === '01' && p5.partner(s)?.isaId === '987654321' && p5.partner(s)?.gsId === 'BAYSIDE' && Boolean(b2bCertOf(s.b2b, B2B_SIGN) && b2bCertOf(s.b2b, B2B_ENC)) && p5.ep(s)?.as2Id === B2B_AS2 && p5.ep(s)?.url === B2B_URL && p5.ep(s)?.signCert === B2B_SIGN && p5.ep(s)?.encCert === B2B_ENC && p5.ep(s)?.mdn === 'sync' && p5.ep(s)?.mdnSigned === true
p5.flow = (s) => b2bFlowsOf(s.b2b).find((f) => f.partner === B2B_ID && f.dir === 'inbound' && f.type === '850')
p5.b2bFlow = (s) => {
  const f = p5.flow(s)
  const tx = b2bTxOf(s.b2b).find((t) => t.dir === 'in' && t.partner === B2B_ID && t.type === '850' && t.status === 'Acknowledged' && t.ack?.code === 'A' && b2bMdnOk(t.as2?.mdn))
  return running(s, B2B_APP) && Boolean(f?.validate && f.target?.app === B2B_APP && f.ack997 && (f.alerts?.rejected997 || f.alerts?.negativeMdn) && f.alerts?.to?.trim()) && b2bFlowStatus(f) === 'Running' && Boolean(tx && app(s, B2B_APP)?.store?.orders?.[tx.ref])
}

function part5Start() {
  const clock = at(5, 8, 55)
  const s = nextDay(solvedOf(part4), 5, {
    jars: [SF_APP, jarOf(SAP_BRIDGE), MAIL_APP, B2B_APP],
    mail: [
      {
        subject: 'Go-live part 5: Salesforce, SAP, mail and EDI',
        body: [
          'Good morning. Today the core business systems. The System APIs of part 9 log on with the integration users that exist: mule.integration in the Salesforce sandbox, MULE_RFC in SAP, no-reply on the mail server. Today we add the integrations that run next to them.',
          `Salesforce, the sandbox org (test.salesforce.com, users end in .uat). ${SF_APP} sends the loyalty members as Accounts, upserted on Brightmart_Customer_Id__c. It logs on with OAuth JWT bearer as a new API only user ${SF_LOYALTY_USER} (profile ${SF_PROFILE}) through a connected app ${SF_CAPP} with the certificate ${SF_CERT}. The user may read, create and edit Account and edit the two loyalty fields, nothing more. Alerts to ${CRM_INT}.`,
          `SAP HRP client ${SAP_CLIENT} on ${SAP_HOST}. Basis wants a System user ${SAP_RFC_USER} with the password ${RFC_PASSWORD} from the vault ticket: the System APIs and ${SAP_BRIDGE} share it. ${SAP_BRIDGE} is the IDoc bridge of the web shop: it registers program ID ${SAP_PROGRAM_ID} at the gateway ${SAP_GW_SERVICE}, posts ORDERS IDocs from the logical system ${SAP_WEB_PARTNER} and receives INVOIC02. Alerts to ${SAP_TEAM}.`,
          `Mail server ${MAIL_HOST}. ${MAIL_APP} sends the order confirmations from ${MAIL_BOX} and reads what customers write to it: a new mailbox with the folders Processed and Error and its own app password, SMTP on 587 with STARTTLS and IMAPS on 993. QA reads ${MAIL_TEST}. Alerts to ${SERVICE_DESK}.`,
          `EDI. Bayside Foods sends purchase orders as X12 850 over AS2: ISA qualifier 01, ISA ID 987654321, GS ID BAYSIDE, AS2 ID ${B2B_AS2}, URL ${B2B_URL}, signing certificate ${B2B_SIGN} and encryption certificate ${B2B_ENC}, synchronous signed MDN. Each 850 is validated, answered with a 997 and goes to ${B2B_APP}. Alerts to ${OPS}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  // the systems handed over today. Lab simplification: both Salesforce orgs exist from the start, the go-live uses the sandbox.
  const sandbox = newOrg('Sandbox', { certificates: [{ name: SF_CERT, expires: Date.UTC(2027, 10, 30) - SF_BASE }] })
  s.salesforce = newSalesforce({ created: clock, orgs: { Production: newOrg('Production'), Sandbox: sandbox } })
  for (const org of ['Sandbox', 'Production']) {
    for (const [name, hc, tier, city, country, email] of BRIGHTMART_CUSTOMERS) {
      const [acc] = seedAccounts(s, org, [{ Name: name, Type: 'Customer', BillingCity: city, BillingCountry: country, Brightmart_Customer_Id__c: hc, Loyalty_Tier__c: tier }])
      const [first, last] = name.split(' ')
      if (acc?.id) seedAccounts(s, org, [{ FirstName: first, LastName: last, Email: email, AccountId: acc.id }], 'Contact')
    }
  }
  const y = newSapSystem(clock)
  delete y.users[SAP_RFC_USER]
  y.dests = y.dests.filter((d) => d.type === '3')
  y.ports = []
  y.partners = []
  y.logsys = [`${SAP_SID}CLNT${SAP_CLIENT}`]
  y.idocs = []
  y.trfc = []
  y.materials['H-100'] = { text: 'Brightmart Oat Milk 1L', plant: '1000', sloc: '0001', unrestricted: 340, lockedBy: null }
  s.sap = y
  const m = defaultMailServer(clock)
  m.accounts[MAIL_TEST] = newMailAccount('QA shop', 'Qa-Shop-Lab-2611')
  m.feeds = [
    {
      to: MAIL_BOX,
      every: 5,
      at: clock + 10 * MINUTE,
      n: 1,
      mails: [
        { from: 'Mia Jansen <mia@tidewater-mail.example>', subject: 'Return for my order', text: 'Hello,\nOrder: O-1005\nReason: The jacket is too small.\nMia' },
        { from: 'Sara Lind <sara@northpost.example>', subject: 'Where is my parcel?', text: 'Hello, I ordered last week and nothing came yet. Can you look?\nSara' },
      ],
    },
  ]
  s.mailServer = m
  const b = fillB2b({ created: clock })
  const line = (qty, uom, price, part, item, desc) => ({ qty, uom, price, part, item, desc })
  b.offered = [
    { ...newB2bCert(B2B_SIGN, B2B_ID, 'Signing', 'as2.bayside-foods.example', at(-20), at(345)), note: 'Sent by Bayside Foods with the onboarding sheet' },
    { ...newB2bCert(B2B_ENC, B2B_ID, 'Encryption', 'as2.bayside-foods.example', at(-20), at(345)), note: 'Sent by Bayside Foods with the onboarding sheet' },
  ]
  // lab made: what Bayside Foods really uses. Its test 850 is built from this, whatever Brightmart typed in.
  b.prospects = { [B2B_ID]: { id: B2B_ID, name: 'Bayside Foods', isaQual: '01', isaId: '987654321', gsId: 'BAYSIDE', as2Id: B2B_AS2, signCert: B2B_SIGN, test: { po: 'BF-10001', vendor: 'BF-VENDOR-12', lines: [line(48, 'EA', '2.10', 'BF-501', 'H-400', 'Oat biscuits 200 g'), line(5, 'CA', '36.00', 'BF-620', 'H-410', 'Sparkling water case of 24')] } } }
  s.b2b = b
  return s
}

const part5 = {
  id: 'p-golive-5',
  group: 'Brightmart go-live',
  title: 'Go-live part 5: Salesforce, SAP, mail and EDI',
  minutes: 60,
  scenario: `Day 5 of the Brightmart go-live. Databases, messaging and files run. Today the core business systems: the Salesforce sandbox for the loyalty sync, SAP for the IDoc bridge and the RFC user the System APIs share, the mail server for the order confirmations, and Partner Manager for the first EDI partner, Bayside Foods. Each gets its integration identity, its app, a proof that data arrives in the system's own screen, and an alert.`,
  start: () => part5Start(),
  steps: [
    { title: 'Read the handover of the business systems', how: 'Open the Inbox from the menu under Lab tools. Note the users, the certificate, the program ID, the mailbox and the EDI identifiers.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Salesforce: the API only user ${SF_LOYALTY_USER}`,
      how: `Salesforce from the console menu, org Sandbox. Users, New User: Last Name Loyalty Sync, Username ${SF_LOYALTY_USER}, Profile ${SF_PROFILE}, a password of at least 8 characters. Save. Permission Sets, New: Label Loyalty Sync Integration, API Name ${SF_PERMSET}. Tick API Enabled, Read, Create and Edit on Account, and Read Access and Edit Access on ${SF_FIELDS.join(' and ')}. Then Users, on ${SF_LOYALTY_USER} choose ${SF_PERMSET} and Add Assignment.`,
      done: p5.sfUserOk,
    },
    {
      title: `Salesforce: the connected app ${SF_CAPP}`,
      how: `App Manager, New Connected App. Name ${SF_CAPP}, a Contact Email, Enable OAuth Settings, the certificate ${SF_CERT}.crt for Use digital signatures, scope Manage user data via APIs (api). Save. OAuth Policies: Permitted Users Admin approved users are pre-authorized, and tick the permission set Loyalty Sync Integration. Manage Consumer Details shows the consumer key.`,
      done: p5.approved,
    },
    {
      title: `Salesforce: deploy ${SF_APP} and see the members`,
      how: `Deploy ${SF_APP} with salesforce.auth jwt, salesforce.url https://test.salesforce.com, salesforce.audienceUrl https://test.salesforce.com, salesforce.consumerKey the consumer key, salesforce.keyStore ${SF_CERT}.jks, salesforce.principal ${SF_LOYALTY_USER} and salesforce.keyStorePassword protected. Schedules, ${SF_TEST}, Run: connection is valid. Move the clock 6 minutes and open Salesforce, Accounts: ${SF_MEMBERS.map((m) => m.Name).join(', ')} are there with their tiers.`,
      done: p5.sfSynced,
    },
    ask(
      'JWT bearer, not a password',
      `Why does ${SF_APP} log on with the JWT bearer flow and a certificate, and not with a username, password and security token?`,
      [
        'Salesforce no longer accepts passwords from apps',
        'The app signs a short token with its private key; Salesforce checks it against the certificate of the connected app. No password expires or gets reset, no token is mailed, and the admin controls exactly which users the app may act as by pre-authorizing them. Revoking the connected app stops it at once',
        'JWT is faster than the SOAP login',
        'Only JWT can read custom fields',
      ],
      1,
      'For server to server integration Salesforce recommends the OAuth 2.0 JWT bearer flow. The audience is test.salesforce.com for a sandbox and login.salesforce.com for Production, so the value changes per environment like the username suffix.',
    ),
    {
      title: `SAP: the RFC user ${SAP_RFC_USER}`,
      how: `SAP from the console menu. Command field SU01, Create user: ${SAP_RFC_USER}, user type System, initial password ${RFC_PASSWORD} from the vault ticket. Create. A System user cannot log on with the SAP GUI and its password does not expire.`,
      done: (s) => p5.rfcUser(s)?.type === 'System' && p5.rfcUser(s).password === RFC_PASSWORD,
    },
    {
      title: 'SAP: destination, port and partner profile',
      how: `SM59, Create: connection type T, Registered Server Program, program ID ${SAP_PROGRAM_ID}, gateway host ${SAP_HOST}, gateway service ${SAP_GW_SERVICE}. WE21, Transactional RFC, Create: MULEPORT on that destination. BD54: logical system ${SAP_WEB_PARTNER}. WE20: partner ${SAP_WEB_PARTNER} of type LS with inbound ORDERS, process code ORDE, trigger immediately, and outbound INVOIC, basic type INVOIC02, to MULEPORT.`,
      done: p5.alePartnerOk,
    },
    {
      title: `SAP: deploy ${SAP_BRIDGE} and post a test ORDERS05`,
      how: `Deploy ${SAP_BRIDGE} (file ${SAP_BRIDGE_JAR}) with sap.applicationServerHost ${SAP_HOST}, sap.systemNumber 00, sap.client ${SAP_CLIENT}, sap.username ${SAP_RFC_USER}, sap.gatewayHost ${SAP_HOST}, sap.gatewayService ${SAP_GW_SERVICE}, sap.programId ${SAP_PROGRAM_ID}, sap.connectionCount 2 and sap.password protected. SMGW shows the program registered. API client: POST /orders with {"customer":"4712","material":"H-1300","qty":2}. WE02, Execute: the ORDERS IDoc of ${SAP_WEB_PARTNER} has status 53.`,
      done: p5.sapFlow,
    },
    {
      title: 'SAP: an INVOIC02 reaches Mule',
      how: `Command field WE19, Outbound test: partner ${SAP_WEB_PARTNER}, message type INVOIC, Send outbound IDoc. Move the clock 2 minutes: the IDoc goes to 12, and the log of ${SAP_BRIDGE} says INVOIC02 received.`,
      done: (s) => p5.sapFlow(s) && (app(s, SAP_BRIDGE)?.store?.invoices ?? []).length > 0,
    },
    {
      title: `Mail: the mailbox ${MAIL_BOX} with its own app password`,
      how: `Mail server from the console menu, Accounts, New account: ${MAIL_BOX}, Display name Brightmart Webshop, a password of at least 10 characters. Mail, Mailbox ${MAIL_BOX}: create the folders Processed and Error. Accounts, row ${MAIL_BOX}: under App passwords type ${MAIL_APP} and Create, copy the value, and clear Main password works.`,
      done: p5.mailboxOk,
    },
    {
      title: `Mail: deploy ${MAIL_APP} and send a test confirmation`,
      how: `Deploy ${MAIL_APP} with smtp.host ${MAIL_HOST}, smtp.port 587, smtp.starttls true, smtp.user ${MAIL_BOX}, imap.host ${MAIL_HOST}, imap.port 993, imap.protocol imaps, imap.user ${MAIL_BOX}, and smtp.password and imap.password protected with the app password. Mail server, In the Mule app: Test connection for smtp and imap. API client: POST /orders/O-1007/confirmation with {"email":"${MAIL_TEST}","name":"QA shop"}, then open the mail in the webmail of ${MAIL_TEST}.`,
      done: p5.mailSent,
    },
    {
      title: 'Mail: customer mails sorted, none lost',
      how: `Move the clock 15 minutes. Customers write to ${MAIL_BOX}. A return request is logged and moved to Processed; a mail without an order line goes to Error for the service desk. Nothing is deleted and nothing stays unread in INBOX.`,
      done: p5.mailSorted,
    },
    {
      title: 'EDI: Bayside Foods as a partner with its AS2 endpoint',
      how: `Partner Manager from the console menu, Partners, New partner: Bayside Foods, ISA qualifier 01, ISA ID 987654321, GS ID BAYSIDE. Certificates: Import ${B2B_SIGN} and ${B2B_ENC}. Partners, Bayside Foods, AS2 endpoint: Partner AS2 identifier ${B2B_AS2}, URL ${B2B_URL}, the two certificates, MDN Synchronous, Signed MDN. Save endpoint.`,
      done: p5.partnerOk,
    },
    {
      title: 'EDI: the 850 flow to the order API, and a test 850',
      how: `Deploy ${B2B_APP} (no properties). Partner Manager, Message flows, New message flow: Bayside Foods, Inbound, 850, Target ${B2B_APP}, Validate X12 ticked. Create flow. Settings: Send 997. Alerts: Alert when a 997 rejects a document and on a negative MDN, recipient ${OPS}. Deploy. Partners, Bayside Foods, Request test 850, move the clock 5 minutes: Tracking shows BF-10001 Acknowledged with a 997 A.`,
      done: p5.b2bFlow,
    },
    ask(
      'Why a 997 and a signed MDN',
      'Bayside Foods gets a signed MDN and a 997 for each 850. What does each one prove?',
      [
        'Both say the same thing twice',
        'The signed MDN proves on the transport level that Brightmart received exactly that message and could decrypt it: non repudiation for AS2. The 997 proves on the EDI level that the 850 was valid X12 and was accepted or rejected. A partner needs both to know an order is not lost',
        'The MDN confirms the order is shipped',
        'The 997 replaces the AS2 signature',
      ],
      1,
      'An AS2 MDN is a receipt for the message; a 997 functional acknowledgment is a receipt for the content. A missing 997 after a good MDN means the document arrived and was not processed: a different alert.',
    ),
    {
      title: 'Alert the owners',
      how: `Monitoring, Alerts, Create Alert, Message Error Count Above 0: ${SF_APP} to ${CRM_INT}, ${SAP_BRIDGE} to ${SAP_TEAM}, ${MAIL_APP} to ${SERVICE_DESK}.`,
      done: (s) => alerted(s, SF_APP, CRM_INT) && alerted(s, SAP_BRIDGE, SAP_TEAM) && alerted(s, MAIL_APP, SERVICE_DESK),
    },
  ],
  why: 'Each business system gets an integration identity that belongs to no person and holds only what the job needs: an API only Salesforce user with a permission set, reached through a connected app with the JWT bearer flow and a certificate; a System user in SAP with a registered RFC destination, a tRFC port and a partner profile for the IDocs; a mailbox with its own app password, STARTTLS on 587 and IMAPS on 993; and an EDI partner with its identifiers, certificates and AS2 endpoint. Each app is deployed with its secrets protected, then proven in the system screen: Accounts in Salesforce, IDoc status 53 in WE02, the mail in the webmail, the 850 acknowledged in Tracking. Bad input lands somewhere visible: the Error folder, a 997 reject, an alert.',
  docs: `${DOCS}salesforce-connector/latest/`,
  solve(start) {
    let s = mark(start, 'inbox')
    s = sfCreateUser(s, SF_ORG, { username: SF_LOYALTY_USER, name: 'Loyalty Sync', profile: SF_PROFILE, password: 'Loyalty-Sync-26' }).state
    s = createPermset(s, SF_ORG, { label: 'Loyalty Sync Integration', name: SF_PERMSET }).state
    s = setApiEnabled(s, SF_ORG, 'permset', SF_PERMSET, true)
    s = setObjectAccess(s, SF_ORG, 'permset', SF_PERMSET, 'Account', 'RCE')
    for (const f of SF_FIELDS) s = setFieldAccess(s, SF_ORG, 'permset', SF_PERMSET, 'Account', f, 'edit')
    s = assignPermset(s, SF_ORG, SF_LOYALTY_USER, SF_PERMSET)
    s = sfCreateConnectedApp(s, SF_ORG, { name: SF_CAPP, email: OPS, oauth: true, certificate: SF_CERT, scopes: ['Manage user data via APIs (api)'] }).state
    s = setConnectedApp(s, SF_ORG, SF_CAPP, { permittedUsers: 'Admin approved users are pre-authorized', permsets: [SF_PERMSET] })
    s = deploy(s, SF_APP, { 'salesforce.auth': 'jwt', 'salesforce.url': 'https://test.salesforce.com', 'salesforce.audienceUrl': 'https://test.salesforce.com', 'salesforce.consumerKey': p5.capp(s).consumerKey, 'salesforce.keyStore': `${SF_CERT}.jks`, 'salesforce.principal': SF_LOYALTY_USER }, { 'salesforce.keyStorePassword': 'lab-keystore' })
    s = runNow(s, SF_APP, SF_TEST)
    s = advance(s, 6 * MINUTE)
    s = mark(s, 'sf:accounts')
    s = sapCreateUser(s, { name: SAP_RFC_USER, type: 'System', password: RFC_PASSWORD }).state
    s = sapCreateDestination(s, { name: 'MULE_BRIGHTMART_DEST', programId: SAP_PROGRAM_ID, gwhost: SAP_HOST, gwserv: SAP_GW_SERVICE, text: 'Mule IDoc bridge' }).state
    s = sapCreatePort(s, { name: 'MULEPORT', dest: 'MULE_BRIGHTMART_DEST' }).state
    s = sapCreateLogicalSystem(s, SAP_WEB_PARTNER).state
    s = sapCreatePartner(s, SAP_WEB_PARTNER, 'Brightmart web shop').state
    s = sapAddInbound(s, SAP_WEB_PARTNER, { mestyp: 'ORDERS', process: 'ORDE', trigger: 'immediately' }).state
    s = sapAddOutbound(s, SAP_WEB_PARTNER, { mestyp: 'INVOIC', idoctp: 'INVOIC02', port: 'MULEPORT', mode: 'immediately' }).state
    s = finishDeploys(deployApp(s, { name: SAP_BRIDGE, pkg: SAP_BRIDGE, jar: SAP_BRIDGE_JAR, replicas: 1, vCores: 0.1, props: { 'sap.applicationServerHost': SAP_HOST, 'sap.systemNumber': '00', 'sap.client': SAP_CLIENT, 'sap.username': SAP_RFC_USER, 'sap.gatewayHost': SAP_HOST, 'sap.gatewayService': SAP_GW_SERVICE, 'sap.programId': SAP_PROGRAM_ID, 'sap.connectionCount': '2' }, secrets: { 'sap.password': RFC_PASSWORD } }).state)
    s = advance(s, 2 * MINUTE)
    s = mark(s, 'sap:SMGW')
    s = call(s, SAP_BRIDGE, null, '/orders', 'POST', '{"customer":"4712","material":"H-1300","qty":2}').state
    s = mark(s, 'sap:WE02')
    s = sapTestOutbound(s, SAP_WEB_PARTNER, 'INVOIC').state
    s = advance(s, 2 * MINUTE)
    s = addMailAccount(s, MAIL_BOX, 'Brightmart Webshop', MAIL_PASSWORD)
    s = webAddFolder(webAddFolder(s, MAIL_BOX, 'Processed'), MAIL_BOX, 'Error')
    s = addAppPassword(s, MAIL_BOX, MAIL_APP)
    s = setMailAccount(s, MAIL_BOX, { appOnly: true })
    const key = s.mailServer.accounts[MAIL_BOX].appPasswords[0].value
    const mprops = { 'smtp.host': MAIL_HOST, 'smtp.port': '587', 'smtp.starttls': 'true', 'smtp.user': MAIL_BOX, 'imap.host': MAIL_HOST, 'imap.port': '993', 'imap.protocol': 'imaps', 'imap.user': MAIL_BOX }
    s = deploy(s, MAIL_APP, mprops, { 'smtp.password': key, 'imap.password': key })
    const copy = () => mailboxCtx({ clock: s.clock, mailServer: structuredClone(s.mailServer) }, { name: `${MAIL_APP} (test)` })
    if (copy().send({ ...mailSmtpOf(mprops), password: key }, { from: MAIL_BOX, to: MAIL_BOX, subject: 'Test connection', text: 'Test' }).ok) s = mark(s, `mail-test:${MAIL_APP}:smtp`)
    if (copy().list({ ...mailImapOf(mprops), password: key }, 'INBOX').ok) s = mark(s, `mail-test:${MAIL_APP}:imap`)
    s = call(s, MAIL_APP, null, '/orders/O-1007/confirmation', 'POST', `{"email":"${MAIL_TEST}","name":"QA shop"}`).state
    const mid = app(s, MAIL_APP).store.sent.at(-1).messageId
    s = webOpen(s, MAIL_TEST, 'INBOX', s.mailServer.accounts[MAIL_TEST].folders.INBOX.find((m) => m.messageId === mid).uid)
    s = advance(s, 16 * MINUTE)
    s = deploy(s, B2B_APP, {})
    s = createB2bPartner(s, { name: 'Bayside Foods', isaQual: '01', isaId: '987654321', gsId: 'BAYSIDE', contact: 'edi@bayside-foods.example' })
    s = importB2bCert(importB2bCert(s, B2B_SIGN), B2B_ENC)
    s = setB2bEndpoint(s, B2B_ID, { as2Id: B2B_AS2, url: B2B_URL, signCert: B2B_SIGN, encCert: B2B_ENC, mdn: 'sync', mdnSigned: true })
    s = createB2bFlow(s, { name: 'Bayside 850 to Order API', partner: B2B_ID, dir: 'inbound', type: '850', target: B2B_APP, validate: true, ack997: false })
    const id = p5.flow(s).id
    s = setB2bFlow(s, id, { ack997: true })
    s = setB2bFlow(s, id, { alerts: { rejected997: true, negativeMdn: true, to: OPS } })
    s = deployB2bFlow(s, id)
    s = requestB2bTest(s, B2B_ID)
    s = advance(s, 5 * MINUTE)
    s = errorAlert(s, SF_APP, CRM_INT, 'Loyalty sync failed')
    s = errorAlert(s, SAP_BRIDGE, SAP_TEAM, 'IDoc bridge errors')
    return errorAlert(s, MAIL_APP, SERVICE_DESK, 'Order mailer errors')
  },
  answers: { 4: 1, 14: 1 },
}

// ==================== Part 6: Workday, ServiceNow, Dynamics and SharePoint, Shopify ====================

const WD_ISU = 'ISU_BRIGHTMART_FEED'
const WD_GROUP = 'ISSG_Worker_Feed'
const WD_REPORT = 'INT_Worker_Feed'
const WD_TEST_WORKER = '21012'
const WD_PASSWORD = 'Feed-Lab-Pass-1103' // a made-up lab value
const WD_NEED = ['Employee_ID', 'Worker', 'Email', 'Location']
const HR_INT = 'hr-integrations@brightmart.example'
const SN_SVC = 'svc_wms_alerts'
const SN_GROUP = 'Warehouse Systems'
const SN_PASSWORD = 'Wms-Bridge-2611' // a made-up lab value
const WMS_ONCALL = 'wms-oncall@brightmart.example'
const G_REG = 'brightmart-customer-bridge'
const G_ROLE = 'Brightmart Customer Bridge'
const G_SITE = 'Sales'
const G_LIB = 'Contracts'
const G_TEST = 'C-2001'
const G_BAD = 'C-2002-BRIGHTMART-NORTH-WEST'
const SHP_APP_NAME = 'Brightmart Order Bridge'
const SHP_QUEUE = 'shopify-orders'
const ECOM_INT = 'ecommerce-integration@brightmart.example'

const p6 = {
  wd: (s) => s.workday ?? {},
  sn: (s) => s.servicenow,
  g: (s) => s.msgraph,
  prop: (s, name, k) => String(app(s, name)?.props?.[k] ?? '').trim(),
}
p6.isuOk = (s) => {
  const u = p6.wd(s).isus?.[WD_ISU]
  return Boolean(u && u.noUi && !u.requireNew && (p6.wd(s).rules?.exempt ?? []).includes(WD_ISU))
}
p6.groupOk = (s) => {
  const g = p6.wd(s).groups?.[WD_GROUP]
  if (!p6.isuOk(s) || !g || g.type !== WD_GROUP_TYPE || !g.members.includes(WD_ISU) || wdGroupsOf(p6.wd(s), WD_ISU).length !== 1) return false
  const p = wdPermsOf(p6.wd(s), WD_ISU)
  const want = [WD_DOMAINS.PUBLIC, WD_DOMAINS.STAFFING, WD_DOMAINS.CONTACT]
  return Object.keys(p).length === want.length && want.every((d) => p[d]?.length === 1 && p[d][0] === 'Get')
}
p6.reportOk = (s) => {
  const r = p6.wd(s).reports?.[WD_REPORT]
  if (!r || r.source !== 'All Active Workers' || !r.ws || !r.share.includes(WD_GROUP)) return false
  const has = (name, op) => r.prompts.some((x) => x.name === name && x.field === 'Last_Functionally_Updated' && x.op === op)
  return WD_NEED.every((f) => r.fields.includes(f)) && !r.fields.includes('Annual_Salary') && !r.fields.includes('Date_of_Birth') && has('Updated_From', 'from') && has('Updated_To', 'to')
}
p6.wdDeployed = (s) => {
  const x = app(s, WD_FEED)
  if (x?.status !== 'Running') return false
  const pr = (k) => p6.prop(s, WD_FEED, k)
  return pr('workday.host') === WD_HOST && pr('workday.tenant') === WD_TENANT && [WD_ISU, `${WD_ISU}@${WD_TENANT}`].includes(pr('workday.username')) && pr('raas.owner') === WD_SCREEN_USER && pr('raas.report') === WD_REPORT && Boolean(p6.wd(s).isus?.[WD_ISU]) && x.secrets?.['workday.password'] === p6.wd(s).isus[WD_ISU].password && !x.props?.['workday.password']
}
p6.wdLoaded = (s) => {
  const st = app(s, WD_FEED)?.store ?? {}
  const f = st.first
  return p6.wdDeployed(s) && called(s, WD_FEED, 200, 'GET', /^\/health/) && Boolean(f && f.blank === 0 && f.good > 0 && f.good === wdActiveCount(p6.wd(s), f.t)) && Boolean(s.seen['wd:workers']) && (st.rejected ?? []).some((x) => x.id === WD_TEST_WORKER)
}
p6.svc = (s) => snUserOf(p6.sn(s), SN_SVC)
p6.snUserOk = (s) => Boolean(p6.svc(s)?.active) && p6.svc(s).web_service_access_only === true && p6.svc(s).roles.includes(SN_REST_ROLE) && p6.svc(s).roles.includes('sn_incident_write') && !p6.svc(s).roles.some((r) => SN_WIDE_ROLES.includes(r)) && String(p6.svc(s).pw ?? '').length >= 8
p6.snDeployed = (s) => {
  const a = app(s, SN_WMS)
  const pr = (k) => p6.prop(s, SN_WMS, k)
  return a?.status === 'Running' && p6.snUserOk(s) && pr('snow.instance').toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '') === SN_INSTANCE && pr('snow.assignmentGroup') === SN_GROUP && pr('snow.username') === SN_SVC && a.secrets?.['snow.password'] === p6.svc(s).pw && a.props['snow.password'] === undefined
}
p6.snMine = (s) => snRowsOf(p6.sn(s), 'incident').filter((r) => r.sys_created_by === SN_SVC)
p6.snTested = (s) => p6.snMine(s).find((r) => r.correlation_id && r.assignment_group === snGroupId(p6.sn(s), SN_GROUP))
p6.snFlow = (s) => p6.snDeployed(s) && called(s, SN_WMS, 200, 'GET', /^\/health/) && Boolean(p6.snTested(s)) && Boolean(s.seen[`snow:form:${p6.snTested(s).number}`]) && called(s, SN_WMS, 400, 'POST', /^\/alerts/) && !p6.snMine(s).some((r) => !r.correlation_id)
p6.reg = (s) => gRegNamed(p6.g(s), G_REG)
p6.validSecret = (s) => (p6.reg(s)?.secrets ?? []).filter((x) => x.end > s.clock + 30 * G_DAY)
p6.graphLeast = (s) => {
  const r = p6.reg(s)
  if (!r || !p6.validSecret(s).length) return false
  const perms = r.perms.filter((p) => p.type === 'Application')
  const sel = perms.find((p) => p.api === 'Microsoft Graph' && p.name === 'Sites.Selected')
  const sites = p6.g(s).sites.filter((x) => x.grants[r.appId])
  return perms.length === 1 && Boolean(sel) && gIsGranted(r, sel) && sites.length === 1 && sites[0].name === G_SITE && sites[0].grants[r.appId] === 'write'
}
p6.gUserOk = (s) => {
  const r = p6.reg(s)
  const u = r && p6.g(s).dv.users.find((x) => x.appId === r.appId)
  if (!u || !u.roles.length || u.roles.some((x) => G_SYSTEM_ROLES[x])) return false
  const p = gPrivsOf(p6.g(s), u)
  return ['Create', 'Read', 'Write'].every((x) => (p.account ?? []).includes(x)) && Object.keys(p).every((t) => t === 'account') && !(p.account ?? []).includes('Delete')
}
p6.gDeployed = (s) => {
  const x = app(s, G_BRIDGE)
  if (x?.status !== 'Running' || !p6.reg(s)) return false
  const pr = (k) => p6.prop(s, G_BRIDGE, k)
  const tenant = pr('azure.tenantId').toLowerCase()
  return (tenant === G_TENANT_ID || tenant === G_TENANT) && pr('azure.clientId') === p6.reg(s).appId && pr('dataverse.url').replace(/\/+$/, '') === G_ORG_URL && pr('sharepoint.hostname').toLowerCase() === G_SP_HOST && pr('sharepoint.sitePath') === `/sites/${G_SITE}` && pr('sharepoint.library') === G_LIB && !x.props['azure.clientSecret'] && p6.validSecret(s).some((y) => y.value === x.secrets?.['azure.clientSecret'])
}
p6.gFlow = (s) => {
  if (!p6.gDeployed(s)) return false
  const since = app(s, G_BRIDGE).updated
  const log = (p6.g(s).log ?? []).filter((e) => e.who === G_BRIDGE && e.api === 'dataverse' && e.m === 'PATCH' && e.st === 204 && e.t >= since)
  const twice = log.filter((e) => (e.p.match(/accountnumber='([^']+)'/) ?? [])[1] === G_TEST).length >= 2
  const once = gRowsOf(p6.g(s), 'account').filter((r) => r.accountnumber === G_TEST).length === 1
  const filed = (gSiteNamed(p6.g(s), G_SITE)?.drives.find((d) => d.name === G_LIB)?.items ?? []).some((i) => i.by === G_BRIDGE)
  const rejected = (app(s, G_BRIDGE)?.store?.rejected ?? []).some((x) => x.code && x.t >= since)
  return twice && once && filed && rejected && called(s, G_BRIDGE, 200, 'GET', /^\/health$/)
}
p6.shopApp = (s) => (s.shopify?.apps ?? []).find((a) => a.name.toLowerCase() === SHP_APP_NAME.toLowerCase())
p6.shpInstalled = (s) => Boolean(p6.shopApp(s)?.installed) && sameSet(p6.shopApp(s).granted, ['read_orders'])
p6.shpDeployed = (s) => {
  const x = p6.shopApp(s)
  const b = app(s, SHP_BRIDGE)
  const sec = b?.secrets ?? {}
  const pr = (k) => p6.prop(s, SHP_BRIDGE, k)
  return p6.shpInstalled(s) && b?.status === 'Running' && pr('shopify.shop') === SHP_SHOP && pr('shopify.apiVersion') === SHP_API_VERSION && pr('orders.queue') === SHP_QUEUE && sec['shopify.accessToken'] === x.token && sec['shopify.apiSecret'] === x.secret && b.props['shopify.accessToken'] === undefined && b.props['shopify.apiSecret'] === undefined && running(s, SHP_ORDER_API) && p6.prop(s, SHP_ORDER_API, 'mq.queue') === SHP_QUEUE
}
p6.shpSub = (s) => (s.shopify?.webhooks ?? []).find((w) => {
  const to = shpAddressOf(w.address)
  return w.app === p6.shopApp(s)?.id && w.topic === 'orders/create' && to?.app === SHP_BRIDGE && to.env === 'Sandbox' && !to.internal && to.path === SHP_BRIDGE_PATH
})
p6.shpFlow = (s) => {
  const got = new Set((app(s, SHP_ORDER_API)?.store?.orders ?? []).map((o) => o.order))
  const sub = p6.shpSub(s)
  return p6.shpDeployed(s) && Boolean(sub) && (s.shopify?.orders ?? []).some((o) => o.t >= sub.created && got.has(o.name)) && called(s, SHP_BRIDGE, 401, 'POST', /^\/webhooks\/shopify/)
}

function part6Start() {
  const clock = at(6, 8, 55)
  const s = nextDay(solvedOf(part5), 6, {
    jars: [jarOf(WD_FEED), jarOf(SN_WMS), jarOf(G_BRIDGE), jarOf(SHP_BRIDGE), SHP_ORDER_API],
    mail: [
      {
        subject: 'Go-live part 6: Workday, ServiceNow, Dynamics and Shopify',
        body: [
          'Good morning. Today the HR, service and commerce systems. Same rules as every day: an integration identity per app, the least rights, secrets protected, a proof in the screen of the system, a bad record seen, and an alert.',
          `Workday tenant ${WD_TENANT} on ${WD_HOST}. ${WD_FEED} reads the active workers for the identity hub through the report ${WD_REPORT} (RaaS, owner ${WD_SCREEN_USER}): Employee_ID, Worker, Email, Location and Last_Functionally_Updated, with the prompts Updated_From and Updated_To for the delta. No salary, no birth date. It signs on as ${WD_ISU} (password ${WD_PASSWORD}, no UI sessions, exempt from expiry), in the group ${WD_GROUP} with Get on the three domains the report needs. The test worker is ${WD_TEST_WORKER}. Alerts to ${HR_INT}.`,
          `ServiceNow ${SN_INSTANCE_URL}. ${SN_WMS} opens an incident for each WMS alert, assigned to ${SN_GROUP}, and adds a work note when the same alert repeats. The user ${SN_SVC} is web service only, with the roles ${SN_REST_ROLE} and sn_incident_write and nothing more, password ${SN_PASSWORD}. Alerts to ${WMS_ONCALL}.`,
          `Dynamics 365 and SharePoint, tenant ${G_TENANT}. ${G_BRIDGE} upserts web shop customers as Accounts in Dataverse (${G_ORG_URL}) on the alternate key accountnumber, and files contracts in the ${G_LIB} library of the ${G_SITE} site on ${G_SP_HOST}. App registration ${G_REG} with a client secret for 6 months, Sites.Selected with write on ${G_SITE} only, and an application user with the role ${G_ROLE}: create, read and write on Account. Alerts to ${CRM_INT}.`,
          `Shopify ${SHP_SHOP}. A custom app ${SHP_APP_NAME} with read_orders only. ${SHP_BRIDGE} takes the orders/create webhook, checks its HMAC and puts the order on the Anypoint MQ queue ${SHP_QUEUE}, which ${SHP_ORDER_API} reads. Alerts to ${ECOM_INT}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  const wd = newWorkday(at(6, 8))
  wd.workers[WD_TEST_WORKER] = { name: 'Quinn Testa', job: 'JP_PICKER', loc: 'LOC_DOCK_01', org: 'Integration Test', email: 'quinn.testa@brightmart.example', hire: clock - 30 * 86400000, term: null, upd: clock - 30 * 86400000 }
  const g = newMsgraph(at(6, 8))
  // the CRM team made the alternate key on the account number already
  g.dv.tables.account.keys.push({ name: 'brightmart_accountnumberkey', cols: ['accountnumber'], status: 'Active', t: clock - 30 * G_DAY })
  return { ...s, workday: wd, servicenow: newServicenow(clock), msgraph: g, shopify: newShopifyStore(clock, { nextOrder: 2101 }) }
}

const part6 = {
  id: 'p-golive-6',
  group: 'Brightmart go-live',
  title: 'Go-live part 6: Workday, ServiceNow, Dynamics with SharePoint, and Shopify',
  minutes: 60,
  scenario: `Day 6 of the Brightmart go-live. Today the HR, service and commerce systems: the worker feed from Workday, incidents in ServiceNow for warehouse alerts, customers and contracts in Dynamics 365 and SharePoint, and Shopify orders through a webhook onto Anypoint MQ. Four systems, four integration identities with the least rights, five apps, and for each a record you find in the system itself.`,
  start: () => part6Start(),
  steps: [
    { title: 'Read the handover of the HR, service and commerce systems', how: 'Open the Inbox from the menu under Lab tools. Note the users, groups, roles, report fields and alert addresses.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Workday: the ISU ${WD_ISU} and its security group`,
      how: `Workday from the console menu, Integration system users, Create Integration System User: ${WD_ISU}, password ${WD_PASSWORD}, Require New Password at Next Sign In unticked, Do Not Allow UI Sessions ticked. Password rules: tick ${WD_ISU} under System Users exempt from password expiration, Save. Security groups, Create Security Group ${WD_GROUP} with ${WD_ISU}; tick Get on Worker Data: Public Worker Reports, Worker Data: Staffing and Person Data: Work Contact Information, Save permissions, then Activate Pending Security Policy Changes with a comment.`,
      done: p6.groupOk,
    },
    {
      title: `Workday: the report ${WD_REPORT} as a web service`,
      how: `Custom reports, Create Custom Report: ${WD_REPORT}, data source All Active Workers. Fields Employee_ID, Worker, Email, Location and Last_Functionally_Updated, Enable As Web Service, share with ${WD_GROUP}, Save. Prompts: Updated_From (Last_Functionally_Updated, From) and Updated_To (same field, To).`,
      done: p6.reportOk,
    },
    {
      title: `Workday: deploy ${WD_FEED}, load, and reject a worker without email`,
      how: `Deploy ${WD_FEED} with workday.host ${WD_HOST}, workday.tenant ${WD_TENANT}, workday.username ${WD_ISU}, raas.owner ${WD_SCREEN_USER}, raas.report ${WD_REPORT}, workday.responseTimeout 60000 and workday.password protected. API client GET /health answers 200. Schedules, ${WD_FEED_FLOW}, Run, and compare with the head count in Workday, Workers. Then on worker ${WD_TEST_WORKER}, Contact tab, clear Work email and Submit, and Run again: the log rejects ${WD_TEST_WORKER}.`,
      done: p6.wdLoaded,
    },
    ask(
      'A report, not Get_Workers',
      `Why does ${WD_FEED} read a custom report with prompts and not the full Get_Workers web service?`,
      [
        'Get_Workers is not available for ISUs',
        'The report returns only the five fields the hub needs, so salary and birth dates never leave Workday, and the security group needs Get on three domains only. The prompts on Last_Functionally_Updated give a delta: each run asks for what changed since the last watermark instead of all workers',
        'Reports are the only way to get email addresses',
        'RaaS needs no password',
      ],
      1,
      'Data minimization and least privilege go together: fewer fields mean fewer domains. A delta with a watermark keeps runs short; the watermark only moves after a successful run, so nothing is skipped.',
    ),
    {
      title: `ServiceNow: the web service user ${SN_SVC}`,
      how: `ServiceNow from the console menu, User Administration, Users, New: User ID ${SN_SVC}, First name Brightmart, Last name WMS Alerts, Web service access only, Submit. Open it, Roles: add ${SN_REST_ROLE} and sn_incident_write, no admin, no itil. Set password ${SN_PASSWORD}, Save.`,
      done: p6.snUserOk,
    },
    {
      title: `ServiceNow: deploy ${SN_WMS} and open a test incident`,
      how: `Deploy ${SN_WMS} with snow.instance ${SN_INSTANCE_URL}, snow.auth basic, snow.username ${SN_SVC}, snow.assignmentGroup ${SN_GROUP} and snow.password protected. API client GET /health answers 200. POST /alerts with ${SN_WMS_ALERT} twice: one incident, the second call adds a work note. Incident, All, Correlation ID WMS-APP-01:pick_queue: open the record. Then POST /alerts with ${SN_WMS_BAD}: 400 and no incident.`,
      done: p6.snFlow,
    },
    {
      title: `Dynamics: the app registration ${G_REG} with Sites.Selected`,
      how: `Dynamics and SharePoint from the console menu, App registrations, New registration ${G_REG}. Certificates & secrets, New client secret, 180 days, copy the Value. API permissions, Add a permission: Microsoft Graph, Application permissions, Sites.Selected, Grant admin consent. SharePoint tab, site ${G_SITE}, Site permissions: app ${G_REG}, role write, Grant.`,
      done: p6.graphLeast,
    },
    {
      title: `Dynamics: the application user with the role ${G_ROLE}`,
      how: `Dataverse tab, Security roles, New role ${G_ROLE}: Create, Read and Write on Account only, Save. Application users, New app user: ${G_REG} with the role ${G_ROLE}, Create. Not System Administrator.`,
      done: p6.gUserOk,
    },
    {
      title: `Dynamics: deploy ${G_BRIDGE}, upsert twice, file a contract`,
      how: `Deploy ${G_BRIDGE} with azure.tenantId ${G_TENANT_ID}, azure.clientId the Application (client) ID, dataverse.url ${G_ORG_URL}, sharepoint.hostname ${G_SP_HOST}, sharepoint.sitePath /sites/${G_SITE}, sharepoint.library ${G_LIB} and azure.clientSecret protected. API client: GET /health, then POST /customers with {"accountNumber":"${G_TEST}","name":"Brightmart Test Customer","city":"Leeds"} twice: one Account in Dataverse. POST /customers/${G_TEST}/contract with {"file":"contract-2026.pdf","size":850000}. Then POST /customers with {"accountNumber":"${G_BAD}","name":"Northwest Depot"}: 400, kept in the reject store.`,
      done: p6.gFlow,
    },
    ask(
      'Sites.Selected',
      `Why does ${G_REG} get Sites.Selected with write on one site, and not Sites.ReadWrite.All?`,
      [
        'Sites.ReadWrite.All needs a certificate',
        'An application permission works without a user, on the whole tenant. Sites.ReadWrite.All would let a leaked secret read and change every site of Brightmart. Sites.Selected gives nothing until an admin grants the app a role on a named site, so the bridge reaches the Contracts library of Sales and nothing else',
        'Sites.Selected is faster',
        'Dataverse refuses apps with Sites.ReadWrite.All',
      ],
      1,
      'For Graph the least privilege for an app is a resource specific permission. In Dataverse the same idea is an application user with a custom role instead of System Administrator.',
    ),
    {
      title: `Shopify: the custom app with read_orders`,
      how: `Shopify from the console menu, Apps, Develop apps, Create an app: ${SHP_APP_NAME}, App developer ${OPS}. Configuration: Admin API access scopes read_orders only, Save. API credentials, Install app, Reveal token once and copy it, and copy the API secret key.`,
      done: p6.shpInstalled,
    },
    {
      title: `Shopify: the queue, both apps and the webhook`,
      how: `MQ, Destinations, + Add, Queue: ${SHP_QUEUE}, Standard queue. Deploy ${SHP_ORDER_API} with mq.queue ${SHP_QUEUE}. Deploy ${SHP_BRIDGE} with shopify.shop ${SHP_SHOP}, shopify.apiVersion ${SHP_API_VERSION}, orders.queue ${SHP_QUEUE}, and shopify.accessToken and shopify.apiSecret protected. Shopify, Apps, ${SHP_APP_NAME}, Webhooks, Create subscription: orders/create, JSON, API version ${SHP_API_VERSION}, URL the public endpoint of ${SHP_BRIDGE} followed by /api${SHP_BRIDGE_PATH}.`,
      done: (s) => p6.shpDeployed(s) && Boolean(p6.shpSub(s)),
    },
    {
      title: 'Shopify: a test order in, a forged webhook out',
      how: `Shopify, Orders, Create test order (H-1250, quantity 1). Move the clock 2 minutes: Webhooks, Deliveries shows 200 OK and API client GET /orders on ${SHP_ORDER_API} lists the order. Then API client, ${SHP_BRIDGE}, POST ${SHP_BRIDGE_PATH} with {"name":"#9999"} and the header X-Shopify-Hmac-Sha256 forged: 401, nothing on the queue.`,
      done: p6.shpFlow,
    },
    {
      title: 'Alert the owners',
      how: `Monitoring, Alerts, Create Alert, Message Error Count Above 0: ${WD_FEED} to ${HR_INT}, ${SN_WMS} to ${WMS_ONCALL}, ${G_BRIDGE} to ${CRM_INT}, ${SHP_BRIDGE} to ${ECOM_INT}.`,
      done: (s) => alerted(s, WD_FEED, HR_INT) && alerted(s, SN_WMS, WMS_ONCALL) && alerted(s, G_BRIDGE, CRM_INT) && alerted(s, SHP_BRIDGE, ECOM_INT),
    },
  ],
  why: 'SaaS systems are set up the same way as the systems on our own servers: an integration identity per app (an ISU in Workday, a web service user in ServiceNow, an app registration with an application user in Dataverse, a custom app in Shopify), with the narrowest rights the job needs (Get on three domains, two roles, Sites.Selected on one site and a custom role on Account, read_orders). Only the data that is needed leaves the system. Secrets and tokens are protected properties. Each app is proven in the system: the head count in Workday, the incident by correlation ID, the Account once after two upserts, the order delivered by the webhook. Each bad input is refused visibly: a rejected worker, a 400, a 401 for a forged HMAC, and an alert goes to the owner.',
  docs: `${DOCS}workday-connector/latest/`,
  solve(start) {
    let s = mark(start, 'inbox')
    s = wdCreateIsu(s, { user: WD_ISU, password: WD_PASSWORD, requireNew: false, noUi: true }).state
    s = wdSetPasswordRules(s, { exempt: [...s.workday.rules.exempt, WD_ISU] }).state
    s = wdCreateGroup(s, { name: WD_GROUP, members: [WD_ISU] }).state
    for (const d of [WD_DOMAINS.PUBLIC, WD_DOMAINS.STAFFING, WD_DOMAINS.CONTACT]) s = wdSetPermissions(s, WD_GROUP, d, ['Get']).state
    s = wdActivatePending(s, 'Worker feed to the identity hub').state
    s = wdCreateReport(s, { name: WD_REPORT, source: 'All Active Workers' }).state
    s = wdEditReport(s, WD_REPORT, { fields: [...WD_NEED, 'Last_Functionally_Updated'], ws: true, share: [WD_GROUP] }).state
    s = wdAddPrompt(s, WD_REPORT, { name: 'Updated_From', field: 'Last_Functionally_Updated', op: 'from' }).state
    s = wdAddPrompt(s, WD_REPORT, { name: 'Updated_To', field: 'Last_Functionally_Updated', op: 'to' }).state
    s = finishDeploys(deployApp(s, { name: WD_FEED, pkg: WD_FEED, jar: WD_FEED_JAR, replicas: 1, vCores: 0.1, props: { 'workday.host': WD_HOST, 'workday.tenant': WD_TENANT, 'workday.username': WD_ISU, 'raas.owner': WD_SCREEN_USER, 'raas.report': WD_REPORT, 'workday.responseTimeout': '60000' }, secrets: { 'workday.password': WD_PASSWORD } }).state)
    s = call(s, WD_FEED, null, '/health', 'GET').state
    s = mark(mark(s, 'wd:signons'), 'wd:workers')
    s = runNow(s, WD_FEED, WD_FEED_FLOW)
    s = wdChangeEmail(advance(s, MINUTE), WD_TEST_WORKER, '').state
    s = runNow(advance(s, MINUTE), WD_FEED, WD_FEED_FLOW)
    s = snCreateUser(s, { user_name: SN_SVC, first_name: 'Brightmart', last_name: 'WMS Alerts', web_service_access_only: true }).state
    s = snSetRole(s, SN_SVC, SN_REST_ROLE, true).state
    s = snSetRole(s, SN_SVC, 'sn_incident_write', true).state
    s = snSetUserFields(s, SN_SVC, { password: SN_PASSWORD }).state
    s = finishDeploys(deployApp(s, { name: SN_WMS, pkg: SN_WMS, jar: SN_WMS_JAR, replicas: 1, vCores: 0.1, props: { 'snow.instance': SN_INSTANCE_URL, 'snow.auth': 'basic', 'snow.username': SN_SVC, 'snow.assignmentGroup': SN_GROUP }, secrets: { 'snow.password': SN_PASSWORD } }).state)
    s = call(s, SN_WMS, null, '/health', 'GET').state
    s = mark(s, 'snow:tx')
    s = call(s, SN_WMS, null, '/alerts', 'POST', SN_WMS_ALERT).state
    s = call(s, SN_WMS, null, '/alerts', 'POST', SN_WMS_ALERT).state
    s = mark(mark(s, 'snow:list:incident'), `snow:form:${p6.snTested(s).number}`)
    s = call(s, SN_WMS, null, '/alerts', 'POST', SN_WMS_BAD).state
    s = gRegisterApp(s, G_REG).state
    const id = p6.reg(s).appId
    const secret = gAddSecret(s, id, { desc: 'mule-sandbox', days: 180 })
    s = gAddPermission(secret.state, id, { api: 'Microsoft Graph', name: 'Sites.Selected', type: 'Application' }).state
    s = gGrantConsent(s, id).state
    s = gGrantSite(s, gSiteNamed(s.msgraph, G_SITE).id, id, 'write').state
    s = gSaveRole(s, G_ROLE, { account: ['Create', 'Read', 'Write'] }).state
    s = gCreateAppUser(s, id, [G_ROLE]).state
    s = finishDeploys(deployApp(s, { name: G_BRIDGE, pkg: G_BRIDGE, jar: G_BRIDGE_JAR, replicas: 1, vCores: 0.1, props: { 'azure.tenantId': G_TENANT_ID, 'azure.clientId': id, 'dataverse.url': G_ORG_URL, 'sharepoint.hostname': G_SP_HOST, 'sharepoint.sitePath': `/sites/${G_SITE}`, 'sharepoint.library': G_LIB }, secrets: { 'azure.clientSecret': secret.result.value } }).state)
    s = call(s, G_BRIDGE, null, '/health', 'GET').state
    s = call(s, G_BRIDGE, null, '/customers', 'POST', `{"accountNumber":"${G_TEST}","name":"Brightmart Test Customer","city":"Leeds"}`).state
    s = call(s, G_BRIDGE, null, '/customers', 'POST', `{"accountNumber":"${G_TEST}","name":"Brightmart Test Customer","city":"Leeds"}`).state
    s = call(s, G_BRIDGE, null, `/customers/${G_TEST}/contract`, 'POST', '{"file":"contract-2026.pdf","size":850000}').state
    s = call(s, G_BRIDGE, null, '/customers', 'POST', `{"accountNumber":"${G_BAD}","name":"Northwest Depot"}`).state
    s = shpCreateApp(s, { name: SHP_APP_NAME, developer: OPS }).state
    const shop = p6.shopApp(s).id
    s = shpSaveScopes(s, shop, ['read_orders']).state
    s = shpInstallApp(s, shop).state
    const r = shpRevealToken(s, shop)
    s = createMqQueue(r.state, { name: SHP_QUEUE, fifo: false, ttl: MQ_DEFAULT_TTL, lockTtl: MQ_DEFAULT_LOCK_TTL })
    s = deploy(s, SHP_ORDER_API, { 'mq.queue': SHP_QUEUE })
    s = finishDeploys(deployApp(s, { name: SHP_BRIDGE, pkg: SHP_BRIDGE, jar: SHP_BRIDGE_JAR, replicas: 1, vCores: 0.1, props: { 'shopify.shop': SHP_SHOP, 'shopify.apiVersion': SHP_API_VERSION, 'orders.queue': SHP_QUEUE }, secrets: { 'shopify.accessToken': r.result, 'shopify.apiSecret': p6.shopApp(s).secret } }).state)
    s = call(s, SHP_BRIDGE, null, '/health', 'GET').state
    s = shpCreateSubscription(s, shop, { topic: 'orders/create', address: `${endpointOf(app(s, SHP_BRIDGE))}/api${SHP_BRIDGE_PATH}`, format: 'json', apiVersion: SHP_API_VERSION }).state
    s = shpCreateTestOrder(s, { sku: 'H-1250', qty: 1 }).state
    s = advance(s, 2 * MINUTE)
    s = callApi(s, { env: 'Sandbox', app: SHP_BRIDGE, method: 'POST', path: SHP_BRIDGE_PATH, body: '{"name":"#9999"}', headers: [['X-Shopify-Hmac-Sha256', 'forged']] }).state
    s = errorAlert(s, WD_FEED, HR_INT, 'Worker feed failed')
    s = errorAlert(s, SN_WMS, WMS_ONCALL, 'WMS bridge errors')
    s = errorAlert(s, G_BRIDGE, CRM_INT, 'Customer bridge errors')
    return errorAlert(s, SHP_BRIDGE, ECOM_INT, 'Shopify bridge errors')
  },
  answers: { 4: 1, 10: 1 },
}

// ==================== Part 7: Brightmart Care and the cloud ====================

const EPIC_APP = 'Brightmart Care Patient Sync'
const EPIC_MRNS = ['203711', '203714', '203715']
const EPIC_ALIAS = 'brightmart-sync-2026-11'
const EPIC_LEAST = ['system/Patient.read', 'system/Observation.read']
const CARE_INT = 'care-integrations@brightmart.example'
const HL7_IFACE = 'BVH_ADT_LIS'
const HL7_PORT = 6680
const HL7_EVENTS = ['A01', 'A03', 'A04', 'A08']
const HL7_ONCALL = 'integration-oncall@bayview.example'
const AWS_BUCKET = 'brightmart-pod-archive'
const AWS_QUEUE = 'brightmart-pod-events'
const AWS_DLQ = 'brightmart-pod-events-dlq'
const AWS_USER = 'svc-pod-bridge'
const AWS_KMS = 'alias/brightmart-logistics'
const AWS_POISON = '{"type":"PodReceived","shipment":"SL-4'
const LOGISTICS_INT = 'logistics-integration@brightmart.example'

const p7 = { e: (s) => s.epic ?? {}, aws: (s) => s.aws ?? {}, word: (v) => String(v ?? '').trim() }
p7.reg = (s) => (p7.e(s).apps ?? []).find((a) => a.name.toLowerCase() === EPIC_APP.toLowerCase())
p7.ownKey = (s, kid) => {
  const others = (p7.e(s).apps ?? []).filter((x) => x !== p7.reg(s)).flatMap((x) => x.keys.map((k) => k.kid))
  const k = (p7.e(s).keystore ?? []).find((x) => !kid || x.kid === kid)
  return k && !others.includes(k.kid) && epicPublicKeysOf(p7.e(s), p7.reg(s)).some((p) => p.kid === k.kid && p.thumb === k.thumb) ? k : null
}
p7.epicReady = (s) => {
  const sc = p7.reg(s)?.scopes ?? []
  return sc.length === EPIC_LEAST.length && EPIC_LEAST.every((x) => sc.includes(x)) && (p7.e(s).keystore ?? []).some((k) => p7.ownKey(s, k.kid))
}
p7.epicDeployed = (s) => {
  const x = app(s, EPIC_SYNC)
  if (x?.status !== 'Running' || !p7.reg(s)) return false
  const p = x.props
  const w = p7.word
  const key = epicKeyOf(p7.e(s), p['epic.jwt.keyAlias'])
  const scopes = w(p['epic.scopes']).split(/\s+/).filter(Boolean)
  const leaked = Object.values(p).some((v) => w(v) === EPIC_KEYSTORE_PASSWORD || /PRIVATE KEY/i.test(String(v)))
  return w(p['epic.tokenUrl']) === EPIC_TOKEN_URL && w(p['epic.fhirBase']) === EPIC_BASE && w(p['epic.clientId']) === p7.reg(s).clientId && Boolean(key) && w(p['epic.jwt.kid']) === key.kid && Boolean(p7.ownKey(s, key.kid)) && (!w(p['epic.jwt.alg']) || EPIC_ALGS.includes(w(p['epic.jwt.alg']))) && (!w(p['epic.jwt.expSeconds']) || (Number(p['epic.jwt.expSeconds']) > 0 && Number(p['epic.jwt.expSeconds']) <= EPIC_MAX_EXP)) && scopes.every((v) => EPIC_LEAST.includes(v)) && w(p['sync.mrns']).split(',').map(w).sort().join() === [...EPIC_MRNS].sort().join() && x.secrets?.['epic.keystore.password'] === EPIC_KEYSTORE_PASSWORD && p['epic.keystore.password'] === undefined && !leaked
}
p7.epicSynced = (s) => {
  const x = app(s, EPIC_SYNC)
  const last = x?.schedules.find((f) => f.flow === EPIC_SYNC_FLOW)?.last
  const token = (p7.e(s).tokenLog ?? []).some((t) => t.c === p7.reg(s)?.clientId && t.st === 200)
  return p7.epicDeployed(s) && token && called(s, EPIC_SYNC, 200, 'GET', /^\/health/) && Boolean(last?.ok) && Boolean(s.seen['epic:browser']) && EPIC_MRNS.every((m) => {
    const p = epicPatientByMrn(p7.e(s), m)
    return p && x.store?.patients?.[m]?.vitals === epicObsOf(p7.e(s), p.id, 'vital-signs').length
  }) && called(s, EPIC_SYNC, 404, 'GET', /^\/patients\/\w+/)
}
p7.iface = (s) => (s.hl7?.interfaces ?? []).find((i) => i.type === 'ADT' && p7.word(i.host).toLowerCase() === HL7_MULE_HOST && Number(i.port) === HL7_PORT && i.tls)
p7.hl7Deployed = (s) => {
  const x = app(s, HL7_INTAKE)
  const p = x?.props ?? {}
  const w = p7.word
  return [...(p7.iface(s)?.events ?? [])].sort().join() === HL7_EVENTS.join() && x?.status === 'Running' && x.secrets['mllp.tls.keystorePassword'] === HL7_KEYSTORE_PASSWORD && p['mllp.tls.keystorePassword'] === undefined && w(p['mllp.port']) === String(HL7_PORT) && w(p['mllp.tls.enabled']).toLowerCase() === 'true' && w(p['lis.host']).toLowerCase() === HL7_LIS_HOST && w(p['lis.port']) === String(HL7_LIS_PORT) && hl7AckModeOf(p) === 'AFTER_PROCESSING'
}
p7.hl7Log = (s) => (s.hl7?.log ?? []).filter((e) => e.leg === p7.iface(s)?.id)
p7.hl7Flow = (s) => p7.hl7Deployed(s) && p7.iface(s)?.status === 'Running' && Boolean(p7.iface(s)?.connected) && p7.hl7Log(s).some((e) => e.type === 'ADT^A04' && e.mrn === HL7_TEST_MRN && e.ack === 'AA') && Boolean(s.hl7?.lis?.patients?.[HL7_TEST_MRN]) && Boolean(s.seen['hl7:lis'])
p7.hl7Bad = (s) => p7.hl7Flow(s) && p7.hl7Log(s).some((e) => e.type === 'ADT^A04' && e.ack === 'AE' && /\|101\^/.test(e.ackRaw)) && (s.hl7?.errors ?? []).some((x) => x.app === HL7_INTAKE) && Boolean(s.seen['hl7:errors'])
p7.keyArn = (s) => Object.values(p7.aws(s).keys ?? {}).find((k) => k.alias === AWS_KMS)?.arn ?? ''
p7.bucketOk = (s) => {
  const b = p7.aws(s).buckets?.[AWS_BUCKET]
  return Boolean(b) && Object.values(b.bpa).every(Boolean) && b.encryption.type === 'SSE-KMS' && b.encryption.key === AWS_KMS
}
p7.queuesOk = (s) => {
  const q = p7.aws(s).queues?.[AWS_QUEUE]
  const d = p7.aws(s).queues?.[AWS_DLQ]
  return Boolean(q && d) && !q.fifo && !d.fifo && q.visibility === 60 && q.wait === 20 && q.redrive?.dlq === AWS_DLQ && q.redrive.max === 3
}
p7.awsLeast = (s) => {
  const key = arnBucket(AWS_BUCKET, 'pod/2026/11/03/SL-40021.json')
  const needs = [['s3:PutObject', key], ['s3:ListBucket', arnBucket(AWS_BUCKET)], ['sqs:SendMessage', arnQueue(AWS_QUEUE)], ['sqs:ReceiveMessage', arnQueue(AWS_QUEUE)], ['sqs:DeleteMessage', arnQueue(AWS_QUEUE)], ['sqs:GetQueueAttributes', arnQueue(AWS_QUEUE)], ['kms:GenerateDataKey', p7.keyArn(s)]]
  const not = [['s3:DeleteObject', key], ['s3:PutObject', arnBucket('brightmart-web-assets', 'index.html')], ['s3:DeleteBucket', arnBucket(AWS_BUCKET)], ['sqs:PurgeQueue', arnQueue(AWS_QUEUE)], ['sqs:SendMessage', arnQueue('brightmart-orders')], ['kms:ScheduleKeyDeletion', p7.keyArn(s)], ['iam:CreateAccessKey', '*']]
  const who = `user:${AWS_USER}`
  return Boolean(p7.aws(s).users?.[AWS_USER]) && p7.bucketOk(s) && p7.queuesOk(s) && needs.every(([a, r]) => awsAllowed(p7.aws(s), who, a, r)) && !not.some(([a, r]) => awsAllowed(p7.aws(s), who, a, r))
}
p7.awsDeployed = (s) => {
  const x = app(s, AWS_BRIDGE)
  const k = (p7.aws(s).users?.[AWS_USER]?.keys ?? []).find((y) => y.status === 'Active')
  if (x?.status !== 'Running' || !k || !p7.awsLeast(s)) return false
  const p = x.props
  return p7.word(p['aws.region']) === AWS_REGION && p7.word(p['aws.accessKeyId']) === k.id && x.secrets['aws.secretAccessKey'] === k.secret && p['aws.secretAccessKey'] === undefined && p7.word(p['s3.bucket']) === AWS_BUCKET && p7.word(p['sqs.queueUrl']) === awsQueueUrl(AWS_QUEUE)
}
p7.awsPods = (s) => {
  const objects = Object.entries(p7.aws(s).buckets?.[AWS_BUCKET]?.objects ?? {}).filter(([k, o]) => k.startsWith('pod/') && o.by === AWS_USER && o.sse === 'aws:kms').length
  return p7.awsDeployed(s) && called(s, AWS_BRIDGE, 200, 'GET', /^\/health/) && objects >= 3 && (app(s, AWS_BRIDGE).store?.delivered ?? []).length >= 3 && Boolean(s.seen[`aws:s3:${AWS_BUCKET}:Objects`])
}
p7.awsDead = (s) => p7.awsPods(s) && (p7.aws(s).queues?.[AWS_DLQ]?.messages ?? []).some((m) => m.src === arnQueue(AWS_QUEUE) && !/"type":"PodReceived".*\}$/.test(m.body)) && Boolean(s.seen[`aws:poll:${AWS_DLQ}`])

function part7Start() {
  const clock = at(7, 8, 55)
  const e = newEpic(at(7, 8))
  seedEpicKey(e, { alias: 'brightmart-epic-2026-11', t: at(0, 2) })
  seedEpicApp(e, { name: 'Brightmart Care Roster', scopes: ['system/Patient.read'], kids: ['brightmart-epic-2026-11'], t: at(0, 2) })
  const hl7 = newHl7(clock, {
    interfaces: [newInterface({ id: 'BVH_ORU_OUT', name: 'Results to MuleSoft', type: 'ORU', events: ['R01'], port: 6671, status: 'Stopped' })],
    lis: newLis({ patients: Object.fromEntries(['880021', '880107'].map((m) => [m, { name: HL7_PATIENTS[m].name.join('^'), dob: HL7_PATIENTS[m].dob, sex: HL7_PATIENTS[m].sex, mergedInto: null }])) }),
  })
  const aws = newAwsAccount(clock, {
    keys: [{ alias: AWS_KMS, created: at(-120, 10) }],
    buckets: [{ name: 'brightmart-web-assets', created: at(-300, 9) }],
    queues: [{ name: 'brightmart-orders', visibility: 60, wait: 20, created: at(-200, 9) }],
  })
  const s = nextDay(solvedOf(part6), 7, {
    jars: [EPIC_SYNC, jarOf(HL7_INTAKE), jarOf(AWS_BRIDGE)],
    mail: [
      {
        subject: 'Go-live part 7: Brightmart Care and AWS',
        body: [
          'Good morning. Today Brightmart Care, our pharmacy and clinic arm with Bayview Hospital, and the AWS account of logistics. Health data has the strictest rules: the least data, the least scopes, keys instead of passwords, and every message accounted for.',
          `Epic, FHIR R4 (${EPIC_BASE}). ${EPIC_SYNC} syncs the demographics and vital signs of the pharmacy patients ${EPIC_MRNS.join(', ')}. A new backend app ${EPIC_APP} with system/Patient.read and system/Observation.read only, a key pair of its own with alias and kid ${EPIC_ALIAS}, RS384, tokens of 300 seconds. Token URL ${EPIC_TOKEN_URL}. Keystore password ${EPIC_KEYSTORE_PASSWORD}. Alerts to ${CARE_INT}.`,
          `HL7. Epic sends ADT A01, A03, A04 and A08, nothing else, to ${HL7_INTAKE} over MLLP with TLS on ${HL7_MULE_HOST}:${HL7_PORT}, interface ${HL7_IFACE}, ACK timeout 30 seconds. The app passes them to the Bayview LIS on ${HL7_LIS_HOST}:${HL7_LIS_PORT} and acknowledges after processing. Keystore password ${HL7_KEYSTORE_PASSWORD}. Alerts to ${HL7_ONCALL}.`,
          `AWS ${AWS_REGION}. ${AWS_BRIDGE} archives proofs of delivery in a new bucket ${AWS_BUCKET} (no public access, SSE-KMS with ${AWS_KMS}) and reads POD events from the queue ${AWS_QUEUE} (visibility 60 s, long polling 20 s, dead letter queue ${AWS_DLQ} after 3 receives). The IAM user ${AWS_USER} gets an inline policy with only what the bridge does. Alerts to ${LOGISTICS_INT}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  return { ...s, epic: e, hl7, aws }
}

const part7 = {
  id: 'p-golive-7',
  group: 'Brightmart go-live',
  title: 'Go-live part 7: Brightmart Care with Epic and HL7, and AWS',
  minutes: 50,
  scenario: `Day 7 of the Brightmart go-live and the last day of the systems. Brightmart Care syncs pharmacy patients from Epic over FHIR and passes the admissions of Bayview Hospital to the lab system over HL7 MLLP. Logistics archives proofs of delivery in AWS S3 and reads POD events from SQS. Health data and cloud keys get the strictest least privilege of the go-live.`,
  start: () => part7Start(),
  steps: [
    { title: 'Read the handover of Brightmart Care and logistics', how: 'Open the Inbox from the menu under Lab tools. Note the scopes, the key alias, the events, the ports, the bucket, the queues and the alert addresses.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Epic: the backend app ${EPIC_APP} with the least scopes and its own key`,
      how: `Epic (FHIR) from the console menu, Backend apps, Create: ${EPIC_APP}, audience Backend Systems, Create app. Under Incoming APIs tick only system/Patient.read and system/Observation.read, Save APIs. Brightmart keys, Generate key pair: Alias and Key ID (kid) ${EPIC_ALIAS}. Backend apps, ${EPIC_APP}, Public keys: pick ${EPIC_ALIAS}, Add public key.`,
      done: p7.epicReady,
    },
    {
      title: `Epic: deploy ${EPIC_SYNC} and sync the patients`,
      how: `Deploy ${EPIC_SYNC} with epic.tokenUrl ${EPIC_TOKEN_URL}, epic.fhirBase ${EPIC_BASE}, epic.clientId the non-production client ID, epic.jwt.keyAlias and epic.jwt.kid ${EPIC_ALIAS}, epic.jwt.alg RS384, epic.jwt.expSeconds 300, epic.scopes system/Patient.read system/Observation.read, sync.mrns ${EPIC_MRNS.join(',')} and epic.keystore.password protected. API client GET /health. Schedules, ${EPIC_SYNC_FLOW}, Run, and compare the vital signs per MRN in the FHIR browser. Then GET /patients/999999: 404, not 500.`,
      done: p7.epicSynced,
    },
    ask(
      'A key, not a client secret',
      `Why does ${EPIC_SYNC} sign a JWT with its own private key, with a token of 300 seconds?`,
      [
        'Epic does not support OAuth',
        'Epic keeps only the public key, so there is no shared secret to leak from either side. Each token request is a fresh assertion signed by the key, and a token of 5 minutes limits what a stolen token can do. A key of its own per app means one compromised app can be cut off without touching the roster app',
        'Keys are faster than secrets',
        'The FHIR API refuses tokens longer than 300 seconds',
      ],
      1,
      'SMART Backend Services uses the client credentials grant with a private_key_jwt client assertion. The kid in the header tells Epic which public key to use, so keys can be rotated by adding a new one before removing the old one.',
    ),
    {
      title: `HL7: the interface ${HL7_IFACE} and ${HL7_INTAKE}`,
      how: `HL7 interfaces from the console menu, Interfaces, New interface: ${HL7_IFACE}, message type ADT, events A01, A03, A04 and A08 only, host ${HL7_MULE_HOST}, port ${HL7_PORT}, TLS on, ACK timeout 30, on AE Continue. Create. Deploy ${HL7_INTAKE} with mllp.host 0.0.0.0, mllp.port ${HL7_PORT}, mllp.tls.enabled true, lis.host ${HL7_LIS_HOST}, lis.port ${HL7_LIS_PORT}, hl7.ackMode AFTER_PROCESSING and mllp.tls.keystorePassword protected.`,
      done: p7.hl7Deployed,
    },
    {
      title: 'HL7: start the interface and register a test patient',
      how: `Interfaces, ${HL7_IFACE}, Start, move the clock a minute: Connected. Pick A04 register test patient and Send test message, move the clock a minute: the Message log shows ACK AA, and tab Bayview LIS lists MRN ${HL7_TEST_MRN}.`,
      done: p7.hl7Flow,
    },
    {
      title: 'HL7: a message without PID-3 is answered AE and kept',
      how: `On ${HL7_IFACE} pick A04 without PID-3 and Send test message, move the clock a minute. The ACK is AE with ERR 101 at PID^1^3, and tab Error store holds the message with its reason.`,
      done: p7.hl7Bad,
    },
    ask(
      'ACK after processing',
      `Why does ${HL7_INTAKE} send its ACK after the LIS took the message, and not when it arrives?`,
      [
        'HL7 has no other mode',
        'An AA promises Epic the message is handled. Sent on arrival, a failure afterwards loses the admission, because Epic has moved on. After processing, a failure becomes an AE or no ACK, Epic keeps or resends the message, and the sequence of ADT events for a patient stays intact',
        'It makes the interface faster',
        'The LIS sends the ACK itself',
      ],
      1,
      'Original mode acknowledgment after processing gives at least once delivery with the sender holding the next message. The cost is throughput, which is why the ACK timeout must cover the slowest LIS answer.',
    ),
    {
      title: `AWS: the bucket, the queues and the user ${AWS_USER}`,
      how: `AWS from the console menu, S3, Create bucket ${AWS_BUCKET}: Block all public access on, default encryption SSE-KMS with ${AWS_KMS}. SQS, Create queue ${AWS_DLQ} (Standard), then ${AWS_QUEUE}: Visibility timeout 60, Receive message wait time 20, Dead-letter queue Enabled with ${AWS_DLQ} and Maximum receives 3. IAM, Users, Create user ${AWS_USER}, Create inline policy: s3:PutObject on ${arnBucket(AWS_BUCKET, 'pod/*')}, s3:ListBucket on the bucket, sqs:SendMessage, ReceiveMessage, DeleteMessage and GetQueueAttributes on ${AWS_QUEUE}, kms:GenerateDataKey on the key. The Policy simulator denies s3:DeleteObject.`,
      done: p7.awsLeast,
    },
    {
      title: `AWS: deploy ${AWS_BRIDGE} and archive three PODs`,
      how: `IAM, ${AWS_USER}, Security credentials, Create access key. Deploy ${AWS_BRIDGE} with aws.region ${AWS_REGION}, aws.accessKeyId, s3.bucket ${AWS_BUCKET}, sqs.queueUrl ${awsQueueUrl(AWS_QUEUE)} and aws.secretAccessKey protected. API client GET /health, then POST /pod with the sample body for SL-40021, SL-40022 and SL-40023. Move the clock 2 minutes: S3, ${AWS_BUCKET}, Objects shows three files under pod/ with SSE-KMS.`,
      done: p7.awsPods,
    },
    {
      title: 'AWS: a broken event ends in the dead letter queue',
      how: `SQS, ${AWS_QUEUE}, Send and receive messages: body ${AWS_POISON} (cut off), Send message. The listener fails, SQS gives it again after 60 seconds, and after the third receive it moves to ${AWS_DLQ}. Move the clock 5 minutes and Poll for messages on ${AWS_DLQ}.`,
      done: p7.awsDead,
    },
    {
      title: 'Alert the owners',
      how: `Monitoring, Alerts, Create Alert, Message Error Count Above 0: ${EPIC_SYNC} to ${CARE_INT}, ${HL7_INTAKE} to ${HL7_ONCALL}, ${AWS_BRIDGE} to ${LOGISTICS_INT}.`,
      done: (s) => alerted(s, EPIC_SYNC, CARE_INT) && alerted(s, HL7_INTAKE, HL7_ONCALL) && alerted(s, AWS_BRIDGE, LOGISTICS_INT),
    },
  ],
  why: 'Health and cloud integrations follow the same pattern with tighter limits. Epic gets a backend app per integration with two read scopes, its own key pair and short tokens. The HL7 feed takes only the four ADT events it needs over MLLP with TLS and acknowledges after processing, so a failed admission is answered AE and kept in the error store, never lost. In AWS the bucket blocks public access and encrypts with KMS, the queue has a dead letter queue after three receives, and the IAM user can do exactly what the bridge does and the policy simulator proves what it cannot. Each app is proven in the system and each owner gets an alert.',
  docs: `${DOCS}hl7-mllp-connector/latest/`,
  solve(start) {
    let s = mark(start, 'inbox')
    const made = createBackendApp(s, { name: EPIC_APP })
    s = made.state
    const id = made.result.clientId
    s = setEpicAppScopes(s, id, EPIC_LEAST).state
    s = generateKeyPair(s, { alias: EPIC_ALIAS, kid: EPIC_ALIAS }).state
    s = addEpicPublicKey(s, id, EPIC_ALIAS).state
    s = deploy(s, EPIC_SYNC, { 'epic.tokenUrl': EPIC_TOKEN_URL, 'epic.fhirBase': EPIC_BASE, 'epic.clientId': id, 'epic.jwt.keyAlias': EPIC_ALIAS, 'epic.jwt.kid': EPIC_ALIAS, 'epic.jwt.alg': 'RS384', 'epic.jwt.expSeconds': '300', 'epic.scopes': EPIC_LEAST.join(' '), 'sync.mrns': EPIC_MRNS.join(',') }, { 'epic.keystore.password': EPIC_KEYSTORE_PASSWORD })
    s = mark(call(s, EPIC_SYNC, null, '/health').state, 'epic:tokens')
    s = mark(runNow(s, EPIC_SYNC, EPIC_SYNC_FLOW), 'epic:browser')
    s = call(s, EPIC_SYNC, null, '/patients/999999').state
    s = createInterface(s, { id: HL7_IFACE, name: 'ADT to LIS through MuleSoft', type: 'ADT', events: HL7_EVENTS, host: HL7_MULE_HOST, port: String(HL7_PORT), tls: true, ackTimeout: '30', onAe: 'Continue' }).state
    s = finishDeploys(deployApp(s, { name: HL7_INTAKE, pkg: HL7_INTAKE, jar: HL7_INTAKE_JAR, replicas: 1, vCores: 0.1, props: { 'mllp.host': '0.0.0.0', 'mllp.port': String(HL7_PORT), 'mllp.tls.enabled': 'true', 'lis.host': HL7_LIS_HOST, 'lis.port': String(HL7_LIS_PORT), 'hl7.ackMode': 'AFTER_PROCESSING' }, secrets: { 'mllp.tls.keystorePassword': HL7_KEYSTORE_PASSWORD } }).state)
    s = advance(s, MINUTE)
    s = startInterface(s, HL7_IFACE).state
    s = mark(advance(s, MINUTE), 'hl7:interfaces')
    s = sendTest(s, HL7_IFACE, 'A04').state
    s = mark(advance(s, 2 * MINUTE), 'hl7:lis')
    s = sendTest(s, HL7_IFACE, 'A04 bad').state
    s = mark(advance(s, 2 * MINUTE), 'hl7:errors')
    s = createBucket(s, { name: AWS_BUCKET, encryption: { type: 'SSE-KMS', key: AWS_KMS } }).state
    s = createAwsQueue(s, { name: AWS_DLQ, visibility: 30, retention: 1209600, wait: 20, delay: 0 }).state
    s = createAwsQueue(s, { name: AWS_QUEUE, visibility: 60, retention: 345600, wait: 20, delay: 0, dlq: AWS_DLQ, maxReceives: 3 }).state
    s = createAwsUser(s, AWS_USER).state
    const policy = awsPolicyDoc(
      { Sid: 'WritePods', Effect: 'Allow', Action: 's3:PutObject', Resource: arnBucket(AWS_BUCKET, 'pod/*') },
      { Sid: 'CheckBucket', Effect: 'Allow', Action: 's3:ListBucket', Resource: arnBucket(AWS_BUCKET) },
      { Sid: 'PodEvents', Effect: 'Allow', Action: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'], Resource: arnQueue(AWS_QUEUE) },
      { Sid: 'EncryptPods', Effect: 'Allow', Action: 'kms:GenerateDataKey', Resource: p7.keyArn(s) },
    )
    s = putAwsPolicy(s, 'user', AWS_USER, 'pod-bridge', policy).state
    const k = createAccessKey(s, AWS_USER)
    s = finishDeploys(deployApp(k.state, { name: AWS_BRIDGE, pkg: AWS_BRIDGE, jar: AWS_POD_JAR, replicas: 1, vCores: 0.1, props: { 'aws.region': AWS_REGION, 'aws.accessKeyId': k.result.id, 's3.bucket': AWS_BUCKET, 'sqs.queueUrl': awsQueueUrl(AWS_QUEUE) }, secrets: { 'aws.secretAccessKey': k.result.secret } }).state)
    s = call(s, AWS_BRIDGE, null, '/health', 'GET').state
    for (const n of ['SL-40021', 'SL-40022', 'SL-40023']) s = call(s, AWS_BRIDGE, null, '/pod', 'POST', AWS_POD_SAMPLE.replace('SL-40021', n)).state
    s = mark(advance(s, 2 * MINUTE), `aws:s3:${AWS_BUCKET}:Objects`)
    s = sendFromConsole(s, AWS_QUEUE, { body: AWS_POISON }).state
    s = advance(s, 5 * MINUTE)
    s = pollFromConsole(s, AWS_DLQ).state
    s = errorAlert(s, EPIC_SYNC, CARE_INT, 'Patient sync failed')
    s = errorAlert(s, HL7_INTAKE, HL7_ONCALL, 'ADT intake errors')
    return errorAlert(s, AWS_BRIDGE, LOGISTICS_INT, 'POD bridge errors')
  },
  answers: { 3: 1, 7: 1 },
}

// ---------- part 8: the API layers ----------

// The 29 APIs of the Brightmart estate (platform-enterprise-packages.js) in three layers. The domain teams published 26
// specs. The go-live team designs the three of the order path itself, imports them into Studio and gives every API an
// instance, policies and contracts.
const LEARNER = ['notifications-sys-api', 'orders-prc-api', 'web-shop-exp-api']
const LAYERS = ['System', 'Process', 'Experience']
const ofLayer = (layer) => DEPLOYED.filter((d) => d.layer === layer)
const assetIdOf = (d) => d.asset ?? d.name
const versionOf = (d) => d.version ?? d.build
const shortEnv = (env) => (env === 'Sandbox' ? 'sbx' : 'prd')
const labelOf = (d, env = 'Sandbox') => `${d.name}-${shortEnv(env)}`
const filled = (path) => path.replace(/\{(\w+)\}/g, (all, k) => ESTATE_SAMPLE[k] ?? all)
const PROCESS_CLIENT = 'brightmart-process-apps'
const EXPERIENCE_CLIENT = 'brightmart-experience-apps'
const QA_CLIENT = 'brightmart-qa-load'
const DIGITAL = 'digital-oncall@brightmart.example'
const SLA = ['web-shop-exp-api', 'partner-b2b-exp-api', 'supplier-exp-api']
const TIERS = [
  { name: 'Gold', requests: 120, periodMs: 60000, autoApprove: false },
  { name: 'Silver', requests: 30, periodMs: 60000, autoApprove: true },
  { name: 'Bronze', requests: 3, periodMs: 60000, autoApprove: true },
]
// the client application an app uses to call the layer below: one for the Process APIs, one for the Experience APIs
const clientOfCaller = (d) => (d.layer === 'Experience' ? EXPERIENCE_CLIENT : PROCESS_CLIENT)
const callersOf = (name) => DEPLOYED.filter((d) => callsOf(d).includes(name))
const internalClientsOf = (name) => [...new Set(callersOf(name).map(clientOfCaller))]
// the channels and partners and the tier each one gets
const CHANNEL_CONTRACTS = [
  ['web-shop-exp-api', 'Brightmart Web Shop', 'Gold'],
  ['web-shop-exp-api', QA_CLIENT, 'Bronze'],
  ['mobile-app-exp-api', 'Brightmart Mobile App', ''],
  ['store-tablet-exp-api', 'Store Tablet', ''],
  ['partner-b2b-exp-api', 'Driftwood Cafes', 'Gold'],
  ['supplier-exp-api', 'Northwind Supplies', 'Silver'],
]
const CHANNEL_CLIENTS = ['Brightmart Web Shop', 'Brightmart Mobile App', 'Store Tablet', 'Driftwood Cafes', 'Northwind Supplies']

const p8 = {}
p8.api = (s, d, env = 'Sandbox') => s.apis.find((a) => a.env === env && a.assetId === assetIdOf(d) && a.version === versionOf(d))
p8.designed = (raml, d) => ramlErrors(raml).length === 0 && d.routes.every((x) => mockCall(raml, x.m, filled(x.p)).status === x.status)
p8.project = (s, name) => s.projects.find((p) => p.raml && p8.designed(p.raml, estateDef(name)))
p8.published = (s, name) => {
  const d = estateDef(name)
  return s.assets.some((a) => a.assetId === name && a.version === versionOf(d) && a.apiVersion === 'v1' && (a.lifecycle ?? 'stable') === 'stable' && p8.designed(a.raml, d))
}
p8.studioOk = (s, name) => {
  const p = s.studio.find((x) => x.name === name)
  return Boolean(p?.jar) && p.pkg === name && p.version === versionOf(estateDef(name)) && p.autodiscovery?.apiId === '${api.id}' && p.autodiscovery?.flowRef === `${name}-main`
}
p8.has = (api, type, test = () => true) => (api?.policies ?? []).some((p) => p.type === type && test(p.settings ?? {}))
p8.internalOk = (api) => p8.has(api, 'client-id') && p8.has(api, 'ip-allow', (x) => String(x.list ?? '').split(/[\s,]+/).includes('10.0.0.0/8'))
p8.tiersOk = (api) => TIERS.every((t) => (api?.tiers ?? []).some((x) => x.name === t.name && Number(x.requests) === t.requests && Number(x.periodMs) === t.periodMs && Boolean(x.autoApprove) === t.autoApprove))
p8.policiesOk = (s, d, env = 'Sandbox') => {
  const api = p8.api(s, d, env)
  if (!api) return false
  if (d.layer !== 'Experience') return p8.internalOk(api)
  if (SLA.includes(d.name)) return p8.has(api, 'rate-limit-sla') && p8.tiersOk(api)
  return p8.has(api, 'client-id')
}
p8.layerOk = (s, layer, env = 'Sandbox') => ofLayer(layer).every((d) => p8.policiesOk(s, d, env))
p8.contract = (s, d, client, env = 'Sandbox') => p8.api(s, d, env)?.contracts.find((c) => c.client === client)
p8.internalContracts = (s, env = 'Sandbox') =>
  [PROCESS_CLIENT, EXPERIENCE_CLIENT].every((c) => s.clients.some((x) => x.name === c)) && DEPLOYED.every((d) => internalClientsOf(d.name).every((c) => p8.contract(s, d, c, env)?.status === 'approved'))
p8.channelContracts = (s, env = 'Sandbox', approved = false) =>
  CHANNEL_CONTRACTS.every(([name, client, tier]) => {
    const c = p8.contract(s, estateDef(name), client, env)
    return Boolean(c) && (c.tier ?? '') === tier && (approved ? c.status === 'approved' : ['approved', 'pending'].includes(c.status))
  })
p8.webAlert = (s, env = 'Sandbox') => (p8.api(s, estateDef('web-shop-exp-api'), env)?.alerts ?? []).some((a) => a.enabled && a.type === 'Response Code' && [500, 503].every((c) => (a.codes ?? []).includes(c)) && String(a.recipients ?? '').toLowerCase().includes(DIGITAL))

// The specs of the domain teams, as Exchange holds them: v1 before v2 of the same asset
function teamAssets() {
  const list = DEPLOYED.filter((d) => !LEARNER.includes(d.name)).sort((a, b) => (assetIdOf(a) === assetIdOf(b) ? (a.apiVersion < b.apiVersion ? -1 : 1) : 0))
  return list.map((d, i) => ({ assetId: assetIdOf(d), name: d.title, version: versionOf(d), apiVersion: d.apiVersion ?? 'v1', lifecycle: d.lifecycle ?? 'stable', raml: ramlOf(d), t: at(7, 15, i), team: d.team, tags: [d.layer, d.domain] }))
}

function part8Start() {
  const s = nextDay(solvedOf(part7), 8, {
    mail: [
      {
        subject: 'Go-live part 8: the API layers',
        body: [
          `Good morning. The systems are ready, so today the API layers: ${DEPLOYED.length} APIs, ${ofLayer('System').length} System, ${ofLayer('Process').length} Process and ${ofLayer('Experience').length} Experience. The domain teams published their specs in Exchange yesterday. customers-sys-api and products-sys-api each have a v1 and a v2, and customers v1 is deprecated. Three APIs of the order path are ours to design: ${LEARNER.join(', ')}. Design each one, mock it, publish it with the version the build uses (${LEARNER.map((n) => `${n} ${versionOf(estateDef(n))}`).join(', ')}), API version v1, and import it into Studio with API Autodiscovery on \${api.id} and the main flow.`,
          `Every API gets an instance in Sandbox, label <name>-sbx, with the asset version of its build. System and Process: Client ID Enforcement and an IP allowlist of 10.0.0.0/8, so only our own apps reach them. Experience: Client ID Enforcement for the mobile app and the store tablet. The web shop, partner B2B and supplier APIs get Rate Limiting: SLA-Based with the tiers Gold 120 per minute with manual approval, Silver 30 and Bronze 3 per minute, both automatic.`,
          `The apps call the layer below with two client applications: ${PROCESS_CLIENT} for the Process APIs and ${EXPERIENCE_CLIENT} for the Experience APIs. Each one needs a contract on every API its apps call. The channels: Brightmart Web Shop on Gold of web-shop-exp-api, Brightmart Mobile App on mobile-app-exp-api, Store Tablet on store-tablet-exp-api, Driftwood Cafes on Gold of partner-b2b-exp-api, Northwind Supplies on Silver of supplier-exp-api. QA wants a client ${QA_CLIENT} on Bronze of web-shop-exp-api for the quota test. Server errors of the web shop API go to ${DIGITAL}.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  return { ...s, env: 'Sandbox', assets: [...s.assets, ...teamAssets()], clients: [...s.clients, ...structuredClone(CHANNELS.filter((c) => CHANNEL_CLIENTS.includes(c.name)))], studioPkgs: { ...s.studioPkgs, ...Object.fromEntries(LEARNER.map((n) => [n, n])) } }
}

const layerList = (layer) => ofLayer(layer).map((d) => `${d.name} ${versionOf(d)}`).join(', ')
const part8 = {
  id: 'p-golive-8',
  group: 'Brightmart go-live',
  title: 'Go-live part 8: the API layers, specs, instances, policies and contracts',
  minutes: 70,
  scenario: `Day 8 of the Brightmart go-live. The systems run, so today the API layers on top of them: ${DEPLOYED.length} APIs over System, Process and Experience. Design and publish the three APIs of the order path, give every API an instance with the right policies, and give every app and channel the contracts it needs.`,
  start: () => part8Start(),
  steps: [
    { title: 'Read the API plan', how: 'Open the Inbox from the menu under Lab tools. Note the three APIs to design, the policies per layer, the tiers and the client applications.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'See what the domain teams published', how: 'Exchange, search customers and open Customers System API. It has v2 2.2.0 and the deprecated v1 1.6.0. The Process and Experience APIs that call it decide which instance they need.', done: (s) => Boolean(s.seen['asset:customers-sys-api']) },
    {
      title: 'Design the Notifications System API and mock it',
      how: 'Design Center, Create new, New API Specification, Project Name Notifications System API, RAML 1.0, Create API. Paste the spec into the RAML editor. Turn on the Mocking service, pick POST /emails, Try it, Send: 202 with the example.',
      code: ramlOf(estateDef('notifications-sys-api')),
      done: (s) => Boolean(p8.project(s, 'notifications-sys-api')) && Boolean(s.seen.mock),
    },
    {
      title: 'Design the Orders Process API and the Web Shop Experience API',
      how: 'The same way, two more projects: Orders Process API with the first spec below, Web Shop Experience API with the second. The mocking service answers POST /orders and POST /checkout with 201.',
      code: `${ramlOf(estateDef('orders-prc-api'))}\n\n${ramlOf(estateDef('web-shop-exp-api'))}`,
      done: (s) => Boolean(p8.project(s, 'orders-prc-api')) && Boolean(p8.project(s, 'web-shop-exp-api')),
    },
    {
      title: 'Publish the three specs to Exchange',
      how: `In each project, Publish, Publish to Exchange: Asset ID the API name (${LEARNER.join(', ')}), Asset version ${LEARNER.map((n) => versionOf(estateDef(n))).join(', ')} in that order, API version v1, LifeCycle State Stable.`,
      done: (s) => LEARNER.every((n) => p8.published(s, n)),
    },
    ask(
      'Design first',
      'Why do the specs go to Exchange before a line of Mule code is written?',
      [
        'Exchange refuses a jar without a spec',
        'The spec is the contract. Published and mocked, the web shop team builds against it today, the reviewers check it, API Manager can manage it, and Studio scaffolds the flows from it, so the code follows the contract and not the other way around',
        'It makes the API faster',
        'Specs are only for documentation',
      ],
      1,
      'Design first lets consumers and implementers work at the same time against one agreed contract. A change found in a mock costs minutes. Found after go-live it costs a new major version.',
    ),
    {
      title: 'Import the three APIs into Studio and export the jars',
      how: 'Studio from the console menu, Import a published API, pick each of the three. Create API Autodiscovery: API ID ${api.id}, Flow Name <api name>-main, OK. Then Export.',
      done: (s) => LEARNER.every((n) => p8.studioOk(s, n)),
    },
    {
      title: `The ${ofLayer('System').length} System API instances`,
      how: `API Manager, Sandbox, Add API, Add new API, Mule Gateway, pick the asset and its Asset version, Instance label <name>-sbx, Save & Deploy. For each of: ${layerList('System')}. On each one, Policies: Client ID Enforcement, and IP Allowlist with 10.0.0.0/8.`,
      done: (s) => p8.layerOk(s, 'System'),
    },
    {
      title: `The ${ofLayer('Process').length} Process API instances`,
      how: `The same for ${layerList('Process')}: label <name>-sbx, Client ID Enforcement and IP Allowlist 10.0.0.0/8.`,
      done: (s) => p8.layerOk(s, 'Process'),
    },
    ask(
      'Two locks on the inner layers',
      'The System and Process APIs have no public callers. Why do they get both an IP allowlist and Client ID Enforcement?',
      [
        'One policy per API is not allowed',
        'Defence in depth. The allowlist keeps out anything outside the network of Brightmart. The client ID says which app calls, so a contract can be revoked for one app, and Monitoring shows who calls what. Either lock alone fails open when the other is misconfigured',
        'The IP allowlist makes the calls faster',
        'Client ID Enforcement replaces TLS',
      ],
      1,
      'Zero trust inside the network: being inside is not enough to call an API. In API-led connectivity each layer authenticates the layer above, and the contracts document the dependencies between the apps.',
    ),
    {
      title: `The ${ofLayer('Experience').length} Experience API instances with their tiers`,
      how: `The same for ${layerList('Experience')}. mobile-app-exp-api and store-tablet-exp-api: Client ID Enforcement. web-shop-exp-api, partner-b2b-exp-api and supplier-exp-api: SLA tiers, Add SLA tier Gold 120 per 1 minute Manual, Silver 30 Automatic, Bronze 3 Automatic, then the policy Rate Limiting: SLA-Based.`,
      done: (s) => p8.layerOk(s, 'Experience'),
    },
    {
      title: 'The client applications of the apps and their contracts',
      how: `Exchange, open each API that an app calls, Request access: API Instance <name>-sbx, Application + ${PROCESS_CLIENT} (the first time), Request access. ${PROCESS_CLIENT} needs a contract on every System API and on availability-prc-api, which catalog-prc-api calls. ${EXPERIENCE_CLIENT} needs one on every Process API that an Experience API calls.`,
      done: (s) => p8.internalContracts(s),
    },
    {
      title: 'The contracts of the channels, partners and QA',
      how: `Exchange, Request access for each: Brightmart Web Shop on web-shop-exp-api SLA tier Gold, ${QA_CLIENT} (a new application) on web-shop-exp-api Bronze, Brightmart Mobile App on mobile-app-exp-api, Store Tablet on store-tablet-exp-api, Driftwood Cafes on partner-b2b-exp-api Gold, Northwind Supplies on supplier-exp-api Silver.`,
      done: (s) => p8.channelContracts(s),
    },
    {
      title: 'Approve the Gold contracts',
      how: 'API Manager, web-shop-exp-api-sbx, Client Applications: Brightmart Web Shop is pending, Approve. The same for Driftwood Cafes on partner-b2b-exp-api-sbx.',
      done: (s) => p8.channelContracts(s, 'Sandbox', true),
    },
    ask(
      'Why Gold waits',
      'Silver and Bronze approve themselves. Why is Gold set to manual approval?',
      [
        'Manual approval is the default',
        'Gold is 40 times the quota of Bronze. A person checks who asks and why before an app can put that load on the order path, so a test client or an unknown partner cannot take capacity the web shop needs on launch day',
        'Gold contracts cost money',
        'Manual tiers have no limit',
      ],
      1,
      'SLA tiers turn capacity into a product. Automatic tiers keep onboarding fast for small quotas, and manual approval puts a human gate on the large ones.',
    ),
    {
      title: 'Alert the digital team on server errors of the web shop API',
      how: `API Manager, web-shop-exp-api-sbx, Alerts, Add alert: name Web shop server errors, Severity Critical, Alert type Response Code, tick 500, 502 and 503, Occurrences at least 1, For at least 1 period of 1 minute, Recipients ${DIGITAL}. Create Alert.`,
      done: (s) => p8.webAlert(s),
    },
  ],
  why: 'API-led connectivity is a set of contracts before it is code. The domain teams and the go-live team publish the specs to Exchange, so every consumer and every implementer works against the same contract, and Studio scaffolds the implementation from it with API Autodiscovery on a property. Every API gets an instance per environment. The inner layers trust nobody: an IP allowlist and a client ID with a contract per calling app. The outer layer sells capacity in SLA tiers, with a manual gate on the largest one. The contracts now document who calls whom, which the deploy of part 9 uses.',
  docs: 'https://docs.mulesoft.com/api-manager/latest/',
  solve(start) {
    let s = mark(mark(start, 'inbox'), 'asset:customers-sys-api')
    for (const name of LEARNER) {
      const d = estateDef(name)
      s = createProject(s, d.title)
      const id = s.projects.at(-1).id
      s = saveProject(s, id, ramlOf(d))
      s = mark(s, 'mock')
      s = publish(s, id, { assetId: name, name: d.title, version: versionOf(d), apiVersion: 'v1', lifecycle: 'stable' }).state
    }
    for (const name of LEARNER) {
      s = importSpec(s, name)
      s = setStudio(s, name, { autodiscovery: { apiId: '${api.id}', flowRef: `${name}-main` } })
      s = packageJar(s, name)
    }
    for (const layer of LAYERS) {
      for (const d of ofLayer(layer)) {
        s = addApi(s, { assetId: assetIdOf(d), version: versionOf(d), label: labelOf(d), upstream: '', consumer: '' })
        const id = s.lastApi
        if (layer !== 'Experience') {
          s = applyPolicy(s, id, 'client-id')
          s = applyPolicy(s, id, 'ip-allow', { list: '10.0.0.0/8' })
        } else if (SLA.includes(d.name)) {
          for (const t of TIERS) s = addTier(s, id, { ...t })
          s = applyPolicy(s, id, 'rate-limit-sla')
        } else s = applyPolicy(s, id, 'client-id')
      }
    }
    s = createClient(s, PROCESS_CLIENT)
    s = createClient(s, EXPERIENCE_CLIENT)
    for (const d of DEPLOYED) for (const c of internalClientsOf(d.name)) s = requestAccess(s, p8.api(s, d).id, c)
    s = createClient(s, QA_CLIENT)
    for (const [name, client, tier] of CHANNEL_CONTRACTS) s = requestAccess(s, p8.api(s, estateDef(name)).id, client, tier || undefined)
    for (const [name, client] of [['web-shop-exp-api', 'Brightmart Web Shop'], ['partner-b2b-exp-api', 'Driftwood Cafes']]) s = setContract(s, p8.api(s, estateDef(name)).id, client, { status: 'approved' })
    return addApiAlert(s, p8.api(s, estateDef('web-shop-exp-api')).id, { name: 'Web shop server errors', enabled: true, severity: 'Critical', type: 'Response Code', codes: [500, 502, 503], ms: 1000, policy: 'Any', atLeast: 1, periods: 1, period: 1, recipients: DIGITAL })
  },
  answers: { 5: 1, 9: 1, 14: 1 },
}

// ---------- part 9: every app deployed ----------

const TIMEOUT = { Experience: '8000', Process: '6000', System: '4000' }
const internalUrl = (name, env) => `https://${name}-lab1a2.internal-${shortEnv(env)}.usa-e2.cloudhub.example/api`
const hostOf = (b, env) => (env === 'Production' ? b.prd : b.sbx)
// the System APIs over the systems set up in parts 2 to 6: Salesforce, SAP, SQL Server, the mail server, Partner Manager
const REAL_SYSTEMS = ['customers-sys-api', 'customers-sys-api-v1', 'inventory-sys-api', 'purchase-orders-sys-api', 'edi-sys-api', 'pos-sys-api', 'notifications-sys-api']
const SYS_REAL = ofLayer('System').filter((d) => REAL_SYSTEMS.includes(d.name))
const SYS_OTHER = ofLayer('System').filter((d) => !REAL_SYSTEMS.includes(d.name))
const LOGGED = ['web-shop-exp-api', 'orders-prc-api', 'notifications-sys-api']
const clientNamed = (s, name) => s.clients.find((c) => c.name === name)
const appIn = (s, name, env = 'Sandbox') => s.apps.find((a) => a.name === name && a.env === env)
const jarFileOf = (d) => `${d.name}-${d.build}-mule-application.jar`
// the jars of the domain teams, linked to API Manager by ${api.id}
const estateJar = (d) => ({ pkg: d.name, autodiscovery: { apiId: '${api.id}', flowRef: `${d.name}-main` }, jar: jarFileOf(d) })

// The properties of one app in one environment, as the deploy sheet lists them
function estateConfig(s, d, env) {
  const calls = callsOf(d)
  const b = d.backend
  const c = calls.length ? clientNamed(s, clientOfCaller(d)) : null
  return {
    props: {
      [LAYER_PROPERTY]: d.layer,
      'api.id': p8.api(s, d, env)?.id ?? '',
      ...(calls.length && { 'http.timeout': TIMEOUT[d.layer] }),
      ...Object.fromEntries(calls.map((t) => [urlKey(t), internalUrl(t, env)])),
      ...(c && { 'client.id': c.clientId }),
      ...(b && { [b.key]: hostOf(b, env) }),
      'anypoint.platform.client_id': s.creds[env].id,
    },
    secrets: { ...(c && { 'client.secret': c.clientSecret }), ...(b && { [b.secret]: secretOf(d, env) }), 'anypoint.platform.client_secret': s.creds[env].secret },
  }
}
// what the learner pastes: the values come from the sheet, the IDs from API Manager and Exchange
function sheetOf(list, env = 'Sandbox') {
  return list
    .map((d) => {
      const calls = callsOf(d)
      const b = d.backend
      const lines = [
        `# ${d.name}, file ${jarFileOf(d)}`,
        `${LAYER_PROPERTY}=${d.layer}`,
        `api.id=<API Instance ID of ${labelOf(d, env)}>`,
        ...(calls.length ? [`http.timeout=${TIMEOUT[d.layer]}`, ...calls.map((t) => `${urlKey(t)}=${internalUrl(t, env)}`), `client.id=<Client ID of ${clientOfCaller(d)}>`] : []),
        ...(b ? [`${b.key}=${hostOf(b, env)}`] : []),
        `anypoint.platform.client_id=<Client ID of ${env}>`,
        '# protected',
        ...(calls.length ? [`client.secret=<Client Secret of ${clientOfCaller(d)}>`] : []),
        ...(b ? [`${b.secret}=${secretOf(d, env)}`] : []),
        `anypoint.platform.client_secret=<Client Secret of ${env}>`,
      ]
      return lines.join('\n')
    })
    .join('\n\n')
}
const p9 = {}
p9.configOk = (s, d, env = 'Sandbox') => {
  const a = appIn(s, d.name, env)
  if (!a) return false
  const want = estateConfig(s, d, env)
  const props = a.props ?? {}
  const secrets = a.secrets ?? {}
  return Object.entries(want.props).every(([k, v]) => props[k] === v) && Object.entries(want.secrets).every(([k, v]) => secrets[k] === v && props[k] === undefined)
}
p9.live = (s, d, env = 'Sandbox') => {
  const a = appIn(s, d.name, env)
  const api = p8.api(s, d, env)
  return a?.status === 'Running' && Boolean(api) && pairing(s, a).api?.id === api.id && apiStatus(s, api) === 'Active' && p9.configOk(s, d, env)
}
p9.allLive = (s, list, env = 'Sandbox') => list.every((d) => p9.live(s, d, env))
p9.splunkOk = (s, name) => {
  const a = appIn(s, name)
  const token = p1.token(s)
  return Boolean(a?.disableChLogs) && Boolean(token) && a.secrets?.['splunk.hec.token'] === token.value && /Http name="Splunk"[^>]*index=mule/.test(a.log4j ?? '') && /CLOUDHUB/.test(a.log4j ?? '') && /<Async /.test(a.log4j ?? '') && p9.live(s, estateDef(name))
}
// The deploy of one estate app, as the Deploy application page does it with the file chosen from the list
function deployEstate(s, d, env = 'Sandbox') {
  const file = jarsOf(s).find((j) => j.pkg === d.name && j.jar === jarFileOf(d))
  const { props, secrets } = estateConfig(s, d, env)
  return finishDeploys(deployApp(s, { ...file, name: d.name, replicas: 1, vCores: 0.1, props, secrets }).state)
}

function part9Start() {
  const s = nextDay(solvedOf(part8), 9, {
    logs: 0,
    keepMail: 1,
    jars: DEPLOYED.filter((d) => !LEARNER.includes(d.name)).map(estateJar),
    mail: [
      {
        subject: 'Go-live part 9: the deploy sheet',
        body: [
          `Good morning. The domain teams handed over their jars, and ours came out of Studio yesterday. Today every app of the ${DEPLOYED.length} goes to Sandbox, bottom up: the System APIs first, then Process, then Experience. Each app gets the properties of the sheet in the step: its layer for Visualizer, the ID of its API instance, the host of its system, the addresses of the APIs it calls with the client application of its layer and a timeout, and the client ID of the environment. The backend keys, the client secrets and the environment secret are protected properties.`,
          `The System APIs over our own systems log on with the integration users we made: mule.integration in Salesforce, MULE_RFC in SAP, ${POS_LOGIN} on brightmart-sql, no-reply on the mail server and the Northwind flows of Partner Manager. Prove three of them with the API client as ${PROCESS_CLIENT}.`,
          `Then ${LOGGED.join(', ')} forward their logs to Splunk with the token ${HEC_TOKEN}, and each Process API alerts ${OPS} on errors.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  return s
}

const deployHow = (list) => `Runtime Manager, Sandbox, Deploy application: Application Name the API name, Application File the jar of the sheet, Replicas 1, 0.1 vCores. Properties, Text view: paste the lines of the app with your IDs, then make the lines under # protected protected properties. Deploy. Repeat for ${list.map((d) => d.name).join(', ')}. API Manager shows each instance Active.`
const part9 = {
  id: 'p-golive-9',
  group: 'Brightmart go-live',
  title: 'Go-live part 9: every app deployed to Sandbox',
  minutes: 75,
  scenario: `Day 9 of the Brightmart go-live. All ${DEPLOYED.length} API apps go to Sandbox with the properties of the deploy sheet, bottom up, each paired with its API instance and Active. Then the first calls through the three layers, Visualizer, log forwarding to Splunk and alerts on the Process layer.`,
  start: () => part9Start(),
  steps: [
    { title: 'Read the deploy sheet', how: 'Open the Inbox from the menu under Lab tools. The properties per app are in the deploy steps.', done: (s) => Boolean(s.seen.inbox) },
    ask(
      'Bottom up',
      'Why do the System APIs go first and the Experience APIs last?',
      [
        'Runtime Manager deploys in alphabetical order',
        'Each layer calls the one below it. Deployed bottom up, every app finds the APIs it calls running when it gets its first request, and each layer can be tested on its own before the next goes on top. Top down, the first calls of the channels hit addresses that do not answer yet',
        'System APIs need more memory',
        'The Experience APIs have no properties',
      ],
      1,
      'The same order holds in Production, and the reverse order for a rollback: the outer layer goes back first so no channel calls a half changed chain.',
    ),
    { title: 'Get the client ID of Sandbox', how: 'API Manager, Sandbox, Environment information. The Client ID and Client Secret pair each app with API Manager through anypoint.platform.client_id and client_secret.', done: (s) => Boolean(s.seen['env:Sandbox']) },
    {
      title: `The ${SYS_REAL.length} System APIs over our own systems`,
      how: deployHow(SYS_REAL),
      code: sheetOf(SYS_REAL),
      done: (s) => p9.allLive(s, SYS_REAL),
    },
    {
      title: 'Prove that they reach the systems',
      how: `API client, as ${PROCESS_CLIENT}: customers-sys-api GET /customers/C-7 gives the Salesforce ID of Mara Quinn, inventory-sys-api GET /stock/H-100 the stock of plant 1000 in SAP, pos-sys-api GET /stores/S-12/stock/H-100 the count of store S-12 from brightmart-sql.`,
      done: (s) => p9.allLive(s, SYS_REAL) && called(s, 'customers-sys-api', 200, 'GET', /^\/customers\/C-7/) && called(s, 'inventory-sys-api', 200, 'GET', /^\/stock\/H-100/) && called(s, 'pos-sys-api', 200, 'GET', /^\/stores\/S-12\/stock\/H-100/),
    },
    {
      title: `The other ${SYS_OTHER.length} System APIs`,
      how: deployHow(SYS_OTHER),
      code: sheetOf(SYS_OTHER),
      done: (s) => p9.allLive(s, SYS_OTHER),
    },
    ask(
      'Where the keys go',
      'Why are the backend keys, the client secrets and the environment secret protected properties, while the hosts are plain ones?',
      [
        'Protected properties load faster',
        'A protected property is stored encrypted and never shown again in Runtime Manager or its API, so a viewer of the app cannot read it. Hosts are not secret and must stay readable for support. The jar holds neither, so one jar runs in Sandbox and in Production',
        'Plain properties cannot hold passwords',
        'Hosts change more often',
      ],
      1,
      'Configuration lives outside the jar, secrets are protected, and the values differ per environment. Production gets its own sheet with its own hosts and keys in part 11.',
    ),
    {
      title: `The ${ofLayer('Process').length} Process APIs`,
      how: deployHow(ofLayer('Process')),
      code: sheetOf(ofLayer('Process')),
      done: (s) => p9.allLive(s, ofLayer('Process')),
    },
    {
      title: `The ${ofLayer('Experience').length} Experience APIs`,
      how: deployHow(ofLayer('Experience')),
      code: sheetOf(ofLayer('Experience')),
      done: (s) => p9.allLive(s, ofLayer('Experience')),
    },
    {
      title: 'A first call through the three layers',
      how: 'API client, web-shop-exp-api as Brightmart Web Shop, GET /products/H-100: 200. It goes through catalog-prc-api to products, prices and availability, and from there to SAP and the store database.',
      done: (s) => p9.allLive(s, DEPLOYED) && called(s, 'web-shop-exp-api', 200, 'GET', /^\/products\/H-100/),
    },
    { title: 'See the layers in Visualizer', how: 'Open Visualizer from the menu and choose catalog-prc-api. The map has the Experience, Process and System layers with the lines of the call.', done: (s) => p9.allLive(s, DEPLOYED) && Boolean(s.seen['vis:catalog-prc-api']) },
    {
      title: 'Forward the logs of the order path to Splunk',
      how: `Splunk, In the Mule app, for ${LOGGED.join(', ')}: Insert template (index mule, the Async wrapper and the CLOUDHUB appender), tick Disable CloudHub logs, Redeploy. Then in Runtime Manager add the protected property splunk.hec.token with the value of the token ${HEC_TOKEN} from Splunk, HTTP Event Collector.`,
      done: (s) => LOGGED.every((n) => p9.splunkOk(s, n)),
    },
    {
      title: 'Alert ops on errors of the Process APIs',
      how: `Monitoring, Alerts, Create Alert for each Process API: Resource Application, Metric Message Error Count, Above 0 for 1 minute, Severity High, Recipients ${OPS}.`,
      done: (s) => ofLayer('Process').every((d) => alerted(s, d.name, OPS)),
    },
  ],
  why: 'A big deploy is many small ones in a fixed order. Bottom up, each layer finds the layer below it running, and each app is paired with its API instance through API Autodiscovery, a property and the client ID of the environment, so it is Active and its policies apply from the first request. The jars are the same in every environment: the sheet gives the hosts, the addresses of the APIs below and the client of the layer, and the secrets go in as protected properties. Proving the System APIs against the real systems first means a failure of the whole chain later is about the chain and not about a password.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-deploy-cloudhub',
  solve(start) {
    let s = mark(mark(start, 'inbox'), 'env:Sandbox')
    for (const d of SYS_REAL) s = deployEstate(s, d)
    const internal = clientNamed(s, PROCESS_CLIENT)
    s = call(s, 'customers-sys-api', internal, '/customers/C-7').state
    s = call(s, 'inventory-sys-api', internal, '/stock/H-100').state
    s = call(s, 'pos-sys-api', internal, '/stores/S-12/stock/H-100').state
    for (const d of [...SYS_OTHER, ...ofLayer('Process'), ...ofLayer('Experience')]) s = deployEstate(s, d)
    s = call(s, 'web-shop-exp-api', clientNamed(s, 'Brightmart Web Shop'), '/products/H-100').state
    s = mark(mark(s, 'visualizer'), 'vis:catalog-prc-api')
    const token = p1.token(s).value
    for (const name of LOGGED) s = change(s, name, { log4j: log4jTemplate({ index: INDEX }), disableChLogs: true, secrets: { ...appIn(s, name).secrets, 'splunk.hec.token': token } })
    for (const d of ofLayer('Process')) s = errorAlert(s, d.name, OPS, `${d.title} errors`)
    return s
  },
  answers: { 1: 1, 6: 1 },
}

// ---------- part 10: the test run ----------

const QA_LEAD = 'Priya Nand, QA lead'
const TEST_ORDER = 'O-3001'
const RETRY_ORDER = 'O-3002'
const orderBody = (id) => JSON.stringify({ orderId: id, cartId: 'K-55', customerId: 'C-7', payment: 'card', lines: [{ sku: 'H-100', qty: 2 }] })
const DEEP_BODY = '{"orderId":"O-3999","cart":{"a":{"b":{"c":{"d":{"e":{"f":"too deep"}}}}}}}'
const OUTSIDE_IP = '203.0.113.9'
const CUSTOMER_MAIL = 'mara.quinn@mail.example'
const TRACKING = `/orders/${TEST_ORDER}/tracking`
const p10 = {}
p10.since = at(10, 0)
// the requests that reached an app today, from the events of the console
p10.hits = (s, name, status, method, path, client) =>
  (s.events ?? []).filter((e) => e.k === 'in' && e.app === name && e.env === 'Sandbox' && e.t >= p10.since && e.s === status && (!method || e.m === method) && (!path || path.test(e.p)) && (!client || e.c === client))
p10.hit = (...args) => p10.hits(...args).length > 0
p10.sapOrders = (s, po) => Object.values(s.sap?.orders ?? {}).filter((o) => o.po === po && o.kunnr === '4711' && o.t >= p10.since)
p10.ordered = (s) => p10.sapOrders(s, TEST_ORDER).length === 1 && p10.hit(s, 'web-shop-exp-api', 201, 'POST', /^\/checkout$/, 'Brightmart Web Shop')
p10.mailed = (s, id) => (s.mailServer?.outbound ?? []).some((m) => m.to === CUSTOMER_MAIL && String(m.subject).includes(id) && m.client === 'notifications-sys-api')
p10.splunkOk = (s) => {
  const sp = s.observability?.splunk
  const l = sp?.lastSearch
  const cid = String(l?.q ?? '').match(/correlationId\s*=\s*"?([\w-]+)/)?.[1]
  if (!cid || !(l.n > 0) || !(l.t >= p10.since)) return false
  const events = (sp.events ?? []).filter((e) => e.correlationId === cid)
  return LOGGED.every((n) => events.some((e) => e.app === n)) && events.some((e) => /POST \/checkout received/.test(e.message))
}
p10.jsonThreat = (s) => p8.has(p8.api(s, estateDef('web-shop-exp-api')), 'json-threat', (x) => Number(x.depth) > 0 && Number(x.depth) <= 10)
p10.down = (s) =>
  p10.hit(s, 'web-shop-exp-api', 502, 'POST', /^\/checkout$/) &&
  s.mail.some((m) => m.t >= p10.since && m.to === OPS && /Orders Process API errors/.test(m.subject)) &&
  s.mail.some((m) => m.t >= p10.since && m.to === DIGITAL && /Web shop server errors/.test(m.subject))
p10.retried = (s) => {
  const failed = p10.hits(s, 'web-shop-exp-api', 502, 'POST', /^\/checkout$/).at(-1)
  return Boolean(failed) && s.backends?.erp?.up !== false && p10.hits(s, 'web-shop-exp-api', 201, 'POST', /^\/checkout$/).some((e) => e.t > failed.t) && p10.sapOrders(s, RETRY_ORDER).length === 1
}

function part10Start() {
  return nextDay(solvedOf(part9), 10, {
    logs: 0,
    keepMail: 1,
    mail: [
      {
        source: QA_LEAD,
        subject: 'Go-live part 10: the test plan',
        body: [
          'Good morning. Everything is deployed, so today the end to end test before we ask for the Production change. One order, followed through every layer and every system it touches, then the other channels, then the negative tests and the failure of a system.',
          `1. Happy path. POST /checkout to web-shop-exp-api as Brightmart Web Shop with the body ${orderBody(TEST_ORDER)}. Expect 201. Follow its X-Correlation-ID through the logs and Visualizer, find the sales order in SAP (VA03), the confirmation mail to ${CUSTOMER_MAIL} in the mail server log, and the events of the order in Splunk.`,
          '2. The other channels, one read each. Mobile App GET /me/C-7 on mobile-app-exp-api, Northwind Supplies GET /purchase-orders/PO-7781 on supplier-exp-api.',
          `3. Negative tests. No client: 401. A System API called from outside our network (Source IP ${OUTSIDE_IP}): 403. ${QA_CLIENT} over its Bronze quota: 429. A body nested too deep after JSON Threat Protection on the web shop API: 400.`,
          `4. A system down. Stop SAP on the Backends page, place an order: the web shop gets 502, and ${OPS} and ${DIGITAL} get their alerts. Start SAP again and place the same order again as ${RETRY_ORDER}: 201 and one sales order in SAP.`,
          `5. Load. The burst of ${QA_CLIENT} in part 3 is the load check of the gateway: 10 requests at once, 3 served and 7 refused before they reach an app. Then the dashboard of web-shop-exp-api shows the whole run: the response times, the 4xx of the negative tests and the 502 while SAP was down.`,
          'Priya',
        ].join('\n\n'),
      },
    ],
  })
}

const part10 = {
  id: 'p-golive-10',
  group: 'Brightmart go-live',
  title: 'Go-live part 10: the end to end test run',
  minutes: 60,
  scenario: `Day 10 of the Brightmart go-live. QA runs the end to end test in Sandbox: one order of the web shop followed through the three layers into Salesforce, SAP, the order and warehouse systems, the carrier and the confirmation mail, then the other channels, the negative tests, a system that fails and comes back, and a load check.`,
  start: () => part10Start(),
  steps: [
    { title: 'Read the test plan', how: 'Open the Inbox from the menu under Lab tools. QA lists five parts with the expected result of each.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Place the test order ${TEST_ORDER}`,
      how: `API client, web-shop-exp-api, Send as Brightmart Web Shop, POST /checkout with the body of the test plan, Send: 201. Note the X-Correlation-ID of the answer.`,
      code: orderBody(TEST_ORDER),
      done: p10.ordered,
    },
    {
      title: 'Follow it through the layers',
      how: 'Runtime Manager, orders-prc-api, Logs: search the correlation ID. Each call to a System API is a line with its address and answer. Then Visualizer, choose orders-prc-api: one line to each of the seven System APIs.',
      done: (s) => p10.ordered(s) && Boolean(s.seen['logs:orders-prc-api']) && Boolean(s.seen['vis:orders-prc-api']),
    },
    {
      title: 'Find it in SAP and in the mail server',
      how: `SAP GUI, VA03: the newest sales order of sold to party 4711 carries the purchase order number ${TEST_ORDER} and H-100. Mail server, Log: the confirmation to ${CUSTOMER_MAIL} left over SMTP from no-reply.`,
      done: (s) => p10.ordered(s) && Boolean(s.seen['sap:VA03']) && Boolean(s.seen['mail-log']) && p10.mailed(s, TEST_ORDER),
    },
    {
      title: 'Find it in Splunk by its correlation ID',
      how: 'Move the clock 1 minute so the appenders send. Splunk, Search: index=mule correlationId=<the ID>, Last 15 minutes. The events of web-shop-exp-api, orders-prc-api and notifications-sys-api share the ID.',
      done: p10.splunkOk,
    },
    ask(
      'One ID across the estate',
      'Why does the test follow one correlation ID, and not only check that the answer was 201?',
      [
        'The ID is needed to place an order',
        'A 201 says the web shop got an answer. The ID shows that every step happened, in which app, in what order and how long each took, and it is what support uses on launch day to find one customer order across ten apps and the log server',
        'Splunk refuses searches without an ID',
        'It makes the order faster',
      ],
      1,
      'Mule passes the X-Correlation-ID from the first request to each HTTP request it makes, so every log line of the chain carries it. A test that follows it proves the observability as well as the function.',
    ),
    {
      title: 'Test the other channels',
      how: 'API client: mobile-app-exp-api GET /me/C-7 as Brightmart Mobile App reads Salesforce and the loyalty platform, supplier-exp-api GET /purchase-orders/PO-7781 as Northwind Supplies reads SAP and Partner Manager. Each one 200. The store tablet and partner B2B APIs share their Process APIs with these and with the web shop.',
      done: (s) => p10.hit(s, 'mobile-app-exp-api', 200, 'GET', /^\/me\/C-7$/, 'Brightmart Mobile App') && p10.hit(s, 'supplier-exp-api', 200, 'GET', /^\/purchase-orders\/PO-7781$/, 'Northwind Supplies'),
    },
    { title: 'No client, no answer', how: 'API client, web-shop-exp-api, leave Send as on No client application, GET /products/H-100: 401 from the policy.', done: (s) => p10.hit(s, 'web-shop-exp-api', 401) },
    { title: 'Outside the network, no answer', how: `API client, customers-sys-api as ${PROCESS_CLIENT}, Source IP ${OUTSIDE_IP}, GET /customers/C-7: 403 from the IP Allowlist, even with a valid client.`, done: (s) => p10.hit(s, 'customers-sys-api', 403) },
    { title: 'A burst over the quota', how: `API client, web-shop-exp-api as ${QA_CLIENT}, GET ${TRACKING}, Send 10. Bronze allows 3 a minute: 3 are served and the other 7 get 429 at the gateway.`, done: (s) => p10.hit(s, 'web-shop-exp-api', 429, null, null, QA_CLIENT) },
    {
      title: 'A body nested too deep',
      how: 'API Manager, web-shop-exp-api-sbx, Policies, add JSON Threat Protection with Maximum Container Depth 5 and Maximum String Value Length 200. Then POST /checkout as Brightmart Web Shop with the body below: 400 before the order reaches any app.',
      code: DEEP_BODY,
      done: (s) => p10.jsonThreat(s) && p10.hit(s, 'web-shop-exp-api', 400, 'POST', /^\/checkout$/),
    },
    {
      title: 'SAP down: the order fails and the alerts fire',
      how: `API client, Backends: Stop on SAP S/4HANA (HRP). POST /checkout as Brightmart Web Shop with order ${RETRY_ORDER}: 502. The Inbox gets the alert of orders-prc-api for ${OPS} and the alert of web-shop-exp-api for ${DIGITAL}.`,
      code: orderBody(RETRY_ORDER),
      done: p10.down,
    },
    {
      title: 'SAP back: the same order goes through',
      how: `Backends: Start on SAP S/4HANA (HRP). Send the order ${RETRY_ORDER} again: 201. VA03 shows one sales order for it, because the failed try rolled back in SAP.`,
      done: p10.retried,
    },
    ask(
      'Who says the test passed',
      'Every test of the plan passed. Who signs off the test run before the Production change is requested?',
      [
        'The developer who deployed the apps',
        'The QA lead signs the test report with its evidence, and the business owner of the web shop accepts it. The people who built it do not mark their own work, and the change board in part 11 sees the signed report before it approves',
        'Nobody, a green test is enough',
        'The SAP team',
      ],
      1,
      'Sign off is evidence plus an independent decision. The correlation IDs, the SAP numbers and the alert mails of this run are the evidence that goes with the change.',
    ),
    {
      title: 'Read the run on the dashboard',
      how: 'Monitoring, Built-in dashboards, web-shop-exp-api, View. The response times of the orders, the 400, 401 and 429 of the negative tests and the 502 while SAP was down are all there.',
      done: (s) => p10.retried(s) && p10.hits(s, 'web-shop-exp-api', 429, null, null, QA_CLIENT).length >= 5 && Boolean(s.seen['dash:web-shop-exp-api']),
    },
  ],
  why: 'An end to end test proves the chain, not the apps one by one. One order is followed by its correlation ID through the Experience, Process and System APIs into each system, and found in SAP, the mail server and Splunk. The negative tests prove the policies: no client, the wrong network, too many requests and a hostile body are stopped at the gateway before any app works. A system that fails shows the errors and the alerts reach the right people, and the retry after it comes back shows no half done order is left. The signed report is the evidence for the change board.',
  docs: 'https://docs.mulesoft.com/api-functional-monitoring/',
  solve(start) {
    let s = mark(start, 'inbox')
    const web = clientNamed(s, 'Brightmart Web Shop')
    const order = call(s, 'web-shop-exp-api', web, '/checkout', 'POST', orderBody(TEST_ORDER))
    s = mark(mark(mark(mark(order.state, 'logs:orders-prc-api'), 'vis:orders-prc-api'), 'sap:VA03'), 'mail-log')
    s = advance(s, MINUTE)
    s = runSearch(s, `index=${INDEX} correlationId=${order.response.cid}`, '15m')
    s = call(s, 'mobile-app-exp-api', clientNamed(s, 'Brightmart Mobile App'), '/me/C-7').state
    s = call(s, 'supplier-exp-api', clientNamed(s, 'Northwind Supplies'), '/purchase-orders/PO-7781').state
    s = call(s, 'web-shop-exp-api', null, '/products/H-100').state
    const inner = clientNamed(s, PROCESS_CLIENT)
    s = callApi(s, { env: 'Sandbox', app: 'customers-sys-api', method: 'GET', path: '/customers/C-7', body: '', client: inner.name, clientId: inner.clientId, clientSecret: inner.clientSecret, ip: OUTSIDE_IP }).state
    const qa = clientNamed(s, QA_CLIENT)
    for (let i = 0; i < 10; i++) s = call(s, 'web-shop-exp-api', qa, TRACKING).state
    s = applyPolicy(s, p8.api(s, estateDef('web-shop-exp-api')).id, 'json-threat', { depth: 5, stringLength: 200 })
    s = call(s, 'web-shop-exp-api', web, '/checkout', 'POST', DEEP_BODY).state
    s = setBackend(s, 'erp', { up: false })
    s = call(s, 'web-shop-exp-api', web, '/checkout', 'POST', orderBody(RETRY_ORDER)).state
    s = setBackend(s, 'erp', { up: true })
    s = call(s, 'web-shop-exp-api', web, '/checkout', 'POST', orderBody(RETRY_ORDER)).state
    return mark(s, 'dash:web-shop-exp-api')
  },
  answers: { 5: 1, 13: 1 },
}

// ---------- part 11: the change and the System layer in Production ----------

// Wave 1 of the cutover is the web shop: web-shop-exp-api and every API it reaches. The other channels and the system
// integrations of parts 1 to 7 follow in wave 2 with the same runbook (lab: one saved state holds only one wave).
const PRD = 'Production'
const closureOf = (names) => {
  const seen = new Set()
  const visit = (n) => !seen.has(n) && (seen.add(n), callsOf(estateDef(n)).forEach(visit))
  names.forEach(visit)
  return DEPLOYED.filter((d) => seen.has(d.name))
}
const WAVE1 = closureOf(['web-shop-exp-api'])
const W_LAYER = (layer) => WAVE1.filter((d) => d.layer === layer)
const W_SYS_REAL = W_LAYER('System').filter((d) => REAL_SYSTEMS.includes(d.name))
const W_SYS_OTHER = W_LAYER('System').filter((d) => !REAL_SYSTEMS.includes(d.name))
const WAVE2 = DEPLOYED.filter((d) => !WAVE1.includes(d))
// the window opened at 08:45, before the start of the day
const WINDOW_START = at(11, 8, 45)
const WINDOW_END = at(12, 12, 0)
const ROLLBACK_MINUTES = 60
const CHANGE_SHORT = 'Brightmart go-live wave 1: the web shop APIs to Production'
const CIS = WAVE1.map((d) => d.name)
const CHANGE_PLANS = {
  impl: `Day 1: promote the ${W_LAYER('System').length} System API instances of the web shop with their policies and alerts, add the contracts of brightmart-process-apps, deploy the System apps with the Production sheet and prove three of them on the systems. Day 2: the same for the ${W_LAYER('Process').length} Process APIs and web-shop-exp-api, the contract of the web shop, the alerts of Production, then the smoke test.`,
  test: 'Smoke test after the Experience layer: one real order of the web shop followed to SAP and the confirmation mail, and one tracking read. The signed Sandbox test report of day 10 is attached.',
  backout: 'Until web-shop-exp-api is live in Production no channel calls it, so nothing is undone for the customers. After that: stop web-shop-exp-api and point the web shop back to the old checkout within 60 minutes. Orders taken meanwhile stay in SAP and are confirmed by hand.',
}
const p11 = {}
p11.since = at(11, 0)
p11.ticket = (s) => (s.release?.tickets ?? []).find((t) => t.env === PRD && t.short.trim() && t.type !== 'Standard' && CIS.every((n) => t.cis.includes(n)))
p11.planned = (s) => {
  const t = p11.ticket(s)
  return Boolean(t) && ['impl', 'test', 'backout'].every((k) => String(t[k] ?? '').trim().length >= 20) && t.start !== null && t.start <= at(11, 9, 0) && t.end >= WINDOW_END && Number(t.rollbackMinutes) > 0 && Number(t.rollbackMinutes) <= 120
}
p11.state = (s, ...states) => p11.planned(s) && states.includes(p11.ticket(s).state)
p11.hit = (s, name, status, method, path, since = p11.since) =>
  (s.events ?? []).some((e) => e.k === 'in' && e.app === name && e.env === PRD && e.t >= since && e.s === status && (!method || e.m === method) && (!path || path.test(e.p)))
// in Production, the callers are the apps of wave 1
const waveClientsOf = (name) => [...new Set(WAVE1.filter((d) => callsOf(d).includes(name)).map(clientOfCaller))]
p11.contracts = (s, list) => list.every((d) => waveClientsOf(d.name).every((c) => p8.contract(s, d, c, PRD)?.status === 'approved'))
p11.promoted = (s, list) => list.every((d) => p8.policiesOk(s, d, PRD))
const prdDeployHow = (list) =>
  `Switch to Production. Runtime Manager, Deploy application: Application Name the API name, the same jar as in Sandbox, Replicas 1, 0.1 vCores. Properties, Text view: paste the Production lines of the app with the IDs of Production, then make the lines under # protected protected properties. Deploy. Repeat for ${list.map((d) => d.name).join(', ')}. API Manager, Production shows each instance Active.`
// API Manager, Promote API from environment: one instance from Sandbox with its policies, tiers and alerts
const promoteAll = (s, list) => {
  let n = s
  for (const d of list) n = promoteApi(n, p8.api(n, d, 'Sandbox').id, { policies: true, tiers: true, alerts: true })
  return n
}

function part11Start() {
  const s = nextDay(solvedOf(part10), 11, {
    logs: 0,
    keepMail: 1,
    mail: [
      {
        subject: 'Go-live part 11: the cutover of wave 1',
        body: [
          `Good morning. QA signed the test report, so we cut over. Wave 1 is the web shop: web-shop-exp-api and the ${WAVE1.length - 1} APIs it reaches. Wave 2 (${WAVE2.map((d) => d.name).join(', ')}, and the system integrations) follows with this runbook once wave 1 is stable.`,
          `The change board turned on the release gate: a deploy to Production is refused unless an approved change covers the app and its window is open. Open a Normal change "${CHANGE_SHORT}" with risk High, the plans below, the window ${whenText(WINDOW_START)} to ${whenText(WINDOW_END)}, a rollback window of ${ROLLBACK_MINUTES} minutes and the ${CIS.length} apps of wave 1 as configuration items.`,
          `Implementation plan: ${CHANGE_PLANS.impl}`,
          `Test plan: ${CHANGE_PLANS.test}`,
          `Backout plan: ${CHANGE_PLANS.backout}`,
          `Today the System layer. Promote each instance from Sandbox with its policies and alerts, give ${PROCESS_CLIENT} its contracts in Production, deploy with the Production sheet: the Production hosts, the -prd-2026 keys, the internal addresses of Production and the client ID of Production. Salesforce Production logs on with mule.integration@brightmart.example. When the layer runs, write it in the change as a work note.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
  return { ...s, env: 'Sandbox', release: { created: at(11, 8), seq: 41234, tickets: [], routers: [], gate: true } }
}

const part11 = {
  id: 'p-golive-11',
  group: 'Brightmart go-live',
  title: 'Go-live part 11: the change and the System layer in Production',
  minutes: 55,
  scenario: `Day 11 of the Brightmart go-live and the first day of the cutover of wave 1, the web shop. The release gate is on, so nothing reaches Production without an approved change. Open the change with its plans, window and configuration items, get it approved, then move the ${W_LAYER('System').length} System APIs of the web shop to Production: instances, contracts and apps with the Production values.`,
  start: () => part11Start(),
  steps: [
    { title: 'Read the cutover plan', how: 'Open the Inbox from the menu under Lab tools. Note the window, the plans, the apps of wave 1 and the order of the layers.', done: (s) => Boolean(s.seen.inbox) },
    ask(
      'Cutover order',
      'In which order do the layers go to Production, and when do customers reach it?',
      [
        'Experience first, so the web shop sees it early',
        'System, then Process, then Experience. Each layer is proven before the next goes on top, and nothing calls Production until web-shop-exp-api is live, so the inner layers can be fixed or redeployed without any customer noticing',
        'All at once, to keep the window short',
        'The order does not matter on CloudHub',
      ],
      1,
      'The same bottom up order as in Sandbox. It also keeps the backout simple until the last step, because no channel calls Production yet.',
    ),
    {
      title: 'Open the change',
      how: `Change and release from the console menu, Change board, New change. Type Normal, Risk High, Short description "${CHANGE_SHORT}", the Implementation plan, Test plan and Backout plan from the mail, Planned start ${whenText(WINDOW_START)}, Planned end ${whenText(WINDOW_END)}, Rollback window (minutes) ${ROLLBACK_MINUTES}, Configuration items the list below. Save.`,
      code: CIS.join(', '),
      done: p11.planned,
    },
    ask(
      'Backout of a first go-live',
      'There is no older version of these apps in Production. What does the backout plan undo?',
      [
        'Nothing, a first go-live cannot be backed out',
        'The switch of the web shop. The inner layers can stay deployed because nobody calls them, so the backout stops web-shop-exp-api and points the web shop back to the old checkout, inside the rollback window. Orders already taken stay in SAP and are handled by hand',
        'It deletes every app and API instance in Production',
        'It restores a backup of SAP',
      ],
      1,
      'A backout plan names what is undone, how, by whom and in how many minutes. The change board rejects a change without one, and the rollback window says when the decision must be taken.',
    ),
    {
      title: 'Get the change approved',
      how: 'On the change, Request approval, then Run the approvers (lab). The change manager and the service owner approve, and the change is Scheduled for its window.',
      done: (s) => p11.state(s, 'Scheduled', 'Implement'),
    },
    { title: 'Start the implementation', how: `The window opened at ${whenText(WINDOW_START)}. Start implementation on the change.`, done: (s) => p11.state(s, 'Implement') },
    { title: 'Get the client ID of Production', how: 'Switch the environment to Production. API Manager, Environment information: the Client ID and Client Secret of Production.', done: (s) => Boolean(s.seen['env:Production']) },
    {
      title: `Promote the ${W_LAYER('System').length} System API instances`,
      how: `API Manager, Production, Add API, Promote API from environment: Source Environment Sandbox, pick the instance, Include in Promotion the policies, the tiers and the alerts, Promote. For ${W_LAYER('System').map((d) => d.name).join(', ')}.`,
      done: (s) => p11.promoted(s, W_LAYER('System')),
    },
    {
      title: `The contracts of ${PROCESS_CLIENT} in Production`,
      how: `Contracts are not promoted. Exchange, each of these System APIs, Request access: the Production instance, Application ${PROCESS_CLIENT}, Request access.`,
      done: (s) => p11.contracts(s, W_LAYER('System')),
    },
    ask(
      'Why contracts start empty',
      'Why does a promoted instance get the policies and tiers of Sandbox but no contracts?',
      [
        'Promotion has a bug',
        'A contract is a decision about who may call this API in this environment. A test client with a Sandbox contract must not get into Production by a copy, so every consumer asks again and the owner approves again for Production',
        'Contracts are stored in Exchange only',
        'Production has no client applications',
      ],
      1,
      'Policies and tiers are configuration of the API and travel with it. Access is granted per environment, which is why the QA load client of Sandbox never shows up in Production.',
    ),
    {
      title: `The ${W_SYS_REAL.length} System APIs over our systems in Production`,
      how: prdDeployHow(W_SYS_REAL),
      code: sheetOf(W_SYS_REAL, PRD),
      done: (s) => p11.state(s, 'Implement') && p9.allLive(s, W_SYS_REAL, PRD),
    },
    {
      title: 'Prove them on the systems of Production',
      how: `API client in Production, as ${PROCESS_CLIENT}: customers-sys-api GET /customers/C-7 reads Mara Quinn from the Production org of Salesforce, inventory-sys-api GET /stock/H-100 the stock in SAP, pos-sys-api GET /stores/S-12/stock/H-100 the store count. Each one 200.`,
      done: (s) => p9.allLive(s, W_SYS_REAL, PRD) && p11.hit(s, 'customers-sys-api', 200, 'GET', /^\/customers\/C-7$/) && p11.hit(s, 'inventory-sys-api', 200, 'GET', /^\/stock\/H-100$/) && p11.hit(s, 'pos-sys-api', 200, 'GET', /^\/stores\/S-12\/stock\/H-100$/),
    },
    {
      title: `The other ${W_SYS_OTHER.length} System APIs in Production`,
      how: prdDeployHow(W_SYS_OTHER),
      code: sheetOf(W_SYS_OTHER, PRD),
      done: (s) => p11.state(s, 'Implement') && p9.allLive(s, W_SYS_OTHER, PRD),
    },
    {
      title: 'Write the progress in the change',
      how: `Change board, the change, Work notes: System layer live in Production, ${W_LAYER('System').length} of ${W_LAYER('System').length} Active, Salesforce, SAP and the store database proven. Post.`,
      done: (s) => p9.allLive(s, W_LAYER('System'), PRD) && (p11.ticket(s)?.notes ?? []).some((n) => n.who === 'You' && n.t >= p11.since && /system/i.test(n.text) && /live|active/i.test(n.text)),
    },
  ],
  why: 'A cutover is a change like any other, with more at stake. The change carries the plans, a window and the configuration items, and the release gate makes the approval real: Runtime Manager refuses a Production deploy that no approved change covers. Promotion copies what belongs to the API, its policies, tiers and alerts, but not who may call it, so every contract is granted again for Production. The layer goes in bottom up with the Production sheet and is proven on the real systems before anything is built on it.',
  docs: 'https://docs.mulesoft.com/api-manager/latest/promote-api-instance-task',
  solve(start) {
    let s = mark(start, 'inbox')
    const made = newTicket(s, {})
    s = made.state
    const id = made.id
    s = setTicket(s, id, { type: 'Normal', risk: 'High', short: CHANGE_SHORT, ...CHANGE_PLANS, start: WINDOW_START, end: WINDOW_END, rollbackMinutes: ROLLBACK_MINUTES, cis: [...CIS] }).state
    s = requestApproval(s, id).state
    s = playApprovers(s).state
    s = startImplement(s, id).state
    s = mark({ ...s, env: PRD }, 'env:Production')
    s = promoteAll(s, W_LAYER('System'))
    for (const d of W_LAYER('System')) for (const c of waveClientsOf(d.name)) s = requestAccess(s, p8.api(s, d, PRD).id, c)
    for (const d of W_SYS_REAL) s = deployEstate(s, d, PRD)
    const inner = clientNamed(s, PROCESS_CLIENT)
    s = call(s, 'customers-sys-api', inner, '/customers/C-7').state
    s = call(s, 'inventory-sys-api', inner, '/stock/H-100').state
    s = call(s, 'pos-sys-api', inner, '/stores/S-12/stock/H-100').state
    for (const d of W_SYS_OTHER) s = deployEstate(s, d, PRD)
    return addWorkNote(s, id, `System layer live in Production, ${W_LAYER('System').length} of ${W_LAYER('System').length} Active. Salesforce, SAP and the store database proven.`)
  },
  answers: { 1: 1, 3: 1, 9: 1 },
}

// ---------- part 12: the web shop goes live ----------

const PRD_TOKEN = 'mule-golive-prd'
const LIVE_ORDER = 'O-5001'
const W_TOP = [...W_LAYER('Process'), ...W_LAYER('Experience')]
const p12 = {}
p12.since = at(12, 0)
p12.alerted = (s, name) => s.monAlerts.some((x) => x.enabled && x.env === PRD && x.resource === 'Application' && x.name_ === name && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(OPS))
p12.token = (s) => (s.observability?.splunk?.tokens ?? []).find((t) => t.name === PRD_TOKEN && t.enabled && t.index === INDEX && sameSet(t.indexes, [INDEX]))
p12.splunkOk = (s, name) => {
  const a = appIn(s, name, PRD)
  const token = p12.token(s)
  return Boolean(a?.disableChLogs) && Boolean(token) && a.secrets?.['splunk.hec.token'] === token.value && /Http name="Splunk"[^>]*index=mule/.test(a.log4j ?? '') && /CLOUDHUB/.test(a.log4j ?? '') && /<Async /.test(a.log4j ?? '') && p9.live(s, estateDef(name), PRD)
}
p12.smoked = (s) =>
  p9.allLive(s, WAVE1, PRD) &&
  p11.hit(s, 'web-shop-exp-api', 201, 'POST', /^\/checkout$/, p12.since) &&
  Object.values(s.sap?.orders ?? {}).filter((o) => o.po === LIVE_ORDER && o.t >= p12.since).length === 1 &&
  (s.mailServer?.outbound ?? []).some((m) => m.t >= p12.since && m.to === CUSTOMER_MAIL && String(m.subject).includes(LIVE_ORDER))
p12.closed = (s) => {
  const t = p11.ticket(s)
  return p12.smoked(s) && t?.state === 'Closed' && t.closeCode === 'Successful' && String(t.closeNotes ?? '').trim().length >= 20
}

function part12Start() {
  return nextDay(solvedOf(part11), 12, {
    logs: 0,
    keepMail: 1,
    mail: [
      {
        subject: 'Go-live part 12: the web shop goes live',
        body: [
          `Good morning. The System layer of wave 1 runs in Production and the change is still in Implement until ${whenText(WINDOW_END)}. Today the rest, top down from what we built yesterday: the Process APIs ${W_LAYER('Process').map((d) => d.name).join(', ')}, then web-shop-exp-api.`,
          `Promote the instances, give ${PROCESS_CLIENT} and ${EXPERIENCE_CLIENT} their contracts and the Brightmart Web Shop its Gold contract in Production. The Process APIs alert ${OPS} in Production before any customer arrives. Splunk gets a token of its own for Production, ${PRD_TOKEN} on the index ${INDEX}, for ${LOGGED.join(', ')}.`,
          `Then the smoke test with one real order, ${LIVE_ORDER} for Mara Quinn, and one tracking read. When it passes, the web shop switches to Production and the change closes. The service owner signs off.`,
          'Lena',
        ].join('\n\n'),
      },
    ],
  })
}

const part12 = {
  id: 'p-golive-12',
  group: 'Brightmart go-live',
  title: 'Go-live part 12: the web shop live, smoke test and sign off',
  minutes: 50,
  scenario: `Day 12 of the Brightmart go-live, the last one. The System layer of the web shop runs in Production. Put the Process APIs and web-shop-exp-api on top, with contracts, alerts and log forwarding of Production, prove it with one real order, then close the change and sign off the go-live.`,
  start: () => part12Start(),
  steps: [
    { title: 'Read the go-live runbook', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Promote the ${W_TOP.length} Process and Experience instances`,
      how: `Production, API Manager, Add API, Promote API from environment, Source Environment Sandbox, with the policies, the tiers and the alerts: ${W_TOP.map((d) => d.name).join(', ')}. The web shop instance keeps its tiers, its JSON Threat Protection and the alert to ${DIGITAL}.`,
      done: (s) => p11.promoted(s, W_TOP) && p8.webAlert(s, PRD) && p8.has(p8.api(s, estateDef('web-shop-exp-api'), PRD), 'json-threat'),
    },
    {
      title: 'The contracts of the apps in Production',
      how: `Exchange, Request access on the Production instances: ${PROCESS_CLIENT} on availability-prc-api, which catalog-prc-api calls, and ${EXPERIENCE_CLIENT} on catalog-prc-api, orders-prc-api and shipments-prc-api.`,
      done: (s) => p11.contracts(s, W_LAYER('Process')),
    },
    {
      title: 'The Gold contract of the web shop',
      how: 'Exchange, Web Shop Experience API, Request access: the Production instance, Application Brightmart Web Shop, SLA tier Gold. Then API Manager, Production, the instance, Client Applications, Approve.',
      done: (s) => p8.contract(s, estateDef('web-shop-exp-api'), 'Brightmart Web Shop', PRD)?.status === 'approved' && p8.contract(s, estateDef('web-shop-exp-api'), 'Brightmart Web Shop', PRD)?.tier === 'Gold',
    },
    {
      title: `The ${W_LAYER('Process').length} Process APIs in Production`,
      how: prdDeployHow(W_LAYER('Process')),
      code: sheetOf(W_LAYER('Process'), PRD),
      done: (s) => p11.state(s, 'Implement', 'Review', 'Closed') && p9.allLive(s, W_LAYER('Process'), PRD),
    },
    {
      title: 'Alert ops in Production before customers arrive',
      how: `Production, Monitoring, Alerts, Create Alert for each of ${W_LAYER('Process').map((d) => d.name).join(', ')}: Resource Application, Metric Message Error Count, Above 0 for 1 minute, Severity High, Recipients ${OPS}.`,
      done: (s) => W_LAYER('Process').every((d) => p12.alerted(s, d.name)),
    },
    {
      title: 'web-shop-exp-api in Production',
      how: prdDeployHow(W_LAYER('Experience')),
      code: sheetOf(W_LAYER('Experience'), PRD),
      done: (s) => p11.state(s, 'Implement', 'Review', 'Closed') && p9.allLive(s, W_LAYER('Experience'), PRD),
    },
    {
      title: 'Forward the logs of Production to Splunk',
      how: `Splunk, HTTP Event Collector, New Token: name ${PRD_TOKEN}, allowed index ${INDEX} only, default index ${INDEX}, Create. Then Splunk, In the Mule app, for ${LOGGED.join(', ')} in Production: Insert template, tick Disable CloudHub logs, Redeploy, and in Runtime Manager the protected property splunk.hec.token with the value of ${PRD_TOKEN}.`,
      done: (s) => LOGGED.every((n) => p12.splunkOk(s, n)),
    },
    ask(
      'What the smoke test covers',
      'The full test ran in Sandbox. What does the smoke test in Production check?',
      [
        'The whole test plan again, with the negative tests and the SAP failure',
        'One real order through every layer and every system of Production, and one read, with the evidence noted. It proves the Production values: hosts, keys, users and contracts. It never stops a system or floods the quota, because real customers share Production',
        'Only that the apps are Running',
        'A load test of an hour',
      ],
      1,
      'A smoke test is short, safe and complete in reach: it touches each connection once. The order it makes is a real one, so it is placed for a known customer and handled by the business afterwards.',
    ),
    {
      title: `The smoke order ${LIVE_ORDER}`,
      how: `Production, API client, web-shop-exp-api as Brightmart Web Shop, POST /checkout with the body below: 201. SAP GUI, VA03: one sales order with purchase order number ${LIVE_ORDER}. Mail server, Log: the confirmation to ${CUSTOMER_MAIL}.`,
      code: orderBody(LIVE_ORDER),
      done: (s) => p12.smoked(s) && Boolean(s.seen['sap:VA03']) && Boolean(s.seen['mail-log']),
    },
    {
      title: 'The smoke read',
      how: `Production, API client, web-shop-exp-api as Brightmart Web Shop, GET /orders/${LIVE_ORDER}/tracking: 200 through shipments-prc-api to the order and carrier System APIs.`,
      done: (s) => p12.smoked(s) && p11.hit(s, 'web-shop-exp-api', 200, 'GET', new RegExp(`^/orders/${LIVE_ORDER}/tracking$`), p12.since),
    },
    ask(
      'Who signs off the go-live',
      'The smoke test passed and the web shop switched to Production. Who signs off the go-live?',
      [
        'The integration lead, because the team did the work',
        'The service owner of the web shop, on the evidence: the closed change, the signed test report and the smoke order. The change board then sees the change closed Successful. Hypercare by the integration team starts, and wave 2 is planned on the same runbook',
        'Nobody, closing the change is enough',
        'The QA lead, who signed the test',
      ],
      1,
      'The owner of the business service accepts it, not the team that built it. The evidence lives on the change: plans, approvals, work notes and close notes.',
    ),
    {
      title: 'Close the change',
      how: 'Change board, the change, Move to Review. Close code Successful, Close notes: wave 1 live, smoke order and its SAP number, the tracking read, nothing rolled back, hypercare until wave 2. Close change.',
      done: p12.closed,
    },
  ],
  why: 'The last day finishes the cutover in the same bottom up order and makes Production observable before a customer arrives: alerts to ops, the alert of the web shop to the digital team, and log forwarding with a token of its own for Production, so either environment can be cut off alone. The smoke test touches every connection of Production once with a real order and a read, and never repeats the destructive tests of Sandbox. The change is closed with the evidence, the service owner signs off, and the same runbook carries wave 2.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-deploy-cloudhub',
  solve(start) {
    let s = mark({ ...start, env: PRD }, 'inbox')
    s = promoteAll(s, W_TOP)
    for (const d of W_LAYER('Process')) for (const c of waveClientsOf(d.name)) s = requestAccess(s, p8.api(s, d, PRD).id, c)
    const web = p8.api(s, estateDef('web-shop-exp-api'), PRD).id
    s = requestAccess(s, web, 'Brightmart Web Shop', 'Gold')
    s = setContract(s, web, 'Brightmart Web Shop', { status: 'approved' })
    for (const d of W_LAYER('Process')) s = deployEstate(s, d, PRD)
    for (const d of W_LAYER('Process')) s = errorAlert(s, d.name, OPS, `${d.title} errors`)
    for (const d of W_LAYER('Experience')) s = deployEstate(s, d, PRD)
    s = addToken(s, { name: PRD_TOKEN, index: INDEX, indexes: [INDEX], sourcetype: 'mule:app' }).state
    const token = p12.token(s).value
    for (const name of LOGGED) s = change(s, name, { log4j: log4jTemplate({ index: INDEX }), disableChLogs: true, secrets: { ...appIn(s, name, PRD).secrets, 'splunk.hec.token': token } })
    const shop = clientNamed(s, 'Brightmart Web Shop')
    s = call(s, 'web-shop-exp-api', shop, '/checkout', 'POST', orderBody(LIVE_ORDER)).state
    s = mark(mark(s, 'sap:VA03'), 'mail-log')
    s = call(s, 'web-shop-exp-api', shop, `/orders/${LIVE_ORDER}/tracking`).state
    const id = p11.ticket(s).id
    s = toReview(s, id).state
    return closeTicket(s, id, 'Successful', `Wave 1 live. Smoke order ${LIVE_ORDER} confirmed in SAP and mailed, tracking read 200. Nothing rolled back. Hypercare until wave 2.`).state
  },
  answers: { 8: 1, 11: 1 },
}

export const LABS = [part1, part2, part3, part4, part5, part6, part7, part8, part9, part10, part11, part12]
