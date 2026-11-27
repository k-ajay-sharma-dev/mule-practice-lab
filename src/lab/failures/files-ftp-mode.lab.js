// The guided lab files-ftp-mode. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { clientDo, defaultSystems, fileRec } from '../platform-systems.js'
import { FLOW, HOST, NAME, protocolOf } from './files-ftp-mode.pkg.js'

const USER = 'legacy_pos'
const NEW_PASSWORD = 'pos-2026'
const FILE = 'sales_20261102.txt'

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const server = (s) => s.systems?.servers?.[HOST]
const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
const pointedOk = (s) => running(s) && protocolOf(props(s)) === 'FTP' && String(props(s)['ftp.port']).trim() === '21'
const passwordOk = (s) => running(s) && app(s, NAME).secrets['ftp.password'] === NEW_PASSWORD && !app(s, NAME).props['ftp.password']
// the client logged in and listed a folder: the server log has a successful LIST of the client
const clientIn = (s) => Boolean(s.seen[`sftp:${HOST}`]) && (server(s)?.log ?? []).some((l) => l.who === 'FileZilla' && l.ok && l.op === 'LIST')

function systems(now) {
  const y = defaultSystems(now)
  const x = y.servers[HOST]
  x.files = {
    [`/export/${FILE}`]: fileRec('STORE|DATE|TOTAL\n014|20261102|1840.50\n021|20261102|2215.10\n033|20261102|990.75\n', { t: at(0, 21, 55), owner: USER, mode: '-rw-rw-r--' }),
    '/export/done/sales_20261101.txt': fileRec('STORE|DATE|TOTAL\n014|20261101|1702.30\n', { t: at(0, 0, 5), owner: USER, mode: '-rw-rw-r--' }),
  }
  return y
}

const lab = {
  id: 'p-files-ftp-mode',
  group: 'Files, SFTP and batch',
  title: 'The legacy FTP import stopped',
  minutes: 18,
  scenario:
    'pos-sales-import reads the daily sales file of the shops from the legacy POS server ftp.legacy.harbor.lab and loads it into the sales report. On Monday at 18:00 a developer redeployed it from the new file import template of the team, which was built for SFTP. The same day the FTP admin changed the password of the account. It is Tuesday 09:00 and finance says the report of Monday is empty. The Inbox has the mails.',
  start() {
    const s = newPlatform({
      clock: at(0, 18),
      apps: [
        newApp(NAME, {
          props: { 'file.protocol': 'SFTP', 'ftp.host': HOST, 'ftp.port': '22', 'ftp.user': USER, 'ftp.workingDir': '/export', 'ftp.doneDir': '/export/done' },
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
          body: 'The sales report for Monday 2 November shows no shops at all. The shops did close their tills, and the POS team says the export file was written at 21:55 as always. Can you check the import? Harbor Finance',
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
      'Refused means the host was reached and no service listens on that port. A firewall that drops packets usually gives a timeout instead, and a wrong password gives a login error once the connection works. The app speaks SFTP on 22, which is what the new template was built for.',
    ),
    {
      title: 'Look at the server',
      how: `SFTP and FTP from the console menu. Pick ${HOST} and open the Server tab: it is an FTP server on port 21. Try Quickconnect with protocol SFTP on port 21 and read the greeting. Then connect with FTP, port 21, user ${USER} and the new password from the mail of the FTP admin team, and look at /export.`,
      done: clientIn,
    },
    ask(
      'FTP, FTPS and SFTP',
      'Which statement about the three protocols is right?',
      [
        'SFTP is FTP with TLS, so all three use port 21',
        'SFTP runs over SSH on port 22 with one encrypted connection. FTP uses port 21 for commands and a second connection for data, all in clear text. FTPS is FTP with TLS: explicit on port 21 after AUTH TLS, or implicit on port 990',
        'FTPS runs over SSH on port 22',
        'FTP and SFTP differ only in the port, so changing the port is enough',
      ],
      1,
      'SFTP is a different protocol from FTP, so it needs the SFTP connector and an SSH server, with a password or a key. FTP and FTPS use the FTP connector family. A client of one protocol does not understand the greeting of the other, which is the second error you see when only the port changes.',
    ),
    {
      title: 'Point the app at the FTP server',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set file.protocol to FTP, so the app uses the FTP connector, and ftp.port to 21. Apply Changes and read the next run in the logs: the connection works now and the login fails with 530.`,
      done: pointedOk,
    },
    {
      title: 'Store the new password',
      how: 'Properties: set ftp.password to the new password from the mail, as a protected property. Apply Changes.',
      done: passwordOk,
    },
    ask(
      'Why passive mode',
      'The FTP connection of the app has passive set to true, which is the default. Why does that matter for an app on CloudHub?',
      [
        'Passive mode encrypts the data',
        'In active mode the server opens the data connection back to the client, and the firewall or NAT in front of CloudHub blocks it, so the login works and LIST or a read hangs. In passive mode the client opens both connections',
        'Passive mode is faster for large files',
        'SFTP needs passive mode too',
      ],
      1,
      'FTP keeps commands and data on separate connections. With passive the server names a port and the client connects to it, which works through outbound firewalls. The server side then needs its passive port range open. SFTP has one connection, so it has no such mode. The lab does not model the data connection, so this setting cannot fail here.',
    ),
    ask(
      'Transfer mode',
      'Someone sets the transfer mode of the FTP connection to ASCII. A ZIP file that a shop uploads then arrives broken. Why?',
      [
        'ASCII mode compresses the file',
        'ASCII mode converts line endings between systems, which changes bytes inside a binary file. Keep BINARY, the default, which copies every byte as it is',
        'ASCII mode only allows text file names',
        'The ZIP was too large for FTP',
      ],
      1,
      'BINARY copies bytes unchanged and is right for every file. ASCII only makes sense for text files that must change line endings between Windows and Unix, and even then most teams let the reader handle them. The lab does not model the transfer mode either.',
    ),
    {
      title: 'Load the missed sales',
      how: `Schedules, ${FLOW}, Run. The log shows the 3 shops of ${FILE} loaded, and the file moves to /export/done. Check it in the SFTP and FTP screen.`,
      done: (s) => pointedOk(s) && passwordOk(s) && Boolean(lastRun(s)?.ok) && Boolean(server(s)?.files[`/export/done/${FILE}`]) && !server(s)?.files[`/export/${FILE}`],
    },
  ],
  why: 'Read a connection error layer by layer. Connection refused means nothing listens on that port, so check host, port and protocol before the login. A greeting the client does not understand means the right port with the wrong protocol: SFTP is SSH on 22 and needs the SFTP connector, FTP is 21 with commands and data on separate connections, and FTPS adds TLS on 21 or 990. Only once the connection works does a 530 point at the user or the password. For FTP from the cloud keep passive mode on, and keep the transfer mode BINARY. In the lab the app reads the protocol and the port, and the FTP data connection and transfer mode are questions only.',
  docs: 'https://docs.mulesoft.com/ftp-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), `sftp:${HOST}`), 'inbox')
    s = clientDo(s, HOST, { user: USER, password: NEW_PASSWORD, port: 21 }, (f) => f.list('/export')).state
    const a = app(s, NAME)
    s = change(s, NAME, { props: { ...a.props, 'file.protocol': 'FTP', 'ftp.port': '21' }, secrets: { ...a.secrets, 'ftp.password': NEW_PASSWORD } })
    return runNow(s, NAME, FLOW)
  },
  answers: { 1: 1, 3: 1, 6: 1, 7: 1 },
}

export const LABS = [lab]
