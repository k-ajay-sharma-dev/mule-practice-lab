import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-119',
  category: 'flows',
  title: 'Helpdesk Tickets to PostgreSQL Every 10 Minutes: an Object Store Watermark That Never Skips a Ticket',
  level: 'ADVANCED',
  tags: ['watermark', 'object-store', 'scheduler', 'polling', 'postgresql', 'upsert', 'idempotency'],
  estMinutes: 35,
  flowChecks: [
    { label: 'A Scheduler starts the sync', rule: { type: 'source', component: 'scheduler' } },
    { label: 'The watermark is read from the Object Store before the helpdesk call', rule: { type: 'before', first: 'os-retrieve', then: 'http-request' } },
    {
      label: 'Tickets are written with an upsert (ON CONFLICT ... DO UPDATE), so a ticket seen twice is not an error',
      rule: { type: 'exists', component: ['db-bulk-insert', 'db-insert'], where: { sql: { all: ['on conflict', 'do update'] } } },
    },
    {
      label: 'The new watermark is stored only after the database write, on the main path',
      rule: { type: 'before', first: ['db-bulk-insert', 'db-insert'], then: 'os-store', outside: true },
    },
    {
      label: 'The watermark is never moved from an error handler',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'os-store' },
          { type: 'absent', component: 'os-store', within: ['on-error-continue', 'on-error-propagate'] },
        ],
      },
    },
    {
      label: 'The new watermark is the highest updated_at in the data, not the clock',
      rule: {
        type: 'all',
        rules: [
          {
            type: 'any',
            rules: [
              { type: 'exists', component: 'set-variable', where: { value: { all: ['max', 'updated_at'] } } },
              { type: 'exists', component: 'os-store', where: { value: { all: ['max', 'updated_at'] } } },
              // The API returns tickets oldest first, so the last ticket also holds the highest updated_at.
              { type: 'exists', component: 'set-variable', where: { value: { all: ['[-1]', 'updated_at'] } } },
              { type: 'exists', component: 'os-store', where: { value: { all: ['[-1]', 'updated_at'] } } },
            ],
          },
          { type: 'absent', component: 'os-store', where: { value: 'now(' } },
        ],
      },
    },
    {
      label: 'A Choice skips the write and keeps the watermark when no tickets come back',
      rule: {
        type: 'all',
        rules: [
          { type: 'routes', component: 'choice', routeWhere: { expression: { oneOf: ['sizeOf', 'isEmpty'] } } },
          { type: 'inside', component: 'os-store', within: 'choice' },
          { type: 'absent', component: 'os-store', within: 'choice', inSlot: 'otherwise' },
        ],
      },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      why: 'Mule propagates errors by default, and the watermark is only stored on success. This handler only adds a log line.',
    },
  ],
  referenceFlow: design(
    flow(
      'helpdesk-ticket-sync',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 10, timeUnit: 'MINUTES' }),
      [
        step('os-retrieve', { key: 'helpdesk-tickets-watermark', defaultValue: '2026-01-01T00:00:00Z', objectStore: 'ticketSyncStore' }),
        step('set-variable', { variableName: 'since', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '/helpdesk/api/v2/tickets', responseTimeout: 30000 }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[sizeOf(payload.tickets default []) > 0]' }, [
              step('set-variable', { variableName: 'newWatermark', value: '#[max(payload.tickets.updated_at)]' }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/java\n---\npayload.tickets map { id: $.id, subject: $.subject, status: $.status, priority: $.priority, updatedAt: $.updated_at as DateTime }',
              }),
              step('db-bulk-insert', {
                database: 'PostgreSQL',
                sql: 'INSERT INTO tickets (id, subject, status, priority, updated_at) VALUES (:id, :subject, :status, :priority, :updatedAt) ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, status = EXCLUDED.status, priority = EXCLUDED.priority, updated_at = EXCLUDED.updated_at WHERE tickets.updated_at <= EXCLUDED.updated_at',
              }),
              step('os-store', { key: 'helpdesk-tickets-watermark', value: '#[vars.newWatermark]', objectStore: 'ticketSyncStore' }),
              step('logger', { level: 'INFO', message: '#["Synced tickets up to " ++ vars.newWatermark]' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["No ticket changes since " ++ vars.since]' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Ticket sync failed, watermark stays at " ++ vars.since ++ ": " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A software company copies support tickets from its SaaS helpdesk into a PostgreSQL reporting database. The helpdesk offers one useful call:

\`GET /helpdesk/api/v2/tickets?updated_since=<ISO timestamp>\`

It returns up to **500 tickets** changed at or after that time, **oldest first**, with \`updated_at\` to the **second**. Busy hours have about **900 ticket changes**. Many tickets change in the same second, for example during a bulk close.

The first version ran every 10 minutes and did this:
1. Called the API with \`updated_since\` = the time of the last run.
2. Inserted the tickets.
3. Stored \`now()\` as the next \`updated_since\`.

Reports now miss tickets, and some runs fail with duplicate key errors.

**Requirements**
- Every changed ticket reaches PostgreSQL, even if it changed while a run was in progress.
- A ticket seen twice must not fail the run. The stored row must hold the latest version of the ticket.
- The watermark must never be later than the newest ticket the run has stored.
- A failed run must not move the watermark.
- A run with no changes must not move the watermark.
- The watermark must survive a restart and a redeploy.

**Design the flow.** Explain each of the three bugs in the first version.
`,
  answerTemplate: `## The three bugs

## Reading the watermark

## Calling the helpdesk

## Writing tickets

## Moving the watermark

## Failures and empty runs
`,
  keyPoints: [
    'Storing now() skips tickets that changed during the run, and also any change the helpdesk recorded with a slightly older timestamp.',
    'Use the highest updated_at in the data you actually wrote as the next watermark.',
    'Ask with "at or after" the watermark. Tickets in the same second as the watermark come back again, so the write must be an upsert.',
    'ON CONFLICT (id) DO UPDATE in PostgreSQL turns a repeat into an update, and the WHERE clause stops an older copy from overwriting a newer one.',
    'Store the watermark only after the database write succeeds, and never from an error handler.',
    'With no tickets, keep the old watermark. max of an empty list is null, which would break the next run.',
    'Use a persistent Object Store so the watermark survives restarts and redeploys.',
    'Run the Scheduler on one replica or node only, or two runs will race on the same watermark.',
  ],
  solution: `
**The three bugs**
1. **Missed tickets.** \`now()\` is the time the run finished. A ticket changed between the API call and the end of the run has an \`updated_at\` before that time, so the next run never asks for it.
2. **Duplicate key errors.** The API returns tickets changed **at or after** the time. Repeats at the boundary are normal, and a plain insert fails on them.
3. **Gaps after a 500 ticket page.** If a busy hour has 900 changes, one call returns the oldest 500, but the next run starts at \`now()\` and skips the other 400.

**Flow**
1. **Scheduler** every 10 minutes, on one node.
2. **Object Store: Retrieve** \`helpdesk-tickets-watermark\` from a persistent store, with a default start date. **Set Variable** \`since\`, because the next call replaces the payload.
3. **HTTP Request** \`GET /helpdesk/api/v2/tickets\` with \`updated_since = vars.since\`.
4. **Choice**: if the list is not empty:
   - **Set Variable** \`newWatermark\` = \`max(payload.tickets.updated_at)\`.
   - **Transform** to rows, then **Database Bulk Insert** with \`ON CONFLICT (id) DO UPDATE ... WHERE tickets.updated_at <= EXCLUDED.updated_at\`.
   - **Object Store: Store** the new watermark.
   - Otherwise: log at DEBUG and leave the watermark alone.
5. **On Error Propagate** for \`ANY\`: log the old watermark. Nothing is stored, so the next run asks for the same window again.

**Why the 500 limit is now safe.** The next run starts at the newest \`updated_at\` that was written, so the remaining 400 tickets come in the next run. Catching up a busy hour takes a few runs, and nothing is skipped.

**One edge case.** If more than 500 tickets share one second, the watermark cannot move past that second and every run returns the same 500. Detect a full page whose first and last \`updated_at\` are equal, and alert, or ask the vendor for a cursor or an ID tiebreaker.
`,
  followUps: [
    {
      q: 'Why not subtract a few minutes from now() and store that instead?',
      a: 'It narrows the gap but does not close it. A long run or a clock difference between Mule and the helpdesk still skips tickets. The highest timestamp from the data is always safe.',
    },
    {
      q: 'Why keep the watermark in the Object Store and not in PostgreSQL?',
      a: 'Both work. A table row such as SELECT max(updated_at) FROM tickets can even replace the Object Store, because it moves in the same transaction as the data. The Object Store is the simpler choice when the target is not a database.',
    },
    {
      q: 'The app runs on two replicas. What can go wrong?',
      a: 'Both replicas could poll at once, read the same watermark and write the same tickets. The upsert hides the duplicates, but the work is wasted. Make sure only one replica runs the Scheduler.',
    },
    {
      q: 'A run fails after the database write but before the store. What happens?',
      a: 'The next run starts from the old watermark and writes the same tickets again. The upsert makes that harmless.',
    },
  ],
}
