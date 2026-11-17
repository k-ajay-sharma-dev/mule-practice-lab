export default {
  id: 'cs-132',
  category: 'case-studies',
  title: 'E-Scooter Operator Unlocking Rides, Billing Riders and Sharing Trip Data With 12 Cities',
  level: 'ADVANCED',
  tags: ['mobility', 'iot', 'billing', 'city-data', 'privacy'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A rider taps Unlock. The scooter is on a weak mobile signal. How should the unlock work?',
      options: [
        'Send the command, wait a short time for the scooter to confirm, and only start the ride and billing when it does',
        'Start billing as soon as the rider taps Unlock',
        'Retry the command forever until the scooter answers',
        'Ask the rider to restart the app',
      ],
      answer: 0,
      explain: 'Billing must start only when the scooter has really unlocked. A short wait with a clear message protects the rider from paying for a ride that never started.',
    },
    {
      type: 'single',
      prompt: 'The scooter sends its end of ride message late because it lost signal. How do you bill?',
      options: [
        'Bill from the time and position the scooter recorded at lock, sent when it reconnects',
        'Bill until the message arrives, even if that is hours later',
        'Bill a fixed amount for every ride',
        'Do not bill rides with late messages',
      ],
      answer: 0,
      explain: 'The scooter records when it was locked. Billing from that time is fair, whatever the delay of the message.',
    },
    {
      type: 'multi',
      prompt: 'Cities want trip data. Which three rules protect riders?',
      options: [
        'Share trips without rider identity',
        'Round start and end points or times where the city agrees it is enough',
        'Give each city only trips in its own area',
        'Share the rider name so the city can contact them',
      ],
      answer: [0, 1, 2],
      explain: 'Cities need patterns of use, not people. No identity, coarser data where possible, and only their own area protect riders.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Each city wants data in a different format and some want it in real time. How do you serve them?',
      options: [
        'One internal trip event, with a small adapter per city for its format and delivery method',
        'A separate data pipeline per city built from the scooter messages',
        'Send every city the raw scooter messages',
        'Refuse cities that want a different format',
      ],
      answer: 0,
      explain: 'A shared trip event keeps one source of truth. Thin adapters per city handle formats and timing without copying the logic.',
    },
    {
      type: 'match',
      prompt: 'Match each event to what it drives.',
      pairs: [
        ['Unlock confirmed', 'Start the ride and the billing clock'],
        ['Lock recorded', 'End the ride and calculate the fare'],
        ['Ride completed', 'Take payment and send the receipt'],
        ['Trip published', 'Anonymised data to the city of that area'],
      ],
      explain: 'Each event from the scooter or the platform drives one clear next step.',
    },
    {
      type: 'order',
      prompt: 'Order the build.',
      items: [
        'Define the ride and trip events and the privacy rules with legal',
        'Build unlock with confirmation and lock with recorded time',
        'Build fare calculation and payment',
        'Build the city adapters, starting with the city that has the strictest rules',
        'Add cities one by one',
      ],
      explain: 'Events and privacy rules come first because billing and city data depend on them.',
    },
  ],
  description: `
**Context.** An e-scooter operator runs **25,000 scooters** in **12 cities**. Riders unlock with an app and pay per minute.

**Facts gathered so far**
- Scooters talk to the platform over mobile data. Signal is weak in some streets and car parks.
- Riders complain about being charged for rides that never started, and for minutes after they locked.
- Every city requires trip data under its operating permit. Formats and timing differ by city.
- Privacy law forbids sharing who rode where.

**Opinions**
- Head of operations: "Riders must never pay for a scooter that did not unlock."
- Legal: "Trip data must never identify a rider."
- City partnerships: "Every city thinks its format is the standard."

**Your task.** Design unlock, end of ride, billing and city data sharing.
`,
  answerTemplate: `## Decision

## Unlock and lock

## Billing

## City data

## Privacy

## Rollout

## Risks
`,
  keyPoints: [
    'Start the ride and billing only when the scooter confirms the unlock.',
    'Bill from the lock time the scooter recorded, even when the message is late.',
    'One internal trip event feeds billing and every city.',
    'A thin adapter per city handles format and delivery.',
    'Trip data shared with cities has no rider identity and only covers their area.',
    'Agree privacy rules with legal before building the city feeds.',
  ],
  solution: `
**Decision.** Ride events from the scooters drive billing, and an anonymised trip event feeds a small adapter per city.

**Unlock and lock.** The app asks the platform to unlock. The platform sends the command and waits a short time for the scooter to confirm. Only then does the ride start. If there is no confirmation, the rider sees a clear message and no charge. At lock, the scooter records the time and position, and sends them as soon as it can.

**Billing.** The fare uses the confirmed unlock time and the recorded lock time. Payment is taken when the ride completes, and the receipt shows both times.

**City data.** Each completed ride becomes a trip event without rider identity. Adapters per city filter to their area, shape the format and deliver it as an API, a feed or a file, at the timing the city asks for.

**Privacy.** No rider identity, coarser positions where agreed, and access logs on every city feed.

**Risks.** Scooters that never reconnect, cities changing formats, and data that could still identify a rider when combined with other sources.
`,
  followUps: [
    { q: 'What if the scooter never sends the lock message?', a: 'Close the ride by a rule after a set time, using the last known position, and review it, so riders are not billed without limit.' },
    { q: 'Why not let each city read the main database?', a: 'It would expose rider data and tie every city to the internal schema. Adapters share only what each city needs.' },
    { q: 'How can anonymised trips still identify someone?', a: 'A trip that starts at a home and ends at a workplace every day points to a person. Rounding and agreed limits reduce this.' },
    { q: 'How do you prove billing is fair?', a: 'Track refunds for unstarted rides and disputes about end times before and after the change.' },
  ],
}
