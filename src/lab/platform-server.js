// A Windows server of the company, as the Server screen of the lab shows it: the folders of the Mule runtime and a
// PowerShell window with the few commands an operator uses. Pure: run() takes a state and returns a new one.
import { appNamed, CONTROL_PLANE, copyToApps, forgetAgent, installService, jarsOf, registerServer, removeAnchor, serverByHost, startService, stamp, stopService } from './platform.js'

export const BUILDS = 'C:\\builds'
const lower = (p) => p.toLowerCase()

// The folders under MULE_HOME that the lab shows. Sources: mule-runtime/latest/hot-deployment (apps and anchor files),
// runtime-manager/installing-and-configuring-runtime-manager-agent (conf\mule-agent.yml and conf\mule-agent.jks),
// mule-runtime/latest/starting-and-stopping-mule-esb (bin\mule.bat, logs\mule_ee.log).
export function listing(s, server, path) {
  const home = server.home
  const p = lower(path.replace(/\\+$/, ''))
  const dir = (name) => ({ name, dir: true })
  const file = (name, size) => ({ name, dir: false, size })
  if (p === 'c:') return [dir('builds'), dir('mule')]
  if (p === lower(BUILDS)) return jarsOf(s).map((j) => file(j.jar, '48 KB'))
  if (p === 'c:\\mule') return [dir(home.split('\\').pop())]
  if (p === lower(home)) return ['apps', 'bin', 'conf', 'domains', 'lib', 'logs', 'plugins', 'services'].map(dir)
  if (p === lower(`${home}\\bin`)) return [file('amc_setup.bat', '6 KB'), file('mule.bat', '12 KB')]
  if (p === lower(`${home}\\conf`)) return [file('log4j2.xml', '2 KB'), ...(server.agentFiles ? [file('mule-agent.jks', '4 KB'), file('mule-agent.yml', '1 KB')] : []), file('wrapper.conf', '9 KB')]
  if (p === lower(`${home}\\apps`))
    return Object.entries(server.apps)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([name, a]) => (a.status === 'dropped' ? [file(a.jar, '48 KB')] : a.status === 'deployed' ? [dir(name), file(`${name}-anchor.txt`, '1 KB')] : [dir(name)]))
  if (p === lower(`${home}\\domains`)) return [dir('default')]
  if (p === lower(`${home}\\logs`)) return [file('mule_ee.log', `${Math.max(1, server.log.length)} KB`), ...Object.keys(server.apps).map((n) => file(`mule-app-${n}.log`, '3 KB'))]
  if (p === lower(`${home}\\plugins`)) return [dir('mule-agent-plugin')]
  if (p === lower(`${home}\\lib`) || p === lower(`${home}\\services`) || p.startsWith(lower(`${home}\\apps\\`)) || p === lower(`${home}\\domains\\default`) || p === lower(`${home}\\plugins\\mule-agent-plugin`)) return []
  return null
}

const logText = (lines) => lines.map((l) => `${stamp(l.t)} ${l.level.padEnd(5)} ${l.text}`).join('\n') || '(empty)'
// What `type` shows for a file, or null when there is no such file
export function fileText(s, server, path) {
  const home = lower(server.home)
  const p = lower(path)
  if (p === `${home}\\logs\\mule_ee.log`) return logText(server.log)
  const appLog = p.match(/\\logs\\mule-app-(.+)\.log$/)
  if (appLog && p.startsWith(home)) {
    const name = Object.keys(server.apps).find((n) => lower(n) === appLog[1])
    if (!name) return null
    const app = server.agent && appNamed(s, name, server.agent.env)
    const lines = app ? app.logs.filter((l) => l.node === server.agent.name) : []
    return lines.length ? logText(lines) : `${stamp(s.clock)} INFO  Application ${name} is deployed by hand. The lab writes no flow logs for it.`
  }
  if (p === `${home}\\conf\\mule-agent.yml` && server.agentFiles)
    return ['# Lab copy, shortened. amc_setup wrote it when the server was registered.', 'transports:', '  websocket.transport:', `    consoleUri: ${CONTROL_PLANE}`, `# environment: ${server.agent?.env ?? 'removed in Runtime Manager'}`, `# server name: ${server.agent?.name ?? 'removed in Runtime Manager'}`].join('\n')
  if (p === `${home}\\conf\\mule-agent.jks` && server.agentFiles) return '(binary file) The keystore with the certificate the agent uses to talk to the control plane.'
  if (p === `${home}\\conf\\wrapper.conf`) return '# Lab copy, shortened. Java Service Wrapper settings of the Mule runtime: JVM options and memory.\nwrapper.java.additional.<n>=...'
  if (p === `${home}\\conf\\log4j2.xml`) return '<!-- Lab copy, shortened. The logging of the runtime itself. -->'
  const anchor = p.match(/\\apps\\(.+)-anchor\.txt$/)
  if (anchor && p.startsWith(home)) {
    const name = Object.keys(server.apps).find((n) => lower(n) === anchor[1] && server.apps[n].status === 'deployed')
    return name ? `${name} is deployed. Delete this file to undeploy it.` : null
  }
  if (/\.(bat)$/.test(p) && p.startsWith(`${home}\\bin\\`)) return '(script) Run it from PowerShell, for example .\\mule.bat start'
  return null
}

