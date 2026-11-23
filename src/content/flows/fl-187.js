import { design, flow, source, step } from '../../flow/dsl.js'

const store = (id, name, region, status) => ({ store_id: id, store_name: name, region, open_date: '2019-04-01', status })
const stores = [store('S014', 'Harrowgate Retail Park', 'NORTH', 'OPEN'), store('S022', 'Linfield High Street', 'SOUTH', 'OPEN'), store('S031', 'Brackwater Outlet', 'SOUTH', 'CLOSED'), store('S040', 'Tollbridge Centre', 'NORTH', 'PLANNED')]

export default {
  id: 'fl-187',
  category: 'flows',
  title: 'Store Master Data to the Planning Platform: a Nightly CSV of Open and Planned Locations on Its SFTP Server',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'master-data', 'scheduler', 'sql-server', 'csv', 'planning'],
  estMinutes: 15,
  flowChecks: [
    { label: 'The export runs every night at 23:15', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: '0 15 23' } } },
    { label: 'Open and planned stores are selected from stores', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['stores', 'OPEN', 'PLANNED'] } } } },
    { label: 'The rows become CSV with DataWeave', rule: { type: 'exists', component: 'transform', where: { script: 'application/csv' } } },
    { label: 'The file is written to /inbound/locations on the platform\'s SFTP server', rule: { type: 'before', first: 'transform', then: 'sftp-write', thenWhere: { path: '/inbound/locations/' } } },
  ],
  simulation: {
    systems: { db: { tables: { stores: { key: 'store_id', rows: stores } } } },
    tests: [
      {
        name: 'The nightly export',
        about: 'The open and planned stores are written as one CSV. The closed store is left out.',
        trigger: { schedule: {} },
        expect: { noError: true, files: { '/inbound/locations/LOCATIONS.csv': { exists: true, has: 'S040' } } },
      },
      {
        name: 'The SFTP server is down',
        about: 'The write fails and the run ends with an error that alerting picks up. Tomorrow\'s full file puts things right.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'sftp' } } },
        expect: { error: 'SFTP:CONNECTIVITY', files: { '/inbound/locations/LOCATIONS.csv': { exists: false } } },
      },
    ],
  },
  referenceFlow: design(
    flow('locations-to-planning', source('scheduler', { strategy: 'cron', expression: '0 15 23 * * ?' }), [
      step('db-select', { database: 'SQL Server', sql: "SELECT store_id, store_name, region, open_date, status FROM stores WHERE status IN ('OPEN', 'PLANNED') ORDER BY store_id" }),
      step('transform', {
        script: '%dw 2.0\noutput application/csv\n---\npayload map ((s) -> { LOCATION_ID: s.store_id, NAME: s.store_name, REGION: s.region, OPEN_DATE: s.open_date, STATUS: s.status })',
      }),
      step('sftp-write', { path: '/inbound/locations/LOCATIONS.csv', mode: 'OVERWRITE' }),
      step('logger', { level: 'INFO', message: 'Locations file written for the planning platform' }),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, is moving its stock planning to the planning platform. The platform needs to know every location it plans for. Each night it loads a full list of locations from its SFTP server.

The SQL Server table \`stores\` has \`store_id\`, \`store_name\`, \`region\`, \`open_date\` and \`status\` (\`OPEN\`, \`PLANNED\` or \`CLOSED\`). Planned stores are included so the platform can build stock before they open. Closed stores are left out.

The platform expects \`/inbound/locations/LOCATIONS.csv\` with the columns \`LOCATION_ID\`, \`NAME\`, \`REGION\`, \`OPEN_DATE\` and \`STATUS\`. It loads the file at 23:45.

**Requirements**
- Every night at 23:15, select the open and planned stores.
- Write them as CSV, with those column names, to \`/inbound/locations/LOCATIONS.csv\`, replacing last night's file.
- If the write fails, the run must fail so someone notices.

**What each system sends back**
- The Database Select gives a list of rows with the table's column names: \`[ { "store_id": "S014", "store_name": "Harrowgate Retail Park", "region": "NORTH", "open_date": "2019-04-01", "status": "OPEN" } ]\`.

**What failures look like**
- An SFTP server that cannot be reached raises **SFTP:CONNECTIVITY**. Do not catch it: the run must end with that error.

**Design the flow.**
`,
  answerTemplate: `## When it runs

## Selecting and shaping

## Writing to the SFTP server

## When it fails
`,
  keyPoints: [
    'Master data is often sent as a full file each night. The file is the truth, and a missed night is fixed by the next one.',
    'Filter in SQL, so closed stores never leave the database.',
    'The column names belong to the platform. Map them in DataWeave rather than renaming columns in the query.',
    'OVERWRITE replaces last night\'s file. That is right for a full file the platform has already loaded.',
    'Run it with time to spare before the platform\'s load, and alert on a failed run.',
  ],
  solution: `
1. **Scheduler**, cron \`0 15 23 * * ?\`.
2. **Database Select** \`... FROM stores WHERE status IN ('OPEN', 'PLANNED')\`.
3. **Transform** to CSV with the platform's column names.
4. **SFTP Write** \`/inbound/locations/LOCATIONS.csv\`, OVERWRITE.
5. **Logger** INFO.

**The SFTP connection.** Use key authentication with the private key in secure properties, and check the server's host key against a known hosts file, so the app cannot be pointed at a fake server.

**Half a file at 23:45.** With a few hundred stores the write takes a moment. For larger files, write to a temporary name and rename, so the platform never loads a half written file.
`,
  followUps: [
    {
      q: 'A store closes. How does the platform find out?',
      a: 'It is missing from the next full file. Ask the platform team how it treats a missing location: some keep it, some end its plans. A STATUS column with CLOSED for a few weeks is sometimes safer.',
    },
    {
      q: 'Why not send only the stores that changed?',
      a: 'With a few hundred rows a full file is small and needs no watermark. Changes only pay off for large tables, such as items.',
    },
  ],
}
