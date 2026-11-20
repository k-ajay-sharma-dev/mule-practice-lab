export default {
  id: 'cs-123',
  category: 'case-studies',
  title: 'Industrial Parts Maker Turning Its Order APIs Into a Product for 2,000 Distributors',
  level: 'ADVANCED',
  tags: ['api-product', 'sla-tiers', 'exchange', 'developer-portal', 'api-manager', 'b2b'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Large distributors want high call volumes, and small ones need a few calls an hour. How are their limits set?',
      options: [
        'SLA tiers such as Basic and Premium, enforced by SLA based rate limiting',
        'One rate limit on the API, shared by all distributors, sized for peak load',
        'A spike control policy that smooths each distributor\'s bursts',
        'A separate API instance per large distributor, each with its own rate limit',
      ],
      answer: 0,
      explain: 'SLA tiers set limits per client application, and the SLA based rate limiting policy enforces them using the client ID. A shared limit lets one big caller starve the rest. Spike control smooths bursts but gives no limit per distributor. Separate instances per distributor multiply what must be deployed and governed.',
    },
    {
      type: 'single',
      prompt: 'How does a new distributor get access?',
      options: [
        'It requests access to a tier from the public portal with its own client app',
        'It emails the integration team, who create a client app and send the credentials',
        'It uses one shared distributor client ID published in the portal docs',
        'It signs up in the web shop, and its web shop login is used for the API',
      ],
      answer: 0,
      explain: 'Exchange and the public portal let partners discover the API and request access with their own client application. Tiers can be set to auto approve or to need manual approval. Emailing the team is today\'s weeks-long manual setup. A shared client ID hides who calls and cannot carry per distributor limits. A web shop login is a user account, not an API client.',
    },
    {
      type: 'multi',
      prompt: 'Which three things make a partner API usable without calls to support?',
      options: [
        'A clear specification with examples for every operation',
        'A mocking service or sandbox so partners can try calls before going live',
        'Documented error codes with what the partner should do for each',
        'A support mailbox that answers questions within one working day',
      ],
      answer: [0, 1, 2],
      explain: 'Good specs, a place to try calls and clear errors let partners build alone. A support mailbox helps, but it is a call to support, which is what the question asks to avoid.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The order API needs a breaking change next year. How do you handle 2,000 distributors?',
      options: [
        'Run v2 beside v1 with a dated retirement, tracking who still calls v1',
        'Change v1 in place, and give distributors three months\' notice of the date',
        'Run v2 beside v1 and keep v1 for as long as any distributor uses it',
        'Put a new field in v1 that switches each call to the new behaviour',
      ],
      answer: 0,
      explain: 'Running two major versions for a set period, with a dated retirement and usage data per client, lets each distributor move in time. A change in place breaks every distributor that has not moved on that day, however long the notice. Keeping v1 with no end date means it never goes. A switch field hides a breaking change inside v1 and makes both behaviours permanent.',
    },
    {
      type: 'match',
      prompt: 'Match each need to where it is handled.',
      pairs: [
        ['Finding the API and its docs', 'Exchange and the public portal'],
        ['Limits per distributor', 'SLA tiers and an SLA based rate limiting policy'],
        ['Knowing who is calling', 'Client ID enforcement or OAuth on the API instance'],
        ['Usage per distributor', 'API analytics in Anypoint Monitoring'],
      ],
      explain: 'Discovery, limits, identity and usage each have a place in the platform, so the programme does not need custom tools for them.',
    },
    {
      type: 'order',
      prompt: 'Order the launch of the API product.',
      items: [
        'Agree the tiers and limits with sales, based on real call volumes',
        'Publish the spec and examples to Exchange and the public portal',
        'Apply client identity and SLA based limits to the API instance',
        'Onboard ten pilot distributors and collect feedback',
        'Open self service access to all distributors',
      ],
      explain: 'Limits come from real volumes and commercial terms, then docs and protection, then a pilot before opening the doors.',
    },
  ],
  description: `
**Context.** An industrial parts maker sells through **2,000 distributors**. Today distributors place orders by EDI, email and a web shop. The company wants them to use APIs for price checks, stock checks and orders.

**Facts gathered so far**
- 40 large distributors make 70% of orders and want high call volumes.
- Most small distributors would make a few calls an hour.
- The order, price and stock APIs already exist for internal apps, on the Anypoint platform.
- Today every new integration is set up by the integration team by hand, which takes weeks.
- The ERP behind the APIs slows down when price checks spike.

**Opinions**
- Head of sales: "Large distributors must never be throttled at month end."
- Integration lead: "We cannot hand hold 2,000 partners."
- Security: "Every caller must be known."

**Your task.** Design the API product: how distributors find it, get access, are limited, and are kept working through future changes.
`,
  answerTemplate: `## Decision

## Discovery and onboarding

## Tiers and limits

## Identity and security

## Versioning and change

## Measures

## Risks
`,
  keyPoints: [
    'SLA tiers per client application, enforced with an SLA based rate limiting policy, give large and small distributors different limits.',
    'Exchange and a public portal with specs, examples and a mock let partners onboard themselves.',
    'Client ID enforcement or OAuth makes every caller known.',
    'Tiers can auto approve small partners and need approval for high volume tiers.',
    'Breaking changes go in a new major version with a dated retirement and usage tracking per client.',
    'Protect the ERP from price check spikes with limits and caching of price lists where they allow it.',
  ],
  solution: `
**Decision.** Run the order, price and stock APIs as a product with self service onboarding and tiered limits.

**Discovery and onboarding.** Publish the specs, with examples and error codes, to Exchange and a public portal. Partners try calls against a mock first. Each distributor creates its own client application and requests a tier.

**Tiers and limits.** Define tiers such as Basic, Standard and Premium with rate limits based on real volumes. Apply an SLA based rate limiting policy, so each client application gets its tier limit. Basic auto approves, Premium needs approval from sales. Large distributors get limits sized for month end.

**Identity.** Client ID enforcement, or OAuth with client credentials for the larger partners, so every call is tied to a distributor.

**Protecting the ERP.** Cache price lists for a short time where pricing rules allow it, and use spike control in front of the price check path.

**Change.** Breaking changes ship as a new major version beside the old one. Announce a retirement date and use analytics to chase clients still on the old version.

**Measures.** Time to onboard a distributor, share of orders by API, and errors by client.

**Risks.** Tier limits set without data, partners who never move off the old version, and price caching that shows stale prices.
`,
  followUps: [
    { q: 'Why per client limits rather than one API limit?', a: 'One limit lets the busiest partner use the capacity of everyone else. Per client limits share it fairly and match commercial terms.' },
    { q: 'What does the SLA based policy need from the caller?', a: 'The client ID, and usually the client secret, so it can find which tier the application is on.' },
    { q: 'How do you decide when to retire an old version?', a: 'Announce a date with enough notice, watch usage per client, and contact those still calling it before the date.' },
    { q: 'What would you show the head of sales each month?', a: 'Orders and calls per distributor and tier, partners near their limits, and partners still on old versions.' },
  ],
}
