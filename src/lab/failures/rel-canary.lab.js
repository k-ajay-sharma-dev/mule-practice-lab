// The guided lab rel-canary. See platform-labs.js for the shape of a lab.
import { advance, appNamed, at, deployApp, finishDeploys, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { ask, OPS, until } from '../platform-kit.js'
import { canaryRouter, canaryWeight, HOLD_MINUTES, newTicketData, promote, rollback, routerOf, statsOf, upgradeRelease } from '../platform-release.js'
import { CANARY_JAR, CANARY_PKG, FIX_JAR, FIX_PKG, STABLE_JAR, STABLE_PKG } from './rel-canary.pkg.js'

const STABLE = 'pricing-engine-stable'
const CANARY = 'pricing-engine-canary'
const ROUTER = 'pricing-engine'
const CHG = 'CHG0041301'
const PRD = 'Production'
const LAB_START = at(1, 10, 15)

const canaryApp = (s) => appNamed(s, CANARY, PRD)
const router = (s) => routerOf(s, ROUTER)
// when the fixed file went out to the canary
const fixedAt = (s) => (canaryApp(s)?.pkg === FIX_PKG && canaryApp(s).status === 'Running' ? canaryApp(s).updated : Infinity)
// a step of the canary plan at weight w, after the fix, held for the hold time with the error rate under the threshold
const held = (s, w) => {
  const r = router(s)
  return (r?.steps ?? []).some((x) => {
    if (x.w !== w || x.from < fixedAt(s)) return false
    const to = x.to ?? s.clock
    const st = x.to === undefined ? statsOf(s, PRD, CANARY, x.from, to) : { requests: x.requests, errors: x.errors }
    return to - x.from >= HOLD_MINUTES * MINUTE && st.requests > 0 && (st.errors * 100) / st.requests < r.threshold
  })
}

const lab = {
  id: 'p-rel-canary',
  group: 'Scaling and release',
  title: 'A canary that fails for one currency',
  minutes: 35,
  scenario: `Pricing engine 3.5.0 went out at 10:00 as a canary: the router ${ROUTER} sends 10% of the price requests to ${CANARY} and 90% to ${STABLE}, which runs 3.4.2. It is 10:15. The canary error rate is about 4% against about 0.2% on the stable version, and the plan only raises the weight while the canary stays under 1%. Stop the canary, get the fix out, and take it to 100% the safe way.`,
  start() {
    const clock = at(1, 10)
    const release = upgradeRelease({ created: clock })
    release.gate = true
    release.seq = 41302
    release.tickets = [
      newTicketData(41301, {
        opened: at(0, 15),
        short: 'Pricing engine 3.5.0 as a canary: 10%, 50%, 100%',
        risk: 'Moderate',
        impl: `Deploy ${CANARY_JAR} as ${CANARY}. Router ${ROUTER}: 10%, then 50%, then 100%, each held 10 minutes.`,
        test: 'Canary error rate under 1% and response time no worse than stable at each step.',
        backout: 'Set the canary weight to 0. The stable version takes all traffic again at once.',
        start: at(1, 9),
        end: at(1, 17),
        rollbackMinutes: 15,
        cis: [STABLE, CANARY],
        state: 'Implement',
        notes: [{ t: at(1, 9, 40), who: 'Leo Brandt, Pricing team', text: `Implementation started. ${CANARY} deployed with 3.5.0.` }],
      }),
    ]
    release.tickets[0].approvals = release.tickets[0].approvals.map((a) => ({ ...a, state: 'Approved', t: at(0, 16), comment: 'Approved.' }))
    const r = canaryRouter(ROUTER, PRD, STABLE, CANARY, { since: clock })
    r.targets[0].weight = 90
    r.targets[1].weight = 10
    r.steps = [{ w: 10, from: clock, app: CANARY, config: 1 }]
    r.history = [{ t: clock, text: 'Raised: canary 10%, stable 90%' }]
    release.routers = [r]
    const price = (currency, perMinute) => ({ router: ROUTER, env: PRD, method: 'GET', path: `/prices?sku=H-100&currency=${currency}`, perMinute })
    const s = newPlatform({
      clock,
      env: PRD,
      apps: [
        newApp(STABLE, { env: PRD, pkg: STABLE_PKG, jar: STABLE_JAR, replicas: 2, vCores: 0.5, updated: at(0, 9) }),
        newApp(CANARY, { env: PRD, pkg: CANARY_PKG, jar: CANARY_JAR, replicas: 1, vCores: 0.5, updated: at(1, 9, 40) }),
      ],
      jars: [{ pkg: FIX_PKG, jar: FIX_JAR }],
      traffic: [price('USD', 30), price('EUR', 18), price('JPY', 2)],
      release,
    })
    const later = until(s, LAB_START)
    later.mail.push({
      t: LAB_START,
      to: OPS,
      subject: 'Pricing canary: errors on the new version',
      body: `The canary of pricing engine 3.5.0 shows about 4% errors since 10:00. The stable version is at about 0.2%. The Japan shop says some product pages show no price. The fix is ready as ${FIX_JAR}. Leo, Pricing team`,
      source: 'Pricing team',
    })
    return later
  },
  steps: [
    {
      title: 'Open the canary release',
      how: `Change and release, Releases, ${ROUTER}. Compare the error rate and the requests of each version, and the failing requests.`,
      done: (s) => Boolean(s.seen['release:canary']),
    },
    ask(
      'What the split tells you',
      'Every failing canary request asks for currency=JPY, and the stable version answers the same requests. What do you conclude?',
      [
        'The Japan shop sends bad requests',
        'The canary has a defect for one customer segment. The stable version proves the requests are fine, and 4% is the share of yen requests. Stop the canary now; the error is real for those customers',
        'The error rate is too small to act on',
        'Raise the canary to 50% to get more data',
      ],
      1,
      'A canary compares two versions on the same traffic at the same time, so a difference belongs to the new version. An average of 4% can mean 100% failure for one segment, here every yen price. The logs show JAVA:INVOCATION with ArithmeticException Rounding necessary: JPY has no minor unit.',
    ),
    {
      title: 'Roll back the canary',
      how: `Releases, ${ROUTER}, Roll back. The canary weight goes to 0 and ${STABLE} takes all traffic. ${CANARY} stays deployed.`,
      done: (s) => (router(s)?.steps ?? []).some((x) => x.w === 0 && x.from >= LAB_START),
    },
    {
      title: 'Deploy the fix to the canary',
      how: `Runtime Manager, Production, ${CANARY}, Settings. Application File ${FIX_JAR}. Apply Changes. The change ${CHG} covers this app and its window is open.`,
      done: (s) => canaryApp(s)?.pkg === FIX_PKG && canaryApp(s).status === 'Running',
    },
    {
      title: 'Canary at 10%, held 10 minutes',
      how: `Releases, ${ROUTER}, Promote, or set Canary weight (%) to 10 and Set weight. Move the clock 10 minutes. The canary error rate must stay under 1%.`,
      done: (s) => held(s, 10),
    },
    {
      title: 'Canary at 50%, held 10 minutes',
      how: 'Promote again. The router refuses to raise the weight before the step has held 10 minutes under the threshold. Move the clock 10 minutes.',
      done: (s) => held(s, 50),
    },
    {
      title: 'Canary at 100%, held 10 minutes',
      how: `Promote to 100%. ${STABLE} takes no traffic now but stays deployed until the change closes. Move the clock 10 minutes.`,
      done: (s) => canaryWeight(router(s) ?? { targets: [] }) === 100 && held(s, 100),
    },
    ask(
      'Why the weight rises in steps',
      'Why not go from 10% straight to 100% once the fix looks good?',
      [
        'The router cannot jump',
        'Each step limits the blast radius while you learn. Some defects show only with more load or rarer requests: a pool that runs dry at 50%, a segment that is 1% of traffic. Holding each step long enough to see those, with a rollback that is one action, keeps a bad version away from most customers',
        'The licence counts the requests per step',
        'To warm the caches of the stable version',
      ],
      1,
      'At 10% a rare segment gives few requests, so a long enough hold matters as much as the weight. Steps such as 10, 50, 100 or 1, 5, 25, 100 trade speed against risk.',
    ),
    ask(
      'What gates a step',
      'Which metrics should decide whether the canary may go to the next weight?',
      [
        'Only the CPU of the canary',
        'The error rate and the response time of the canary against the stable version over the same period, with enough requests to judge, and business signals such as orders or prices served. A step goes up only when all stay within their thresholds',
        'The number of replicas',
        'The deploy time of the new version',
      ],
      1,
      'Gate on what users feel: errors (5xx) and latency, compared with the baseline at the same time so a busy hour does not fool you. Add a minimum number of requests, and business metrics that catch a wrong answer that is not an error.',
    ),
  ],
  why: 'A canary sends a small share of real traffic to the new version and compares it with the stable one on the same requests at the same time. The weight goes up in steps, each held long enough to see rare cases, and only while the canary error rate stays under a threshold. Rolling back is setting the weight to 0, so a bad version reaches few customers for a short time. Here the canary failed every yen price, which looked like 4% on average. In the lab the router is a weighted load balancer in front of two CloudHub 2.0 apps, and it refuses to raise the weight before a step has held 10 minutes under the threshold.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-update-apps',
  solve(start) {
    let s = mark(start, 'release:canary')
    s = rollback(s, ROUTER).state
    const a = canaryApp(s)
    s = finishDeploys(deployApp(s, { name: CANARY, pkg: FIX_PKG, jar: FIX_JAR, replicas: a.replicas, vCores: a.vCores, model: a.model, version: a.version, editing: true }).state)
    for (let i = 0; i < 3; i++) {
      s = promote(s, ROUTER).state
      s = advance(s, HOLD_MINUTES * MINUTE)
    }
    return s
  },
  answers: { 1: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
