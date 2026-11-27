// The guided lab files-sftp-double-pickup. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { defaultSystems, norm, putFile, putLocal, removeFile, transfer } from '../platform-systems.js'
import { APP, settingsOf } from './files-sftp-double-pickup.pkg.js'

const HOST = 'sftp.brightmart.lab'
const FIRST = 'stock-in-2026-11-03.csv'
const NEXT = 'stock-in-2026-11-04.csv'
const RECEIPTS = 'sku,warehouse,received\nH-100,DUB-1,24\nH-200,DUB-1,40\nH-300,ROT-2,12\nH-410,ROT-2,60\n'
const NEXT_RECEIPTS = 'sku,warehouse,received\nH-100,DUB-1,18\nH-520,DUB-1,30\n'

const poller = (s) => app(s, APP)
const running = (s) => poller(s)?.status === 'Running'
const set = (s) => settingsOf({ ...poller(s)?.props, ...poller(s)?.secrets })
const dirExists = (s, dir) => Boolean(dir) && (s.systems?.servers?.[HOST]?.dirs ?? []).includes(norm(dir))
const filesIn = (s, dir) => Object.keys(s.systems?.servers?.[HOST]?.files ?? {}).filter((p) => p.startsWith(`${norm(dir)}/`))
const oneReader = (s) => {
  if (!running(s)) return false
  const a = poller(s)
  const x = set(s)
  return (a.cluster && a.replicas >= 2) || a.replicas === 1 || (dirExists(s, x.claim) && norm(x.claim) !== norm(x.dir))
}
const moves = (s) => {
  if (!running(s)) return false
  const x = set(s)
  return x.autoDelete || (dirExists(s, x.moveTo) && norm(x.moveTo) !== norm(x.dir))
}
// a file that arrived after the fix was booked once and is no longer waiting in the folders the listener reads
const provedOnce = (s) => {
  if (!oneReader(s) || !moves(s)) return false
  const since = (poller(s).store?.loads ?? []).filter((l) => l.t > poller(s).updated)
  const left = [...filesIn(s, set(s).dir), ...(set(s).claim ? filesIn(s, set(s).claim) : [])].map((p) => p.split('/').pop())
  return since.some((l) => l.name !== FIRST && since.filter((m) => m.name === l.name).length === 1 && !left.includes(l.name))
}

