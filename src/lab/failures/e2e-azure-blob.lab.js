// The end to end lab of Azure Blob Storage. See platform-labs.js for the shape of a lab, and e2eKit in e2e-sftp.lab.js
// for the steps the four file labs share.
import { addMonAlert, advance, at, callApi, mark, MINUTE, newApp, newPlatform, requestAccess } from '../platform.js'
import { ask, call, change, until } from '../platform-kit.js'
import { addContainer, createSas, newContainer, newStorage, sasState, setSystemUp, systemsOf } from '../platform-systems.js'
import { e2eKit } from '../platform-e2e-kit.js'
import { blobOf, manifestLine, manifestOf, PKG, READER } from './e2e-azure-blob.pkg.js'

const NAME = PKG
const ASSET = 'invoice-documents-system-api'
const TITLE = 'Invoice Documents System API'
const SBX = 'brightmartfinsbx'
const PRD = 'brightmartfinprd'
const CONTAINER = 'finance-invoices'
const ALERT_TO = 'finance-systems@brightmart.example'
const CLIENT = { name: 'Billing System', clientId: 'bil-41d8e2', clientSecret: 'bil-secret-07c3' }
const DAY = 24 * 60 * MINUTE
const inv = (id, customerId, amount) => ({ invoiceId: id, customerId, amount, currency: 'EUR', issuedAt: '2026-11-03', pdf: 'JVBERi0xLjcKJcfsj6IKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoK' })
const FIRST = inv('INV-26-1001', 'C-102', 342.1)
const SECOND = inv('INV-26-1002', 'C-101', 120)
const LATE = inv('INV-26-1003', 'C-103', 77)
const LIVE = { ...inv('INV-26-2001', 'C-100', 64.9), issuedAt: '2026-11-04' }
const body = (x) => JSON.stringify(x)
const CID = 'bill-7731' // the correlation ID the billing system sends with the first invoice

const RAML = `#%RAML 1.0
title: ${TITLE}
version: v1
mediaType: application/json
types:
  Invoice:
    properties:
      invoiceId:
        type: string
        pattern: ^INV-\\d{2}-\\d{4}$
      customerId: string
      amount: number
      currency: string
      issuedAt: date-only
      pdf:
        type: string
        description: The PDF in base64
  Stored:
    properties:
      invoiceId: string
      status:
        enum: [stored, waiting]
      blob?: string
      manifest?: string
      correlationId?: string
/invoices:
  post:
    description: Store the PDF of an invoice and add it to the manifest of its day
    body:
      type: Invoice
      example: |
        { "invoiceId": "INV-26-1001", "customerId": "C-102", "amount": 342.10, "currency": "EUR", "issuedAt": "2026-11-03", "pdf": "JVBERi0xLjcK" }
    responses:
      201:
        body:
          type: Stored
          example: |
            { "invoiceId": "INV-26-1001", "status": "stored", "blob": "invoices/2026/11/03/INV-26-1001.pdf", "manifest": "manifests/2026-11-03.csv" }
      202:
        body:
          example: |
            { "invoiceId": "INV-26-1001", "status": "waiting" }
  /{invoiceId}:
    get:
      description: Where the document of one invoice is
      responses:
        200:
          body:
            type: Stored
            example: |
              { "invoiceId": "INV-26-1001", "status": "stored", "blob": "invoices/2026/11/03/INV-26-1001.pdf", "correlationId": "bill-7731" }
        404:
          body:
            example: |
              { "message": "No such invoice" }
`

