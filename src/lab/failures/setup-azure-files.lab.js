// The guided lab setup-azure-files. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, deployApp, finishDeploys, mark, MINUTE, newPlatform, runNow } from '../platform.js'
import { app, ask, sawLogs, until } from '../platform-kit.js'
import { addShare, createSas, fileRec, makeDir, newShare, newStorage, putFile, sasState, systemsOf } from '../platform-systems.js'
import { NAME, PICKS, SCAN_HEADER } from './setup-azure-files.pkg.js'

const ACCOUNT = 'brightmartwarehouse'
const SHARE = 'scanner-files'
const QUOTA = 50
const DIRS = ['picks', 'scans', 'errors']
const ALERT_TO = 'warehouse-it@brightmart.example'
const GOOD = 'scan-dub1-0001.csv'
const BAD = 'scan-dub1-0002.csv'
const GOOD_CSV = `${SCAN_HEADER}\nA-01-03,H-100,4\nA-02-11,H-200,1\nC-07-02,H-300,12\n`
const BAD_CSV = `${SCAN_HEADER}\nA-01-03,H-100,4\nA-02-11,H-200,two\n`
const DAY = 24 * 60 * 60000

const acc = (s) => s.systems?.storage?.[ACCOUNT]
const sh = (s) => acc(s)?.shares?.[SHARE]
const a = (s) => app(s, NAME)
const store = (s) => a(s)?.store ?? {}
const clean = (v) => String(v ?? '').trim().replace(/^\?/, '')

const shareOk = (s) => sh(s)?.quota === QUOTA
const dirsOk = (s) => shareOk(s) && DIRS.every((d) => sh(s).dirs.includes(d))
// read, list, create and write on this one share; no delete, so the app cannot remove what the scanners wrote
const goodSas = (s, x) => Boolean(x) && x.box === SHARE && x.services === 'f' && x.perms === 'rcwl' && sasState(s, ACCOUNT, x) === 'Active' && x.expires - x.created >= 7 * DAY
const sasOk = (s) => dirsOk(s) && (acc(s)?.sas ?? []).some((x) => goodSas(s, x))
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim().replace(/^\/+|\/+$/g, '')
const deployedOk = (s) => {
  const x = a(s)
  return (
    x?.status === 'Running' && dirsOk(s) && prop(s, 'share.account') === ACCOUNT && prop(s, 'share.name') === SHARE && prop(s, 'share.picksDir') === 'picks' && prop(s, 'share.scansDir') === 'scans' && prop(s, 'share.errorDir') === 'errors' &&
    !x.props['share.sas'] && goodSas(s, acc(s).sas.find((y) => y.token === clean(x.secrets['share.sas'])))
  )
}
const wrote = (s) => deployedOk(s) && Object.entries(sh(s).files).some(([p, f]) => p.startsWith('picks/') && f.owner === NAME) && acc(s).log.some((l) => l.who === NAME && l.op === 'Create File, Put Range' && l.ok)
const read = (s) => deployedOk(s) && (store(s).scans ?? []).some((x) => x.name === GOOD && x.lines === 3)
const rejected = (s) => deployedOk(s) && Boolean(sh(s).files[`errors/${BAD}`]) && (store(s).rejected ?? []).some((x) => x.name === BAD) && !(store(s).scans ?? []).some((x) => x.name === BAD)
const alerted = (s) => s.monAlerts.some((x) => x.enabled && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO))

const MAIL = {
  t: at(1, 8, 25),
  to: 'ops@brightmart.example',
  subject: 'File share for the new DUB-1 scanners',
  body: [
    'Hello integration team,',
    `the new handheld scanners in DUB-1 work on files: they read their pick lists from a share and write a scan file per counted aisle. The warehouse servers mount the share over SMB. The app ${NAME} is built and talks to the share over REST. Please set it up in the storage account ${ACCOUNT}:`,
    `1. A file share ${SHARE} with a quota of ${QUOTA} GiB, so a stuck scanner cannot fill the account.`,
    `2. The directories ${DIRS.join(', ')}. The app writes pick lists to picks, the scanners write to scans, and a scan file that does not parse goes to errors.`,
    '3. A SAS for this share only, valid 30 days. The app must not delete anything the scanners wrote.',
    `4. Test it with the two sample scan files on your computer, and send failures to ${ALERT_TO}.`,
    'Warehouse IT',
  ].join('\n\n'),
  source: 'Warehouse IT',
}

