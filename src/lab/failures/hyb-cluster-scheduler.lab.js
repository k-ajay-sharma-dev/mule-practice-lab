// The guided lab hyb-cluster-scheduler. See platform-labs.js for the shape of a lab.
import { at, createServerSet, deleteApp, deleteServerSet, deployApp, finishDeploys, mark, newHybrid, newPlatform, newServer } from '../platform.js'
import { app, ask, OPS, sawLogs, until } from '../platform-kit.js'

const NAME = 'invoice-mailer'
const PKG = 'hyb-invoice-mailer'
const JAR = 'invoice-mailer-1.0.0-mule-application.jar'
const FLOW = 'invoice-mail-flow'
const GROUP = 'invoice-group'
const PAIR = ['mule-01', 'mule-02']
const PROPS = { 'smtp.host': 'smtp.harbor.lab' }

const server = (host, ip, name) => newServer(host, { ip, agent: { env: 'Sandbox', name } })
const scheduleOf = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)
const lastRun = (s) => app(s, NAME)?.store?.lastRun
const cluster = (s) => (s.hybrid?.clusters ?? []).find((c) => c.env === 'Sandbox' && PAIR.every((n) => c.servers.includes(n)))
const deploy = (s, target, targetType) => finishDeploys(deployApp(s, { name: NAME, pkg: PKG, jar: JAR, target, targetType, props: PROPS, secrets: {} }).state)

