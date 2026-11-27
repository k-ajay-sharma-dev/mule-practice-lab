// The guided lab files-ftp-mode. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { clientDo, defaultSystems, fileRec } from '../platform-systems.js'
import { FLOW, HOST, modeOf, NAME, passiveOf, protocolOf } from './files-ftp-mode.pkg.js'

const USER = 'legacy_pos'
const NEW_PASSWORD = 'pos-2026'
const FILE = 'sales_20261102.txt'
const ZIP = 'receipts_20261102.zip'
const ZIP_SIZE = 482304

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const server = (s) => s.systems?.servers?.[HOST]
const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
const pointedOk = (s) => running(s) && protocolOf(props(s)) === 'FTP' && String(props(s)['ftp.port']).trim() === '21'
const passwordOk = (s) => running(s) && app(s, NAME).secrets['ftp.password'] === NEW_PASSWORD && !app(s, NAME).props['ftp.password']
const passiveOk = (s) => pointedOk(s) && passiveOf(props(s))
const binaryOk = (s) => passiveOk(s) && modeOf(props(s)) === 'BINARY'
// the client logged in and listed a folder: the server log has a successful LIST of the client
const clientIn = (s) => Boolean(s.seen[`sftp:${HOST}`]) && (server(s)?.log ?? []).some((l) => l.who === 'FileZilla' && l.ok && l.op === 'LIST')

function systems(now) {
  const y = defaultSystems(now)
  const x = y.servers[HOST]
  x.files = {
    [`/export/${FILE}`]: fileRec('STORE|DATE|TOTAL\n014|20261102|1840.50\n021|20261102|2215.10\n033|20261102|990.75\n', { t: at(0, 21, 55), owner: USER, mode: '-rw-rw-r--' }),
    [`/export/${ZIP}`]: fileRec('', { size: ZIP_SIZE, binary: true, t: at(0, 21, 56), owner: USER, mode: '-rw-rw-r--' }),
    '/export/done/sales_20261101.txt': fileRec('STORE|DATE|TOTAL\n014|20261101|1702.30\n', { t: at(0, 0, 5), owner: USER, mode: '-rw-rw-r--' }),
  }
  return y
}

