export default {
  id: 'cs-126',
  category: 'case-studies',
  title: 'Water Utility Sending Work Orders to 1,100 Field Crews Who Lose Signal Underground',
  level: 'ADVANCED',
  tags: ['field-service', 'mobile', 'offline', 'sap', 'sync'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Crews often work in basements and tunnels with no signal. How should the mobile app get its work orders?',
      options: [
        'Download the day’s work orders when there is signal, work offline, and sync changes later',
        'Load each work order from SAP the moment the crew opens it, with a retry',
        'Load work orders through a faster API cache placed in front of SAP',
        'Keep a long-lived connection from the app to SAP open all day',
      ],
      answer: 0,
      explain: 'Offline first is the only design that works without signal. Loading on open, a cache or a long-lived connection all still need signal at the moment the crew is in the tunnel.',
    },
    {
      type: 'single',
      prompt: 'Two changes reach SAP for the same work order: a dispatcher moved it to another crew, and the first crew marked it done offline an hour ago. What should the sync do?',
      options: [
        'Apply agreed rules per field, with a dispatcher queue for the rest',
        'Always keep the last change that arrives at SAP, whichever it is',
        'Reject every change that was made while the device was offline',
        'Keep the change with the latest timestamp from the device clock',
      ],
      answer: 0,
      explain: 'Last write wins would let a late sync overwrite newer facts or the other way round, and device clocks drift. Rules per field, such as completion from the field wins, with a queue for real conflicts, keep the work order correct.',
    },
    {
      type: 'multi',
      prompt: 'Which three things make the device sync safe to repeat?',
      options: [
        'Each change carries a unique change ID that the sync API stores',
        'The API ignores a change ID it has already applied',
        'The device keeps a change until the API confirms it',
        'The device deletes each change as soon as it sends it',
      ],
      answer: [0, 1, 2],
      explain: 'Signal drops mid-request. The device must resend until confirmed, and the API must turn a repeat into a no-op. Deleting before confirmation loses work.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'SAP slows down at 07:30 when all crews sync at once. What do you change?',
      options: [
        'Queue changes behind the sync API and post them to SAP at a rate it can take',
        'Ask each depot to sync at a different time of the morning',
        'Add more SAP application servers to cover the two peaks a day',
        'Let tablets call SAP directly so there is no extra hop',
      ],
      answer: 0,
      explain: 'The sync API accepts and stores changes fast, and a consumer posts them to SAP at a steady pace. The crews are not kept waiting by SAP.',
    },
    {
      type: 'match',
      prompt: 'Match each part to its job.',
      pairs: [
        ['Mobile app local store', 'Holds work orders and changes while offline'],
        ['Sync API', 'Accepts changes once, by change ID, and answers fast'],
        ['Queue to SAP', 'Paces posting so SAP is not flooded'],
        ['Dispatcher conflict queue', 'Lets a person decide when rules cannot'],
      ],
      explain: 'Each part handles one problem: no signal, repeats, load on SAP and real conflicts.',
    },
    {
      type: 'order',
      prompt: 'Order the rollout.',
      items: [
        'Agree the conflict rules per field with dispatch and field leads',
        'Build the sync API with change IDs and the queue to SAP',
        'Test with devices switched to flight mode mid-sync',
        'Pilot with one depot that works mostly underground',
        'Roll out depot by depot',
      ],
      explain: 'Rules first, because they shape the API. Then prove the hard cases in testing and in the worst depot.',
    },
  ],
  description: `
**Context.** A water utility has **1,100 field crews** fixing leaks, replacing meters and inspecting sewers. Work orders live in **SAP**.

**Facts gathered so far**
- Crews use tablets. Many jobs are in basements, tunnels and rural areas with no signal.
- Today the tablet app loads each work order from SAP when it is opened, and fails without signal.
- Crews fill paper forms when the app fails, and office staff type them in days later.
- Dispatchers move work orders between crews during the day.
- Most crews sync at about 07:30 and 16:00, and SAP slows down at those times.

**Opinions**
- Head of field operations: "The app must work in a tunnel."
- SAP team: "Do not let 1,100 tablets hit SAP at once."
- Dispatch: "We need to know if a job is done before we move it."

**Your task.** Design how work orders reach crews and how their updates reach SAP, with and without signal.
`,
  answerTemplate: `## Decision

## Getting work to devices

## Sending updates back

## Conflicts

## Protecting SAP

## Rollout

## Risks
`,
  keyPoints: [
    'The app works offline first: download work orders when there is signal, sync when it returns.',
    'Every change carries a change ID, and the sync API ignores repeats.',
    'The device keeps a change until the API confirms it.',
    'Conflict rules per field, agreed with dispatch, and a queue for real conflicts.',
    'A queue between the sync API and SAP paces the morning and evening peaks.',
    'Test with signal lost in the middle of a sync.',
  ],
  solution: `
**Decision.** An offline first app with a sync API in front of SAP, change IDs for safe repeats, and a paced queue into SAP.

**Getting work to devices.** When a tablet has signal, it downloads the crew's work orders for the day and any reference data it needs. A dispatcher change is sent as a notice, and the tablet fetches it on its next sync.

**Sending updates back.** Each change on the tablet, such as a status, a reading or a photo reference, gets a unique change ID and is stored locally. The tablet sends changes when there is signal and keeps each one until the sync API confirms it. The API stores change IDs and ignores repeats.

**Conflicts.** Rules per field are agreed with dispatch. For example, completion from the field wins over a later reassignment, and the dispatcher is told. Changes the rules cannot settle go to a dispatcher conflict queue.

**Protecting SAP.** The sync API answers fast and puts changes on a queue. A consumer posts them to SAP at a rate SAP can take, so peaks become a short delay instead of a slowdown.

**Rollout.** Agree rules, build, test with signal lost mid-sync, pilot in the depot with the most underground work, then roll out.

**Risks.** Large photos on weak signal, tablets that stay offline for days, and rules that do not cover a real case.
`,
  followUps: [
    { q: 'Why not last write wins?', a: 'The last change to arrive is not always the newest fact. A crew syncing late could undo a dispatcher’s change, or the other way round.' },
    { q: 'How do you handle photos?', a: 'Upload them separately to object storage when signal allows, and send only a reference with the work order change.' },
    { q: 'What if a tablet is lost with unsynced changes?', a: 'Those changes are lost. Encourage frequent syncs, show unsynced counts on the device, and let dispatch see crews that have not synced for a long time.' },
    { q: 'How do you measure success?', a: 'Fewer paper forms, shorter time from job done to SAP updated, and no SAP slowdowns at peak.' },
  ],
}
