// The guided lab sec-secrets. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, propsValue, sawLogs, until } from '../platform-kit.js'
import { addSecretVersion, fileRec, latestVersion, newServerSys, newVault, putFile, setSecretVersion, setServerUser, systemsOf } from '../platform-systems.js'
import { SFTP_HOST, SFTP_USER } from './sec-secrets.pkg.js'

const NAME = 'supplier-file-pull'
const FLOW = 'price-list-flow'
const VAULT = 'harbor-kv'
const SECRET = 'sftp-password'
const ROTATION = at(1, 7)
// practice values of the lab, not real passwords
const OLD_PASSWORD = 'lab-practice-pass-1'
const NEW_PASSWORD = 'lab-practice-pass-2'
const PRICE = 'sku,price,currency\nH-100,4.20,EUR\nH-200,11.75,EUR\n'
const LISTS = ['price-list-20261103-0710.csv', 'price-list-20261103-0820.csv']

const kv = (s) => s.systems?.vaults?.[VAULT]
const server = (s) => s.systems?.servers?.[SFTP_HOST]
const last = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
// the app reads the current version and keeps the credential of its app registration protected
const appOk = (s) => {
  const a = app(s, NAME)
  return a?.status === 'Running' && !String(propsValue(a, 'kv.secret.version') ?? '').trim() && Boolean(String(a.secrets['kv.client.secret'] ?? '').trim()) && !a.props['kv.client.secret']
}
// the current version is enabled and holds the password the server has now
const vaultOk = (s) => {
  const cur = latestVersion(kv(s)?.secrets[SECRET])
  return Boolean(cur?.enabled) && cur.value === server(s)?.users[SFTP_USER]?.password && (kv(s).access[NAME] ?? []).includes('get')
}

const MAIL_SECURITY = {
  t: at(1, 7, 5),
  to: OPS,
  subject: 'Rotation of sftp-password done',
  body: [
    'Hello team,',
    `the monthly rotation of the SFTP password of ${SFTP_USER} on ${SFTP_HOST} ran at 07:00. The server has the new password, and it is stored in ${VAULT} as a new version of ${SECRET}. We set the expiration date of the old version to 07:00.`,
    'Apps that read the secret from the vault need no change. Security operations',
  ].join('\n\n'),
  source: 'Security operations',
}
const MAIL_PURCHASING = {
  t: at(1, 8, 45),
  to: OPS,
  subject: 'New supplier prices are missing',
  body: 'Our supplier says it uploaded two price lists this morning, at 07:10 and 08:20. Neither is in the price table, and the shops open at 10:00 with the old prices. Purchasing',
  source: 'Purchasing',
}

