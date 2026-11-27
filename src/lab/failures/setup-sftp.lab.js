// The guided lab setup-sftp. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, deployApp, finishDeploys, mark, MINUTE, newPlatform } from '../platform.js'
import { app, ask, sawLogs, until } from '../platform-kit.js'
import { addServerUser, fileRec, knownHostsLine, knownKeys, newServerSys, newUserKey, setServerUser, systemsOf, transfer } from '../platform-systems.js'
import { FLOW, HEADER, HOST, NAME } from './setup-sftp.pkg.js'

const USER = 'mule_brightline'
const PARTNER = 'brightline_upload'
const HOME = '/partners/brightline'
const IN = `${HOME}/in`
const ARCHIVE = `${HOME}/archive`
const ERROR = `${HOME}/error`
const ALERT_TO = 'supply-integration@brightmart.example'
const GOOD = 'stock-brightline-20261103.csv'
const BAD = 'stock-brightline-bad.csv'
const GOOD_CSV = `${HEADER}\nBL-1001,DUB-1,240\nBL-1002,DUB-1,0\nBL-1003,ROT-2,75\nBL-1004,ROT-2,310\n`
const BAD_CSV = `${HEADER}\nBL-1001,DUB-1,240\nBL-1002,DUB-1,many\n`

const server = (s) => s.systems?.servers?.[HOST]
const user = (s) => server(s)?.users?.[USER]
const a = (s) => app(s, NAME)
const running = (s) => a(s)?.status === 'Running'
const store = (s) => a(s)?.store ?? {}
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((d) => list.includes(d))

// the user the app logs in as: its own home folder, a key and no password
const userOk = (s) => Boolean(user(s)) && user(s).home === HOME && user(s).password === undefined
const keyOk = (s) => userOk(s) && Boolean(user(s).key) && user(s).key !== 'brightline-upload.pem' && Boolean(s.systems.local.files[user(s).key])
// least privilege: write on in, archive and error only (a move needs write on both ends), read nothing outside them
const rightsOk = (s) => {
  const u = user(s)
  if (!keyOk(s) || u.readOnly || u.locked) return false
  const reads = !u.readDirs || (u.readDirs.includes(IN) && u.readDirs.every((d) => [IN, ARCHIVE, ERROR].includes(d)))
  return sameSet(u.writeDirs, [IN, ARCHIVE, ERROR]) && reads
}
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const deployedOk = (s) => {
  const x = a(s)
  if (!running(s) || !rightsOk(s)) return false
  const wait = Number(prop(s, 'sftp.timeBetweenSizeCheck'))
  return (
    prop(s, 'sftp.host') === HOST && prop(s, 'sftp.port') === '22' && prop(s, 'sftp.user') === USER && prop(s, 'sftp.inDir') === IN && prop(s, 'sftp.moveToDirectory') === ARCHIVE && prop(s, 'sftp.errorDir') === ERROR &&
    wait >= 2 && wait <= 60 && knownKeys(x.props['sftp.knownHosts'], HOST, 22).includes(server(s).hostKey.pub) &&
    x.secrets['sftp.identityFile'] === user(s).key && !x.props['sftp.identityFile'] && !x.props['sftp.password'] && !x.secrets['sftp.password']
  )
}
const connected = (s) => deployedOk(s) && Boolean(s.seen[`sftp:${HOST}`]) && server(s).log.some((l) => l.who === NAME && l.op === 'opendir' && l.ok)
const loaded = (s) => deployedOk(s) && Boolean(server(s).files[`${ARCHIVE}/${GOOD}`]) && !server(s).files[`${IN}/${GOOD}`] && (store(s).loaded ?? []).some((x) => x.name === GOOD && x.rows === 4)
const rejected = (s) => deployedOk(s) && Boolean(server(s).files[`${ERROR}/${BAD}`]) && !server(s).files[`${IN}/${BAD}`] && (store(s).rejected ?? []).some((x) => x.name === BAD)
const alerted = (s) => s.monAlerts.some((x) => x.enabled && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO))

