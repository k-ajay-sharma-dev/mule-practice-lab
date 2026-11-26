// The guided lab hyb-server-group. See platform-labs.js for the shape of a lab.
import { at, callApi, CONTROL_PLANE, createServerSet, deployApp, finishDeploys, liveNodes, mark, newHybrid, newPlatform, newServer, serverByHost, stopService, startService } from '../platform.js'
import { app, ask, OPS } from '../platform-kit.js'

const APP = 'price-lookup-sapi'
const GROUP = 'harbor-dc-sbx'
const HOSTS = { 'mule-01': 'HBR-MULE-01', 'mule-02': 'HBR-MULE-02' }
const groupOf = (s) => (s.hybrid?.groups ?? []).find((g) => g.env === 'Sandbox' && Object.keys(HOSTS).every((n) => g.servers.includes(n)))
const onGroup = (s) => {
  const a = app(s, APP)
  const g = groupOf(s)
  return g && a?.targetType === 'Server Group' && a.target === g.name ? a : null
}
const deployedBoth = (s) => {
  const a = onGroup(s)
  return a && Object.keys(HOSTS).every((n) => a.nodes?.[n] === 'Started') ? a : null
}
const calls = (s, since) => (s.lastCalls ?? []).filter((c) => c.app === APP && c.env === 'Sandbox' && c.status === 200 && c.t > since)
// The times a Mule service was stopped after the deployment, with the time it came back
function outages(s) {
  const a = onGroup(s)
  if (!a) return []
  return Object.values(HOSTS).flatMap((host) => {
    const log = serverByHost(s, host)?.log ?? []
    return log.flatMap((l, i) => {
      if (l.text !== 'Mule runtime stopped' || l.t < a.updated) return []
      const back = log.slice(i + 1).find((x) => /^Mule runtime \S+ started$/.test(x.text))
      return [{ host, from: l.t, to: back?.t ?? Infinity }]
    })
  })
}
// a call that came between a stop and the next start; a call and a start at the same moment count, as the call was first
const callWhileDown = (s) => outages(s).some((o) => calls(s, o.from).some((c) => c.t <= o.to))

const server = (host, name) => {
  const x = newServer(host, { ip: host.endsWith('01') ? '10.20.1.11' : '10.20.1.12', agent: { env: 'Sandbox', name } })
  x.log = [
    { t: at(0, 14, 5), level: 'INFO', text: `Mule runtime ${x.runtime} started` },
    { t: at(0, 14, 6), level: 'INFO', text: `Runtime Manager agent connected to ${CONTROL_PLANE}` },
  ]
  return x
}