const lab = {
  id: 'p-files-ftp-mode',
  group: 'Files, SFTP and batch',
  title: 'The legacy FTP import stopped',
  minutes: 22,
  scenario:
    `pos-sales-import reads the daily files of the shops from the legacy POS server ${HOST}: the sales totals as text and a ZIP of scanned receipts. On Monday at 18:00 a developer redeployed it from the file import template of the team. The template was built for SFTP and copies its FTP settings from an old job that ran in the data center. The same day the FTP admin changed the password of the account. It is Tuesday 09:00 and finance says the report of Monday is empty. The Inbox has the mails.`,
  start() {
    const s = newPlatform({
      clock: at(0, 18),
      apps: [
        newApp(NAME, {
          props: { 'file.protocol': 'SFTP', 'ftp.host': HOST, 'ftp.port': '22', 'ftp.user': USER, 'ftp.workingDir': '/export', 'ftp.doneDir': '/export/done', 'ftp.passive': 'false', 'ftp.transferMode': 'ASCII' },
          secrets: { 'ftp.password': 'pos-2025' },
          store: {},
          updated: at(0, 18),
        }),
      ],
      systems: systems(at(0, 18)),
      mail: [
        {
          t: at(0, 16),
          to: OPS,
          subject: `Password change for ${USER}`,
          body: `Hello, as planned the password of ${USER} on ${HOST} changes today at 17:00. The new practice password is ${NEW_PASSWORD}. Please update every app and script that uses it. FTP admin team`,
          source: 'FTP admin team',
        },
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Sales report of Monday is empty',
          body: `The sales report for Monday 2 November shows no shops at all, and the receipt archive has no scans for that day. The POS team says the export files were written at 21:55 as always. Can you check the import? Harbor Finance`,
          source: 'Harbor Finance',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Every 15 minutes since 18:15 the job fails on List sales files.` },
    ask(
      'Connection refused',
      'The error is SFTP:CONNECTIVITY with java.net.ConnectException: Connection refused at port 22. What does it tell you?',
      [
        'The password is wrong',
        'Nothing answers on that port of the host. The connection fails before any login, so check the protocol and the port before you look at the user and the password',
        'The sales file is missing',
        'The firewall of CloudHub drops the traffic',
      ],
      1,
      'Refused means the host was reached and no service listens on that port. A firewall that drops packets gives a timeout instead, and a wrong password gives a login error once the connection works. SFTP runs over SSH on port 22 with one encrypted connection. FTP uses port 21 for commands and a second connection for data. FTPS is FTP with TLS, on 21 after AUTH TLS or on 990.',
    ),
    {
      title: 'Look at the server',
      how: `SFTP and FTP from the console menu. Pick ${HOST} and open the Server tab: an FTP server on port 21 with the passive ports 50000 to 50100. Connect with FTP, port 21, user ${USER} and the new password from the mail, and look at /export. Note the size of ${ZIP}.`,
      done: clientIn,
    },
    {
      title: 'Point the app at the FTP server',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set file.protocol to FTP and ftp.port to 21, and ftp.password to the new password as a protected property. Apply Changes and read the next run in the logs: the login works now, and List sales files fails with Accept timed out.`,
      done: (s) => pointedOk(s) && passwordOk(s),
    },
    ask(
      'Accept timed out',
      'The login works, then LIST fails with 425 Failed to establish connection and java.net.SocketTimeoutException: Accept timed out. The app has ftp.passive set to false. Why does it fail on CloudHub?',
      [
        'The password is still wrong',
        'In active mode the client sends PORT and waits for the server to open the data connection back to it. Nothing can connect in to a CloudHub app through its NAT, so the wait times out. In passive mode the client opens both connections',
        'Active mode needs FTPS',
        'The server is down',
      ],
      1,
      'FTP keeps commands and data on separate connections. The old job ran in the data center, where the server could reach it, so active mode worked there. From the cloud use passive, the default of the FTP connector. The server then needs its passive port range open on its firewall, or the data connection to the port in the 227 answer times out.',
    ),
    {
      title: 'Switch to passive mode',
      how: `Properties: set ftp.passive to true, or remove it to get the default. Apply Changes and run ${FLOW}. The sales file loads now, and Extract receipt scans fails with COMPRESSION:INVALID_ARCHIVE and an invalid entry CRC.`,
      done: passiveOk,
    },
    ask(
      'Transfer mode',
      `ftp.transferMode is ASCII. The text file loads, and ${ZIP} arrives with another size and fails to extract. Why?`,
      [
        'ASCII mode compresses the file',
        'ASCII mode converts line endings between systems, which changes bytes inside a binary file. Keep BINARY, the default, which copies every byte as it is',
        'ASCII mode only allows text file names',
        'The ZIP was too large for FTP',
      ],
      1,
      'BINARY copies bytes unchanged and is right for every file. ASCII changes LF and CR LF to the line endings of the receiver, which is what you see in the client when you download a text file in ASCII to Windows. In a ZIP those bytes are data, so the archive breaks. The file on the server is fine: a new read in BINARY gets it whole.',
    ),
    {
      title: 'Set the transfer mode to BINARY',
      how: 'Properties: set ftp.transferMode to BINARY, or remove it to get the default. Apply Changes. In the client you can compare: download the ZIP with Transfer type ASCII and then Binary in the site manager, and look at the sizes.',
      done: binaryOk,
    },
    {
      title: 'Load the missed day',
      how: `Schedules, ${FLOW}, Run. The log shows the receipt scans of ${ZIP} extracted, and both files of Monday are in /export/done. Check it in the SFTP and FTP screen.`,
      done: (s) => binaryOk(s) && passwordOk(s) && Boolean(lastRun(s)?.ok) && Boolean(server(s)?.files[`/export/done/${FILE}`]) && Boolean(server(s)?.files[`/export/done/${ZIP}`]) && !server(s)?.files[`/export/${ZIP}`],
    },
  ],
  why: 'Read a connection error layer by layer. Connection refused means nothing listens on that port, so check host, port and protocol before the login. Once the login works, an FTP error on LIST or a read is about the data connection: active mode needs the server to connect back to the client, which fails from CloudHub, so keep passive mode and have the passive port range open on the server firewall. Keep the transfer mode BINARY: ASCII converts line endings and breaks every binary file, and the damage shows only when something opens the file.',
  docs: 'https://docs.mulesoft.com/ftp-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), `sftp:${HOST}`), 'inbox')
    s = clientDo(s, HOST, { user: USER, password: NEW_PASSWORD, port: 21 }, (f) => f.list('/export')).state
    let a = app(s, NAME)
    s = change(s, NAME, { props: { ...a.props, 'file.protocol': 'FTP', 'ftp.port': '21' }, secrets: { ...a.secrets, 'ftp.password': NEW_PASSWORD } })
    a = app(s, NAME)
    s = change(s, NAME, { props: { ...a.props, 'ftp.passive': 'true' } })
    s = runNow(s, NAME, FLOW)
    a = app(s, NAME)
    s = change(s, NAME, { props: { ...a.props, 'ftp.transferMode': 'BINARY' } })
    return runNow(s, NAME, FLOW)
  },
  answers: { 1: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
