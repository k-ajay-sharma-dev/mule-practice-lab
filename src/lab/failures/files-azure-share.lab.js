// The guided lab files-azure-share. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { createSas, DEFAULT_EGRESS, fileRec, newShare, newStorage, regenerateKey, sasState, setNetwork, systemsOf } from '../platform-systems.js'
import { SNAPSHOT } from './files-azure-share.pkg.js'

const NAME = 'stock-snapshot-export'
const FLOW = 'snapshot-flow'
const ACCOUNT = 'brightmartstore'
const SHARE = 'stock-share'
const OFFICE = '198.51.100.0/24' // lab made: the Brightmart office and warehouse range (a documentation range)
const CHANGE = at(1, 7, 30) // when the storage team made its changes
const DAY = 24 * 60 * 60000

const acc = (s) => s.systems?.storage?.[ACCOUNT]
const last = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
// the firewall stays on: Selected networks with the office range and the outbound address of the app
// a rule is one address or a CIDR range; the one that lets the app in must be narrow (/24 or smaller), not 0.0.0.0/0
const ipNum = (x) => String(x).split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0
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
const clean = (v) => String(v ?? '').trim().replace(/^\?/, '')
const sasOf = (s) => acc(s)?.sas.find((x) => x.token === clean(app(s, NAME)?.secrets['share.sas']))
// a new SAS for the share only, signed with the new key1, able to write, valid for at least a week, kept protected
const sasOk = (s) => {
  const a = app(s, NAME)
  const x = sasOf(s)
  return (
    a?.status === 'Running' && !a.props['share.sas'] && Boolean(x) && sasState(s, ACCOUNT, x) === 'Active' && x.key === 'key1' && x.services.includes('f') && x.box === SHARE &&
    x.perms.includes('w') && x.perms.includes('c') && !x.perms.includes('d') && x.expires >= s.clock + 7 * DAY
  )
}

const MAIL_STORAGE = {
  t: at(1, 7, 35),
  to: OPS,
  subject: 'brightmartstore: quarterly hardening done',
  body: [
    'Hello team,',
    'at 07:30 we made two changes to the storage account brightmartstore, as planned in the security review:',
    `1. We rotated key1. key2 follows on Thursday 5 November, so both keys are new by the end of the week.`,
    `2. Public network access is now "Enabled from selected virtual networks and IP addresses". The rule allows the office and warehouse range ${OFFICE}.`,
    'Tell us if an app needs another address on the list. Storage team',
  ].join('\n\n'),
  source: 'Storage team',
}
const MAIL_WAREHOUSE = {
  t: at(1, 8, 40),
  to: OPS,
  subject: 'Handhelds show old stock',
  body: `The scanners in DUB-1 show the stock of about 07:15. The file ${SNAPSHOT} on the stock share has not changed since then. Pickers are sent to empty bins. Warehouse DUB-1`,
  source: 'Warehouse DUB-1',
}

