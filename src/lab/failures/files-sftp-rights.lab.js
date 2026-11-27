// The guided lab files-sftp-rights. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { defaultSystems, fileRec, fingerprint, knownHostsLine, knownKeys, newHostKey, regenerateHostKey, setServerUser, transfer, trustHostKey } from '../platform-systems.js'
import { FLOW, HOST, NAME } from './files-sftp-rights.pkg.js'

const PARTNER = 'partner_brightmart'
const KEY = 'brightmart-partner.pem'
const HOME = '/partners/brightmart-north'
const IN = `${HOME}/in`
const OUT = `${HOME}/out`
const DONE = `${HOME}/done`
const LOCAL = 'orders-partner.json'
// the key the server had before the rebuild: newServerSys makes it from the host name
const OLD_KEY = newHostKey(HOST).pub
const REBUILD = 'rebuild-2026-11'
// regenerateHostKey makes the new key from the host and the seed, so the mail can name its fingerprint
const NEW_KEY = newHostKey(`${HOST}/${REBUILD}`).pub

const server = (s) => s.systems?.servers?.[HOST]
const newKey = (s) => server(s)?.hostKey?.pub
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
const partner = (s) => server(s)?.users?.[PARTNER]
const trusted = (s) => Boolean(s.seen[`sftp:${HOST}`]) && s.systems?.local?.knownHosts?.[HOST] === newKey(s)
const knownOk = (s) => {
  const keys = knownKeys(props(s)['sftp.knownHosts'], HOST, 22)
  return running(s) && keys.includes(newKey(s)) && !keys.includes(OLD_KEY)
}
const inIn = (p) => String(p ?? '').startsWith(`${IN}/`)
const uploads = (s, ok) => (s.systems?.transfers ?? []).filter((x) => x.direction === 'upload' && x.host === HOST && x.user === PARTNER && inIn(x.remote) && x.ok === ok)
// least privilege: write on the inbox and nothing more, the outbox still readable, the login as it was
const rightsOk = (s) => {
  const u = partner(s)
  if (!u || u.locked || u.readOnly || u.key !== KEY || u.home !== HOME) return false
  const w = u.writeDirs
  const readsOut = !u.readDirs || u.readDirs.some((d) => d === OUT || OUT.startsWith(`${d}/`))
  return Array.isArray(w) && w.includes(IN) && w.every((d) => d === IN || d.startsWith(`${IN}/`)) && readsOut
}

function systems(now) {
  const y = defaultSystems(now)
  const x = y.servers[HOST]
  x.dirs.push(IN, OUT, DONE)
  x.files[`${OUT}/confirm-1102.json`] = fileRec('{"confirmed":["A-77"]}', { t: at(0, 7), owner: 'mule_stock' })
  x.files[`${DONE}/orders-1102.json`] = fileRec('[{"orderId":"A-77","qty":4}]', { t: at(0, 6, 15), owner: PARTNER })
  delete x.files[`${HOME}/orders-1102.json`]
  return y
}

