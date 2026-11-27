// The guided lab flex-gateway-down. See platform-labs.js for the shape of a lab.
import { advance, apiById, at, MINUTE, mark, newPlatform, setApi } from '../platform.js'
import { ask, CLIENTS, OPS, policy, until } from '../platform-kit.js'
import { addEgressRule, callsOf, controlChecks, FLEX, flexApi, gatewayOf, latestOf, newFlex, newGateway, restartGateway } from '../platform-flex.js'

const API = '19600301'
const PARTNER = 'Partner Portal'
const LEAK_IP = '203.0.113.40'
const api = (s) => apiById(s, API)
const gw = (s) => gatewayOf(s, FLEX)

const lab = {
  id: 'p-flex-gateway-down',
  group: 'Runtime Fabric and gateways',
  title: 'The gateway is Disconnected and the new policy is not there',
  minutes: 25,
  scenario: `The Partner Tracking API runs on the Flex Gateway ${FLEX} in the Harbor data center. The client secret of the Partner Portal leaked and is used from ${LEAK_IP}. At 07:10 the security team added an IP Allowlist with the partner network to the API in API Manager and closed the incident. Since a data center firewall change at 06:30, Runtime Manager shows the gateway Disconnected, but partner traffic still flows. It is 08:20. Find out whether the allowlist works, and make it work.`,
  start() {
    const clock = at(1, 5)
    let s = newPlatform({
      clock,
      clients: structuredClone(CLIENTS),
      apis: [
        flexApi(API, {
          name: 'Partner Tracking API', assetId: 'partner-tracking-api', label: 'flex', basePath: '/partner-tracking', upstream: 'http://tracking-svc.harbor.local:8080/api', consumer: 'https://flex-dc.harbor.example/partner-tracking', t: clock,
          policies: [policy('client-id')],
          contracts: [{ client: PARTNER, tier: '', status: 'approved', t: clock }],
        }),
      ],
      flex: newFlex({
        created: clock,
        gateways: { [FLEX]: newGateway(FLEX, { since: clock, lastSeen: clock }) },
        traffic: [
          { api: API, n: 4, ip: '198.51.100.7', client: PARTNER, path: '/parcels/HB-77120', ua: 'harbor-partner-portal/2.1' },
          { api: API, n: 2, ip: LEAK_IP, client: PARTNER, path: '/parcels?all=true', ua: 'Go-http-client/1.1' },
        ],
      }),
    })
    s = until(s, at(1, 6, 30))
    // CHG 20417: the DMZ allows named destinations only. The broad HTTPS rule is gone and nobody listed the control plane.
    s = structuredClone(s)
    s.flex.gateways[FLEX].egress = [
      { dest: 'tracking-svc.harbor.local', port: 8080, action: 'Allow', note: 'Upstream of the Partner Tracking API' },
      { dest: 'repo.harbor.local', port: 443, action: 'Allow', note: 'Package mirror' },
      { dest: 'ntp.harbor.local', port: 123, action: 'Allow', note: 'Time' },
    ]
    s = until(s, at(1, 7, 10))
    s = setApi(s, API, { policies: [policy('ip-allow', { list: '198.51.100.0/24' }), ...api(s).policies] })
    s = until(s, at(1, 8, 15))
    s.mail.push(
      {
        t: at(1, 7, 15),
        to: OPS,
        subject: 'Incident closed: leaked partner secret',
        body: `Hello. The Partner Tracking API now has an IP Allowlist with the partner network 198.51.100.0/24. Calls with the leaked secret from ${LEAK_IP} are refused. We closed the incident. The partner rotates the secret on Friday. Harbor security team`,
        source: 'Harbor security team',
      },
      {
        t: at(1, 8, 12),
        to: OPS,
        subject: `${FLEX} is Disconnected`,
        body: `Runtime Manager shows the Flex Gateway ${FLEX} as Disconnected since about 06:31. The firewall team applied change CHG 20417 to the DMZ at 06:30, which allows named destinations only. Partner calls still answer, so nobody was paged. Network operations`,
        source: 'Network operations',
      },
    )
    return until(s, at(1, 8, 20))
  },
  steps: [
    { title: 'Read the mails', how: 'Open the Inbox from the menu under Lab tools. There is one from security and one from network operations.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Open ${FLEX}`,
      how: `Flex Gateway, Flex Gateways, ${FLEX}. Look at the status, the last seen time of the replicas and the note on the Overview. Then open APIs and compare the applied and the latest configuration version.`,
      done: (s) => Boolean(s.seen[`flex:${FLEX}`]),
    },
    ask(
      'Is the allowlist enforced',
      'Partner calls still work. Does the gateway refuse the calls from the leaked secret?',
      [
        'Yes, API Manager enforces the policy in the cloud',
        'No. The gateway lost the control plane at 06:31 and keeps serving with the configuration it applied last, without the allowlist. The version with the IP Allowlist waits in the control plane until the gateway reconnects, so the leaked secret still works',
        'Yes, because traffic still flows the gateway must have the latest policies',
        'No, an IP Allowlist does not work on Flex Gateway',
      ],
      1,
      'In Connected Mode the policies are enforced by the gateway on your host, not by Anypoint. API Manager only stores the configuration and the gateway pulls it. A gateway that cannot reach the control plane cannot learn about a change, and it is designed to keep serving rather than to stop the traffic.',
    ),
    {
      title: 'Find why the gateway cannot connect',
      how: `${FLEX}, Logs. Choose Gateway agent and read the error of flex-gateway-agent.`,
      done: (s) => Boolean(s.seen['flex-logs']),
    },
    {
      title: 'Allow the control plane in the firewall',
      how: `${FLEX}, Host network. Add outbound Allow rules on port 443 with Add rule until every control plane host in the Connectivity check shows Allowed. A rule for *.domain does not match the domain itself.`,
      done: (s) => controlChecks(gw(s)).every((c) => c.allowed),
    },
    {
      title: 'Reconnect the gateway',
      how: `${FLEX}, Overview, Restart flex-gateway, or move the clock a minute: the agent retries by itself. The status turns Connected and the last seen time is now.`,
      done: (s) => gw(s).status === 'Connected' && controlChecks(gw(s)).every((c) => c.allowed) && gw(s).lastSeen >= s.clock - 2 * MINUTE,
    },
    {
      title: 'Check the applied configuration version',
      how: `${FLEX}, APIs. The applied configuration of the Partner Tracking API must be the latest version, with IP Allowlist first in the list of policies the gateway runs.`,
      done: (s) => {
        const l = latestOf(s, api(s))
        return gw(s).applied[API]?.sig === l.sig && Boolean(s.seen[`flex-sync:${API}:v${l.v}`]) && gw(s).applied[API].policies.some((p) => p.type === 'ip-allow')
      },
    },
    {
      title: 'See the leaked secret refused',
      how: `Move the clock 2 minutes and open the Logs: the calls from ${LEAK_IP} answer 403 now, the partner calls 200.`,
      done: (s) => callsOf(s, API).some((c) => c.ip === LEAK_IP && c.s === 403) && callsOf(s, API, s.clock - 2 * MINUTE).some((c) => c.ip !== LEAK_IP && c.s === 200),
    },
    ask(
      'What Connected Mode needs',
      'Which statement about a Flex Gateway in Connected Mode is right?',
      [
        'Anypoint opens an inbound connection to the gateway on port 8081, so the firewall must allow it',
        'It needs a registration with flexctl and outbound HTTPS on 443 from every replica to the control plane hosts. Nothing comes in from Anypoint. While disconnected it keeps serving its APIs with the last applied policies and certificates, but new APIs, policy changes and contract changes do not reach it, and Runtime Manager shows it Disconnected',
        'When the control plane is unreachable the gateway stops all traffic to be safe',
        'Connected Mode stores the policies on the gateway host as YAML that you edit by hand',
      ],
      1,
      'A disconnected gateway fails open on configuration: it is safe for availability and unsafe for a security change that is urgent. That is why a Disconnected gateway should alert, and why a security fix is not done until the applied configuration version on the gateway is the latest. Local Mode is the other way round: YAML files on the host and no control plane at all.',
    ),
  ],
  why: 'In Connected Mode a Flex Gateway calls the Anypoint control plane outbound on port 443: it sends heartbeats, so Runtime Manager shows it Connected with a last seen time, and it pulls the configuration of its APIs from API Manager. A firewall that blocks those hosts leaves the gateway Disconnected. It keeps serving with the configuration it applied last, so traffic flows and nobody notices, but every change in API Manager waits in the control plane. Check the applied configuration version on the gateway after a security change. The control plane hosts of the lab are a short list made for the lab; the real list is on the Flex Gateway prerequisites page. In the lab the agent retries once a lab minute.',
  docs: 'https://docs.mulesoft.com/gateway/latest/',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `flex:${FLEX}`), 'flex-logs')
    for (const dest of ['anypoint.mulesoft.com', '*.anypoint.mulesoft.com']) s = addEgressRule(s, FLEX, { dest, port: '443', action: 'Allow', note: 'Anypoint control plane' }).state
    s = restartGateway(s, FLEX)
    s = mark(s, `flex-sync:${API}:v${latestOf(s, api(s)).v}`)
    return advance(s, 3 * MINUTE)
  },
  answers: { 2: 1, 8: 1 },
}

export const LABS = [lab]
