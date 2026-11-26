// The guided lab hyb-manual-copy. See platform-labs.js for the shape of a lab.
import { at, copyToApps, deployApp, finishDeploys, mark, newHybrid, newPlatform, newServer, serverByHost } from '../platform.js'
import { run } from '../platform-server.js'
import { app, ask, call, called, OPS, until } from '../platform-kit.js'

const HOST = 'HBR-MULE-01'
const SERVER = 'mule-01'
const NAME = 'orders-sapi'
const JAR = 'orders-sapi-1.0.0-mule-application.jar'
const COPY = 'orders-sapi-1.0.0-mule-application' // hot deployment names the application after the file
const OTHER = 'customers-sapi'
const OTHER_JAR = 'customers-sapi-1.0.0-mule-application.jar'

const server = (s) => serverByHost(s, HOST)
const deploy = (s, name, pkg, jar, props) => finishDeploys(deployApp(s, { name, pkg, jar, target: SERVER, targetType: 'Server', props, secrets: {} }).state)
const copyGone = (s) => !server(s)?.apps[COPY] && (server(s)?.log ?? []).some((l) => l.text === `Undeployed app '${COPY}'`)

const lab = {
  id: 'p-hyb-manual-copy',
  group: 'Your own servers',
  title: 'Someone copied a jar into the apps folder',
  minutes: 12,
  scenario:
    'HBR-MULE-01 is a Windows server of Harbor, registered in Runtime Manager as mule-01. Runtime Manager deploys customers-sapi to it. Last night the release pipeline was down, so an operator copied the Orders System API into the apps folder by hand. Runtime Manager does not list it, and today nobody can say which configuration it runs with.',
  start() {
    let s = newPlatform({
      clock: at(0, 12),
      jars: [{ pkg: 'hyb-orders-sapi', jar: JAR }, { pkg: 'hyb-customers-sapi', jar: OTHER_JAR }],
      hybrid: newHybrid([newServer(HOST, { ip: '10.20.1.11', agent: { env: 'Sandbox', name: SERVER } })]),
    })
    s = deploy(s, OTHER, 'hyb-customers-sapi', OTHER_JAR, { 'crm.host': 'crm.harbor.lab' })
    s = until(s, at(0, 22, 14))
    s = copyToApps(s, HOST, JAR)
    s = until(s, at(1, 9))
    s.mail.push({ t: at(0, 22, 20), to: OPS, subject: 'orders-sapi is live on HBR-MULE-01', body: 'The pipeline was down, so I copied orders-sapi-1.0.0-mule-application.jar from C:\\builds into the apps folder on HBR-MULE-01. It started. Night shift operator', source: 'Operations' })
    return s
  },
  steps: [
    { title: 'Open the server', how: 'Open Data center from the menu, tab HBR-MULE-01. In the File Explorer open apps. In PowerShell you can also run dir ..\\apps.', done: (s) => Boolean(s.seen[`server:${HOST}`]) },
    ask('Compare the two lists', 'Runtime Manager, Applications lists customers-sapi. What else is in the apps folder?', ['Nothing else', 'A folder orders-sapi-1.0.0-mule-application with its anchor file', 'A file orders-sapi.jar waiting to deploy', 'A second copy of customers-sapi'], 1, 'The runtime unpacked the jar into a folder named after the file and wrote orders-sapi-1.0.0-mule-application-anchor.txt. That anchor file means the application runs.'),
    ask('Who deployed it', 'Read logs\\mule_ee.log on the server. How do you know Runtime Manager did not deploy it?', ['The log says so', 'Runtime Manager has no application of that name, and its name is the jar file name and not a name someone chose', 'The anchor file is missing', 'It runs on another port'], 1, 'An application of Runtime Manager has the name you give it when you deploy. Hot deployment takes the file name. The log shows the start at 22:14 and Runtime Manager has no record of it.'),
    { title: 'Undeploy the hand copy', how: 'Delete its anchor file. In PowerShell: del ..\\apps\\orders-sapi-1.0.0-mule-application-anchor.txt. The runtime undeploys the application. Leave customers-sapi alone.', done: copyGone },
    { title: 'Deploy it through Runtime Manager', how: 'Runtime Manager, Deploy application. Name orders-sapi, the file orders-sapi-1.0.0-mule-application.jar, target mule-01. Properties: db.host=sql01.harbor.lab. customers-sapi keeps running.', done: (s) => copyGone(s) && app(s, NAME)?.targetType === 'Server' && app(s, NAME).target === SERVER && app(s, NAME).status === 'Running' && server(s)?.apps[NAME]?.managed && app(s, OTHER)?.status === 'Running' },
    { title: 'Call it', how: 'API client, orders-sapi, GET /orders. You get 200 and the header X-Lab-Server says mule-01.', done: (s) => copyGone(s) && called(s, NAME, 200) },
    ask('Why not by hand', 'The pipeline is down again next month. Why not copy the jar into apps again?', ['Hot deployment is slower', 'Once Runtime Manager manages a server, other deployment methods must not be used on it. A hand copy has no record, no properties and no history in Runtime Manager', 'Copying needs a restart of the server', 'The anchor file breaks the agent'], 1, 'Runtime Manager does not see the copy, so it cannot show its status, redeploy it, change its properties or alert on it. A second copy of the same API with the same HTTP port would also fail to start. Deploy from Runtime Manager by hand, or with the Mule Maven plugin against Runtime Manager.'),
  ],
  why: 'On a server that Runtime Manager manages, Runtime Manager is the only way in. A jar copied into the apps folder runs, but Runtime Manager does not know it: no name you chose, no properties, no deployment history, no alerts. To remove such a copy, delete its anchor file, and the runtime undeploys it. Then deploy the application from Runtime Manager.',
  docs: 'https://docs.mulesoft.com/runtime-manager/deploying-to-your-own-servers',
  solve(start) {
    let s = mark(mark(start, `server:${HOST}`), 'inbox')
    s = run(s, HOST, `${server(s).home}\\bin`, `del ..\\apps\\${COPY}-anchor.txt`).state
    s = deploy(s, NAME, 'hyb-orders-sapi', JAR, { 'db.host': 'sql01.harbor.lab' })
    return call(s, NAME, null, '/orders').state
  },
  answers: { 1: 1, 2: 1, 6: 1 },
}

export const LABS = [lab]
