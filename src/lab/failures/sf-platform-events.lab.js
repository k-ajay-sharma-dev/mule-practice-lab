// The guided lab sf-platform-events. See platform-labs.js for the shape of a lab.
import { at, finishDeploys, MINUTE, mark, newApp, newPlatform, startApp, stopApp } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { channelInfo, eventDef, newOrg, newSalesforce, orgOf, setPublishBehavior, timeOf } from '../platform-salesforce.js'
import { CHANNEL, EVENT, FLOW, NAME, WEB } from './sf-platform-events.pkg.js'

const STOP = at(1, 14) // Tuesday: the listener was stopped for a redeploy
const RESTART = at(1, 15)
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const word = (s, k) => String(props(s)[k] ?? '').trim()
const running = (s) => app(s, NAME)?.status === 'Running'
const picks = (s) => app(s, NAME)?.store?.picks ?? {}
const open = (s, id) => Boolean(picks(s)[id]) && !picks(s)[id].cancelled
const org = (s) => orgOf(s, 'Production')
const orders = (s) => (org(s)?.records?.Order ?? []).filter((r) => /^W-/.test(r.Brightmart_Order_Id__c ?? ''))
const createdIn = (r, from, to) => timeOf(r.CreatedDate) >= from && timeOf(r.CreatedDate) < to
// the replay ID of the last event before the stop: replaying after it gives back the orders of the gap
const beforeGap = (s) => {
  const ev = channelInfo(org(s), CHANNEL, s.clock).events.find((e) => e.t > STOP)
  return ev ? ev.replayId - 1 : null
}
const afterCommit = (s) => eventDef(org(s), EVENT)?.publishBehavior === 'Publish After Commit'
const replaySet = (s) => {
  if (!running(s) || word(s, 'sf.resumeFromLastReplayId') === 'true') return false
  const opt = word(s, 'sf.replayOption').toUpperCase()
  if (opt === 'ALL') return true
  const id = Number(word(s, 'sf.replayId'))
  const gap = beforeGap(s)
  return opt === 'FROM_REPLAY_ID' && gap !== null && Number.isFinite(id) && id <= gap && id >= channelInfo(org(s), CHANNEL, s.clock).purgedUpTo
}
const gapBack = (s) => {
  const gap = orders(s).filter((r) => createdIn(r, STOP, RESTART))
  return gap.length > 0 && gap.every((r) => open(s, r.Brightmart_Order_Id__c))
}
const safeOk = (s) => running(s) && word(s, 'wms.verifyOrder') === 'true' && word(s, 'wms.idempotent') === 'true'

