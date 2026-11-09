export default {
  id: 'cs-119',
  category: 'case-studies',
  title: 'Reviving a Stalled C4E: 900 Exchange Assets and 6% Reuse',
  level: 'EXPERT',
  tags: ['c4e', 'governance', 'exchange', 'reuse', 'reuse-metrics', 'operating-model', 'api-catalogue'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      prompt: 'The CIO quotes "6% reuse" from Exchange download counts. What do you do first?',
      options: [
        'Measure reuse from runtime data: distinct consuming applications per API from API Manager contracts and analytics',
        'Accept the figure and start a campaign asking teams to download more assets',
        'Delete every asset with fewer than ten downloads',
        'Buy a new catalogue tool, because Exchange is the problem',
      ],
      answer: 0,
      explain: 'Downloads count clicks, not use. Contracts and traffic show which APIs really have more than one consumer, which is the base for every later decision. Deleting by downloads or changing tools acts on a number that does not measure reuse.',
    },
    {
      type: 'multi',
      prompt: 'Which three measures show real reuse to leadership?',
      options: [
        'APIs with two or more consuming applications in production',
        'Share of new projects that consumed at least one existing API',
        'Delivery time and cost of projects that reused APIs compared with those that did not',
        'Number of assets published to Exchange this quarter',
      ],
      answer: [0, 1, 2],
      explain: 'Consumers per API, reuse by new projects and the delivery difference link the catalogue to business value. Counting published assets rewards publishing, which is how the catalogue grew to 900 assets with little reuse.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each catalogue problem to the fix.',
      pairs: [
        ['Seven different customer System APIs', 'Pick one owning domain team, deprecate the others with migration dates'],
        ['Assets with no description, examples or owner', 'A minimum publishing standard checked by an API Governance ruleset'],
        ['Teams cannot find the API they need', 'Organise by business domain with a curated list of recommended APIs'],
        ['Assets nobody has called in 12 months', 'Confirm with owners, then deprecate and archive them'],
      ],
      explain: 'Duplicates need an owner decision, quality needs a checked standard, findability needs domain structure, and dead assets need a safe retirement path. Each fix removes a reason teams stopped trusting the catalogue.',
    },
    {
      type: 'order',
      prompt: 'Order the revival plan.',
      items: [
        'Measure real reuse and clean the catalogue of dead and duplicate assets',
        'Define business domains and name an owning team for each core API',
        'Fund core domain APIs as products with a roadmap, not as side effects of projects',
        'Add an Exchange search and reuse check to every project’s design review',
        'Report reuse and delivery measures to leadership every quarter',
      ],
      explain: 'Trustworthy data comes first, then clear ownership, then money for the APIs others depend on, then a delivery gate that uses them, then regular evidence that it pays off.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Project teams say building a reusable API costs them 30% more and their budget only covers their own project. What do you propose?',
      options: [
        'Fund a small set of core domain APIs centrally, and let projects that reuse them skip that cost',
        'Order every project to build fully reusable APIs within its current budget',
        'Stop building System APIs and let projects connect directly to back ends',
        'Charge every project a fixed fee for the C4E whatever it uses',
      ],
      answer: 0,
      explain: 'Reuse fails when the first project pays for everyone. Central funding for the APIs most projects need moves the cost to where the benefit is. Mandates without money or dropping the layers bring the problem back.',
    },
    {
      type: 'single',
      prompt: 'What is the C4E’s role in the revived model?',
      options: [
        'Set standards, provide templates, coaching and the reuse measures, while business unit teams build and own their APIs',
        'Build every API centrally so quality is consistent',
        'Approve every change to every API before it is deployed',
        'Run the platform only and leave reuse to each team',
      ],
      answer: 0,
      explain: 'A C4E enables a federated model: it makes the right way the quickest way and measures results. A central build team becomes a bottleneck, approving every change slows delivery, and platform-only leaves the catalogue to decay again.',
    },
  ],
  description: `
**Context.** A telecom group operating in five countries bought Anypoint Platform four years ago and set up a **Center for Enablement (C4E)** with 8 people. Two years later most of the C4E moved to delivery projects, and the group now has:

- **900 assets** in Exchange: 520 API specifications, 210 fragments and examples, 170 templates and connectors.
- 410 APIs deployed across the five country business units.
- **Seven** different customer System APIs and five product catalogue APIs, one per country or project.
- Half of the assets have no owner listed; 300 have not been changed or called for over a year.

A slide for the board says **"6% reuse"**, calculated as Exchange downloads divided by assets. The CIO is asking whether the platform was worth the money, and a business unit wants to go back to point-to-point integrations "because APIs slow us down".

**What interviews found**
- Projects are funded per business case; nobody pays to make an API reusable.
- Teams search Exchange, find several similar APIs with no documentation, and build another one.
- Design reviews check naming conventions but never ask whether an existing API could be used.
- Two country teams do reuse each other's APIs heavily, with good results, without any C4E involvement.

**Your role.** You are the new head of integration. You have a budget for 5 people for 12 months and need to show results to the CIO after two quarters.

**Your task.** Diagnose why reuse stalled and present a revival plan: measures, catalogue clean-up, ownership, funding, and the C4E operating model.
`,
  answerTemplate: `## Diagnosis

## Measuring real reuse

## Catalogue clean-up

## Domains and ownership

## Funding reusable APIs

## C4E operating model

## Results after two quarters
`,
  keyPoints: [
    'Downloads are not reuse: measure consuming applications per API from contracts and traffic, and reuse by new projects.',
    'Clean the catalogue: deprecate dead assets after owner confirmation, consolidate duplicate domain APIs under one owner, and enforce a minimum publishing standard.',
    'Organise APIs by business domain with named owning teams and a curated list of recommended APIs.',
    'Fund core domain APIs as products so the first consumer does not pay for everyone; projects that reuse them deliver cheaper.',
    'The C4E enables and measures (standards, templates, coaching, design review reuse check), while business units build; learn from the two countries already reusing well.',
  ],
  solution: `
**Diagnosis.** Reuse stalled because nothing rewards it: projects pay for reusability but do not benefit, the catalogue is untrustworthy (duplicates, no owners, no docs), and design reviews do not ask about reuse. The 6% figure measures downloads, not use.

**Measure (weeks 1 to 4).** From API Manager: client applications per API in production. From project records: which projects in the last year consumed an existing API, and their delivery time against similar projects that did not. Expect a much better number than 6% for the APIs used across the two cooperating countries; that is the story to build on.

**Clean up (months 1 to 3).** Archive the 300 dormant assets after owners confirm. For customer and product APIs, pick the best implementation per domain, name one owning team, publish one v1 contract, and deprecate the others with migration dates. An API Governance ruleset requires description, examples, owner and lifecycle state before publishing.

**Ownership and funding.** Define about 10 business domains (customer, product, order, billing, network inventory). Each core API has a product owner and a small central budget for its roadmap. Projects that reuse it pay only for their Experience or Process layer.

**C4E model.** Five people: platform standards and templates, coaching embedded in projects, a design review step that starts with an Exchange search, and the reuse dashboard. Business units build and own their APIs. The two countries already reusing well become the reference and help coach the others.

**Two-quarter result.** Catalogue reduced to trusted assets, one customer API with three consumers, a reuse dashboard for the CIO, and two projects delivered faster because they reused domain APIs.
`,
  followUps: [
    { q: 'Why is the Exchange download count a poor reuse measure?', a: 'A download is a click by a developer looking around. Reuse means a second application calling the API in production, which only contracts and traffic show.' },
    { q: 'How do you pick which of seven customer APIs survives?', a: 'Compare consumers, quality, test coverage and fit with the target data model. Choose the one easiest to extend, and give the others’ consumers a supported migration with dates.' },
    { q: 'How do you answer the business unit that wants point-to-point back?', a: 'Show what reuse saved where it happened, and fix the real cause of slowness, which is often missing or untrusted APIs. Offer them a funded domain API they can consume instead of building another.' },
    { q: 'What makes a C4E stall again?', a: 'Losing its people to delivery, measuring outputs like assets published, and having no budget or authority over core domain APIs. A sponsor and quarterly reporting protect it.' },
  ],
}
