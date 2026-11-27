// The guided lab wd-effective-date. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { addEvent, addPrompt, hire, newWorkday, parseWd, TENANT, terminate, WD_HOST } from '../platform-workday.js'
import { ACCESS, ACCESS_FLOW } from './wd-effective-date.pkg.js'

const REPORT = 'INT_Worker_Events'
const a = (s) => app(s, ACCESS)
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const prompts = (s) => s.workday?.reports?.[REPORT]?.prompts ?? []
const hasPrompt = (s, name, op) => prompts(s).some((p) => p.name === name && p.field === 'Effective_Date' && p.op === op)
const configured = (s) => a(s)?.status === 'Running' && prop(s, 'delta.mode') === 'both' && parseWd(prop(s, 'delta.replayFrom')) <= at(0, 10, 20)
const accounts = (s) => a(s)?.store?.accounts ?? {}
const lastRun = (s) => a(s)?.schedules.find((y) => y.flow === ACCESS_FLOW)?.last

function workday(now) {
  const y = newWorkday(now)
  // the HR team entered a resignation on Monday morning, effective Thursday
  terminate(y, '21005', { eff: at(3), done: at(0, 10, 20), by: 'lhart', reason: 'Resignation' })
  addEvent(y, { type: 'Change Job', worker: '21008', eff: at(0), done: at(0, 11), by: 'ofeld', text: 'Sales Associate, Pier 01 store' })
  // the hire of Mara Quill was completed on Monday afternoon, effective Tuesday, her first day
  hire(y, '21007', { name: 'Mara Quill', job: 'JP_SALES_ASSOCIATE', loc: 'LOC_PIER_02', org: 'Stores', eff: at(1), done: at(0, 14, 5), by: 'lhart' })
  // a termination entered on Tuesday morning, effective back on Monday
  terminate(y, '21004', { eff: at(0), done: at(1, 8, 10), by: 'rokafor', reason: 'Job abandonment' })
  return y
}

