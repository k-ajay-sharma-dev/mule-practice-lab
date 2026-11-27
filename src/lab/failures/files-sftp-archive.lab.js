// The guided lab files-sftp-archive. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { defaultSystems, fileRec } from '../platform-systems.js'
import { errorDirOf, FLOW, HOST, NAME } from './files-sftp-archive.pkg.js'

const READER = 'stock_reader'
const WRITER = 'mule_stock'
const WRITER_PASSWORD = 'lab'
const BAD = 'stock-2026-11-03-dub2.csv'

const csv = (rows) => `sku,warehouse,available\n${rows.join('\n')}\n`
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const server = (s) => s.systems?.servers?.[HOST]
const filesIn = (s, dir) => Object.keys(server(s)?.files ?? {}).filter((p) => p.slice(0, p.lastIndexOf('/')) === dir)
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'

const writerOk = (s) => running(s) && props(s)['sftp.user'] === WRITER && props(s)['sftp.password'] === WRITER_PASSWORD && !app(s, NAME).props['sftp.password']
const archiveOk = (s) => running(s) && (String(props(s)['archive.rename'] ?? '').trim().toLowerCase() === 'timestamp' || yes(props(s)['archive.overwrite']))
const errorPathOk = (s) => running(s) && errorDirOf(props(s)) === '/error' && (yes(props(s)['move.createParentDirectories']) || server(s)?.dirs.includes('/error'))
const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last

function systems(now) {
  const y = defaultSystems(now)
  const x = y.servers[HOST]
  x.users[READER] = { password: 'Reader-2611', home: '/', readOnly: true }
  // the folder for bad files was never created on this server
  x.dirs = x.dirs.filter((d) => d !== '/error')
  delete x.files['/in/stock-2026-11-03-b.csv']
  x.files['/in/stock-2026-11-03.csv'] = fileRec(csv(['H-100,DUB-1,24', 'H-200,DUB-1,0', 'H-300,ROT-2,112']), { t: now - 5 * MINUTE, owner: 'wms' })
  // the warehouse system sent the file of Monday again, corrected, with the same name as the one in /archive
  x.files['/in/stock-2026-11-02.csv'] = fileRec(csv(['H-100,DUB-1,31', 'H-200,DUB-1,6', 'H-300,ROT-2,98']), { t: now - 4 * MINUTE, owner: 'wms' })
  x.files[`/in/${BAD}`] = fileRec(csv(['H-410,DUB-2,12', 'H-420,DUB-2,twelve']), { t: now - 3 * MINUTE, owner: 'wms' })
  return y
}

