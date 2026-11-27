// The outside systems that Mule apps of the Platform Lab talk to: SFTP, FTP and FTPS servers, Azure Storage accounts
// (Blob containers and File shares) and Azure Key Vaults. Pure and self contained: it never imports platform.js, so the
// engine can import it without a cycle.
//
// ---------- API in short (for lab and package authors) ----------
// State: state.systems = newSystems({ servers, storage, vaults }). It is optional: every helper copes with it missing.
//   systems.servers[host]    an SFTP, FTP or FTPS server (newServerSys)
//   systems.storage[account] an Azure Storage account with blob containers and file shares (newStorage)
//   systems.vaults[name]     an Azure Key Vault (newVault)
//   systems.local            the learner's own computer in the SFTP client (files the client uploads and downloads)
//   systems.transfers        the transfer queue of the SFTP client
//   systems.principals       optional: names of identities that exist in Microsoft Entra ID before their app is deployed
//                            (lab made: an app registration named after the app). The portal offers them for access
//                            policies and role assignments next to the names of the deployed apps.
//
// Targets name a place that holds files, the same way everywhere:
//   'sftp.harbor.lab' (or 'sftp://sftp.harbor.lab')   a server; paths are '/in/a.csv', or relative to the working directory
//   'blob:harborstore/customer-exports'               a blob container; paths are blob names such as 'daily/a.csv'
//   'share:harborstore/stock-share'                   a file share; paths are 'in/a.csv'
//
// In a package (handle, run, consume get ctx from the engine):
//   const f = ctx.systems.files(target, auth)
//     auth for a server: { user, password } or { user, key } (key is the identity file name), optional port, workingDir,
//       protocol (the connector of the client: a client of another protocol than the server fails with connection-refused)
//     auth for storage:  { sas: token } or { key: accountKey }, optional ip (default ctx app egress)
//   f.list(dir?, { sizeCheck }?) -> { ok, files: [{ path, name, size, t, writing, dir }] }
//   f.read(path, { sizeCheck }?) -> { ok, content, size, t, partial }
//        sizeCheck (ms) works like timeBetweenSizeCheck of the File, FTP and SFTP connectors: a file whose size still
//        changes fails with kind 'being-written'. Without it a file that is still written is read as it is (partial: true).
//   f.write(path, content, { overwrite, mode: 'OVERWRITE'|'APPEND'|'CREATE_NEW' }?) -> { ok, size }
//   f.move(from, to, { overwrite, createParent }?) (a target that ends with / must be a folder) -> { ok, path }  f.remove(path) -> { ok }  f.stat(path) -> { ok, file }  f.mkdir(path) -> { ok }
//   More auth fields for a server:
//     passive: true (default) or false, for FTP and FTPS. Active mode makes the server open the data connection back
//       to the client: from a CloudHub app that fails when the server has activeBlocked (the default), with
//       kind 'data-timeout' and FTP:CONNECTIVITY. Passive needs server.passive.open (the firewall of the server lets
//       the passive port range in). list, read and write use a data connection; stat, move, remove and mkdir do not.
//     transferMode: 'BINARY' (default) | 'ASCII' | 'AUTO' (AUTO is FileZilla: ASCII for known text extensions), FTP only.
//       ASCII converts line endings to the receiver's: the lab server is Unix, apps run on Linux, the client computer
//       is Windows. An ASCII copy of a binary file (zip, pdf, xlsx...) comes out damaged: read() then returns
//       corrupt: true and parseError, the error a reader of that file gives (a package fails with it).
//     knownHosts: the known_hosts of the client for SFTP ('host ssh-ed25519 AAAA...' lines, an array of them, or
//       { host: publicKey }). Given, the host key of the server must be in it: kind 'host-key-unknown' (reject HostKey)
//       or 'host-key-changed' (HostKey has been changed), SFTP:CONNECTIVITY. Not given, the key is not checked, like
//       the SFTP connector without knownHostsFile.
//   read() also returns binary (true for a binary file). A user with locked: true cannot log in (the same error as a
//   wrong password, the server log says why). Folder rights of a user: readDirs and writeDirs (lists of folders, each
//   with what is under it). Missing means no limit; readOnly still denies every write. write, move, remove and mkdir
//   need writeDirs; list, read and stat need readDirs (a folder on the way to one is listed with only that way shown).
//   ctx.systems.secret(vault, name, version?, { principal }?) -> { ok, value, version, contentType, expired, notYet }
//   ctx.systems.vault(vault, { principal }?) -> { get(name, version?), list(), set(name, value, { contentType, expires }?) }
//   The principal defaults to the app name, which is how the lab names the app's managed identity or service principal.
//
// Every failed call returns { ok: false, kind, error, type?, status?, code? }:
//   kind: 'unknown-system' | 'connection-refused' | 'auth-failed' | 'no-auth' | 'sas-expired' | 'permission-denied'
//         | 'network-blocked' | 'not-found' | 'already-exists' | 'is-directory' | 'being-written' | 'archived' | 'disabled'
//         | 'data-timeout' | 'host-key-unknown' | 'host-key-changed'
//   type: the Mule error type for SFTP and FTP (SFTP:CONNECTIVITY, SFTP:ACCESS_DENIED, SFTP:ILLEGAL_PATH (a path that
//         is not there, or a folder), SFTP:FILE_DOESNT_EXIST (a write whose folder is missing), SFTP:FILE_ALREADY_EXISTS;
//         FTP: and FTPS: the same), or null
//   status and code: the HTTP status and the Azure error code for Storage and Key Vault (403 AuthenticationFailed ...)
// Calls change the state they get (the engine passes a draft copy) and write what they did to the system's log.
//
// UI actions: pure, (state, ...) => new state. See the section "UI actions" below.
// Seen keys a screen marks: `sftp:${host}`, `blob:${account}`, `share:${account}`, `vault:${name}`.
//
// Server fields beyond users and files: activeBlocked (default true: the server cannot open a data connection back to
// a CloudHub app; the client computer and the company's own servers are not blocked, lab made), passive
// { from, to, open } for FTP and FTPS, hostKey { type, pub } for SFTP (fingerprint(pub) gives the SHA256 text,
// knownHostsLine(host, server) the known_hosts line). The client computer keeps trusted keys in
// systems.local.knownHosts { host: pub }. Server admin actions: addServerUser, setServerUser, lockServerUser,
// setUserPassword, setUserKey, newUserKey, setServerSettings, regenerateHostKey, trustHostKey.

// a firewall rule is one address or a CIDR range such as 203.0.113.0/24
const inRange = (ip, rule) => {
  const [base, bits = '32'] = String(rule).split('/')
  const n = (x) => String(x).split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0
  const m = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0
  return (n(ip) & m) === (n(base) & m)
}

const MIN = 60000
const HR = 60 * MIN
const DY = 24 * HR
const MAX_LOG = 80
export const DEFAULT_EGRESS = '203.0.113.24' // lab made: the outbound IP of the lab's CloudHub apps (a documentation range)
export const PORTS = { SFTP: 22, FTP: 21, FTPS: 990 } // FTPS 990 is implicit TLS; explicit FTPS uses 21 with AUTH TLS
export const TIERS = ['Hot', 'Cool', 'Cold', 'Archive']
export const SAS_PERMS = 'racwdl' // read, add, create, write, delete, list (blob SAS has more, such as x, t, f, i)
export const VAULT_PERMS = ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore', 'purge']
// Built-in Azure roles for secrets and what they allow in the lab (Reader reads metadata only, never values)
export const VAULT_ROLES = { 'Key Vault Secrets User': ['get', 'list'], 'Key Vault Secrets Officer': ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore'], 'Key Vault Reader': ['list'], 'Key Vault Administrator': VAULT_PERMS }
export const ACCESS_MODELS = ['Vault access policy', 'Azure role-based access control']

// ---------- state ----------

export const newSystems = (extra = {}) => ({ servers: {}, storage: {}, vaults: {}, local: newLocal(), transfers: [], n: 1, ...extra })
const byKey = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]))
// a list of systems or a map, so a lab writes newSystems({ servers: [newServerSys(...)] }) or the map itself
export const systemsOf = ({ servers = [], storage = [], vaults = [], ...extra } = {}) =>
  newSystems({ servers: Array.isArray(servers) ? byKey(servers, 'host') : servers, storage: Array.isArray(storage) ? byKey(storage, 'account') : storage, vaults: Array.isArray(vaults) ? byKey(vaults, 'name') : vaults, ...extra })

// A file. `writing` is true while an upload is still going on: `content` and `size` are what is there so far and
// `rest` and `full` are what the finished file will have (finishWrite completes it).
// extra.binary marks a binary file (zip, pdf, xlsx...); without it the name decides (isBinaryName). A binary file
// usually has content '' and a size. corrupt: true marks a copy damaged by an ASCII transfer.
export const fileRec = (content = '', extra = {}) => ({ size: extra.size ?? content.length, t: 0, content, owner: 'root', mode: '-rw-r--r--', ...extra })
export const BINARY_EXT = ['zip', 'gz', 'tgz', '7z', 'jar', 'pdf', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'tif', 'bin', 'exe', 'parquet', 'avro']
// the text extensions of FileZilla's Auto transfer type that matter in the lab (FileZilla's list is longer; it has no csv)
export const ASCII_EXT = ['txt', 'xml', 'htm', 'html', 'sql', 'sh', 'bat', 'conf', 'properties', 'js', 'css', 'java', 'py']
const extOf = (p) => (String(p).includes('.') ? String(p).split('.').pop().toLowerCase() : '')
export const isBinaryName = (p) => BINARY_EXT.includes(extOf(p))
export const isBinary = (p, f) => Boolean(f?.binary ?? isBinaryName(p))