const lab = {
  id: 'p-files-azure-share',
  group: 'Files, SFTP and batch',
  title: 'The file share answers 403 after a hardening change',
  minutes: 18,
  scenario: `It is 09:00 on Tuesday. ${NAME} writes a stock snapshot every 15 minutes to the Azure File Share ${SHARE} in the storage account ${ACCOUNT}. The warehouse servers mount the share over SMB and the handheld scanners read ${SNAPSHOT} from it. The app runs in the private space brightmart-ps, whose static outbound address is ${DEFAULT_EGRESS}. It uses the File REST API with a SAS token in the protected property share.sas. The application is Running, yet the warehouse sees stock from 07:15. The Inbox has two mails.`,
  start() {
    const store = newStorage(ACCOUNT, { shares: { [SHARE]: newShare({ [`out/${SNAPSHOT}`]: fileRec('sku,warehouse,available\n', { t: at(1, 5) }) }, { dirs: ['', 'in', 'out'] }) } })
    let s = newPlatform({ clock: at(1, 6), systems: systemsOf({ storage: [store] }), mail: [MAIL_STORAGE, MAIL_WAREHOUSE] })
    // the SAS the app has used since October: the share only, create and write, signed with key1
    const made = createSas(s, ACCOUNT, { name: `${NAME} app`, services: 'f', box: SHARE, perms: 'cw', expires: at(60), key: 'key1' })
    s = made.state
    s.apps.push(newApp(NAME, { target: 'brightmart-ps', props: { 'share.account': ACCOUNT, 'share.name': SHARE, 'share.dir': 'out' }, secrets: { 'share.sas': made.token }, store: {} }))
    s = until(s, CHANGE)
    s = setNetwork(regenerateKey(s, ACCOUNT, 'key1'), 'storage', ACCOUNT, { mode: 'Selected networks', ips: [OFFICE] })
    // the activity log names the storage team, not the learner
    for (const l of s.systems.storage[ACCOUNT].log) if (l.t === CHANGE && l.who === 'you') l.who = 'storage-admin@brightmart.lab'
    s.systems.storage[ACCOUNT].log.push({ t: CHANGE, who: 'storage-admin@brightmart.lab', op: 'Update Storage Account', path: '', ok: true, text: `Public network access: Selected networks, ${OFFICE}` })
    return until(s, at(1, 9))
  },
  steps: [
    sawLogs(NAME),
    ask(
      'Read the answer of Azure',
      'Since 07:30 each run fails with 403 and the code AuthorizationFailure. What does that code point to?',
      [
        'The SAS token expired',
        'The SAS has no write permission',
        'A network rule of the storage account refuses the address the request comes from, before the signature is checked',
        'The file share is full',
      ],
      2,
      'AuthorizationFailure with a message about network rules comes from the storage firewall. An expired or wrongly signed SAS gives AuthenticationFailed, a SAS without the right letter gives AuthorizationPermissionMismatch, and a full share gives a quota error. The storage team turned on Selected networks with the office range only, and the app calls from another address.',
    ),
    {
      title: 'Let the app through the firewall',
      how: `Azure Files, ${ACCOUNT}, Networking. Keep "Enabled from selected virtual networks and IP addresses" and keep ${OFFICE}. Add the static outbound address of the private space, ${DEFAULT_EGRESS}, and Save. Do not switch to All networks, and do not add a wide range such as 0.0.0.0/0. One address is enough.`,
      done: networkOk,
    },
    ask(
      'Two keys, one rotation',
      'The next run gets past the firewall and fails with 403 AuthenticationFailed, Signature did not match. key1 was rotated at 07:30 and key2 is rotated on Thursday. What happened, and which key signs the new SAS?',
      [
        'The SAS expired at 07:30. Sign the new one with key2',
        'A SAS is signed with an account key, and rotating that key breaks every SAS it signed. Sign the new one with the new key1, because key2 is rotated on Thursday and would break it again',
        'Rotation only changes the connection string. Restart the app',
        'Sign it with key2, because key2 is always the backup key',
      ],
      1,
      'Azure keeps no list of SAS tokens. It checks the signature against the current account keys, so a new key1 makes every SAS signed with the old key1 fail with Signature did not match. Two keys exist so that one rotation never stops everything: move apps to the key that is not rotated next, rotate the other, and repeat. Here key2 goes on Thursday, so sign with the new key1.',
    ),
    {
      title: 'Give the app a new SAS',
      how: `Azure Files, ${ACCOUNT}, Shared access signature. Scope: File share ${SHARE}. Permissions Create and Write only. Expiry 30 days. Signing key key1. Generate, copy the token, then Runtime Manager, ${NAME}, Settings, Properties: replace the value of the protected property share.sas and Apply Changes.`,
      done: sasOk,
    },
    {
      title: 'See a new snapshot on the share',
      how: `Schedules, ${FLOW}, Run, or move the clock 15 minutes. The log shows ${SNAPSHOT} written, and Azure Files, ${ACCOUNT}, File shares, ${SHARE}, out shows a new modified time.`,
      done: (s) => networkOk(s) && sasOk(s) && Boolean(last(s)?.ok) && last(s).t > at(1, 9) && (acc(s)?.shares[SHARE]?.files[`out/${SNAPSHOT}`]?.t ?? 0) > at(1, 9),
    },
    ask(
      'SAS, account key or identity',
      `Why does ${NAME} use a SAS for one share, and not an account key or a managed identity?`,
      [
        'An account key is safer because it never expires',
        'A managed identity works the same from CloudHub as from an Azure VM',
        'The account key gives full control of every container, share and setting of the account. A service SAS limits the app to one share and two permissions for a set time. A managed identity exists only for resources that run in Azure, so CloudHub would need an app registration with its own secret or certificate',
        'A SAS is needed because Azure Files accepts nothing else',
      ],
      2,
      'Give the app the least it needs. A leaked account key opens the whole account until someone rotates it. A SAS scoped to the share, with create and write, limits the damage and expires on its own. Microsoft recommends Microsoft Entra ID where the service supports it. For an app outside Azure that means an app registration with OAuth client credentials and an Azure role, which brings its own secret or certificate to rotate.',
    ),
    ask(
      'Blob or file share',
      'A colleague asks why this data is on a file share and not in a blob container. Which answer fits?',
      [
        'They are the same service with two names',
        'A file share is a folder tree that servers mount over SMB, so the warehouse servers read it as a drive. A blob container is object storage over HTTPS for apps, exports and archives. Mule reaches a share through the File REST API and a container through the Azure Blob Storage connector or the HTTP connector. CloudHub cannot mount SMB',
        'Blobs cannot hold CSV files',
        'A file share is cheaper for every use',
      ],
      1,
      'Pick by the reader. Servers and desktop tools that expect a mapped drive need Azure Files over SMB on port 445. Apps, analytics and archives use Blob Storage, with access tiers and lifecycle rules. A file on a share can be seen while it is still written, and a block blob only once its blocks are committed. A Mule app on CloudHub has no mounted drives, so it uses REST for both. A Mule runtime on your own server can use the File connector on a mounted share.',
    ),
  ],
  why: 'Two changes of one hardening ticket stopped a Running app. The storage firewall answered first with 403 AuthorizationFailure, because the static outbound address of the private space was not on the list. Behind it, the rotation of key1 had made the SAS signed with key1 invalid, which shows as 403 AuthenticationFailed, Signature did not match. Add the egress address to the network rules, keep the firewall on, and sign a new narrow SAS with the key that is not rotated next. Two keys let you rotate one while apps use the other. The lab simplifies the SAS check.',
  docs: 'https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage',
  solve(start) {
    let s = mark(start, `logs:${NAME}`)
    s = setNetwork(s, 'storage', ACCOUNT, { mode: 'Selected networks', ips: [OFFICE, DEFAULT_EGRESS] })
    const made = createSas(s, ACCOUNT, { services: 'f', box: SHARE, perms: 'cw', expires: s.clock + 30 * DAY, key: 'key1' })
    s = change(made.state, NAME, { secrets: { ...app(made.state, NAME).secrets, 'share.sas': made.token } })
    s = runNow(s, NAME, FLOW)
    return until(s, s.clock + 60000)
  },
  answers: { 1: 2, 3: 1, 6: 2, 7: 1 },
}

export const LABS = [lab]
