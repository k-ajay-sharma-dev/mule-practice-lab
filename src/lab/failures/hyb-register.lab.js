// The guided lab hyb-register. See platform-labs.js for the shape of a lab.
import { at, callApi, CONTROL_PLANE, deployApp, finishDeploys, mark, newHybrid, newPlatform, newServer, REG_TOKENS, removeServer, serverByHost, serverStatus } from '../platform.js'
import { run } from '../platform-server.js'
import { app, ask, OPS } from '../platform-kit.js'

const HOST = 'HBR-MULE-01'
const NAME = 'mule-01'
const APP = 'dock-booking-sapi'
const server = (s) => serverByHost(s, HOST)
// registered in Sandbox under the name the team uses, not the placeholder of the Add Server command
const registered = (s) => server(s)?.agent?.env === 'Sandbox' && server(s).agent.name === NAME
const deployed = (s) => {
  const a = app(s, APP)
  return a?.targetType === 'Server' && a.target === NAME && a.status === 'Running' && a.nodes?.[NAME] === 'Started' ? a : null
}

const lab = {
  id: 'p-hyb-register',
  group: 'Your own servers',
  title: 'Register a Windows server with Runtime Manager',
  minutes: 20,
  scenario:
    'Brightmart runs Mule 4.9.0 on its own Windows server HBR-MULE-01 in the data center. Anypoint is the control plane: you deploy from Runtime Manager, and the runtime on the server runs the application. Yesterday a colleague ran amc_setup on the server and restarted it. Today Runtime Manager, Servers, shows no server in Sandbox, and the team wants to deploy dock-booking-sapi there for testing.',
  start() {
    const x = newServer(HOST, { ip: '10.20.1.11', agent: { env: 'Production', name: NAME } })
    x.log = [
      { t: at(0, 16, 2), level: 'INFO', text: `Mule runtime ${x.runtime} started` },
      { t: at(0, 16, 10), level: 'INFO', text: `Runtime Manager agent registered as ${NAME} in Production` },
      { t: at(0, 16, 11), level: 'INFO', text: 'Mule runtime stopped' },
      { t: at(0, 16, 11), level: 'INFO', text: `Mule runtime ${x.runtime} started` },
      { t: at(0, 16, 12), level: 'INFO', text: `Runtime Manager agent connected to ${CONTROL_PLANE}` },
    ]
    const s = newPlatform({ clock: at(1, 9), jars: [APP], hybrid: newHybrid([x]) })
    s.mail.push({
      t: at(1, 8, 50),
      to: OPS,
      subject: 'HBR-MULE-01 is not in Sandbox',
      body: 'Hi. I registered HBR-MULE-01 yesterday with the command from Add Server and restarted the runtime. It connected, but Sandbox shows no server. Could you check it and deploy dock-booking-sapi to it? The load balancer address is ready.',
      source: 'Platform team',
    })
    return s
  },
  steps: [
    {
      title: 'Open the server',
      how: 'Open the menu and choose Data center, or Runtime Manager, Servers, Open the servers in the data center. You see HBR-MULE-01 as over Remote Desktop: the chain from Anypoint to the apps folder, File Explorer and PowerShell.',
      done: (s) => Boolean(s.seen[`server:${HOST}`]),
    },
    ask(
      'Read the agent files',
      'In File Explorer open conf and then mule-agent.yml. Open logs and then mule_ee.log. In which environment is the server registered?',
      ['Sandbox', 'Production', 'Both environments', 'None, the agent never connected'],
      1,
      'mule-agent.yml says Production and mule_ee.log says registered as mule-01 in Production. The registration token belongs to one environment, so the server only shows in the environment whose Add Server page gave the command.',
    ),
    ask(
      'Read the connection',
      'mule-agent.yml has consoleUri wss://runtime-manager.anypoint.mulesoft.com:443/mule. Who opens this connection?',
      ['Runtime Manager opens it to the server on port 443', 'The agent on the server opens it to Runtime Manager on port 443', 'The load balancer opens it', 'Nobody, the agent polls a file share'],
      1,
      'The agent makes an outbound HTTPS connection, then keeps a secure WebSocket open to the control plane. Runtime Manager sends its commands back over that same connection.',
    ),
    {
      title: 'Remove the server from Production',
      how: 'Use the environment button at the top of the left menu in Runtime Manager and choose Production. Runtime Manager, Servers, Remove on mule-01. Deleting the agent files alone would leave it in Production as Disconnected. The files stay on the server, so it cannot register again yet. Switch back to Sandbox afterwards.',
      done: (s) => Boolean(server(s)?.removed) || registered(s),
    },
    {
      title: 'Register it with the Sandbox token',
      how: 'In Sandbox open Runtime Manager, Servers, Add Server and copy the command. In PowerShell on HBR-MULE-01 run cd %MULE_HOME%\\conf, then del mule-agent.yml and del mule-agent.jks. In the lab one delete removes both files. Then cd ..\\bin and run the command with the name mule-01.',
      done: registered,
    },
    {
      title: 'Restart the runtime',
      how: 'amc_setup says the runtime is running and has to restart. Run .\\mule.bat restart in bin. Read mule_ee.log again and look at Runtime Manager, Servers in Sandbox: mule-01 is Running.',
      done: (s) => registered(s) && serverStatus(server(s)) === 'Running',
    },
    ask(
      'The firewall',
      'Which firewall rule does HBR-MULE-01 need so Runtime Manager can manage it?',
      ['Inbound 443 from Anypoint to the server', 'Outbound HTTPS 443 from the server to runtime-manager.anypoint.mulesoft.com', 'Inbound 8081 from Anypoint', 'Both inbound and outbound 7777'],
      1,
      'The agent connects out, so the data center needs no inbound rule for Runtime Manager. Your callers still need a way in to the applications, which is the job of your own load balancer.',
    ),
    {
      title: 'Deploy to the server',
      how: 'Runtime Manager, Deploy application. Name dock-booking-sapi, Deployment Target Server: mule-01, your data center, Application File dock-booking-sapi-1.0.0-mule-application.jar. Deploy. The Dashboard shows the server in its node table.',
      done: (s) => Boolean(deployed(s)),
    },
    ask(
      'Find the files',
      'Open the apps folder of HBR-MULE-01 in File Explorer. What did the deployment leave there?',
      ['Only the jar file', 'A folder dock-booking-sapi and the file dock-booking-sapi-anchor.txt', 'Nothing, the application runs in Anypoint', 'A copy of the jar in conf'],
      1,
      'The agent received the jar over its connection and wrote it to the apps folder. The runtime unpacked it into a folder and wrote an anchor file. The application runs on your server, and Anypoint only holds the deployment record.',
    ),
    {
      title: 'Call it through the load balancer',
      how: 'API client, dock-booking-sapi, GET /docks. The address is the Brightmart load balancer, and the answer has the header X-Lab-Server: mule-01.',
      done: (s) => Boolean(deployed(s)) && (s.lastCalls ?? []).some((c) => c.app === APP && c.env === 'Sandbox' && c.status === 200 && c.t > deployed(s).updated),
    },
  ],
  why: 'A registration token belongs to one environment, so a server registered with the Production token shows only in Production. To move it, remove it in Runtime Manager, delete conf\\mule-agent.yml and conf\\mule-agent.jks, run amc_setup with the token of the right environment and restart the runtime. The agent then opens an outbound HTTPS connection and a secure WebSocket on port 443, so the data center needs outbound 443 and no inbound rule. A deployment travels down that connection, and the runtime unpacks the jar in apps. The lab writes both agent files at once and removes them together. Sources: https://docs.mulesoft.com/runtime-manager/servers-create and https://docs.mulesoft.com/runtime-manager/installing-and-configuring-runtime-manager-agent',
  docs: 'https://docs.mulesoft.com/runtime-manager/servers-create',
  solve(start) {
    let s = mark(mark(start, `server:${HOST}`), 'inbox')
    s = { ...removeServer({ ...s, env: 'Production' }, NAME), env: 'Sandbox' }
    const home = server(s).home
    for (const [cwd, line] of [
      [`${home}\\conf`, 'del mule-agent.yml'],
      [`${home}\\conf`, 'del mule-agent.jks'],
      [`${home}\\bin`, `.\\amc_setup.bat -H ${REG_TOKENS.Sandbox} ${NAME}`],
      [`${home}\\bin`, '.\\mule.bat restart'],
    ])
      s = run(s, HOST, cwd, line).state
    s = finishDeploys(deployApp(s, { name: APP, pkg: APP, jar: `${APP}-1.0.0-mule-application.jar`, target: NAME, targetType: 'Server', props: {}, secrets: {} }).state)
    return callApi(s, { env: 'Sandbox', app: APP, method: 'GET', path: '/docks' }).state
  },
  answers: { 1: 1, 2: 1, 6: 1, 8: 1 },
}

export const LABS = [lab]