const lab = {
  id: 'p-wd-effective-date',
  group: 'HR, ITSM and CRM',
  title: 'The new hire nobody gave a badge',
  minutes: 25,
  scenario: `${ACCESS} opens and closes the accounts of Brightmart workers, badge, mail and store till, from the hire and termination events of Workday. Every 15 minutes it asks the report ${REPORT} for the events completed since its last run. It runs without errors. Today Mara Quill started at the Pier 02 store, and she has no account at all. Find out why, fix the delta, and repair what it missed.`,
  start() {
    const s = newPlatform({
      clock: at(0, 8),
      apps: [
        newApp(ACCESS, {
          props: { 'workday.host': WD_HOST, 'workday.tenant': TENANT, 'workday.username': 'ISU_BRIGHTMART_HCM', 'raas.owner': 'lhart', 'raas.report': REPORT, 'delta.mode': 'entry', 'delta.replayFrom': '' },
          secrets: { 'workday.password': 'Hcm-Lab-Pass-0826' },
          store: { accounts: Object.fromEntries(['21001', '21002', '21003', '21004', '21005', '21006', '21008', '21009', '21010'].map((id) => [id, 'active'])), applied: [], watermark: at(0, 8) },
        }),
      ],
      workday: workday(at(0, 7)),
      mail: [
        {
          t: at(1, 9, 5),
          to: OPS,
          subject: 'New starter Mara Quill has no badge and no till login',
          body: 'Hello. Mara Quill started with us today at Pier 02. HR says her hire was done in Workday yesterday. Her badge does not open the door and she has no till login or mail. Can you check? Omar Feld, store manager Pier 02',
          source: 'Omar Feld',
        },
      ],
    })
    return until(s, at(1, 9, 20))
  },
  steps: [
    {
      title: 'Look at the hire in Workday',
      how: 'Workday from the console menu, Workers, Mara Quill, Business Process tab. The Hire is effective 2026-11-03, today, and was completed 2026-11-02 at 14:05. The effective date and the completed date are two different dates.',
      done: (s) => Boolean(s.seen['wd:worker:21007']),
    },
    { ...sawLogs(ACCESS), title: 'Find the skipped events', how: `Runtime Manager, Applications, ${ACCESS}, Logs. Yesterday at 14:16 the run read the Hire of 21007 and skipped it: effective after today. At 10:31 it skipped the termination of 21005 the same way.` },
    ask(
      'Why the hire was lost',
      'Why did the app never open the account of Mara Quill, although the run of 14:16 saw her hire?',
      [
        'The ISU cannot read future hires',
        'The delta asks for events by completed date only. A future dated event is completed before it is effective, so the run that sees it must skip it, and later runs never ask for it again: its completed date is behind the watermark',
        'The report has a limit of 100 rows',
        'Workday sends future dated hires only on their effective date',
      ],
      1,
      'Every Workday event has an entry moment (completed) and an effective date. A delta on entry alone loses future dated events if it skips them; a delta on effective date alone loses back dated events, such as the termination of Tobin Reyes entered today and effective yesterday. Ask for both windows, apply what is effective, and let a later effective window bring the rest.',
    ),
    {
      title: 'Add effective date prompts',
      how: `Workday, Custom reports, ${REPORT}, Prompts. Add a prompt named Effective_From on Effective_Date with bound From, and Effective_To on Effective_Date with bound To. With both pairs given, the report returns an event that matches either window.`,
      done: (s) => hasPrompt(s, 'Effective_From', 'from') && hasPrompt(s, 'Effective_To', 'to'),
    },
    {
      title: 'Send both windows and replay',
      how: `Runtime Manager, ${ACCESS}, Settings, Properties. Set delta.mode to both, and delta.replayFrom to 2026-11-02 so the next run reads again from the start of Monday. Apply Changes. Events applied before are remembered by Event_ID, so the replay does nothing twice.`,
      done: configured,
    },
    {
      title: 'Repair the accounts',
      how: `Move the clock 15 minutes. The log shows the replay: the Hire of 21007 is applied, account active. The termination of 21005 waits for its effective date, so Ines Calder keeps her access until Thursday. Tobin Reyes stays disabled.`,
      done: (s) => configured(s) && Boolean(lastRun(s)?.ok) && lastRun(s).t >= a(s).updated && accounts(s)['21007'] === 'active' && accounts(s)['21004'] === 'disabled' && accounts(s)['21005'] === 'active' && Boolean(a(s).store.replayedFrom),
    },
    ask(
      'The resignation of Ines Calder',
      'The termination of Ines Calder is effective on Thursday 2026-11-05. When does the app close her account now, and why not today?',
      [
        'Today, because it is in Workday already',
        'Never, it was skipped once',
        'In the first run after Thursday 00:00, because its effective date then falls in the Effective_From to Effective_To window. Closing it today would lock her out while she still works',
        'Only after a replay by hand on Thursday',
      ],
      2,
      'A future dated event must be applied on its effective date, not when it is entered. The effective window brings it back by itself when the day comes. Some teams also keep a list of pending future events in the target, but the two windows are enough here.',
    ),
    ask(
      'Effective date only',
      'Why not switch the delta to the effective date alone instead of both?',
      [
        'It is the same as both',
        'Back dated events would be lost. The termination of Tobin Reyes was entered today and is effective yesterday: its effective date was already behind the watermark when it was completed, so only the entry window finds it',
        'Workday has no effective dates on terminations',
        'The report would time out',
      ],
      1,
      'Entry alone loses future dated events, effective alone loses back dated ones. Workday web services have the same two pairs: Updated_From and Updated_To for the entry moment, Effective_From and Effective_To for the effective date. A delta that is right in both cases asks for both and keeps the applied event IDs, so an event that matches twice is applied once.',
    ),
  ],
  why: 'Workday events carry two dates: the moment they are completed and the date they take effect. A delta on the completed date sees a future dated hire before it is effective; if the app skips it, no later window asks for it again. A delta on the effective date misses back dated events completed after their effective date. Ask for both windows, apply only what is effective, remember the applied event IDs, and replay from before the bug to repair the targets. A future dated termination then closes the account on its effective day, not when HR enters it.',
  docs: 'https://docs.mulesoft.com/workday-connector/latest/',
  solve(start) {
    let s = mark(mark(start, 'wd:worker:21007'), `logs:${ACCESS}`)
    s = addPrompt(s, REPORT, { name: 'Effective_From', field: 'Effective_Date', op: 'from' }).state
    s = addPrompt(s, REPORT, { name: 'Effective_To', field: 'Effective_Date', op: 'to' }).state
    s = change(s, ACCESS, { props: { ...a(s).props, 'delta.mode': 'both', 'delta.replayFrom': '2026-11-02' } })
    return advance(s, 16 * MINUTE)
  },
  answers: { 2: 1, 6: 2, 7: 1 },
}

export const LABS = [lab]
