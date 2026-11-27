// The guided lab net-vpn-dns. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, OPS, sawLogs, until } from '../platform-kit.js'
import { addInternalDomain, addVpnRoute, inCidr, newNetwork, newSpace, newVpn, resolve, spaceOf } from '../platform-network.js'
import { FLOW, NAME } from './net-vpn-dns.pkg.js'

const SPACE = 'harbor-ps'
const VPN = 'harbor-dc-vpn'
const ERP = 'erp.corp.harbor.lab'
const ERP_IP = '10.40.12.30'

const space = (s) => spaceOf(s, SPACE)
const vpn = (s) => space(s)?.vpns.find((v) => v.name === VPN)
const dnsOk = (s) => resolve(s, app(s, NAME), ERP).ok
const routeOk = (s) => (vpn(s)?.routes ?? []).some((r) => inCidr(ERP_IP, r))
const lastRun = (s) => app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last

const lab = {
  id: 'p-net-vpn-dns',
  group: 'Networking',
  title: 'The ERP that cannot be found',
  minutes: 20,
  scenario:
    'harbor-erp-stock-sync runs in the private space harbor-ps and reads stock levels from the ERP in the Harbor data center every 5 minutes, over the VPN harbor-dc-vpn. Over the weekend the ERP team moved the ERP to a new network and asked all apps to use its name instead of the old address. It is Tuesday 09:00. The app was deployed with the new name at 08:00, and the web shop has had no stock update since. The Inbox has the mails.',
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      jars: [NAME],
      apps: [newApp(NAME, { target: SPACE, publicEndpoint: false, props: { 'erp.host': ERP, 'erp.port': '8443' }, store: {}, updated: at(1, 8) })],
      network: newNetwork({
        spaces: [
          newSpace(SPACE, {
            staticIps: { enabled: true, state: 'Available', ips: ['203.0.113.24', '203.0.113.25'], pool: ['203.0.113.24', '203.0.113.25'] },
            vpns: [
              newVpn(VPN, {
                routes: ['10.20.0.0/16'],
                tunnels: [
                  { name: 'Tunnel 1', outsideIp: '192.0.2.201', insideCidr: '169.254.10.0/30', status: 'UP' },
                  { name: 'Tunnel 2', outsideIp: '192.0.2.202', insideCidr: '169.254.11.0/30', status: 'DOWN' },
                ],
                log: [
                  { t: at(0, 22, 10), text: 'Tunnel 2 (192.0.2.202) is DOWN. IKE phase 1 failed: the remote gateway did not answer.' },
                  { t: at(0, 22, 11), text: 'Tunnel 1 (192.0.2.201) is UP and carries the traffic.' },
                ],
              }),
            ],
            dns: [],
          }),
        ],
      }),
      mail: [
        {
          t: at(0, 7),
          to: OPS,
          subject: 'ERP moved to the new data center network',
          body: `The ERP now runs at ${ERP_IP} in the new network 10.40.0.0/16. Please use the name ${ERP} and not an address. Our DNS servers 10.20.0.53 and 10.20.0.54 answer for corp.harbor.lab. Harbor ERP team`,
          source: 'Harbor ERP team',
        },
        {
          t: at(0, 22, 30),
          to: OPS,
          subject: 'VPN maintenance on our side',
          body: `Tunnel 2 of ${VPN} is down after the firewall work on our gateway tonight. Tunnel 1 carries the traffic, so nothing should stop. We fix tunnel 2 on Thursday. Harbor network team`,
          source: 'Harbor network team',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each run fails with HTTP:CONNECTIVITY and java.net.UnknownHostException for ${ERP}.` },
    ask(
      'Read the error',
      `The app runs in ${SPACE}, which has a VPN to the data center. Why can it not resolve ${ERP}?`,
      [
        'The ERP is down',
        `A private space asks its default DNS, which knows public names only. Names of your own network resolve only when the private space forwards their domain to your DNS servers as an internal domain`,
        'The VPN encrypts the name, so DNS cannot read it',
        'The app needs a public endpoint to use DNS',
      ],
      1,
      'UnknownHostException comes before any connection: no address was found for the name. The ERP being down would give a timeout or a refused connection. corp.harbor.lab lives only on the company DNS servers, so the space must forward that domain to them over the VPN.',
    ),
    {
      title: 'Open the DNS settings of the space',
      how: `Private spaces from the console menu, ${SPACE}, tab DNS. The list of internal domains is empty.`,
      done: (s) => Boolean(s.seen[`ps-dns:${SPACE}`]),
    },
    {
      title: 'Forward the company domain',
      how: `On the DNS tab add the internal domain corp.harbor.lab with the DNS servers from the mail of the ERP team, 10.20.0.53 and 10.20.0.54. They sit in 10.20.0.0/16, which the VPN already routes.`,
      done: dnsOk,
    },
    ask(
      'Read the next error',
      `The name now resolves to ${ERP_IP}, and the next run fails with connect timed out. What is missing?`,
      [
        'The ERP refuses the app, so the port is closed',
        `A route to the new network: the VPN sends only 10.20.0.0/16 to the data center, so packets to ${ERP_IP} have no path and nothing ever answers`,
        'A static IP for the app',
        'The DNS answer is wrong',
      ],
      1,
      'A closed port answers at once with Connection refused. A timeout means no answer came back, which is what happens when the packets have no path or a firewall drops them. A static route tells the space which ranges to send through the VPN tunnels.',
    ),
    {
      title: 'Open the VPN connection',
      how: `Private spaces, ${SPACE}, tab Private network. Look at ${VPN}: its static routes, the status of both tunnels, and its log.`,
      done: (s) => Boolean(s.seen[`ps-vpn:${SPACE}`]),
    },
    {
      title: 'Route the new network through the VPN',
      how: `On ${VPN} add the static route 10.40.0.0/16. The connection is Updating for about two minutes. Do not add 10.0.0.0/8: it overlaps the CIDR block of the space.`,
      done: routeOk,
    },
    ask(
      'One tunnel is DOWN',
      'Tunnel 2 is DOWN and tunnel 1 is UP. What does that mean for the app?',
      [
        'The app cannot reach the data center until both tunnels are UP',
        'Each VPN connection has two tunnels for redundancy. Traffic uses the tunnel that is UP, so the app works, but there is no spare until the network team fixes tunnel 2',
        'Tunnel 2 carries DNS and tunnel 1 carries the rest',
        'A DOWN tunnel means the route is missing',
      ],
      1,
      'With both tunnels DOWN every call to the data center would time out, the same as a missing route. One tunnel DOWN is a risk to watch, not the cause here. Ask for it to be fixed and add an alert on the tunnel state.',
    ),
    {
      title: 'Watch the next run',
      how: 'Move the clock until the next run after the route is active. The run reads the stock and the web shop is up to date.',
      done: (s) => routeOk(s) && dnsOk(s) && Boolean(lastRun(s)?.ok) && (app(s, NAME).store?.synced ?? 0) > 0,
    },
  ],
  why: 'An app in a private space reaches your own network in two steps. First the name must resolve: the space forwards each internal domain you list to your DNS servers, and every other name goes to its default DNS, which knows public names only. Then the packets need a path: the VPN or transit gateway carries only the ranges in its routes, and a range without a route, a tunnel that is down, or an outbound firewall rule that blocks the port all give a connect timeout. UnknownHostException points at DNS, a timeout at routes, tunnels or firewalls, and Connection refused at the target itself. In the lab the company DNS servers are a list of addresses and route changes take about two minutes.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ps-create-configure-vpn',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), `ps-dns:${SPACE}`)
    s = addInternalDomain(s, SPACE, 'corp.harbor.lab', ['10.20.0.53', '10.20.0.54']).state
    s = mark(advance(s, MINUTE), `ps-vpn:${SPACE}`)
    s = addVpnRoute(s, SPACE, VPN, '10.40.0.0/16').state
    return advance(s, 9 * MINUTE)
  },
  answers: { 1: 1, 4: 1, 7: 1 },
}

export const LABS = [lab]