const lab = {
  id: 'p-files-sftp-double-pickup',
  group: 'Files, SFTP and batch',
  title: 'Two replicas read the same file',
  minutes: 20,
  scenario: `It is 09:00. ${APP} reads goods receipt files from ${HOST} and adds each received quantity to the stock on hand. Last week the application went from 1 to 2 replicas so it survives a replica restart. Clustering was left off. The warehouse says the receipts of this morning were booked twice. Nothing failed and the logs have no ERROR line.`,
  start() {
    let s = newPlatform({
      clock: at(1, 5, 30),
      apps: [
        newApp(APP, {
          replicas: 2,
          vCores: 0.2,
          props: { 'sftp.host': HOST, 'sftp.user': 'mule_stock', 'sftp.directory': '/in', 'sftp.moveToDirectory': '', 'sftp.autoDelete': 'false', 'pickup.claimDir': '' },
          secrets: { 'sftp.password': 'lab' },
          store: { onHand: { 'H-100': 120, 'H-200': 35, 'H-300': 80, 'H-410': 0 } },
        }),
      ],
    })
    s.systems = defaultSystems(s.clock)
    s = removeFile(removeFile(s, HOST, '/in/stock-2026-11-03.csv'), HOST, '/in/stock-2026-11-03-b.csv')
    s = putLocal(s, NEXT, NEXT_RECEIPTS)
    s = until(s, at(1, 6))
    s = putFile(s, HOST, `/in/${FIRST}`, RECEIPTS, { owner: 'wms' })
    s = until(s, at(1, 9))
    s.mail.push({
      t: at(1, 8, 40),
      to: OPS,
      subject: 'Goods receipts booked twice',
      body: `Good morning. The receipts file ${FIRST} of this morning has 4 lines and 136 units. The stock on hand went up by 272 units, so pickers are sent to shelves that are empty. We fix the numbers in the warehouse system. Please make sure the next file is booked once.`,
      source: 'Brightmart Warehouse',
    })
    return s
  },
  steps: [
    { title: 'Read the mail of the warehouse', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(APP), how: `Runtime Manager, Applications, ${APP}, Logs. Read the lines of the first poll after 06:00. The lab writes the replica name at the front of each line.` },
    {
      title: 'Look at the SFTP server',
      how: `Console, SFTP and FTP. Quickconnect to ${HOST} as mule_stock with password lab. ${FIRST} is still in /in. Open the Server tab at the bottom: the server log shows two reads of the file by ${APP} in the same minute, and one upload by wms.`,
      done: (s) => Boolean(s.seen[`sftp:${HOST}`]),
    },
    ask(
      'Find the cause',
      `Why was ${FIRST} booked twice?`,
      ['The warehouse system uploaded it twice', `Each replica runs its own listener on /in, and both read the file in the same poll`, 'The watermark was lost in a restart', 'A retry ran the flow again after a timeout'],
      1,
      'Two Read lines in the same minute, each with a different replica name, and the server log has one upload and two reads. The watermark only skips files older than the last poll. Both replicas listed /in at the same moment, before either one had booked the file, so the watermark could not help.',
    ),
    ask(
      'Scheduler and listener',
      'On CloudHub 2.0 with 2 replicas and clustering off, a Scheduler flow runs twice. Why does an SFTP On New or Updated File listener also read every file twice?',
      [
        'It does not, a listener always runs on one replica',
        'The SFTP listener is a polling source with its own scheduling strategy. Without clustering each replica is a separate Mule runtime that starts every source, so each one polls the folder',
        'The load balancer sends each file to both replicas',
        'The SFTP server pushes each new file to every connected client',
      ],
      1,
      'A Scheduler and the SFTP, FTP and File listeners all poll on a timer, and every replica starts them. In a cluster a polling source runs on the primary node only (primaryNodeOnly), on CloudHub 2.0 and in a hybrid cluster. A hybrid server group is not a cluster, so each server of the group polls on its own. An HTTP Listener is different: the load balancer gives each request to one replica.',
    ),
    {
      title: 'Let one replica read each file',
      how: `Runtime Manager, ${APP}, Settings. Either tick Run in Runtime Cluster Mode under Runtime Options and keep 2 replicas, so the listener runs on the primary replica only. Or, if clustering is not an option, claim each file before reading it: create a folder /processing in the SFTP and FTP screen (Create directory) and set the property pickup.claimDir to /processing. A rename on one SFTP server is atomic, so only one replica moves the file. The move of the other replica fails because the file is gone, and it skips the file. Apply Changes.`,
      done: oneReader,
    },
    {
      title: 'Move each file after the flow',
      how: 'Settings, Properties. Set sftp.moveToDirectory to /archive, a folder that exists on the server, or set sftp.autoDelete to true. Then a booked file leaves the folder the listener reads, and the folder shows at a glance what is still waiting. Apply Changes.',
      done: moves,
    },
    {
      title: 'Prove the next file is booked once',
      how: `SFTP and FTP: as mule_stock open /in, select ${NEXT} on the local side and Upload it, with Slow link off. Then move the clock 5 minutes, one poll of the listener. Logs show one Read line for ${NEXT}, and the file is in /archive (or gone with autoDelete), not in /in.`,
      done: provedOnce,
    },
  ],
  why: 'Replicas without clustering are separate Mule runtimes, and each one starts every polling source: a Scheduler, and also the SFTP, FTP and File listeners. Two replicas list the same folder at the same moment and both read each new file, without a single error. The watermark does not stop this, because both polls start before either one has finished. Run the application as a cluster, so the listener runs on the primary node only. Without a cluster, keep one reader: one replica for the polling app, a claim by rename into a processing folder, or a lock in a shared object store. Then move or delete each file after the flow, and make the booking safe to run twice, for example with the file name as a key in an object store. In the lab the listener polls every 5 minutes as a schedule, and the poll of each replica is written into that one run.',
  docs: 'https://docs.mulesoft.com/sftp-connector/latest/sftp-on-new-file',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${APP}`), `sftp:${HOST}`)
    s = change(s, APP, { cluster: true, props: { ...poller(s).props, 'sftp.moveToDirectory': '/archive' } })
    s = transfer(s, { direction: 'upload', host: HOST, auth: { user: 'mule_stock', password: 'lab' }, local: NEXT, remote: `/in/${NEXT}` }).state
    return advance(s, 6 * MINUTE)
  },
  answers: { 3: 1, 4: 1 },
}

export const LABS = [lab]
