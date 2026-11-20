import { design, flow, handler, source, step } from '../../flow/dsl.js'

const rates = 'currency,rate,rate_date\nEUR,1.1612,2026-11-13\nUSD,1.3105,2026-11-13\nPLN,4.8721,2026-11-13'
const ratesPath = '/finance/rates/fx-rates.csv'

export default {
  id: 'fl-176',
  category: 'flows',
  title: 'Daily Exchange Rates From an Azure File Share Through the REST API on CloudHub, and a Quiet Skip When Finance Has Not Published Yet',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'rest', 'cloudhub', 'scheduler', 'database', 'error-handling', 'finance'],
  estMinutes: 15,
  flowChecks: [
    { label: 'The load runs every morning at 06:15', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: '0 15 6' } } },
    { label: 'The file is read with a GET on the File Share REST API', rule: { type: 'exists', component: 'http-request', where: { method: 'GET', path: 'fx-rates.csv' } } },
    { label: 'The rates are bulk inserted into fx_rates after the read', rule: { type: 'before', first: 'http-request', then: 'db-bulk-insert', thenWhere: { sql: 'fx_rates' } } },
    { label: 'A file that is not there yet (HTTP:NOT_FOUND) is handled on its own', rule: { type: 'handler', component: 'on-error-continue', errorType: 'HTTP:NOT_FOUND' } },
  ],
  simulation: {
    systems: {
      http: [{ method: 'GET', path: ratesPath, respond: { status: 200, body: rates } }],
      db: { tables: { fx_rates: { rows: [] } } },
    },
    tests: [
      {
        name: 'Finance has published the rates',
        about: 'The file is read from the share and the three rates are saved.',
        trigger: { schedule: {} },
        expect: { noError: true, calls: [{ method: 'GET', path: ratesPath, count: 1 }], db: { fx_rates: { count: 3, has: [{ currency: 'PLN', rate: '4.8721' }] } } },
      },
      {
        name: 'The file is not there yet',
        about: 'The share answers 404. Nothing is saved, a warning is logged, and the run ends cleanly. Yesterday\'s rates stay in use.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'GET', path: ratesPath, respond: { status: 404, body: '<Error><Code>ResourceNotFound</Code></Error>' } }] } },
        expect: { noError: true, db: { fx_rates: { count: 0 } }, logs: [{ level: 'WARN' }] },
      },
      {
        name: 'The SAS token has expired',
        about: 'The share answers 403. That is not a normal morning, so the run fails and alerting picks it up.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'GET', path: ratesPath, respond: { status: 403, body: '<Error><Code>AuthenticationFailed</Code></Error>' } }] } },
        expect: { error: 'HTTP:FORBIDDEN', db: { fx_rates: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'load-fx-rates',
      source('scheduler', { strategy: 'cron', expression: '0 15 6 * * ?' }),
      [
        step('http-request', { method: 'GET', path: ratesPath, responseTimeout: 30000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/java\n---\nread(payload, "application/csv") map ((r) -> { currency: r.currency, rate: r.rate, rate_date: r.rate_date })',
        }),
        step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO fx_rates (currency, rate, rate_date) VALUES (:currency, :rate, :rate_date)' }),
        step('logger', { level: 'INFO', message: '#["Loaded " ++ (sizeOf(payload) as String) ++ " exchange rates"]' }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:NOT_FOUND' }, [
          step('logger', { level: 'WARN', message: 'fx-rates.csv is not on the share yet; keeping the rates already loaded' }),
        ]),
      ],
    ),
  ),
  description: `
Calderwood Freight, a fictional haulier, prices cross border jobs in several currencies. Each morning the finance team saves \`fx-rates.csv\` in the folder \`rates\` of the Azure File Share \`finance\`:

\`\`\`
currency,rate,rate_date
EUR,1.1612,2026-11-13
\`\`\`

The pricing app reads the SQL Server table \`fx_rates\` (\`currency\`, \`rate\`, \`rate_date\`). The Mule app runs on **CloudHub**, which cannot mount an SMB share, so it reads the file through the **File Share REST API**: \`GET /finance/rates/fx-rates.csv\` on the storage account's file endpoint. A SAS token with read rights, kept in secure properties, is added to the request.

Finance is sometimes late. On those mornings the old job failed with a red alert, and support learned to ignore its alerts.

**Requirements**
- Every morning at 06:15, read the file and bulk insert the rates into \`fx_rates\`.
- If the file is not there yet, log a warning and end the run without an error.
- Any other failure, such as an expired SAS token, must fail the run so someone looks at it.

**Facts**
- The GET answers the file as plain text. Read it as CSV before the insert.
- A missing file answers 404, which raises **HTTP:NOT_FOUND**. An expired token answers 403, which raises **HTTP:FORBIDDEN**.

**Design the flow.**
`,
  answerTemplate: `## Reaching the share from CloudHub

## Reading and saving

## A late file

## Other failures
`,
  keyPoints: [
    'CloudHub workers cannot mount SMB, so a CloudHub app reaches Azure File Share through its REST API with an HTTP Request.',
    'A GET on the file\'s URL returns its content. The response is text here, so the Transform reads it as CSV before the bulk insert.',
    'The SAS token belongs in secure properties and in the request\'s query, never in the code or the logs. Give it read rights on the share and an expiry you track.',
    'Handle HTTP:NOT_FOUND alone. A catch all would also hide a 403 from an expired token, and nobody would notice until the rates were weeks old.',
    'An alert that fires on normal mornings trains people to ignore alerts. Make the expected case quiet and the unexpected case loud.',
  ],
  solution: `
1. **Scheduler**, cron \`0 15 6 * * ?\`.
2. **HTTP Request** GET \`/finance/rates/fx-rates.csv\` on the file endpoint, with the SAS token as query parameters from secure properties, response timeout 30 seconds.
3. **Transform**: \`read(payload, "application/csv")\` mapped to the table's columns.
4. **Database Bulk Insert** into \`fx_rates\`.
5. **Logger** INFO with the count.
6. Error handler **On Error Continue** \`HTTP:NOT_FOUND\`: a WARN log only.

**A rerun.** If finance publishes at 06:40, a second schedule at 07:15 or a manual run loads the file. Make the table key \`currency\` plus \`rate_date\` so a rerun on the same day cannot add the rates twice.

**Identity instead of SAS.** The REST API also accepts a Microsoft Entra token for an app registration, which avoids a token that quietly expires. Check that your storage account allows it before you plan on it.
`,
  followUps: [
    {
      q: 'Why not mount the share on CloudHub with a startup script?',
      a: 'CloudHub workers do not give you the operating system access or the open SMB port that a mount needs. REST over HTTPS is the supported way in.',
    },
    {
      q: 'How do you tell a late file from a renamed one?',
      a: 'You cannot from a 404 alone. Keep the WARN, and add a check later in the morning that fails if the rates for today are still missing.',
    },
  ],
}
