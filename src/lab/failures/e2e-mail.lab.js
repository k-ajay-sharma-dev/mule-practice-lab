// The guided lab e2e-mail. See platform-labs.js for the shape of a lab.
// The whole life of a mail integration: the request, the RAML of its API, Studio, the mailbox with its folders and app
// password, API Manager, the deploy, one order mail traced to its confirmation, a mail parked in Error, fixed and moved
// back, an alert and Production.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createClient, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio } from '../platform.js'
import { ask, creds, until, withProp } from '../platform-kit.js'
import { addAppPassword, attachment, MAIL_HOST, newAccount, newMailServer, setMailAccount, webAddFolder, webMove, webOpen, webSend } from '../platform-mailserver.js'
import { addrOf, ASSET, FLOW, INTAKE } from './e2e-mail.pkg.js'

const PROJECT = 'PO Mail System API'
const APP = 'po-mail-intake'
const SBX_BOX = 'po-intake-test@brightmart.example'
const PRD_BOX = 'po-intake@brightmart.example'
const QA = 'qa-buyer@brightmart.example'
const TIDEPOOL = 'orders.tidepool@mail.example'
const QUAY = 'orders.quaydeli@mail.example'
const TEAM = 'order-desk@brightmart.example'
const CONSOLE = 'Order Desk Portal'
const SBX_SENDERS = QA
const word = (v) => String(v ?? '').trim()
const low = (v) => word(v).toLowerCase()

const RAML = `#%RAML 1.0
title: PO Mail System API
version: v1
mediaType: application/json
/status:
  get:
    description: The counts of the mail intake
    responses:
      200:
        body:
          example: |
            { "mailbox": "po-intake@brightmart.example", "processed": 12, "parked": 1, "lastPoll": 118800000 }
/orders/{po}:
  get:
    description: One order that came in by mail, with the Message-ID of its confirmation
    responses:
      200:
        body:
          example: |
            { "po": "PO-9001", "from": "qa-buyer@brightmart.example", "lines": 1, "total": 12.8, "confirmation": "<a1b2.7@mail.brightmart.lab>" }
      404:
        body:
          example: |
            { "message": "No order PO-0000 was received by mail" }
`
const FLOW_CODE = `<email:imap-config name="Email_IMAP">
  <email:imaps-connection host="\${imap.host}" port="\${imap.port}" user="\${imap.user}" password="\${secure::imap.password}" />
</email:imap-config>
<email:smtp-config name="Email_SMTP">
  <email:smtp-connection host="\${smtp.host}" port="\${smtp.port}" user="\${smtp.user}" password="\${secure::smtp.password}">
    <email:properties><email:property key="mail.smtp.starttls.enable" value="\${smtp.starttls}" /></email:properties>
  </email:smtp-connection>
</email:smtp-config>

<flow name="po-mail-flow">
  <email:listener-imap config-ref="Email_IMAP" folder="INBOX">
    <scheduling-strategy><fixed-frequency frequency="1" timeUnit="MINUTES" /></scheduling-strategy>
    <email:imap-matcher seen="EXCLUDE" />   <!-- only unread mail; the move below takes it out of INBOX -->
  </email:listener-imap>
  <try>
    <validation:is-true expression="#[p('orders.senders') splitBy ',' contains lower(attributes.fromAddresses[0])]"
                        message="Not a known customer" />
    <ee:transform doc:name="CSV attachment to order">
      <ee:set-payload><![CDATA[%dw 2.0
output application/java
var csv = (payload.attachments pluck $ filter ($.^mimeType startsWith "text/csv"))[0]
var lines = read(csv, "application/csv", { header: true })
---
{
  po: lines[0].po,
  lines: lines map { item: $.item, qty: $.qty as Number, price: vars.catalog[$.item].price },
  total: sum(lines map ($.qty as Number) * vars.catalog[$.item].price)
}]]></ee:set-payload>
    </ee:transform>
    <email:send config-ref="Email_SMTP" fromAddress="\${smtp.user}" toAddresses="#[[attributes.fromAddresses[0]]]"
                subject="#['Brightmart order confirmation ' ++ payload.po]" />
    <email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Processed" />
    <error-handler>
      <on-error-continue type="VALIDATION:INVALID_BOOLEAN, MULE:EXPRESSION, APP:ORDER_REJECTED">
        <email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Error" />
      </on-error-continue>
    </error-handler>
  </try>
</flow>`

