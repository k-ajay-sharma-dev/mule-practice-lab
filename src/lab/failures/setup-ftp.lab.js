// The guided lab setup-ftp. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, deployApp, finishDeploys, mark, MINUTE, newPlatform } from '../platform.js'
import { app, ask, sawLogs, until } from '../platform-kit.js'
import { addServerUser, fileRec, newServerSys, setServerSettings, systemsOf, transfer } from '../platform-systems.js'
import { HOST, NAME } from './setup-ftp.pkg.js'

const USER = 'mule_pos_export'
const HOME = '/export'
const OUTBOX = '/export/outbox'
const DONE = '/export/done'
const ERROR = '/export/error'
const ALERT_TO = 'store-systems@harbor.example'
const GOOD = 'pos-sales-test-0001.zip'
const BAD = 'pos-sales-test-0002.zip'
const PASSWORD = 'lab-practice-ftp-1' // the practice password of the solution; the learner picks any

const server = (s) => s.systems?.servers?.[HOST]
const user = (s) => server(s)?.users?.[USER]
const a = (s) => app(s, NAME)
const store = (s) => a(s)?.store ?? {}
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((d) => list.includes(d))

const userOk = (s) => Boolean(user(s)) && user(s).home === HOME && Boolean(String(user(s).password ?? '')) && !user(s).locked
// least privilege: the three folders of the export, nothing of the rest of the server
const rightsOk = (s) => {
  const u = user(s)
  if (!userOk(s) || u.readOnly) return false
  const reads = !u.readDirs || (u.readDirs.includes(OUTBOX) && u.readDirs.every((d) => [OUTBOX, DONE, ERROR].includes(d)))
  return sameSet(u.writeDirs, [OUTBOX, DONE, ERROR]) && reads
}
const passiveOk = (s) => server(s)?.passive?.open === true
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const deployedOk = (s) => {
  const x = a(s)
  return (
    x?.status === 'Running' && rightsOk(s) && passiveOk(s) &&
    prop(s, 'ftp.host') === HOST && prop(s, 'ftp.port') === '21' && prop(s, 'ftp.user') === USER && prop(s, 'ftp.passive').toLowerCase() === 'true' && prop(s, 'ftp.transferMode').toUpperCase() === 'BINARY' &&
    prop(s, 'ftp.inDir') === OUTBOX && prop(s, 'ftp.doneDir') === DONE && prop(s, 'ftp.errorDir') === ERROR &&
    x.secrets['ftp.password'] === user(s).password && !x.props['ftp.password']
  )
}
const connected = (s) => deployedOk(s) && server(s).log.some((l) => l.who === NAME && l.op === 'LIST' && l.ok)
const loaded = (s) => deployedOk(s) && Boolean(server(s).files[`${DONE}/${GOOD}`]) && !server(s).files[`${DONE}/${GOOD}`].corrupt && (store(s).loaded ?? []).some((x) => x.name === GOOD && x.size === 18432)
const rejected = (s) => deployedOk(s) && Boolean(server(s).files[`${ERROR}/${BAD}`]?.corrupt) && (store(s).rejected ?? []).some((x) => x.name === BAD)
const alerted = (s) => s.monAlerts.some((x) => x.enabled && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO))

const MAIL = {
  t: at(1, 8, 20),
  to: 'ops@harbor.example',
  subject: 'POS sales exports into the new sales system',
  body: [
    'Hello integration team,',
    `the tills of our 40 stores send their sales to the old POS server ${HOST}, which writes one zip per store and night to ${OUTBOX}. It speaks plain FTP on port 21. Finance wants the receipts in the new sales system from tonight, and the app ${NAME} is built for it.`,
    'Please set it up:',
    `1. A user of its own, ${USER}, with the home folder ${HOME}. It needs ${OUTBOX}, ${DONE} and ${ERROR} and nothing else. The server also holds the till backups.`,
    `2. The server is behind a firewall. Its passive ports 50000 to 50100 are not open yet, so data connections time out.`,
    `3. Done zips go to ${DONE}, a zip that does not open goes to ${ERROR}. Poll every 5 minutes.`,
    `4. Test with the two sample zips on your computer before tonight, and send failures to ${ALERT_TO}.`,
    'Store systems',
  ].join('\n\n'),
  source: 'Store systems',
}

