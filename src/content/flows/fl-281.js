import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const items = [
  { item_id: 'BED-KING-OAK', description: 'King bed, oak', category: 'BEDROOM' },
  { item_id: 'CHAIR-OAK-2', description: 'Dining chair, oak, pair', category: 'DINING' },
  { item_id: 'LAMP-FLOOR-BRS', description: 'Floor lamp, brass', category: 'LIGHTING' },
  { item_id: 'RUG-WOOL-160', description: 'Wool rug 160 cm', category: 'TEXTILES' },
  { item_id: 'SOFA-3S-GRY', description: 'Three seat sofa, grey', category: 'LIVING' },
]
const tables = { item: { key: 'item_id', columns: ['item_id', 'description', 'category'], rows: items } }
const get = (query) => ({ http: { method: 'GET', path: '/api/items', query } })

export default {
  id: 'fl-281',
  category: 'flows',
  title: 'An Item Extract API for the Planning Platform on SQL Server: Keyset Paging With an After Cursor Instead of OFFSET, So Deep Pages Stay Fast and No Item Is Skipped',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'paging', 'keyset', 'api', 'planning', 'performance'],
  estMinutes: 30,
  flowChecks: [
    { label: 'GET /api/items is the entry point', rule: { type: 'source', component: 'http-listener', where: { path: '/items' } } },
    {
      label: 'The select reads dbo.item in item_id order and does not skip rows with OFFSET',
      rule: { type: 'all', rules: [{ type: 'exists', component: 'db-select', where: { sql: { all: ['dbo.item', 'ORDER BY item_id'] } } }, { type: 'absent', component: 'db-select', where: { sql: 'OFFSET' } }] },
    },
    { label: 'A limit out of range answers 400', rule: { type: 'handler', component: 'on-error-propagate', errorType: 'APP:BAD_LIMIT' } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'The first page',
        about: 'No cursor yet. The first two items come back, and next names the last of them.',
        trigger: get({ limit: '2' }),
        expect: { status: 200, body: { items: [items[0], items[1]], next: 'CHAIR-OAK-2' } },
      },
      {
        name: 'The next page',
        about: 'The platform passes next back as after, and gets the two items that follow.',
        trigger: get({ limit: '2', after: 'CHAIR-OAK-2' }),
        expect: { status: 200, body: { items: [items[2], items[3]], next: 'RUG-WOOL-160' } },
      },
      {
        name: 'The last page',
        about: 'Only one item is left, fewer than the limit, so next is null and the platform stops.',
        trigger: get({ limit: '2', after: 'RUG-WOOL-160' }),
        expect: { status: 200, body: { items: [items[4]], next: null } },
      },
      {
        name: 'A limit too large',
        about: 'A limit of 50,000 would hold a worker and a connection for a long time. The API answers 400.',
        trigger: get({ limit: '50000' }),
        expect: { status: 400, bodyHas: { error: 'BAD_LIMIT' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'get-items',
      source('http-listener', { path: '/api/items', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'limit', value: '#[(attributes.queryParams.limit default "500") as Number]' }),
        step('set-variable', { variableName: 'after', value: '#[attributes.queryParams.after default ""]' }),
        router('choice', {}, [route({ expression: '#[vars.limit < 1 or vars.limit > 1000]' }, [step('raise-error', { type: 'APP:BAD_LIMIT', description: 'limit must be between 1 and 1000' })])], {
          otherwise: [step('logger', { level: 'DEBUG', message: '#["Page after " ++ vars.after]' })],
        }),
        step('db-select', {
          database: 'SQL Server',
          sql: 'SELECT TOP (:limit) item_id, description, category FROM dbo.item WHERE item_id > :after ORDER BY item_id',
          inputParameters: '#[{ limit: vars.limit, after: vars.after }]',
        }),
        step('set-payload', { value: '#[output application/json --- { items: payload, next: if (sizeOf(payload) == vars.limit) payload[-1].item_id else null }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:BAD_LIMIT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { error: "BAD_LIMIT", message: error.description }]' }),
        ]),
      ],
    ),
  ),
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, lets the planning platform pull the item master from SQL Server through an API: \`GET /api/items\`. There are **1.8 million items** in \`dbo.item\` (\`item_id\`, \`description\`, \`category\`), and the platform pulls them all each night, page by page.

The first version took \`page\` and \`size\` and ran \`ORDER BY item_id OFFSET (:page * :size) ROWS FETCH NEXT :size ROWS ONLY\`. Two problems showed up:
- Page 3,000 took 40 seconds: SQL Server reads and throws away every row before the offset.
- Items created during the pull pushed others onto the next page, so the platform got some items twice and missed others.

The new contract, agreed with the platform:
- \`limit\`: items per page, 1 to 1000, 500 if not given. Out of range answers **400** with \`{ "error": "BAD_LIMIT" }\`.
- \`after\`: the last \`item_id\` of the previous page; empty for the first page.
- The answer: \`{ "items": [ ... ], "next": "<last item_id>" }\`, with \`next\` = \`null\` on the last page.

**Requirements**
- Read the page with a **keyset**: the items after the cursor, in \`item_id\` order.
- Return \`next\` so the platform can ask for the following page.
- Refuse a limit out of range.

**Facts**
- Each item in \`items\` is \`{ item_id, description, category }\`, as the table has them.
- Refuse a bad limit with **Raise Error** \`APP:BAD_LIMIT\`, handled by an **On Error Propagate** for that type.
- **How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, for a success and for an error.

**Design the flow.**
`,
  answerTemplate: `## Why OFFSET hurts

## The keyset query

## The next cursor

## The limit
`,
  keyPoints: [
    'With WHERE item_id > :after ORDER BY item_id, SQL Server seeks the primary key index to the cursor and reads only the page. Page 3,000 costs the same as page 1.',
    'OFFSET reads every skipped row, so deep pages get slower and slower. Rows added while the platform pulls move the window, so items are skipped or sent twice.',
    'The cursor must be the column you sort on, and that column must be unique. item_id is the key, so no two items tie.',
    'A full page means there may be more, so next is the last item_id. A short page is the last one. The platform may get one empty page when the count is an exact multiple, and that is fine.',
    'Cap the limit. One huge page holds a connection and a worker for a long time, and builds a large answer in memory.',
  ],
  solution: `
1. **HTTP Listener** \`GET /api/items\`.
2. **Set Variable** \`limit\` (default 500) and \`after\` (default empty).
3. **Choice**: limit below 1 or above 1000: **Raise Error** \`APP:BAD_LIMIT\`.
4. **Database Select** \`SELECT TOP (:limit) item_id, description, category FROM dbo.item WHERE item_id > :after ORDER BY item_id\`.
5. **Set Payload** \`{ items: payload, next: if (sizeOf(payload) == vars.limit) payload[-1].item_id else null }\`.
6. **On Error Propagate** (\`APP:BAD_LIMIT\`): \`httpStatus\` 400 and the error body.

**Sort order.** An empty string sorts before every item_id under SQL Server's usual collations, so the first page works with after = "". If item IDs could start with spaces or special characters, check the collation or treat the first page apart.
`,
  followUps: [
    {
      q: 'The platform wants items changed since yesterday, not the whole master. How does the cursor change?',
      a: 'Page on (updated_at, item_id): WHERE updated_at > :ts OR (updated_at = :ts AND item_id > :id), with an index on both columns. The pair is unique even when many items share a time.',
    },
    {
      q: 'Why not let the platform read SQL Server directly?',
      a: 'It would tie the platform to the table design and give it a login to the retail database. The API keeps the contract stable and lets you cap the load.',
    },
  ],
}
