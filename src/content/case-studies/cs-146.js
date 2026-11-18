export default {
  id: 'cs-146',
  category: 'case-studies',
  title: 'Insurer Adding a Fraud Score to New Claims Without Slowing the First Call',
  level: 'ADVANCED',
  tags: ['claims', 'fraud', 'async', 'timeouts', 'insurance'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The fraud service takes 1 to 8 seconds. Claim handlers need an answer in under 2. What design fits?',
      options: [
        'Register the claim at once, then score it in the background and route it when the score returns',
        'Wait for the score on every claim',
        'Skip fraud checks on busy days',
        'Ask the customer to call back',
      ],
      answer: 0,
      explain: 'Taking the claim does not need the score. Routing it to fast track or review does, and that can wait seconds.',
    },
    {
      type: 'single',
      prompt: 'The fraud service is down for an hour. What happens to new claims?',
      options: [
        'They are registered as normal and wait for a score, then are scored when the service returns',
        'They are rejected',
        'They are all fast tracked',
        'They are deleted',
      ],
      answer: 0,
      explain: 'No claim is lost and none skips the check. The queue holds them until the service is back.',
    },
    {
      type: 'multi',
      prompt: 'Which three facts should go to the fraud service?',
      options: [
        'Claim type, amount and date of loss',
        'Policy start date and past claims count',
        'Device and channel the claim came from',
        'The handler\'s login password',
      ],
      answer: [0, 1, 2],
      explain: 'Send what the model uses and nothing more. Credentials never go to another service.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Regulators say customers must not be treated unfairly by an automatic score. What do you add?',
      options: [
        'A person reviews any claim the score would delay or refuse, and every decision records the score and the reason',
        'Hide the score from everyone',
        'Refuse high scores automatically',
        'Ignore the rule',
      ],
      answer: 0,
      explain: 'A score can send a claim to review, but people make the hard decisions, and the record shows why.',
    },
    {
      type: 'match',
      prompt: 'Match each score band to a route.',
      pairs: [
        ['Low', 'Fast track to payment'],
        ['Medium', 'Normal handling'],
        ['High', 'Review by the fraud team'],
        ['No score yet', 'Hold routing until the score arrives'],
      ],
      explain: 'Routes depend on the score, and a missing score is a state of its own.',
    },
    {
      type: 'order',
      prompt: 'Order the build.',
      items: [
        'Agree bands and routes with claims and fraud teams',
        'Register claims at once and publish a claim event',
        'Score claims from the event and store the score',
        'Route claims by band, with review for high scores',
        'Report scores against later outcomes',
      ],
      explain: 'Rules, then intake, then scoring, then routing, then learning.',
    },
  ],
  description: `
**Context.** An insurer takes **2,000 home and motor claims a day** by phone and online. It wants every new claim scored by a fraud service.

**Facts gathered so far**
- Claim handlers register claims in the claims system while the customer is on the phone. They need the screen to respond in under 2 seconds.
- The fraud service answers in 1 to 8 seconds and has had outages of an hour.
- Low risk claims could be paid within a day if scored early.
- The regulator expects fair treatment and a record of how decisions were made.

**Opinions**
- Claims director: "Do not make customers wait on the phone."
- Fraud lead: "Every claim must be scored."
- Compliance: "No customer is refused by a machine alone."

**Your task.** Design how claims are scored and routed without slowing the first call.
`,
  answerTemplate: `## Decision

## Claim intake

## Scoring

## When scoring is down

## Routing

## Fairness and records

## Risks
`,
  keyPoints: [
    'Register the claim first and score it in the background.',
    'An event or queue between intake and scoring.',
    'A missing score is a state, not a pass.',
    'Route by score band, with people deciding on high scores.',
    'Record the score and the reason with each decision.',
    'Compare scores with outcomes to tune the bands.',
  ],
  solution: `
**Decision.** Claims are registered at once. A claim event goes on a queue, a scoring flow calls the fraud service, and routing happens when the score arrives.

**Claim intake.** The claims system confirms the claim to the handler within the 2 second target, with no fraud call in the path.

**Scoring.** A consumer reads claim events, sends the needed facts to the fraud service, and stores the score with the claim.

**When scoring is down.** Events wait on the queue with retries. Claims show "awaiting score".

**Routing.** Low goes to fast track, medium to normal handling, high to fraud review.

**Fairness and records.** People decide any delay or refusal. Each decision stores the score, the band and the reason.

**Risks.** Queue backlogs after an outage, bands that are too strict, and facts sent that the model does not need.
`,
  followUps: [
    { q: 'Why not call the fraud service with a 2 second timeout?', a: 'Many claims would time out and go unscored. Background scoring scores every claim.' },
    { q: 'What if a high score arrives after payment?', a: 'Fast track should wait for the score. Payment comes after routing, never before.' },
    { q: 'How do you replay after an outage?', a: 'The queued events are scored in order once the service is back, with a rate limit.' },
    { q: 'How do you tune the bands?', a: 'Compare scores with claims later found to be fraud, and adjust with the fraud team.' },
  ],
}