const MAIL = {
  t: at(1, 8, 30),
  to: 'integration-team@brightmart.example',
  subject: 'Purchase orders by mail: intake and confirmations',
  body: [
    'Hello integration team,',
    `Our cafe and office customers send purchase orders by mail, a CSV attachment with the columns po, item and qty. About 150 mails a day. Today a person types them in. Please automate it.`,
    `Read the mailbox over IMAP on port 993 with TLS. For each mail from a known customer, send a confirmation with the lines and the total back to the sender over SMTP on port 587 with STARTTLS, and move the mail to Processed. A mail the app cannot take goes to Error, never deleted, and we look at it. A customer must never get two confirmations for one mail.`,
    `Sandbox mailbox ${SBX_BOX}, Production mailbox ${PRD_BOX}, both on ${MAIL_HOST}. The mail team made them. Only the app uses them, so app passwords only. Our QA buyer ${QA} sends the test orders; in Sandbox only that address is a known customer (orders.senders). The account team will also test with a new customer from Sandbox.`,
    `The order desk portal reads GET /orders/{po} behind a client ID. Alerts to ${TEAM}.`,
    'Brightmart order desk',
  ].join('\n\n'),
  source: 'Brightmart order desk',
}

function mailServer(now) {
  const y = newMailServer({
    accounts: {
      [SBX_BOX]: newAccount('PO intake (test)', 'Po-Intake-Test-2611', { folders: { INBOX: [], Sent: [], Junk: [] } }),
      [PRD_BOX]: newAccount('PO intake', 'Po-Intake-Prd-2611', { appOnly: true }),
      [QA]: newAccount('QA buyer', 'Qa-Buyer-Lab-2611'),
    },
  })
  // the account team tests the new customer Tidepool Cafe once in Sandbox; Quay Deli orders in Production all day
  const csv = (rows) => attachment('order.csv', 'text/csv', 64, `po,item,qty\n${rows}\n`)
  y.feeds = [
    { to: SBX_BOX, every: 100000, at: now + 20 * MINUTE, n: 1, mails: [{ from: `Tidepool Cafe <${TIDEPOOL}>`, subject: 'Order PO-7731', text: 'Hello, our first order is attached.\nTidepool Cafe', attachments: [{ ...csv('PO-7731,H-300,6\nPO-7731,K-220,2') }] }] },
    { to: PRD_BOX, every: 20, at: now + 10 * MINUTE, n: 1, mails: [{ from: `Quay Deli <${QUAY}>`, subject: 'Order PO-58{n}', text: 'Order attached.\nQuay Deli', attachments: [{ ...csv('PO-58{n},H-100,10\nPO-58{n},H-410,3') }] }] },
  ]
  return y
}

const box = (s, a) => s.mailServer?.accounts?.[a]
const folder = (s, a, f) => box(s, a)?.folders?.[f] ?? []
const project = (s) => s.projects.find((p) => /po mail/i.test(p.name))
const resources = (raml) => ramlErrors(raml).length === 0 && [['GET', '/status'], ['GET', '/orders/PO-9001']].every(([m, path]) => mockCall(raml, m, path).status < 300)
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const studio = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === INTAKE)
const api = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const app = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === INTAKE && a.env === env && a.status !== 'Stopped')
const orders = (s, env = 'Sandbox') => app(s, env)?.store?.orders ?? []
const appPasswords = (s, a) => (box(s, a)?.appPasswords ?? []).map((x) => x.value)
const configOk = (s, env) => {
  const x = app(s, env)
  const mb = env === 'Production' ? PRD_BOX : SBX_BOX
  if (x?.status !== 'Running' || !box(s, mb)) return false
  const p = x.props ?? {}
  const sec = x.secrets ?? {}
  const pass = (k) => appPasswords(s, mb).includes(sec[k]) && !(k in p)
  return (
    low(p['imap.host']) === MAIL_HOST && word(p['imap.port']) === '993' && (low(p['imap.protocol']) || 'imaps') === 'imaps' && low(p['imap.user']) === mb && pass('imap.password') &&
    low(p['smtp.host']) === MAIL_HOST && word(p['smtp.port']) === '587' && low(p['smtp.starttls']) === 'true' && low(p['smtp.user']) === mb && pass('smtp.password') &&
    Boolean(box(s, mb).appOnly)
  )
}
const activeIn = (s, env) => Boolean(api(s, env)) && apiStatus(s, api(s, env)) === 'Active'
const qaOrder = (s) => orders(s).find((o) => o.from === QA)
const confirmationIn = (s, a, po) => folder(s, a, 'INBOX').find((m) => m.subject === `Brightmart order confirmation ${po}`)
const tidepool = (s) => [...folder(s, SBX_BOX, 'Error'), ...folder(s, SBX_BOX, 'Processed'), ...folder(s, SBX_BOX, 'INBOX')].find((m) => addrOf(m.from) === TIDEPOOL)