const lab = {
  id: 'p-files-sftp-archive',
  group: 'Files, SFTP and batch',
  title: 'The file that never leaves /in',
  minutes: 20,
  scenario:
    'stock-archive-poll lists the CSV files in /in on sftp.harbor.lab every 5 minutes, posts the stock levels of each file to the stock service, and then moves the file to /archive. It is Tuesday 09:00. The stock team says the same files were posted dozens of times since 06:00, and stock counts jump back and forth. On Monday evening the app was moved to a new SFTP account after an access review. The Inbox has the mails.',
  start() {
    const s = newPlatform({
      clock: at(1, 6),
      apps: [
        newApp(NAME, {
          props: { 'sftp.host': HOST, 'sftp.port': '22', 'sftp.user': READER, 'sftp.inDir': '/in', 'archive.dir': '/archive', 'archive.rename': 'none', 'archive.overwrite': 'false', 'move.createParentDirectories': 'false', 'error.dir': '' },
          secrets: { 'sftp.password': 'Reader-2611' },
          store: {},
        }),
      ],
      systems: systems(at(1, 6)),
      mail: [
        {
          t: at(0, 17),
          to: OPS,
          subject: 'Access review: new SFTP account for stock-archive-poll',
          body: `As agreed in the access review, stock-archive-poll now logs in to ${HOST} as ${READER}, which reads all folders. The shared account ${WRITER} stays for apps that also write, move or delete files. Its practice password is ${WRITER_PASSWORD}. SFTP admin team`,
          source: 'SFTP admin team',
        },
        {
          t: at(1, 8, 40),
          to: OPS,
          subject: 'Stock levels posted again and again',
          body: 'Since 06:00 the stock service gets the files stock-2026-11-03.csv and stock-2026-11-02.csv every 5 minutes. The second one is a corrected file for Monday that we sent again this morning. A third file from Dublin 2 never arrives at all. Please stop the repeats before the shops open at 10:00. Harbor Stock team',
          source: 'Harbor Stock team',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each poll posts the same two files again, then fails on Archive file. A third file fails on Read stock rows.` },
    ask(
      'Read the archive error',
      'The move to /archive fails with SFTP:ACCESS_DENIED, and the next poll posts the same file again. Why does a failed move cause the repeat?',
      [
        'The SFTP server is down for writes',
        'The account can read but not write. A move is a rename on the server, which is a write, so the file stays in /in and the next poll finds it again',
        'The file is still being written by the warehouse',
        'The /archive folder is full',
      ],
      1,
      'The read worked, so the host, the port and the login are fine. A rename needs write rights on the source and the target folder. The flow posts the stock first and archives after, so every failed move leaves the file in /in, and a poll only asks what is in the folder now.',
    ),
    {
      title: 'Look at the account on the server',
      how: `SFTP and FTP from the console menu. Host ${HOST}, tab Server: ${READER} is read only. Connect as ${READER} and try to rename a file, then look at the server log. Note that /error is missing from the folder tree.`,
      done: (s) => Boolean(s.seen[`sftp:${HOST}`]),
    },
    {
      title: 'Use an account that can move files',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sftp.user to ${WRITER} and sftp.password to the password in the mail of the SFTP admin team, as a protected property. Apply Changes and look at the next poll in the logs.`,
      done: writerOk,
    },
    ask(
      'Same name in the archive',
      'Now stock-2026-11-03.csv is archived, but stock-2026-11-02.csv fails with SFTP:FILE_ALREADY_EXISTS. /archive has the file of Monday from yesterday. What is the best fix?',
      [
        'Set overwrite to true, so the move always works',
        'Archive under a unique name, such as the name plus a time stamp, so both copies are kept and the move cannot clash',
        'Delete the old archive copy by hand each time',
        'Ask the warehouse never to send a file twice',
      ],
      1,
      'Senders do resend files with the same name, after a correction or a retry. renameTo with a time stamp keeps the history and never clashes. overwrite true also stops the error, but it throws away the first copy, which you may need to explain what was posted on Monday. Use it only when the archive copy has no value.',
    ),
    {
      title: 'Archive under a unique name',
      how: 'Properties: set archive.rename to timestamp. The flow then moves the file with renameTo set to the name plus the time, for example stock-2026-11-02_20261103T091500.csv. archive.overwrite true would also work, at the cost of the old copy. Apply Changes.',
      done: archiveOk,
    },
    {
      title: 'Move bad files aside',
      how: `${BAD} has the text twelve where a number belongs, so it fails on every poll and nobody hears about it. Set error.dir to /error, so the error path of the flow moves a file that cannot be read there. /error does not exist on the server: set move.createParentDirectories to true, or create the folder as ${WRITER} in the SFTP and FTP screen. Apply Changes.`,
      done: errorPathOk,
    },
    ask(
      'Process each file once',
      'The archive move can fail again one day, for a new reason. What makes the flow safe when that happens?',
      [
        'Nothing more, the fixes above are enough',
        'Make it idempotent: keep a key per file, such as the name with its size and time or a hash of the content, in a persistent Object Store, skip a file whose key is already there, and make the load an upsert so a second post changes nothing',
        'Delete the file before the stock is posted',
        'Poll once an hour instead of every 5 minutes',
      ],
      1,
      'Any step after the load can fail: the move, the network, a restart. The Idempotent Message Validator with a persistent Object Store, or your own check, turns a second read into a no op. An upsert on the target protects you once more. Deleting first loses the file when the post fails, and a slower poll only repeats less often.',
    ),
    {
      title: 'Watch the next polls',
      how: 'Move the clock 10 minutes after the last change. /in is empty, /archive holds both copies of 2 November, /error holds the Dublin 2 file, and the last run has no error.',
      done: (s) => {
        const a = app(s, NAME)
        if (!writerOk(s) || !archiveOk(s) || !errorPathOk(s) || s.clock < a.updated + 10 * MINUTE) return false
        const archive = filesIn(s, '/archive')
        return (
          filesIn(s, '/in').length === 0 &&
          archive.some((p) => /^\/archive\/stock-2026-11-03(_\d{8}T\d{6})?\.csv$/.test(p)) &&
          archive.filter((p) => p.startsWith('/archive/stock-2026-11-02')).length >= (yes(props(s)['archive.overwrite']) && String(props(s)['archive.rename']).trim().toLowerCase() !== 'timestamp' ? 1 : 2) &&
          filesIn(s, '/error').some((p) => p.includes('dub2')) &&
          Boolean(lastRun(s)?.ok) &&
          lastRun(s).t > a.updated
        )
      },
    },
  ],
  why: 'A poll lists what is in the folder now. When the move after processing fails, the file stays and is processed again on every poll. Read the error type of the move: ACCESS_DENIED means the account cannot write, FILE_ALREADY_EXISTS means the target name is taken, and a target path that does not exist means the folder is missing. Give the app an account that can write, archive under a unique name, let createParentDirectories make the folder (its default in the connector is true), and give bad files an error path to their own folder. Then make the load idempotent, so the next failure after the load cannot post twice. In the lab the server checks rights per account, not per folder, and the move settings are properties.',
  docs: 'https://docs.mulesoft.com/sftp-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), `sftp:${HOST}`), 'inbox')
    const a = app(s, NAME)
    s = change(s, NAME, {
      props: { ...a.props, 'sftp.user': WRITER, 'archive.rename': 'timestamp', 'error.dir': '/error', 'move.createParentDirectories': 'true' },
      secrets: { ...a.secrets, 'sftp.password': WRITER_PASSWORD },
    })
    return advance(s, 11 * MINUTE)
  },
  answers: { 1: 1, 4: 1, 7: 1 },
}

export const LABS = [lab]
