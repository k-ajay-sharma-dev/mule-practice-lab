import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-065',
  category: 'case-studies',
  title: 'Department Store Syndicating Product Data From a New PIM to Web, Stores and Marketplaces',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'retail', 'e-commerce', 'master-data', 'pub-sub', 'events', 'marketplace', 'anypoint-mq', 'saas-integration'],
  estMinutes: 45,
  diagram: {
    task: 'draw the product syndication design: the PIM System API publishing a product-published event to one topic, a queue per channel, one Process API per channel that fetches the full product from the PIM System API, and the commerce platform, marketplaces and store systems behind their own connections.',
    checks: [
      { label: 'The product topic fans out to at least three subscriber queues', rule: { type: 'each', of: 'topic', edgeTo: 'queue', kind: 'async', count: 3 } },
      { label: 'Each subscriber queue feeds exactly one Process API', rule: { type: 'each', of: 'queue', min: 3, edgeTo: 'process-api', count: 1, max: 1 } },
      { label: 'Product changes leave the PIM side as an async event', rule: { type: 'edge', from: { type: ['system-api', 'saas'], label: 'pim' }, to: 'topic', kind: 'async' } },
      { label: 'The PIM is reached only through its System API', rule: { type: 'only-via', target: { type: 'saas', label: 'pim' }, from: 'system-api' } },
      { label: 'Every channel Process API fetches the full product from the PIM System API', rule: { type: 'each', of: 'process-api', min: 3, edgeTo: { type: 'system-api', label: 'pim' } } },
      { label: 'A marketplace Process API sends listings to the marketplaces', rule: { type: 'path', from: { type: 'process-api', label: ['marketplace', 'listing'] }, to: 'external-api', kind: 'sync' } },
      { label: 'The store systems are reached only through a System API', rule: { type: 'only-via', target: 'pos', from: 'system-api' } },
      { label: 'No synchronous chain runs from the PIM to the store systems', rule: { type: 'no-path', from: { type: 'saas', label: 'pim' }, to: 'pos', kind: 'sync' } },
      { label: 'Every line into or out of a queue is an async message', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        pim: ['saas', 'Salsify PIM'],
        spim: ['system-api', 'sys-pim-api'],
        top: ['topic', 'product-published'],
        qc: ['queue', 'product.commerce'],
        qm: ['queue', 'product.marketplaces', { maxRedelivery: 60 }],
        qs: ['queue', 'product.stores'],
        pc: ['process-api', 'prc-commerce-catalogue'],
        pm: ['process-api', 'prc-marketplace-listings'],
        ps: ['process-api', 'prc-store-items'],
        sct: ['system-api', 'sys-commercetools-api'],
        ct: ['saas', 'commercetools'],
        mkt: ['external-api', 'Amazon and Zalando listing APIs'],
        spos: ['system-api', 'sys-store-items-api'],
        pos: ['pos', 'Store POS and shelf labels'],
        dlq: ['dlq', 'product DLQ'],
      },
      [
        'pim -> spim', 'spim ~> top', 'top ~> qc', 'top ~> qm', 'top ~> qs', 'qc ~> pc', 'qm ~> pm', 'qs ~> ps',
        'pc -> spim', 'pm -> spim', 'ps -> spim', 'spim -> pim', 'pc -> sct', 'sct -> ct', 'pm -> mkt', 'ps -> spos', 'spos -> pos',
        'qm ~> dlq',
      ],
    ),
    simulation: {
      systems: [
        { match: { type: 'saas', label: 'PIM' }, latencyMs: 300 },
        { match: { type: 'saas', label: 'commercetools' }, latencyMs: 200 },
        { match: 'external-api', latencyMs: 500 },
        { match: 'pos', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'The marketplaces are down for 30 minutes',
          about: 'The PIM publishes 2 products a second while the marketplace APIs are down for 30 minutes. The website keeps up, the listings wait in their own queue and go out once the marketplaces are back, and nothing is lost.',
          traffic: [
            { name: 'website', from: { type: 'system-api', label: 'sys-pim' }, rps: 1, to: { type: 'saas', label: 'commercetools' }, kind: 'write' },
            { name: 'listings', from: { type: 'system-api', label: 'sys-pim' }, rps: 1, to: 'external-api', kind: 'write' },
          ],
          incidents: [{ down: 'external-api', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: {
            delivered: [{ flow: 'website', to: { type: 'saas', label: 'commercetools' }, min: 0.99 }],
            backlog: [{ queue: { label: 'product.commerce' }, maxPeak: 100 }, { queue: { label: 'product.marketplaces' }, maxEnd: 0 }],
            lost: { max: 0 },
            dlq: { max: 0 },
          },
        },
        {
          name: 'Listings a marketplace rejects',
          about: 'The PIM publishes 1 product a second, and 1 listing in 50 has data the marketplace rejects every time. After an hour of deliveries those listings go to the DLQ, and the other listings keep flowing.',
          traffic: [{ name: 'listings', from: { type: 'system-api', label: 'sys-pim' }, rps: 1, to: 'external-api', kind: 'write', poison: 0.02 }],
          durationMin: 120,
          expect: { dlq: { min: 30 }, lost: { max: 0 }, backlog: [{ queue: { label: 'product.marketplaces' }, maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
**Context.** A department store group (62 stores, a website and 3 marketplaces) has bought Salsify as its new Product Information Management (PIM) system. It replaces product spreadsheets and a 15-year-old Oracle item master.

**Catalogue.** 180,000 active products and about 30,000 product changes a day. When a season launches, 60,000 products change in one evening.

**Who needs product data**
| Channel | System | Needs |
|---|---|---|
| Website and app | commercetools | Full product with images, sizes, copy in 4 languages, within 15 minutes |
| Marketplaces | Amazon and Zalando listing APIs | Each marketplace's own attribute set and category; strict rate limits; rejects bad data |
| Stores | POS item file and electronic shelf labels | Item, barcode, price group, short description; stores load updates every 30 minutes |

**What the PIM offers.** A webhook when a product is published (it carries the product ID and version only), and a REST API to read the full product (10 requests per second).

**Problems with the first prototype.** A contractor built one Mule flow that receives the webhook and calls all three targets in turn. When Amazon throttled during the season launch, the website and stores also fell 9 hours behind.

**Constraints**
- More channels are coming next year: a second marketplace region and a print catalogue supplier.
- The PIM read API limit must not be exceeded.
- The PIM publishes about 2 products a second on a normal day. The marketplaces can be down for 30 minutes, and about 1 listing in 50 has data a marketplace rejects every time.

**Your task.** Design the product syndication integration.
`,
  answerTemplate: `## Receiving changes from the PIM

## Fan-out and isolation between channels

## Thin events and fetching the full product

## Channel mapping (commerce, marketplaces, stores)

## Errors, replays and adding new channels
`,
  keyPoints: [
    'A PIM System API receives the webhook and publishes a thin product-published event (ID and version) to one topic.',
    'Each channel has its own queue and Process API, so a throttled marketplace no longer delays the website or the stores.',
    'Channel Process APIs fetch the full product through the PIM System API, which caches by ID and version and enforces the 10 requests per second limit.',
    'Each Process API maps to its channel format: commerce catalogue, marketplace attribute sets, store item records.',
    'Marketplace rejections go to a DLQ with the reason, and adding a new channel means adding a queue and a Process API, not changing existing flows.',
  ],
  solution: `
**Receive.** The Salsify webhook calls \`sys-pim-api\`. It validates the signature, answers 200 at once and publishes \`product-published\` (product ID, version, changed attribute groups) to an Anypoint MQ exchange.

**Fan-out.** The exchange routes to three queues: \`product.commerce\`, \`product.marketplaces\`, \`product.stores\`. Each queue has its own Process API and its own pace.

**Fetch the full product.** Each Process API asks \`sys-pim-api\` for the product at that version. The System API caches by ID and version, so the three channels cost one PIM call. A spike policy keeps calls under 10 per second.

**Channels**
- \`prc-commerce-catalogue\` maps to commercetools product drafts and updates through \`sys-commercetools-api\`.
- \`prc-marketplace-listings\` maps to each marketplace attribute set, respects their rate limits and sends rejected products to the DLQ with the marketplace error, so merchandisers can fix them in the PIM.
- \`prc-store-items\` writes item records through \`sys-store-items-api\`, which the store POS and shelf label system load every 30 minutes.

**Season launches.** The queues absorb 60,000 changes. Commerce catches up in about 20 minutes; marketplaces take longer, which no longer affects other channels.

**New channels.** Add a queue bound to the exchange and a new Process API. Existing flows do not change.
`,
  followUps: [
    { q: 'Why send only the product ID and version in the event?', a: 'Full products with images and translations are large and channels need different parts. A thin event keeps messages small and every consumer reads the version it was told about.' },
    { q: 'How do you avoid hitting the PIM read limit three times for each change?', a: 'The PIM System API caches each product by ID and version. The second and third channel get the cached copy.' },
    { q: 'A product is published twice in quick succession. What stops an old version overwriting a new one?', a: 'Each channel stores the last version it applied per product and ignores events with an older version.' },
    { q: 'How would you add the print catalogue supplier next year?', a: 'Bind a new queue to the product exchange and write one new Process API with its mapping. Nothing else changes.' },
  ],
}
