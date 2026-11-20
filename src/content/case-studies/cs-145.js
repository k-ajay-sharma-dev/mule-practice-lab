export default {
  id: 'cs-145',
  category: 'case-studies',
  title: 'Wholesaler Replacing Nightly Price Files With a Price API for 3,000 Independent Shops',
  level: 'INTERMEDIATE',
  tags: ['api-design', 'pricing', 'caching', 'partners', 'migration'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Shops want today’s prices without waiting for the nightly file. What should the API offer first?',
      options: [
        'Prices changed since a given time, plus a full list for a fresh start',
        'Only the full list of 40,000 prices, returned on every call',
        'Only a single product price, called for each item at the till',
        'A webhook that the wholesaler calls on each shop’s till',
      ],
      answer: 0,
      explain: 'Changes since a time keep calls small and frequent. A full list lets a new shop or a broken one start over. A full list on every poll is heavy, a call per item at the till puts the API in every sale, and many tills cannot receive calls.',
    },
    {
      type: 'single',
      prompt: 'Each shop has its own discount level. Where should shop prices be worked out?',
      options: [
        'In one price service, from the list price and the shop’s level',
        'In each shop’s till, from list prices and the level set in the till',
        'In the nightly file job, as today, with the API reading the file',
        'In each till vendor’s integration, using rules the wholesaler shares',
      ],
      answer: 0,
      explain: 'One place applies the rules, so the API and the file give a shop the same price. Logic in tills or vendor integrations is copied 15 times, and the file job only runs at night.',
    },
    {
      type: 'multi',
      prompt: 'Which three protect the API when thousands of shops poll it?',
      options: [
        'Cache list prices, which change at most a few times a day',
        'Rate limit per shop client ID',
        'Ask shops to poll every 15 minutes, not every second',
        'One shared client ID per till vendor for all of its shops',
      ],
      answer: [0, 1, 2],
      explain: 'Caching, limits per shop and a clear polling contract keep load under control. A shared ID per vendor hides which shop is calling and cannot return each shop its own prices.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Some till vendors cannot call an API for a year. What do you do?',
      options: [
        'Keep the nightly file, built from the same price service, until they move',
        'Turn the file off on the day the API goes live',
        'Keep the old file job and its price logic as it is for those shops',
        'Ask those shops to change to a till that can call the API',
      ],
      answer: 0,
      explain: 'The file becomes one more output of the same prices, so file and API never disagree. Shops move when their vendor is ready, and shop owners do not want to change till.',
    },
    {
      type: 'match',
      prompt: 'Match each need to an operation.',
      pairs: [
        ['New shop setting up', 'Full price list for that shop'],
        ['Shop updating every 15 minutes', 'Prices changed since a time'],
        ['Checking one item’s price', 'Single product price'],
        ['Shop on an old till', 'Nightly file from the same service'],
      ],
      explain: 'A few clear operations cover every shop, old and new.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Build one price service that applies shop levels',
        'Produce the nightly file from it, so files and API agree',
        'Open the API to a pilot group of shops',
        'Onboard till vendors one by one',
        'Retire the file when the last shop has moved',
      ],
      explain: 'One source of prices first, then outputs, then move shops at their pace.',
    },
  ],
  description: `
**Context.** A grocery wholesaler supplies **3,000 independent shops**. Each night it sends every shop a price file. Prices now change during the day, and shops sell at old prices until the next file.

**Facts gathered so far**
- 40,000 products. List prices change a few hundred times a day.
- Each shop has a discount level that changes its prices.
- Shops use about 15 different till systems. Five vendors cover most shops and are ready to call an API.
- Some vendors cannot change their product for a year.

**Opinions**
- Sales: "Shops lose margin when they sell at yesterday's cost."
- Shop owners: "Do not make us change till."
- IT: "Today the price logic is in the file job."

**Your task.** Design the price API, how shops move to it, and how the old file is retired.
`,
  answerTemplate: `## Decision

## Price service

## API operations

## Load

## Old tills

## Rollout

## Risks
`,
  keyPoints: [
    'One price service applies shop levels for every channel.',
    'Offer changes since a time, plus a full list.',
    'Cache list prices and limit per shop.',
    'Keep the nightly file, built from the same service, for old tills.',
    'Onboard till vendors one by one.',
    'Retire the file only when the last shop has moved.',
  ],
  solution: `
**Decision.** Move price logic out of the file job into one price service. The API and the nightly file both use it.

**Price service.** List prices plus shop levels give each shop's prices. Each change gets a time stamp.

**API operations.** Full list for a shop, changes since a time, and one product price.

**Load.** List prices cached, rate limits per shop client ID, and a polling interval in the contract.

**Old tills.** The nightly file continues, made from the same service, so file and API never disagree.

**Rollout.** Pilot shops, then vendors one at a time, then retire the file.

**Risks.** Shops polling too often, vendors slow to move, and price rules hidden in the old job.
`,
  followUps: [
    { q: 'Why not push prices to shops?', a: 'Many shops cannot receive calls. Polling for changes works with any till that can call out.' },
    { q: 'How do you handle a shop that missed a day?', a: 'It asks for changes since its last time, or takes a full list.' },
    { q: 'How do you know when the file can go?', a: 'Track which shops still download it, and work with their vendors.' },
    { q: 'Should every shop see list prices?', a: 'No. Each shop sees its own prices, identified by its client ID.' },
  ],
}