const FLOW_XML = `<http:request-config name="Blob_Config">
  <http:request-connection protocol="HTTPS" host="\${blob.account}.blob.core.windows.net" port="443" />
</http:request-config>

<flow name="post:\\invoices:invoice-documents-system-api-config">
  <ee:transform doc:name="Invoice to blob and manifest line">
    <ee:variables>
      <ee:set-variable variableName="blobPath"><![CDATA[%dw 2.0
output application/java
---
"/\${blob.container}/invoices/" ++ (payload.issuedAt as Date as String { format: "yyyy/MM/dd" }) ++ "/" ++ payload.invoiceId ++ ".pdf"]]></ee:set-variable>
      <ee:set-variable variableName="manifestLine"><![CDATA[%dw 2.0
output application/csv header=false
---
[{ invoice_id: payload.invoiceId, customer_id: payload.customerId,
   amount: payload.amount as String { format: "0.00" }, currency: payload.currency,
   issued_at: payload.issuedAt, blob: vars.blobPath }]]]></ee:set-variable>
    </ee:variables>
  </ee:transform>
  <!-- Put Blob that never overwrites: a second POST of the same invoice gets 409 and answers 200 -->
  <http:request method="PUT" config-ref="Blob_Config" path="#[vars.blobPath ++ '?' ++ p('secure::blob.sas')]">
    <http:body>#[fromBase64(payload.pdf)]</http:body>
    <http:headers>#[{ 'x-ms-blob-type': 'BlockBlob', 'If-None-Match': '*', 'Content-Type': 'application/pdf' }]</http:headers>
  </http:request>
  <!-- Append Block on the append blob manifests/yyyy-MM-dd.csv -->
  <http:request method="PUT" config-ref="Blob_Config" path="#[vars.manifestPath ++ '?comp=appendblock&amp;' ++ p('secure::blob.sas')]" />
  <error-handler>
    <on-error-continue type="HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY, HTTP:FORBIDDEN">
      <os:store key="#[payload.invoiceId]" objectStore="invoice-retry" />
      <set-variable variableName="httpStatus" value="202" />
    </on-error-continue>
  </error-handler>
</flow>`

const kit = e2eKit({ title: TITLE, assetId: ASSET, raml: RAML, calls: [['POST', '/invoices'], ['GET', '/invoices/INV-26-1001']], mock: 'POST /invoices', pkg: PKG, name: NAME, client: CLIENT, label: 'invoice-docs-sbx' })
const { check } = kit

const acc = (s, a = SBX) => s.systems?.storage?.[a]
const blobs = (s, a = SBX) => acc(s, a)?.containers?.[CONTAINER]?.blobs ?? {}
const st = (s, env = 'Sandbox') => check.appIn(s, env)?.store ?? {}
const entry = (s, id, env = 'Sandbox') => (st(s, env).invoices ?? []).find((x) => x.invoiceId === id)
const clean = (v) => String(v ?? '').trim().replace(/^\?/, '')
const sasBy = (s, token, a = SBX) => (acc(s, a)?.sas ?? []).find((x) => x.token === clean(token))
const perms = (x) => [...String(x?.perms ?? '')].sort().join('')
// the app writes only: create and write (add is allowed too, for Append Block), on this container, for a week or more
const appSas = (s, x) => Boolean(x) && x.box === CONTAINER && x.services === 'b' && ['cw', 'acw'].includes(perms(x)) && sasState(s, SBX, x) === 'Active' && x.expires - x.created >= 7 * DAY
// finance reads only: read and list
const finSas = (s, x) => Boolean(x) && x.box === CONTAINER && x.services === 'b' && perms(x) === 'lr' && sasState(s, SBX, x) === 'Active' && x.expires - x.created >= 7 * DAY
const containerOk = (s) => acc(s)?.containers?.[CONTAINER]?.access === 'Private'
const appSasOk = (s) => containerOk(s) && (acc(s)?.sas ?? []).some((x) => appSas(s, x))
const finSasOk = (s) => containerOk(s) && (acc(s)?.sas ?? []).some((x) => finSas(s, x))
const propsOk = (s, env) => {
  const a = check.appIn(s, env)
  const p = (k) => check.prop(a, k)
  const prd = env === 'Production'
  const sas = sasBy(s, a?.secrets?.['blob.sas'], prd ? PRD : SBX)
  return Boolean(a) && p('blob.account') === (prd ? PRD : SBX) && p('blob.container') === CONTAINER && !a.props['blob.sas'] && (prd ? sas?.name === 'invoice-api-prd' : appSas(s, sas))
}
const deployedOk = (s) => check.linked(s) && propsOk(s, 'Sandbox')
const lineIn = (s, x, a = SBX) => String(blobs(s, a)[manifestOf(x)]?.content ?? '').includes(manifestLine(x))
const storedOk = (s) => deployedOk(s) && entry(s, FIRST.invoiceId)?.status === 'stored' && blobs(s)[blobOf(FIRST)]?.owner === NAME && lineIn(s, FIRST)
const tracedOk = (s) => storedOk(s) && entry(s, FIRST.invoiceId).correlationId === CID && (s.lastCalls ?? []).some((c) => c.app === NAME && c.method === 'GET' && c.path === `/invoices/${FIRST.invoiceId}` && c.status === 200)
const reader = (s) => s.apps.find((x) => x.name === READER && x.env === 'Sandbox')
const financeOk = (s) => storedOk(s) && finSas(s, sasBy(s, reader(s)?.secrets?.['blob.sas'])) && !reader(s).props['blob.sas'] && Object.values(reader(s).store?.read ?? {}).some((m) => m.invoices.includes(FIRST.invoiceId) && m.invoices.includes(SECOND.invoiceId))
const parkedOk = (s) => deployedOk(s) && Boolean(entry(s, LATE.invoiceId)?.parked) && /503|ServerBusy/.test(entry(s, LATE.invoiceId).problem ?? '') && (entry(s, LATE.invoiceId).status === 'waiting' || Boolean(entry(s, LATE.invoiceId).retried))
const redrivenOk = (s) => parkedOk(s) && acc(s).up && entry(s, LATE.invoiceId).status === 'stored' && Boolean(entry(s, LATE.invoiceId).retried) && Boolean(blobs(s)[blobOf(LATE)]) && lineIn(s, LATE)
const prodOk = (s) => check.linked(s, 'Production') && propsOk(s, 'Production') && blobs(s, PRD)[blobOf(LIVE)]?.owner === NAME && lineIn(s, LIVE, PRD)

