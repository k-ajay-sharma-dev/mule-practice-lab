// The guided lab sec-ip-allowlist. See platform-labs.js for the shape of a lab.
import { advance, apiById, at, MINUTE, newApi, newApp, newPlatform, setApi } from '../platform.js'
import { ask, creds, OPS, policy, recent, sawLogs, until } from '../platform-kit.js'
import { CALLERS, DATA_CENTER, LB_IP, OFFICE, TEAMMATE_LIST } from './sec-ip-allowlist.pkg.js'

const NAME = 'stock-internal-api'
const API_ID = '19600710'
const REMOTE = '#[attributes.remoteAddress]'

// The address forms the IP Allowlist page shows: one address, a range with a mask, or leading octets
const toNumber = (ip) => String(ip).trim().split('.').reduce((n, x) => n * 256 + Number(x), 0)
function inEntry(ip, entry) {
  const [base, bits] = entry.trim().split('/')
  if (!base) return false
  if (bits === undefined) {
    const octets = base.split('.')
    return octets.length < 4 ? ip.split('.').slice(0, octets.length).join('.') === base : ip === base
  }
  const size = 2 ** (32 - Number(bits))
  return Math.floor(toNumber(ip) / size) === Math.floor(toNumber(base) / size)
}
const listed = (list, ip) => String(list ?? '').split(',').some((e) => inEntry(ip, e))

const allowlists = (s) => (apiById(s, API_ID)?.policies ?? []).filter((p) => p.type === 'ip-allow')
// one allowlist on the remote address that lets the company network in and keeps the load balancer out
const rightList = (s) => {
  const list = allowlists(s)
  return list.length > 0 && list.every((p) => p.settings.expression === REMOTE && !listed(p.settings.list, LB_IP) && [CALLERS.WAREHOUSE.ip, CALLERS.SYNC.ip].every((ip) => listed(p.settings.list, ip)))
}
const of = (s, caller) => recent(s, NAME, 5).filter((e) => e.c === caller.name)

const MAIL_SCAN = {
  t: at(1, 8, 30),
  to: OPS,
  subject: 'Finding SEC-311: stock-internal-api answers from the internet',
  body: [
    'Hello integration team,',
    `our external scanner at 203.0.113.77 calls https://${NAME}-lab1a2.sbx.usa-e2.cloudhub.example/api/stock every few minutes and gets 200 with stock and cost prices. This API is meant for the company network only.`,
    `We saw that an IP Allowlist was added yesterday with ${TEAMMATE_LIST}. It does not stop us. Please fix it today.`,
    `For your network map: the office VPN is ${OFFICE}, the data center is ${DATA_CENTER}, and the public load balancer lb-edge talks to your API from ${LB_IP}.`,
    'Security team, Brightmart',
  ].join('\n\n'),
  source: 'Security team',
}

