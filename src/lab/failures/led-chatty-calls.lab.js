// The guided lab led-chatty-calls. See platform-labs.js for the shape of a lab.
// A Process API that calls a System API once per order line: slow answers, and a quota used up for every other caller.
import { advance, at, MINUTE, mark } from '../platform.js'
import { app, ask, call, called, change, CLIENTS, policy, recent, sawLogs, until } from '../platform-kit.js'
import { LED, ledClient, ledProject, patchApp } from '../platform-project.js'
import { lookupOf, parallelOf } from './led-chatty-calls.pkg.js'

const { partner, process: proc, inventory, mobile } = LED
const PARTNER_PORTAL = CLIENTS[1]
const LINES = '/partner-orders/O-2040/lines'
const QUOTA = 100 // requests a minute for the Process API on the Inventory API
const BULK = { pkg: 'inventory-sapi-bulk', jar: 'inventory-sapi-1.1.0-mule-application.jar' }
const VARIANTS = {
  [partner.app]: { pkg: 'partner-orders-eapi-lines', jar: 'partner-orders-eapi-1.2.0-mule-application.jar' },
  [proc.app]: { pkg: 'order-fulfilment-papi-lines', jar: 'order-fulfilment-papi-1.4.0-mule-application.jar' },
}

const props = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, name) => app(s, name)?.status === 'Running'
const bulkDeployed = (s) => app(s, inventory.app)?.pkg === BULK.pkg && running(s, inventory.app)
const parallelOk = (s) => {
  const p = props(s, proc.app)
  const { max, ttl } = parallelOf(p)
  return lookupOf(p) === 'parallel' && max >= 2 && max <= 10 && ttl >= 10 && ttl <= 300
}
// the Process API no longer calls once per line, one after the other
const fixed = (s) => running(s, proc.app) && ((lookupOf(props(s, proc.app)) === 'bulk' && bulkDeployed(s)) || parallelOk(s))
// raising the quota is not the fix: the Process API keeps its tier of 100 a minute
const quotaKept = (s) => {
  const api = s.apis.find((a) => a.id === inventory.id)
  const c = api?.contracts.find((x) => x.client === ledClient('process').name && x.status === 'approved')
  const tier = api?.tiers.find((t) => t.name === c?.tier)
  return Boolean(api?.policies.some((p) => p.type === 'rate-limit-sla') && tier) && (tier.requests * 60000) / tier.periodMs <= QUOTA
}
const linesCalls = (s, minutes) => recent(s, partner.app, minutes).filter((e) => /\/lines$/.test(e.p ?? ''))

