// The guided lab setup-key-vault. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, deployApp, finishDeploys, mark, MINUTE, newPlatform, runNow } from '../platform.js'
import { app, ask, sawLogs, until } from '../platform-kit.js'
import { ACCESS_MODELS, addSecretVersion, latestVersion, newVault, setSecretVersion, setVaultAccess, systemsOf } from '../platform-systems.js'
import { DB_USER, FLOW, NAME, NEW_PASSWORD, OLD_PASSWORD } from './setup-key-vault.pkg.js'

const VAULT = 'brightmart-kv'
const SECRET = 'order-history-db-password'
const DB_HOST = 'orders-db.brightmart.lab'
const DB_NAME = 'OrderHistory'
const CLIENT_ID = 'lab-app-registration-0077'
const CLIENT_SECRET = 'lab-practice-client-secret-77' // a practice value of the lab, not a real secret
const ALERT_TO = 'dba-team@brightmart.example'

const kv = (s) => s.systems?.vaults?.[VAULT]
const sec = (s) => kv(s)?.secrets?.[SECRET]
const a = (s) => app(s, NAME)
const store = (s) => a(s)?.store ?? {}
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((x) => list.includes(x))

const secretOk = (s) => (sec(s)?.versions ?? []).some((v) => v.value === OLD_PASSWORD && v.enabled)
// least privilege: Get on secrets under access policies, or only the Key Vault Secrets User role under RBAC
const accessOk = (s) => {
  const v = kv(s)
  if (!v) return false
  return v.model === ACCESS_MODELS[0] ? sameSet(v.access[NAME], ['get']) : sameSet(v.roles[NAME], ['Key Vault Secrets User'])
}
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const deployedOk = (s) => {
  const x = a(s)
  if (x?.status !== 'Running') return false
  const leaked = Object.entries({ ...x.props, ...x.secrets }).some(([k, v]) => /password/i.test(k) || [OLD_PASSWORD, NEW_PASSWORD].includes(String(v).trim()))
  return (
    prop(s, 'kv.name') === VAULT && prop(s, 'kv.secret.name') === SECRET && !prop(s, 'kv.secret.version') && !String(x.secrets['kv.secret.version'] ?? '').trim() && prop(s, 'kv.client.id') === CLIENT_ID &&
    x.secrets['kv.client.secret'] === CLIENT_SECRET && !x.props['kv.client.secret'] && prop(s, 'db.host') === DB_HOST && prop(s, 'db.name') === DB_NAME && !leaked
  )
}
const connected = (s) => deployedOk(s) && accessOk(s) && (store(s).runs ?? 0) > 0 && Boolean(s.seen[`vault:${VAULT}`]) && kv(s).log.some((l) => l.who === NAME && l.op === 'SecretGet' && l.ok)
const alerted = (s) => s.monAlerts.some((x) => x.enabled && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO))
// a staged version that is not enabled yet: the app failed closed with 403 on the disabled current version
const failedClosed = (s) => connected(s) && (sec(s)?.versions ?? []).some((v) => v.value === NEW_PASSWORD) && (store(s).denied ?? []).some((d) => d.kind === 'disabled')
// the new version is current and enabled, and the app read it on a later run without a new deployment
const rotated = (s) => {
  const cur = latestVersion(sec(s))
  return failedClosed(s) && cur?.value === NEW_PASSWORD && cur.enabled && store(s).version === cur.id && (store(s).versions ?? []).length >= 2 && a(s).updated < cur.created
}

const MAIL = {
  t: at(1, 8, 10),
  to: 'ops@brightmart.example',
  subject: `${NAME}: database password in Key Vault`,
  body: [
    'Hello integration team,',
    `${NAME} goes live today. It copies orders into ${DB_HOST}, database ${DB_NAME}, as the login ${DB_USER}. Security wants the password of that login in the Key Vault ${VAULT}, never in the app. Please:`,
    `1. Create the secret ${SECRET} with the current password ${OLD_PASSWORD}. It is a practice value of the lab.`,
    `2. Give the app registration ${NAME} only what it needs to read it.`,
    `3. Deploy the app with kv.client.id ${CLIENT_ID} and its client secret ${CLIENT_SECRET}, kept protected.`,
    `4. Before go-live, test our monthly rotation the way our script runs it: the new password ${NEW_PASSWORD} goes in as a new version that is not enabled yet, and is enabled at the cutover. The database accepts both passwords today. The app must follow without a redeploy.`,
    `5. Failures go to ${ALERT_TO}.`,
    'Database team',
  ].join('\n\n'),
  source: 'Database team',
}

