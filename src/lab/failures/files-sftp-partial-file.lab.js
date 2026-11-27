// The guided lab files-sftp-partial-file. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { clientDo, defaultSystems, fileRec, finishWrite, putFile, removeFile, transfer } from '../platform-systems.js'
import { APP, settingsOf } from './files-sftp-partial-file.pkg.js'

const HOST = 'sftp.brightmart.lab'
const LATE = 'stock-2026-11-03-b.csv'
const ROWS = 12
const FULL = `sku,warehouse,available\n${Array.from({ length: ROWS }, (_, i) => `H-${101 + i},ROT-2,${(i * 37 + 11) % 90}`).join('\n')}\n`
const AUTH = { user: 'mule_stock', password: 'lab' }

const poller = (s) => app(s, APP)
const running = (s) => poller(s)?.status === 'Running'
const set = (s) => settingsOf({ ...poller(s)?.props, ...poller(s)?.secrets })
const guarded = (s) => running(s) && (set(s).sizeCheck >= 1000 || Boolean(set(s).trigger))
const loadsOf = (s) => poller(s)?.store?.loads ?? []
const reloaded = (s) => guarded(s) && loadsOf(s).some((l) => l.name === LATE && !l.partial && l.rows === ROWS && l.bad === 0)
// after the fix: a file was skipped while it was not ready, then loaded whole, and nothing was loaded half
const proved = (s) => {
  if (!guarded(s)) return false
  const since = poller(s).updated
  const skips = (poller(s).store?.skipped ?? []).filter((x) => x.t > since && x.name !== LATE)
  const loads = loadsOf(s).filter((l) => l.t > since)
  return !loads.some((l) => l.partial) && skips.some((x) => loads.some((l) => l.name === x.name && l.t > x.t && !l.partial && l.bad === 0))
}

// The warehouse system starts its upload over the slow line: the first half of the rows is there, the rest still comes
const startUpload = (state, path, text) => {
  const s = structuredClone(state)
  const cut = text.indexOf('\n', text.indexOf(`H-${101 + ROWS / 2}`)) - 9
  s.systems.servers[HOST].files[path] = fileRec(text.slice(0, cut), { t: s.clock, owner: 'wms', writing: true, rest: text.slice(cut), full: text.length })
  return s
}