// Joins a path the way cd does: absolute paths, %MULE_HOME%, $env:MULE_HOME, .. and .
export function resolve(server, cwd, input) {
  let p = input.trim().replace(/\//g, '\\').replace(/^["']|["']$/g, '')
  p = p.replace(/^(%MULE_HOME%|\$env:MULE_HOME)/i, server.home)
  if (!/^[a-z]:/i.test(p)) p = `${cwd}\\${p}`
  const parts = []
  for (const part of p.split('\\')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.length > 1 && parts.pop()
    else parts.push(part)
  }
  const joined = parts.join('\\')
  return /^[a-z]:$/i.test(joined) ? `${joined}\\` : joined
}
// The real spelling of a path that exists, so the prompt reads well
function spelled(s, server, path) {
  const parts = path.replace(/\\$/, '').split('\\')
  let at = parts[0].toUpperCase()
  for (const part of parts.slice(1)) {
    const hit = (listing(s, server, at) ?? []).find((x) => lower(x.name) === lower(part))
    if (!hit) return null
    at = `${at}\\${hit.name}`
  }
  return /^[a-z]:$/i.test(at) ? `${at}\\` : at
}

export const HELP = [
  'Commands of this lab server:',
  '  dir [path]                     list a folder (also ls, Get-ChildItem)',
  '  cd <path>                      change folder. %MULE_HOME% is the Mule runtime folder',
  '  type <file>                    show a file (also cat, Get-Content)',
  '  .\\mule.bat install | start | stop | restart',
  '  .\\amc_setup.bat -H <token> <server-name>     register with Runtime Manager',
  '  copy <jar> <folder>            copy a file (also Copy-Item)',
  '  del <file>                     delete a file (also Remove-Item)',
  '  Test-NetConnection <host> -Port 443',
  '  hostname, cls',
]

// Runs one command line. Returns the new state, the folder the prompt is in, and the lines to print.
export function run(state, host, cwd, text) {
  const server = serverByHost(state, host)
  const words = text.trim().match(/"[^"]*"|\S+/g) ?? []
  const [cmd = '', ...args] = words
  const c = lower(cmd).replace(/^\.\\/, '').replace(/^.*\\(?=[^\\]+$)/, '')
  const done = (out, next = state, dir = cwd) => ({ state: next, cwd: dir, out })
  if (!cmd) return done([])
  if (c === 'help') return done(HELP)
  if (c === 'cls' || c === 'clear') return done(null)
  if (c === 'hostname') return done([server.host])
  if (['dir', 'ls', 'get-childitem', 'gci'].includes(c)) {
    const path = resolve(server, cwd, args[0] ?? '.')
    const list = listing(state, server, path)
    if (!list) return done([`Cannot find path '${path}' because it does not exist.`])
    return done([`    Directory: ${spelled(state, server, path) ?? path}`, '', ...(list.length ? list.map((x) => `${x.dir ? 'd----' : '-a---'}   ${x.dir ? '        ' : x.size.padStart(8)}  ${x.name}`) : ['    (empty)'])])
  }
  if (c === 'cd' || c === 'set-location' || c === 'chdir') {
    if (!args[0]) return done([cwd])
    const path = resolve(server, cwd, args.join(' '))
    const real = listing(state, server, path) && spelled(state, server, path)
    return real ? done([], state, real) : done([`Cannot find path '${path}' because it does not exist.`])
  }
  if (['type', 'cat', 'get-content', 'gc'].includes(c)) {
    if (!args[0]) return done(['Give a file name.'])
    const textOf = fileText(state, server, resolve(server, cwd, args[0]))
    return done(textOf === null ? [`Cannot find path '${resolve(server, cwd, args[0])}' because it does not exist.`] : textOf.split('\n'))
  }
  if (c === 'mule.bat' || c === 'mule') {
    if (lower(cwd) !== lower(`${server.home}\\bin`) && !/\\/.test(cmd)) return done([`The term '${cmd}' is not recognized. Go to %MULE_HOME%\\bin first, or give the full path.`])
    const what = lower(args[0] ?? '')
    if (what === 'install') return server.service === 'Not installed' ? done(['Installing the Mule runtime as a Windows service...', 'Service installed.'], installService(state, host)) : done(['The Mule service is already installed.'])
    if (server.service === 'Not installed') return done(['The Mule service is not installed. Run .\\mule.bat install first.'])
    if (what === 'start') return server.service === 'Running' ? done(['The Mule service is already running.']) : done(['Starting the Mule service...', 'Mule service started. Read logs\\mule_ee.log.'], startService(state, host))
    if (what === 'stop') return server.service === 'Stopped' ? done(['The Mule service is not running.']) : done(['Stopping the Mule service...', 'Mule service stopped.'], stopService(state, host))
    if (what === 'restart') return done(['Stopping the Mule service...', 'Starting the Mule service...', 'Mule service started. Read logs\\mule_ee.log.'], startService(stopService(state, host), host))
    return done(['Usage: .\\mule.bat install | start | stop | restart'])
  }
  if (c === 'amc_setup.bat' || c === 'amc_setup') {
    if (lower(cwd) !== lower(`${server.home}\\bin`) && !/\\/.test(cmd)) return done([`The term '${cmd}' is not recognized. Go to %MULE_HOME%\\bin first, or give the full path.`])
    const h = args.findIndex((a) => a === '-H')
    if (h < 0) return done(['Usage: .\\amc_setup.bat -H <registration-token> <server-name>. Runtime Manager, Servers, Add Server shows the command with the token of the environment.'])
    const r = registerServer(state, host, args[h + 1], args[h + 2])
    return done(r.out, r.state)
  }
  if (['copy', 'cp', 'copy-item'].includes(c)) {
    const [from, to] = args.filter((a) => !a.startsWith('-'))
    if (!from || !to) return done(['Usage: copy <file> <folder>'])
    const src = resolve(server, cwd, from)
    const jar = jarsOf(state).find((j) => lower(`${BUILDS}\\${j.jar}`) === lower(src))
    if (!jar) return done([`Cannot find path '${src}' because it does not exist.`])
    const dest = resolve(server, cwd, to)
    if (lower(dest.replace(/\\$/, '')) !== lower(`${server.home}\\apps`)) return done([`The lab copies application files into ${server.home}\\apps only.`])
    const next = copyToApps(state, host, jar.jar)
    return done([server.service === 'Running' ? `Copied. The runtime finds ${jar.jar}, unpacks it into apps\\${jar.jar.replace(/\.jar$/i, '')} and writes the anchor file.` : 'Copied. The runtime deploys it when it starts.'], next)
  }
  if (['del', 'rm', 'remove-item', 'erase'].includes(c)) {
    if (!args[0]) return done(['Give a file name.'])
    const shown = resolve(server, cwd, args[0])
    const path = lower(shown)
    const home = lower(server.home)
    if (path === `${home}\\conf\\mule-agent.yml` || path === `${home}\\conf\\mule-agent.jks`) {
      if (!server.agentFiles) return done(server.agent || server.removed ? ['Already removed together with the other agent file.'] : [`Cannot find path '${shown}' because it does not exist.`])
      return done(['Deleted. In the lab one delete removes both agent files. The agent can no longer connect, and Runtime Manager shows the server as Disconnected until you remove it there.'], forgetAgent(state, host))
    }
    const anchor = path.match(/\\apps\\(.+)-anchor\.txt$/)
    const name = anchor && path.startsWith(home) && Object.keys(server.apps).find((n) => lower(n) === anchor[1] && server.apps[n].status === 'deployed')
    if (name) return done([`Deleted. The runtime undeploys ${name}.`], removeAnchor(state, host, name))
    return done(['The lab deletes anchor files in apps and the agent files in conf only.'])
  }
  if (c === 'test-netconnection' || c === 'tnc') {
    const target = args.find((a) => !a.startsWith('-')) ?? ''
    const at = args.findIndex((a) => lower(a) === '-port')
    const port = at >= 0 ? (args[at + 1] ?? '') : '80'
    const anypoint = /anypoint\.mulesoft\.com$/i.test(target)
    const ok = anypoint && port === '443' && server.outbound
    return done([`ComputerName     : ${target || '(none)'}`, `RemotePort       : ${port}`, `SourceAddress    : ${server.ip}`, `TcpTestSucceeded : ${ok ? 'True' : 'False'}`, ...(anypoint && port === '443' && !server.outbound ? ['', 'The firewall blocks outbound HTTPS on 443 from this server.'] : [])])
  }
  return done([`The term '${cmd}' is not recognized in this lab. Type help.`])
}