// users: { [name]: { password?, key?, home, readOnly?, locked?, readDirs?, writeDirs? } }. `key` is the name of the
// identity file that matches the public key the server has for this user (lab made: real servers compare keys, the
// lab compares names).
export const newServerSys = (host, extra = {}) => {
  const protocol = extra.protocol ?? 'SFTP'
  const net = protocol === 'SFTP' ? { hostKey: newHostKey(host) } : { passive: { from: 50000, to: 50100, open: true } }
  return { host, protocol, port: PORTS[protocol], ip: '10.20.5.20', up: true, banner: protocol === 'SFTP' ? 'SSH-2.0-OpenSSH_9.6' : '220 Harbor FTP service ready', activeBlocked: true, ...net, users: {}, dirs: ['/'], files: {}, log: [], ...extra }
}

// ---------- host keys ----------

// Lab made keys: a real ed25519 public key is 68 base64 characters that start with AAAAC3NzaC1lZDI1NTE5AAAAI, and the
// fingerprint is the SHA256 of the key in base64. The lab makes both from a seed, so they look the same.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const b64ish = (h) => h.match(/../g).map((x) => B64[parseInt(x, 16) % 64]).join('')
export const newHostKey = (seed) => ({ type: 'ssh-ed25519', pub: `AAAAC3NzaC1lZDI1NTE5AAAAI${b64ish(hex(`hostkey/${seed}`, 86))}` })
export const fingerprint = (pub) => `SHA256:${b64ish(hex(`fp/${pub}`, 86))}`
export const knownHostsLine = (host, x) => (x?.hostKey ? `${host} ${x.hostKey.type} ${x.hostKey.pub}` : '')
// known_hosts as lines, a list of lines, or { host: pub }: the public keys it has for a host (and [host]:port)
export function knownKeys(known, host, port = 22) {
  if (known && typeof known === 'object' && !Array.isArray(known)) return known[host] ? [known[host]] : []
  const lines = (Array.isArray(known) ? known : String(known ?? '').split(/\r?\n/)).map((l) => String(l).trim()).filter((l) => l && !l.startsWith('#'))
  const names = [host, `[${host}]:${port}`]
  return lines.map((l) => l.split(/\s+/)).filter((w) => w.length >= 3 && w[0].split(',').some((h) => names.includes(h))).map((w) => w[2])
}
export const newStorage = (account, extra = {}) => ({
  account, up: true, region: 'East US', kind: 'StorageV2 (general purpose v2)', replication: 'Locally redundant storage (LRS)',
  keys: { key1: `${account}K1aa${'x'.repeat(8)}==`, key2: `${account}K2bb${'y'.repeat(8)}==` }, keysRotated: { key1: 0, key2: 0 },
  network: { mode: 'All networks', ips: [] }, containers: {}, shares: {}, sas: [], log: [], ...extra,
})
export const newContainer = (blobs = {}, extra = {}) => ({ access: 'Private', created: 0, blobs, ...extra })
export const newShare = (files = {}, extra = {}) => ({ quota: 100, tier: 'Transaction optimized', dirs: [''], files, created: 0, ...extra })
// secrets: { [name]: { versions: [{ id, value, created, enabled, expires?, notBefore?, contentType? }] } }, newest last
export const newVault = (name, extra = {}) => ({ name, up: true, region: 'East US', model: 'Vault access policy', softDelete: 90, network: { mode: 'All networks', ips: [] }, secrets: {}, access: {}, roles: {}, log: [], ...extra })
export const newLocal = (extra = {}) => ({ home: 'C:\\Users\\you\\harbor', files: {}, ...extra })

// ---------- small helpers ----------