const lab = {
  id: 'p-setup-azure-files',
  group: 'Files, SFTP and batch',
  title: 'Set up the Azure file share for the warehouse scanners',
  minutes: 25,
  scenario: `It is 09:00 on Tuesday. Warehouse IT rolls out new handheld scanners in DUB-1 that read and write files on an Azure file share. The app ${NAME} is built and its jar is ready. The storage account ${ACCOUNT} exists, but the share, its directories and the SAS do not. Done means the app writes a pick list, reads a scan file, keeps a bad scan file in errors, and failures raise an alert. The Inbox has the request.`,
  start() {
    const store = newStorage(ACCOUNT, { shares: { 'label-printers': newShare({ 'out/labels-0901.zpl': fileRec('^XA^FDH-100^FS^XZ', { t: at(1, 7) }) }, { dirs: ['', 'out'], quota: 10 }) } })
    const local = { home: 'C:\\Users\\you\\brightmart', files: { [GOOD]: fileRec(GOOD_CSV, { t: at(1, 8) }), [BAD]: fileRec(BAD_CSV, { t: at(1, 8) }) } }
    const s = newPlatform({ clock: at(1, 8), jars: [NAME], systems: systemsOf({ storage: [store], local }), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of warehouse IT. Note the share, the quota, the directories and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the file share',
      how: `Azure Files from the console menu, ${ACCOUNT}, File shares, + File share. Name ${SHARE}, Quota (GiB) ${QUOTA}. Create.`,
      done: shareOk,
    },
    {
      title: 'Create the directories',
      how: `Open ${SHARE}, Add directory, and make ${DIRS.join(', ')} at the top of the share.`,
      done: dirsOk,
    },
    ask(
      'The narrowest SAS for the share',
      'Which permissions does the SAS of the app need?',
      [
        'All of them, so a new flow never needs a new token',
        'Read and List for the scans, Create and Write for the pick lists and the error copies, on this share only. No Delete, so a bug or a leaked token cannot remove what the scanners wrote',
        'Read only, because the app mostly reads',
        'The account key, because a share needs more than a SAS',
      ],
      1,
      'List finds new scan files, Read gets them, Create and Write make the pick lists and the copies in errors. Without Delete the app cannot move a scan file, so it remembers the names it has handled, the way a watermark or an object store does in a real flow. Scope the token to the share so the other shares of the account stay out of reach.',
    ),
    {
      title: 'Generate the SAS',
      how: `${ACCOUNT}, Shared access signature. Scope: File share ${SHARE}. Permissions Read, Write, List and Create. Expiry after 30 days, signing key key1. Generate SAS and connection string, and copy the SAS token.`,
      done: sasOk,
    },
    {
      ...sawLogs(NAME),
      title: 'Deploy the app with its properties',
      how: `Runtime Manager, Deploy application. Name ${NAME}, file ${NAME}-1.0.0-mule-application.jar. Properties: share.account ${ACCOUNT}, share.name ${SHARE}, share.picksDir picks, share.scansDir scans, share.errorDir errors. Add share.sas with the SAS token and select Protect. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'See the app write a pick list',
      how: `Runtime Manager, ${NAME}, Schedules, ${PICKS}, Run. Azure Files, ${ACCOUNT}, File shares, ${SHARE}, picks: the pick list is there, and the Activity log shows Create File by ${NAME}.`,
      done: wrote,
    },
    {
      title: 'Drop a scan file',
      how: `In ${SHARE}, open scans, Upload, Browse for files ${GOOD}. Upload. Move the clock a minute. The log of the app shows 3 bin counts booked from ${GOOD}.`,
      done: read,
    },
    {
      title: 'Drop a bad scan file',
      how: `Upload ${BAD} to scans the same way and move the clock a minute. The log warns that line 3 has no whole number, and errors holds a copy of the file. It is not booked and not lost.`,
      done: rejected,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail.`,
      done: alerted,
    },
    ask(
      'Mount or REST',
      `The warehouse servers mount ${SHARE} as a drive. Why does ${NAME} use the File REST API instead?`,
      [
        'REST is always faster than SMB',
        'A CloudHub app has no mounted drives and SMB on port 445 is not open from the cloud, so it calls the File REST API over HTTPS with a SAS. A Mule runtime on an own server could mount the share and use the File connector',
        'SMB cannot read CSV files',
        'Because the quota applies only to SMB',
      ],
      1,
      'Azure Files serves the same files over SMB and REST. Servers in the warehouse map it as a drive, cloud apps use HTTPS. A file on a share is visible while it is still written, so the app lists with a size check, and a slow upload is skipped until it is done.',
    ),
  ],
  why: 'An Azure Files setup in short: a share with a quota, the directories each side writes to, and a SAS for that share with only the letters the flows need and an expiry. Keep the SAS protected and the names in the properties matching. Deploy, run the writing flow and see the file and the Activity log entry, drop a real file for the reading flow, see a bad file kept in errors, and alert the team that owns the scanners.',
  docs: 'https://learn.microsoft.com/en-us/azure/storage/files/storage-files-introduction',
  solve(start) {
    let s = mark(start, 'inbox')
    s = addShare(s, ACCOUNT, SHARE, QUOTA)
    for (const d of DIRS) s = makeDir(s, `share:${ACCOUNT}/${SHARE}`, d)
    const made = createSas(s, ACCOUNT, { services: 'f', box: SHARE, perms: 'rwlc', expires: s.clock + 30 * DAY, key: 'key1' })
    const props = { 'share.account': ACCOUNT, 'share.name': SHARE, 'share.picksDir': 'picks', 'share.scansDir': 'scans', 'share.errorDir': 'errors' }
    s = finishDeploys(deployApp(made.state, { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props, secrets: { 'share.sas': `?${made.token}` } }).state)
    s = runNow(mark(s, `logs:${NAME}`), NAME, PICKS)
    s = advance(putFile(s, `share:${ACCOUNT}/${SHARE}`, `scans/${GOOD}`, GOOD_CSV), 2 * MINUTE)
    s = advance(putFile(s, `share:${ACCOUNT}/${SHARE}`, `scans/${BAD}`, BAD_CSV), 2 * MINUTE)
    return addMonAlert(s, { title: 'Scanner share sync failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 3: 1, 10: 1 },
}

export const LABS = [lab]
