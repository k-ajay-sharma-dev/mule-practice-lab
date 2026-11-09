import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-042',
  category: 'flows',
  title: 'Bi-directional Account Sync with Loop Prevention',
  level: 'INTERMEDIATE',
  tags: ['two-way-sync', 'salesforce', 'database', 'loop-prevention', 'watermark'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Salesforce changes are captured (listener or scheduled query)', rule: { type: 'source', component: ['sf-listener', 'scheduler'] } },
    { label: 'ERP changes are captured (table listener or scheduled query)', rule: { type: 'source', component: ['db-listener', 'scheduler'] } },
    { label: 'One flow per direction', rule: { type: 'flows', kind: 'flow', min: 2 } },
    {
      label: 'Each direction checks the change origin before writing (two Choice routers)',
      rule: { type: 'exists', component: 'choice', min: 2 },
    },
    {
      label: 'The ERP flow\'s Choice tests last_modified_by to drop its own echo',
      rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'last_modified_by' } },
    },
    {
      label: 'The Salesforce flow\'s Choice tests whether the integration user made the change',
      rule: { type: 'routes', component: 'choice', routeWhere: { expression: { oneOf: ['LastModifiedBy', 'integration'] } } },
    },
    {
      label: 'The Salesforce write happens only on the "real change" branch',
      rule: { type: 'inside', component: ['sf-upsert', 'sf-create'], within: 'choice' },
    },
    {
      label: 'The ERP write happens only on the "real change" branch',
      rule: { type: 'inside', component: ['db-update', 'db-insert'], within: 'choice' },
    },
    {
      label: 'Salesforce is written by upsert on the ERP_Customer_No__c external ID',
      rule: { type: 'exists', component: 'sf-upsert', where: { objectType: 'Account', externalIdField: 'ERP_Customer_No__c' } },
    },
    {
      label: 'Each direction writes only to the other system, never back to the system it listens to',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['sf-upsert', 'sf-create'] },
          { type: 'absent', component: ['sf-upsert', 'sf-create', 'sf-update'], inFlowWith: { component: 'sf-listener' } },
          { type: 'absent', component: ['db-update', 'db-insert'], inFlowWith: { component: 'db-listener' } },
        ],
      },
    },
    {
      label: 'The ERP write stamps last_modified_by, so the ERP flow can recognise and drop its own echo',
      rule: { type: 'exists', component: ['db-update', 'db-insert'], where: { sql: 'last_modified_by' } },
    },
  ],
  referenceFlow: design(
    flow(
      'sf-to-erp-account-sync',
      source('sf-listener', { event: 'modified', objectType: 'Account' }),
      [
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.LastModifiedById == p("sf.integrationUserId")]' }, [
              step('logger', { level: 'DEBUG', message: '#["Skip echo of Account " ++ payload.Id]' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/java\n---\n{\n  customerNo: payload.ERP_Customer_No__c,\n  name: payload.Name,\n  phone: payload.Phone,\n  sfModifiedAt: payload.LastModifiedDate\n}',
              }),
              step('db-update', {
                sql: "UPDATE customers SET name = :name, phone = :phone, updated_at = CURRENT_TIMESTAMP, last_modified_by = 'MULE_SYNC' WHERE customer_no = :customerNo AND updated_at < :sfModifiedAt",
              }),
            ],
          },
        ),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#[error.description]' })])],
    ),
    flow(
      'erp-to-sf-account-sync',
      source('db-listener', { table: 'customers', watermarkColumn: 'updated_at', idColumn: 'customer_no' }),
      [
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.last_modified_by == "MULE_SYNC"]' }, [
              step('logger', { level: 'DEBUG', message: '#["Skip echo of customer " ++ payload.customer_no]' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/java\n---\n[{\n  ERP_Customer_No__c: payload.customer_no,\n  Name: payload.name,\n  Phone: payload.phone\n}]',
              }),
              step('sf-upsert', { objectType: 'Account', externalIdField: 'ERP_Customer_No__c' }),
            ],
          },
        ),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#[error.description]' })])],
    ),
  ),
  description: `
Sales reps edit customer **Accounts in Salesforce**; the back office edits the same customers in the **ERP** (\`customers\` table, \`updated_at\` maintained by a trigger). Both sides must stay in sync for name, phone and address within **5 minutes**.

Facts:
- ≈3,000 changes/day on each side.
- Mule writes to Salesforce as a dedicated **integration user**; the ERP has a \`last_modified_by\` column.
- The shared key is the ERP customer number (\`ERP_Customer_No__c\` on Account, an external ID).

A first prototype caused an **infinite ping-pong**: an ERP change was copied to Salesforce, which fired the Salesforce "modified" event, which was copied back to the ERP, which bumped \`updated_at\`, and so on.

**Design the flow(s):** change capture on both sides, how each direction recognises and drops its own echoes, how writes are made, and what happens when both sides change the same record.
`,
  answerTemplate: `## Change capture

## Salesforce → ERP

## ERP → Salesforce

## Loop prevention

## Conflicts
`,
  keyPoints: [
    'Two flows, one per direction, each with its own change capture (Salesforce listener/CDC, DB table listener or watermark poll).',
    'Every write made by the integration carries an origin marker: Salesforce LastModifiedById = integration user; ERP last_modified_by = MULE_SYNC.',
    'Each flow first checks the origin marker with a Choice and drops changes the integration itself made — that breaks the loop.',
    'Writes are idempotent: Salesforce upsert on the ERP external ID, DB update by customer number.',
    'Conflicts are resolved with a clear rule (last-writer-wins on timestamps, or field ownership per system), not by whichever event arrives last.',
  ],
  solution: `
**Salesforce → ERP**
- **Salesforce Object Listener** (modified Account) — or Change Data Capture / a watermark SOQL poll.
- **Choice**: if \`LastModifiedById\` is the integration user → log and skip (it is our own echo).
- Otherwise map with DataWeave and **Database Update** setting \`last_modified_by = 'MULE_SYNC'\`. The \`updated_at < :sfModifiedAt\` guard implements last-writer-wins.

**ERP → Salesforce**
- **Database On Table Row** with watermark \`updated_at\` (or Scheduler + Select with a stored watermark).
- **Choice**: if \`last_modified_by = 'MULE_SYNC'\` → skip.
- Otherwise DataWeave → **Salesforce Upsert** \`Account\` on \`ERP_Customer_No__c\` as the integration user.

**Why origin markers work:** every write the integration makes is stamped, and each listener ignores stamped changes, so a change crosses the bridge exactly once.

**Hardening**
- If a system cannot stamp the origin, store a hash of the last synced values per record (Object Store) and skip when the incoming hash matches — "nothing really changed".
- **Conflicts:** last-writer-wins by timestamp, or field ownership (ERP owns billing address, Salesforce owns phone) — agree with the business.
- Errors: failed records go to an error queue/table for retry; do not advance the watermark past unprocessed rows.
`,
  followUps: [
    {
      q: 'A user edits an Account in Salesforce one second after Mule updated it. Will your filter drop the user change?',
      a: 'No — the user change has LastModifiedById = the user, not the integration user, so it passes the Choice. Only changes whose last modifier is the integration are dropped.',
    },
    {
      q: 'What if the ERP trigger overwrites last_modified_by with the DB user?',
      a: 'Use another marker: a sync_source column, a hash comparison in Object Store, or a short-lived "recently written by Mule" key per record (customerNo + version) checked before syncing back.',
    },
    {
      q: 'Why use upsert rather than query-then-create/update?',
      a: 'Upsert on an external ID is one atomic, idempotent call: retries and replays cannot create duplicates, and it halves API usage.',
    },
  ],
}