const MAIL = {
  t: at(1, 8, 40),
  to: 'ops@brightmart.example',
  subject: 'Brightline Supply goes live: stock files over SFTP',
  body: [
    'Hello integration team,',
    `Brightline Supply is our new supplier for cleaning goods. From today it uploads a stock file to our SFTP server ${HOST} whenever its stock changes. Its user ${PARTNER} is set up and its first test file is already in ${IN}.`,
    `Please set up the Mule side. The app ${NAME} is built and waits in Runtime Manager. It needs:`,
    `1. Its own user ${USER} with the home folder ${HOME}. Key login only, no password.`,
    `2. Rights on ${IN} to pick up and move files, and on ${ARCHIVE} and ${ERROR}. Nothing else.`,
    '3. The host key of the server pinned in the app.',
    `4. Picked up files go to ${ARCHIVE}. A file that does not parse goes to ${ERROR}, so Brightline can see it. Their files are up to 30 MB and their link is slow, so wait 5 seconds between the two size checks.`,
    `5. Failures alert ${ALERT_TO}.`,
    'Supply planning',
  ].join('\n\n'),
  source: 'Supply planning',
}

function systems() {
  const x = newServerSys(HOST, {
    ip: '10.20.5.21',
    users: {
      [PARTNER]: { key: 'brightline-upload.pem', home: HOME, readDirs: [IN], writeDirs: [IN] },
      partner_brightmart: { key: 'brightmart-partner.pem', home: '/partners/brightmart-north' },
    },
    dirs: ['/', '/partners', HOME, IN, ARCHIVE, ERROR, '/partners/brightmart-north', '/partners/brightmart-north/in'],
    files: {
      [`${IN}/${GOOD}`]: fileRec(GOOD_CSV, { t: at(1, 8, 30), owner: PARTNER }),
      '/partners/brightmart-north/in/orders-1103.json': fileRec('[{"orderId":"A-79","qty":1}]', { t: at(1, 7), owner: 'partner_brightmart' }),
    },
  })
  return systemsOf({ servers: [x], local: { home: 'C:\\Users\\you\\brightmart', files: { [BAD]: fileRec(BAD_CSV, { t: at(1, 8, 45) }) } } })
}

