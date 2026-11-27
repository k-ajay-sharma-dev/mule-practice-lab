// The guided lab sf-cdc. See platform-labs.js for the shape of a lab.
import { at, finishDeploys, MINUTE, mark, newApp, newPlatform, startApp, stopApp } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { newOrg, newSalesforce, orgOf, timeOf } from '../platform-salesforce.js'
import { CHANNEL, FLOW, NAME } from './sf-cdc.pkg.js'

const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const word = (s, k) => String(props(s)[k] ?? '').trim()
const running = (s) => app(s, NAME)?.status === 'Running'
const store = (s) => app(s, NAME)?.store ?? {}
const LAST = at(0, 8) // the commitTimestamp of the last event the app processed before the outage
const resyncOk = (s) => {
  const since = timeOf(word(s, 'resync.since'))
  return running(s) && word(s, 'resync.enabled') === 'true' && since <= LAST && since >= LAST - 24 * 60 * MINUTE
}
const replayOk = (s) => running(s) && word(s, 'sf.resumeFromLastReplayId') !== 'true' && ['ONLY_NEW', 'ALL'].includes(word(s, 'sf.replayOption').toUpperCase())
const idemOk = (s) => running(s) && word(s, 'loyalty.idempotent') === 'true'

function salesforce() {
  const prod = newOrg('Production', { editors: { every: 60, from: 8, to: 18, by: 'sales.ops@brightmart.example' } })
  return newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } })
}

