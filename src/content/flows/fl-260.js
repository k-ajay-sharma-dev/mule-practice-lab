import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'PRODUCT_FEED_20261113.csv'
const file = `/feeds/in/${name}`
const csv = 'sku,title,price\nSOFA-3S-GRY,Three seat sofa grey,899.00\nLAMP-ARC-BRS,Arc floor lamp brass,149.00\nRUG-160-OAT,Rug 160 oat,89.00'
const tables = { product_feed_staging: { key: 'sku', columns: ['sku', 'title', 'price'], rows: [] } }

export default {
  id: 'fl-260',
  category: 'flows',
  title: 'Move an Oversized Feed File Aside Before It Takes the Worker Down: Check the Size From the Attributes, Park the File, and Tell the Team',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'file-size', 'choice', 'batch', 'email', 'properties'],
  estMinutes: 20,
  flowChecks: [
    { label: 'A Choice compares attributes.size with a limit', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'attributes.size' } } },
    { label: 'An oversized file is moved to /feeds/oversize', rule: { type: 'inside', component: 'file-move', within: 'choice', routeWhere: { expression: 'attributes.size' }, where: { targetPath: '/feeds/oversize' } } },
    { label: 'An oversized file is emailed to the feed team', rule: { type: 'inside', component: 'email-send', within: 'choice', routeWhere: { expression: 'attributes.size' } } },
    { label: 'A normal file is loaded by a Batch Job on the default route', rule: { type: 'inside', component: 'batch-job', within: 'choice', inSlot: 'otherwise' } },
  ],
  simulation: {
    properties: { 'feed.maxBytes': '2000000000' },
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A normal feed',
        about: 'The file is under the limit. Its three products reach staging and it moves to done. Nobody is emailed.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { product_feed_staging: { count: 3 } }, files: { [`/feeds/done/${name}`]: { exists: true } }, noEmails: true },
      },
      {
        name: 'A feed over the limit',
        about: 'The limit is set to 50 bytes for this test, so the file counts as oversized. It is moved to /feeds/oversize, nothing is loaded, and the feed team gets an email.',
        trigger: { file: { path: file } },
        overrides: { properties: { 'feed.maxBytes': '50' } },
        expect: {
          noError: true,
          db: { product_feed_staging: { count: 0 } },
          files: { [`/feeds/oversize/${name}`]: { exists: true }, [`/feeds/done/${name}`]: { exists: false } },
          emails: [{ to: 'feed-team@marrowpine.example', subject: name, count: 1 }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow('product-feed-load', source('file-listener', { directory: '/feeds/in', matcher: 'PRODUCT_FEED_*.csv', postAction: 'none', timeBetweenSizeCheck: 20000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[attributes.size > (p("feed.maxBytes") as Number)]' }, [
            step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/feeds/oversize' }),
            step('email-send', {
              toAddresses: 'feed-team@marrowpine.example',
              subject: '#["Oversized feed " ++ attributes.fileName ++ " parked"]',
              content: '#["The file is " ++ (attributes.size as String) ++ " bytes, over the limit of " ++ p("feed.maxBytes") ++ ". It is in /feeds/oversize and was not loaded."]',
              contentType: 'text/plain',
            }),
          ]),
        ],
        {
          otherwise: [
            router(
              'batch-job',
              { jobName: 'product-feed-load', blockSize: 200, maxFailedRecords: -1 },
              [
                route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
                  step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ sku: payload.sku, title: payload.title, price: payload.price as Number }' }),
                  scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.product_feed_staging (sku, title, price) VALUES (:sku, :title, :price)' })]),
                ]),
              ],
              { onComplete: [step('logger', { level: 'INFO', message: '#["Product feed loaded=" ++ (payload.successfulRecords as String)]' })] },
            ),
            step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/feeds/done' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, loads a product feed from a marketplace partner. The partner drops \`PRODUCT_FEED_<date>.csv\` in a mounted folder \`/feeds/in\`. A normal file is about **300 MB**.

Twice this year the partner sent a broken export of **40 GB**: every product repeated for every store. The load filled the worker's disk buffer, the app was restarted, and the same file was picked up again, over and over.

**Requirements**
- Read the limit from the property \`feed.maxBytes\` (2 GB today), so operations can change it.
- A file over the limit is moved to \`/feeds/oversize\`, not loaded, and \`feed-team@marrowpine.example\` gets an email with the file name in the subject.
- A file under the limit is loaded through a Batch Job into \`dbo.product_feed_staging\` (\`sku\`, \`title\`, \`price\` as a number) and moved to \`/feeds/done\`.

**What each system sends back**
- The File listener gives the CSV content as the payload, and the file facts in \`attributes\`: \`path\` (\`/feeds/in/PRODUCT_FEED_20261113.csv\`), \`fileName\` (\`PRODUCT_FEED_20261113.csv\`) and \`size\` in bytes. A property read with \`p("feed.maxBytes")\` is text, so cast it before comparing.
- Each batch record is a row with every value as text: \`{ "sku": "SOFA-3S-GRY", "title": "Three seat sofa grey", "price": "899.00" }\`.

**Design the flow.**
`,
  answerTemplate: `## Checking the size

## The oversized file

## The normal file
`,
  keyPoints: [
    'attributes.size comes from the file listing, so the check costs nothing: the content is not read.',
    'Moving the file out of the input folder stops the restart loop: the listener never sees it again.',
    'A limit in a property can be changed per environment without a release.',
    'Pick the limit from real data: a few times the largest good file, well under what the worker can buffer.',
    'p("name") reads a property inside an expression. Cast it, because properties are text.',
  ],
  solution: `
1. **File On New or Updated File** on \`/feeds/in\`, size check wait 20 seconds. **Set Variable** \`filePath\`.
2. **Choice**:
   - \`attributes.size > (p("feed.maxBytes") as Number)\`: **File Move** to \`/feeds/oversize\`, **Email Send** to the feed team.
   - otherwise: **Batch Job** with a **Batch Aggregator** bulk insert, then **File Move** to \`/feeds/done\`.
`,
  followUps: [
    {
      q: 'The partner says the 40 GB file is right this time. What now?',
      a: 'Someone looks at it first. If it is real, raise the limit for one run, or split it with a command line tool on the server and drop the parts in. The limit stops surprises, not real growth.',
    },
    {
      q: 'Why not check the row count instead of the size?',
      a: 'Counting rows means reading the whole file, which is what you wanted to avoid. Size is free and close enough.',
    },
  ],
}