const lab = {
  id: 'p-setup-sftp',
  group: 'Files, SFTP and batch',
  title: 'Set up the SFTP integration for supplier stock files',
  minutes: 30,
  scenario: `It is 09:00 on Tuesday. Supply planning signed a new supplier, Brightline Supply, which sends its stock as CSV files over SFTP. The app ${NAME} is built and its jar is ready, but nothing is configured for it: no user on ${HOST}, no key, no properties. Done means the first file of Brightline is loaded and archived, a bad file lands in the error folder, and failures raise an alert. The Inbox has the request.`,
  start() {
    const s = newPlatform({ clock: at(1, 8), jars: [NAME], systems: systems(), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of supply planning. Note the user name, the folders, the size check and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the user of the app',
      how: `SFTP and FTP from the console menu, Server tab, Add user. User name ${USER}, Home folder ${HOME}, Password empty. Save.`,
      done: userOk,
    },
    {
      title: 'Give the user a key pair',
      how: `Server tab, ${USER}, Edit, Make a new key pair, Save. The private key file lands on the local site of the client and the server keeps the public part. The app logs in with that file.`,
      done: keyOk,
    },
    ask(
      'Least privilege on the server',
      `Which rights does ${USER} need?`,
      [
        'Read and write everywhere on the server, so later partners work too',
        `Write on ${IN}, ${ARCHIVE} and ${ERROR}, inside its own home folder. A move needs write on the folder it leaves and the folder it enters, and nothing outside ${HOME} is needed`,
        `Read only on ${IN}, because the app only reads`,
        'The same user as Brightline, so both see the same files',
      ],
      1,
      `The listener reads a file and moves it, and a move is a write on both folders. Read only would fail at the move with SFTP:ACCESS_DENIED. The home folder keeps the user away from the folders of other partners, and a user of its own means a leaked key of Brightline cannot act as Brightmart, and the other way round.`,
    ),
    {
      title: 'Set the folder rights',
      how: `Server tab, ${USER}, Edit. Under Write pick Only the folders ticked and tick ${IN}, ${ARCHIVE} and ${ERROR}. Read can stay Everywhere in the home folder, or tick the same folders. Do not tick Read only everywhere. Save.`,
      done: rightsOk,
    },
    {
      ...sawLogs(NAME),
      title: 'Deploy the app with its properties',
      how: `Runtime Manager, Deploy application. Name ${NAME}, file ${NAME}-1.0.0-mule-application.jar. Properties: sftp.host ${HOST}, sftp.port 22, sftp.user ${USER}, sftp.inDir ${IN}, sftp.moveToDirectory ${ARCHIVE}, sftp.errorDir ${ERROR}, sftp.timeBetweenSizeCheck 5, and sftp.knownHosts with the known_hosts line from the Server tab. Add sftp.identityFile with the name of the key file and select Protect. Lab made: the lab passes the file name, a real app keeps the key file out of the project. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'See the app connect',
      how: `Move the clock a minute. SFTP and FTP, Server tab: the Server log shows ${NAME} opening ${IN}. The Logs of the app show the poll.`,
      done: connected,
    },
    ask(
      'Why a size check',
      'Why does the listener read the size of a file twice, 5 seconds apart, before it picks it up?',
      [
        'To make the poll faster',
        'An SFTP server shows a file while it is still being uploaded. If the size changed between the two checks, the upload is still running, so the listener skips the file and tries again on the next poll. Without it the app can load half a file',
        'Because SFTP has no file sizes',
        'To find duplicate files',
      ],
      1,
      'SFTP has no lock that tells a reader the writer is done. timeBetweenSizeCheck is the common answer, and it should be longer than the gaps of the slowest upload. The other answer is a naming rule: the partner uploads to a temporary name and renames it when it is done, and the listener matches only the final name.',
    ),
    {
      title: 'Load the test file of Brightline',
      how: `Move the clock a minute or two. The log shows 4 stock lines loaded from ${GOOD}, and the Server tab of the client shows the file in ${ARCHIVE}, no longer in ${IN}.`,
      done: loaded,
    },
    {
      title: 'Send a bad file',
      how: `In the client, Quickconnect to ${HOST} as ${USER} with the new key file and trust the host key. Open ${IN}, pick ${BAD} on the local site and Upload. Move the clock a minute. The log warns that line 3 is not a whole number, and the file is in ${ERROR}, not lost.`,
      done: rejected,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail.`,
      done: alerted,
    },
  ],
  why: 'An SFTP setup in short: a user of its own for the app with a home folder, key login, and write only on the folders it reads, archives and rejects to. Pin the host key of the server in known_hosts. Keep the key out of plain properties. Configure the listener with the folder, moveToDirectory and timeBetweenSizeCheck, deploy, and check the server log for the login. Then test with a real file, a bad file that ends in the error folder, and an alert to the team that owns the feed.',
  docs: 'https://docs.mulesoft.com/sftp-connector/latest/sftp-connector-reference',
  solve(start) {
    let s = mark(start, 'inbox')
    s = addServerUser(s, HOST, USER, { home: HOME })
    const k = newUserKey(s, HOST, USER)
    s = setServerUser(k.state, HOST, USER, { writeDirs: [IN, ARCHIVE, ERROR] }, { who: 'admin' })
    const props = { 'sftp.host': HOST, 'sftp.port': '22', 'sftp.user': USER, 'sftp.inDir': IN, 'sftp.moveToDirectory': ARCHIVE, 'sftp.errorDir': ERROR, 'sftp.timeBetweenSizeCheck': '5', 'sftp.knownHosts': knownHostsLine(HOST, server(s)) }
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: `${NAME}-1.0.0-mule-application.jar`, replicas: 1, vCores: 0.1, props, secrets: { 'sftp.identityFile': k.file } }).state)
    s = mark(advance(mark(s, `logs:${NAME}`), 2 * MINUTE), `sftp:${HOST}`)
    s = transfer(s, { direction: 'upload', host: HOST, auth: { user: USER, key: k.file }, local: BAD, remote: `${IN}/${BAD}` }).state
    s = advance(s, 2 * MINUTE)
    return addMonAlert(s, { title: 'Brightline stock intake failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 3: 1, 7: 1 },
}

export const LABS = [lab]
