// The guided lab setup-azure-blob. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, deployApp, finishDeploys, mark, newPlatform, runNow } from '../platform.js'
import { app, ask, sawLogs, until } from '../platform-kit.js'
import { addContainer, addSecretVersion, createSas, DEFAULT_EGRESS, latestVersion, newContainer, newStorage, newVault, sasState, setNetwork, setVaultAccess, systemsOf } from '../platform-systems.js'
import { blobName, CUSTOMERS, FLOW, NAME, rejectsName } from './setup-azure-blob.pkg.js'

const ACCOUNT = 'harborexports'
const CONTAINER = 'customer-exports'
const PREFIX = 'daily'
const VAULT = 'harbor-kv'
const SECRET = 'customer-export-sas'
const OFFICE = '198.51.100.0/24' // lab made: the Harbor office range (a documentation range)
const CLIENT_ID = 'lab-app-registration-0042'
const CLIENT_SECRET = 'lab-practice-client-secret-42' // a practice value of the lab, not a real secret
const ALERT_TO = 'crm-team@harbor.example'
const DAY = 24 * 60 * 60000

const acc = (s) => s.systems?.storage?.[ACCOUNT]
const kv = (s) => s.systems?.vaults?.[VAULT]
const a = (s) => app(s, NAME)
const clean = (v) => String(v ?? '').trim().replace(/^\?/, '')
const last = (s) => a(s)?.schedules.find((x) => x.flow === FLOW)?.last

const containerOk = (s) => acc(s)?.containers?.[CONTAINER]?.access === 'Private'
// a service SAS for the one container: create and write only, an expiry of a week or more, still valid
const goodSas = (s, x) => Boolean(x) && x.box === CONTAINER && x.services === 'b' && x.perms === 'cw' && sasState(s, ACCOUNT, x) === 'Active' && x.expires - x.created >= 7 * DAY
const sasOk = (s) => containerOk(s) && (acc(s)?.sas ?? []).some((x) => goodSas(s, x))
// the firewall stays on: the office range and a narrow rule (/24 or smaller) that covers the outbound IP of the app
const ipNum = (x) => String(x).split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0
const covers = (rule, ip) => {
  const [base, bits = '32'] = String(rule).trim().split('/')
  const b = Number(bits)
  if (!/^\d+(\.\d+){3}$/.test(base) || !(b >= 24 && b <= 32)) return false
  const m = (~0 << (32 - b)) >>> 0
  return (ipNum(ip) & m) === (ipNum(base) & m)
}
const networkOk = (s) => {
  const n = acc(s)?.network
  return n?.mode === 'Selected networks' && n.ips.includes(OFFICE) && n.ips.some((r) => covers(r, DEFAULT_EGRESS))
}
// the current version holds a good SAS, and the identity of the app may get secrets and nothing more
const vaultOk = (s) => {
  const cur = latestVersion(kv(s)?.secrets?.[SECRET])
  const x = (acc(s)?.sas ?? []).find((y) => y.token === clean(cur?.value))
  const policy = kv(s)?.access?.[NAME] ?? []
  return Boolean(cur?.enabled) && goodSas(s, x) && kv(s).model === 'Vault access policy' && policy.length === 1 && policy[0] === 'get'
}
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const deployedOk = (s) => {
  const x = a(s)
  if (x?.status !== 'Running') return false
  const sasAnywhere = Object.values({ ...x.props, ...x.secrets }).some((v) => /sig=/.test(String(v)))
  return (
    prop(s, 'blob.account') === ACCOUNT && prop(s, 'blob.container') === CONTAINER && prop(s, 'blob.prefix').replace(/^\/+|\/+$/g, '') === PREFIX && prop(s, 'kv.name') === VAULT && prop(s, 'kv.secret.name') === SECRET &&
    prop(s, 'kv.client.id') === CLIENT_ID && x.secrets['kv.client.secret'] === CLIENT_SECRET && !x.props['kv.client.secret'] && !sasAnywhere
  )
}
const blobs = (s) => acc(s)?.containers?.[CONTAINER]?.blobs ?? {}
const exported = (s) => {
  const b = blobs(s)[blobName(PREFIX, last(s)?.t ?? 0)]
  const x = (a(s)?.store?.exports ?? []).at(-1)
  return deployedOk(s) && networkOk(s) && vaultOk(s) && Boolean(last(s)?.ok) && Boolean(b) && b.owner === NAME && x?.rows === CUSTOMERS.length - 1 && String(b.content).trim().split('\n').length - 1 === x.rows
}
const rejected = (s) => exported(s) && /C-1043/.test(blobs(s)[rejectsName(PREFIX, last(s).t)]?.content ?? '')
const alerted = (s) => s.monAlerts.some((x) => x.enabled && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO))