const lab = {
  id: 'p-files-sftp-rights',
  group: 'Files, SFTP and batch',
  title: 'The partner upload broke after a server rebuild',
  minutes: 20,
  scenario:
    `Brightmart North, a partner, uploads its order files to ${IN} on ${HOST}, and ${NAME} loads them every 15 minutes. Last night at 22:00 the security team rebuilt the server on a hardened image and moved every user to rights per folder. Since then ${NAME} fails, and this morning Brightmart North says its upload fails too. It is 09:00. The Inbox has the mails.`,
  start() {
    const line = `${HOST} ssh-ed25519 ${OLD_KEY}`
    let s = newPlatform({
      clock: at(0, 20),
      apps: [
        newApp(NAME, {
          props: { 'sftp.host': HOST, 'sftp.port': '22', 'sftp.user': 'mule_stock', 'sftp.inDir': IN, 'sftp.doneDir': DONE, 'sftp.knownHosts': line },
          secrets: { 'sftp.password': 'lab' },
          store: {},
          updated: at(0, 9),
        }),
      ],
      systems: systems(at(0, 20)),
      mail: [
        {
          t: at(0, 22, 20),
          to: OPS,
          subject: `${HOST} rebuilt on the hardened image`,
          body: `Hello, ${HOST} runs on the new hardened image since 22:00. It has a new host key: ssh-ed25519 ${fingerprint(NEW_KEY)}. Check this fingerprint before you trust the new key, and update every client that pins the old one. Every user now has rights per folder instead of rights on the whole home folder. Security team`,
          source: 'Security team',
        },
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Our order upload fails',
          body: `Good morning, since last night our upload of the daily order file to ${IN} fails with permission denied. Login with our key works. Can you check our rights? Brightmart North IT`,
          source: 'Brightmart North IT',
        },
      ],
    })
    s = until(s, at(0, 22))
    // the rebuild: a new host key, and the partner user can read its folders but write none (the mistake)
    s = regenerateHostKey(s, HOST, { who: 'security', seed: REBUILD })
    s = setServerUser(s, HOST, PARTNER, { readDirs: [IN, OUT], writeDirs: [] }, { who: 'security', text: `User ${PARTNER} moved to rights per folder: read ${IN}, ${OUT}; write none` })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Since 22:00 List order files fails with SFTP:CONNECTIVITY and HostKey has been changed.` },
    {
      title: 'Check the new host key',
      how: `SFTP and FTP from the console menu. Pick ${HOST}, user ${PARTNER}, key file ${KEY}, and Quickconnect. The client warns that the host key does not match the one it has cached. Compare the fingerprint with the mail of the security team and with the Server tab. Only when they match, update the cached key and connect.`,
      done: trusted,
    },
    ask(
      'Why pin a host key',
      'Why does a client pin the host key of an SFTP server, and fail when it changes?',
      [
        'To make the connection faster',
        'The host key proves the client talks to the real server. If someone sits in the middle, the key differs, so a pinned key stops the client before it sends a password or a file. A changed key is safe only after you confirm it with the owner of the server',
        'Because the password is stored in the host key',
        'Host keys expire every day',
      ],
      1,
      'The server proves who it is with its host key before any login. Without a check, a client trusts whatever answers on that address. Turning off the check, as StrictHostKeyChecking=no does, hides a rebuild and an attack the same way. So confirm the new fingerprint through another channel, then update known_hosts.',
    ),
    {
      title: 'Update the known hosts of the app',
      how: `Server tab: copy the known_hosts line of ${HOST}. Runtime Manager, ${NAME}, Settings, Properties: replace sftp.knownHosts with that line, so the old key is gone. Apply Changes. The next run connects and finds no order files, because the partner could not upload any.`,
      done: knownOk,
    },
    {
      title: 'Reproduce the partner upload',
      how: `In the client, connected as ${PARTNER}, open ${IN}, pick ${LOCAL} on the local site and Upload. It fails with permission denied, like the partner said. The Server tab shows the rights of the user.`,
      done: (s) => uploads(s, false).length > 0,
    },
    ask(
      'Least privilege per folder',
      `Which rights should ${PARTNER} get?`,
      [
        'Read and write on /, so this cannot happen again',
        `Write on ${IN} only, read on ${IN} and ${OUT}, and nothing outside its home folder. Each folder gets the least right the partner needs, so a lost key cannot change the outbox or other partners' files`,
        'Read only everywhere, and Brightmart fetches the files from the partner',
        'Make the user an administrator of the server',
      ],
      1,
      'Least privilege limits what a stolen key or a wrong script can do. The partner drops files in its inbox and reads replies in its outbox, so it needs write on one folder and read on two. A home folder keeps it away from other partners, and rights per folder keep it from changing what Brightmart writes for it.',
    ),
    {
      title: 'Give the partner write rights on its inbox',
      how: `Server tab, ${PARTNER}, Edit. Under Write, pick Only the folders ticked and tick ${IN}. Keep read on ${IN} and ${OUT}, the key and the home folder as they are. Save.`,
      done: rightsOk,
    },
    {
      title: 'Upload again with the client',
      how: `Upload ${LOCAL} to ${IN} again as ${PARTNER}. It works now. Ask Brightmart North to send its file of today.`,
      done: (s) => rightsOk(s) && uploads(s, true).length > 0,
    },
    {
      title: 'Load the orders',
      how: `Schedules, ${FLOW}, Run. The log shows the orders loaded, and the file moves to ${DONE}.`,
      done: (s) => knownOk(s) && rightsOk(s) && Boolean(lastRun(s)?.ok) && Object.entries(server(s)?.files ?? {}).some(([p, f]) => p.startsWith(`${DONE}/`) && f.owner === PARTNER && f.t > at(1, 0)),
    },
  ],
  why: 'A server rebuild can change two things a client depends on: the host key and the rights of the users. A pinned host key makes every client fail on purpose, so confirm the new fingerprint with the owner through another channel, then update the cached key and the known_hosts of each app. Never turn the check off. When a login works and an upload fails with permission denied, look at the rights of that user on that folder, and grant the least that does the job: write on the inbox only.',
  docs: 'https://docs.mulesoft.com/sftp-connector/latest/sftp-connector-reference',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), `sftp:${HOST}`)
    s = trustHostKey(s, HOST, newKey(s))
    const a = app(s, NAME)
    s = change(s, NAME, { props: { ...a.props, 'sftp.knownHosts': knownHostsLine(HOST, server(s)) } })
    const auth = { user: PARTNER, key: KEY, knownHosts: s.systems.local.knownHosts }
    s = transfer(s, { direction: 'upload', host: HOST, auth, local: LOCAL, remote: `${IN}/${LOCAL}` }).state
    s = setServerUser(s, HOST, PARTNER, { writeDirs: [IN] }, { who: 'admin' })
    s = transfer(s, { direction: 'upload', host: HOST, auth, local: LOCAL, remote: `${IN}/${LOCAL}` }).state
    return runNow(s, NAME, FLOW)
  },
  answers: { 2: 1, 5: 1 },
}

export const LABS = [lab]
