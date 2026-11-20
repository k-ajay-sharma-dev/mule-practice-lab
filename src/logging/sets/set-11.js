// Logging Lab exercises, set 11. See ../exercises.js for the format.
// Theme: lines for everyday business services. Profile changes, stock holds, outbound webhooks, slow searches, order
// states, certificate expiry, quota use, job locks, approvals and overload.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }

export const SET_11 = [
  // ---------- lg-141 Bramble Insurance: customer profile changes ----------
  {
    id: 'log-11001',
    kind: 'level',
    situation: 'A Bramble Insurance customer changes their postcode and contact number in the app. The change is saved.',
    answer: ['INFO'],
    explain: 'A saved change is a normal event, and insurers must be able to show when details changed. INFO keeps it in production.',
  },
  {
    id: 'log-11002',
    kind: 'choice',
    situation: 'Which line should Bramble log for a saved profile change?',
    options: [
      'Profile updated for Sam Reid, new number 07700 900123, new postcode BS1 4DJ',
      'Customer profile updated customerId=C-48120 fields=postcode,contactNumber channel=app correlationId=7f3c2a',
      'Profile saved!!!',
      'Customer profile updated customerId=C-48120 channel=app correlationId=7f3c2a',
    ],
    answer: 1,
    explain: 'Log which fields changed, not their values. The customer ID finds the record, and the values stay in the system that owns them. The last line does not say which fields changed, so it cannot answer when the number was changed.',
  },
  {
    id: 'log-11003',
    kind: 'multi',
    situation: 'Which facts belong on the profile change line?',
    options: [
      'The customer ID',
      'The names of the fields that changed',
      'The channel the change came from',
      'The old and new contact numbers',
      'The full customer record after the change',
    ],
    answers: [0, 1, 2],
    explain: 'Field names and the channel answer "what changed and how" without copying personal data into the logs.',
  },
  {
    id: 'log-11004',
    kind: 'write',
    situation:
      'A Bramble profile change was saved. vars.customerId holds the customer, vars.changedFields the names of the changed fields, and vars.channel where it came from. Write the line.',
    available: ['vars.customerId', 'vars.changedFields', 'vars.channel', 'payload.contactNumber', 'payload.postcode', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/profile (updated|changed|saved)|details (updated|changed)/i, 'Customer profile updated'),
      labelled('customerId'),
      labelled('fields', 'fields=$(vars.changedFields)'),
      labelled('channel'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Customer profile updated customerId=$(vars.customerId) fields=$(vars.changedFields) channel=$(vars.channel) correlationId=$(correlationId)"]',
    },
    explain: 'Names of fields, never their values. If a customer asks when their number changed, this line answers it.',
  },
  {
    id: 'log-11005',
    kind: 'write',
    situation:
      'A Bramble profile change was refused because the postcode is not valid. The customer sees a message to fix it. vars.customerId and vars.field hold the facts. Write the line.',
    available: ['vars.customerId', 'vars.field', 'payload.postcode', 'error.description', 'payload', 'correlationId'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/rejected|refused|invalid|not saved/i, 'Profile change rejected'),
      labelled('customerId'),
      labelled('field'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Profile change rejected customerId=$(vars.customerId) field=$(vars.field) reason=invalid format correlationId=$(correlationId)"]',
    },
    explain: 'The field name is enough to count which checks customers trip over. The value they typed may be personal data.',
  },

  // ---------- lg-142 Copperleaf Electronics: stock holds that expire ----------
  {
    id: 'log-11006',
    kind: 'level',
    situation:
      'Copperleaf Electronics holds stock for 15 minutes while a customer pays. A hold ran out because the customer left, and the stock went back on sale.',
    answer: ['INFO', 'DEBUG'],
    explain: 'Abandoned baskets are normal. INFO is fine for a count, and DEBUG fits when there are thousands a day and only the total matters.',
  },
  {
    id: 'log-11007',
    kind: 'choice',
    situation: 'Which line best records a stock hold that ran out?',
    options: [
      'Stock hold expired holdId=H-77120 sku=TV-5501 qty=1 heldForSec=900 next=stock released',
      'Stock hold expired holdId=H-77120 sku=TV-5501 qty=1 heldForSec=900',
      'Timer fired',
      'Basket: <the whole basket>',
    ],
    answer: 0,
    explain: 'Which hold, which item, how many, how long, and that the stock went back. The second line does not say the stock was released, so support cannot tell whether it is on sale again. Support can answer "why was it in my basket and now sold out?".',
  },
  {
    id: 'log-11008',
    kind: 'multi',
    situation: 'Stock sometimes shows as sold out while the warehouse has it. Which lines help find the cause?',
    options: [
      'A line when each hold is created, with the hold ID and quantity',
      'A line when each hold ends, saying paid, expired or cancelled',
      'A regular count of open holds per item',
      'The customer\'s card details',
    ],
    answers: [0, 1, 2],
    explain: 'Holds that start but never end are the usual cause. Start and end lines with one hold ID, and a count of open holds, show them.',
  },
  {
    id: 'log-11009',
    kind: 'write',
    situation:
      'A Copperleaf hold ran out, and the stock went back on sale. vars.holdId, vars.sku, vars.qty and vars.heldForSec hold the facts. Write the line.',
    available: ['vars.holdId', 'vars.sku', 'vars.qty', 'vars.heldForSec', 'vars.basket', 'payload'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/expired|ran out|timed out|released/i, 'Stock hold expired'),
      labelled('holdId'),
      labelled('sku'),
      labelled('qty'),
      next('next=stock released'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Stock hold expired holdId=$(vars.holdId) sku=$(vars.sku) qty=$(vars.qty) heldForSec=$(vars.heldForSec) next=stock released"]',
    },
    explain: 'The hold ID ties this line to the one that created the hold. Released stock is the next fact support needs.',
  },
  {
    id: 'log-11010',
    kind: 'write',
    situation:
      'The stock system did not answer when Copperleaf tried to release a hold. A cleanup job will try again in 5 minutes. vars.holdId and vars.sku hold the IDs. Write the line.',
    available: ['vars.holdId', 'vars.sku', 'error.errorType', 'error.description', 'payload'],
    level: ['WARN'],
    checks: [
      says(/not released|release failed|(could not|failed to|unable to) release/i, 'Stock hold not released'),
      labelled('holdId'),
      labelled('sku'),
      errorFacts,
      next('next=cleanup job retries in 5 min'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stock hold not released holdId=$(vars.holdId) sku=$(vars.sku) errorType=$(error.errorType) error=$(error.description) next=cleanup job retries in 5 min"]',
    },
    explain: 'The stock is stuck for now but will be freed. WARN, with the next step, tells support not to release it by hand.',
  },

  // ---------- lg-143 Quayside Payments: outbound webhooks to merchants ----------
  {
    id: 'log-11011',
    kind: 'level',
    situation:
      'Quayside Payments sends a webhook to a merchant when a payment settles. The merchant answered 503. Quayside will try again in 1 minute, then 5, then 30.',
    answer: ['WARN'],
    explain: 'The first failure is handled by a retry, so it is not an ERROR yet. WARN lets the team see which merchants often fail.',
  },
  {
    id: 'log-11012',
    kind: 'choice',
    situation: 'Which line best records a failed webhook attempt?',
    options: [
      'Webhook delivery failed merchantId=M-3310 eventId=ev_88120 eventType=payment.settled status=503',
      'Webhook delivery failed merchantId=M-3310 eventId=ev_88120 eventType=payment.settled status=503 attempt=1 of 4 next=retry in 60s',
      'Webhook body: {"paymentId":"pay_441","cardLast4":"4242",…} signature=t=1700,v1=…',
      'Merchant down',
    ],
    answer: 1,
    explain: 'Merchant, event, status, which attempt and what is next. The first line leaves out the attempt and the next step, so nobody can tell whether Quayside will try again. The third line logs the body and the signature header.',
  },
  {
    id: 'log-11013',
    kind: 'multi',
    situation: 'A merchant says "we never got the webhook". Which facts on your lines answer them?',
    options: [
      'The event ID the merchant can search for',
      'Each attempt with its time and the status the merchant answered',
      'Whether delivery finally worked or was given up',
      'The signing secret',
    ],
    answers: [0, 1, 2],
    explain: 'The attempts and their answers show whether the merchant was down or never sent a 2xx. The secret must never be logged.',
  },
  {
    id: 'log-11014',
    kind: 'write',
    situation:
      'A Quayside webhook attempt failed and will be retried. vars.merchantId, vars.eventId, vars.attempt and vars.retryInSec hold the facts, and attributes.statusCode the merchant\'s answer. Write the line.',
    available: ['vars.merchantId', 'vars.eventId', 'vars.attempt', 'vars.retryInSec', 'attributes.statusCode', 'vars.signature', 'payload'],
    level: ['WARN'],
    checks: [
      says(/webhook/i, 'Webhook delivery failed'),
      labelled('merchantId'),
      labelled('eventId'),
      labelled('status', 'status=$(attributes.statusCode)'),
      labelled('attempt'),
      next('next=retry in $(vars.retryInSec)s'),
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Webhook delivery failed merchantId=$(vars.merchantId) eventId=$(vars.eventId) status=$(attributes.statusCode) attempt=$(vars.attempt) next=retry in $(vars.retryInSec)s"]',
    },
    explain: 'One line per attempt, the same shape each time. Searching the event ID shows the whole story of one webhook.',
  },
  {
    id: 'log-11015',
    kind: 'write',
    situation:
      'All four attempts failed. Quayside stops trying and the event waits in the merchant\'s dashboard for a manual resend. vars.merchantId, vars.eventId and vars.attempts hold the facts. Write the line.',
    available: ['vars.merchantId', 'vars.eventId', 'vars.attempts', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/gave up|given up|failed after|not delivered|undelivered|abandon/i, 'Webhook not delivered'),
      labelled('merchantId'),
      labelled('eventId'),
      labelled('attempts'),
      next('next=available for manual resend'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Webhook not delivered merchantId=$(vars.merchantId) eventId=$(vars.eventId) attempts=$(vars.attempts) next=available for manual resend"]',
    },
    explain: 'The merchant will miss the event unless someone acts. ERROR fits, and WARN is fine if your team treats merchant outages as theirs to fix.',
  },

  // ---------- lg-144 Larkspur Books: slow searches ----------
  {
    id: 'log-11016',
    kind: 'level',
    situation: 'Larkspur Books\' search API answered in 3.2 seconds. The target is 1 second. The result was correct.',
    answer: ['WARN'],
    explain: 'It worked, but well past the target. WARN on slow requests gives a list to work on before customers give up.',
  },
  {
    id: 'log-11017',
    kind: 'choice',
    situation: 'Which line best records a slow search?',
    options: [
      'Slow search durationMs=3210 targetMs=1000 filters=3 sort=price results=412 page=1 correlationId=7f3c2a',
      'Search for "gift for my wife Jane, budget 20" was slow',
      'Slow search durationMs=3210 targetMs=1000 correlationId=7f3c2a',
      'Search: <the whole response>',
    ],
    answer: 0,
    explain: 'Time, target and the shape of the query explain most slow searches. The third line says it was slow but not what kind of search it was, so the slow cases cannot be grouped. The text a customer typed can hold personal details, so leave it out.',
  },
  {
    id: 'log-11018',
    kind: 'multi',
    situation: 'Which facts help find why some searches are slow?',
    options: [
      'How many filters and which sort order',
      'How many results matched',
      'Which page was asked for',
      'The exact words the customer typed',
      'The customer\'s browser cookies',
    ],
    answers: [0, 1, 2],
    explain: 'Deep pages, heavy sorts and huge result sets are the usual causes. The shape of the query shows them without the words.',
  },
  {
    id: 'log-11019',
    kind: 'write',
    situation:
      'A Larkspur search was slow. vars.durationMs, vars.filters, vars.sort, vars.results and vars.page hold the facts. The target is 1000 ms. Write the line.',
    available: ['vars.durationMs', 'vars.filters', 'vars.sort', 'vars.results', 'vars.page', 'attributes.queryParams.q', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/slow/i, 'Slow search'),
      durationVar,
      labelled('sort'),
      labelled('results'),
      labelled('page'),
      corr,
      { not: /queryParams\.q\b/, say: 'Leave out the words the customer typed. They can hold personal details.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Slow search durationMs=$(vars.durationMs) targetMs=1000 filters=$(vars.filters) sort=$(vars.sort) results=$(vars.results) page=$(vars.page) correlationId=$(correlationId)"]',
    },
    explain: 'Group these lines by sort and page and the slow cases usually stand out in minutes.',
  },
  {
    id: 'log-11020',
    kind: 'write',
    situation:
      'The search engine did not answer within 5 seconds. Larkspur shows a "try again" page. vars.durationMs holds the time waited. Write the line.',
    available: ['vars.durationMs', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/timed out|timeout|no answer|did not answer/i, 'Search engine timed out'),
      durationVar,
      errorFacts,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Search engine timed out durationMs=$(vars.durationMs) errorType=$(error.errorType) error=$(error.description) correlationId=$(correlationId)"]',
    },
    explain: 'The customer got no result, so the request failed. Many of these at once point at the engine, not at one query.',
  },

  // ---------- lg-145 Northgate Furniture: order states ----------
  {
    id: 'log-11021',
    kind: 'level',
    situation:
      'Northgate Furniture orders move from PLACED to PAID to PICKED to SHIPPED. A message tries to move an order from PLACED straight to SHIPPED. The app refuses it.',
    answer: ['WARN', 'ERROR'],
    explain: 'The app protected the data, but an upstream system is sending a step it should not. WARN at least, and ERROR if it means an order is stuck.',
  },
  {
    id: 'log-11022',
    kind: 'choice',
    situation: 'Which line best records the refused change?',
    options: [
      'Order status change refused orderId=NF-20117 from=PLACED to=SHIPPED source=wms reason=not allowed correlationId=7f3c2a',
      'Order status change refused orderId=NF-20117 from=PLACED to=SHIPPED correlationId=7f3c2a',
      'Order NF-20117 broken',
      'Status error: <the whole message>',
    ],
    answer: 0,
    explain: 'From, to and who sent it make the problem clear. The source tells you which team to talk to, and the second line leaves it out.',
  },
  {
    id: 'log-11023',
    kind: 'multi',
    situation: 'Which lines let you rebuild the life of one order from the logs?',
    options: [
      'One line for each status change, with from, to and the source',
      'One line for each refused change, with the reason',
      'The order ID on every line',
      'One line per field of the order at every step',
    ],
    answers: [0, 1, 2],
    explain: 'Changes and refusals, each with the order ID, give a timeline. Every field at every step is noise.',
  },
  {
    id: 'log-11024',
    kind: 'write',
    situation:
      'A Northgate order moved to a new status. vars.orderId, vars.fromStatus, vars.toStatus and vars.source hold the facts. Write the line.',
    available: ['vars.orderId', 'vars.fromStatus', 'vars.toStatus', 'vars.source', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/status (change|update)|moved/i, 'Order status changed'),
      labelled('orderId'),
      { must: /\bfrom(Status)?\s*"?\s*[=:]/i, say: 'Label the old status, such as from=$(vars.fromStatus).' },
      { must: /\bto(Status)?\s*"?\s*[=:]/i, say: 'Label the new status, such as to=$(vars.toStatus).' },
      labelled('source'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Order status changed orderId=$(vars.orderId) from=$(vars.fromStatus) to=$(vars.toStatus) source=$(vars.source) correlationId=$(correlationId)"]',
    },
    explain: 'From and to on one line show the step. Searching the order ID lists every step in order.',
  },
  {
    id: 'log-11025',
    kind: 'write',
    situation:
      'A Northgate status change was refused because the step is not allowed. The message goes to a review queue. vars.orderId, vars.fromStatus, vars.toStatus and vars.source hold the facts. Write the line.',
    available: ['vars.orderId', 'vars.fromStatus', 'vars.toStatus', 'vars.source', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/refused|rejected|not allowed|invalid/i, 'Order status change refused'),
      labelled('orderId'),
      { must: /\bfrom(Status)?\s*"?\s*[=:]/i, say: 'Label the old status, such as from=$(vars.fromStatus).' },
      { must: /\bto(Status)?\s*"?\s*[=:]/i, say: 'Label the new status, such as to=$(vars.toStatus).' },
      labelled('source'),
      next('next=sent to review queue'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Order status change refused orderId=$(vars.orderId) from=$(vars.fromStatus) to=$(vars.toStatus) source=$(vars.source) next=sent to review queue correlationId=$(correlationId)"]',
    },
    explain: 'The order did not change, and a person will look. The next field tells support where the message waits.',
  },

  // ---------- lg-146 Elmstead Council: certificates that expire ----------
  {
    id: 'log-11026',
    kind: 'level',
    situation: 'Elmstead Council checks its partner certificates every morning. One certificate expires in 21 days.',
    answer: ['WARN'],
    explain: 'Nothing is broken yet, but 21 days is inside the usual 30 day renewal window. WARN puts it on the team\'s list. INFO fits only while more than a month is left.',
  },
  {
    id: 'log-11027',
    kind: 'choice',
    situation: 'Which line best warns about the certificate?',
    options: [
      'Certificate expires soon alias=planning-portal-client expiresOn=2026-12-09 daysLeft=21 usedBy=planning-sync',
      'Certificate expires soon alias=planning-portal-client expiresOn=2026-12-09 daysLeft=21',
      'Certificate: -----BEGIN CERTIFICATE-----MIIF…',
      'Certificate password is Elm…',
    ],
    answer: 0,
    explain: 'Which certificate, when it expires, how long is left and which app uses it. The second line leaves out the app, so the team does not know what to retest after the renewal. Never log the certificate body or its password.',
  },
  {
    id: 'log-11028',
    kind: 'multi',
    situation: 'Which facts help the team renew a certificate in time?',
    options: [
      'The alias or name of the certificate',
      'The expiry date and days left',
      'Which apps use it',
      'The keystore password',
    ],
    answers: [0, 1, 2],
    explain: 'Name, date and the apps that will break. The password stays in the secrets store.',
  },
  {
    id: 'log-11029',
    kind: 'write',
    situation:
      'An Elmstead certificate expires in 21 days. vars.alias, vars.expiresOn, vars.daysLeft and vars.usedBy hold the facts. Write the line.',
    available: ['vars.alias', 'vars.expiresOn', 'vars.daysLeft', 'vars.usedBy', 'vars.keystorePassword'],
    level: ['WARN'],
    checks: [
      says(/expir/i, 'Certificate expires soon'),
      labelled('alias'),
      labelled('expiresOn'),
      labelled('daysLeft'),
      labelled('usedBy'),
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Certificate expires soon alias=$(vars.alias) expiresOn=$(vars.expiresOn) daysLeft=$(vars.daysLeft) usedBy=$(vars.usedBy)"]',
    },
    explain: 'An alert on daysLeft below 30 gives a month to renew. The usedBy field tells the team what to retest.',
  },
  {
    id: 'log-11030',
    kind: 'write',
    situation:
      'An Elmstead certificate has expired, and calls to the planning portal now fail. vars.alias, vars.expiresOn and vars.usedBy hold the facts. Write the line.',
    available: ['vars.alias', 'vars.expiresOn', 'vars.usedBy', 'error.errorType', 'error.description'],
    level: ['ERROR'],
    checks: [
      says(/expired/i, 'Certificate expired'),
      labelled('alias'),
      labelled('expiresOn'),
      labelled('usedBy'),
      noSecrets,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Certificate expired alias=$(vars.alias) expiresOn=$(vars.expiresOn) usedBy=$(vars.usedBy)"]',
    },
    explain: 'Calls are failing and someone must act now. The alias tells the on-call engineer exactly what to renew.',
  },

  // ---------- lg-147 Tidewater Data: API quota use ----------
  {
    id: 'log-11031',
    kind: 'level',
    situation:
      'Tidewater Data sells API plans with a monthly quota. A client has used 80% of this month\'s quota with 10 days left.',
    answer: ['INFO', 'WARN'],
    explain: 'Nothing is blocked yet. INFO records it, and WARN fits if your team contacts clients at this point.',
  },
  {
    id: 'log-11032',
    kind: 'choice',
    situation: 'Which line best records the 80% mark?',
    options: [
      'Quota threshold reached clientId=app-2210 plan=standard used=80000 quota=100000 percent=80 periodEnds=2026-11-30',
      'Client nearly out',
      'Quota! client_secret=…',
      'Quota threshold reached clientId=app-2210 used=80000 quota=100000 percent=80',
    ],
    answer: 0,
    explain: 'Who, which plan, how much of how much, and when it resets. Sales and support can act on this line. The last line has no plan and no reset date, so nobody can tell whether the client will run out before the month ends.',
  },
  {
    id: 'log-11033',
    kind: 'multi',
    situation: 'How often should Tidewater log quota use for each client?',
    options: [
      'Once when each threshold is first crossed, such as 80% and 100%',
      'One summary per client per day',
      'One line for every request a client makes',
      'Never, quotas are not worth logging',
    ],
    answers: [0, 1],
    explain: 'Threshold lines and a daily summary tell the story. A line per request repeats what the request log already holds.',
  },
  {
    id: 'log-11034',
    kind: 'write',
    situation:
      'A Tidewater client crossed 80% of its quota. vars.clientId, vars.plan, vars.used, vars.quota and vars.periodEnds hold the facts. Write the line.',
    available: ['vars.clientId', 'vars.plan', 'vars.used', 'vars.quota', 'vars.periodEnds', 'attributes.headers'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/quota|threshold/i, 'Quota threshold reached'),
      labelled('clientId'),
      labelled('plan'),
      labelled('used'),
      labelled('quota'),
      labelled('periodEnds'),
      { not: /attributes\.headers/, say: 'Do not log the headers. They carry the client secret.' },
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Quota threshold reached clientId=$(vars.clientId) plan=$(vars.plan) used=$(vars.used) quota=$(vars.quota) percent=80 periodEnds=$(vars.periodEnds)"]',
    },
    explain: 'Logged once when the line is crossed, not on every call after it. That keeps one line per client per threshold.',
  },
  {
    id: 'log-11035',
    kind: 'write',
    situation:
      'A Tidewater client used its whole quota. Further calls get 429 until the period ends. vars.clientId, vars.plan and vars.periodEnds hold the facts. Write the line.',
    available: ['vars.clientId', 'vars.plan', 'vars.periodEnds', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/quota (used|exhausted|reached|exceeded)|limit reached|out of quota/i, 'Quota used up'),
      labelled('clientId'),
      labelled('plan'),
      labelled('periodEnds'),
      next('next=calls get 429 until period ends'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Quota used up clientId=$(vars.clientId) plan=$(vars.plan) periodEnds=$(vars.periodEnds) next=calls get 429 until period ends"]',
    },
    explain: 'The app is working as sold, so not ERROR. The line explains every 429 the client sees until the reset.',
  },

  // ---------- lg-148 Ridgeway Utilities: a lock for a scheduled job ----------
  {
    id: 'log-11036',
    kind: 'level',
    situation:
      'Ridgeway Utilities runs a billing job on two replicas. Each run first takes a lock, so only one replica does the work. This replica did not get the lock, so it skips the run.',
    answer: ['DEBUG', 'INFO'],
    explain: 'Skipping is the expected outcome on every replica but one. DEBUG avoids a line per replica per run, and INFO is fine when runs are rare.',
  },
  {
    id: 'log-11037',
    kind: 'choice',
    situation: 'Which line best records that a replica took the lock?',
    options: [
      'Job lock acquired job=billing-run lockKey=billing-2026-11-18 holder=replica-2 ttlSec=3600',
      'Job lock acquired job=billing-run holder=replica-2 ttlSec=3600',
      'I am the leader!!!',
      'Lock acquired, object store password=…',
    ],
    answer: 0,
    explain: 'Which job, which run, which replica and how long the lock lasts. Two holders for one key would point straight at a problem. The second line has no lock key, so it cannot be tied to one run.',
  },
  {
    id: 'log-11038',
    kind: 'multi',
    situation: 'A bill run happened twice last month. Which lines would show how?',
    options: [
      'Each lock acquired, with the lock key and the holder',
      'Each lock released, with how long the run took',
      'Any lock that was taken over because it had passed its time to live',
      'The full list of customers billed',
    ],
    answers: [0, 1, 2],
    explain: 'Two acquisitions of one key, or a lock taken over while the first run was still going, explain a double run.',
  },
  {
    id: 'log-11039',
    kind: 'write',
    situation:
      'A Ridgeway replica took the lock for the billing run. vars.job, vars.lockKey, vars.holder and vars.ttlSec hold the facts. Write the line.',
    available: ['vars.job', 'vars.lockKey', 'vars.holder', 'vars.ttlSec', 'payload'],
    level: ['INFO'],
    checks: [
      says(/lock (acquired|taken|obtained)|(acquired|took|obtained) (the )?(job )?lock/i, 'Job lock acquired'),
      labelled('job'),
      labelled('lockKey'),
      labelled('holder'),
      labelled('ttlSec'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Job lock acquired job=$(vars.job) lockKey=$(vars.lockKey) holder=$(vars.holder) ttlSec=$(vars.ttlSec)"]',
    },
    explain: 'The lock key names the run. Searching it shows who held it and for how long.',
  },
  {
    id: 'log-11040',
    kind: 'write',
    situation:
      'A Ridgeway replica found a lock older than its time to live and took it over. The old holder may have crashed. vars.job, vars.lockKey, vars.oldHolder and vars.holder hold the facts. Write the line.',
    available: ['vars.job', 'vars.lockKey', 'vars.oldHolder', 'vars.holder', 'payload'],
    level: ['WARN'],
    checks: [
      says(/took over|taken over|stale|expired lock/i, 'Stale job lock taken over'),
      labelled('job'),
      labelled('lockKey'),
      labelled('oldHolder'),
      labelled('holder'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Stale job lock taken over job=$(vars.job) lockKey=$(vars.lockKey) oldHolder=$(vars.oldHolder) holder=$(vars.holder)"]',
    },
    explain: 'If the old holder was slow, not dead, two runs now overlap. WARN makes sure someone checks the old holder\'s run.',
  },

  // ---------- lg-149 Ashby Building Society: refunds that need a second approver ----------
  {
    id: 'log-11041',
    kind: 'level',
    situation:
      'At Ashby Building Society, a refund over 5,000 needs a second person to approve it. The second approver approved a refund, and it was paid.',
    answer: ['INFO'],
    explain: 'This is a normal, controlled event that auditors will ask about. INFO keeps it, with who did what.',
  },
  {
    id: 'log-11042',
    kind: 'choice',
    situation: 'Which line best records the approval?',
    options: [
      'Refund approved refundId=RF-90117 amount=7250.00 requestedBy=U-311 approvedBy=U-482 correlationId=7f3c2a',
      'Approved by Helen in finance',
      'Refund approved refundId=RF-90117 amount=7250.00 approvedBy=U-482 correlationId=7f3c2a',
      'Refund approved, account 12345678 sort code 20-00-00',
    ],
    answer: 0,
    explain: 'The refund, the amount, and both people by user ID. The third line has no requestedBy, so it cannot prove two different people were involved. Bank details are not needed in the log.',
  },
  {
    id: 'log-11043',
    kind: 'multi',
    situation: 'An auditor asks you to prove the two-person rule was followed. Which facts must the lines hold?',
    options: [
      'The user ID of the person who requested the refund',
      'The user ID of the person who approved it',
      'The time of each step',
      'The refund ID and amount',
      'Each person\'s home postcode',
    ],
    answers: [0, 1, 2, 3],
    explain: 'Two different user IDs on one refund ID, with times, prove the rule. Home details add nothing.',
  },
  {
    id: 'log-11044',
    kind: 'write',
    situation:
      'An Ashby refund was approved by a second person. vars.refundId, vars.amount, vars.requestedBy and vars.approvedBy hold the facts. Write the line.',
    available: ['vars.refundId', 'vars.amount', 'vars.requestedBy', 'vars.approvedBy', 'vars.accountNumber', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/approved/i, 'Refund approved'),
      labelled('refundId'),
      labelled('amount'),
      labelled('requestedBy'),
      labelled('approvedBy'),
      { not: /accountNumber/, say: 'Leave out the account number. The refund ID finds it.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Refund approved refundId=$(vars.refundId) amount=$(vars.amount) requestedBy=$(vars.requestedBy) approvedBy=$(vars.approvedBy) correlationId=$(correlationId)"]',
    },
    explain: 'Requested and approved by two IDs on one line is the proof an auditor wants.',
  },
  {
    id: 'log-11045',
    kind: 'write',
    situation:
      'Someone tried to approve their own Ashby refund. The app refused. vars.refundId and vars.userId hold the facts. Write the line.',
    available: ['vars.refundId', 'vars.userId', 'vars.amount', 'payload', 'correlationId'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/refused|rejected|not allowed|denied/i, 'Self approval refused'),
      labelled('refundId'),
      labelled('userId'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Self approval refused refundId=$(vars.refundId) userId=$(vars.userId) reason=requester cannot approve correlationId=$(correlationId)"]',
    },
    explain: 'The control worked, but the attempt matters to the risk team. WARN at least, so it is counted and reviewed.',
  },

  // ---------- lg-150 Greyfriars Ticketing: too much traffic ----------
  {
    id: 'log-11046',
    kind: 'level',
    situation:
      'At an on-sale, Greyfriars Ticketing turns away requests it cannot take with 503 and a Retry-After header. In one minute, 12,000 requests were turned away.',
    answer: ['WARN'],
    explain: 'The app is protecting itself as designed, but customers are waiting. WARN, with a count per minute rather than a line per request.',
  },
  {
    id: 'log-11047',
    kind: 'choice',
    situation: 'Which line best records the load shedding?',
    options: [
      'One line per rejected request with its full headers',
      'Requests shed windowSec=60 rejected=12000 accepted=48000 maxConcurrent=400 retryAfterSec=5',
      'Requests shed windowSec=60 rejected=12000 retryAfterSec=5',
      'Overload!!!',
    ],
    answer: 1,
    explain: 'One line a minute with counts and the limit tells the story. The third line has no accepted count or limit, so nobody can tell how far demand was past capacity. 12,000 lines a minute would add load at the worst moment.',
  },
  {
    id: 'log-11048',
    kind: 'multi',
    situation: 'Why is one line per rejected request a bad idea here?',
    options: [
      'Writing logs costs CPU and I/O at the moment the app is overloaded',
      'The log tool may drop or delay lines, hiding the useful ones',
      'A count per minute holds the same facts',
      'Rejected requests are never worth knowing about',
    ],
    answers: [0, 1, 2],
    explain: 'They are worth knowing about, as a number. Summaries keep the facts and spare the app.',
  },
  {
    id: 'log-11049',
    kind: 'write',
    situation:
      'Write the Greyfriars summary line, logged once a minute while requests are being turned away. vars.windowSec, vars.rejected, vars.accepted and vars.maxConcurrent hold the facts.',
    available: ['vars.windowSec', 'vars.rejected', 'vars.accepted', 'vars.maxConcurrent', 'attributes.headers', 'payload'],
    level: ['WARN'],
    checks: [
      says(/shed|rejected|turned away|overload/i, 'Requests shed'),
      labelled('windowSec'),
      labelled('rejected'),
      labelled('accepted'),
      labelled('maxConcurrent'),
      { not: /attributes\.headers/, say: 'Leave the headers out. A count is all this line needs.' },
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Requests shed windowSec=$(vars.windowSec) rejected=$(vars.rejected) accepted=$(vars.accepted) maxConcurrent=$(vars.maxConcurrent)"]',
    },
    explain: 'Rejected against accepted shows how far demand is past capacity, minute by minute.',
  },
  {
    id: 'log-11050',
    kind: 'write',
    situation:
      'The on-sale load has dropped and Greyfriars has stopped turning requests away. vars.rejectedTotal and vars.durationMs hold how many were turned away in all and for how long. Write the line.',
    available: ['vars.rejectedTotal', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/ended|stopped|recovered|back to normal|over/i, 'Load shedding ended'),
      labelled('rejectedTotal'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Load shedding ended rejectedTotal=$(vars.rejectedTotal) durationMs=$(vars.durationMs)"]',
    },
    explain: 'One closing line gives the size and length of the event for the review after the on-sale.',
  },
]
