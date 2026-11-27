// The guided lab hyb-disconnected. See platform-labs.js for the shape of a lab.
import { at, callApi, CONTROL_PLANE, deployApp, finishDeploys, mark, MINUTE, newHybrid, newPlatform, newServer, serverByHost, serverStatus, setOutbound } from '../platform.js'
import { run } from '../platform-server.js'
import { app, ask, OPS, until } from '../platform-kit.js'

const HOST = 'HBR-MULE-01'
const NAME = 'mule-01'
const OLD = 'carrier-rates-papi'
const NEW = 'label-print-papi'
const CUT = at(1, 7, 40) // the firewall change
const server = (s) => serverByHost(s, HOST)
const toServer = (name) => ({ name, pkg: name, jar: `${name}-1.0.0-mule-application.jar`, target: NAME, targetType: 'Server', props: {}, secrets: {} })
const ok = (s, name, since = 0) => (s.lastCalls ?? []).some((c) => c.app === name && c.env === 'Sandbox' && c.status === 200 && c.t > since)
const newOnServer = (s) => {
  const a = app(s, NEW)
  return a?.targetType === 'Server' && a.target === NAME ? a : null
}

const lab = {
  id: 'p-hyb-disconnected',
  group: 'Your own servers',
  title: 'The server shows Disconnected',
  minutes: 15,
  scenario:
    'Brightmart runs carrier-rates-papi on its Windows server HBR-MULE-01, registered in Sandbox as mule-01. At 07:40 the network team rolled out a new firewall policy in the data center. Since then Runtime Manager shows mule-01 as Disconnected. Callers have not complained. Today you must deploy the new label-print-papi to the same server.',
  start() {
    let s = newPlatform({ clock: at(0, 10), jars: [OLD, NEW], hybrid: newHybrid([newServer(HOST, { ip: '10.20.1.11', agent: { env: 'Sandbox', name: NAME } })]) })
    s = finishDeploys(deployApp(s, toServer(OLD)).state)
    s.traffic = [{ app: OLD, env: 'Sandbox', path: '/rates', perMinute: 2, every: 5 }]
    s = until(s, CUT)
    s = setOutbound(s, HOST, false)
    s = until(s, at(1, 9))
    const x = server(s)
    // the agent retries and writes a line each time
    for (let t = CUT + 5 * MINUTE; t < at(1, 9); t += 20 * MINUTE) x.log.push({ t, level: 'ERROR', text: `Runtime Manager agent could not connect to ${CONTROL_PLANE}. Connection timed out. Retrying.` })
    x.log.sort((a, b) => a.t - b.t)
    s.mail.push({
      t: at(1, 8, 30),
      to: OPS,
      subject: 'Firewall policy rolled out',
      body: 'Good morning. At 07:40 we rolled out the new outbound policy for the data center servers. Only the destinations on the approved list may be reached now. Tell us if anything is missing.',
      source: 'Network team',
    })
    return s
  },
  steps: [
    {
      title: 'Open the server and its log',
      how: 'Open the Data center. Look at the chain from Anypoint to the apps folder, then open logs and mule_ee.log in File Explorer, or run type ..\\logs\\mule_ee.log in PowerShell.',
      done: (s) => Boolean(s.seen[`server:${HOST}`]),
    },
    ask(
      'Read mule_ee.log',
      'What does the log say since 07:40?',
      ['The Mule runtime stopped', 'carrier-rates-papi failed to start', 'The agent lost its connection to the control plane and cannot connect again: connection timed out', 'The registration token expired'],
      2,
      'The runtime and the application did not stop. Only the agent lost the link to wss://runtime-manager.anypoint.mulesoft.com:443/mule, and each retry times out.',
    ),
    {
      title: 'Call the running application',
      how: `API client, ${OLD}, GET /rates. It answers 200 through the Brightmart load balancer, with X-Lab-Server: mule-01.`,
      done: (s) => ok(s, OLD),
    },
    ask(
      'Why it still answers',
      `Why does ${OLD} answer while Runtime Manager shows Disconnected?`,
      ['Runtime Manager forwards the calls from its cache', 'The runtime on the server runs the application; Runtime Manager is the control plane and is not in the path of the calls', 'The load balancer has a copy of the application', 'It will stop within an hour'],
      1,
      'Applications keep serving traffic while Runtime Manager is unreachable. What you lose is control: deployments, changes and monitoring data from Runtime Manager.',
    ),
    {
      title: `Deploy ${NEW}`,
      how: `Runtime Manager, Deploy application. Name ${NEW}, Deployment Target Server: mule-01, your data center, Application File ${NEW}-1.0.0-mule-application.jar. Deploy and open its Dashboard.`,
      done: (s) => Boolean(newOnServer(s)),
    },
    ask(
      'Read the Dashboard',
      `What happens to ${NEW}?`,
      ['It runs on mule-01 at once', 'It fails with an error in the application', 'It waits: the server has no connection, so the agent cannot receive it', 'Runtime Manager runs it in CloudHub instead'],
      2,
      'Runtime Manager sends a deployment to the agent over the WebSocket the agent opened. With that connection down, the deployment waits until the server connects again.',
    ),
    ask(
      'Test the connection',
      'In PowerShell on HBR-MULE-01 run Test-NetConnection runtime-manager.anypoint.mulesoft.com -Port 443. What is TcpTestSucceeded?',
      ['True', 'False', 'The command is not allowed', 'It shows the inbound port 443 is closed'],
      1,
      'False: the server cannot open a TCP connection out to the control plane on 443. Together with the new firewall policy at 07:40, that points at the outbound rule.',
    ),
    ask(
      'Which direction',
      'Which direction does the connection between the agent and Runtime Manager go?',
      ['From Runtime Manager into the data center', 'From the agent on the server out to Runtime Manager', 'Both directions, on two different ports', 'Through the load balancer of Brightmart'],
      1,
      'The agent makes an outbound HTTPS connection and upgrades it to a secure WebSocket on port 443. Runtime Manager sends its commands back on that open connection.',
    ),
    ask(
      'No inbound port',
      'Why does the data center need no inbound port for Runtime Manager?',
      ['Runtime Manager uses VPN', 'Because the agent opens the connection from inside, the replies and commands come back on it', 'Because Runtime Manager uses port 80', 'Because the server group forwards the commands'],
      1,
      'Inbound connectivity is not required. The firewall only needs to let the server reach the Anypoint hosts on 443, which is the rule the new policy dropped.',
    ),
    {
      title: 'Restore the outbound rule',
      how: 'Data center, HBR-MULE-01, Data center firewall. Tick Allow outbound HTTPS on port 443. Run Test-NetConnection again: TcpTestSucceeded is True. mule_ee.log shows the agent connected.',
      done: (s) => Boolean(server(s)?.outbound) && serverStatus(server(s)) === 'Running',
    },
    {
      title: 'See the waiting deployment go out',
      how: `Open ${NEW} in Runtime Manager. The agent received it when it connected, so the node table shows mule-01 Started. dir ..\\apps in PowerShell shows its folder and anchor file.`,
      done: (s) => newOnServer(s)?.status === 'Running' && newOnServer(s).nodes?.[NAME] === 'Started',
    },
    {
      title: `Call ${NEW}`,
      how: `API client, ${NEW}, GET /labels/L-1001. You get 200 from mule-01.`,
      done: (s) => newOnServer(s)?.status === 'Running' && ok(s, NEW),
    },
  ],
  why: 'The Runtime Manager agent connects out from the server: an HTTPS connection that becomes a secure WebSocket on port 443. A firewall change that blocks outbound 443 cuts that link, and Runtime Manager shows the server as Disconnected. The runtime keeps running and the applications keep serving through your load balancer, but nothing new reaches the server: deployments wait. Test-NetConnection on port 443 shows the cause from the server itself. No inbound rule is needed, so the fix is the outbound rule. In the lab the waiting deployment goes out as soon as the agent connects. Sources: https://docs.mulesoft.com/runtime-manager/runtime-manager-agent, https://docs.mulesoft.com/runtime-manager/rtm-agent-whitelists and https://docs.mulesoft.com/mule-runtime/latest/hot-deployment',
  docs: 'https://docs.mulesoft.com/runtime-manager/rtm-agent-whitelists',
  solve(start) {
    let s = mark(mark(start, `server:${HOST}`), 'inbox')
    const bin = `${server(s).home}\\bin`
    s = callApi(s, { env: 'Sandbox', app: OLD, method: 'GET', path: '/rates' }).state
    s = finishDeploys(deployApp(s, toServer(NEW)).state)
    s = run(s, HOST, bin, 'Test-NetConnection runtime-manager.anypoint.mulesoft.com -Port 443').state
    s = setOutbound(s, HOST, true)
    return callApi(s, { env: 'Sandbox', app: NEW, method: 'GET', path: '/labels/L-1001' }).state
  },
  answers: { 1: 2, 3: 1, 5: 2, 6: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
