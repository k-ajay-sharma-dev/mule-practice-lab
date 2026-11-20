export default {
  id: 'cs-124',
  category: 'case-studies',
  title: 'Car Rental Company Billing Fuel and Mileage From Vehicle Telematics at Return',
  level: 'ADVANCED',
  tags: ['telematics', 'iot', 'events', 'billing', 'batching'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: '60,000 cars send a reading every minute while driving. What should the integration pass to billing?',
      options: [
        'The mileage and fuel readings at pick-up and at return for each rental',
        'Every reading of a rented car, so billing can calculate everything itself',
        'A daily file with each car\'s last reading of the day, for all 60,000 cars',
        'The reading at return only, compared with the fleet\'s standard full tank',
      ],
      answer: 0,
      explain: 'Billing needs two readings per rental; the telematics platform keeps the raw stream for other uses. Every reading floods billing with data it does not use. A daily file is too late and not tied to the rental times. Without the pick-up reading, mileage cannot be worked out and a car that left half full is billed wrongly.',
    },
    {
      type: 'single',
      prompt: 'A car is returned in an underground car park and its last reading arrives 30 minutes late. What should the return flow do?',
      options: [
        'Wait a set time for a reading, then use the counter reading and mark it for review',
        'Bill from the last reading received before the return, even if it is an hour old',
        'Keep the rental open until a reading arrives, then close and bill it',
        'Ask the vendor\'s API for the latest reading and bill from whatever it returns',
      ],
      answer: 0,
      explain: 'Late readings are normal for connected cars. A short wait catches most of them, and a fallback with review stops the customer waiting forever. An hour-old reading misses the last drive. An open rental can wait an hour or more and blocks the next booking of the car. The vendor\'s latest reading may be the same stale one from before the car park.',
    },
    {
      type: 'multi',
      prompt: 'Which two checks catch a bad reading before it reaches an invoice?',
      options: [
        'Mileage must not go backwards and must fit the rental length',
        'Fuel must be within the tank size of that model',
        'The reading must arrive within 5 minutes of the time it was taken',
        'The car must be at a company location when the reading is taken',
      ],
      answer: [0, 1],
      explain: 'Rules on mileage and fuel catch faulty sensors. A reading outside the rules goes to review instead of to the invoice. Late readings are normal in car parks and tunnels, and readings during the rental come from anywhere, so those two checks would reject good data.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The telematics vendor sends events to a webhook. What sits behind the webhook?',
      options: [
        'A small API that checks each event, puts it on a queue and answers at once',
        'A flow that updates the rental and calls billing before it answers the vendor',
        'A flow that answers at once and then processes the event in memory',
        'A scheduled job that reads the vendor\'s API for every car each minute',
      ],
      answer: 0,
      explain: 'The webhook must answer fast or the vendor retries and floods it. Storing to a queue and answering at once decouples the vendor from billing speed. Calling billing first makes the vendor wait. Processing in memory after answering loses events on a restart. Polling 60,000 cars a minute is 1,000 calls a second for data the vendor would push.',
    },
    {
      type: 'match',
      prompt: 'Match each event to what happens.',
      pairs: [
        ['Rental started', 'Store the pick-up mileage and fuel on the rental'],
        ['Rental returned', 'Get the return reading and calculate charges'],
        ['Reading fails a rule', 'Send to review, use the counter reading'],
        ['Reading arrives very late', 'Attach it to the closed rental for audit only'],
      ],
      explain: 'Each event changes the rental in a defined way, so billing never guesses.',
    },
    {
      type: 'order',
      prompt: 'Order the delivery.',
      items: [
        'Agree with billing which readings and rules they need',
        'Build the webhook and queue, and test with recorded vendor events',
        'Run in shadow mode, comparing telematics charges with counter charges',
        'Switch billing to telematics for one country',
        'Roll out to the rest after a month of low disputes',
      ],
      explain: 'Shadow mode shows how often the two sources differ before any customer is billed from telematics.',
    },
  ],
  description: `
**Context.** A car rental company has **60,000 connected cars** in five countries. Fuel and mileage at return are typed in by counter staff, and **8% of invoices are disputed**.

**Facts gathered so far**
- Each car sends a reading (mileage, fuel level, location) every minute while it is driving, through a telematics vendor.
- The vendor can send events to a webhook, or offer an API to read the latest reading of a car.
- Readings from car parks and tunnels can arrive up to an hour late.
- Some fuel sensors report wrong values after a battery change.
- Billing runs in an ERP that cannot take high event volumes.

**Opinions**
- Finance: "Disputes cost us more than the cars' fuel."
- Fleet operations: "We also want the raw data for maintenance, but that is a separate project."
- Billing team: "Do not flood our ERP."

**Your task.** Design how telematics readings become charges at return, including late and wrong readings.
`,
  answerTemplate: `## Decision

## What reaches billing

## Receiving vendor events

## Late and wrong readings

## Rollout

## Risks
`,
  keyPoints: [
    'Billing needs two readings per rental, not the raw stream.',
    'The webhook stores events on a queue and answers fast; a consumer does the work.',
    'Wait a bounded time for a reading after return, then fall back to the counter reading.',
    'Simple rules on mileage and fuel catch faulty sensors before invoicing.',
    'Shadow mode compares telematics with counter readings before customers are billed from them.',
    'Keep the raw stream in the telematics platform for fleet uses.',
  ],
  solution: `
**Decision.** Use telematics for the pick-up and return readings only, with checks and a fallback.

**Receiving events.** A small webhook API checks the vendor signature, stores each event on a queue and answers at once. A consumer keeps the latest reading per car.

**What reaches billing.** At pick-up and return, the rental flow takes the reading closest after the event time and stores it on the rental. Billing receives one charge calculation per rental, not readings.

**Late and wrong readings.** At return the flow waits up to a set time, such as 30 minutes, for a reading after the return time, using the vendor API if needed. If none arrives, it bills from the counter reading and marks the rental for review. Rules check that mileage does not go backwards, fits the rental length, and that fuel is within the tank size. A failed rule sends the reading to review.

**Rollout.** Shadow mode first, then one country, then the rest when disputes fall.

**Risks.** Vendor outages on busy return days, sensor faults the rules miss, and staff trusting counter readings less once telematics is live.
`,
  followUps: [
    { q: 'Why not call the vendor API at every return instead of using events?', a: 'It works as a fallback, but at peak returns it adds many calls and depends on the vendor being up at that moment. Events keep the latest reading ready.' },
    { q: 'How long should the return flow wait?', a: 'Long enough to catch most late readings, based on measured delays, and short enough that the customer gets the invoice the same day.' },
    { q: 'What do you do with readings that arrive after the rental closed?', a: 'Attach them for audit and for disputes, but do not change the invoice automatically.' },
    { q: 'How do you prove the change worked?', a: 'Compare the dispute rate and the time spent on disputes before and after, per country.' },
  ],
}
