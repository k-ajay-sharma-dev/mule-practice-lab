export default {
  id: 'cs-138',
  category: 'case-studies',
  title: 'Airline Caterer Receiving Meal Counts and Late Changes Right Up to Departure',
  level: 'ADVANCED',
  tags: ['events', 'versioning', 'cut-off', 'airline', 'ordering'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Counts for one flight arrive many times and sometimes out of order. How does the kitchen know which is current?',
      options: [
        'A message replaces the stored count when its airline version is newer',
        'The last message to arrive replaces the stored count, since the queue keeps order',
        'Each message adds its counts to the running total for the flight',
        'The message with the highest passenger count wins, to be safe',
      ],
      answer: 0,
      explain: 'Arrival order is not the order they were sent, and a queue only keeps the order in which messages reached it. A version or source time decides which count is the latest. Adding messages counts every update again, and the highest count wastes meals.',
    },
    {
      type: 'single',
      prompt: 'A change arrives 40 minutes before departure. The kitchen can still add meals but not remove them. What do you do?',
      options: [
        'Accept the added meals, refuse the removals, and tell the airline which',
        'Refuse the whole change, because the 6 hour final count has passed',
        'Accept the whole change and let the kitchen remove meals if it can',
        'Hold the change until the airline sends a final confirmation',
      ],
      answer: 0,
      explain: 'Cut-off rules depend on what the change is. Small changes are allowed up to 30 minutes before, but removed meals are already made. The airline needs a clear answer for anything that missed its cut off.',
    },
    {
      type: 'multi',
      prompt: 'Which three facts must a meal count message carry?',
      options: [
        'Flight number and departure date',
        'Counts per cabin and per special meal type',
        'A version number or the time it was produced by the airline',
        'The name and seat of every passenger on the flight',
        'Only the change since the last message, such as two more vegetarian meals',
        'The time the caterer received it, used to pick the newest message',
      ],
      answer: [0, 1, 2],
      explain: 'The kitchen needs which flight, what to make and whether it is newer. Passenger names are personal data it does not need. A change on its own breaks when a message arrives twice or out of order, because it is added twice or in the wrong order; full counts can replace the old ones safely. The receive time follows the channel, not the airline, so an older message that arrives late would look newest.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The link to one airline drops for 20 minutes during the morning peak. What should happen when it returns?',
      options: [
        'Catch up by version per flight, and flag flights whose cut off passed',
        'Process every queued message in arrival order, each replacing the last',
        'Drop the queued messages and wait for the next update from the airline',
        'Process only the newest message in the queue and drop the others',
      ],
      answer: 0,
      explain: 'Versions make catching up safe. The newest message in the queue covers one flight only, so the others still need their latest counts. Flights that missed a cut off need a person to act, so they are flagged.',
    },
    {
      type: 'match',
      prompt: 'Match each problem to its fix.',
      pairs: [
        ['Out-of-order messages', 'Keep the newest version per flight'],
        ['Duplicate messages', 'Ignore a version already stored'],
        ['Late changes', 'Cut-off rules per change type'],
        ['Missed changes', 'Answer to the airline and alert the kitchen'],
      ],
      explain: 'Each problem has a clear rule, and most of them rely on the version.',
    },
    {
      type: 'order',
      prompt: 'Order the build.',
      items: [
        'Agree the message with versions and cut-off rules with the airlines',
        'Store the latest count per flight, newer versions only',
        'Send changes to the kitchen screens',
        'Answer the airline for every accepted or refused change',
        'Report late changes per airline each week',
      ],
      explain: 'Contract first, then state, then kitchen, then answers, then learning from the data.',
    },
  ],
  description: `
**Context.** An airline caterer prepares meals for **12 airlines** at a busy airport, about 600 flights a day. Airlines send passenger counts and special meals many times before each departure.

**Facts gathered so far**
- Each airline sends updates through its own channel: some by API, some by message queue, a few by file every 15 minutes.
- Messages for one flight can arrive out of order and sometimes twice.
- The kitchen needs a final count 6 hours before departure, but small changes are allowed up to 30 minutes before.
- Adding meals late is often possible. Removing them late is not, as they are already made.
- Wrong counts cost money on every flight and anger premium passengers.

**Opinions**
- Kitchen manager: "Give me one number per flight that I can trust."
- Airline account manager: "Airlines must know what we could not do."
- IT: "Each airline does it differently."

**Your task.** Design how counts and changes get to the kitchen, how you handle order, duplicates and cut offs, and how airlines are told.
`,
  answerTemplate: `## Decision

## Message and versions

## Channels per airline

## Current count per flight

## Cut-off rules

## Answers to airlines

## Risks
`,
  keyPoints: [
    'Every message carries the flight, date and a version from the airline.',
    'Only a newer version replaces the stored count.',
    'Duplicates are ignored by version.',
    'Cut-off rules depend on the type of change.',
    'Airlines get an answer for every change, accepted or not.',
    'After an outage, catch up by version and flag missed cut offs.',
  ],
  solution: `
**Decision.** One process per airline channel turns messages into a common count with a version. A store keeps the latest count per flight. The kitchen reads only from the store.

**Message and versions.** Flight, date, counts per cabin, special meals, and the airline's version or production time.

**Channels per airline.** API, queue or file, each mapped to the common count. Files are split into one message per flight.

**Current count per flight.** A version newer than the stored one replaces it. An older or equal version is ignored and logged.

**Cut-off rules.** Before 6 hours, everything is accepted. Between 6 hours and 30 minutes, additions are accepted and removals are refused. After 30 minutes, changes go to a supervisor.

**Answers to airlines.** Each change gets an accepted or refused answer through the airline's channel, with the reason.

**Risks.** Airlines whose messages carry no version, clock differences, and a channel that is down near cut off.
`,
  followUps: [
    { q: 'What if an airline sends no version?', a: 'Use the time the airline produced the message if it is in the message. If nothing is there, agree a sequence number with them, since arrival time is not safe.' },
    { q: 'Why not let the kitchen read the queues directly?', a: 'The kitchen needs one current number per flight. Order, duplicates and rules belong in one place before it.' },
    { q: 'How do you show the kitchen what changed?', a: 'Show the current count and the difference from the last one the kitchen accepted, so staff see only what to adjust.' },
    { q: 'What do you report each week?', a: 'Late changes per airline and the cost of refused removals, so account managers can discuss them.' },
  ],
}