const MAIL = {
  t: at(1, 8, 30),
  to: 'ops@brightmart.example',
  subject: 'Invoice PDFs for Ledgerline: Azure Blob, from this week',
  body: [
    'Hello integration team,',
    `finance moves its accounts archive to Ledgerline, which reads from Azure Blob Storage. Our billing system issues about 1500 invoices a day and will POST each one, with its PDF, to a new Invoice Documents API as soon as it is issued. It sends a correlation ID in X-Correlation-ID. If it gets no answer it sends the same invoice again.`,
    `Please store each PDF in the private container ${CONTAINER} of ${SBX} as invoices/yyyy/MM/dd/<invoiceId>.pdf, and add one line per invoice to the manifest of its day, manifests/<yyyy-MM-dd>.csv, with the columns ${'invoice_id,customer_id,amount,currency,issued_at,blob'}. Ledgerline reads the manifests every 5 minutes.`,
    `The API gets a SAS of its own that can create and write blobs in this container and nothing else. Ledgerline gets a SAS of its own that can read and list, nothing else. Both for 30 days; we rotate monthly. The app ${READER} of finance is already deployed and waits for its SAS in the property blob.sas.`,
    `An invoice must never be lost: if Azure Storage does not answer, keep it and write it later. Failures go to ${ALERT_TO}.`,
    `Production: account ${PRD}. The cloud team made ${CONTAINER} there and the SAS invoice-api-prd for the API; copy its token from the Shared access signature blade. The billing system needs its own access to the Production instance.`,
    'Finance systems',
  ].join('\n\n'),
  source: 'Finance systems',
}

function start() {
  const sbx = newStorage(SBX, { containers: { 'finance-exports': newContainer({}, { created: at(0, 9) }) } })
  const prd = newStorage(PRD, { containers: { [CONTAINER]: newContainer({}, { created: at(0, 10) }) } })
  let s = newPlatform({
    clock: at(1, 8), mail: [MAIL], clients: [structuredClone(CLIENT)], studioPkgs: { [ASSET]: PKG },
    systems: systemsOf({ storage: [sbx, prd] }),
  })
  s = createSas(s, PRD, { services: 'b', box: CONTAINER, perms: 'cw', expires: s.clock + 30 * DAY, key: 'key1', name: 'invoice-api-prd' }).state
  s.apps = [newApp(READER, { props: { 'blob.account': SBX, 'blob.container': CONTAINER } })]
  return until(s, at(1, 9))
}