const lab = {
  id: 'p-sec-secrets',
  group: 'Security',
  title: 'The password was rotated, the app was not told',
  minutes: 18,
  scenario: `It is 09:00 on Tuesday. ${NAME} picks up supplier price lists from ${SFTP_HOST} every 15 minutes. It does not keep the SFTP password in its properties: each run reads ${SECRET} from the Azure Key Vault ${VAULT}, with the OAuth credentials of its app registration. Security operations rotated the password at 07:00. Since then each run fails, and the application is Running. The Inbox has two mails.`,
  start() {
    const sftp = newServerSys(SFTP_HOST, {
      ip: '10.20.5.21',
      users: { [SFTP_USER]: { password: OLD_PASSWORD, home: '/' } },
      dirs: ['/', '/in', '/archive'],
      files: { '/archive/price-list-20261102-1630.csv': fileRec(PRICE, { t: at(0, 16, 30), owner: SFTP_USER }) },
    })
    const vault = newVault(VAULT, { access: { [NAME]: ['get'], 'Harbor Platform Admins': ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore'] } })
    let s = newPlatform({ clock: at(1, 5), systems: systemsOf({ servers: [sftp], vaults: [vault] }), mail: [MAIL_SECURITY, MAIL_PURCHASING] })
    s = addSecretVersion(s, VAULT, SECRET, OLD_PASSWORD, { contentType: 'password' })
    const v1 = kv(s).secrets[SECRET].versions[0].id
    // someone once pasted the full secret identifier into the properties, version and all
    s.apps.push(
      newApp(NAME, {
        props: { 'kv.name': VAULT, 'kv.secret.name': SECRET, 'kv.secret.version': v1, 'kv.client.id': 'lab-app-registration-0001', 'kv.client.secret': 'lab-not-a-real-client-secret', 'sftp.user': SFTP_USER },
        store: {},
      }),
    )
    s = until(s, ROTATION)
    // the rotation: a new password on the server, a new version in the vault that nobody enabled, the old one expired
    s = setServerUser(s, SFTP_HOST, SFTP_USER, { password: NEW_PASSWORD })
    s = setSecretVersion(s, VAULT, SECRET, v1, { expires: ROTATION })
    s = addSecretVersion(s, VAULT, SECRET, NEW_PASSWORD, { contentType: 'password', enabled: false })
    for (const l of kv(s).log) if (l.t === ROTATION && l.who === 'you') l.who = 'secops-rotation'
    s = until(s, at(1, 7, 10))
    s = putFile(s, SFTP_HOST, `/in/${LISTS[0]}`, PRICE, { owner: 'supplier' })
    s = until(s, at(1, 8, 20))
    s = putFile(s, SFTP_HOST, `/in/${LISTS[1]}`, PRICE, { owner: 'supplier' })
    return until(s, at(1, 9))
  },
  steps: [
    sawLogs(NAME),
    ask(
      'Why the old password',
      `Each run reads ${SECRET} from the vault and then fails at the SFTP login with Auth fail. The log shows the URL of the read. The old version expired at 07:00. Why does the app still send the old password?`,
      [
        'Key Vault caches secrets for 24 hours',
        'The URL ends in a version id: kv.secret.version pins the old version. A read by version returns that version, and Key Vault still returns a secret after its expiration date, because for secrets the date is informational',
        'The SFTP server has not taken the new password yet',
        'The access policy of the app allows only old versions',
      ],
      1,
      'A secret identifier with a version always returns that version. Without the version the vault returns the current one. Expiration does not block a read of a secret: Key Vault returns it and the caller must check the date, so the expired old password went to the server and the login failed.',
    ),
    {
      title: 'Read the current version and protect the credential',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Clear kv.secret.version, so each read gets the current version. kv.client.secret is the credential the app uses to reach the vault, and it is in plain text: remove it and add it again as a protected property with the same value. Apply Changes.`,
      done: appOk,
    },
    ask(
      'A different 403',
      'After the change the read fails with 403 Forbidden and the inner code SecretDisabled. How is that different from the inner code ForbiddenByPolicy?',
      [
        'They mean the same thing',
        'SecretDisabled: the app may read, but the current version of the secret is disabled. ForbiddenByPolicy: the identity of the app has no get permission in the access policies. One is fixed on the secret, the other on the vault access',
        'SecretDisabled means the secret was deleted',
        'ForbiddenByPolicy means the vault firewall blocked the app',
      ],
      1,
      `A read without a version gets the current version, and a disabled current version answers 403 even when an older version is enabled. The rotation created the new version with Enabled set to No. ForbiddenByPolicy comes from the access policy, ForbiddenByRbac from role assignments, and ForbiddenByFirewall from the network rules. ${NAME} still has get, so this one is the version.`,
    ),
    {
      title: 'Enable the new version',
      how: `Azure Key Vault, ${VAULT}, Secrets, ${SECRET}. Open the current version, set Enabled to Yes and Apply. Check Access policies: ${NAME} keeps Get on secrets. Do not create another version: the current one already holds the password of the server.`,
      done: vaultOk,
    },
    {
      title: 'Load the missed price lists',
      how: `Schedules, ${FLOW}, Run, or move the clock 15 minutes. The log shows the current version read and both price lists of this morning moved to /archive.`,
      done: (s) => appOk(s) && vaultOk(s) && Boolean(last(s)?.ok) && last(s).t > at(1, 9) && LISTS.every((f) => server(s)?.files[`/archive/${f}`] && !server(s).files[`/in/${f}`]),
    },
    ask(
      'Rotation without downtime',
      'Next month the password is rotated again. Which plan keeps the app working through it?',
      [
        'Change the server password first and update the vault an hour later',
        'Stop the app, rotate, and start it again',
        'Let the old and the new credential work at the same time: use a second SFTP user or a server that accepts both, store the new value as an enabled current version, let apps that read the current version pick it up on their next read, and remove the old credential when the logs show it is no longer used',
        'Pin the new version id in every app on the day of the rotation',
      ],
      2,
      'A single password cannot change in two places at the same moment, so a plan that swaps one value always has a gap. Microsoft describes the dual credential pattern: two credentials, rotate the one that is not in use, then switch. Apps that read the current version follow without a redeploy. If an app caches the value, keep the cache short or retry once with a fresh read after an authentication error.',
    ),
    ask(
      'Secure properties or a vault',
      'A colleague asks why the app does not keep the SFTP password as an encrypted secure property in its project. Which answer fits?',
      [
        'Secure properties are not encrypted',
        'Secure configuration properties keep the value encrypted in the project, and the key is given at deploy time, so each rotation needs a new build or a redeploy. A vault keeps the secret outside the app with access control, versions and an audit log, and the app reads it at run time. In both cases the credential that opens the vault or the key must itself be protected',
        'A vault removes the need for any secret in the app',
        'Plain properties are fine when Runtime Manager is private',
      ],
      1,
      'Never keep a secret in plain text in properties or in the code. The Secure Configuration Properties module encrypts values with a key that Runtime Manager holds as a protected property. That is good for values that rarely change. A vault suits secrets that rotate or that many apps share. The app still needs one bootstrap credential, here kv.client.secret, and that one belongs in a protected property.',
    ),
  ],
  why: 'After a rotation an app can fail in two quiet ways. A pinned version id keeps returning the old value, and an expiration date does not stop it, because for secrets Key Vault treats the date as information. A new version that is disabled answers 403 Forbidden with SecretDisabled to every read of the current version. Read the current version, enable it, keep get in the access policy, and keep the bootstrap credential of the app in a protected property. For rotation without downtime, give the old and the new credential an overlap. In the lab the identity of the app is named after the app, and the OAuth token step is not modelled.',
  docs: 'https://learn.microsoft.com/en-us/azure/key-vault/secrets/about-secrets',
  solve(start) {
    let s = mark(start, `logs:${NAME}`)
    const a = app(s, NAME)
    const { 'kv.secret.version': _pin, 'kv.client.secret': clientSecret, ...props } = a.props
    s = change(s, NAME, { props, secrets: { ...a.secrets, 'kv.client.secret': clientSecret } })
    const cur = latestVersion(kv(s).secrets[SECRET])
    s = setSecretVersion(s, VAULT, SECRET, cur.id, { enabled: true })
    s = runNow(s, NAME, FLOW)
    return until(s, s.clock + 60000)
  },
  answers: { 1: 1, 3: 1, 6: 2, 7: 1 },
}

export const LABS = [lab]
