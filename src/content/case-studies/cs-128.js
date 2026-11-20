export default {
  id: 'cs-128',
  category: 'case-studies',
  title: 'Regional Airport Sharing Flight Status With Airlines, Ground Handlers and Passenger Apps',
  level: 'ADVANCED',
  tags: ['aviation', 'events', 'pub-sub', 'apis', 'real-time'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Gate changes reach screens, apps and ground handlers at different times today. What should be the single source of flight status?',
      options: [
        'The operational database, publishing a flight status event for every change',
        'Each airline’s own system, read separately by every consumer',
        'The terminal screen system, which the other consumers read from',
        'Whichever system each consumer already reads, synced nightly',
      ],
      answer: 0,
      explain: 'One source with one event per change gives every consumer the same facts at the same time. Reading many systems gives many versions, and the screens are a consumer, not a source.',
    },
    {
      type: 'single',
      prompt: 'Airlines send their own time estimates, and the airport has its own. How do you avoid confusion?',
      options: [
        'Keep both in named fields, and pick the public one by an agreed rule',
        'Keep the airline value and drop the airport one on arrival',
        'Store one estimate field and overwrite it with the latest value',
        'Show passengers the earlier of the two estimates to be safe',
      ],
      answer: 0,
      explain: 'Both values matter to different people. Clear names keep them apart, and one rule decides what passengers see.',
    },
    {
      type: 'multi',
      prompt: 'Which three ways of sharing fit the different consumers?',
      options: [
        'A topic with flight events that ground handlers subscribe to',
        'A read API with caching for passenger apps and the website',
        'A partner API with rate limits for third-party travel apps',
        'Direct access to the operational database for every consumer',
      ],
      answer: [0, 1, 2],
      explain: 'Operations need events pushed at once, apps need fast reads, and outside partners need a protected API. Direct database access couples everyone to it.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'During a snow day, status changes rise twentyfold and passenger app traffic rises tenfold. What protects the operational database?',
      options: [
        'Serve reads from a cache or read copy that the events keep up to date',
        'Scale up the operational database for the day of the snow',
        'Rate limit the passenger app so it reads less often from the database',
        'Batch status changes and publish them every five minutes',
      ],
      answer: 0,
      explain: 'The read path is fed by events, so app traffic never reaches the operational database. Scaling for one day is slow and costly, a rate limit refuses passengers on the worst day, and batching delays the changes people need most.',
    },
    {
      type: 'match',
      prompt: 'Match each consumer to how it gets flight status.',
      pairs: [
        ['Ground handler systems', 'Subscribe to flight events'],
        ['Terminal screens', 'Subscribe to flight events for their area'],
        ['Passenger app', 'Read API backed by a cache'],
        ['Third-party travel apps', 'Partner API with keys and rate limits'],
      ],
      explain: 'Each consumer gets status in the way that fits its speed and trust.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Agree the flight status event and field names with airlines and handlers',
        'Publish events from the operational database',
        'Move terminal screens and handlers to the events',
        'Build the cached read API for apps',
        'Open the partner API to third parties',
      ],
      explain: 'The event model comes first, then the internal consumers who need it most, then apps and partners.',
    },
  ],
  description: `
**Context.** A regional airport handles **18 million passengers** a year with 25 airlines and 4 ground handling companies.

**Facts gathered so far**
- Flight data lives in the airport operational database. Airlines also send their own times.
- Terminal screens, the website, the passenger app and ground handlers each read flight status in their own way.
- A gate change can take ten minutes to reach all of them, and they sometimes disagree.
- On disruption days, changes and app traffic both rise sharply, and the operational database slows down.
- Travel apps outside the airport want flight data too.

**Opinions**
- Operations director: "Everyone must see the same gate at the same time."
- Digital lead: "The app must stay fast on the worst day."
- IT security: "Outside apps must never touch our operational systems."

**Your task.** Design how flight status reaches every consumer, quickly and consistently, including on a disruption day.
`,
  answerTemplate: `## Decision

## Source of truth

## Event model

## Consumers

## Disruption days

## Partners

## Risks
`,
  keyPoints: [
    'One source of truth publishes a flight status event for every change.',
    'Airline and airport values are kept apart by name, with one rule for the public value.',
    'Operational consumers subscribe to events; apps read from a cache fed by events.',
    'Outside apps use a partner API with keys and rate limits.',
    'App traffic never reaches the operational database.',
    'Agree the event fields with airlines and handlers first.',
  ],
  solution: `
**Decision.** The operational database is the source of truth, and it publishes a flight status event for each change. Every consumer is fed from those events.

**Event model.** One event per change with flight, schedule, estimates by source, gate, stand, status and a version number. Airline and airport estimates have separate fields. The public time comes from an agreed rule.

**Consumers.** Ground handlers and terminal screens subscribe to a topic, filtered by area where needed. A read API for the website and the app is served from a cache or read copy updated by the events.

**Disruption days.** The event flow scales with the changes. App traffic grows on the read path only, which is cached, so the operational database is not affected.

**Partners.** A partner API over the same read copy, with client IDs, rate limits and a delay where the airport prefers it.

**Risks.** Events out of order, which the version number handles, airlines that keep sending conflicting times, and a cache that serves stale data if events stop.
`,
  followUps: [
    { q: 'How do you handle events that arrive out of order?', a: 'Each event carries a version or timestamp, and consumers ignore anything older than what they have.' },
    { q: 'What if the cache stops getting events?', a: 'Alert on the age of the last event, and show the time of the last update in the app.' },
    { q: 'Why not let partners subscribe to the topic?', a: 'The topic is for trusted operational consumers. A partner API controls who gets data and how much, without exposing the internal broker.' },
    { q: 'How do you prove everyone now sees the same gate?', a: 'Measure the time from a change in the operational database to each consumer, and compare their values during a disruption day.' },
  ],
}
