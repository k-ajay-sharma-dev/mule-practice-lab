export default {
  id: 'cs-127',
  category: 'case-studies',
  title: 'Gym Chain Keeping Door Access in Step With Memberships and Failed Payments Across 300 Clubs',
  level: 'INTERMEDIATE',
  tags: ['access-control', 'subscriptions', 'payments', 'events', 'edge'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Today door access is updated by a nightly file. A new member joins at 18:00 and cannot get in until tomorrow. What do you change?',
      options: [
        'Publish an event for each membership change and update the club doors from it',
        'Run the same full file every hour instead of every night',
        'Let the doors check each swipe online against the subscription platform',
        'Send the nightly file twice a day, at noon and at midnight',
      ],
      answer: 0,
      explain: 'An event per change reaches the doors in about a minute. More frequent files still leave new members waiting and move every record each time, and an online check per swipe fails when the club link drops.',
    },
    {
      type: 'single',
      prompt: 'A monthly payment fails. When should the member lose door access?',
      options: [
        'When the agreed grace period ends and a membership suspended event is published',
        'The moment the payment provider reports the first failed attempt',
        'At the end of the calendar month in which the payment failed',
        'After a fixed three failed attempts, counted by the door integration',
      ],
      answer: 0,
      explain: 'Most first failures are fixed by a retry or a new card. The rule belongs to the business, and the integration acts on the suspended event, not on each payment failure.',
    },
    {
      type: 'multi',
      prompt: 'A club’s internet link is down. Which two things keep the doors working?',
      options: [
        'The access controller in the club keeps a local list of valid members',
        'Changes queue up for that club and are applied when the link returns',
        'Every swipe checks the central membership system online',
        'Doors switch to staff-only cards until the link returns',
      ],
      answer: [0, 1],
      explain: 'A local list lets members in during an outage, and queued changes bring it up to date afterwards. An online check per swipe fails with the link, and staff-only cards lock members out.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The access system needs a full refresh after a controller is replaced. How do you do it?',
      options: [
        'Send the full member list for that one club, then go back to events',
        'Replay every membership event since the chain opened to that club',
        'Wait for the nightly file to rebuild the controller list',
        'Send the full member list to all 300 clubs at the same time',
      ],
      answer: 0,
      explain: 'A full load for one club rebuilds that controller. Events then keep it current. Replaying years of events is slow, the nightly file is being replaced, and refreshing all clubs is not needed.',
    },
    {
      type: 'match',
      prompt: 'Match each event to the door action.',
      pairs: [
        ['Membership started', 'Add the card to the clubs the plan allows'],
        ['Membership suspended for payment', 'Block the card until reinstated'],
        ['Plan changed to one club only', 'Remove the card from the other clubs'],
        ['Membership ended', 'Remove the card everywhere'],
      ],
      explain: 'Each business event maps to one clear change on the doors.',
    },
    {
      type: 'order',
      prompt: 'Order the delivery.',
      items: [
        'Agree the grace period and suspension rules with the business',
        'Define membership events and the door actions for each',
        'Build the event flow with a queue per club',
        'Add a full refresh for one club',
        'Pilot in ten clubs, then roll out',
      ],
      explain: 'Business rules decide when doors change, events carry them, and a refresh covers the edge case of a new controller.',
    },
  ],
  description: `
**Context.** A gym chain has **300 clubs** and **450,000 members**. Members swipe a card or phone at the door.

**Facts gathered so far**
- Memberships and payments are in a subscription platform. Each club has its own access control system.
- Door access is updated by a nightly file per club.
- New members cannot get in on the day they join. Members who cancel can still get in until the next night.
- About 4% of monthly payments fail on the first try. Most succeed on a retry within a week.
- Club internet links drop a few times a month.

**Opinions**
- Head of sales: "New members must be able to train the minute they pay."
- Finance: "Members who do not pay should not train for free for weeks."
- Club managers: "The doors must work when the internet does not."

**Your task.** Design how membership changes reach the doors, including failed payments and club outages.
`,
  answerTemplate: `## Decision

## Membership events

## Failed payments

## Club outages

## Full refresh

## Rollout

## Risks
`,
  keyPoints: [
    'Publish an event for every membership change and update the doors within a minute.',
    'Suspension after failed payments follows a business rule with a grace period.',
    'Each club controller keeps a local member list, so doors work offline.',
    'A queue per club holds changes while its link is down.',
    'A full refresh for one club rebuilds a replaced controller.',
    'Map each membership event to one clear door action.',
  ],
  solution: `
**Decision.** Event driven updates from the subscription platform to each club, with a local list at the door and a queue per club.

**Membership events.** The subscription platform publishes started, changed, suspended, reinstated and ended events. An integration maps each to door actions for the clubs the plan allows and puts them on a queue per club.

**Failed payments.** Payment failures stay in the subscription platform, which retries. Only when the agreed grace period ends does it suspend the membership and publish the event. Reinstatement after payment publishes the reverse.

**Club outages.** The access controller keeps its own member list and decides at the door without a central call. While a club is offline its queue grows. When the link returns, the changes apply in order.

**Full refresh.** An API sends the full list for one club to a new or reset controller. Events take over afterwards.

**Rollout.** Agree rules, define events, build, pilot in ten clubs including some with poor links, then roll out.

**Risks.** Different access control vendors per club, a cancelled member who gets in while a club is offline, and staff overriding blocks without a record.
`,
  followUps: [
    { q: 'Why a queue per club instead of one queue?', a: 'An offline club must not hold up the others, and each club needs its own changes in order.' },
    { q: 'What if an event is lost?', a: 'Use a durable broker with a dead letter queue, and run a periodic check that compares each club’s list with the subscription platform.' },
    { q: 'How fast must changes reach the door?', a: 'Agree a target with the business, such as one minute for new members, and alert when a club falls behind.' },
    { q: 'How do you support members who visit many clubs?', a: 'Their plan lists the clubs, and the started and changed events add or remove the card at each one.' },
  ],
}