const sys = (s) => s.systems ?? null
// an old save or a hand made systems object can miss parts: they are added, what is there stays
const fill = (y) => {
  const base = newSystems()
  if (!y) return base
  for (const k of Object.keys(base)) y[k] ??= base[k]
  y.local.files ??= {}
  return y
}
const edit = (state, fn) => {
  const s = structuredClone(state)
  s.systems = fill(s.systems)
  fn(s, s.systems, s.clock ?? 0)
  return s
}
const hex = (seed, n = 32) => {
  // FNV-1a over the whole seed, then stretched: the same seed gives the same id, so labs replay the same way
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  let out = ''
  for (let i = 0; out.length < n; i++) {
    h = Math.imul(h ^ (i + 0x9e37), 16777619) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}
const next = (y) => (y.n = (y.n ?? 1) + 1)
const push = (list, entry) => {
  list.push(entry)
  if (list.length > MAX_LOG) list.splice(0, list.length - MAX_LOG)
}
const fail = (kind, error, extra = {}) => ({ ok: false, kind, error, type: null, ...extra })
const az = (status, code, message, kind) => fail(kind, `${status} ${code}: ${message}`, { status, code })

export const norm = (p) => `/${String(p ?? '').replace(/\\/g, '/').split('/').filter((x) => x && x !== '.').join('/')}`
const flat = (p) => norm(p).slice(1) // blob and share paths have no leading slash
const parent = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const baseName = (p) => p.split('/').pop()

export function parseTarget(target) {
  const t = String(target ?? '').trim()
  const m = /^(blob|share):(?:\/\/)?([^/]+)\/([^/]+)/.exec(t)
  if (m) return { kind: m[1], account: m[2], box: m[3] }
  return { kind: 'server', host: t.replace(/^(s?ftps?):\/\//i, '').replace(/[:/].*$/, '') }
}
export const targetLabel = (target) => {
  const p = parseTarget(target)
  return p.kind === 'server' ? p.host : `${p.account}/${p.box}`
}

// The files of a place as one map, with the key style of that place
function boxOf(y, p) {
  if (p.kind === 'server') {
    const x = y?.servers?.[p.host]
    return x && { x, files: x.files, dirs: x.dirs, key: norm, kind: 'server' }
  }
  const acc = y?.storage?.[p.account]
  const box = p.kind === 'blob' ? acc?.containers?.[p.box] : acc?.shares?.[p.box]
  return acc && { x: acc, box, files: box?.blobs ?? box?.files, dirs: p.kind === 'share' ? box?.dirs : null, key: flat, kind: p.kind }
}

// The folders and files right inside `dir`, for the screens and for list()
export function entriesOf(files, dirs, dir, key) {
  const d = key(dir)
  const root = key('')
  const up = (p) => (key === norm ? parent(p) || '/' : parent(p))
  // every folder on the way down is shown, also the virtual folders of blob names
  const all = new Set()
  const climb = (p) => {
    for (let q = p; q !== root && q !== ''; q = up(q)) all.add(q)
  }
  for (const p of dirs ?? []) climb(key(p))
  for (const p of Object.keys(files)) climb(up(key(p)))
  const folders = [...all].filter((p) => up(p) === d).sort().map((path) => ({ path, name: baseName(path), dir: true, size: 0, t: 0 }))
  const list = Object.entries(files).filter(([path]) => up(key(path)) === d).sort(([a], [b]) => a.localeCompare(b)).map(([path, f]) => ({ path, name: baseName(path), dir: false, ...f }))
  return [...folders, ...list]
}
export function listDir(state, target, dir = '/') {
  const b = boxOf(sys(state), parseTarget(target))
  return b?.files ? entriesOf(b.files, b.dirs, dir, b.key) : []
}

const logTo = (x, t, who, op, path, ok, text) => push(x.log, { t, who, op, path, ok, text })

// ---------- servers: SFTP, FTP, FTPS ----------

const errType = (x, name) => `${x.protocol}:${name}`
// Checks the login of a client. Pure. Error texts follow what the connectors log (lab approximations).
export function loginError(state, host, auth = {}) {
  const x = sys(state)?.servers?.[host]
  const port = Number(auth.port ?? x?.port ?? 22)
  // the error type comes from the connector of the client, so auth.protocol names it when it is given
  const proto = auth.protocol ?? x?.protocol ?? 'SFTP'
  if (!x) return fail('unknown-system', `Could not establish ${proto} connection with host: '${host}' at port: '${port}': java.net.UnknownHostException: ${host}`, { type: `${proto}:CONNECTIVITY` })
  if (!x.up || port !== x.port) return fail('connection-refused', `Could not establish ${proto} connection with host: '${host}' at port: '${port}': java.net.ConnectException: Connection refused`, { type: `${proto}:CONNECTIVITY` })
  // a client of another protocol reaches the port, but the greeting of the server is not one it understands
  if (auth.protocol && auth.protocol !== x.protocol)
    return fail('connection-refused', `Could not establish ${proto} connection with host: '${host}' at port: '${port}': the server answered '${x.banner ?? x.protocol}', which is not a ${proto} server. This port runs ${x.protocol}.`, { type: `${proto}:CONNECTIVITY` })
  // SSH checks the key of the server before any login (JSch texts, as the SFTP connector logs them)
  if (x.protocol === 'SFTP' && auth.knownHosts !== undefined && auth.knownHosts !== null && x.hostKey) {
    const keys = knownKeys(auth.knownHosts, host, port)
    const at = port === 22 ? host : `[${host}]:${port}`
    if (!keys.length) return fail('host-key-unknown', `Could not establish SFTP connection with host: '${host}' at port: '${port}': reject HostKey: ${at}`, { type: 'SFTP:CONNECTIVITY' })
    if (!keys.includes(x.hostKey.pub)) return fail('host-key-changed', `Could not establish SFTP connection with host: '${host}' at port: '${port}': HostKey has been changed: ${at}`, { type: 'SFTP:CONNECTIVITY' })
  }
  const u = x.users[auth.user]
  const passOk = u && u.password !== undefined && auth.password !== undefined && auth.password === u.password
  const keyOk = u && x.protocol === 'SFTP' && u.key && auth.key && auth.key === u.key
  // a locked account gets the same answer as a wrong password: the server does not tell the client why
  if ((!passOk && !keyOk) || u?.locked)
    return fail('auth-failed', x.protocol === 'SFTP' ? `Error during login to ${auth.user ?? ''}@${host}: Auth fail` : `Could not login with user '${auth.user ?? ''}' at host '${host}': 530 Login incorrect.`, { type: errType(x, 'CONNECTIVITY'), ...(u?.locked && { locked: true }) })
  return null
}

// ---------- FTP data connections and transfer types ----------

const inDir = (p, d) => {
  const n = norm(d)
  return n === '/' || p === n || p.startsWith(`${n}/`)
}
// where the data connection of a passive transfer goes: the 227 answer names it (h1,h2,h3,h4,p1,p2)
const pasvPort = (x, p) => {
  const r = x.passive ?? { from: 50000, to: 50100 }
  return r.from + (parseInt(hex(`${x.host}${p}`, 4), 16) % Math.max(1, r.to - r.from + 1))
}
export const pasvReply = (x, port) => `227 Entering Passive Mode (${x.ip.replace(/\./g, ',')},${Math.floor(port / 256)},${port % 256})`
// Lab made numbers for a binary file in ASCII mode: about one byte in 256 is a line feed or a CR LF pair, and each
// one changes. To Windows every LF gets a CR, to Unix every CR LF loses its CR.
function asciiCopy(path, f, to) {
  if (isBinary(path, f)) {
    const delta = Math.max(1, Math.floor((f.size ?? 0) / 256))
    return { content: f.content ?? '', size: to === 'windows' ? f.size + delta : Math.max(0, f.size - delta), binary: true, corrupt: true, sizeBefore: f.sizeBefore ?? f.size }
  }
  const text = String(f.content ?? '')
  const out = to === 'windows' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n')
  return { content: out, size: Math.max(0, (f.size ?? text.length) - text.length + out.length) }
}
// The error a reader of a damaged file gives (Java texts of java.util.zip, Apache POI and PDFBox)
export function parseError(path, f) {
  const ext = extOf(path)
  const crc = (n) => `0x${hex(`${path}/${f?.size}/${n}`, 8)}`
  if (['zip', 'jar', 'gz', 'tgz', '7z'].includes(ext)) return `java.util.zip.ZipException: invalid entry CRC (expected ${crc(1)} but got ${crc(2)})`
  if (['xlsx', 'docx', 'pptx'].includes(ext)) return `org.apache.poi.openxml4j.exceptions.NotOfficeXmlFileException: No valid entries or contents found, this is not a valid OOXML (Office Open XML) file. Caused by java.util.zip.ZipException: invalid entry CRC (expected ${crc(1)} but got ${crc(2)})`
  if (ext === 'pdf') return 'java.io.IOException: Missing root object specification in trailer.'
  return `The file is damaged: ${f?.size} bytes, it was ${f?.sizeBefore ?? '?'} bytes before the ASCII transfer`
}

// origin: 'cloud' (a CloudHub app), 'onprem' (an app on the company's own servers) or 'desktop' (the SFTP client)
function serverClient(s, x, auth, who, origin = 'cloud') {
  const t = () => s.clock ?? 0
  const u = () => x.users[auth.user]
  const wd = () => norm(auth.workingDir ?? u()?.home ?? '/')
  const at = (p) => norm(String(p ?? '').startsWith('/') ? p : `${wd()}/${p ?? ''}`)
  const jailed = (p) => {
    const home = norm(u().home ?? '/')
    return home !== '/' && p !== home && !p.startsWith(`${home}/`)
  }
  const ftp = x.protocol !== 'SFTP'
  const cmd = (sftp, ftpCmd) => (ftp ? ftpCmd : sftp)
  // the client's own line endings: the SFTP client runs on Windows, Mule runtimes on Linux
  const os = origin === 'desktop' ? 'windows' : 'unix'
  const login = () => {
    const e = loginError(s, x.host, auth)
    if (e) logTo(x, t(), who, 'login', '', false, e.kind === 'auth-failed' ? `Failed login for ${auth.user ?? '(no user)'}${e.locked ? ' (account locked)' : ''}` : e.kind.startsWith('host-key') ? `${auth.user ?? 'client'} closed the connection: the host key is not the one it knows` : `Refused for ${auth.user ?? '(no user)'}`)
    return e
  }
  const denied = (op, p) => {
    logTo(x, t(), who, op, p, false, `${auth.user} ${op} ${p}: Permission denied`)
    return fail('permission-denied', `Permission denied for '${p}'`, { type: errType(x, 'ACCESS_DENIED') })
  }
  // Mule 4 raises ILLEGAL_PATH for a path that is not there; FILE_DOESNT_EXIST is for a write whose folder is missing
  const missing = (op, p, name = 'ILLEGAL_PATH') => {
    logTo(x, t(), who, op, p, false, `${auth.user} ${op} ${p}: No such file`)
    return fail('not-found', `Path '${p}' doesn't exist`, { type: errType(x, name) })
  }
  const isDir = (p) => p === '/' || x.dirs.includes(p) || Object.keys(x.files).some((f) => f.startsWith(`${p}/`))
  // folder rights: missing lists mean no limit. A write needs the path to be inside a write folder.
  const mayWrite = (p) => !u().readOnly && (!u().writeDirs || u().writeDirs.some((d) => p !== norm(d) && inDir(p, d)))
  const mayRead = (p) => !u().readDirs || u().readDirs.some((d) => inDir(p, d))
  const onTheWay = (p) => Boolean(u().readDirs) && [...u().readDirs, ...(u().writeDirs ?? [])].some((d) => inDir(norm(d), p))
  // FTP keeps data on a second connection. Lab made: it is opened at once or it times out.
  const data = (op, p, what) => {
    if (!ftp) return null
    if (auth.passive === false) {
      if (origin !== 'cloud' || x.activeBlocked === false) return null
      logTo(x, t(), who, op, p, false, `${auth.user} ${op} ${p}: 425 Failed to establish connection (active mode, could not connect back to the client)`)
      return fail('data-timeout', `Exception was found trying to ${what} '${p}': 425 Failed to establish connection. java.net.SocketTimeoutException: Accept timed out`, { type: errType(x, 'CONNECTIVITY') })
    }
    if (x.passive?.open === false) {
      const port = pasvPort(x, p)
      logTo(x, t(), who, op, p, false, `${auth.user} PASV, ${pasvReply(x, port)}, the data connection on port ${port} never arrived`)
      return fail('data-timeout', `Exception was found trying to ${what} '${p}': java.net.SocketTimeoutException: Connect timed out (data connection to ${x.ip}:${port} from the 227 answer of PASV)`, { type: errType(x, 'CONNECTIVITY') })
    }
    return null
  }
  // the transfer type of an FTP file call: AUTO picks ASCII for the text extensions of FileZilla
  const ascii = (p) => {
    if (!ftp) return false
    const m = String(auth.transferMode ?? 'BINARY').toUpperCase()
    return m === 'ASCII' || (m === 'AUTO' && ASCII_EXT.includes(extOf(p)))
  }
  return {
    list(dir = '.', opts = {}) {
      const e = login()
      if (e) return e
      const p = at(dir)
      const op = cmd('opendir', 'LIST')
      if (jailed(p)) return denied(op, p)
      if (!isDir(p) && p !== '/') return missing(op, p)
      const full = mayRead(p)
      if (!full && !onTheWay(p)) return denied(op, p)
      const d = data(op, p, 'list path')
      if (d) return d
      const files = entriesOf(x.files, x.dirs, p, norm).filter((f) => !(opts.sizeCheck && f.writing) && (full || (f.dir ? mayRead(f.path) || onTheWay(f.path) : mayRead(f.path))))
      logTo(x, t(), who, op, p, true, `${auth.user} ${op} ${p}, ${files.length} entries`)
      return { ok: true, files }
    },
    stat(path) {
      const e = login()
      if (e) return e
      const p = at(path)
      if (jailed(p) || !(mayRead(p) || onTheWay(p))) return denied('stat', p)
      return x.files[p] ? { ok: true, file: { path: p, ...x.files[p] } } : isDir(p) ? { ok: true, file: { path: p, dir: true } } : missing('stat', p)
    },
    read(path, opts = {}) {
      const e = login()
      if (e) return e
      const p = at(path)
      const op = cmd('read', 'RETR')
      if (jailed(p) || !mayRead(p)) return denied(op, p)
      const f = x.files[p]
      if (!f) return isDir(p) ? fail('is-directory', `Path '${p}' is a directory`, { type: errType(x, 'ILLEGAL_PATH') }) : missing(op, p)
      if (f.writing && opts.sizeCheck) {
        logTo(x, t(), who, op, p, false, `${auth.user} ${op} ${p}: size changed during the size check, skipped`)
        return fail('being-written', `File '${p}' is still being written: its size changed between two checks ${opts.sizeCheck} ms apart`)
      }
      const d = data(op, p, 'read file')
      if (d) return d
      const got = ascii(p) ? asciiCopy(p, f, os) : { content: f.content ?? '', size: f.size, ...(f.corrupt && { corrupt: true, sizeBefore: f.sizeBefore }) }
      const binary = isBinary(p, f)
      const corrupt = Boolean(got.corrupt)
      logTo(x, t(), who, op, p, true, `${auth.user} ${op} ${p}, ${f.size} bytes${ftp ? `, ${ascii(p) ? 'ASCII' : 'BINARY'} mode` : ''}${f.writing ? ' (upload not finished)' : ''}`)
      return { ok: true, content: got.content, size: got.size, t: f.t, partial: Boolean(f.writing), binary, corrupt, ...(corrupt && { sizeBefore: got.sizeBefore, parseError: parseError(p, { size: got.size, sizeBefore: got.sizeBefore }) }) }
    },
    // opts.size, opts.binary and opts.corrupt describe what is sent (the client passes them for a local file)
    write(path, content = '', opts = {}) {
      const e = login()
      if (e) return e
      const p = at(path)
      const op = cmd('write', 'STOR')
      const mode = opts.mode ?? (opts.overwrite ? 'OVERWRITE' : 'CREATE_NEW')
      if (jailed(p) || !mayWrite(p)) return denied(op, p)
      if (!isDir(parent(p) || '/') && !opts.createParent) return missing(op, parent(p) || '/', 'FILE_DOESNT_EXIST')
      if (!x.files[p] && isDir(p)) return fail('is-directory', `Path '${p}' is a directory`, { type: errType(x, 'ILLEGAL_PATH') })
      const old = x.files[p]
      if (old && mode === 'CREATE_NEW') {
        logTo(x, t(), who, op, p, false, `${auth.user} ${op} ${p}: file exists`)
        return fail('already-exists', `'${p}' already exists. Set the 'overwrite' parameter to 'true' to perform the operation anyway`, { type: errType(x, 'FILE_ALREADY_EXISTS') })
      }
      const d = data(op, p, 'write file')
      if (d) return d
      const text = mode === 'APPEND' && old ? `${old.content ?? ''}${content}` : String(content)
      const binary = opts.binary ?? isBinaryName(p)
      const sent = { content: text, size: opts.size ?? text.length, ...(binary && { binary: true }), ...(opts.corrupt && { corrupt: true, sizeBefore: opts.sizeBefore }) }
      const got = ascii(p) ? { ...sent, ...asciiCopy(p, sent, 'unix') } : sent
      if (opts.createParent) addDirs(x.dirs, parent(p))
      x.files[p] = fileRec(got.content, { t: t(), owner: auth.user, size: got.size, ...(got.binary && { binary: true }), ...(got.corrupt && { corrupt: true, sizeBefore: got.sizeBefore }) })
      logTo(x, t(), who, op, p, true, `${auth.user} ${op} ${p}, ${x.files[p].size} bytes${ftp ? `, ${ascii(p) ? 'ASCII' : 'BINARY'} mode` : ''}`)
      return { ok: true, size: x.files[p].size }
    },
    mkdir(path) {
      const e = login()
      if (e) return e
      const p = at(path)
      const op = cmd('mkdir', 'MKD')
      if (jailed(p) || !mayWrite(p)) return denied(op, p)
      if (isDir(p) || x.files[p]) return fail('already-exists', `'${p}' already exists`, { type: errType(x, 'FILE_ALREADY_EXISTS') })
      addDirs(x.dirs, p)
      logTo(x, t(), who, op, p, true, `${auth.user} ${op} ${p}`)
      return { ok: true }
    },
    move(from, to, opts = {}) {
      const e = login()
      if (e) return e
      const a = at(from)
      let b = at(to)
      const op = cmd('rename', 'RNFR/RNTO')
      if (jailed(a) || jailed(b) || !mayWrite(a)) return denied(op, a)
      if (!x.files[a]) return missing(op, a)
      // a folder as target keeps the name, like the move operation. A target that ends with / names a folder, so
      // it must exist (or be made with createParent): it is never taken as the new name of the file.
      const folder = /[/\\]$/.test(String(to ?? ''))
      if (folder && !isDir(b) && opts.createParent && !x.files[b]) addDirs(x.dirs, b)
      if (folder && !isDir(b)) return missing(op, b)
      if (isDir(b)) b = norm(`${b}/${baseName(a)}`)
      if (jailed(b) || !mayWrite(b)) return denied(op, b)
      if (!isDir(parent(b) || '/')) {
        if (!opts.createParent) return missing(op, parent(b) || '/')
        addDirs(x.dirs, parent(b))
      }
      if (a === b) return { ok: true, path: b }
      if (x.files[b] && !opts.overwrite) return fail('already-exists', `'${b}' already exists. Set the 'overwrite' parameter to 'true' to perform the operation anyway`, { type: errType(x, 'FILE_ALREADY_EXISTS') })
      x.files[b] = { ...x.files[a], t: x.files[a].t }
      delete x.files[a]
      logTo(x, t(), who, op, a, true, `${auth.user} ${op} ${a} to ${b}`)
      return { ok: true, path: b }
    },
    remove(path) {
      const e = login()
      if (e) return e
      const p = at(path)
      const op = cmd('remove', 'DELE')
      if (jailed(p) || !mayWrite(p)) return denied(op, p)
      if (!x.files[p]) return missing(op, p)
      delete x.files[p]
      logTo(x, t(), who, op, p, true, `${auth.user} ${op} ${p}`)
      return { ok: true }
    },
  }
}
const addDirs = (dirs, dir) => {
  const parts = norm(dir).split('/').filter(Boolean)
  for (let i = 1; i <= parts.length; i++) {
    const d = norm(parts.slice(0, i).join('/'))
    if (!dirs.includes(d)) dirs.push(d)
  }
}

// ---------- Azure Storage: blobs and file shares ----------

// Checks a request to a storage account. `need` is one SAS letter (r, a, c, w, d, l) or a list where one is enough.
// Pure. The codes and messages are the ones Azure Storage returns.
export function storageError(state, account, auth = {}, { service = 'blob', box, need = 'r' } = {}) {
  const acc = sys(state)?.storage?.[account]
  if (!acc) return fail('unknown-system', `getaddrinfo ENOTFOUND ${account}.${service === 'share' ? 'file' : 'blob'}.core.windows.net`, { status: null, code: 'ENOTFOUND' })
  if (!acc.up) return az(503, 'ServerBusy', 'The server is currently unable to receive requests. Please retry your request.', 'connection-refused')
  const ip = auth.ip ?? DEFAULT_EGRESS
  if (acc.network.mode === 'Disabled' || (acc.network.mode === 'Selected networks' && !acc.network.ips.some((r) => inRange(ip, r))))
    return az(403, 'AuthorizationFailure', `This request is not authorized to perform this operation. The client IP ${ip} is not allowed by the network rules.`, 'network-blocked')
  if (auth.key !== undefined) {
    if (auth.key === acc.keys.key1 || auth.key === acc.keys.key2) return null
    return az(403, 'AuthenticationFailed', 'Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature.', 'auth-failed')
  }
  if (!auth.sas) return az(404, 'ResourceNotFound', 'The specified resource does not exist. (An anonymous request to a private container gets this answer.)', 'no-auth')
  const token = String(auth.sas).replace(/^\?/, '')
  const sas = acc.sas.find((x) => x.token === token)
  if (!sas || sas.signedWith !== acc.keys[sas.key]) return az(403, 'AuthenticationFailed', 'Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature. Signature did not match.', 'auth-failed')
  const now = state.clock ?? 0
  if (now > sas.expires || now < (sas.start ?? -Infinity))
    return az(403, 'AuthenticationFailed', `Server failed to authenticate the request. Signature not valid in the specified time frame: Start [${sas.start ?? 'none'}], Expiry [${sas.expires}], Current [${now}]`, 'sas-expired')
  if (!sas.services.includes(service === 'share' ? 'f' : 'b') || (sas.box && sas.box !== box)) return az(403, 'AuthorizationResourceTypeMismatch', 'This request is not authorized to perform this operation using this resource type.', 'permission-denied')
  const needs = [].concat(need)
  if (!needs.some((p) => sas.perms.includes(p))) return az(403, 'AuthorizationPermissionMismatch', 'This request is not authorized to perform this operation using this permission.', 'permission-denied')
  return null
}

function storageClient(s, p, auth, who) {
  const t = () => s.clock ?? 0
  const service = p.kind
  const acc = () => s.systems.storage[p.account]
  const box = () => (service === 'blob' ? acc().containers[p.box] : acc().shares[p.box])
  const files = () => (service === 'blob' ? box().blobs : box().files)
  const names = service === 'blob' ? { list: 'List Blobs', read: 'Get Blob', write: 'Put Blob', remove: 'Delete Blob', move: 'Copy Blob, then Delete Blob' } : { list: 'List Directories and Files', read: 'Get File', write: 'Create File, Put Range', remove: 'Delete File', move: 'Rename File' }
  const check = (op, need) => {
    const e = storageError(s, p.account, auth, { service, box: p.box, need })
    if (e) {
      if (acc()) logTo(acc(), t(), who, names[op], p.box, false, `${names[op]} on ${p.box}: ${e.status ?? ''} ${e.code}`)
      return e
    }
    if (!box()) {
      logTo(acc(), t(), who, names[op], p.box, false, `${names[op]} on ${p.box}: 404`)
      return service === 'blob' ? az(404, 'ContainerNotFound', 'The specified container does not exist.', 'not-found') : az(404, 'ShareNotFound', 'The specified share does not exist.', 'not-found')
    }
    return null
  }
  const gone = (op, path) => {
    logTo(acc(), t(), who, names[op], `${p.box}/${path}`, false, `${names[op]} ${p.box}/${path}: 404`)
    return service === 'blob' ? az(404, 'BlobNotFound', 'The specified blob does not exist.', 'not-found') : az(404, 'ResourceNotFound', 'The specified resource does not exist.', 'not-found')
  }
  const ok = (op, path, text) => logTo(acc(), t(), who, names[op], `${p.box}/${path}`, true, text)
  const etag = () => `"0x8DD${hex(`${p.account}${next(s.systems)}`, 11).toUpperCase()}"`
  return {
    list(dir = '', opts = {}) {
      const e = check('list', 'l')
      if (e) return e
      const list = entriesOf(files(), box().dirs, dir, flat).filter((f) => !(opts.sizeCheck && f.writing))
      ok('list', flat(dir), `${names.list} ${p.box}/${flat(dir)}, ${list.length} entries`)
      return { ok: true, files: list }
    },
    stat(path) {
      const e = check('read', ['r', 'l'])
      if (e) return e
      const f = files()[flat(path)]
      return f ? { ok: true, file: { path: flat(path), ...f } } : gone('read', flat(path))
    },
    read(path, opts = {}) {
      const e = check('read', 'r')
      if (e) return e
      const k = flat(path)
      const f = files()[k]
      if (!f) return gone('read', k)
      if (f.tier === 'Archive') {
        logTo(acc(), t(), who, names.read, `${p.box}/${k}`, false, `${names.read} ${p.box}/${k}: 409 BlobArchived`)
        return az(409, 'BlobArchived', 'This operation is not permitted on an archived blob.', 'archived')
      }
      if (f.writing && opts.sizeCheck) return fail('being-written', `File '${k}' is still being written: its size changed between two checks ${opts.sizeCheck} ms apart`, { status: null, code: null })
      ok('read', k, `${names.read} ${p.box}/${k}, ${f.size} bytes`)
      return { ok: true, content: f.content ?? '', size: f.size, t: f.t, partial: Boolean(f.writing) }
    },
    write(path, content = '', opts = {}) {
      const k = flat(path)
      const exists = () => box() && files()[k]
      const e = check('write', box() && exists() ? 'w' : ['c', 'w'])
      if (e) return e
      if (exists() && (opts.mode === 'CREATE_NEW' || opts.overwrite === false)) {
        logTo(acc(), t(), who, names.write, `${p.box}/${k}`, false, `${names.write} ${p.box}/${k}: 409`)
        return service === 'blob' ? az(409, 'BlobAlreadyExists', 'The specified blob already exists.', 'already-exists') : az(409, 'ResourceAlreadyExists', 'The specified resource already exists.', 'already-exists')
      }
      if (service === 'share' && !box().dirs.includes(parent(k))) {
        if (!opts.createParent) return az(404, 'ParentNotFound', 'The specified parent path does not exist.', 'not-found')
        addFlatDirs(box().dirs, parent(k))
      }
      const old = files()[k]
      const text = opts.mode === 'APPEND' && old ? `${old.content ?? ''}${content}` : String(content)
      // a blob upload is committed at once (Put Blob or Put Block List), so a blob is never seen half written
      files()[k] = fileRec(text, { t: t(), owner: who, mode: undefined, ...(service === 'blob' && { tier: old?.tier && old.tier !== 'Archive' ? old.tier : 'Hot', etag: etag() }), ...(opts.size !== undefined && { size: opts.size }) })
      ok('write', k, `${names.write} ${p.box}/${k}, ${files()[k].size} bytes`)
      return { ok: true, size: files()[k].size }
    },
    move(from, to, opts = {}) {
      const a = flat(from)
      const b = flat(to)
      const e = check('move', 'r') ?? check('move', 'd') ?? check('move', ['c', 'w'])
      if (e) return e
      if (!files()[a]) return gone('move', a)
      if (a === b) return { ok: true, path: b }
      if (files()[b] && !opts.overwrite) return service === 'blob' ? az(409, 'BlobAlreadyExists', 'The specified blob already exists.', 'already-exists') : az(409, 'ResourceAlreadyExists', 'The specified resource already exists.', 'already-exists')
      if (service === 'share') addFlatDirs(box().dirs, parent(b))
      files()[b] = { ...files()[a], ...(service === 'blob' && { etag: etag(), t: t() }) }
      delete files()[a]
      ok('move', a, `${names.move} ${p.box}/${a} to ${b}`)
      return { ok: true, path: b }
    },
    // blob folders are virtual, so only a file share makes one (Create Directory)
    mkdir(path) {
      const e = check('write', ['c', 'w'])
      if (e) return e
      if (service === 'share') addFlatDirs(box().dirs, flat(path))
      return { ok: true }
    },
    remove(path) {
      const k = flat(path)
      const e = check('remove', 'd')
      if (e) return e
      if (!files()[k]) return gone('remove', k)
      delete files()[k]
      ok('remove', k, `${names.remove} ${p.box}/${k}`)
      return { ok: true }
    },
  }
}
const addFlatDirs = (dirs, dir) => {
  const parts = flat(dir).split('/').filter(Boolean)
  for (let i = 1; i <= parts.length; i++) {
    const d = parts.slice(0, i).join('/')
    if (!dirs.includes(d)) dirs.push(d)
  }
}

// ---------- Azure Key Vault ----------

const allowedIn = (v, principal) => (v.model === ACCESS_MODELS[1] ? [...new Set((v.roles[principal] ?? []).flatMap((r) => VAULT_ROLES[r] ?? []))] : (v.access[principal] ?? []))
export const vaultPerms = (v, principal) => allowedIn(v, principal)

// Checks one operation on a vault. Pure.
export function vaultError(state, vault, principal, perm, ip = DEFAULT_EGRESS) {
  const v = sys(state)?.vaults?.[vault]
  if (!v) return fail('unknown-system', `getaddrinfo ENOTFOUND ${vault}.vault.azure.net`, { status: null, code: 'ENOTFOUND' })
  if (!v.up) return az(503, 'ServiceUnavailable', 'The service is unavailable. Retry the request later.', 'connection-refused')
  if (v.network.mode === 'Disabled' || (v.network.mode === 'Selected networks' && !v.network.ips.some((r) => inRange(ip, r))))
    return az(403, 'ForbiddenByFirewall', `Client address is not authorized and caller is not a trusted service. Client address: ${ip}`, 'network-blocked')
  if (!allowedIn(v, principal).includes(perm)) {
    const action = { get: 'getSecret/action', list: 'readMetadata/action', set: 'setSecret/action', delete: 'delete' }[perm] ?? perm
    if (v.model === ACCESS_MODELS[1])
      return az(403, 'ForbiddenByRbac', `Caller is not authorized to perform action on resource. Caller: appid=${principal}. Action: 'Microsoft.KeyVault/vaults/secrets/${action}'. Resource: '${vault}'.`, 'permission-denied')
    return az(403, 'ForbiddenByPolicy', `The user, group or application 'appid=${principal}' does not have secrets ${perm} permission on key vault '${vault};location=${v.region.toLowerCase().replace(/ /g, '')}'.`, 'permission-denied')
  }
  return null
}

export const latestVersion = (secret) => secret?.versions.at(-1)
export const secretUri = (vault, name, id) => `https://${vault}.vault.azure.net/secrets/${name}${id ? `/${id}` : ''}`

function vaultClient(s, vault, principal, ip) {
  const t = () => s.clock ?? 0
  const v = () => s.systems?.vaults?.[vault]
  const note = (op, name, ok, text) => v() && logTo(v(), t(), principal, op, name, ok, text)
  const deny = (op, name, e) => {
    note(op, name, false, `${op} ${name ?? ''}: ${e.status ?? ''} ${e.code}`)
    return e
  }
  return {
    get(name, version) {
      const e = vaultError(s, vault, principal, 'get', ip)
      if (e) return deny('SecretGet', name, e)
      const sec = v().secrets[name]
      const ver = version ? sec?.versions.find((x) => x.id === version) : latestVersion(sec)
      if (!ver) return deny('SecretGet', name, az(404, 'SecretNotFound', `A secret with (name/id) ${name}${version ? `/${version}` : ''} was not found in this key vault. If you recently deleted this secret you may be able to recover it using the correct recovery command.`, 'not-found'))
      // a get never looks back to an older version: the current version decides
      if (!ver.enabled) return deny('SecretGet', name, az(403, 'Forbidden', 'Operation get is not allowed on a disabled secret.', 'disabled'))
      const now = t()
      note('SecretGet', name, true, `SecretGet ${name}/${ver.id.slice(0, 8)}`)
      // exp and nbf are informational for secrets: get still answers, so the result only flags them
      return { ok: true, value: ver.value, version: ver.id, id: secretUri(vault, name, ver.id), contentType: ver.contentType ?? null, expired: ver.expires !== undefined && ver.expires !== null && now >= ver.expires, notYet: ver.notBefore !== undefined && ver.notBefore !== null && now < ver.notBefore }
    },
    list() {
      const e = vaultError(s, vault, principal, 'list', ip)
      if (e) return deny('SecretList', '', e)
      const list = Object.entries(v().secrets).map(([name, sec]) => ({ name, enabled: latestVersion(sec)?.enabled ?? false, updated: latestVersion(sec)?.created ?? 0, contentType: latestVersion(sec)?.contentType ?? null }))
      note('SecretList', '', true, `SecretList, ${list.length} secrets`)
      return { ok: true, secrets: list }
    },
    set(name, value, opts = {}) {
      const e = vaultError(s, vault, principal, 'set', ip)
      if (e) return deny('SecretSet', name, e)
      const id = addVersion(s.systems, v(), name, value, t(), opts)
      note('SecretSet', name, true, `SecretSet ${name}, new version ${id.slice(0, 8)}`)
      return { ok: true, version: id }
    },
  }
}
function addVersion(y, v, name, value, now, { expires, notBefore, contentType, enabled = true } = {}) {
  const id = hex(`${v.name}/${name}/${next(y)}`)
  v.secrets[name] ??= { versions: [] }
  v.secrets[name].versions.push({ id, value: String(value), created: now, enabled, ...(expires !== undefined && expires !== null && { expires }), ...(notBefore !== undefined && { notBefore }), ...(contentType && { contentType }) })
  return id
}

// ---------- the ctx hook for packages ----------

// The engine calls this for each run of an app with its draft state: calls change `s` in place.
export function systemsCtx(s, app) {
  const who = app?.name ?? 'app'
  const egress = app?.props?.['egress.ip'] ?? app?.outboundIp ?? DEFAULT_EGRESS // outboundIp: from the network engine, set by ctxOf in platform.js when state.network exists
  // where the client runs: the SFTP client of the learner, an app on the company's own servers, or CloudHub
  const origin = app?.desktop ? 'desktop' : app?.targetType ? 'onprem' : 'cloud'
  const empty = (target) => ({ list: () => none(target), stat: () => none(target), read: () => none(target), write: () => none(target), move: () => none(target), remove: () => none(target), mkdir: () => none(target) })
  const none = (target) => {
    const p = parseTarget(target)
    return p.kind === 'server' ? loginError(s, p.host, {}) : storageError(s, p.account, {}, { service: p.kind, box: p.box })
  }
  return {
    files(target, auth = {}) {
      const p = parseTarget(target)
      if (!s.systems) return empty(target)
      if (p.kind === 'server') {
        const x = s.systems.servers?.[p.host]
        return x ? serverClient(s, x, auth, who, origin) : empty(target)
      }
      return s.systems.storage?.[p.account] ? storageClient(s, p, { ip: egress, ...auth }, who) : empty(target)
    },
    vault: (name, { principal = who, ip = egress } = {}) => vaultClient(s, name, principal, ip),
    secret: (vault, name, version, { principal = who, ip = egress } = {}) => vaultClient(s, vault, principal, ip).get(name, version),
  }
}

// ---------- UI actions (pure: state in, new state out) ----------

// Files of any place, by target. The portal and the SFTP client act as an administrator, so no login is checked.
const who0 = 'you'
export const putFile = (state, target, path, content = '', opts = {}) =>
  edit(state, (s, y, now) => {
    const p = parseTarget(target)
    const b = boxOf(y, p)
    if (!b?.files) return
    const k = b.key(path)
    if (p.kind === 'server') addDirs(b.dirs, parent(k) || '/')
    else if (p.kind === 'share') addFlatDirs(b.dirs, parent(k))
    const text = String(content)
    // opts.writing leaves the upload unfinished: only the first part is there, the size keeps changing.
    // A blob is committed at once, so it is never half written.
    const writing = Boolean(opts.writing) && p.kind !== 'blob'
    // opts.part: how many characters are there so far (default a third)
    const given = opts.part !== undefined && opts.part !== null
    const cut = given ? Math.min(text.length, Math.max(0, Math.floor(Number(opts.part) || 0))) : Math.max(1, Math.floor(text.length / 3))
    const part = writing ? text.slice(0, cut) : text
    b.files[k] = fileRec(part, {
      t: now, owner: opts.owner ?? 'you', mode: p.kind === 'server' ? '-rw-r--r--' : undefined,
      ...(writing && { writing: true, rest: text.slice(part.length), full: opts.size ?? text.length, size: opts.size ? Math.floor(given ? (opts.size * part.length) / Math.max(1, text.length) : opts.size / 3) : part.length }),
      ...(p.kind === 'blob' && { tier: opts.tier ?? 'Hot', etag: `"0x8DD${hex(`${k}${next(y)}`, 11).toUpperCase()}"` }),
      ...(!writing && opts.size !== undefined && { size: opts.size }),
      ...((opts.binary ?? isBinaryName(k)) && { binary: true }),
    })
    logTo(b.x, now, opts.who ?? who0, 'upload', `${p.kind === 'server' ? '' : `${p.box}/`}${k}`, true, `Upload ${k}, ${b.files[k].size} bytes${b.files[k].writing ? ', still being written' : ''}`)
  })
export const finishWrite = (state, target, path) =>
  edit(state, (s, y, now) => {
    const b = boxOf(y, parseTarget(target))
    const f = b?.files?.[b.key(path)]
    if (!f?.writing) return
    Object.assign(f, { content: `${f.content ?? ''}${f.rest ?? ''}`, size: f.full ?? f.size, t: now })
    delete f.writing
    delete f.rest
    delete f.full
    logTo(b.x, now, who0, 'upload', b.key(path), true, `Upload of ${b.key(path)} finished, ${f.size} bytes`)
  })
export const removeFile = (state, target, path) =>
  edit(state, (s, y, now) => {
    const b = boxOf(y, parseTarget(target))
    if (!b?.files) return
    const k = b.key(path)
    if (b.files[k]) delete b.files[k]
    else if (b.dirs && k !== b.key('') && b.dirs.includes(k) && ![...Object.keys(b.files), ...b.dirs].some((f) => b.key(f).startsWith(`${k}/`))) b.dirs.splice(b.dirs.indexOf(k), 1)
    else return
    logTo(b.x, now, who0, 'delete', k, true, `Delete ${k}`)
  })
export const moveFile = (state, target, from, to) =>
  edit(state, (s, y, now) => {
    const p = parseTarget(target)
    const b = boxOf(y, p)
    const a = b?.key(from)
    if (!b?.files?.[a]) return
    let k = b.key(to)
    // a target that ends with / is a folder, made when it is missing
    if (b.dirs?.includes(k) || /[/\\]$/.test(String(to ?? ''))) k = b.key(`${k}/${baseName(a)}`)
    if (k === a) return
    if (p.kind === 'server') addDirs(b.dirs, parent(k) || '/')
    else if (p.kind === 'share') addFlatDirs(b.dirs, parent(k))
    b.files[k] = { ...b.files[a], t: p.kind === 'blob' ? now : b.files[a].t }
    delete b.files[a]
    logTo(b.x, now, who0, 'move', a, true, `Move ${a} to ${k}`)
  })
export const makeDir = (state, target, path) =>
  edit(state, (s, y, now) => {
    const p = parseTarget(target)
    const b = boxOf(y, p)
    if (!b?.dirs) return // blob folders are virtual: they exist while a blob name has them
    if (p.kind === 'server') addDirs(b.dirs, path)
    else addFlatDirs(b.dirs, path)
    logTo(b.x, now, who0, 'mkdir', b.key(path), true, `Create folder ${b.key(path)}`)
  })
// kind: 'server' | 'storage' | 'vault'
export const setSystemUp = (state, kind, name, up) =>
  edit(state, (s, y, now) => {
    const x = { server: y.servers, storage: y.storage, vault: y.vaults }[kind]?.[name]
    if (!x) return
    x.up = up
    logTo(x, now, who0, up ? 'start' : 'stop', '', true, up ? 'Service started' : 'Service stopped')
  })
// patch: { password, key, home, readOnly, locked, readDirs, writeDirs }; a field set to undefined is removed (for
// readDirs and writeDirs that means no limit), null as patch removes the user. opts.who names the admin in the log.
export const setServerUser = (state, host, user, patch, opts = {}) =>
  edit(state, (s, y, now) => {
    const x = y.servers[host]
    if (!x) return
    if (patch === null) {
      delete x.users[user]
      if (opts.who) logTo(x, now, opts.who, 'admin', user, true, `User ${user} removed`)
      return
    }
    const old = x.users[user] ?? {}
    const u = { home: '/', ...old }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete u[k]
      else u[k] = ['home'].includes(k) ? norm(v) : ['readDirs', 'writeDirs'].includes(k) ? [...new Set(v.map(norm))] : v
    }
    x.users[user] = u
    const say = { password: () => 'new password', key: (v) => (v ? `key ${v}` : 'no key'), home: (v) => `home ${v}`, readOnly: (v) => (v ? 'read only' : 'not read only'), locked: (v) => (v ? 'locked' : 'unlocked'), readDirs: (v) => `read ${v ? v.join(', ') || 'nothing' : 'everywhere'}`, writeDirs: (v) => `write ${v ? v.join(', ') || 'nothing' : 'everywhere'}` }
    const changed = Object.keys(patch).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(u[k]))
    if (opts.who && (opts.text || changed.length)) logTo(x, now, opts.who, 'admin', user, true, opts.text ?? `User ${user} changed: ${changed.map((k) => (say[k] ?? ((v) => `${k} ${v}`))(u[k])).join('; ')}`)
  })
const ADMIN = 'admin'
// fields: { password?, key?, home = '/', readOnly?, readDirs?, writeDirs? }. The home folder is made when it is missing.
export const addServerUser = (state, host, user, fields = {}) => {
  const x = sys(state)?.servers?.[host]
  if (!x || !String(user ?? '').trim() || x.users[user]) return state
  const home = norm(fields.home ?? '/')
  const made = edit(state, (s, y) => addDirs(y.servers[host].dirs, home))
  return setServerUser(made, host, user, { ...fields, home }, { who: ADMIN, text: `User ${user} added, home ${home}` })
}
export const lockServerUser = (state, host, user, locked = true) => setServerUser(state, host, user, { locked: locked || undefined }, { who: ADMIN, text: `User ${user} ${locked ? 'locked' : 'unlocked'}` })
export const setUserPassword = (state, host, user, password) => setServerUser(state, host, user, { password }, { who: ADMIN, text: `New password for ${user}` })
// key: the name of an identity file on the client computer (lab made: the server keeps its public part)
export const setUserKey = (state, host, user, key) => setServerUser(state, host, user, { key: key || undefined }, { who: ADMIN, text: key ? `New public key for ${user}, from ${key}` : `Public key of ${user} removed` })
// A new key pair: the private part lands on the client computer, the public part on the server. { state, file }
export function newUserKey(state, host, user) {
  if (!sys(state)?.servers?.[host]?.users?.[user]) return { state, file: null }
  const file = `${user}-${hex(`${host}/${user}/${state.systems.n ?? 1}`, 6)}.pem`
  const withFile = edit(state, (s, y, now) => {
    next(y)
    y.local.files[file] = fileRec('-----BEGIN LAB KEY FILE-----\n(practice key file, not a real key)\n-----END LAB KEY FILE-----\n', { t: now })
  })
  return { state: setUserKey(withFile, host, user, file), file }
}
// patch: { activeBlocked, passive: { from, to, open }, port, ip, banner }
export const setServerSettings = (state, host, patch) =>
  edit(state, (s, y, now) => {
    const x = y.servers[host]
    if (!x) return
    if (patch.passive) {
      const r = { ...(x.passive ?? { from: 50000, to: 50100, open: true }), ...patch.passive }
      r.from = Math.max(1024, Math.min(65535, Math.floor(Number(r.from) || 50000)))
      r.to = Math.max(r.from, Math.min(65535, Math.floor(Number(r.to) || r.from)))
      x.passive = r
    }
    for (const k of ['activeBlocked', 'port', 'ip', 'banner']) if (patch[k] !== undefined) x[k] = patch[k]
    logTo(x, now, ADMIN, 'admin', '', true, `Settings: ${Object.entries(patch).map(([k, v]) => (k === 'passive' ? `passive ports ${x.passive.from} to ${x.passive.to}, ${x.passive.open ? 'open' : 'closed'} on the firewall` : `${k} ${v}`)).join('; ')}`)
  })
// A rebuilt server has a new host key: every client that pinned the old one refuses to connect
export const regenerateHostKey = (state, host, opts = {}) =>
  edit(state, (s, y, now) => {
    const x = y.servers[host]
    if (x?.protocol !== 'SFTP') return
    x.hostKey = newHostKey(`${host}/${opts.seed ?? next(y)}`)
    logTo(x, now, opts.who ?? ADMIN, 'admin', '', true, `New host key ${x.hostKey.type} ${fingerprint(x.hostKey.pub)}`)
  })
// The trusted host keys of the SFTP client (FileZilla keeps them in its trustedkeys list). pub null forgets the host.
export const trustHostKey = (state, host, pub) =>
  edit(state, (s, y) => {
    y.local.knownHosts ??= {}
    if (pub) y.local.knownHosts[host] = pub
    else delete y.local.knownHosts[host]
  })
// network: { mode: 'All networks'|'Selected networks'|'Disabled', ips: [] }
export const setNetwork = (state, kind, name, network, opts = {}) =>
  edit(state, (s, y, now) => {
    const x = kind === 'vault' ? y.vaults[name] : y.storage[name]
    if (!x) return
    x.network = { ...x.network, ...network }
    logTo(x, now, opts.who ?? who0, 'Update Networking', '', true, `Public network access: ${x.network.mode}${x.network.mode === 'Selected networks' ? `, ${(x.network.ips ?? []).join(', ') || 'no address'}` : ''}`)
  })

// The SFTP client: a connection log line, and transfers between the local computer and a server
export const clientLog = (state, host, text, ok = true) => edit(state, (s, y, now) => y.servers[host] && logTo(y.servers[host], now, 'FileZilla', 'session', '', ok, text))
export const putLocal = (state, name, content, opts = {}) => edit(state, (s, y, now) => void (y.local.files[name] = fileRec(String(content), { t: now, ...(opts.size !== undefined && { size: opts.size }), ...((opts.binary ?? isBinaryName(name)) && { binary: true }) })))
export const removeLocal = (state, name) => edit(state, (s, y) => void delete y.local.files[name])
// Upload a local file with the login of the client. The result keeps the error for the transfer queue, and
// `result` the answer of the read or write (size, corrupt, parseError).
// auth may also carry passive and transferMode ('AUTO' | 'ASCII' | 'BINARY'), as the site manager of the client sets them.
export function transfer(state, { direction, host, auth, local, remote }) {
  let error = null
  let result = null
  const after = edit(state, (s, y, now) => {
    const c = systemsCtx(s, { name: auth.user ?? 'client', desktop: true }).files(host, auth)
    if (direction === 'upload') {
      const f = y.local.files[local]
      result = f ? c.write(remote, f.content ?? '', { overwrite: true, size: f.size, binary: isBinary(local, f), corrupt: f.corrupt, sizeBefore: f.sizeBefore }) : { ok: false, error: `${local} is not on this computer` }
    } else {
      result = c.read(remote)
      if (result.ok) y.local.files[local] = fileRec(result.content, { t: now, size: result.size, ...(result.binary && { binary: true }), ...(result.corrupt && { corrupt: true, sizeBefore: result.sizeBefore }) })
    }
    error = result.ok ? null : result.error
    push(y.transfers, { id: next0(y), t: now, direction, host, local, remote, ok: !error, error, user: auth.user ?? null, ...(result.ok && { size: result.size }), ...(result.corrupt && { corrupt: true }) })
  })
  return { state: after, error, result }
}
const next0 = (y) => `tr${next(y)}`
// Any file call with the login of the client (delete, rename, new folder...): { state, result }. The checks are the
// same as for an app, so a read only user of the client cannot delete either.
export function clientDo(state, target, auth, fn, who = 'FileZilla') {
  let result = null
  const after = edit(state, (s) => void (result = fn(systemsCtx(s, { name: who, desktop: true }).files(target, auth))))
  return { state: after, result }
}

// Storage accounts
export const addContainer = (state, account, name, access = 'Private') =>
  edit(state, (s, y, now) => {
    const acc = y.storage[account]
    if (!acc || acc.containers[name]) return
    acc.containers[name] = newContainer({}, { access, created: now })
    logTo(acc, now, who0, 'Create Container', name, true, `Create Container ${name}`)
  })
export const removeContainer = (state, account, name) =>
  edit(state, (s, y, now) => {
    const acc = y.storage[account]
    if (!acc?.containers[name]) return
    delete acc.containers[name]
    logTo(acc, now, who0, 'Delete Container', name, true, `Delete Container ${name}`)
  })
export const addShare = (state, account, name, quota = 100) =>
  edit(state, (s, y, now) => {
    const acc = y.storage[account]
    if (!acc || acc.shares[name]) return
    acc.shares[name] = newShare({}, { quota, created: now })
    logTo(acc, now, who0, 'Create Share', name, true, `Create Share ${name}`)
  })
export const removeShare = (state, account, name) =>
  edit(state, (s, y, now) => {
    const acc = y.storage[account]
    if (!acc?.shares[name]) return
    delete acc.shares[name]
    logTo(acc, now, who0, 'Delete Share', name, true, `Delete Share ${name}`)
  })
// Moving a blob to Archive takes it offline; moving it back (rehydration) takes hours in Azure and is instant in the lab
export const setTier = (state, account, container, blob, tier) =>
  edit(state, (s, y, now) => {
    const f = y.storage[account]?.containers[container]?.blobs[blob]
    if (!f || !TIERS.includes(tier)) return
    f.tier = tier
    logTo(y.storage[account], now, who0, 'Set Blob Tier', `${container}/${blob}`, true, `Set Blob Tier ${container}/${blob} to ${tier}`)
  })
// A SAS is signed with key1 or key2. Azure keeps no list of ad hoc SAS tokens: the lab keeps one so the screen can
// show them (lab made). The only way to cancel one before it expires is to regenerate the key that signed it.
// form: { services: 'b'|'f'|'bf', box? (one container or share, a service SAS), perms: 'rl', start?, expires, key: 'key1', ip? }
export function createSas(state, account, form) {
  let token = null
  const next1 = edit(state, (s, y, now) => {
    const acc = y.storage[account]
    if (!acc) return
    const key = form.key ?? 'key1'
    if (!acc.keys[key]) return
    const perms = [...SAS_PERMS].filter((p) => (form.perms ?? 'r').includes(p)).join('')
    const sig = hex(`${account}${acc.keys[key]}${next(y)}`, 43)
    token = `sv=2022-11-02&ss=${form.services ?? 'b'}&srt=${form.box ? 'o' : 'sco'}&sp=${perms}&se=${form.expires}&spr=https&sig=${sig}` // lab made: se is lab clock ms
    acc.sas.push({ id: `sas${y.n}`, token, services: form.services ?? 'b', box: form.box ?? null, perms, start: form.start ?? null, expires: form.expires, key, signedWith: acc.keys[key], created: now, ...(form.name && { name: form.name }) })
    logTo(acc, now, who0, 'Generate SAS', form.box ?? '', true, `Generate SAS ${perms} signed with ${key}`)
  })
  return { state: next1, token }
}
export const sasState = (state, account, sas) => {
  const acc = sys(state)?.storage?.[account]
  if (!acc || sas.signedWith !== acc.keys[sas.key]) return 'Invalid, the key was regenerated'
  if ((state.clock ?? 0) > sas.expires) return 'Expired'
  if ((state.clock ?? 0) < (sas.start ?? -Infinity)) return 'Not active yet'
  return 'Active'
}
export const regenerateKey = (state, account, key, opts = {}) =>
  edit(state, (s, y, now) => {
    const acc = y.storage[account]
    if (!acc?.keys[key]) return
    acc.keys[key] = `${account}${key === 'key1' ? 'K1' : 'K2'}${hex(`${account}${key}${next(y)}`, 12)}==`
    acc.keysRotated[key] = now
    logTo(acc, now, opts.who ?? who0, 'Regenerate Key', key, true, `Regenerate ${key}. Every SAS signed with it stops working.`)
  })
export const connectionString = (acc, key = 'key1') => `DefaultEndpointsProtocol=https;AccountName=${acc.account};AccountKey=${acc.keys[key]};EndpointSuffix=core.windows.net`

// Key Vault
export const addSecretVersion = (state, vault, name, value, opts = {}) =>
  edit(state, (s, y, now) => {
    const v = y.vaults[vault]
    if (!v) return
    const id = addVersion(y, v, name, value, now, opts)
    logTo(v, now, opts.who ?? who0, 'SecretSet', name, true, `SecretSet ${name}, new version ${id.slice(0, 8)}`)
  })
// patch: { enabled, expires, notBefore, contentType }
export const setSecretVersion = (state, vault, name, id, patch, opts = {}) =>
  edit(state, (s, y, now) => {
    const v = y.vaults[vault]
    const ver = v?.secrets[name]?.versions.find((x) => x.id === id)
    if (!ver) return
    Object.assign(ver, patch)
    logTo(v, now, opts.who ?? who0, 'SecretUpdate', name, true, `SecretUpdate ${name}/${id.slice(0, 8)}${patch.enabled === false ? ', disabled' : patch.enabled ? ', enabled' : ''}`)
  })
// Soft delete keeps a deleted secret for the retention days; the lab removes it (lab made)
export const deleteSecret = (state, vault, name) =>
  edit(state, (s, y, now) => {
    const v = y.vaults[vault]
    if (!v?.secrets[name]) return
    delete v.secrets[name]
    logTo(v, now, who0, 'SecretDelete', name, true, `SecretDelete ${name}`)
  })
// perms: a list of VAULT_PERMS, or null to remove the policy
export const setVaultAccess = (state, vault, principal, perms) =>
  edit(state, (s, y, now) => {
    const v = y.vaults[vault]
    if (!v) return
    if (perms === null || perms.length === 0) delete v.access[principal]
    else v.access[principal] = VAULT_PERMS.filter((p) => perms.includes(p))
    logTo(v, now, who0, 'VaultPatch', principal, true, `Access policy of ${principal}: ${perms?.length ? perms.join(', ') : 'removed'}`)
  })
// roles: a list of VAULT_ROLES names, or null
export const setVaultRoles = (state, vault, principal, roles) =>
  edit(state, (s, y, now) => {
    const v = y.vaults[vault]
    if (!v) return
    if (!roles?.length) delete v.roles[principal]
    else v.roles[principal] = roles
    logTo(v, now, who0, 'RoleAssignment', principal, true, `Role assignment of ${principal}: ${roles?.length ? roles.join(', ') : 'removed'}`)
  })
export const setVaultModel = (state, vault, model) =>
  edit(state, (s, y, now) => {
    const v = y.vaults[vault]
    if (!v || !ACCESS_MODELS.includes(model)) return
    v.model = model
    logTo(v, now, who0, 'VaultPatch', '', true, `Permission model: ${model}`)
  })

// ---------- the default systems of Harbor, for the open console ----------

export function defaultSystems(now = DY + 9 * HR) {
  const ago = (ms) => Math.max(0, now - ms)
  const csv = 'sku,warehouse,available\nH-100,DUB-1,24\nH-200,DUB-1,0\nH-300,ROT-2,112\n'
  const sftp = newServerSys('sftp.harbor.lab', {
    ip: '10.20.5.21',
    users: {
      mule_stock: { password: 'lab', home: '/' },
      partner_harbor: { key: 'harbor-partner.pem', home: '/partners/harbor-north' },
      auditor: { password: 'Audit-2026', home: '/', readOnly: true },
    },
    dirs: ['/', '/in', '/archive', '/error', '/out', '/partners', '/partners/harbor-north'],
    files: {
      '/in/stock-2026-11-03.csv': fileRec(csv, { t: ago(40 * MIN), owner: 'wms' }),
      '/in/stock-2026-11-03-b.csv': fileRec(csv.slice(0, 40), { t: ago(MIN), owner: 'wms', writing: true, rest: csv.slice(40), full: csv.length }),
      '/archive/stock-2026-11-02.csv': fileRec(csv, { t: ago(DY), owner: 'mule_stock' }),
      '/partners/harbor-north/orders-1102.json': fileRec('[{"orderId":"A-77","qty":4}]', { t: ago(5 * HR), owner: 'partner_harbor' }),
    },
  })
  const ftp = newServerSys('ftp.legacy.harbor.lab', {
    protocol: 'FTP', ip: '10.20.5.40',
    users: { legacy_pos: { password: 'pos-2026', home: '/export' } },
    dirs: ['/', '/export', '/export/done'],
    files: { '/export/sales_20261102.txt': fileRec('STORE|DATE|TOTAL\n014|20261102|1840.50\n', { t: ago(7 * HR), owner: 'legacy_pos', mode: '-rw-rw-r--' }) },
  })
  const store = newStorage('harborstore', {
    containers: {
      'customer-exports': newContainer({ 'daily/customers-2026-11-02.csv': fileRec('id,name\nC-7,Harbor Deli\n', { t: ago(7 * HR), tier: 'Hot', etag: '"0x8DD1A2B3C4D5E6F"' }) }),
      invoices: newContainer({
        '2026/10/inv-1001.pdf': fileRec('', { size: 48210, t: ago(30 * DY), tier: 'Cool', etag: '"0x8DD0F1E2D3C4B5A"' }),
        '2025/12/inv-0410.pdf': fileRec('', { size: 51022, t: ago(300 * DY), tier: 'Archive', etag: '"0x8DCF0A1B2C3D4E5"' }),
      }),
    },
    shares: {
      'stock-share': newShare({ 'in/stock-dub1.csv': fileRec(csv, { t: ago(2 * HR) }) }, { dirs: ['', 'in', 'done'] }),
    },
  })
  store.sas = [
    { id: 'sas-a', name: 'customer-export app', token: `sv=2022-11-02&ss=b&srt=o&sp=rcwl&se=${now + 30 * DY}&spr=https&sig=${hex('harborstore-a', 43)}`, services: 'b', box: 'customer-exports', perms: 'rcwl', start: null, expires: now + 30 * DY, key: 'key1', signedWith: store.keys.key1, created: ago(DY) },
    { id: 'sas-b', name: 'old partner link', token: `sv=2022-11-02&ss=b&srt=o&sp=rl&se=${ago(2 * DY)}&spr=https&sig=${hex('harborstore-b', 43)}`, services: 'b', box: 'invoices', perms: 'rl', start: null, expires: ago(2 * DY), key: 'key2', signedWith: store.keys.key2, created: ago(20 * DY) },
  ]
  const kv = newVault('harbor-kv', {
    access: { 'stock-file-poll': ['get', 'list'], 'orders-nightly-load': ['get'], 'Harbor Platform Admins': ['get', 'list', 'set', 'delete', 'recover', 'backup', 'restore'] },
  })
  const y = { n: 1 }
  addVersion(y, kv, 'sftp-password', 'old-lab', ago(40 * DY), { contentType: 'password' })
  kv.secrets['sftp-password'].versions[0].enabled = false
  addVersion(y, kv, 'sftp-password', 'lab', ago(10 * DY), { contentType: 'password', expires: now + 80 * DY })
  addVersion(y, kv, 'db-password', 'Nightly-2026', ago(60 * DY), { contentType: 'password', expires: ago(DY) })
  addVersion(y, kv, 'blob-sas-token', store.sas[0].token, ago(DY), { contentType: 'SAS token' })
  // the learner's computer in the SFTP client: sample files, the build output and the key of the partner user
  const local = newLocal({
    files: {
      'stock-2026-11-04.csv': fileRec(csv, { t: ago(20 * MIN) }),
      'orders-partner.json': fileRec('[{"orderId":"A-78","qty":2}]', { t: ago(3 * HR) }),
      'harbor-partner.pem': fileRec('-----BEGIN LAB KEY FILE-----\n(practice key file, not a real key)\n-----END LAB KEY FILE-----\n', { t: ago(30 * DY) }),
      'stock-file-poll-1.0.0-mule-application.jar': fileRec('', { size: 184320, t: ago(2 * DY), binary: true }),
    },
    // the client connected to the SFTP server before, so it trusts its host key
    knownHosts: { [sftp.host]: sftp.hostKey.pub },
  })
  return systemsOf({ servers: [sftp, ftp], storage: [store], vaults: [kv], local, n: 10 })
}