const lab = {
  id: 'p-sec-ip-allowlist',
  group: 'Security',
  title: 'An internal API is open to the internet',
  minutes: 12,
  scenario: [
    `It is 09:00. ${NAME} gives stock and cost prices to the warehouse and to a stock sync job. Both run on the company network.`,
    'The API has a public endpoint, so the internet reaches it too. Yesterday a teammate added an IP Allowlist with every private range. This morning the security team still gets 200 from the internet.',
    `In this lab, callers on the company network reach the API with their own address. Callers from the internet come through the public load balancer lb-edge, which opens a new connection from ${LB_IP} and puts the original address in X-Forwarded-For.`,
  ].join(' '),
  start() {
    let s = newPlatform({ clock: at(1, 8), clients: Object.values(CALLERS).map(({ ip, origin, ...c }) => c), mail: [MAIL_SCAN] })
    const c = creds(s, 'Sandbox')
    s.apis = [newApi(API_ID, { name: 'Stock Internal API', assetId: 'stock-internal-api', label: 'stock-sbx', seen: true, policies: [policy('ip-allow', { expression: REMOTE, list: TEAMMATE_LIST })] })]
    s.apps = [newApp(NAME, { props: { 'api.id': API_ID, ...c.props }, secrets: c.secrets, autodiscovery: { apiId: '${api.id}', flowRef: `${NAME}-main` } })]
    s.traffic = [
      { app: NAME, env: 'Sandbox', path: '/stock', perMinute: 1, every: 2, client: CALLERS.WAREHOUSE.name, ip: CALLERS.WAREHOUSE.ip },
      { app: NAME, env: 'Sandbox', path: '/stock', perMinute: 1, every: 3, client: CALLERS.SYNC.name, ip: CALLERS.SYNC.ip },
      { app: NAME, env: 'Sandbox', path: '/stock', perMinute: 1, every: 4, client: CALLERS.SCANNER.name, ip: CALLERS.SCANNER.ip },
    ]
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the finding', how: 'Open the Inbox from the menu and read the mail of the security team. Note the three address ranges at the end.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Look at the policy', how: 'API Manager, Stock Internal API, Policies. Open the IP Allowlist and read the IP expression and the list.', done: (s) => Boolean(s.seen[`api:${API_ID}`]) },
    sawLogs(NAME),
    ask(
      'Read the address',
      'The log has a line for each call that comes through the load balancer. Which address does the API, and so the policy with #[attributes.remoteAddress], see for the scanner?',
      ['203.0.113.77, the scanner', `${LB_IP}, the load balancer`, '10.1.8.20, the warehouse', 'No address at all'],
      1,
      `remoteAddress is the address of the connection that reached the API. Behind a load balancer that is the load balancer. The original address 203.0.113.77 is only in the X-Forwarded-For header.`,
    ),
    ask(
      'Explain the gap',
      `Why does the allowlist ${TEAMMATE_LIST} let the scanner in?`,
      ['The policy is off', `${LB_IP} is a private address inside 10.0.0.0/8, so every internet call through the load balancer looks internal`, 'The scanner sends a client ID', 'IP Allowlist only checks POST'],
      1,
      'Every private range also holds the load balancer. With the remote address as the source, the internet arrives with an allowed address. Allow only the ranges your callers really use.',
    ),
    {
      title: 'Allow only the company ranges',
      how: `Policies, IP Allowlist, Edit. Keep the IP expression ${REMOTE}. Set the list to ${OFFICE}, ${DATA_CENTER}. Save. Do not add ${LB_IP} or a range that holds it.`,
      done: rightList,
    },
    ask(
      'Check your own client',
      'The API client of the lab sends from 10.1.2.3. After the change, what does a call from it get?',
      ['403, because the API client is on the internet', `200, because 10.1.2.3 is inside ${OFFICE}, the office VPN`, '401, because there is no client ID'],
      1,
      `10.1.2.3 matches ${OFFICE}. A range with a mask of 16 keeps the first two octets, so every 10.1.x.x address matches.`,
    ),
    ask(
      'Plan for a partner',
      'Next month the partner Bayline Logistics, at 198.51.100.0/24, must call the API through the load balancer. What do you change?',
      [
        'Add 198.51.100.0/24 to this list and keep the remote address',
        `Add ${LB_IP} to the list`,
        "Read the address from #[attributes.headers['x-forwarded-for']] and allow the partner and company ranges. Make sure every caller comes through the load balancer, and that the load balancer replaces any X-Forwarded-For value the caller sends",
        'Remove the policy and trust the client ID',
      ],
      2,
      'Behind the load balancer the original address is only in X-Forwarded-For. A caller that does not pass the load balancer has no such header, and a caller can write the header itself, so the load balancer must be the only way in and must set the value. With the remote address the partner looks like the load balancer, and allowing the load balancer opens the API to everyone.',
    ),
    {
      title: 'Prove it with the traffic',
      how: 'Move the clock 5 minutes. The scanner gets 403 from the policy. The warehouse and the stock sync job still get 200. Monitoring, Built-in dashboards shows it too.',
      done: (s) => {
        const scan = of(s, CALLERS.SCANNER)
        const inside = [...of(s, CALLERS.WAREHOUSE), ...of(s, CALLERS.SYNC)]
        return rightList(s) && scan.length > 0 && scan.every((e) => e.s === 403) && of(s, CALLERS.WAREHOUSE).length > 0 && of(s, CALLERS.SYNC).length > 0 && inside.every((e) => e.s === 200)
      },
    },
  ],
  why: `The IP Allowlist checks the address its IP expression returns, and the remote address is the last hop of the connection. Behind a load balancer or proxy that hop is the load balancer, so a list of every private range lets the whole internet in. List the real ranges of your callers. When callers come through the load balancer, read X-Forwarded-For instead, and make the load balancer the only way in. The best fix for an internal API is also not to publish it on the internet at all, with the allowlist as a second line. The lab simplifies: the gateway gets no request headers, so the application writes the X-Forwarded-For value to its log, and the network paths are how the lab models them.`,
  docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-ip-allowlist',
  solve(start) {
    let s = { ...start, seen: { ...start.seen, inbox: start.clock, [`api:${API_ID}`]: start.clock, [`logs:${NAME}`]: start.clock } }
    const api = apiById(s, API_ID)
    s = setApi(s, API_ID, { policies: api.policies.map((p) => (p.type === 'ip-allow' ? { ...p, settings: { ...p.settings, list: `${OFFICE}, ${DATA_CENTER}` } } : p)) })
    return advance(s, 5 * MINUTE)
  },
  answers: { 3: 1, 4: 1, 6: 1, 7: 2 },
}

export const LABS = [lab]
