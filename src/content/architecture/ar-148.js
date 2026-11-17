import { diagram } from '../../arch/dsl.js'

const changes = { name: 'order changes', from: 'mobile-app', rps: 60, to: 'data-warehouse', kind: 'write' }
const lookups = { name: 'order lookups', from: 'mobile-app', rps: 300, to: { type: 'database', label: 'status' } }
const stream = { type: 'event-stream', label: 'order-events' }

export default {
  id: 'ar-148',
  category: 'architecture',
  title: 'Event Sourcing for Meal-Kit Orders: Store Every Change as an Event, Build the Views From the Log',
  level: 'ADVANCED',
  tags: ['event-sourcing', 'cqrs', 'kafka', 'projections', 'audit', 'retail'],
  estMinutes: 45,
  diagram: {
    task: 'draw the order platform: the app calls an orders Experience API, which sends changes to an order command Process API and reads through an order query Process API. The command API appends events to the order-events stream. A status projector and a finance projector each read the stream and keep their own view: the order status view and the finance ledger.',
    checks: [
      { label: 'The command Process API appends each change to the order-events stream', rule: { type: 'edge', from: { type: 'process-api', label: 'command' }, to: stream, kind: 'async' } },
      { label: 'Only the command Process API writes events', rule: { type: 'only-via', target: stream, from: { type: 'process-api', label: 'command' } } },
      { label: 'The command Process API never writes a view itself', rule: { type: 'no-edge', from: { type: 'process-api', label: 'command' }, to: ['database', 'data-warehouse'] } },
      { label: 'At least two projectors read the order events', rule: { type: 'each', of: stream, edgeTo: { type: 'process-api', label: 'projector' }, kind: 'async', count: 2 } },
      { label: 'Each projector keeps exactly one view of its own', rule: { type: 'each', of: { type: 'process-api', label: 'projector' }, min: 2, edgeTo: ['database', 'data-warehouse'], max: 1 } },
      { label: 'Order lookups read the status view through the query Process API', rule: { type: 'path', from: 'experience-api', via: { type: 'process-api', label: ['query', 'queries'] }, to: { type: 'database', label: 'status' } } },
      { label: 'Every line into or out of the event stream is async', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Meal-kit app'],
        exp: ['experience-api', 'exp-orders', { vCores: '1' }],
        cmd: ['process-api', 'prc-order-commands', { vCores: '0.5' }],
        qry: ['process-api', 'prc-order-queries', { vCores: '1' }],
        es: ['event-stream', 'order-events (event store, kept for 7 years)'],
        prjS: ['process-api', 'prc-order-status-projector', { vCores: '0.5' }],
        prjF: ['process-api', 'prc-finance-projector', { vCores: '0.5' }],
        dbS: ['database', 'Order status view'],
        dw: ['data-warehouse', 'Finance ledger'],
      },
      ['app -> exp', 'exp -> cmd', 'exp -> qry', 'cmd ~> es', 'es ~> prjS', 'es ~> prjF', 'prjS -> dbS', 'prjF -> dw', 'qry -> dbS'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 8 },
        { match: 'data-warehouse', latencyMs: 40 },
      ],
      tests: [
        {
          name: 'Sunday evening',
          about: 'Customers change 60 orders a second before the weekly cut-off and look up orders 300 times a second. Lookups are fast, and every change reaches the finance ledger.',
          traffic: [changes, lookups],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }, { flow: 'order lookups', maxMs: 300 }], delivered: [{ flow: 'order changes', to: 'data-warehouse', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The finance projector is down and the stream restarts',
          about: 'The finance projector is down for 30 minutes and the stream restarts during that time. The events wait in the stream, none is lost, and the ledger catches up once the projector is back. Lookups are not affected.',
          traffic: [changes, lookups],
          incidents: [{ down: { type: 'process-api', label: 'finance' }, at: 5, forMin: 30 }, { restart: 'event-stream', at: 20 }],
          durationMin: 60,
          expect: {
            answers: [{ flow: 'order lookups', minSuccess: 0.99 }],
            lost: { max: 0 },
            backlog: [{ queue: stream, maxEnd: 0 }],
            delivered: [{ flow: 'order changes', to: 'data-warehouse', min: 0.99 }],
          },
        },
      ],
    },
  },
  description: `
A meal-kit company delivers about 400,000 boxes a week. Customers change their orders in the app until the Sunday cut-off: they swap recipes, skip a week, change the address. Today the order service **overwrites** one row per order each time.

Three problems keep coming back:
- Support cannot answer "what did my order look like when it was packed?" because the old values are gone.
- Finance builds its ledger from a nightly copy of the orders table and misses changes made and undone during the day, such as a recipe swapped and swapped back.
- A bug in a release corrupted the status of 3,000 orders. There was no way to work out the right values.

The architects propose **event sourcing**: every change is stored as an event (OrderPlaced, RecipeSwapped, WeekSkipped, AddressChanged...) in an append-only log, and the current state is built from the events.

The parts:
- An **order command** Process API that checks each change and appends it as an event.
- A Kafka topic **order-events** used as the event store. It keeps events for 7 years.
- **Projectors**: consumers that read the events and keep a view up to date. One keeps the **order status** view the app reads. One keeps the **finance ledger** in the data warehouse.
- An **order query** Process API that answers lookups from the status view.

Customers make about **60 changes a second** before the cut-off, and look up their orders about **300 times a second**.

**Questions:**
- Draw the design.
- How does each of the three problems go away?
- What happens when a projector is down for half an hour?
- How do you fix a view that a bug has corrupted?
`,
  answerTemplate: `## Design

## Writing a change

## Reading

## The three problems

## A projector that is down

## Rebuilding a view
`,
  keyPoints: [
    'In event sourcing the events are the record. Views such as the order status are built from them and can be rebuilt.',
    'Only the command side writes events. It never writes the views, or a view could disagree with the log.',
    'Each projector owns one view. A new need, such as a packing list, is a new projector, not a change to the others.',
    'Reads go to the views through the query side. Nothing reads the log to answer a customer.',
    'The log must keep its events for as long as you may need to rebuild a view, and must survive a restart.',
    'Views lag the log by a moment. The app should show the change it sent, not wait for the view to catch up.',
  ],
  solution: `
**Design**
\`\`\`
Meal-kit app ─► exp-orders ─┬─► prc-order-commands ~► order-events (event store)
                            │                             ~► prc-order-status-projector ─► Order status view
                            │                             ~► prc-finance-projector      ─► Finance ledger
                            └─► prc-order-queries ─► Order status view
\`\`\`

**Writing a change.** \`prc-order-commands\` loads the order's current state, checks the change (no swaps after the cut-off), and appends one event keyed by order ID. Keying by order keeps each order's events in one partition, in order.

**Reading.** \`prc-order-queries\` answers lookups from the status view. 300 lookups a second need a full vCore each for the Experience API and the query API in this model.

**The three problems.**
- *What was packed:* replay the order's events up to the packing time.
- *Finance:* the finance projector sees every event, including a swap and its undo, as it happens.
- *Corrupted status:* the events are still right. Fix the projector and rebuild the view.

**A projector that is down.** Events wait in the stream for that projector's consumer group. The other projector carries on. When it comes back it reads from where it stopped and catches up. The stream is persistent, so a broker restart loses nothing.

**Rebuilding a view.** Deploy the fixed projector with a new consumer group, let it read the stream from the start into a new table, and switch the query API to the new table once it has caught up.
`,
  followUps: [
    {
      q: 'Is the Kafka topic enough as an event store?',
      a: 'It holds the events in order and can keep them for years. It cannot give you all events of one order quickly without reading a partition, so the command side usually keeps a snapshot or a current state per order as well.',
    },
    {
      q: 'What if two changes to one order arrive at the same moment?',
      a: 'The command side must check each change against the latest version of the order, for example with a version number per order, and refuse the second if the first changed what it relied on.',
    },
    {
      q: 'Can events be changed or deleted?',
      a: 'Not in place. A mistake is corrected with a new event. For personal data under GDPR, keep it outside the event or encrypt it with a key per customer that can be destroyed.',
    },
  ],
}
