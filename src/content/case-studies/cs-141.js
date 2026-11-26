export default {
  id: 'cs-141',
  category: 'case-studies',
  title: 'Bike Shop Chain Keeping Online Stock in Step With the Tills in Eight Shops',
  level: 'BEGINNER',
  tags: ['inventory', 'ecommerce', 'pos', 'sync'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Bikes sell online and in the shops. Which system should hold the stock count?',
      options: [
        'The till system, which already counts every shop sale and delivery',
        'The web shop, which the tills update after each shop sale',
        'Both, each keeping its own count and syncing once an hour',
        'A new stock database that both the tills and the web shop update',
      ],
      answer: 0,
      explain: 'One owner for the count stops the two from drifting apart. The tills already see every sale and delivery in the shops, and they must keep selling when the internet is down, so they cannot depend on the web shop.',
    },
    {
      type: 'single',
      prompt: 'A shop sells the only medium red bike at 10:05. The till can send each sale as it happens, or an export every hour. The web shop takes about 40 orders a day. Which feed fits?',
      options: [
        'The hourly export, since 40 orders a day are too few for a clash to matter',
        'Each sale as it happens, since a one of a kind bike can sell online during any delay',
        'The hourly export, with a safety stock of one on every bike to cover the gap',
        'A nightly full stock file, since it also corrects any drift between the counts',
      ],
      answer: 1,
      explain: 'Bikes are often one of a kind in a size and colour, so every minute of delay is a window in which the web shop can sell a bike that is gone. Low order volume does not help, because one clash is enough to let a customer down. A safety stock of one hides every single bike online, and a nightly file is a good drift check but far too slow as the feed.',
    },
    {
      type: 'multi',
      prompt: 'Which three help when the last bike is sold in a shop and online at nearly the same time?',
      options: [
        'Show online only what is above a small safety stock',
        'Reserve the bike in the till system when an online order is placed',
        'A clear process to offer the online customer a similar bike or a refund',
        'Take the online payment only after a shop has checked the bike by hand',
        'Send till sales to the web shop in a batch every 15 minutes',
        'Block till sales of a bike while the shop internet link is down',
      ],
      answer: [0, 1, 2],
      explain: 'A buffer, a reservation and a plan for the rare clash cover it. Keep the safety stock small, or on items with only one left it hides the bike online. A manual check on every order slows every sale to fix a rare clash. A 15 minute batch narrows the gap but still leaves a window where both sales go through. Blocking till sales breaks the rule that staff never wait for the internet to sell a bike.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'One shop loses internet for a morning. What happens to its sales?',
      options: [
        'The till keeps selling and sends its sales when the link returns',
        'The till stops selling until it can update the web shop again',
        'The till keeps selling, and those sales are keyed in by hand later',
        'The web shop hides every item from that shop until the next morning',
      ],
      answer: 0,
      explain: 'Shops must keep trading. Queued sales catch up afterwards, the web shop is briefly out of date for that shop, and the safety stock covers the gap.',
    },
    {
      type: 'match',
      prompt: 'Match each event to what the integration does.',
      pairs: [
        ['Sale in a shop', 'Lower the count in the web shop'],
        ['Online order placed', 'Reserve the item in the till system'],
        ['Delivery received', 'Raise the count in the web shop'],
        ['Online order cancelled', 'Release the reservation'],
      ],
      explain: 'Every event that changes stock goes one way through the integration, so both sides agree.',
    },
    {
      type: 'order',
      prompt: 'Order the project.',
      items: [
        'Agree that the till system owns the count',
        'Send shop sales and deliveries to the web shop as they happen',
        'Reserve stock in the till system for online orders',
        'Set a safety stock per item',
        'Check both counts each night and report differences',
      ],
      explain: 'Decide the owner, then flow changes both ways, add the buffer, and check nightly.',
    },
  ],
  description: `
**Context.** A bike shop chain has **eight shops** and a web shop. Stock is counted in the till system. Today staff update web stock by hand each evening.

**Facts gathered so far**
- Many bikes are single items in a size and colour.
- Each week several online customers buy a bike that was sold in a shop that day.
- The till system has an API for stock and sales. The web shop has an API for stock levels and orders.
- Shop internet links sometimes drop for a few hours.

**Opinions**
- Owner: "I want to stop apologising to customers."
- Shop staff: "Never make us wait for the internet to sell a bike."

**Your task.** Design how stock stays in step between the tills and the web shop.
`,
  answerTemplate: `## Decision

## Owner of the count

## Changes from shops

## Online orders

## When a shop is offline

## Checks

## Risks
`,
  keyPoints: [
    'The till system owns the stock count.',
    'Shop sales and deliveries reach the web shop within minutes.',
    'Online orders reserve stock in the till system.',
    'A small safety stock covers short delays.',
    'Shops keep selling when offline and catch up later.',
    'A nightly check reports differences.',
  ],
  solution: `
**Decision.** The till system owns stock. Mule moves stock changes to the web shop and online orders to the till system.

**Changes from shops.** Each sale or delivery in a shop sends a stock change. Mule updates the web shop count within minutes.

**Online orders.** Mule reserves the item in the till system. If the item is gone, the order is flagged for staff to offer a swap or refund.

**When a shop is offline.** The till queues its sales and sends them when the link returns. Safety stock keeps the web shop from selling the last item during the gap.

**Checks.** A nightly comparison of both counts, with differences sent to the owner.

**Risks.** Sales during an outage, staff changing stock by hand in one system only, and safety stock set too high.
`,
  followUps: [
    { q: 'Why not update the web shop once a night as now?', a: 'A whole day of shop sales can be sold again online. Minutes, not a day, is what fixes the complaints.' },
    { q: 'What is safety stock?', a: 'A small number held back from online sale, so a short delay does not sell the last item twice.' },
    { q: 'What if the web shop API is down?', a: 'Queue the changes and send them when it returns, in order per item.' },
    { q: 'How do you start?', a: 'With one shop and the web shop, then add the others once the counts match each night.' },
  ],
}