const lab = {
  id: 'p-hyb-cluster-scheduler',
  group: 'Your own servers',
  title: 'A nightly job runs twice on the server group',
  minutes: 15,
  scenario:
    'Harbor runs invoice-mailer on two of its own Windows servers, HBR-MULE-01 and HBR-MULE-02, registered in Runtime Manager as mule-01 and mule-02. Last week the team put both servers in the server group invoice-group, so the invoice API has two servers behind the load balancer of Harbor. Since then every customer gets each invoice twice. The job runs at 01:00 and nothing in the logs is an error.',
  start() {
    let s = newPlatform({ clock: at(0, 12), jars: [{ pkg: PKG, jar: JAR }], hybrid: newHybrid([server('HBR-MULE-01', '10.20.1.11', 'mule-01'), server('HBR-MULE-02', '10.20.1.12', 'mule-02')]) })
    s.hybrid.groups.push({ name: GROUP, env: 'Sandbox', servers: [...PAIR], t: 0 })
    s = until(deploy(s, GROUP, 'Server Group'), at(1, 9))
    s.mail.push({ t: at(1, 8, 30), to: OPS, subject: 'Every invoice arrived twice', body: 'Good morning. Harbor Foods customers got each invoice of last night two times, at the same minute. Please make sure it does not happen tonight.', source: 'Finance' })
    return s
  },
  steps: [
    sawLogs(NAME),
    ask('Count the runs', 'Read the lines at 01:00. The column next to the time names the server. How many times did invoice-mail-flow start?', ['Once, on mule-01', 'Twice, once on mule-01 and once on mule-02', 'Twice on mule-01, after a retry', 'It did not start'], 1, 'Two Starting lines at the same minute, one per server, and each server sent every invoice.'),
    { title: 'Read the log on the server itself', how: 'Open Data center from the menu and choose the tab HBR-MULE-02. In PowerShell run type ..\\logs\\mule-app-invoice-mailer.log, or open logs in the File Explorer. The server keeps its own copy of the log.', done: (s) => Boolean(s.seen['server:HBR-MULE-02']) },
    ask('Find the cause', 'Why did both servers run the job?', ['The cron expression fires twice', 'In a server group each server is its own Mule runtime and runs every scheduler of the application', 'The load balancer sent the job to both servers', 'The mail server sent each mail again'], 1, 'A server group is a deployment target: Runtime Manager puts the same application on each server, and each runtime starts its own schedulers. The load balancer only sees HTTP requests, never a scheduler.'),
    { title: 'Take the application off the group', how: 'Runtime Manager, invoice-mailer, Settings, Delete application. Then Runtime Manager, Servers, invoice-group, Delete. The servers stay registered and become free.', done: (s) => !(s.hybrid?.groups ?? []).some((g) => g.env === 'Sandbox' && g.servers.some((n) => PAIR.includes(n))) },
    { title: 'Create a cluster', how: 'Runtime Manager, Servers, Create Cluster. Name it invoice-cluster and tick mule-01 and mule-02. Both run the same Mule runtime, agent and Java version, and have no applications now.', done: (s) => Boolean(cluster(s)) },
    { title: 'Deploy to the cluster', how: 'Runtime Manager, Deploy application. Name invoice-mailer, the file invoice-mailer-1.0.0-mule-application.jar, target invoice-cluster. Properties: smtp.host=smtp.harbor.lab. Both nodes must show Started on the Dashboard.', done: (s) => app(s, NAME)?.targetType === 'Cluster' && app(s, NAME).target === cluster(s)?.name && app(s, NAME).status === 'Running' && PAIR.every((n) => app(s, NAME).nodes?.[n] === 'Started') },
    ask('Which node runs it', 'Both nodes run invoice-mailer and both answer API calls. Which node runs the scheduler at 01:00?', ['Both, as before', 'Only the primary node of the cluster', 'The node that got the last API call', 'A node chosen at random each night'], 1, 'In a cluster the primary node runs the schedulers and the sources that are set to the primary node only. If it fails, another node becomes primary. The lab takes the first running node as primary.'),
    { title: 'Wait for the next night run', how: 'Move the clock with Next job. Do not use Run: the proof is that the schedule fires on its own at 01:00. Then read the logs again.', done: (s) => app(s, NAME)?.targetType === 'Cluster' && Boolean(scheduleOf(s)?.last) && !scheduleOf(s).last.manual && scheduleOf(s).last.t > at(1, 9) && lastRun(s)?.t === scheduleOf(s).last.t && lastRun(s).nodes.length === 1 },
    ask('What the cluster shares', 'What do the nodes of a Mule cluster share?', ['Nothing, each node is on its own', 'Object Store and VM queue data, through a shared memory grid', 'The file system of the servers', 'One JVM across both servers'], 1, 'The nodes keep Object Store and VM queue data in a distributed shared memory grid. A watermark or a sent marker in the object store is then seen by every node. A server group shares none of this.'),
    ask('What a cluster still needs', 'Partners call the invoice API over HTTP. Who spreads those calls over the two nodes?', ['The cluster, it has a load balancer built in', 'A load balancer that Harbor runs in front of the servers', 'Runtime Manager, through the agent', 'Nobody, the primary node takes all calls'], 1, 'An on premises cluster has no load balancer of its own. Harbor puts its own load balancer in front of the nodes. The lab plays that balancer and sends each call to the next live node, and the header X-Lab-Server shows which one.'),
  ],
  why: 'A server group and a cluster both put one application on several servers. In a group each server is a separate Mule runtime, so every scheduler fires on every server. A cluster lets the nodes coordinate: the primary node runs the schedulers, and the nodes share Object Store and VM queue data. Neither one balances HTTP traffic, so a load balancer of your own stays in front. Keep a job safe to run twice anyway, because a run can repeat when a new primary takes over. In the lab one object store is kept per application, also for a group; on real servers each server of a group has its own.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/mule-high-availability-ha-clusters',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), 'server:HBR-MULE-02'), 'inbox')
    s = deleteServerSet(deleteApp(s, NAME), GROUP)
    s = createServerSet(s, { name: 'invoice-cluster', servers: PAIR, type: 'Cluster' }).state
    s = deploy(s, 'invoice-cluster', 'Cluster')
    return until(s, at(2, 1, 5))
  },
  answers: { 1: 1, 3: 1, 7: 1, 9: 1, 10: 1 },
}

export const LABS = [lab]