const lab = {
  id: 'p-setup-key-vault',
  group: 'Security',
  title: 'Set up Key Vault for the database password of an app',
  minutes: 25,
  scenario: `It is 09:00 on Tuesday. ${NAME} is built and its jar is ready, and security wants its database password in the Azure Key Vault ${VAULT}. The vault exists, but it has no secret for the app and the app has no access. Done means the app reads the password from the vault, a disabled version makes it fail loudly, and a rotation reaches it without a redeploy. The Inbox has the request.`,
  start() {
    const vault = newVault(VAULT, { access: { 'Brightmart Platform Admins': ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore'] } })
    let s = newPlatform({ clock: at(1, 8), jars: [NAME], systems: systemsOf({ vaults: [vault], principals: [NAME] }), mail: [MAIL] })
    s = addSecretVersion(s, VAULT, 'payments-api-key', 'lab-practice-payments-key', { contentType: 'API key', who: 'payments-team' })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of the database team. Note the vault, the secret name, the app registration and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the secret',
      how: `Azure Key Vault from the console menu, ${VAULT}, Secrets, Generate/Import. Name ${SECRET}, Secret value the current password from the mail, Content type password, Enabled Yes. Create.`,
      done: secretOk,
    },
    ask(
      'Least privilege on the vault',
      `What access does the identity of ${NAME} get?`,
      [
        'Key Vault Administrator, so it never gets a 403',
        'Get, List and Set on secrets, so it can rotate its own password',
        'Get on secrets and nothing else: an access policy with Get only, or under RBAC the role Key Vault Secrets User. The app reads one secret and never lists, writes or deletes',
        'Key Vault Reader, because the app only reads',
      ],
      2,
      `The app reads one secret by name, so Get is enough. List would show it every secret name, such as payments-api-key, and Set or Delete would let a bug or a stolen client secret change them. Key Vault Reader sees only metadata and never the value, so the read would fail. An access policy applies to every secret of the vault; with RBAC you can also assign the role on one secret only.`,
    ),
    {
      title: 'Give the app Get only',
      how: `${VAULT}, Access policies, Create. Principal ${NAME}, Secret permissions Get, and untick the rest. Create. Under RBAC instead: Access configuration, Azure role-based access control, then Access control (IAM), Add role assignment, Key Vault Secrets User for ${NAME}.`,
      done: accessOk,
    },
    {
      ...sawLogs(NAME),
      title: 'Deploy the app with the vault properties',
      how: `Runtime Manager, Deploy application. Name ${NAME}, file ${NAME}-1.0.0-mule-application.jar. Properties: kv.name ${VAULT}, kv.secret.name ${SECRET}, kv.client.id ${CLIENT_ID}, db.host ${DB_HOST}, db.name ${DB_NAME}. Add kv.client.secret from the mail and select Protect. No kv.secret.version and no password property. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'See the app read the secret',
      how: `Schedules, ${FLOW}, Run. The log shows the secret read and the connection to ${DB_HOST}. Azure Key Vault, ${VAULT}, Activity log shows SecretGet by ${NAME}, Succeeded.`,
      done: connected,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail.`,
      done: alerted,
    },
    {
      title: 'Stage the new password disabled',
      how: `${VAULT}, Secrets, ${SECRET}, New Version. Secret value the new password from the mail, Enabled No. Create. Run the flow again: the read fails with 403 Forbidden, because the current version is disabled. The app stops and the error counts, it does not fall back to the old value.`,
      done: failedClosed,
    },
    {
      title: 'Cut over and see the app follow',
      how: `${SECRET}, open the current version, Enabled Yes, Apply. Run the flow again, or move the clock 5 minutes. The log shows the new version read and the connection works. Do not redeploy the app.`,
      done: rotated,
    },
    ask(
      'Why no redeploy',
      `Why did ${NAME} pick up the new password without a redeploy?`,
      [
        'Key Vault pushes new versions to every app',
        'The app reads the secret by name without a version on each run, so the vault returns the current version. A pinned version id, or a value copied into a property, would keep the old password until someone changes the app',
        'Runtime Manager restarts apps when a secret changes',
        'Because the access policy has Get',
      ],
      1,
      'A secret identifier without a version always means the current version. Apps that cache the value should keep the cache short, or read again after a login error. An enabled current version is what every reader gets, which is why a rotation stages the new value disabled and enables it at the cutover.',
    ),
    ask(
      'Rotation without downtime',
      'SQL Server keeps one password per login. How does a rotation avoid a gap where the app has a password the database no longer accepts?',
      [
        'Change the password and the secret at the same second',
        'Use two logins. Rotate the one the app does not use, store it as the new current version, let the app move over on its next read, then rotate the other login next time',
        'Stop the app during the rotation',
        'Set a long expiration date on the secret',
      ],
      1,
      'This is the dual credential pattern Microsoft describes for Key Vault rotation. The lab database accepts both passwords for the day, which stands for that overlap. Expiration dates are informational for secrets: Key Vault still returns an expired value, so they do not protect anything by themselves.',
    ),
  ],
  why: 'A Key Vault setup in short: create the secret, give the identity of the app Get on secrets and nothing more (an access policy or the Key Vault Secrets User role), and deploy with the vault name and secret name but no version and no password, with the bootstrap client secret protected. Check the Activity log for the read, add an alert, and test the rotation: a disabled current version makes the app fail closed, and once it is enabled the next read gets it without a redeploy. In the lab the identity of the app is named after the app and the OAuth token step is not modelled.',
  docs: 'https://learn.microsoft.com/en-us/azure/key-vault/secrets/about-secrets',
  solve(start) {
    let s = mark(start, 'inbox')
    s = addSecretVersion(s, VAULT, SECRET, OLD_PASSWORD, { contentType: 'password' })
    s = setVaultAccess(s, VAULT, NAME, ['get'])
    const props = { 'kv.name': VAULT, 'kv.secret.name': SECRET, 'kv.client.id': CLIENT_ID, 'db.host': DB_HOST, 'db.name': DB_NAME }
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props, secrets: { 'kv.client.secret': CLIENT_SECRET } }).state)
    s = mark(runNow(mark(s, `logs:${NAME}`), NAME, FLOW), `vault:${VAULT}`)
    s = addMonAlert(s, { title: 'Order history sync failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = advance(s, MINUTE)
    s = runNow(addSecretVersion(s, VAULT, SECRET, NEW_PASSWORD, { contentType: 'password', enabled: false }), NAME, FLOW)
    s = advance(s, MINUTE)
    s = setSecretVersion(s, VAULT, SECRET, latestVersion(sec(s)).id, { enabled: true })
    return runNow(s, NAME, FLOW)
  },
  answers: { 2: 2, 9: 1, 10: 1 },
}

export const LABS = [lab]