const lab = {
  id: 'p-hyb-server-group',
  group: 'Your own servers',
  title: 'One deploy, two servers',
  minutes: 15,
  scenario:
    'Harbor has two Windows servers in its data center, HBR-MULE-01 and HBR-MULE-02. Both run Mule 4.9.0 and are registered in Sandbox as mule-01 and mule-02. The Harbor load balancer sends traffic for price-lookup-sapi to both. The team wants one deployment in Runtime Manager to land on both servers, and proof that the API keeps answering when one server goes down.',
  start() {
    const s = newPlatform({ clock: at(1, 9), jars: [APP], hybrid: newHybrid([server(HOSTS['mule-01'], 'mule-01'), server(HOSTS['mule-02'], 'mule-02')]) })
    s.mail.push({
      t: at(1, 8, 45),
      to: OPS,
      subject: 'price-lookup-sapi on both servers',
      body: 'Hi. The load balancer pool has HBR-MULE-01 and HBR-MULE-02 on port 8081. Please deploy price-lookup-sapi once so that both servers run it, and show me it survives one server going down.',
      source: 'Network team',
    })
    return s
  },
  steps: [
    {
      title: 'Create a server group',
      how: `Runtime Manager, Servers, Create Group. Name ${GROUP}, tick mule-01 and mule-02, Create. Both servers run the same Mule runtime, agent and Java versions, and have no applications, so the group is allowed.`,
      done: (s) => Boolean(groupOf(s)),
    },
    {
      title: 'Deploy once to the group',
      how: `Runtime Manager, Deploy application. Name ${APP}, Deployment Target Server Group: ${GROUP}, your data center, Application File ${APP}-1.0.0-mule-application.jar. Deploy. The Dashboard shows two servers in the node table.`,
      done: (s) => Boolean(deployedBoth(s)),
    },
    {
      title: 'Look in both apps folders',
      how: 'Open the Data center. Open apps in File Explorer on HBR-MULE-01, then choose the HBR-MULE-02 tab and open apps there too.',
      done: (s) => Object.values(HOSTS).every((h) => s.seen[`server:${h}`]),
    },
    ask(
      'Count the copies',
      'Where is price-lookup-sapi now?',
      ['Only on HBR-MULE-01, the first server of the group', 'On both servers, each with its own folder and anchor file', 'In one shared network folder that both servers read', 'In Anypoint, and the servers call it'],
      1,
      'A server group deploys the same application to every server of the group. Each runtime has its own copy in its own apps folder and runs it on its own.',
    ),
    {
      title: 'Call it twice',
      how: `API client, ${APP}, GET /prices/SKU-1001. Send it two times and read the response headers each time.`,
      done: (s) => Boolean(deployedBoth(s)) && calls(s, deployedBoth(s).updated).length >= 2,
    },
    ask(
      'Read the header',
      'What did X-Lab-Server say on the two calls?',
      ['mule-01 both times', 'mule-01, then mule-02', 'Nothing, the header was empty', 'anypoint, because Runtime Manager answers'],
      1,
      'The Harbor load balancer sends the requests round robin to the servers where the application runs. The answer body names the same server.',
    ),
    ask(
      'Who balances',
      'Which part sends each request to one of the two servers?',
      ['Runtime Manager', 'The Runtime Manager agent on HBR-MULE-01', 'The load balancer of Harbor in front of the servers', 'The server group itself'],
      2,
      'Runtime Manager deploys and monitors; it never carries the requests. Neither a server group nor an on premises cluster has a built in load balancer. You put your own in front.',
    ),
    {
      title: 'Stop one server',
      how: 'Data center, HBR-MULE-01, PowerShell. Run .\\mule.bat stop in bin. Runtime Manager now shows mule-01 Disconnected.',
      done: (s) => outages(s).length > 0,
    },
    {
      title: 'Prove the API still answers',
      how: `While HBR-MULE-01 is down, call GET /prices/SKU-1001 again. You get 200 and X-Lab-Server: mule-02.`,
      done: callWhileDown,
    },
    ask(
      'Read the node table',
      `Open ${APP}, Dashboard, while HBR-MULE-01 is stopped. What does it show for mule-01?`,
      ['Running, Started, gets traffic Yes', 'Disconnected, Stopped, gets traffic No', 'The row is gone', 'Failed, because the deployment broke'],
      1,
      'The server is down, so its agent is not connected and the load balancer gets no answer from it. The application is still Running in Runtime Manager because mule-02 serves it.',
    ),
    {
      title: 'Bring it back',
      how: 'Run .\\mule.bat start on HBR-MULE-01. The runtime starts the application from its apps folder and the agent connects again. The node table shows both servers with traffic.',
      done: (s) => outages(s).length > 0 && Boolean(deployedBoth(s)) && liveNodes(s, deployedBoth(s)).length === 2,
    },
  ],
  why: 'A server group is a set of servers that Runtime Manager treats as one deployment target. One deployment puts the same application on every server, and each runtime runs its own copy, with its own schedulers. The servers must run the same Mule runtime and agent versions, and a server with applications cannot join. Runtime Manager does not carry traffic: Harbor puts its own load balancer in front, so one server can stop while the other answers. Sources: https://docs.mulesoft.com/runtime-manager/server-group-about and https://docs.mulesoft.com/mule-runtime/latest/mule-high-availability-ha-clusters',
  docs: 'https://docs.mulesoft.com/runtime-manager/server-group-about',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `server:${HOSTS['mule-01']}`), `server:${HOSTS['mule-02']}`)
    s = createServerSet(s, { name: GROUP, servers: Object.keys(HOSTS), type: 'Server Group' }).state
    s = finishDeploys(deployApp(s, { name: APP, pkg: APP, jar: `${APP}-1.0.0-mule-application.jar`, target: GROUP, targetType: 'Server Group', props: {}, secrets: {} }).state)
    const get = (x) => callApi(x, { env: 'Sandbox', app: APP, method: 'GET', path: '/prices/SKU-1001' }).state
    s = get(get(s))
    s = get(stopService(s, HOSTS['mule-01']))
    return startService(s, HOSTS['mule-01'])
  },
  answers: { 3: 1, 5: 1, 6: 2, 9: 1 },
}

export const LABS = [lab]
