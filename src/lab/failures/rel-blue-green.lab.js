// The guided lab rel-blue-green. See platform-labs.js for the shape of a lab.
import { advance, appNamed, at, callApi, deployApp, finishDeploys, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { ask, OPS, until } from '../platform-kit.js'
import { blueGreenRouter, closeTicket, newTicketData, parseWhen, playApprovers, promote, requestApproval, rollback, routerOf, setTicket, statsOf, ticketOf, toReview, upgradeRelease } from '../platform-release.js'
import { BLUE_JAR, BLUE_PKG, GREEN_JAR, GREEN_PKG } from './rel-blue-green.pkg.js'

const BLUE = 'orders-prc-api-blue'
const GREEN = 'orders-prc-api-green'
const ROUTER = 'orders-prc-api'
const CHG = 'CHG0041234'
const PRD = 'Production'

const prd = (s, name) => appNamed(s, name, PRD)
const running = (s, name) => prd(s, name)?.status === 'Running'
const router = (s) => routerOf(s, ROUTER)
const ticket = (s) => ticketOf(s, CHG)
const firstSwitch = (s) => router(s)?.history.find((h) => h.text.startsWith('Promoted') && h.text.includes(GREEN))?.t
const planned = (t) => t && t.type === 'Normal' && t.cis.includes(GREEN) && String(t.backout).trim() && String(t.impl).trim() && String(t.test).trim() && Number(t.rollbackMinutes) > 0 && t.start >= at(1, 21, 30) && t.start <= at(1, 23, 30) && t.end > t.start && t.end <= at(2, 6)

const lab = {
  id: 'p-rel-blue-green',
  group: 'Scaling and release',
  title: 'Blue/green release inside tonight’s window',
  minutes: 30,
  scenario: `Release 2.3.0 of the Orders Process API adds promo codes to the checkout. It goes to Production tonight with no downtime. ${BLUE} runs 2.2.0 on CloudHub 2.0 and takes all orders through the router ${ROUTER}. A colleague started the change ${CHG} on the change board but left it half done. The release gate refuses any Production deploy that no approved change covers. Get the change approved, deploy green next to blue, test it, switch the traffic, and be ready to go back.`,
  start() {
    const clock = at(1, 21, 15)
    const release = upgradeRelease({ created: clock })
    release.gate = true
    release.seq = 41235
    release.tickets = [
      newTicketData(41234, {
        opened: at(1, 16),
        short: 'Release orders-prc-api 2.3.0 to Production with blue/green',
        impl: `1. Deploy ${GREEN_JAR} as ${GREEN} next to ${BLUE}, same replicas and settings.\n2. Smoke test ${GREEN} on its own URL.\n3. Promote: switch the router ${ROUTER} to green.\n4. Watch the error rate for 15 minutes.`,
        test: `POST /orders on ${GREEN} answers 201 before the switch. After the switch the green error rate stays under 1%.`,
        cis: [BLUE],
        notes: [{ t: at(1, 16), who: 'Dana Okafor, Order Management', text: 'Draft. Backout and window still to do. I am off tonight.' }],
      }),
    ]
    release.routers = [blueGreenRouter(ROUTER, PRD, BLUE, GREEN, { since: clock })]
    const order = (promoCode) => JSON.stringify({ sku: 'H-100', qty: 2, total: 59.9, ...(promoCode && { promoCode }) })
    const s = newPlatform({
      clock,
      env: PRD,
      apps: [newApp(BLUE, { env: PRD, pkg: BLUE_PKG, jar: BLUE_JAR, replicas: 2, vCores: 0.5, updated: at(0, 22) })],
      jars: [{ pkg: GREEN_PKG, jar: GREEN_JAR }],
      traffic: [
        { router: ROUTER, env: PRD, method: 'POST', path: '/orders', body: order(), perMinute: 12 },
        { router: ROUTER, env: PRD, method: 'POST', path: '/orders', body: order('EVENING20'), perMinute: 3 },
      ],
      release,
    })
    const later = until(s, at(1, 21, 30))
    later.mail.push({
      t: at(1, 21, 30),
      to: OPS,
      subject: `Tonight: ${CHG}, orders-prc-api 2.3.0`,
      body: `Hi, I could not finish ${CHG}. It needs the backout plan, the window (22:00 to 23:30 tonight is free on the change calendar), the rollback window and ${GREEN} as a configuration item. Marketing starts the EVENING20 promo tonight, so orders with promo codes are already coming in. Dana`,
      source: 'Order Management',
    })
    return later
  },
  steps: [
    {
      title: `Complete the change ${CHG}`,
      how: `Change and release, Change board, ${CHG}. Write the Backout plan (switch the router back to ${BLUE}, leave ${GREEN} deployed). Planned start 2026-11-03 22:00, Planned end 2026-11-03 23:30, Rollback window (minutes) 30. Add ${GREEN} to the Configuration items. Save.`,
      done: (s) => Boolean(planned(ticket(s))),
    },
    {
      title: 'Get the change approved',
      how: 'On the ticket, Request approval. Then Run the approvers (lab). The CAB and the service owner approve a complete plan and reject a change with an empty backout plan.',
      done: (s) => planned(ticket(s)) && ['Scheduled', 'Implement', 'Review', 'Closed'].includes(ticket(s).state) && ticket(s).approvals.length > 0 && ticket(s).approvals.every((a) => a.state === 'Approved'),
    },
    ask(
      'Blue/green or a rolling update',
      'CloudHub 2.0 can update one app with a rolling update. Why does this release use two apps and a router instead?',
      [
        'A rolling update is not allowed in Production',
        'A rolling update replaces the replicas in place, so going back means a new deployment of the old version while users wait. With blue/green both versions run at once: you test green before it takes traffic, and going back is a switch of the router in seconds',
        'Blue/green uses fewer vCores',
        'A rolling update loses the messages in flight',
      ],
      1,
      'Both give no downtime. The difference is the way back. Blue/green costs double capacity for the length of the release, and in return the old version stays warm, so a rollback is a routing change and not a deploy. A rolling update also mixes old and new replicas for a while, which matters when the versions behave differently.',
    ),
    {
      title: `Deploy ${GREEN} next to blue`,
      how: `When the lab clock reaches 22:00, Runtime Manager, Production, Deploy Application. Application Name ${GREEN}, Application File ${GREEN_JAR}, Replica Count 2, Replica size 0.5 vCores. Deploy Application. Before the window opens the release gate refuses it.`,
      done: (s) => running(s, GREEN) && prd(s, GREEN).pkg === GREEN_PKG && running(s, BLUE),
    },
    {
      title: 'Smoke test green on its own URL',
      how: `API client, Production. Application ${GREEN}, POST /orders, Send. Green answers on its own endpoint while the router still sends every order to blue.`,
      done: (s) => (s.lastCalls ?? []).some((c) => c.app === GREEN && c.env === PRD && c.status === 201 && c.t <= (firstSwitch(s) ?? Infinity)),
    },
    {
      title: 'Switch the traffic to green',
      how: `Change and release, Releases, ${ROUTER}. Promote. Then move the clock 5 minutes and watch the error rate of each version.`,
      done: (s) => Boolean(firstSwitch(s)),
    },
    {
      title: 'Roll back to blue inside the rollback window',
      how: `The error rate of green climbs, all on orders with a promo code. Releases, ${ROUTER}, Roll back, before the rollback window ends. Leave ${GREEN} deployed, so the team can read its logs.`,
      done: (s) => {
        const r = router(s)
        const back = r?.rollbacks.find((x) => x.to === 'blue' && x.within && x.t > (firstSwitch(s) ?? Infinity))
        return Boolean(back) && r.live === 'blue' && running(s, GREEN) && statsOf(s, PRD, GREEN, firstSwitch(s), back.t).errors > 0
      },
    },
    ask(
      'When a rollback is hard',
      'Release 2.4 will rename the column promo_code to campaign_code in the orders database. Why does that make the blue/green rollback hard, and what is the usual answer?',
      [
        'It does not matter, the router hides the database',
        'Blue and green share the database. Once green renames the column, blue reads a column that is gone, so switching back breaks blue. Expand and contract: first add the new column and write both, release the code that reads the new one, and drop the old column only in a later change when no version needs it',
        'Rename the column in the backout plan',
        'Give green its own copy of the database and merge later',
      ],
      1,
      'Code switches back in seconds, and data does not. Each step of expand and contract keeps both the old and the new version of the app working with the same schema, so every step has a backout. The contract step, dropping the old column, is its own change after the release has proved itself.',
    ),
    {
      title: `Close ${CHG} with the outcome`,
      how: 'On the ticket, Move to Review. Close code Unsuccessful, Close notes: what failed, that traffic went back to blue inside the rollback window, and that green stays deployed for analysis. Close change.',
      done: (s) => ticket(s)?.state === 'Closed' && ticket(s).closeCode === 'Unsuccessful' && String(ticket(s).closeNotes).trim().length >= 20,
    },
  ],
  why: 'A change board lets a release go to Production only with a plan someone has checked: what you do, how you test it, how you go back, and when. The release gate makes that real, since a deploy outside an approved window is refused. Blue/green runs the new version next to the old one, tests it on its own URL, and switches the router in one step. Because blue stays warm, the backout is a switch too, and it must finish inside the rollback window. Green stays deployed after the rollback, so its logs can show the defect. Data changes need expand and contract, so that both versions keep working on the same schema. In the lab the router is a weighted load balancer in front of two CloudHub 2.0 apps.',
  docs: 'https://docs.mulesoft.com/cloudhub-2/ch2-update-apps',
  solve(start) {
    let s = mark(start, 'inbox')
    s = setTicket(s, CHG, {
      backout: `Promote is undone with Roll back: the router ${ROUTER} goes back to ${BLUE}, which keeps running. ${GREEN} stays deployed for analysis. Takes under 2 minutes.`,
      start: parseWhen('2026-11-03 22:00'),
      end: parseWhen('2026-11-03 23:30'),
      rollbackMinutes: 30,
      cis: [BLUE, GREEN],
    }).state
    s = playApprovers(requestApproval(s, CHG).state).state
    s = advance(s, at(1, 22) - s.clock)
    s = finishDeploys(deployApp(s, { name: GREEN, pkg: GREEN_PKG, jar: GREEN_JAR, replicas: 2, vCores: 0.5, props: {}, secrets: {} }).state)
    s = callApi(s, { env: PRD, app: GREEN, method: 'POST', path: '/orders', body: '' }).state
    s = promote(s, ROUTER).state
    s = advance(s, 5 * MINUTE)
    s = rollback(s, ROUTER).state
    s = toReview(s, CHG).state
    s = closeTicket(s, CHG, 'Unsuccessful', 'Green 2.3.0 failed orders with a promo code (MULE:EXPRESSION in the discount). Traffic went back to blue 5 minutes after the switch. Green stays deployed for analysis.').state
    return s
  },
  answers: { 2: 1, 7: 1 },
}

export const LABS = [lab]
