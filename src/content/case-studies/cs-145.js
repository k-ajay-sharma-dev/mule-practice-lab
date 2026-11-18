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
      prompt: 'Shops want today\'s prices without waiting for the nightly file. What should the API offer first?',
      options: [
        'A way to fetch only prices changed since a given time, plus a full list for a fresh start',
        'Only the full list of 40,000 prices on every call',
        'One call per product',
        'A daily email',
      ],
      answer: 0,
      explain: 'Changes since a time keep calls small and frequent. A full list lets a new shop or a broken one start over.',
    },
    {
      type: 'single',
      prompt: 'Each shop has its own discount level. Where should shop prices be worked out?',
      options: [
        'In the API, from the list price and the shop\'s level, so shops get their own price',
        'In each shop\'s till',
        'In a spreadsheet sent to each shop',
        'Shops should guess',
      ],
      answer: 0,
      explain: 'One place applies the rules, so every channel gives a shop the same price.',
    },
    {
      type: 'multi',
      prompt: 'Which three protect the API when thousands of shops poll it?',
      options: [
        'Cache list prices, which change at most a few times a day',
        'Rate limit per shop client ID',
        'Ask shops to poll every 15 minutes, not every second',
        'Give every shop the same client ID',
      ],
      answer: [0, 1, 2],
      explain: 'Caching, limits per shop and a clear polling contract keep load sane. One shared ID would hide who is calling.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Some till vendors cannot call an API for a year. What do you do?',
      options: [
        'Keep producing the nightly file from the same price service until those shops move',
        'Turn the file off on day one',
        'Build a second price engine for files',
        'Ask shops to change till',
      ],
      answer: 0,
      explain: 'The file becomes one more output of the same prices. Shops move when their vendor is ready.',
    },
    {
      type: 'match',
      prompt: 'Match each need to an operation.',
      pairs: [
        ['New shop setting up', 'Full price list for that shop'],
        ['Shop updating every 15 minutes', 'Prices changed since a time'],
        ['Price for one item at the till', 'Single product price'],
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
