import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-080',
  category: 'use-cases',
  title: 'Product Catalogue Syndication to Shopping Channels',
  level: 'INTERMEDIATE',
  tags: ['pim', 'retail', 'publish-subscribe', 'canonical-model', 'rate-limits', 'marketing'],
  estMinutes: 30,
  diagram: {
    task: 'draw the syndication: the delta job, the Process API that builds the canonical product from the PIM and ERP prices, one topic, one subscriber per channel, each channel behind its own System API, and rejected items going back to the PIM.',
    checks: [
      { label: 'The canonical product reads the PIM', rule: { type: 'path', from: 'process-api', to: { type: ['saas', 'database'], label: 'pim' } } },
      { label: 'Prices are joined from the ERP', rule: { type: 'path', from: 'process-api', to: 'erp' } },
      { label: 'Changes are published once to a topic', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Each channel has its own subscriber, so a slow channel does not hold up the others', rule: { type: 'each', of: ['topic', 'event-stream'], edgeTo: ['process-api', 'queue'], kind: 'async', count: 3 } },
      { label: 'Three channels are reached', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'external-api', min: 3 } },
      { label: 'Channel APIs are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The export never waits on a channel API (no sync route)', rule: { type: 'no-path', from: 'batch-job', to: 'external-api', kind: 'sync' } },
      { label: 'Rejected items are written back to the PIM by a channel feed', rule: { type: 'each', of: { type: 'process-api', label: ['feed', 'google', 'meta', 'marketplace', 'channel'] }, edgeTo: { type: 'system-api', label: 'pim' }, some: true } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Delta job (every 15 min)'],
        prc: ['process-api', 'prc-product-canonical'],
        spim: ['system-api', 'sys-pim'],
        pim: ['saas', 'PIM'],
        serp: ['system-api', 'sys-erp-prices'],
        erp: ['erp', 'ERP (prices)'],
        top: ['topic', 'product-changes'],
        g: ['process-api', 'prc-feed-google'],
        m: ['process-api', 'prc-feed-meta'],
        mk: ['process-api', 'prc-feed-marketplace'],
        sg: ['system-api', 'sys-google-merchant'],
        sm: ['system-api', 'sys-meta-catalog'],
        smk: ['system-api', 'sys-marketplace-listings'],
        eg: ['external-api', 'Google Merchant Center'],
        em: ['external-api', 'Meta catalog'],
        emk: ['external-api', 'Marketplace listings API'],
      },
      [
        'job -> prc', 'prc -> spim', 'spim -> pim', 'prc -> serp', 'serp -> erp', 'prc ~> top',
        'top ~> g', 'top ~> m', 'top ~> mk', 'g -> sg', 'sg -> eg', 'm -> sm', 'sm -> em', 'mk -> smk', 'smk -> emk',
        'g -> spim', 'm -> spim', 'mk -> spim',
      ],
    ),
  },
  description: `
A home furnishings retailer keeps **40,000 products** in a SaaS **PIM** (titles, descriptions, images, attributes). Prices live in the **ERP**. The retailer advertises its products on three channels:
- **Google Merchant Center** (Content API, batches of up to 1,000 items per call),
- **Meta catalog** (batch API, 5,000 items per call, hourly quota),
- a **marketplace** (listings API, 5 calls a second).

Today each channel gets a nightly CSV export built by a different agency script. Prices are often a day out of date, and Google suspended 600 items last month for a price mismatch with the website.

Requirements:
- A product or price change reaches every channel within **30 minutes**.
- About **3,000 products change a day**; a full refresh is needed once a week.
- Each channel has its own field names, category tree and image rules.
- A channel being down or slow must not delay the others.
- Items a channel rejects (missing GTIN, image too small) are written back to the PIM, so the content team can fix them.

The PIM has no events. It offers a search API with an "updated since" filter.

**Questions:**
1. Draw the design.
2. How do you find what changed?
3. Where does each channel's mapping live?
4. How do you respect three different rate limits?
5. How do rejections get back to the content team?
`,
  answerTemplate: `## Finding changes

## Canonical product

## Fan-out per channel

## Rate limits

## Rejections and weekly refresh
`,
  keyPoints: [
    'A delta job every 15 minutes asks the PIM for products updated since the last watermark, and the ERP for prices changed since then.',
    'prc-product-canonical joins PIM data and ERP price into one canonical product and publishes it once to a topic.',
    'One subscriber per channel maps the canonical product to that channel; each has its own queue, retry and throughput.',
    'Each channel System API owns its rate limit and batch size, so a quota problem stays inside one channel.',
    'Rejections returned by a channel are written back to the PIM as item issues, through sys-pim.',
  ],
  solution: `
\`\`\`
Delta job -> prc-product-canonical -> sys-pim, sys-erp-prices
                                   ~> [product-changes topic] ~> prc-feed-google      -> sys-google-merchant      -> Google
                                                              ~> prc-feed-meta        -> sys-meta-catalog         -> Meta
                                                              ~> prc-feed-marketplace -> sys-marketplace-listings -> Marketplace
Each feed -> sys-pim (write rejected item issues)
\`\`\`

**Finding changes.** A Scheduler every 15 minutes calls prc-product-canonical with the last watermark. It reads PIM products updated since then, and ERP prices changed since then. A price change also counts as a product change. The watermark moves forward only after the publish succeeds.

**Canonical product.** The Process API joins the two sources into one **canonical product**: ID, GTIN, title, description, images, category, price, sale price, availability. It publishes one message per product to the **product-changes** topic. The canonical model does not know about any channel.

**Fan-out.** Three subscribers, one per channel, each with its own queue on the topic (Anypoint MQ exchange with three bound queues):
- prc-feed-google maps the category to the Google taxonomy and builds the item.
- prc-feed-meta maps fields for the catalog batch API.
- prc-feed-marketplace maps attributes to the marketplace schema.
A marketplace outage fills only its queue. Google and Meta carry on.

**Rate limits.** Each feed collects messages into batches (Google 1,000, Meta 5,000). The marketplace feed runs with 1 consumer thread and a 200 ms pause, to stay under 5 calls a second. Each System API also enforces its limit with a rate limiting policy and backs off on HTTP 429.

**Rejections.** Google returns item issues in its response, Meta and the marketplace in a later status call. Each feed writes rejected items back to the PIM as an issue attribute through sys-pim. The content team works from a PIM view of items with issues.

**Weekly refresh.** On Sunday the job publishes every product. Channels then drop items that no longer exist, and drift is corrected.
`,
  followUps: [
    { q: 'Why one topic instead of the job calling three channel APIs?', a: 'The job would then wait on the slowest channel and fail when one is down. With a topic, each channel has its own queue, pace and retries.' },
    { q: 'Where would you add a fourth channel?', a: 'Add one subscriber queue on the topic, one feed Process API and one System API. Nothing upstream changes.' },
    { q: 'Why is the price joined in the canonical product and not in each feed?', a: 'Doing it once keeps every channel on the same price at the same moment. Google suspends items whose price differs from the website.' },
    { q: 'How do you keep image rules per channel?', a: 'Each feed picks the image size and format its channel needs from the PIM asset URLs. The canonical product carries all renditions.' },
  ],
}