const MAIL = {
  t: at(1, 8, 15),
  to: 'ops@harbor.example',
  subject: 'Nightly customer export to Azure Blob',
  body: [
    'Hello integration team,',
    `the CRM team wants the customers that changed each day in Azure Blob Storage, so the data team can load them. The app ${NAME} is built. Please set it up today so it runs tonight at 02:00 UTC:`,
    `1. Storage account ${ACCOUNT}, a private container ${CONTAINER}. Blobs go under ${PREFIX}/.`,
    `2. A SAS for that container only. The app creates and writes blobs and must not read, list or delete them. 30 days, we rotate it monthly.`,
    `3. The firewall of ${ACCOUNT} allows only the office range ${OFFICE}. Add the outbound IP of our CloudHub apps, ${DEFAULT_EGRESS}, and nothing wider.`,
    `4. The SAS goes in the Key Vault ${VAULT} as the secret ${SECRET}, never in the app. The app registration ${NAME} (client id ${CLIENT_ID}) reads it. Its client secret is ${CLIENT_SECRET}. It is a practice value: keep it protected.`,
    `5. Rejected rows must not be lost, and failures go to ${ALERT_TO}.`,
    'CRM team',
  ].join('\n\n'),
  source: 'CRM team',
}

const lab = {
  id: 'p-setup-azure-blob',
  group: 'Files, SFTP and batch',
  title: 'Set up the nightly customer export to Azure Blob Storage',
  minutes: 30,
  scenario: `It is 09:00 on Tuesday. The CRM team asks for a nightly export of changed customers to Azure Blob Storage, for the data team. The app ${NAME} is built and its jar is ready. The storage account ${ACCOUNT} and the Key Vault ${VAULT} exist, but nothing is set up for the export: no container, no SAS, no firewall rule, no secret. Done means a test run puts the blob in the container, the bad row lands in a rejects blob, and failures raise an alert. The Inbox has the request.`,
  start() {
    const store = newStorage(ACCOUNT, { network: { mode: 'Selected networks', ips: [OFFICE] }, containers: { 'crm-archive': newContainer({}, { created: at(0, 9) }) } })
    const vault = newVault(VAULT, { access: { 'Harbor Platform Admins': ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore'] } })
    const s = newPlatform({ clock: at(1, 8), jars: [NAME], systems: systemsOf({ storage: [store], vaults: [vault], principals: [NAME] }), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of the CRM team. Note the names, the SAS rules, the address and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the container',
      how: `Azure Blob Storage from the console menu, ${ACCOUNT}, Containers, + Container. Name ${CONTAINER}, Anonymous access level Private. Create.`,
      done: containerOk,
    },
    ask(
      'The narrowest SAS',
      'Which SAS fits the app?',
      [
        'An account SAS with every permission for a year, so it never breaks',
        `A service SAS for the container ${CONTAINER}, Create and Write only, 30 days. The app only puts new blobs, so a leaked token cannot read the customers or delete anything, and it ends on its own`,
        'The account key in the app, because a SAS expires',
        'A SAS with Read and List as well, so the app can check its own upload',
      ],
      1,
      'A SAS limits what a token can do, where and until when. Create and Write is what Put Blob needs. Read and List would let anyone with the token download every export of customer data. The account key opens the whole account and every other container, and only a key rotation stops it.',
    ),
    {
      title: 'Generate the SAS',
      how: `${ACCOUNT}, Shared access signature. Scope: Container ${CONTAINER}. Permissions Create and Write only. Expiry after 30 days, signing key key1. Generate SAS and connection string, and copy the SAS token.`,
      done: sasOk,
    },
    {
      title: 'Let the app through the firewall',
      how: `${ACCOUNT}, Networking. Keep Enabled from selected virtual networks and IP addresses and keep ${OFFICE}. Add ${DEFAULT_EGRESS} and Save. Do not switch to All networks.`,
      done: networkOk,
    },
    {
      title: 'Store the SAS in Key Vault',
      how: `Azure Key Vault, ${VAULT}, Secrets, Generate/Import. Name ${SECRET}, Secret value the SAS token, Content type SAS token. Create. Then Access policies, Create: Principal ${NAME}, Secret permissions Get only. Create.`,
      done: vaultOk,
    },
    {
      ...sawLogs(NAME),
      title: 'Deploy the app with its properties',
      how: `Runtime Manager, Deploy application. Name ${NAME}, file ${NAME}-1.0.0-mule-application.jar. Properties: blob.account ${ACCOUNT}, blob.container ${CONTAINER}, blob.prefix ${PREFIX}, kv.name ${VAULT}, kv.secret.name ${SECRET}, kv.client.id ${CLIENT_ID}. Add kv.client.secret with the value from the mail and select Protect. No SAS in the properties. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'Run a test export',
      how: `Runtime Manager, ${NAME}, Schedules, ${FLOW}, Run. The log shows the secret read from ${VAULT} and ${CUSTOMERS.length - 1} customers uploaded. Azure Blob Storage, ${ACCOUNT}, Containers, ${CONTAINER}, ${PREFIX}: the blob is there with the same number of rows, and the Activity log shows Put Blob by ${NAME}.`,
      done: exported,
    },
    {
      title: 'Check the rejected row',
      how: `In ${CONTAINER}, open ${PREFIX}/rejects. The rejects blob of today holds C-1043, whose email is not valid, with the reason. The row is kept for the CRM team, not dropped.`,
      done: (s) => rejected(s) && Boolean(s.seen[`blob:${ACCOUNT}`]),
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail.`,
      done: alerted,
    },
    ask(
      'Where the SAS lives',
      'Why does the app read the SAS from Key Vault on each run, and not from a protected property?',
      [
        'Key Vault is faster than a property',
        'The SAS is rotated every month. In the vault the storage team adds a new version and the next run reads it, with no redeploy and an audit log of each read. A protected property needs an Apply Changes for each rotation. The client secret that opens the vault still has to be protected',
        'Protected properties cannot hold a SAS',
        'Because the vault makes the SAS never expire',
      ],
      1,
      'Keep secrets that rotate where they can rotate without a release. Read the current version, not a pinned one, so the next run follows. The app still has one bootstrap credential, here the client secret of its app registration, and that one belongs in a protected property.',
    ),
  ],
  why: 'An Azure Blob setup in short: a private container, a service SAS for that container with only the letters the flow needs and an expiry, a narrow firewall rule for the outbound IP of the app, and the SAS kept in Key Vault with a get only access policy for the identity of the app. Deploy with the names that match, protect the bootstrap credential, and run a test: the blob arrives with the right row count, rejected rows go to a rejects blob, and an alert reaches the team that owns the export.',
  docs: 'https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview',
  solve(start) {
    let s = mark(start, 'inbox')
    s = addContainer(s, ACCOUNT, CONTAINER, 'Private')
    const made = createSas(s, ACCOUNT, { services: 'b', box: CONTAINER, perms: 'cw', expires: s.clock + 30 * DAY, key: 'key1' })
    s = setNetwork(made.state, 'storage', ACCOUNT, { mode: 'Selected networks', ips: [OFFICE, DEFAULT_EGRESS] })
    s = addSecretVersion(s, VAULT, SECRET, `?${made.token}`, { contentType: 'SAS token' })
    s = setVaultAccess(s, VAULT, NAME, ['get'])
    const props = { 'blob.account': ACCOUNT, 'blob.container': CONTAINER, 'blob.prefix': PREFIX, 'kv.name': VAULT, 'kv.secret.name': SECRET, 'kv.client.id': CLIENT_ID }
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props, secrets: { 'kv.client.secret': CLIENT_SECRET } }).state)
    s = runNow(mark(s, `logs:${NAME}`), NAME, FLOW)
    s = mark(s, `blob:${ACCOUNT}`)
    return addMonAlert(s, { title: 'Customer export failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 1, 10: 1 },
}

export const LABS = [lab]