const lab = {
  id: 'p-files-sftp-partial-file',
  group: 'Files, SFTP and batch',
  title: 'A file read while it was still uploading',
  minutes: 20,
  scenario: `It is 09:00. ${APP} polls /in on ${HOST} every 5 minutes, sets the stock level of each row and moves the file to /archive. The Rotterdam warehouse system uploads its stock file over a slow line. This morning half of the ROT-2 products still show the numbers of yesterday. The logs have no ERROR line.`,
  start() {
    let s = newPlatform({
      clock: at(1, 5, 30),
      apps: [newApp(APP, { vCores: 0.1, props: { 'sftp.host': HOST, 'sftp.user': 'mule_stock', 'sftp.directory': '/in', 'sftp.moveToDirectory': '/archive', 'sftp.timeBetweenSizeCheck': '', 'sftp.triggerSuffix': '' }, secrets: { 'sftp.password': 'lab' }, store: {} })],
    })
    s.systems = defaultSystems(s.clock)
    // the seed copy of the late file is replaced by a longer one that the lab writes at 07:58
    s = removeFile(s, HOST, `/in/${LATE}`)
    s = until(s, at(1, 7, 58))
    s = startUpload(s, `/in/${LATE}`, FULL)
    s = until(s, at(1, 9))
    s.mail.push({
      t: at(1, 8, 45),
      to: OPS,
      subject: 'ROT-2 stock levels are old',
      body: `Good morning. Our system sent ${LATE} at 07:58 with ${ROWS} products. Only the first ones were updated. H-107 to H-112 still show the stock of yesterday, so orders are promised from shelves we cannot check. The upload over our line takes a few minutes.`,
      source: 'Brightmart Rotterdam warehouse',
    })
    return s
  },
  steps: [
    { title: 'Read the mail of the warehouse', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(APP), how: `Runtime Manager, Applications, ${APP}, Logs. Read the first poll after 07:58: how many stock levels were loaded from ${LATE}, and what does the WARN line say about the last line?` },
    {
      title: 'Look at the file on the server',
      how: `Console, SFTP and FTP. Quickconnect to ${HOST} as mule_stock with password lab and open /archive. ${LATE} has the tag being written: the warehouse system is still sending it, now under its new path. Open the Server tab: the read right after 08:00 was logged with upload not finished.`,
      done: (s) => Boolean(s.seen[`sftp:${HOST}`]),
    },
    ask(
      'Find the cause',
      'Why were only 6 of the 12 products loaded?',
      [
        'The CSV has a bad header',
        'The listener picked up the file while the upload was still running, read the part that was there, and moved it to /archive',
        'The SFTP server cut the file because the disk is full',
        'The flow has a limit of 6 rows per file',
      ],
      1,
      'An SFTP server shows a file as soon as the upload starts, and its size grows until the sender closes it. The listener saw a new .csv, read the first rows, cut the next row in the middle, and moved the file. Nothing failed, so there is no ERROR line.',
    ),
    {
      title: 'Stop reading files that are not ready',
      how: `Runtime Manager, ${APP}, Settings, Properties. Set sftp.timeBetweenSizeCheck to 2000 or more: the listener then reads the size twice with that pause and skips a file whose size changed. Or agree a trigger file with the sender and set sftp.triggerSuffix to .done: the flow reads a .csv only when a file with the same name plus .done is next to it. Apply Changes.`,
      done: guarded,
    },
    ask(
      'Size check or a signal from the sender',
      'timeBetweenSizeCheck works without the sender changing anything. When can it still let a half file through?',
      [
        'Never, the size check is exact',
        'When the upload stalls for longer than the pause, for example on a slow or broken line, the size is the same twice and the file looks finished',
        'When the file is larger than 1 MB',
        'When the server uses FTP and not SFTP',
      ],
      1,
      'The size check guesses from two readings. A sender that signals the end is safer: it uploads the file as stock.csv.tmp and renames it to stock.csv at the end, which the *.csv matcher then sees whole, or it writes a .done trigger file after the data file. A rename on one server is atomic, so the listener never sees a half file.',
    ),
    {
      title: 'Load the whole file again',
      how: `SFTP and FTP, /archive. When ${LATE} is complete, select it and use Finish the upload (a lab tool: the sender completes the file). Then Rename or move it to /in. With the trigger fix, also upload an empty file ${LATE}.done to /in (New file on the local side, then Upload). Move the clock 5 minutes. A stock level file sets numbers, so loading it again is safe.`,
      done: reloaded,
    },
    {
      title: 'Prove a slow upload waits',
      how: 'SFTP and FTP, /in as mule_stock. Select stock-2026-11-04.csv on the local side, tick Slow link, and Upload. Move the clock 5 minutes: the log says the file is skipped. Then select it in /in and use Finish the upload (with the trigger fix, upload its .done file after that) and move the clock 5 minutes again. The log shows the whole file loaded and moved.',
      done: proved,
    },
  ],
  why: 'An SFTP or FTP server lists a file from the moment its upload starts, so a polling listener can read the part that is there and move the file on, without an error. Make the reader wait for a file that is complete. timeBetweenSizeCheck reads the size twice with a pause and skips a file that is still growing, which helps without changing the sender. A signal from the sender is safer: upload under a temporary name and rename at the end, or write a .done trigger file after the data. Then fix the data that was loaded half, which is safe here because the file sets levels. In the lab timeBetweenSizeCheck is a property in milliseconds, a growing file stays growing until you finish its upload, and the listener polls every 5 minutes as a schedule.',
  docs: 'https://docs.mulesoft.com/sftp-connector/latest/sftp-documentation',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${APP}`), `sftp:${HOST}`)
    s = change(s, APP, { props: { ...poller(s).props, 'sftp.timeBetweenSizeCheck': '2000' } })
    s = finishWrite(s, HOST, `/archive/${LATE}`)
    s = clientDo(s, HOST, AUTH, (f) => f.move(`/archive/${LATE}`, '/in')).state
    s = advance(s, 6 * MINUTE)
    const local = 'stock-2026-11-04.csv'
    s = transfer(s, { direction: 'upload', host: HOST, auth: AUTH, local, remote: `/in/${local}` }).state
    s = putFile(s, HOST, `/in/${local}`, s.systems.local.files[local].content, { writing: true, owner: 'mule_stock' })
    s = advance(s, 6 * MINUTE)
    s = finishWrite(s, HOST, `/in/${local}`)
    return advance(s, 6 * MINUTE)
  },
  answers: { 3: 1, 5: 1 },
}

export const LABS = [lab]