const lab = {
  id: 'p-sf-cdc',
  group: 'Salesforce and SAP',
  title: 'Back after four days, and the replay ID is gone',
  minutes: 25,
  scenario: `${NAME} listens to ${CHANNEL} and keeps the loyalty tier of each Account in the loyalty store. The loyalty database was down for maintenance, so the app was stopped from Monday 08:30. It is Friday 09:00. The app was started again at 08:30 and resumes from the last replay ID it saved, but every subscription attempt fails. Members got no tier mail all week, and the store still shows Monday's tiers.`,
  start() {
    const sfState = salesforce()
    const snapshot = Object.fromEntries(sfState.orgs.Production.records.Account.map((r) => [r.Id, { tier: r.Loyalty_Tier__c ?? null, phone: r.Phone ?? null, at: timeOf(r.SystemModstamp) }]))
    let s = newPlatform({
      clock: at(0, 7),
      apps: [
        newApp(NAME, {
          props: { 'salesforce.url': 'https://login.salesforce.com/services/Soap/u/61.0', 'salesforce.username': 'mule.integration@brightmart.example', 'sf.replayOption': 'FROM_REPLAY_ID', 'sf.resumeFromLastReplayId': 'true', 'resync.enabled': 'false', 'resync.since': '', 'loyalty.idempotent': 'false' },
          secrets: { 'salesforce.password': 'Hrb-Int-Prod-26', 'salesforce.securityToken': 'labTokenProd7x2' },
          store: { accounts: snapshot },
        }),
      ],
      salesforce: sfState,
      mail: [{ t: at(4, 8, 35), to: OPS, subject: 'Loyalty store is back', body: `The loyalty database maintenance is finished and ${NAME} was started at 08:30. Members still see the tier they had on Monday. Brightmart loyalty team`, source: 'Brightmart loyalty team' }],
    })
    s = until(s, at(0, 8, 30))
    s = stopApp(s, NAME)
    s = until(s, at(4, 8, 30))
    s = finishDeploys(startApp(s, NAME))
    return until(s, at(4, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. On Monday the last event it processed has commitTimestamp 2026-11-02T08:00:00.000+0000. Since 08:30 today every attempt fails: 400::The replayId you provided was invalid.` },
    {
      title: 'Look at the retention of the channel',
      how: 'Salesforce, Change Data Capture. Account is a selected entity. The event bus table shows the oldest replay ID that is still retained for /data/AccountChangeEvent. The saved replay ID of the app is older.',
      done: (s) => Boolean(s.seen['sf:cdc']),
    },
    ask(
      'Why the saved replay ID fails',
      'Why does the subscription with the saved replay ID fail?',
      ['The replay ID belongs to another org', 'The event bus keeps change events for 72 hours. The event after the saved ID is from Monday, four days ago, so it is gone and Salesforce refuses the ID', 'The app has no permission on Account', 'Replay IDs change after each restart of the app'],
      1,
      'Change Data Capture events and high volume platform events are retained for 72 hours. A subscriber may resume from any replay ID still in that window. After a longer outage the events after the saved ID are deleted, and the subscribe call fails with 400::The replayId you provided was invalid.',
    ),
    ask(
      'Replay ID -1 or -2',
      'What would replay ID -1 and -2 each give the app now?',
      ['Both replay all four days', '-1 gives only new events, so all four days are lost. -2 gives every retained event, from Tuesday 09:00, so Monday and Tuesday morning are still lost and some changes come twice. Neither covers the gap alone, so resync from the data first', '-2 gives only new events and -1 all retained ones', '-1 fails after an outage'],
      1,
      'Replay ID -1 subscribes at the tip of the stream: only events published after the subscribe. -2 replays everything in the 72 hour window first. Past the window the only source of the missed changes is the data itself: query the records changed since the last processed event, for example on SystemModstamp, then subscribe.',
    ),
    {
      title: 'Resync the gap from the data',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set resync.enabled to true and resync.since to the commitTimestamp of the last processed event, 2026-11-02T08:00:00Z. On start the flow queries the Accounts with SystemModstamp after it. Do not apply yet.`,
      done: resyncOk,
    },
    {
      title: 'Subscribe without the dead replay ID',
      how: 'Set sf.resumeFromLastReplayId to false and sf.replayOption to ONLY_NEW (replay ID -1) or ALL (replay ID -2). Apply Changes.',
      done: replayOk,
    },
    ask(
      'At least once',
      'With ALL the app gets events whose changes the resync already loaded. Salesforce can also deliver an event twice after a reconnect. What should the app do?',
      ['Nothing, CDC delivers each event exactly once', 'Treat delivery as at least once: process idempotently, for example skip an event whose commitTimestamp is not newer than what the store has for that record, and save the replay ID only after the event is processed', 'Switch to ONLY_NEW after every restart', 'Delete the events after reading them'],
      1,
      'The event bus delivers at least once. A replay, a reconnect or an overlap with a resync gives the same change again. Make the handling idempotent on the record Id and commitTimestamp, and store the replay ID after the work is done, so a crash replays rather than loses an event.',
    ),
    {
      title: 'Make the handling idempotent',
      how: 'Set loyalty.idempotent to true and Apply Changes. The flow then skips a change the store already has, so a member gets one tier mail per real change.',
      done: idemOk,
    },
    {
      title: 'Watch the store catch up',
      how: 'Move the clock 30 minutes. The resync loaded the changed Accounts, the listener receives the new events with no error, every tier in the store matches the Account in Salesforce, and no tier mail went out twice.',
      done: (s) => {
        if (!resyncOk(s) || !replayOk(s) || !idemOk(s)) return false
        const a = app(s, NAME)
        const st = store(s)
        const last = a.schedules.find((x) => x.flow === FLOW)?.last
        const accounts = orgOf(s, 'Production').records.Account
        return s.clock >= a.updated + 30 * MINUTE && (st.resync?.t ?? 0) > a.updated && Boolean(last?.ok) && !st.dupMails && accounts.every((r) => (st.accounts?.[r.Id]?.tier ?? null) === (r.Loyalty_Tier__c ?? null))
      },
    },
  ],
  why: 'A Change Data Capture subscriber resumes from a replay ID, but the event bus keeps events for 72 hours only. After a longer outage that ID is invalid, and -1 or -2 alone cannot give back what was deleted. Resync from the data first, with a query of the records changed since the last processed event on SystemModstamp, which is indexed, then subscribe with -1 or -2. Delivery is at least once, so make the handling idempotent and save the replay ID after processing. In the lab the listener is a flow that runs each minute, the replay ID lives in the app store, and people edit accounts every hour in office time.',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.change_data_capture.meta/change_data_capture/cdc_replay.htm',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), 'sf:cdc')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'resync.enabled': 'true', 'resync.since': '2026-11-02T08:00:00Z', 'sf.resumeFromLastReplayId': 'false', 'sf.replayOption': 'ALL', 'loyalty.idempotent': 'true' } })
    return until(s, s.clock + 31 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 6: 1 },
}

export const LABS = [lab]
