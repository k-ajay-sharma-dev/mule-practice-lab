// The guided lab ch2-capacity. See platform-labs.js for the shape of a lab.
import { advance, at, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { CPU_TARGET, loadOf, N1_LIMIT, runLoadTest, testsOf } from '../platform-capacity.js'
import { DEALS_API, PROFILE, SAMPLE } from './ch2-capacity.pkg.js'

const NORMAL = 600
const PEAK = 6 * NORMAL
const BUDGET = 4
const P95 = 400
const deals = (s) => app(s, DEALS_API)
// the planner's model of an option at the Black Friday peak, with every replica and with one down
const at6 = (replicas, vCores) => loadOf({ replicas, vCores, perMinute: PEAK, requestMs: PROFILE.requestMs, payloadKb: PROFILE.payloadKb })
const planned = (s) => {
  const a = deals(s)
  if (a?.status !== 'Running') return false
  const peak = at6(a.replicas, a.vCores)
  const down = at6(a.replicas - 1, a.vCores)
  return a.replicas * a.vCores <= BUDGET && peak.cpu < CPU_TARGET && a.replicas >= 2 && down.cpu < N1_LIMIT && down.reject === 0
}
const test = (s, extra = {}) => runLoadTest(s, { app: DEALS_API, path: PROFILE.path, method: PROFILE.method, perMinute: PEAK, minutes: 10, sample: SAMPLE, ...extra }, advance)

const lab = {
  id: 'p-ch2-capacity',
  group: 'Scaling and release',
  title: 'Size an API for Black Friday',
  minutes: 25,
  scenario: `${DEALS_API} serves the offers on the home page of the Brightmart web shop. Today it runs on CloudHub 2.0 as 1 replica of 0.5 vCore, with about ${NORMAL} requests a minute at about 70 percent CPU. Black Friday is next week and marketing expects 6 times the traffic. You have ${BUDGET} vCores for this API. Size it so it keeps peak CPU under ${CPU_TARGET} percent, survives the loss of one replica, and answers with a p95 under ${P95} ms.`,
  start() {
    let s = newPlatform({
      clock: at(1, 8),
      apps: [newApp(DEALS_API, { vCores: 0.5, props: { 'pricing.url': 'https://brightmart-pricing-sapi-lab1a2.internal-sbx.usa-e2.cloudhub.example/api' } })],
      traffic: [{ app: DEALS_API, env: 'Sandbox', method: 'GET', path: '/deals', perMinute: NORMAL / SAMPLE, sample: SAMPLE, client: '' }],
    })
    s = until(s, at(1, 9, 50))
    s = {
      ...s,
      mail: [
        ...s.mail,
        {
          t: s.clock,
          to: OPS,
          subject: 'Black Friday: deals API',
          body: `Last year the home page was slow for an hour on Black Friday. This year we expect 6 times the normal traffic, about ${PEAK} requests a minute, from 08:00 to 12:00. Finance gives the deals API at most ${BUDGET} vCores. Please size it and prove it with a load test before Friday. Target: no 503s and a p95 under ${P95} ms.`,
          source: 'Brightmart ecommerce lead',
        },
      ],
    }
    return until(s, at(1, 10))
  },
  steps: [
    { title: 'Read the mail of the ecommerce lead', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Open the capacity planner',
      how: `Capacity planner from the menu under Lab tools. Choose ${DEALS_API}. The planner fills the per request time and the payload size from the application, and the requests a minute from its traffic of now.`,
      done: (s) => Boolean(s.seen.capacity),
    },
    {
      title: 'Load test the setup of today',
      how: `In the planner set Expected requests a minute at peak to ${PEAK} and click Run load test. It sends the peak for 10 lab minutes. Read the result: 1 replica of 0.5 vCore cannot take it, and the share it cannot take gets 503.`,
      done: (s) => testsOf(s, DEALS_API).some((t) => t.perMinute >= PEAK && t.rejected > 0),
    },
    ask(
      'Scale up or out',
      'One option is 2 replicas of 2 vCores, another is 4 replicas of 1 vCore. Both cost 4 vCores. Why does the planner prefer the second?',
      [
        'Larger replicas are always slower',
        'With 2 replicas, losing one leaves a single replica with all the load, over 100 percent CPU. With 4, the 3 that remain carry it at about 70 percent. More replicas also spread over more zones, and scaling out adds replicas without restarting the ones that run',
        'CloudHub 2.0 allows at most 1 vCore per replica',
        'Replicas of 2 vCores have less memory',
      ],
      1,
      'Scale up (a larger replica) helps work that needs more heap or more CPU in one request. Scale out (more replicas) adds throughput and resilience for many small requests. A size change restarts every replica in a rolling update; a replica count change only adds or removes replicas.',
    ),
    ask(
      'Why N+1',
      'Why plan for one replica down at the peak?',
      [
        'Because CloudHub 2.0 bills one spare replica',
        'Replicas restart during rolling updates, node maintenance or an OOMKilled container. At the peak the others must take that share without going into backpressure, or the outage of one replica becomes 503s for the shoppers',
        'Because the planner needs an even replica count',
        'It is only needed in Production',
      ],
      1,
      'N+1 means the load fits on N replicas and one more is there for the bad minute. The headroom under 70 percent CPU covers the rest: a burst above the forecast, GC pauses, slower downstream systems.',
    ),
    {
      title: 'Apply a plan that fits',
      how: `In the planner pick a row marked Fits, with N+1 Yes, peak CPU under ${CPU_TARGET} percent and a cost of at most ${BUDGET} vCores. Click Apply to app. It goes through the normal deploy path of Runtime Manager as a rolling update.`,
      done: planned,
    },
    ask(
      'What Apply did',
      'What happened to the replica of 0.5 vCore that ran before, while your plan rolled out?',
      [
        'It stopped first, so the API was down for a minute',
        'It kept serving. A size change is a rolling update: the old replica answers until the new ones are ready, then it goes. A count change alone keeps it and only adds replicas',
        'It was resized in place without a restart',
        'It kept running next to the new ones for good',
      ],
      1,
      'Rolling update is the default deployment model of CloudHub 2.0: the old replicas answer until the new ones pass their checks. Recreate stops them first and gives 503s until the new ones run.',
    ),
    {
      title: 'Prove it with a load test',
      how: `Capacity planner, Run load test again at ${PEAK} requests a minute. The result needs 0 rejected and a p95 under ${P95} ms, on the configuration you applied.`,
      done: (s) => {
        const a = deals(s)
        return planned(s) && testsOf(s, DEALS_API).some((t) => t.config === a.config && t.perMinute >= PEAK && t.rejected === 0 && t.failed === 0 && t.p95 > 0 && t.p95 < P95)
      },
    },
  ],
  why: 'Capacity planning starts from a measured cost per request, the expected peak and a target utilisation. Throughput grows with the vCores, the response time grows fast as the load comes near the capacity, and above it the runtime applies backpressure and answers 503. Keep peak CPU under about 70 percent, plan for one replica down, and prove the plan with a load test before the day. In the lab the throughput per vCore and the queueing are a model: the CPU time per request and the payload size give the capacity of a replica, and one call of the lab traffic stands for 60 requests.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-architecture',
  solve(start) {
    let s = mark(mark(start, 'inbox'), 'capacity')
    s = test(s)
    s = change(s, DEALS_API, { replicas: 4, vCores: 1 })
    return test(s)
  },
  answers: { 3: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
