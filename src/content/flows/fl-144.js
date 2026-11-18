import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const routes = [
  { region: 'NORTH', partner: 'Fellside Logistics', endpoint_path: '/fellside/v1/orders', active: 1 },
  { region: 'SOUTH', partner: 'Harbour Fulfilment', endpoint_path: '/harbour/api/shipments', active: 1 },
  { region: 'WEST', partner: 'Old West Couriers', endpoint_path: '/oldwest/orders', active: 0 },
]
const order = (orderId, region) => ({ message: { kind: 'mq', destination: 'orders-to-fulfil', payload: { orderId, region, lines: [{ sku: 'TEA-250', qty: 2 }] } } })
const ok = (path, ref) => ({ method: 'POST', path, respond: { status: 201, body: { reference: ref } } })
const partners = [ok('/fellside/v1/orders', 'FS-1001'), ok('/harbour/api/shipments', 'HB-2002'), ok('/oldwest/orders', 'OW-3003'), ok('/moorland/v2/orders', 'MO-4004')]
const db = (rows) => ({ db: { tables: { fulfilment_routes: { key: 'region', rows } } } })

export default {
  id: 'fl-144',
  category: 'flows',
  title: 'Send Each Order to Its Region\'s Fulfilment Partner From a Routing Table: a New Partner Is a New Row, Not a New Choice Route',
  level: 'INTERMEDIATE',
  tags: ['dynamic-routing', 'routing-table', 'database', 'http-request', 'anypoint-mq', 'content-based-router'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Orders are read from the orders-to-fulfil queue', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'orders-to-fulfil' } } },
    {
      label: 'The route for the order\'s region is read from fulfilment_routes before the partner is called',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['fulfilment_routes', ':region'] } }, then: 'http-request' },
    },
    { label: 'Only active routes count', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['fulfilment_routes', 'active'] } } } },
    { label: 'The partner endpoint comes from the row, not from a path written in the flow', rule: { type: 'exists', component: 'http-request', where: { path: { all: ['#['], not: '/fellside' } } } },
    { label: 'An order with no route goes to the orders-unrouted queue on its own Choice route', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'orders-unrouted' } } },
  ],
  simulation: {
    systems: { ...db(routes), http: partners },
    tests: [
      {
        name: 'An order for the north',
        about: 'Order TO-5101 is for the NORTH region. It goes to Fellside Logistics only.',
        trigger: order('TO-5101', 'NORTH'),
        expect: {
          calls: [{ method: 'POST', path: '/fellside/v1/orders', count: 1, has: { orderId: 'TO-5101' } }, { method: 'POST', path: '/harbour/api/shipments', count: 0 }],
          notSent: ['orders-unrouted'],
          ack: 'acked',
        },
      },
      {
        name: 'An order for the south',
        about: 'Order TO-5102 is for the SOUTH region. It goes to Harbour Fulfilment only.',
        trigger: order('TO-5102', 'SOUTH'),
        expect: { calls: [{ method: 'POST', path: '/harbour/api/shipments', count: 1, has: { orderId: 'TO-5102' } }, { method: 'POST', path: '/fellside/v1/orders', count: 0 }] },
      },
      {
        name: 'A new partner is added as a row',
        about: 'The business signs Moorland Freight for the EAST region and adds one row. The next EAST order goes there, with no change to the flow.',
        trigger: order('TO-5103', 'EAST'),
        overrides: { systems: db([...routes, { region: 'EAST', partner: 'Moorland Freight', endpoint_path: '/moorland/v2/orders', active: 1 }]) },
        expect: { calls: [{ method: 'POST', path: '/moorland/v2/orders', count: 1, has: { orderId: 'TO-5103' } }], notSent: ['orders-unrouted'] },
      },
      {
        name: 'A region with no partner',
        about: 'Order TO-5104 is for the EAST region before any partner covers it. It is parked on orders-unrouted with a warning, and no partner is called.',
        trigger: order('TO-5104', 'EAST'),
        expect: {
          sent: [{ destination: 'orders-unrouted', count: 1, has: { orderId: 'TO-5104' } }],
          calls: [{ method: 'POST', path: '/fellside/v1/orders', count: 0 }, { method: 'POST', path: '/harbour/api/shipments', count: 0 }],
          logs: [{ level: 'WARN' }],
          ack: 'acked',
        },
      },
      {
        name: 'A partner that was switched off',
        about: 'Old West Couriers stopped taking orders and its row is inactive. A WEST order is parked, not sent to them.',
        trigger: order('TO-5105', 'WEST'),
        expect: { sent: [{ destination: 'orders-unrouted', count: 1 }], calls: [{ method: 'POST', path: '/oldwest/orders', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('route-to-fulfilment', source('mq-subscriber', { destination: 'orders-to-fulfil' }), [
      step('db-select', {
        database: 'PostgreSQL',
        sql: 'SELECT partner, endpoint_path FROM fulfilment_routes WHERE region = :region AND active = 1',
        inputParameters: '#[{ region: payload.region }]',
        target: 'route',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.route)]' }, [
            step('logger', { level: 'WARN', message: '#["No active fulfilment route for region " ++ payload.region ++ ", order " ++ payload.orderId ++ " parked"]' }),
            step('mq-publish', { destination: 'orders-unrouted' }),
          ]),
        ],
        {
          otherwise: [
            step('http-request', { method: 'POST', path: '#[vars.route[0].endpoint_path]', responseTimeout: 10000 }),
            step('logger', { level: 'INFO', message: '#["Order sent to " ++ vars.route[0].partner ++ ", reference " ++ payload.reference]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
An online tea merchant hands each order to a **fulfilment partner** chosen by the customer's region. Orders arrive on the Anypoint MQ queue **\`orders-to-fulfil\`**:

\`{ "orderId": "TO-5101", "region": "NORTH", "lines": [ { "sku": "TEA-250", "qty": 2 } ] }\`

Today the flow has a Choice with one route per region, and each route calls one partner. Every new partner, or a partner that stops, means a change to the flow and a release. The business wants to sign two more partners this year.

The operations team now keeps the routes in a PostgreSQL table \`fulfilment_routes\`:

| region | partner | endpoint_path | active |
|---|---|---|---|
| NORTH | Fellside Logistics | /fellside/v1/orders | 1 |
| SOUTH | Harbour Fulfilment | /harbour/api/shipments | 1 |
| WEST | Old West Couriers | /oldwest/orders | 0 |

Every partner takes the order as it is, with a POST to its own path on the partner gateway, and answers \`{ "reference": "..." }\`.

**Requirements**
- Send each order to the partner of its region, read from the table.
- A new partner or region must need **only a new row**, never a change to the flow.
- A route with \`active = 0\` is not used.
- An order for a region with no active route goes to the queue **\`orders-unrouted\`** with a WARN log, so the team can deal with it.

**Design the flow.**
`,
  answerTemplate: `## The routing table

## Calling the partner

## Orders with no route

## Why not a Choice per region
`,
  keyPoints: [
    'This is a content-based router whose rules are data. The flow reads the route for the order\'s region and calls whatever endpoint the row names.',
    'Use the row in the HTTP Request path, such as #[vars.route[0].endpoint_path]. A path written in the flow ties it to one partner.',
    'Put the Select in a Target variable, so the order stays in the payload and is sent as it is.',
    'Filter on active = 1 in the SQL, so switching a partner off is an update to one row.',
    'An empty result is a normal case, not an error. A Choice parks the order on its own queue and logs a WARN.',
  ],
  solution: `
1. **Anypoint MQ Subscriber** on \`orders-to-fulfil\`.
2. **Database Select**, Target \`route\`:
   \`\`\`sql
   SELECT partner, endpoint_path FROM fulfilment_routes WHERE region = :region AND active = 1
   \`\`\`
3. **Choice**:
   - \`#[isEmpty(vars.route)]\`: **Logger** WARN, **Anypoint MQ Publish** to \`orders-unrouted\`.
   - Otherwise: **HTTP Request** \`POST #[vars.route[0].endpoint_path]\`, then log the partner and its reference.

**Keeping the calls safe.** The paths all sit on one partner gateway, behind one HTTP Request configuration with its host and credentials. The table holds only paths, so nobody can point an order at an unknown host by editing a row.

**Reading the table less often.** Routes change a few times a year. A Cache scope around the Select, with entries kept for a few minutes, saves a query per order.
`,
  followUps: [
    {
      q: 'Each partner wants a different body. Does the table still work?',
      a: 'Add a column naming the mapping, such as fellside-v1, and pick a DataWeave module or a Choice on that column. New partners that share a format still need only a row.',
    },
    {
      q: 'A partner is down. What happens to the order?',
      a: 'The HTTP Request fails, the flow fails, and the message goes back to the queue for redelivery. Set a redelivery limit with a dead-letter queue, so a long outage does not retry for ever.',
    },
    {
      q: 'Who may change the table?',
      a: 'Treat it like configuration: changes by the operations team only, through a reviewed script or an admin screen, with an audit column for who changed a row and when.',
    },
  ],
}
