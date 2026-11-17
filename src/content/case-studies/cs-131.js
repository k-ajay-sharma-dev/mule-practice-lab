export default {
  id: 'cs-131',
  category: 'case-studies',
  title: 'Food Bank Network Matching Supermarket Surplus to 600 Charities Before It Spoils',
  level: 'INTERMEDIATE',
  tags: ['nonprofit', 'matching', 'events', 'notifications', 'partners'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Supermarkets post surplus food that must be collected within hours. How should charities learn about an offer?',
      options: [
        'Publish an offer event and notify the charities that match its area, food type and storage, so the fastest can claim it',
        'Email the full list of offers to all 600 charities every evening',
        'Let charities check a website when they remember',
        'Phone each charity in turn',
      ],
      answer: 0,
      explain: 'Fresh food spoils within hours. Matching and notifying at once gives the right charities time to collect. A nightly email is too late.',
    },
    {
      type: 'single',
      prompt: 'Two charities claim the same offer within a second. What should happen?',
      options: [
        'The claim API accepts the first claim only, and the second gets a clear "already claimed" answer',
        'Both claims succeed and they share the food at the store',
        'The last claim wins',
        'Both are rejected to be fair',
      ],
      answer: 0,
      explain: 'Only one charity can collect. An atomic claim, such as a conditional update on the offer status, gives one winner and a clear answer to the other.',
    },
    {
      type: 'multi',
      prompt: 'Which three facts should each offer carry so matching works?',
      options: [
        'Collection window and store location',
        'Storage needs such as chilled or frozen',
        'Food categories and approximate weight',
        'The store manager\'s home phone number',
      ],
      answer: [0, 1, 2],
      explain: 'Matching needs where, when, how it must be kept and what it is. Personal phone numbers do not belong in a shared offer.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Supermarket chains use different systems. Two can call an API, the rest send a CSV export. What do you do?',
      options: [
        'Offer an API for those who can call it and a file intake that turns each row into the same offer event',
        'Wait until every chain can call the API',
        'Build a separate matching process for each chain',
        'Type the CSV files in by hand',
      ],
      answer: 0,
      explain: 'Two entry points feeding one offer event keep one matching process while each chain joins in the way it can.',
    },
    {
      type: 'match',
      prompt: 'Match each step to its part.',
      pairs: [
        ['Store posts surplus', 'Offer API or file intake'],
        ['Find suitable charities', 'Matching service on offer events'],
        ['Tell charities', 'Notification service by text or app'],
        ['One charity takes it', 'Claim API with an atomic update'],
      ],
      explain: 'Each step has one owner, which keeps the flow clear and testable.',
    },
    {
      type: 'order',
      prompt: 'Order the launch.',
      items: [
        'Agree the offer fields with supermarkets and charities',
        'Build the offer API, file intake and offer event',
        'Build matching, notifications and the claim API',
        'Pilot with one chain and 30 charities in one city',
        'Add chains and regions one at a time',
      ],
      explain: 'The shared offer comes first because everything depends on it, then a small real pilot.',
    },
  ],
  description: `
**Context.** A food bank network collects surplus food from supermarkets and passes it to **600 charities**. Fresh food must be collected within a few hours.

**Facts gathered so far**
- Today stores phone a regional coordinator, who phones charities until one says yes.
- A lot of fresh food is thrown away because nobody is found in time.
- Charities differ: some have freezers and vans, others can only take dry food on foot.
- Two supermarket chains can call an API. The others can only export a CSV from their store systems.
- Charities use phones, and many volunteers do not use email.

**Opinions**
- Operations lead: "Every hour lost is food in the bin."
- Charities: "Do not send us offers we cannot use."
- Supermarkets: "We will not change our store systems for this."

**Your task.** Design how surplus offers reach the right charities and how one charity claims each offer.
`,
  answerTemplate: `## Decision

## Taking offers from stores

## Matching

## Notifying and claiming

## Rollout

## Risks
`,
  keyPoints: [
    'Every offer becomes one event, from an API or a file intake.',
    'Matching uses area, collection window, storage needs and food type.',
    'Notify only charities that can use the offer, by text or app.',
    'An atomic claim gives one winner and a clear answer to others.',
    'Stores join through the channel they already have.',
    'Pilot in one city with one chain before growing.',
  ],
  solution: `
**Decision.** Turn every surplus offer into an event, match it to suitable charities at once, and let one charity claim it through an atomic claim API.

**Taking offers.** Chains with APIs post offers directly. Others drop a CSV, which a file intake turns into the same offer event. Each offer has a store, a collection window, storage needs, categories and weight.

**Matching.** A matching service filters charities by distance, opening times, storage and the food types they accept.

**Notifying and claiming.** Matched charities get a text or app message with a link. The claim API updates the offer from open to claimed only if it is still open, so one charity wins. The others see it is taken. If nobody claims within a set time, the offer goes to a wider group or to the coordinator.

**Rollout.** Agree fields, build, pilot in one city, then grow chain by chain.

**Risks.** Charities that claim and do not collect, stores that post late, and CSV exports that change format.
`,
  followUps: [
    { q: 'How do you stop charities claiming and not collecting?', a: 'Ask the store to confirm collection, track no-shows per charity, and lower their priority after repeated misses.' },
    { q: 'Why not notify all charities?', a: 'Offers they cannot use teach them to ignore messages. Matching keeps every message relevant.' },
    { q: 'What if nobody claims an offer?', a: 'Widen the area after a set time, then alert the coordinator, so the food still has a chance.' },
    { q: 'How do you measure success?', a: 'Weight of food collected, share of offers claimed, and time from offer to claim.' },
  ],
}