const lab = {
  id: 'p-e2e-azure-blob',
  group: 'End to end by system',
  title: 'End to end: invoice PDFs, billing API to Azure Blob',
  minutes: 60,
  scenario: `Finance moves its archive to Ledgerline, which reads invoice PDFs and daily manifests from Azure Blob Storage. You build the Invoice Documents System API from the request to Production: the spec in Design Center, the Studio project from Exchange, a private container with one SAS for the API and one for finance, the API instance, the deployment, and the promotion. An invoice goes from a POST of the billing system, through ${NAME} and its DataWeave mapping, to a PDF blob and a line in the manifest of its day in ${CONTAINER}, where ${READER} reads it. During a storage outage an invoice waits in the Object Store and is written when Azure answers again. The Inbox has the request.`,
  start,
  steps: [
    kit.steps.inbox('finance systems', 'the blob names, the manifest columns, the two SAS, the retries of the billing system and who gets the alerts'),
    kit.steps.spec(),
    kit.steps.mock(),
    kit.steps.publish(),
    kit.steps.studio(),
    ask(
      'SAS or account key',
      'How do the API and Ledgerline get into the container?',
      [
        'Both use the account key from Access keys, it never expires',
        `Each gets a service SAS for ${CONTAINER} only: the API Create and Write, Ledgerline Read and List, both with an expiry. A leaked API token cannot read invoices, a leaked Ledgerline token cannot change them, and neither reaches the other containers`,
        'One SAS with every permission, shared by both, so there is one secret less',
        'Make the container public so no token is needed',
      ],
      1,
      'The account key opens every container and share of the account, and only a key rotation stops it. A SAS limits the resource, the permissions and the time. Two tokens also tell the Activity log who did what, and each side can be rotated alone.',
    ),
    kit.steps.export(FLOW_XML, 'The Put Blob, the manifest line and the retry are written already. '),
    {
      title: 'Create the private container',
      how: `Azure Blob Storage from the console menu, ${SBX}, Containers, + Container. Name ${CONTAINER}, Anonymous access level Private. Create.`,
      done: containerOk,
    },
    {
      title: 'Generate the SAS of the API',
      how: `${SBX}, Shared access signature. Scope: Container ${CONTAINER}. Permissions Create and Write only (Add may stay for the Append Block). Expiry after 30 days, signing key key1. Generate SAS and connection string, and keep the SAS token for the deployment.`,
      done: appSasOk,
    },
    {
      title: 'Generate the SAS of finance',
      how: `The same blade again. Scope: Container ${CONTAINER}. Permissions Read and List only. Expiry after 30 days. Generate SAS and connection string, and keep this second token for Ledgerline.`,
      done: finSasOk,
    },
    kit.steps.instance(),
    kit.steps.access(),
    {
      title: 'Deploy from the exported jar',
      how: `Runtime Manager, Deploy application. Application Name ${NAME}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties tab: blob.account ${SBX}, blob.container ${CONTAINER}, api.id with the API Instance ID, anypoint.platform.client_id. Then add blob.sas with the SAS token of the API and anypoint.platform.client_secret, each with Protect. Deploy, wait for Running, and check that the API instance is Active.`,
      done: deployedOk,
    },
    ask(
      'The same invoice twice',
      'The billing system sends INV-26-1001 again because its first call timed out. What should the API do?',
      [
        'Write the PDF again and add a second manifest line',
        'Put Blob with If-None-Match: * fails with 409 BlobAlreadyExists for a blob that is there. The flow treats that as done and answers 200, so the manifest keeps one line and the retry of the caller is safe',
        'Answer 500 so the billing system stops',
        'Delete the old blob first',
      ],
      1,
      'A caller that retries needs an idempotent API. The invoice ID is the natural key, and the blob name carries it, so the storage itself refuses a second copy. A manifest with duplicate lines would make Ledgerline book the invoice twice.',
    ),
    {
      title: 'Post the first invoices',
      how: `Lab tools, API client. Application ${NAME}, Send as ${CLIENT.name}, POST /invoices, X-Correlation-ID header ${CID}, Body ${body(FIRST)}. Send: 201. Then POST ${body(SECOND)} with no correlation header.`,
      done: storedOk,
    },
    {
      title: 'Follow one record',
      how: `Runtime Manager, ${NAME}, Logs: search ${CID} to see the request, the mapping and the Put Blob. API client, GET /invoices/${FIRST.invoiceId}: the blob, the manifest and the correlationId. Then Azure Blob Storage, ${SBX}, Containers, ${CONTAINER}: open ${blobOf(FIRST)}, then ${manifestOf(FIRST)}. Its line is ${manifestLine(FIRST)}, and the Activity log shows Put Blob by ${NAME}.`,
      done: tracedOk,
    },
    {
      title: 'Let finance read it',
      how: `Runtime Manager, ${READER}, Settings, Properties tab. Add blob.sas with the SAS token of finance, Protect, Apply Changes. Move the clock 5 minutes. Its log says Ledgerline read ${manifestOf(FIRST)} with 2 invoices and downloaded the PDFs.`,
      done: financeOk,
    },
    {
      title: 'Survive a storage outage',
      how: `Azure Blob Storage, ${SBX}, Overview, Make unavailable (lab). Then API client, POST /invoices with ${body(LATE)}. The answer is 202 waiting, the log shows 503 ServerBusy, and GET /invoices/${LATE.invoiceId} says waiting. The invoice is in the Object Store, not lost.`,
      done: parkedOk,
    },
    {
      title: 'Bring storage back and see the invoice arrive',
      how: `Overview, Make available (lab). Move the clock 5 minutes. invoice-retry-flow writes ${blobOf(LATE)} and adds its line to the manifest, and GET /invoices/${LATE.invoiceId} says stored.`,
      done: redrivenOk,
    },
    kit.steps.alert(ALERT_TO),
    kit.steps.promote(),
    {
      title: 'Deploy to Production and see one record arrive',
      how: `Runtime Manager in Production, Deploy application, ${NAME} from the same jar. blob.account ${PRD}, blob.container ${CONTAINER}, blob.sas with the token of invoice-api-prd (Shared access signature of ${PRD}, Token column), api.id of the Production instance, and the credentials of Production from Environment information. Then Exchange, ${TITLE}, Request access for the Production instance as ${CLIENT.name}, and API client in Production: POST ${body(LIVE)}. The blob appears in ${PRD}.`,
      done: prodOk,
    },
  ],
  why: 'Finance needed invoice PDFs and a daily manifest in Azure Blob for its archive tool. I designed the Invoice Documents System API, mocked it, published it and imported it in Studio. The flow maps each invoice with DataWeave to a blob path by date and a manifest line, writes the PDF with Put Blob and If-None-Match: * so a retried POST answers 200 without a second copy, and adds the line with Append Block. On the storage side the container is private and there are two service SAS for that container: Create and Write for the API, Read and List for finance, both with an expiry. In API Manager the instance has Client ID Enforcement and the billing system has a contract. I deployed with the SAS protected, posted an invoice with a correlation ID, found it in the log, the blob, the manifest and the read of Ledgerline. During a storage outage the invoice waited in a persistent Object Store and a retry flow wrote it when Azure came back. An alert goes to finance systems, and Production uses the same jar with its own account, SAS and API instance.',
  docs: 'https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview',
  solve(s0) {
    let s = mark(s0, 'inbox')
    s = kit.solve.studio(kit.solve.design(s))
    s = addContainer(s, SBX, CONTAINER, 'Private')
    const app = createSas(s, SBX, { services: 'b', box: CONTAINER, perms: 'cw', expires: s.clock + 30 * DAY, key: 'key1' })
    const fin = createSas(app.state, SBX, { services: 'b', box: CONTAINER, perms: 'rl', expires: s.clock + 30 * DAY, key: 'key1' })
    s = kit.solve.api(fin.state)
    s = mark(kit.solve.deploy(s, { 'blob.account': SBX, 'blob.container': CONTAINER }, { 'blob.sas': `?${app.token}` }), `logs:${NAME}`)
    s = callWith(s, CID, FIRST)
    s = call(s, NAME, CLIENT, '/invoices', 'POST', body(SECOND)).state
    s = call(s, NAME, CLIENT, `/invoices/${FIRST.invoiceId}`).state
    s = mark(s, `blob:${SBX}`)
    s = change(s, READER, { props: s.apps.find((x) => x.name === READER).props, secrets: { 'blob.sas': `?${fin.token}` } })
    s = advance(s, 6 * MINUTE)
    s = setSystemUp(s, 'storage', SBX, false)
    s = call(s, NAME, CLIENT, '/invoices', 'POST', body(LATE)).state
    s = advance(setSystemUp(s, 'storage', SBX, true), 6 * MINUTE)
    s = addMonAlert(s, { title: 'Invoice documents failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = kit.solve.promote(s)
    const token = acc(s, PRD).sas.find((x) => x.name === 'invoice-api-prd').token
    s = kit.solve.deploy(s, { 'blob.account': PRD, 'blob.container': CONTAINER }, { 'blob.sas': `?${token}` })
    s = requestAccess(s, check.api(s, 'Production').id, CLIENT.name)
    return call(s, NAME, CLIENT, '/invoices', 'POST', body(LIVE)).state
  },
  answers: { 5: 1, 13: 1 },
}
// a call of the API client with an X-Correlation-ID header
const callWith = (s, cid, x) => callApi(s, { env: s.env, app: NAME, method: 'POST', path: '/invoices', body: body(x), client: CLIENT.name, clientId: CLIENT.clientId, clientSecret: CLIENT.clientSecret, cid }).state

export const LABS = [lab]