const lab = {
  id: 'p-e2e-mail',
  group: 'End to end by system',
  title: 'End to end: purchase orders, IMAP mailbox to SMTP confirmations',
  minutes: 50,
  scenario: `Cafe and office customers of Brightmart mail their purchase orders as a CSV attachment. The app ${APP}, built on the System API ${PROJECT}, reads the intake mailbox over IMAPS every minute, parses the CSV of a known customer in DataWeave, sends the confirmation over SMTP with STARTTLS and moves the mail to Processed. A mail it cannot take goes to Error. You take it from the request mail to Production: the RAML, Studio, the mailbox, API Manager, the deploy, one order traced to its confirmation, a parked mail fixed and moved back, an alert and Production.`,
  start() {
    const clock = at(1, 9)
    const s = newPlatform({ clock: at(1, 8), mailServer: mailServer(clock), studioPkgs: { [ASSET]: INTAKE }, mail: [MAIL] })
    return until(s, clock)
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the mailboxes, the ports, the folders, the known customers, the rule about two confirmations and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Create the API specification', how: `Design Center, Create new, New API Specification. Project Name ${PROJECT}, so the asset ID becomes ${ASSET}. The orders come in by mail; the API lets the order desk portal see them.`, done: (s) => Boolean(project(s)) },
    { title: 'Write the RAML', how: 'Add GET /status and GET /orders/{po}, with 200 examples and a 404 example for an unknown order. You can paste this one.', code: RAML, done: (s) => Boolean(project(s)) && resources(project(s).raml) },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on Mocking service, open GET of /orders/{po}, Try it, Send.', done: (s) => Boolean(s.seen.mock) && Boolean(project(s)) },
    { title: 'Publish to Exchange', how: 'Publish, Asset version 1.0.0, API version v1, LifeCycle State Stable, Publish to Exchange.', done: (s) => Boolean(asset(s)) },
    {
      title: 'Import the spec into Studio',
      how: `Anypoint Studio from the menu, Import a published API, ${PROJECT}. APIkit makes the flows of the API; the team adds ${FLOW}. Its important part is below: both Email configs from properties, the IMAP listener on unread mail, the sender check, the DataWeave that reads the CSV, the send, and the moves to Processed and Error.`,
      code: FLOW_CODE,
      done: (s) => Boolean(studio(s)),
    },
    ask(
      'Reading each mail once',
      'The listener runs every minute. How does the flow make sure it reads each mail once, and loses none?',
      [
        'POP3 with delete after retrieve, so the server forgets the mail',
        'IMAP on unread mail only, and every mail leaves INBOX: Processed when it worked, Error when it did not. Nothing is deleted, and a mail that failed half way stays unread and is tried again',
        'Read every mail of INBOX each time and keep a list in memory',
        'Mark every mail as read as soon as it is fetched',
      ],
      1,
      'Delete after retrieve removes the mail before the flow has finished with it, so a failure loses the order. Marking read at once has the same problem. Moving the mail at the end of the flow is the commit: until then it stays unread in INBOX and the next poll gets it again. A list in memory is gone after a restart.',
    ),
    {
      title: 'Make the folders of the Sandbox mailbox',
      how: `Mail server from the console menu, tab Mail, Mailbox ${SBX_BOX}. Under the folder list create Processed and then Error. A move to a folder that does not exist fails with [TRYCREATE].`,
      done: (s) => ['Processed', 'Error'].every((f) => Array.isArray(box(s, SBX_BOX)?.folders?.[f])),
    },
    {
      title: 'Give the app an app password only',
      how: `Tab Accounts, row ${SBX_BOX}. Under App passwords type ${APP} and Create, and copy the value. Clear Main password works, so only app passwords open IMAP and SMTP of this mailbox.`,
      done: (s) => Boolean(box(s, SBX_BOX)?.appOnly) && appPasswords(s, SBX_BOX).length > 0,
    },
    {
      title: 'Create the API instance',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), ${PROJECT} from Exchange, instance label po-mail-sbx, Save & Deploy. Open Environment information and note the client ID and secret of Sandbox.`,
      done: (s) => Boolean(api(s)) && Boolean(s.seen['env:Sandbox']),
    },
    { title: 'Apply Client ID Enforcement', how: 'API instance, Policies, Add policy, Client ID Enforcement. Only the order desk portal and other known clients read the orders.', done: (s) => Boolean(api(s)?.policies.some((p) => p.type === 'client-id')) },
    {
      title: 'Add API Autodiscovery and export',
      how: `Anypoint Studio, ${ASSET}, Create API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. OK, then Export.`,
      done: (s) => Boolean(studio(s)?.autodiscovery?.apiId) && /-main$/.test(studio(s)?.autodiscovery?.flowRef ?? '') && Boolean(studio(s)?.jar),
    },
    {
      title: 'Deploy to Sandbox',
      how: `Runtime Manager, Deploy application, name ${APP}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: api.id the instance ID, anypoint.platform.client_id, imap.host ${MAIL_HOST}, imap.port 993, imap.user ${SBX_BOX}, smtp.host ${MAIL_HOST}, smtp.port 587, smtp.starttls true, smtp.user ${SBX_BOX}, orders.senders ${SBX_SENDERS}. Add imap.password and smtp.password with the app password, and protect them and anypoint.platform.client_secret. Deploy and see the API Active.`,
      done: (s) => configOk(s, 'Sandbox') && activeIn(s, 'Sandbox'),
    },
    {
      title: 'Give the order desk portal a contract',
      how: `Exchange, ${PROJECT}, Request access. API Instance Sandbox, po-mail-sbx, Application Create a new application named ${CONSOLE}, Request access.`,
      done: (s) => Boolean(api(s)?.contracts.some((c) => c.client === CONSOLE && c.status === 'approved')),
    },
    {
      title: 'Send a test order by mail',
      how: `Mail server, Mailbox ${QA}, tab Compose. To ${SBX_BOX}, Subject Order PO-9001, tick orders.csv under Attach a sample file, Send. Move the clock 2 minutes so the app polls.`,
      done: (s) => Boolean(qaOrder(s)) && folder(s, QA, 'Sent').some((m) => m.to.includes(SBX_BOX) && m.attachments.some((a) => a.name === 'orders.csv')),
    },
    {
      title: 'Follow the order to its confirmation',
      how: `Runtime Manager, ${APP}, Logs: the lines of the mail share one event ID, the correlation ID, from the Message-ID to the confirmation sent and the move. Mail server, Mailbox ${QA}: open Brightmart order confirmation PO-9001, 4 x H-100 Hand soap 500 ml, total 12.80. Mailbox ${SBX_BOX}: the order mail is in Processed, not INBOX. Then API client, ${APP}, client application ${CONSOLE}, GET /orders/PO-9001 answers 200.`,
      done: (s) => {
        const o = qaOrder(s)
        const c = o && confirmationIn(s, QA, 'PO-9001')
        return Boolean(c) && c.flags.includes('\\Seen') && Boolean(s.seen[`logs:${app(s)?.name}`]) && folder(s, SBX_BOX, 'Processed').some((m) => m.messageId === o.mid) && (s.lastCalls ?? []).some((x) => x.app === app(s)?.name && x.env === 'Sandbox' && x.status === 200 && x.path === '/orders/PO-9001')
      },
    },
    ask(
      'Two confirmations',
      'The app sent the confirmation, then the replica restarted before the move to Processed. The mail is still unread in INBOX. What stops a second confirmation?',
      [
        'Nothing can stop it, mail is best effort',
        'Keep the Message-ID of each handled mail in a persistent object store and check it first. A known Message-ID gets no new confirmation and is only moved to Processed',
        'Send the confirmation after the move instead, so a restart loses it',
        'Delete the mail before sending the confirmation',
      ],
      1,
      'The send and the move cannot be one transaction, so the flow must be idempotent. The Message-ID is the key the mail carries; a persistent object store survives a restart and is shared by the replicas. Moving first would trade a duplicate for a lost confirmation, and deleting first loses the order.',
    ),
    {
      title: 'Find the mail that went to Error',
      how: `At 09:20 the account team sent a test order from the new customer Tidepool Cafe, ${TIDEPOOL}. Move the clock if it is not 09:21 yet. The log of ${APP} has a WARN: not a known customer. Mail server, Mailbox ${SBX_BOX}, folder Error: the mail is there, kept and not deleted. API client, ${APP}, client application ${CONSOLE}, GET /status now shows parked 1.`,
      done: (s) => {
        const p = (app(s)?.store?.parked ?? []).find((x) => x.from === TIDEPOOL)
        return Boolean(p) && (s.lastCalls ?? []).some((c) => c.app === app(s)?.name && c.env === 'Sandbox' && c.status === 200 && c.path === '/status' && c.t > p.t)
      },
    },
    {
      title: 'Fix the cause and move the mail back',
      how: `The account team confirms Tidepool Cafe as a customer. Runtime Manager, ${APP}, Settings, Properties: orders.senders ${SBX_SENDERS},${TIDEPOOL}, Apply Changes. Then in the webmail, folder Error: if you opened the mail, Mark as unread, because the app reads only unread mail. Move it to INBOX and move the clock a minute. Order PO-7731 is confirmed, the mail is in Processed, and the Mailbox ${TIDEPOOL} has the confirmation.`,
      done: (s) => (app(s)?.props?.['orders.senders'] ?? '').toLowerCase().includes(TIDEPOOL) && orders(s).some((o) => o.po === 'PO-7731') && Boolean(confirmationIn(s, TIDEPOOL, 'PO-7731')) && folder(s, SBX_BOX, 'Processed').some((m) => m.messageId === tidepool(s)?.messageId),
    },
    {
      title: 'Alert the order desk',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0, recipient ${TEAM} from the mail. A mail moved to Error counts as an error.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === app(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(TEAM)),
    },
    {
      title: 'Promote and deploy to Production',
      how: `Mail server, Accounts, row ${PRD_BOX}: create an app password ${APP}. Switch to Production. API Manager, Add API, Promote API from environment, source Sandbox, include Policies. Runtime Manager in Production, Deploy application ${APP} from the same jar: api.id the Production instance, the Production client ID and secret, imap.user and smtp.user ${PRD_BOX} with its app password, protected, orders.senders ${QUAY},${TIDEPOOL}. The API must show Active.`,
      done: (s) => configOk(s, 'Production') && activeIn(s, 'Production'),
    },
    {
      title: 'See an order confirmed in Production',
      how: `Quay Deli orders all day into ${PRD_BOX}. Move the clock 2 minutes, so the Production app polls. Mail server, Mailbox ${PRD_BOX}: the waiting order mails are in Processed. Mailbox ${QUAY} has a Brightmart order confirmation from ${PRD_BOX}.`,
      done: (s) => configOk(s, 'Production') && orders(s, 'Production').some((o) => o.from === QUAY) && folder(s, QUAY, 'INBOX').some((m) => addrOf(m.from) === PRD_BOX && /^Brightmart order confirmation/.test(m.subject)),
    },
  ],
  why: `I built a purchase order intake from a mailbox. The request gave the mailbox, the format, the ports and two rules: nothing is lost and no customer gets two confirmations. I designed a small API in RAML for the order desk, GET /orders/{po} and GET /status, mocked it, published it and built the flows in Studio on that spec, with every host, user and password as a property. The mail team made the mailbox; I added the folders Processed and Error and an app password, and turned off the main password. The flow reads unread mail over IMAPS, checks the sender, reads the CSV attachment in DataWeave, sends the confirmation over SMTP with STARTTLS on 587, and moves the mail to Processed. The move is the commit, and a store of handled Message-IDs stops a second confirmation after a restart. I traced one order by its correlation ID from the log to the confirmation in the buyer's mailbox. A mail from a customer not yet set up went to Error, not lost; once the account team confirmed the customer I added it to the senders, moved the mail back to INBOX and it was confirmed, and the error count fires an alert. Production is the same jar with its own mailbox, app password, API instance and senders. In the lab the webmail opens any mailbox as the admin and both environments use one mail server.`,
  docs: 'https://docs.mulesoft.com/email-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, PROJECT)
    const pid = s.projects.at(-1).id
    s = mark(saveProject(s, pid, RAML), 'mock')
    s = publish(s, pid, { assetId: ASSET, name: PROJECT, version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = webAddFolder(webAddFolder(s, SBX_BOX, 'Processed'), SBX_BOX, 'Error')
    s = setMailAccount(addAppPassword(s, SBX_BOX, APP), SBX_BOX, { appOnly: true })
    const key = (x, a) => x.mailServer.accounts[a].appPasswords.at(-1).value
    s = addApi(s, { assetId: ASSET, label: 'po-mail-sbx', upstream: '', consumer: '' })
    const sbxApi = s.lastApi
    s = applyPolicy(mark(s, 'env:Sandbox'), sbxApi, 'client-id')
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    const jar = jarsOf(s).find((j) => j.project === ASSET)
    const form = (env, apiId, mb, senders) => {
      const c = creds(s, env)
      const pw = key(s, mb)
      return { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { 'api.id': apiId, ...c.props, 'imap.host': MAIL_HOST, 'imap.port': '993', 'imap.user': mb, 'smtp.host': MAIL_HOST, 'smtp.port': '587', 'smtp.starttls': 'true', 'smtp.user': mb, 'orders.senders': senders }, secrets: { ...c.secrets, 'imap.password': pw, 'smtp.password': pw } }
    }
    s = finishDeploys(deployApp(s, form('Sandbox', sbxApi, SBX_BOX, SBX_SENDERS)).state)
    s = requestAccess(createClient(s, CONSOLE), sbxApi, CONSOLE)
    s = webSend(s, QA, { to: [SBX_BOX], subject: 'Order PO-9001', text: 'Order attached.', attachments: [attachment('orders.csv', 'text/csv', 2140, 'po,item,qty\nPO-9001,H-100,4\n')] }).state
    s = mark(advance(s, MINUTE), `logs:${APP}`)
    s = webOpen(s, QA, 'INBOX', confirmationIn(s, QA, 'PO-9001').uid)
    const client = s.clients.find((c) => c.name === CONSOLE)
    s = callApi(s, { env: 'Sandbox', app: APP, method: 'GET', path: '/orders/PO-9001', body: '', client: client.name, clientId: client.clientId, clientSecret: client.clientSecret }).state
    s = mark(until(s, at(1, 9, 22)), `mail:${SBX_BOX}`)
    s = callApi(s, { env: 'Sandbox', app: APP, method: 'GET', path: '/status', body: '', client: client.name, clientId: client.clientId, clientSecret: client.clientSecret }).state
    s = withProp(s, APP, 'orders.senders', `${SBX_SENDERS},${TIDEPOOL}`)
    s = webMove(s, SBX_BOX, 'Error', tidepool(s).uid, 'INBOX')
    s = advance(s, MINUTE)
    s = addMonAlert(s, { title: 'PO mail intake errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    s = addAppPassword(s, PRD_BOX, APP)
    s = { ...s, env: 'Production' }
    s = promoteApi(s, sbxApi, { policies: true, tiers: true, alerts: false })
    s = finishDeploys(deployApp(s, form('Production', s.lastApi, PRD_BOX, `${QUAY},${TIDEPOOL}`)).state)
    return advance(s, 2 * MINUTE)
  },
  answers: { 6: 1, 16: 1 },
}

export const LABS = [lab]
