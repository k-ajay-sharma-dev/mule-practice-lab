// The guided lab hyb-version-mismatch. See platform-labs.js for the shape of a lab.
import { at, createServerSet, deleteApp, deleteServerSet, deployApp, finishDeploys, mark, newHybrid, newPlatform, newServer, REG_TOKENS, serverByHost, serverStatus } from '../platform.js'
import { run } from '../platform-server.js'
import { app, ask, call, OPS } from '../platform-kit.js'

const NAME = 'stock-api'
const PKG = 'hyb-stock-api'
const JAR = 'stock-api-1.0.0-mule-application.jar'
const GROUP = 'stock-group'
const OLD = 'HBR-MULE-03'
const NEW = 'HBR-MULE-04'
const PROPS = { 'db.host': 'stockdb.harbor.lab' }

const registered = (host, ip, name, extra = {}) => newServer(host, { ip, agent: { env: 'Sandbox', name }, ...extra })
const newName = (s) => serverByHost(s, NEW)?.agent?.env === 'Sandbox' ? serverByHost(s, NEW).agent.name : null
// the group of the end: mule-01, mule-02 and the new server, made again after the old one was deleted
const newGroup = (s) => (s.hybrid?.groups ?? []).find((g) => g.env === 'Sandbox' && g.t > 0 && newName(s) && ['mule-01', 'mule-02', newName(s)].every((n) => g.servers.includes(n)) && !g.servers.includes('mule-03'))
const deploy = (s, target, targetType, name = NAME) => finishDeploys(deployApp(s, { name, pkg: PKG, jar: JAR, target, targetType, props: PROPS, secrets: {} }).state)
const failedOnOld = (s) => (serverByHost(s, OLD)?.log ?? []).some((l) => l.level === 'ERROR' && /needs Mule runtime 4\.9\.0/.test(l.text))