const lab = {
  id: 'p-fail-led-chatty-calls',
  group: 'API-led failures',
  title: 'A chatty Process API calls once per line',
  minutes: 20,
  scenario:
    'Yesterday Brightmart released a partner endpoint: GET /partner-orders/{orderId}/lines lists the lines of an order with the stock of each line. Partners call it 4 times a minute for the 40 line order O-2040. Since then partners get 504 and 503, and the mobile app gets 503 on order status too. Nothing is down. Find out how many calls one partner request makes, and fix it without raising the quota of the Inventory System API.',
  start() {
    let s = ledProject({
      traffic: [
        { app: mobile.app, env: 'Sandbox', client: 'Mobile App', path: '/my-orders/O-1001', perMinute: 1 },
        { app: partner.app, env: 'Sandbox', client: 'Partner Portal', path: LINES, perMinute: 4 },
      ],
    })
    s = patchApp(s, 'partner', VARIANTS[partner.app])
    s = patchApp(s, 'process', { ...VARIANTS[proc.app], props: { 'inventory.lookup': 'for-each' } })
    s.jars = s.jars.map((j) => (typeof j === 'object' && VARIANTS[j.pkg] ? { ...j, ...VARIANTS[j.pkg] } : j))
    s.jars.push({ ...s.jars.find((j) => j.pkg === inventory.app), ...BULK })
    // the Inventory System API limits each caller by its SLA tier
    const inv = s.apis.find((a) => a.id === inventory.id)
    inv.policies = [policy('rate-limit-sla')]
    inv.tiers = [{ name: 'Internal', requests: QUOTA, periodMs: 60000, autoApprove: false }]
    inv.contracts = inv.contracts.map((c) => ({ ...c, tier: 'Internal' }))
    // Partner Portal has room for the tests of the learner on its own API
    const part = s.apis.find((a) => a.id === partner.id)
    part.contracts = part.contracts.map((c) => (c.client === 'Partner Portal' ? { ...c, tier: 'Gold' } : c))
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'See the failures', how: `Monitoring, Built-in dashboards, ${partner.app}, View. Look at the response time and the errors since 08:30.`, done: (s) => Boolean(s.seen[`dash:${partner.app}`]) },
    {
      title: 'Call the new endpoint',
      how: `API client, ${partner.app} as Partner Portal, GET ${LINES}. The answer is 504 after 5 seconds, or 503 when the quota below is used up.`,
      done: (s) => [502, 503, 504].some((code) => called(s, partner.app, code, 'GET', /\/lines$/)),
    },
    sawLogs(proc.app),
    { title: 'Open the map', how: `Open Visualizer and choose ${proc.app}. Look at the line to ${inventory.app}: it carries far more calls than the line to ${partner.app}.`, done: (s) => Boolean(s.seen.visualizer || s.seen[`vis:${proc.app}`]) },
    ask(
      'Count the calls',
      `The log of ${proc.app} has a line "For Each over 40 order lines". When nothing fails, how many calls to the Inventory API does one partner request make?`,
      ['1', '3', '40', '41'],
      2,
      'One call per line. For Each runs the lines one after the other, so 40 lines are 40 calls in a row. This is the N+1 pattern: one call for the order, then one more for each line.',
    ),
    ask(
      'Read the time',
      `One stock call takes about 140 ms. ${partner.app} waits 5000 ms for the Process API (http.timeout). What does a partner get for O-2040?`,
      ['200, because the calls are cached', 'A 504 from the Experience layer, because 40 calls in a row take about 5.6 seconds', 'A 429 from the quota of Partner Portal'],
      1,
      'The time of a For Each is the sum of its iterations. The Experience API gives up at second 5, and the Process API goes on calling for nobody.',
    ),
    { title: 'Look at the quota', how: `API Manager, ${inventory.name}. Policies: Rate Limiting SLA-Based. Contracts: Order Fulfilment API on the tier Internal, ${QUOTA} requests per minute.`, done: (s) => Boolean(s.seen[`api:${inventory.id}`]) },
    ask(
      'Who gets the 429',
      `Partners send 4 of these requests a minute. Why does the mobile app get 503 on order status too?`,
      ['The mobile app has its own quota on the Inventory API, and it is used up', 'The quota belongs to the client ID of the Process API, so the partner calls use it up for every request that goes through the Process API', 'The partner tier blocks mobile calls'],
      1,
      `The SLA-based policy counts per contract. 4 requests times 40 lines is 160 calls a minute on a quota of ${QUOTA}. Then the Inventory API answers 429, the Process API gets HTTP:TOO_MANY_REQUESTS and answers 503, also for the one stock call of a mobile order status.`,
    ),
    ask(
      'The tempting fix',
      'A teammate wants to give the Process API a tier of 1000 a minute on the Inventory API. What happens?',
      ['The problem is solved', 'The 429s stop, but each request still makes 40 calls in a row, so partners still get 504 and inventory-sapi and the SFTP server carry 40 times the load', 'The Process API gets faster'],
      1,
      'A quota protects the System API and the system behind it. Raising it hides the symptom and moves the load down. The fix is fewer calls per request.',
    ),
    {
      title: 'Add the bulk endpoint below',
      how: `Start at the bottom. Runtime Manager, ${inventory.app}, Settings, Application File inventory-sapi-1.1.0, Apply Changes. Release 1.1.0 adds GET /inventory?skus=H-101,H-102, which reads up to 200 products from one stock file. If your System API team cannot add a bulk endpoint, leave ${inventory.app} as it is and take the parallel way in the next step.`,
      done: (s) => bulkDeployed(s) || parallelOk(s),
    },
    {
      title: 'Ask for the stock in one call',
      how: `Runtime Manager, ${proc.app}, Settings, Properties: inventory.lookup is bulk, Apply Changes. The parallel way, where no bulk endpoint exists: inventory.lookup is parallel, inventory.maxConcurrency is 8 and inventory.cache.ttlSeconds is 30. In the lab this property stands for a new release of the Process API.`,
      done: fixed,
    },
    {
      title: 'Call the endpoint again',
      how: `GET ${LINES} as Partner Portal answers 200 in well under a second. If you still get 503, the quota window of this minute was used up before the fix: move the clock one minute.`,
      done: (s) => fixed(s) && (s.lastCalls ?? []).some((c) => c.app === partner.app && c.status === 200 && /O-2040\/lines$/.test(c.path) && c.ms < 2000),
    },
    ask(
      'Count again',
      'With the bulk endpoint, how many calls to the Inventory API does one request for O-2040 make?',
      ['1', '8', '40'],
      0,
      'One call with 40 SKUs. The parallel way still makes 40 calls, 8 at a time, so about 5 rounds of 140 ms. Its cache saves the calls for SKUs read in the last 30 seconds, and that is what keeps it under the quota.',
    ),
    ask(
      'Why a maximum',
      'Why does the parallel way set maxConcurrency on the Parallel For Each?',
      ['Without it the routes run one after the other', 'Without it all routes start at once, so 40 calls hit the System API and its quota in the same moment', 'The scope does not start without it'],
      1,
      'By default Parallel For Each runs all routes in parallel. maxConcurrency caps that. It also collects every result, and one failed route ends the scope with MULE:COMPOSITE_ROUTING after all routes finish.',
    ),
    {
      title: 'Prove it',
      how: `Move the clock 5 minutes. Partner calls for O-2040 answer 200 in under 2 seconds, mobile calls answer 200, ${inventory.app} has no 429, and the Process API is still on its tier of ${QUOTA} a minute.`,
      done: (s) => {
        if (!fixed(s) || !quotaKept(s)) return false
        const lines = linesCalls(s, 3)
        const mob = recent(s, mobile.app, 3)
        return lines.length > 0 && lines.every((e) => e.s === 200 && e.ms < 2000) && mob.length > 0 && mob.every((e) => e.s === 200) && recent(s, inventory.app, 3).every((e) => e.s !== 429)
      },
    },
  ],
  why:
    'A loop of remote calls costs the sum of all calls in time and the count of all calls in quota. Ask the System API for many items in one call. Where it cannot do that, run the calls in parallel with a cap, and keep a short cache for data that changes slowly. Count the calls per request in the log or in Visualizer before you touch a quota. In the lab the property inventory.lookup stands for a new release of the Process API, the RAML of the bulk resource is not in Exchange, the order lines are made up by the Process API, and the parallel time is counted in rounds of the slowest call.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/parallel-foreach-scope',
  solve(start) {
    let s = mark(start, `dash:${partner.app}`)
    s = call(s, partner.app, PARTNER_PORTAL, LINES).state
    s = mark(mark(mark(s, `logs:${proc.app}`), 'visualizer'), `api:${inventory.id}`)
    s = change(s, inventory.app, { ...BULK })
    s = change(s, proc.app, { props: { ...app(s, proc.app).props, 'inventory.lookup': 'bulk' } })
    s = advance(s, MINUTE)
    s = call(s, partner.app, PARTNER_PORTAL, LINES).state
    return advance(s, 5 * MINUTE)
  },
  answers: { 4: 2, 5: 1, 7: 1, 8: 1, 12: 0, 13: 1 },
}

export const LABS = [lab]