function salesforce() {
  const prod = newOrg('Production', {
    eventDefs: { [EVENT]: { publishBehavior: 'Publish Immediately' } },
    subscribers: [{ name: 'OrderPlacedLoyaltyPoints', kind: 'Apex trigger', channel: CHANNEL, position: 41000, perMinute: 2000, status: 'Running' }],
  })
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}
const conn = { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example' }
const secrets = { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' }

const lab = {
  id: 'p-sf-platform-events',
  group: 'Salesforce and SAP',
  title: 'Ghost orders in the warehouse',
  minutes: 30,
  scenario: `The Apex class BrightmartOrders saves each web order and publishes the platform event ${EVENT}. ${NAME} listens to ${CHANNEL} and sends a pick request to the warehouse for every event. It is Wednesday 09:00. The warehouse writes that it shipped orders that customer service cannot find in Salesforce, and that some orders from Tuesday afternoon never reached it. ${NAME} was redeployed on Tuesday from 14:00 to 15:00.`,
  start() {
    let s = newPlatform({
      clock: at(0, 7),
      apps: [
        newApp(WEB, { props: { ...conn }, secrets: { ...secrets } }),
        newApp(NAME, {
          props: { ...conn, 'sf.replayOption': 'ONLY_NEW', 'sf.replayId': '', 'sf.resumeFromLastReplayId': 'false', 'wms.verifyOrder': 'false', 'wms.idempotent': 'false' },
          secrets: { ...secrets },
        }),
      ],
      salesforce: salesforce(),
    })
    s = until(s, STOP)
    s = stopApp(s, NAME)
    s = until(s, RESTART)
    s = finishDeploys(startApp(s, NAME))
    s = until(s, at(2, 8, 40))
    const ghosts = Object.keys(picks(s)).filter((id) => !orders(s).some((r) => r.Brightmart_Order_Id__c === id))
    const missed = orders(s).filter((r) => !picks(s)[r.Brightmart_Order_Id__c]).map((r) => r.Brightmart_Order_Id__c)
    s.mail.push({ t: s.clock, to: OPS, subject: 'Orders we cannot match', body: `We picked and shipped ${ghosts.length} orders that customer service cannot find in Salesforce: ${ghosts.join(', ')}. The customers say their payment was declined. We also got no pick request for ${missed.join(', ')}, and Salesforce shows them as placed on Tuesday afternoon. Brightmart warehouse team`, source: 'Brightmart warehouse team' })
    return until(s, at(2, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Each event line shows its replay ID and Order Id. On Tuesday the last pick before the stop is at 14:00, replay ID 41097, and at 15:00 the listener subscribed again with replay ID -1. Open the logs of ${WEB} too: some orders end with 400 PAYMENT_DECLINED.` },
    {
      title: 'Look at the platform event',
      how: `Salesforce, Platform Events. ${EVENT} has Publish Behavior Publish Immediately. The event bus table shows the replay IDs that are still retained for ${CHANNEL}.`,
      done: (s) => Boolean(s.seen['sf:events']),
    },
    ask(
      'Where the ghost orders come from',
      'The Order of a declined payment is not in Salesforce, yet the warehouse got its event. Why?',
      ['The listener invents events after a restart', 'With Publish Immediately the event goes on the bus the moment EventBus.publish runs, even when the transaction later rolls back. The payment check throws after the publish, so the Order is rolled back and the event stays', 'Platform events are always delivered twice', 'The Apex trigger OrderPlacedLoyaltyPoints publishes a copy'],
      1,
      'Publish Immediately is for events that must go out whatever happens to the transaction, such as a log of a failure. Publish After Commit holds the event until the transaction commits and drops it on a rollback. An event that says a record now exists must use Publish After Commit.',
    ),
    {
      title: 'Publish after commit',
      how: `Salesforce, Platform Events, ${EVENT}. Set Publish Behavior to Publish After Commit. From now on a rolled back order publishes nothing.`,
      done: afterCommit,
    },
    ask(
      'The orders of Tuesday afternoon',
      `Why did the orders of Tuesday 14:00 to 15:00 never reach the warehouse, and can they still be delivered?`,
      ['They are lost for good once an app restarts', `The listener subscribed with replay ID -1, which gives only events published after the subscribe, so the hour of the stop was skipped. The event bus keeps platform events for 72 hours, so subscribing after the replay ID of the last processed event, or with -2, delivers them again`, '-1 replays the last hour by default', 'Salesforce sends missed events by email'],
      1,
      'A replay ID marks the position of an event on the channel. -1 starts at the tip, -2 replays every retained event, and a stored replay ID resumes after that event. High volume platform events and change events are retained for 72 hours. Past that window replay cannot help and the data itself is the only source.',
    ),
    {
      title: 'Replay the missed hour',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set sf.resumeFromLastReplayId to false and sf.replayOption to FROM_REPLAY_ID with sf.replayId set to the replay ID of the last pick before the stop (41097), or set sf.replayOption to ALL (replay ID -2). Do not apply yet.`,
      done: (s) => replaySet(s) || gapBack(s),
    },
    ask(
      'A replay brings back old events',
      'The replay also delivers events the warehouse already has, and the events of declined orders that were published before the fix. What must the listener do?',
      ['Nothing, a replay skips processed events', 'Treat delivery as at least once: skip an order that already has a pick, and check that the Order exists in Salesforce, by its External ID Brightmart_Order_Id__c, before a pick. Cancel the open picks whose Order does not exist', 'Delete the channel and start over', 'Use replay ID -1 for every start'],
      1,
      'The event bus gives no exactly once delivery. Make the subscriber idempotent on a business key, here the Order Id. A check against the system of record also protects against events that describe work that never committed. Brightmart_Order_Id__c is an External ID, so the lookup is indexed.',
    ),
    {
      title: 'Make the dispatch safe to replay',
      how: 'Set wms.verifyOrder and wms.idempotent to true and Apply Changes. On start the listener cancels the open picks whose Order does not exist, then replays.',
      done: safeOk,
    },
    {
      title: 'Catch up, then keep the position',
      how: `Move the clock 10 minutes: the missed orders get a pick and the ghost picks are cancelled. Then set sf.resumeFromLastReplayId to true and Apply Changes, so the next restart resumes after the last processed replay ID instead of -1. Move the clock 10 more minutes.`,
      done: (s) => {
        if (!afterCommit(s) || !safeOk(s) || !gapBack(s) || word(s, 'sf.resumeFromLastReplayId') !== 'true') return false
        const a = app(s, NAME)
        const st = a.store ?? {}
        const last = a.schedules.find((x) => x.flow === FLOW)?.last
        const list = orders(s)
        const ok = list.every((r) => open(s, r.Brightmart_Order_Id__c)) && Object.keys(picks(s)).every((id) => !open(s, id) || list.some((r) => r.Brightmart_Order_Id__c === id))
        return ok && s.clock >= a.updated + 10 * MINUTE && st.boot === `${a.config}:${a.started ?? 0}` && Boolean(last?.ok) && !(st.dupPicks ?? []).some((x) => x.t >= a.updated)
      },
    },
  ],
  why: 'Platform events have a Publish Behavior. Publish Immediately puts the event on the bus at once, so a rolled back transaction leaves an event about a record that does not exist. Publish After Commit sends it only when the transaction commits. A subscriber reads the channel from a replay ID: -1 for new events only, -2 for all retained events, or the ID of the last event it processed. The bus keeps high volume events for 72 hours, so a subscriber that stores its replay ID can resume after a stop of up to three days. Delivery is at least once, so the subscriber must be idempotent and should check the record before acting. In the lab an app plays the Apex class that publishes, and the listener is a flow that runs each minute.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_intro.htm',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:events')
    s = setPublishBehavior(s, 'Production', EVENT, 'Publish After Commit')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sf.resumeFromLastReplayId': 'false', 'sf.replayOption': 'FROM_REPLAY_ID', 'sf.replayId': String(beforeGap(s)), 'wms.verifyOrder': 'true', 'wms.idempotent': 'true' } })
    s = until(s, s.clock + 10 * MINUTE)
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'sf.resumeFromLastReplayId': 'true' } })
    return until(s, s.clock + 11 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
