// Logging Lab exercises, set 8. See ../exercises.js for the format.
// Theme: lines that support a change or a shared platform. Webhook signature checks, shadow mode for a new engine,
// many tenants in one app, two-way sync conflicts and progress of a long migration.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }

export const SET_8 = [
  // ---------- lg-126 Quillon Couriers: webhooks and signature checks ----------
  {
    id: 'log-8001',
    kind: 'level',
    situation:
      'Quillon Couriers receives payment webhooks. One arrives with a signature that does not match, so the flow answers 401 and drops it. This happens a few times a week.',
    answer: ['WARN'],
    explain:
      'The app handled it, so not ERROR. But a bad signature is either a wrong secret after a rotation or someone sending fake events, and WARN lets the team count and alert on a rise.',
  },
  {
    id: 'log-8002',
    kind: 'choice',
    situation: 'Which line should Quillon Couriers log when it rejects a webhook with a bad signature?',
    options: [
      'Invalid signature',
      'Webhook rejected: signature check failed source=payhub eventId=evt_2291 status=401 correlationId=7f3c2a',
      'Webhook rejected, expected 9f2c41... got 1a7e03..., signing key=whsec_...',
      'Webhook {"id":"evt_2291","data":{"amount":120.00,"card":{...}}}',
    ],
    answer: 1,
    explain:
      'It says what happened, from where, which event and what the sender got back. The third line leaks the signing key, and the last dumps the body with card data.',
  },
  {
    id: 'log-8003',
    kind: 'multi',
    situation: 'A Quillon webhook passed the signature check and was queued. Which facts belong on that line?',
    options: [
      'The event ID from the sender',
      'The event type, such as payment.succeeded',
      'Whether it was new or a repeat of an event already seen',
      'The signature header',
      'The full body',
    ],
    answers: [0, 1, 2],
    explain:
      'The event ID and type let support match the line to the sender\'s records, and the repeat flag shows retries from the sender. The signature and the body do not belong in logs.',
  },
  {
    id: 'log-8004',
    kind: 'write',
    situation:
      'The signature on a Quillon webhook did not match and the flow answers 401. vars.source names the sender and vars.eventId holds its event ID. Write the line.',
    available: ['vars.source', 'vars.eventId', 'attributes.headers', "attributes.headers.'x-signature'", 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|signature|invalid/i, 'Webhook rejected: signature check failed'),
      labelled('source'),
      labelled('eventId'),
      labelled('status', 'status=401'),
      corr,
      { not: /attributes\.headers/, say: 'Do not log the headers. The signature must not reach the logs.' },
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Webhook rejected: signature check failed source=$(vars.source) eventId=$(vars.eventId) status=401 correlationId=$(correlationId)"]',
    },
    explain:
      'The sender and event ID are enough to ask the sender about it, and a count of these lines shows an attack or a rotated secret.',
  },
  {
    id: 'log-8005',
    kind: 'write',
    situation:
      'A Quillon webhook passed the check and was put on a queue. vars.eventId, vars.eventType and vars.duplicate (true when the event was seen before) hold the facts. Write the line.',
    available: ['vars.eventId', 'vars.eventType', 'vars.duplicate', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/webhook|accepted|received/i, 'Webhook accepted'),
      labelled('eventId'),
      labelled('eventType'),
      labelled('duplicate'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Webhook accepted eventId=$(vars.eventId) eventType=$(vars.eventType) duplicate=$(vars.duplicate) correlationId=$(correlationId)"]',
    },
    explain:
      'One line per accepted event is a normal volume. The duplicate flag shows when the sender retries, which often means our answers were too slow.',
  },

  // ---------- lg-127 Orrin Hardware: shadow mode for a new pricing engine ----------
  {
    id: 'log-8006',
    kind: 'level',
    situation:
      'Orrin Hardware runs a new pricing engine in shadow mode: both engines price each quote, and the customer gets the old price. When the two prices differ by more than 1%, you log one line so the team can study the gaps.',
    answer: ['INFO', 'WARN'],
    explain:
      'Differences are expected while the new engine is tested, and the customer is not affected. INFO fits. WARN is fine too if the team alerts on a rise in mismatches.',
  },
  {
    id: 'log-8007',
    kind: 'choice',
    situation: 'Which line should Orrin Hardware log when the shadow engine gives a different price?',
    options: [
      'Prices differ!',
      'ERROR new engine wrong',
      'Shadow price mismatch quoteId=Q-7781 sku=SKU-118 oldPrice=19.90 newPrice=18.40 diffPct=-7.5 served=old',
      'Mismatch: request={...full quote...} old={...} new={...}',
    ],
    answer: 2,
    explain:
      'Labelled numbers can be charted and grouped by product. served=old shows the customer got the old price. The full quote is large and may hold customer data.',
  },
  {
    id: 'log-8008',
    kind: 'multi',
    situation: 'Which facts make the Orrin shadow mode logs useful for deciding when to switch?',
    options: [
      'Which engine served the customer',
      'Both prices, as numbers',
      'The difference as a number, such as diffPct',
      'The customer email',
      'The full request at INFO',
    ],
    answers: [0, 1, 2],
    explain:
      'With the served engine and the numbers, the team can see how often and by how much the engines differ. The email and the full request add risk and no insight.',
  },
  {
    id: 'log-8009',
    kind: 'write',
    situation:
      'The Orrin shadow engine priced a quote differently. vars.quoteId, vars.sku, vars.oldPrice, vars.newPrice and vars.diffPct hold the facts. The customer got the old price. Write the line.',
    available: ['vars.quoteId', 'vars.sku', 'vars.oldPrice', 'vars.newPrice', 'vars.diffPct', 'payload', 'payload.customer.email', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/mismatch|differ/i, 'Shadow price mismatch'),
      labelled('quoteId'),
      labelled('oldPrice'),
      labelled('newPrice'),
      labelled('served', 'served=old'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Shadow price mismatch quoteId=$(vars.quoteId) sku=$(vars.sku) oldPrice=$(vars.oldPrice) newPrice=$(vars.newPrice) diffPct=$(vars.diffPct) served=old correlationId=$(correlationId)"]',
    },
    explain:
      'Grouping these lines by sku shows which product rules the new engine gets wrong, and served=old reassures support that customers were not affected.',
  },
  {
    id: 'log-8010',
    kind: 'write',
    situation:
      'The Orrin shadow call to the new pricing engine timed out. The customer got the old price as normal. vars.quoteId holds the quote. Write the line.',
    available: ['vars.quoteId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/shadow|new pricing|timed out|fail/i, 'Shadow call to new pricing engine failed'),
      labelled('quoteId'),
      errorFacts,
      { must: /served\s*=|not affected|unaffected/i, say: 'Say the customer was not affected, such as served=old.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Shadow call to new pricing engine failed quoteId=$(vars.quoteId) errorType=$(error.errorType) error=$(error.description) served=old correlationId=$(correlationId)"]',
    },
    explain:
      'The new engine failing matters before the switch, so WARN. served=old makes clear no customer saw an error.',
  },

  // ---------- lg-128 Tallis Payroll Cloud: many tenants in one app ----------
  {
    id: 'log-8011',
    kind: 'level',
    situation:
      'Tallis Payroll Cloud runs one Mule app for 400 client companies. One client\'s settings are missing the bank file format, so its payroll export fails with 500. Other clients are fine.',
    answer: ['ERROR'],
    explain:
      'One client\'s payroll did not go out, and a person must fix the settings. That is an ERROR, even though other clients are fine.',
  },
  {
    id: 'log-8012',
    kind: 'choice',
    situation: 'Which line should Tallis log when a client\'s payroll export fails because a setting is missing?',
    options: [
      'Tenant config missing',
      'Payroll export failed: tenant setting missing tenantId=t-9 setting=bankFileFormat status=500 correlationId=7f3c2a',
      'Payroll export failed for Bramblewood Ltd, employees: [{"name":"...","salary":...}]',
      'Missing setting',
    ],
    answer: 1,
    explain:
      'The tenant ID and the setting name tell support exactly what to fix. The third line puts salaries in a log shared by all clients.',
  },
  {
    id: 'log-8013',
    kind: 'multi',
    situation: 'Which practices make one shared log safe and useful for 400 Tallis clients?',
    options: [
      'tenantId on every line',
      'A saved search per tenant for support, with access rules',
      'The same field names for every tenant',
      'Employee names on each line, to help support find records',
      'A log level that each client sets for itself',
    ],
    answers: [0, 1, 2],
    explain:
      'tenantId lets support filter one client, access rules keep clients apart, and shared field names keep searches the same. Names are personal data, and client-chosen levels can flood the shared logs.',
  },
  {
    id: 'log-8014',
    kind: 'write',
    situation:
      'A Tallis client\'s payroll export failed because a required setting is missing. vars.tenantId holds the client and vars.setting the missing setting name. Write the line in the error handler.',
    available: ['vars.tenantId', 'vars.setting', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|missing|could not/i, 'Payroll export failed: tenant setting missing'),
      labelled('tenantId'),
      labelled('setting'),
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Payroll export failed: tenant setting missing tenantId=$(vars.tenantId) setting=$(vars.setting) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'The tenant and the setting point support straight at the fix, without a single employee detail in the shared logs.',
  },
  {
    id: 'log-8015',
    kind: 'write',
    situation:
      'Write the last line of every Tallis API request. vars.tenantId holds the client, vars.durationMs the time taken, and attributes holds the method and request path.',
    available: ['vars.tenantId', 'vars.durationMs', 'attributes.method', 'attributes.requestPath', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/complet|finished|processed/i, 'Request completed'),
      labelled('tenantId'),
      labelled('path', 'path=$(attributes.requestPath)'),
      durationVar,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Request completed tenantId=$(vars.tenantId) method=$(attributes.method) path=$(attributes.requestPath) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'With tenantId and durationMs on every request, the team can see when one client is slow or sends far more traffic than the others.',
  },

  // ---------- lg-129 Bellmont Furniture: two-way sync conflicts ----------
  {
    id: 'log-8016',
    kind: 'level',
    situation:
      'Bellmont Furniture syncs customers both ways between its CRM and ERP. Both changed the same customer\'s phone in one sync window. The agreed rule says the ERP wins for contact fields, and the sync applied it.',
    answer: ['INFO', 'WARN'],
    explain:
      'A rule settled it, so nothing failed. INFO is enough. WARN is fine if the team wants to watch how often both systems edit the same record.',
  },
  {
    id: 'log-8017',
    kind: 'choice',
    situation: 'Which line should Bellmont log when a sync conflict is settled by a rule?',
    options: [
      'Conflict',
      'Conflict: CRM phone +44 7700 900123, ERP phone +44 7700 900456',
      'WARN!!! data mismatch',
      'Sync conflict resolved customerId=C-2231 field=phone winner=erp rule=erp-wins-contact-fields correlationId=7f3c2a',
    ],
    answer: 3,
    explain:
      'It names the record, the field, which side won and why. The second line copies phone numbers, which are personal data, into the logs.',
  },
  {
    id: 'log-8018',
    kind: 'multi',
    situation: 'Which facts belong on the Bellmont conflict line?',
    options: [
      'The customer ID',
      'The field name',
      'Which side won and the rule used',
      'Both phone numbers',
      'The full customer record from each system',
    ],
    answers: [0, 1, 2],
    explain:
      'IDs, field and rule explain the decision. The values themselves are personal data and can be read in each system by someone allowed to see them.',
  },
  {
    id: 'log-8019',
    kind: 'write',
    situation:
      'The Bellmont sync settled a conflict by rule. vars.customerId, vars.field, vars.winner and vars.rule hold the facts. Write the line.',
    available: ['vars.customerId', 'vars.field', 'vars.winner', 'vars.rule', 'payload', 'payload.phone', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/conflict/i, 'Sync conflict resolved'),
      labelled('customerId'),
      labelled('field'),
      labelled('winner'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Sync conflict resolved customerId=$(vars.customerId) field=$(vars.field) winner=$(vars.winner) rule=$(vars.rule) correlationId=$(correlationId)"]',
    },
    explain:
      'When a user asks why their change was lost, this line shows the other system won and which rule decided it.',
  },
  {
    id: 'log-8020',
    kind: 'write',
    situation:
      'The ERP rejected a Bellmont customer update, so the CRM and ERP now differ for that customer. The record goes on the sync error list for a person to fix. vars.customerId and vars.field hold the facts. Write the line.',
    available: ['vars.customerId', 'vars.field', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|rejected|not (synced|updated)/i, 'Customer not synced to ERP'),
      labelled('customerId'),
      errorFacts,
      next('next=added to sync error list'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Customer not synced to ERP customerId=$(vars.customerId) field=$(vars.field) errorType=$(error.errorType) error=$(error.description) next=added to sync error list correlationId=$(correlationId)"]',
    },
    explain:
      'The two systems disagree until someone acts, so ERROR. The next field tells support where the record waits.',
  },

  // ---------- lg-130 Wrenfield Insurance: progress of a long migration ----------
  {
    id: 'log-8021',
    kind: 'level',
    situation:
      'Wrenfield Insurance migrates 2 million policies to a new system over a weekend. The job logs one progress line every 50,000 policies with the counts so far.',
    answer: ['INFO'],
    explain:
      'Forty lines over the whole run is a tiny volume, and the team watches them all weekend. Progress of a normal run is INFO.',
  },
  {
    id: 'log-8022',
    kind: 'choice',
    situation: 'Which progress line should the Wrenfield migration log?',
    options: [
      'Progress',
      'Still running...',
      'Policy migration progress migrated=850000 total=2000000 failed=312 ratePerMin=4100 lastPolicyId=P-850000',
      'Migrated policy P-000001 (one line for every policy)',
    ],
    answer: 2,
    explain:
      'The counts and the rate show how far the job is and when it will end. lastPolicyId shows where to restart. One line per policy is 2 million lines that bury the failures.',
  },
  {
    id: 'log-8023',
    kind: 'multi',
    situation: 'The Wrenfield migration may crash halfway. Which logging choices help it restart safely?',
    options: [
      'The last committed policy ID on every progress line',
      'A line for each failed policy, with its ID and the error',
      'A line for every policy at INFO',
      'The run ID on every line, so two runs are never mixed',
      'The full policy at DEBUG, left on in production',
    ],
    answers: [0, 1, 3],
    explain:
      'The last committed ID tells you where to restart, failure lines tell you what to rerun, and the run ID keeps runs apart. A line per policy and full policies flood the logs.',
  },
  {
    id: 'log-8024',
    kind: 'write',
    situation:
      'Write the Wrenfield progress line. vars.runId, vars.migrated, vars.total, vars.failed and vars.lastPolicyId hold the facts.',
    available: ['vars.runId', 'vars.migrated', 'vars.total', 'vars.failed', 'vars.lastPolicyId', 'payload'],
    level: ['INFO'],
    checks: [
      says(/progress|migrat/i, 'Policy migration progress'),
      labelled('runId'),
      labelled('migrated'),
      labelled('total'),
      labelled('failed'),
      labelled('lastPolicyId'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Policy migration progress runId=$(vars.runId) migrated=$(vars.migrated) total=$(vars.total) failed=$(vars.failed) lastPolicyId=$(vars.lastPolicyId)"]',
    },
    explain:
      'Charting migrated over time shows the rate. If the job stops, lastPolicyId on the latest line says where to restart.',
  },
  {
    id: 'log-8025',
    kind: 'write',
    situation:
      'One Wrenfield policy failed to migrate. The job goes on and adds the policy to the failed list for a rerun. vars.runId and vars.policyId hold the facts. Write the line.',
    available: ['vars.runId', 'vars.policyId', 'error.errorType', 'error.description', 'payload', 'payload.holder.dateOfBirth'],
    level: ['WARN'],
    checks: [
      says(/fail|not migrated|could not/i, 'Policy not migrated'),
      labelled('runId'),
      labelled('policyId'),
      errorFacts,
      next('next=added to failed list for rerun'),
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Policy not migrated runId=$(vars.runId) policyId=$(vars.policyId) errorType=$(error.errorType) error=$(error.description) next=added to failed list for rerun"]',
    },
    explain:
      'The job handled it and goes on, so WARN. Grouping these lines by errorType shows whether one fix would cover most of the failures.',
  },
]
