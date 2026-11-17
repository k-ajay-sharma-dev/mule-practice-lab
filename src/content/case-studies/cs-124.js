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
        'Only what billing needs: mileage and fuel at pick-up and return, with the raw stream kept in the telematics platform',
        'Every reading, so billing can calculate everything itself',
        'Nothing, and let counter staff type the readings in',
        'A daily file with every reading of every car',
      ],
      answer: 0,
      explain: 'Billing needs two readings per rental. Sending every reading floods billing with data it does not use. The telematics platform keeps the raw stream for other uses.',
    },
    {
      type: 'single',
      prompt: 'A car is returned in an underground car park and its last reading arrives 30 minutes late. What should the return flow do?',
      options: [
        'Wait for a reading after the return time, up to a limit, then bill from the counter reading and mark it for review',
        'Bill from the last reading received before the return, even if it is an hour old',
        'Refuse to close the rental until a reading arrives, however long it takes',
        'Bill a full tank of fuel to be safe',
      ],
      answer: 0,
      explain: 'Late readings are normal for connected cars. A short wait catches most of them, and a fallback with review stops the customer waiting forever. Old readings or guesses lead to disputes.',
    },
    {
      type: 'multi',
      prompt: 'Which two checks catch a bad reading before it reaches an invoice?',
      options: [
        'Mileage must not go backwards and must fit the rental length',
        'Fuel must be within the tank size of that model',
        'The reading must arrive between 09:00 and 17:00',
        'The car colour must match the booking',
      ],
      answer: [0, 1],
      explain: 'Simple rules on mileage and fuel catch faulty sensors. A reading outside the rules goes to review instead of to the invoice.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The telematics vendor sends events to a webhook. What sits behind the webhook?',
      options: [
        'A small API that checks and stores each event on a queue quickly, with processing done by a consumer',
        'A flow that calls billing for every event before it answers the vendor',
        'A database insert of the raw event with no other checks',
        'An email to the billing team for each event',
      ],
      answer: 0,
      explain: 'The webhook must answer fast or the vendor retries and floods it. Storing to a queue and answering at once decouples the vendor from billing speed.',
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