const lab = {
  id: 'p-hyb-version-mismatch',
  group: 'Your own servers',
  title: 'A third server cannot join the group',
  minutes: 20,
  scenario:
    'stock-api runs on the server group stock-group: mule-01 and mule-02, both Mule 4.9.0. The warehouse wants a third server before the peak season. Yesterday IT built HBR-MULE-03 from an old image and registered it as mule-03. This morning IT also prepared HBR-MULE-04 with Mule 4.9.0, not yet registered. It is 06:30 and the warehouse opens at 08:00, so you have a maintenance window.',
  start() {
    let s = newPlatform({
      clock: at(1, 6, 20),
      jars: [{ pkg: PKG, jar: JAR }],
      hybrid: newHybrid([
        registered('HBR-MULE-01', '10.20.1.11', 'mule-01'),
        registered('HBR-MULE-02', '10.20.1.12', 'mule-02'),
        registered(OLD, '10.20.1.13', 'mule-03', { runtime: '4.6.0' }),
        newServer(NEW, { ip: '10.20.1.14', service: 'Not installed' }),
      ]),
    })
    s.hybrid.groups.push({ name: GROUP, env: 'Sandbox', servers: ['mule-01', 'mule-02'], t: 0 })
    s = deploy(s, GROUP, 'Server Group')
    s.clock = at(1, 6, 30)
    s.mail.push({ t: at(1, 6, 25), to: OPS, subject: 'Two new servers for stock-api', body: 'Hi. HBR-MULE-03 is registered as mule-03, please add it to stock-group. We also installed Mule 4.9.0 on HBR-MULE-04 in C:\\mule, the Windows service is not installed yet and it is not registered. IT Infrastructure', source: 'IT' })
    return s
  },
  steps: [
    { title: 'Look at the new server', how: 'Open Data center from the menu and choose the tab HBR-MULE-03. Compare MULE_HOME and the Mule runtime with HBR-MULE-01. Runtime Manager, Servers shows the same versions in the Runtime column.', done: (s) => Boolean(s.seen[`server:${OLD}`]) },
    ask('Compare the servers', 'What is different on HBR-MULE-03?', ['The Java version', 'The Mule runtime: 4.6.0 instead of 4.9.0', 'The Runtime Manager agent is missing', 'It is in another environment'], 1, 'mule-03 runs Mule 4.6.0. Java 17 and the agent version are the same as on mule-01 and mule-02.'),
    { title: 'Free the servers of the group', how: 'The lab cannot add a server to a group that exists, so you build the group again. Runtime Manager, stock-api, Settings, Delete application. Then Runtime Manager, Servers, stock-group, Delete.', done: (s) => !(s.hybrid?.groups ?? []).some((g) => g.t === 0) },
    ask('Try the group with mule-03', 'Runtime Manager, Servers, Create Group. Name stock-group, tick mule-01, mule-02 and mule-03, Create. What does Runtime Manager answer?', ['The group is created', 'All servers must run the same Mule runtime version', 'mule-03 has applications', 'A group has at most two servers'], 1, 'Every server of a group runs the same Mule runtime, Runtime Manager agent and Java version. Cancel the dialog: the group was not created.'),
    { title: 'See the failed node', how: 'Deploy stock-api to mule-03 on its own: Runtime Manager, Deploy application, target mule-03, Properties db.host=stockdb.harbor.lab. The application fails. Read the logs, or type ..\\logs\\mule_ee.log on HBR-MULE-03.', done: failedOnOld },
    { title: 'Delete the failed application', how: 'Runtime Manager, stock-api, Settings, Delete application. mule-03 stays registered and empty until IT upgrades it.', done: (s) => failedOnOld(s) && !s.apps.some((a) => a.env === 'Sandbox' && a.target === 'mule-03') && Object.keys(serverByHost(s, OLD)?.apps ?? {}).length === 0 },
    ask('Choose the fix', 'The application needs Mule 4.9.0. How do you get a third server into the group?', ['Deploy an older build of stock-api to all three', 'Use a server with Mule 4.9.0 and the same agent and Java version', 'Put mule-03 in its own group with the same name', 'Change the version text in the server list'], 1, 'The group and the application both need 4.9.0. HBR-MULE-04 has it. Upgrading HBR-MULE-03 to 4.9.0 is the other route, and it is work for another day.'),
    { title: 'Install the Mule service on HBR-MULE-04', how: 'Data center, HBR-MULE-04. In PowerShell, in %MULE_HOME%\\bin, run .\\mule.bat install.', done: (s) => serverByHost(s, NEW)?.service !== 'Not installed' },
    { title: 'Register HBR-MULE-04', how: 'Runtime Manager, Servers, Add Server shows the command. On HBR-MULE-04 run .\\amc_setup.bat -H <token> mule-04 in %MULE_HOME%\\bin.', done: (s) => Boolean(newName(s)) },
    { title: 'Start it so it connects', how: 'Run .\\mule.bat start. The agent connects out on port 443 and Runtime Manager, Servers shows mule-04 as Running.', done: (s) => Boolean(newName(s)) && serverStatus(serverByHost(s, NEW)) === 'Running' },
    { title: 'Create the group again', how: 'Runtime Manager, Servers, Create Group. Name stock-group, tick mule-01, mule-02 and mule-04. Leave mule-03 out.', done: (s) => Boolean(newGroup(s)) },
    { title: 'Deploy stock-api to the group', how: 'Runtime Manager, Deploy application. Name stock-api, the file stock-api-1.0.0-mule-application.jar, target stock-group, Properties db.host=stockdb.harbor.lab. The Dashboard shows three servers, each Started.', done: (s) => app(s, NAME)?.targetType === 'Server Group' && app(s, NAME).target === newGroup(s)?.name && app(s, NAME).status === 'Running' && Object.values(app(s, NAME).nodes ?? {}).filter((x) => x === 'Started').length === 3 },
    { title: 'Get an answer from mule-04', how: 'API client, stock-api, GET /stock/SKU-1001. Send it three times and read the header X-Lab-Server: the load balancer sends each call to the next server.', done: (s) => Boolean(newGroup(s)) && (app(s, NAME)?.logs ?? []).some((l) => l.node === newName(s) && /received/.test(l.text)) },
  ],
  why: 'A server group is one deployment target for many servers, so Runtime Manager asks that each server runs the same Mule runtime, agent and Java version, and that a new member has no applications of its own. An application can also set a minimum runtime in mule-artifact.json, and an older runtime refuses to start it. Bring every server to the same versions first, then add it. In Runtime Manager you can add a server to an existing group; the lab only lets you build the group again.',
  docs: 'https://docs.mulesoft.com/runtime-manager/server-group-about',
  solve(start) {
    let s = mark(mark(start, `server:${OLD}`), 'inbox')
    s = deleteServerSet(deleteApp(s, NAME), GROUP)
    s = deleteApp(deploy(s, 'mule-03', 'Server'), NAME)
    const bin = `${serverByHost(s, NEW).home}\\bin`
    for (const line of ['.\\mule.bat install', `.\\amc_setup.bat -H ${REG_TOKENS.Sandbox} mule-04`, '.\\mule.bat start']) s = run(s, NEW, bin, line).state
    s = createServerSet(s, { name: GROUP, servers: ['mule-01', 'mule-02', 'mule-04'], type: 'Server Group' }).state
    s = deploy(s, GROUP, 'Server Group')
    for (let i = 0; i < 3; i++) s = call(s, NAME, null, '/stock/SKU-1001').state
    return s
  },
  answers: { 1: 1, 3: 1, 6: 1 },
}

export const LABS = [lab]