function systems() {
  const x = newServerSys(HOST, {
    protocol: 'FTP', ip: '10.20.5.40', passive: { from: 50000, to: 50100, open: false },
    users: { legacy_pos: { password: 'lab-pos-till', home: HOME, readDirs: [OUTBOX], writeDirs: [OUTBOX] } },
    dirs: ['/', HOME, OUTBOX, DONE, ERROR, '/backup', '/backup/tills'],
    files: { '/backup/tills/till-014-20261102.bak': fileRec('', { size: 902144, t: at(1, 2), owner: 'legacy_pos', binary: true }) },
  })
  const local = { home: 'C:\\Users\\you\\harbor', files: { [GOOD]: fileRec('', { size: 18432, t: at(1, 8), binary: true }), [BAD]: fileRec('', { size: 20480, t: at(1, 8), binary: true }) } }
  return systemsOf({ servers: [x], local })
}

const lab = {
  id: 'p-setup-ftp',
  group: 'Files, SFTP and batch',
  title: 'Set up the FTP integration for the legacy POS export',
  minutes: 25,
  scenario: `It is 09:00 on Tuesday. Finance wants the receipts of the stores in the new sales system, and they come only from an old POS server that speaks FTP. The app ${NAME} is built and its jar is ready. Nothing else is: no user, the passive ports are closed, no properties. Done means a test zip arrives in the done folder, a damaged zip lands in the error folder, and failures raise an alert. The Inbox has the request.`,
  start() {
    const s = newPlatform({ clock: at(1, 8), jars: [NAME], systems: systems(), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of store systems. Note the user, the folders, the ports and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the FTP user',
      how: `SFTP and FTP from the console menu, pick ${HOST}, Server tab, Add user. User name ${USER}, Home folder ${HOME}, and a password. Save.`,
      done: userOk,
    },
    ask(
      'Least privilege on the FTP server',
      `Which rights does ${USER} get?`,
      [
        'Read and write on /, so the app can find the files wherever the POS puts them',
        'The login of legacy_pos, so there is one user less',
        `Home ${HOME}, and write on ${OUTBOX}, ${DONE} and ${ERROR} only. A move is a write on both folders, and the till backups stay out of reach`,
        'Read only everywhere',
      ],
      2,
      'An app user gets the folders its flow touches and nothing else. The listener moves files out of the outbox into done or error, so it writes on all three. A shared login hides who did what in the server log and breaks both when one password changes. FTP sends the password in clear text, which is one more reason to keep its rights small.',
    ),
    {
      title: 'Set the folder rights',
      how: `Server tab, ${USER}, Edit. Under Write pick Only the folders ticked and tick ${OUTBOX}, ${DONE} and ${ERROR}. Leave Read only everywhere off. Save.`,
      done: rightsOk,
    },
    {
      title: 'Open the passive ports',
      how: 'Server tab, Data connections. Keep passive ports from 50000 to 50100 and tick The firewall of the server lets these ports in. Save.',
      done: passiveOk,
    },
    {
      ...sawLogs(NAME),
      title: 'Deploy the app with its properties',
      how: `Runtime Manager, Deploy application. Name ${NAME}, file ${NAME}-1.0.0-mule-application.jar. Properties: ftp.host ${HOST}, ftp.port 21, ftp.user ${USER}, ftp.passive true, ftp.transferMode BINARY, ftp.inDir ${OUTBOX}, ftp.doneDir ${DONE}, ftp.errorDir ${ERROR}. Add ftp.password with the password of the user and select Protect. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'See the app connect',
      how: `Move the clock 5 minutes. SFTP and FTP, Server tab: the Server log shows ${USER} listing ${OUTBOX} for ${NAME}. The log of the app says No new POS exports.`,
      done: connected,
    },
    {
      title: 'Drop a test zip in binary mode',
      how: `In the client, Quickconnect to ${HOST} as ${USER} with its password. Site Manager: Transfer type Binary. Open ${OUTBOX}, pick ${GOOD} on the local site and Upload. Move the clock 5 minutes. The log shows the receipts extracted and the zip is in ${DONE} with the same size, 18 KB.`,
      done: loaded,
    },
    {
      title: 'Send a damaged zip',
      how: `Site Manager: Transfer type ASCII. Upload ${BAD} to ${OUTBOX}. ASCII mode changes the line ending bytes, so the zip no longer opens. Move the clock 5 minutes. The log warns COMPRESSION:INVALID_ARCHIVE and the zip is in ${ERROR}, not lost. Set the transfer type back to Binary.`,
      done: rejected,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail.`,
      done: alerted,
    },
    ask(
      'Passive and binary',
      `Why does ${NAME} use passive="true" and transferMode="BINARY"?`,
      [
        'They make the transfer faster',
        'In active mode the server opens the data connection back to the client, and it cannot reach an app on CloudHub behind NAT, so the transfer times out. Passive lets the app open both connections, through the passive ports the firewall allows. BINARY copies every byte, and ASCII would change the line ending bytes inside a zip and break it',
        'Passive mode encrypts the password',
        'ASCII mode is needed for zips that hold text files',
      ],
      1,
      'FTP has a control connection on port 21 and a data connection for each list and transfer. Passive is the default of the FTP connector and the one that works from the cloud, and the server firewall must allow its passive range. BINARY is the default transfer mode and the right one for zips, PDFs and spreadsheets. Neither fixes the clear text login of FTP: FTPS or SFTP does.',
    ),
  ],
  why: 'An FTP setup in short: a user of its own with a home folder and write only on the folders the flow moves files through, the passive port range open on the server firewall, and a connection with passive="true" and transferMode="BINARY". Keep the password protected, deploy, and check the server log for the login and the listing. Test with a real file in binary mode, see a damaged file go to the error folder, and alert the team that owns the feed. Plan a move to SFTP or FTPS, because FTP sends the password in clear text.',
  docs: 'https://docs.mulesoft.com/ftp-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = addServerUser(s, HOST, USER, { home: HOME, password: PASSWORD, writeDirs: [OUTBOX, DONE, ERROR] })
    s = setServerSettings(s, HOST, { passive: { from: 50000, to: 50100, open: true } })
    const props = { 'ftp.host': HOST, 'ftp.port': '21', 'ftp.user': USER, 'ftp.passive': 'true', 'ftp.transferMode': 'BINARY', 'ftp.inDir': OUTBOX, 'ftp.doneDir': DONE, 'ftp.errorDir': ERROR }
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props, secrets: { 'ftp.password': PASSWORD } }).state)
    s = advance(mark(s, `logs:${NAME}`), 6 * MINUTE)
    const auth = { user: USER, password: PASSWORD, port: 21, passive: true }
    s = transfer(s, { direction: 'upload', host: HOST, auth: { ...auth, transferMode: 'BINARY' }, local: GOOD, remote: `${OUTBOX}/${GOOD}` }).state
    s = advance(s, 6 * MINUTE)
    s = transfer(s, { direction: 'upload', host: HOST, auth: { ...auth, transferMode: 'ASCII' }, local: BAD, remote: `${OUTBOX}/${BAD}` }).state
    s = advance(s, 6 * MINUTE)
    return addMonAlert(s, { title: 'POS export intake failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 2, 10: 1 },
}

export const LABS = [lab]
